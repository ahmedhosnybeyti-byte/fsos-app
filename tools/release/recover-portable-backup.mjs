// Cross-platform recovery, with no Windows/DPAPI dependency.
// Private material is read from stdin, never command arguments or output.
// Input: { privateKeyPem, passphrase }; use an encrypted PKCS#8 private key.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform,Writable} from 'node:stream';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
let stage='arguments';
async function main(){
 if(!args.includes('--archive')||!args.includes('--envelope')||(!args.includes('--verify-only')&&!args.includes('--output')))throw Error('Arguments required');
 const archive=option('--archive'),envelope=option('--envelope');
 if(!archive.endsWith('.dump.aes'))throw Error('Expected archive suffix');
 const base=archive.slice(0,-4);
 stage='read archive metadata';
 const evidence=JSON.parse(fs.readFileSync(base+'.encryption.json','utf8'));
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>32768)throw Error('Private input too large')}
 stage='parse private input';
 const credentials=JSON.parse(input);input='';
 stage='unwrap recipient key';
 const secret=crypto.privateDecrypt({key:credentials.privateKeyPem,passphrase:credentials.passphrase,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},fs.readFileSync(envelope));
 credentials.privateKeyPem='';credentials.passphrase='';
 if(secret.length!==64)throw Error('Invalid recovered key');
 stage='authenticate archive';
 const hmac=crypto.createHmac('sha256',secret.subarray(32));
 for await(const chunk of fs.createReadStream(archive))hmac.update(chunk);
 const actualTag=hmac.digest(),storedTag=fs.readFileSync(base+'.hmac');
 if(actualTag.length!==storedTag.length||!crypto.timingSafeEqual(actualTag,storedTag))throw Error('Authentication failed');
 stage='decrypt archive';
 const handle=fs.openSync(archive,'r'),iv=Buffer.alloc(16);
 try{if(fs.readSync(handle,iv,0,16,0)!==16)throw Error('Truncated archive')}finally{fs.closeSync(handle)}
 const decipher=crypto.createDecipheriv('aes-256-cbc',secret.subarray(0,32),iv);
 const hash=crypto.createHash('sha256');
 let bytes=0;
 const observer=new Transform({transform(chunk,encoding,cb){hash.update(chunk);bytes+=chunk.length;cb(null,chunk)}});
 const output=args.includes('--verify-only')?null:option('--output');
 const sink=output?fs.createWriteStream(output,{flags:'wx',mode:0o600}):new Writable({write(chunk,encoding,cb){cb()}});
 let created=false;
 try{
  if(output)sink.once('open',()=>{created=true});
  await pipeline(fs.createReadStream(archive,{start:16}),decipher,observer,sink);
  const sha=hash.digest('hex').toUpperCase();
  if(sha!==evidence.plaintextSha256.toUpperCase())throw Error('Checksum differs');
  process.stdout.write(JSON.stringify({result:'PASS',bytes,plaintextSha256:sha,usesDpapi:false,privateKeyPersisted:false})+'\n');
 }catch(error){if(created)fs.unlinkSync(output);throw error}finally{secret.fill(0)}
}
main().catch(()=>{process.stderr.write('Portable recovery failed at '+stage+'; private material was not logged.\n');process.exitCode=1});
