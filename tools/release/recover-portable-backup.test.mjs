import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root='D:/Field Sales OS';
assert.equal(path.resolve(process.cwd()).toLowerCase(),path.resolve(root).toLowerCase(),'Official workspace required');
const dir=fs.mkdtempSync(path.join(root,'.local-backups','portable-cli-test-'));
const cli=fileURLToPath(new URL('./recover-portable-backup.mjs',import.meta.url));
const recipient=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
const passphrase=crypto.randomBytes(32).toString('base64');
const privateKeyPem=recipient.privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase});
const input=JSON.stringify({privateKeyPem,passphrase});
const plain=crypto.randomBytes(8192),key=crypto.randomBytes(64),iv=crypto.randomBytes(16);
const cipher=crypto.createCipheriv('aes-256-cbc',key.subarray(0,32),iv);
const encrypted=Buffer.concat([iv,cipher.update(plain),cipher.final()]);
const tag=crypto.createHmac('sha256',key.subarray(32)).update(encrypted).digest();
const archive=path.join(dir,'production.dump.aes'),base=archive.slice(0,-4),envelope=path.join(dir,'recipient.rsa');
fs.writeFileSync(archive,encrypted);
fs.writeFileSync(base+'.hmac',tag);
fs.writeFileSync(base+'.encryption.json',JSON.stringify({plaintextSha256:crypto.createHash('sha256').update(plain).digest('hex')}));
fs.writeFileSync(envelope,crypto.publicEncrypt({key:recipient.publicKey,oaepHash:'sha256'},key));
function run(args,privateInput=input){
 const result=spawnSync(process.execPath,[cli,'--archive',archive,'--envelope',envelope,...args],{input:privateInput,encoding:'utf8',windowsHide:true});
 assert(!result.stdout.includes(passphrase)&&!result.stderr.includes(passphrase));
 assert(!result.stdout.includes('PRIVATE KEY')&&!result.stderr.includes('PRIVATE KEY'));
 return result;
}
test('portable recovery writes exactly the authenticated archive bytes',()=>{
 const output=path.join(dir,'recovered.dump');
 assert.equal(run(['--output',output]).status,0);
 assert.deepEqual(fs.readFileSync(output),plain);
});
test('wrong recipient is denied without creating output',()=>{
 const other=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
 const output=path.join(dir,'wrong.dump');
 const wrongInput=JSON.stringify({privateKeyPem:other.privateKey.export({format:'pem',type:'pkcs8'}),passphrase:''});
 assert.equal(run(['--output',output],wrongInput).status,1);
 assert(!fs.existsSync(output));
});
test('tampered authentication tag is denied before plaintext is written',()=>{
 const bad=Buffer.from(tag);bad[0]^=1;fs.writeFileSync(base+'.hmac',bad);
 const output=path.join(dir,'tampered.dump');
 try{assert.equal(run(['--output',output]).status,1);assert(!fs.existsSync(output))}finally{fs.writeFileSync(base+'.hmac',tag)}
});
test('existing output is preserved on overwrite refusal',()=>{
 const output=path.join(dir,'existing.dump');fs.writeFileSync(output,'preserve');
 assert.equal(run(['--output',output]).status,1);
 assert.equal(fs.readFileSync(output,'utf8'),'preserve');
});
test('checksum failure removes newly created plaintext and logs no private input',()=>{
 const output=path.join(dir,'bad-checksum.dump'),metadata=fs.readFileSync(base+'.encryption.json');
 fs.writeFileSync(base+'.encryption.json',JSON.stringify({plaintextSha256:'0'.repeat(64)}));
 try{assert.equal(run(['--output',output]).status,1);assert(!fs.existsSync(output))}finally{fs.writeFileSync(base+'.encryption.json',metadata)}
});
