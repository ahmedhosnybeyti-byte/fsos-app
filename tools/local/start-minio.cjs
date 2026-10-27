// Local verification only. No database, Docker, external storage or global install.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const root=process.cwd();assert.equal(root,'D:\\Field Sales OS');
const local=n=>require(require.resolve(n,{paths:[path.join(root,'apps/api')]}));
const config=local('dotenv').parse(fs.readFileSync('apps/api/.env'));
assert.equal(config.STORAGE_ENDPOINT,'http://localhost:9000');assert.equal(config.STORAGE_ACCESS_KEY_ID,'fieldsalesos');assert.equal(config.STORAGE_SECRET_ACCESS_KEY,'fieldsalesos123');
const dir=path.join(root,'.quality/visit-execution/minio-native'),binary=path.join(dir,'minio.exe'),data=path.join(dir,'data');
assert.ok(fs.existsSync(binary));const sha256=createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
const provenance=JSON.parse(fs.readFileSync(path.join(dir,'build-evidence.json')));assert.equal(sha256,provenance.binarySha256);
async function open(port){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});s.setTimeout(1000);s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));s.once('timeout',()=>{s.destroy();resolve(false)})})}
(async()=>{
 assert.equal(await open(9000),false,'Port 9000 is already in use; never replace an unknown service');
 assert.equal(await open(9001),false,'Port 9001 is already in use');
 fs.mkdirSync(data,{recursive:true});
 const env={};for(const [k,v] of Object.entries(process.env))if(/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))env[k]=v;
 Object.assign(env,{MINIO_ROOT_USER:config.STORAGE_ACCESS_KEY_ID,MINIO_ROOT_PASSWORD:config.STORAGE_SECRET_ACCESS_KEY,MINIO_REGION_NAME:config.STORAGE_REGION,MINIO_UPDATE:'off',MINIO_BROWSER:'off'});
 const out=fs.openSync(path.join(dir,'server.out.log'),'a'),err=fs.openSync(path.join(dir,'server.err.log'),'a');
 const child=spawn(binary,['server',data,'--address','127.0.0.1:9000','--console-address','127.0.0.1:9001'],{cwd:root,env,detached:true,windowsHide:true,stdio:['ignore',out,err]});
 child.once('error',e=>{console.error(e.message);process.exitCode=1});child.unref();fs.closeSync(out);fs.closeSync(err);
 const state={pid:child.pid,binary,data,sha256,endpoint:config.STORAGE_ENDPOINT,bucket:config.STORAGE_BUCKET,bind:'127.0.0.1:9000',docker:false,providerChanged:false,credentialsChanged:false};fs.writeFileSync(path.join(dir,'runtime.json'),JSON.stringify(state,null,2));
 let ready=false;for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:9000/minio/health/ready',{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert.ok(ready,'MinIO readiness did not pass');
 const {S3Client,HeadBucketCommand,CreateBucketCommand,GetBucketPolicyCommand}=local('@aws-sdk/client-s3');
 const client=new S3Client({endpoint:config.STORAGE_ENDPOINT,region:config.STORAGE_REGION,forcePathStyle:config.STORAGE_FORCE_PATH_STYLE==='true',credentials:{accessKeyId:config.STORAGE_ACCESS_KEY_ID,secretAccessKey:config.STORAGE_SECRET_ACCESS_KEY}});
 try{await client.send(new HeadBucketCommand({Bucket:config.STORAGE_BUCKET}))}catch(e){if(e.$metadata?.httpStatusCode!==404)throw e;await client.send(new CreateBucketCommand({Bucket:config.STORAGE_BUCKET}))}
 let privateBucket=false;try{await client.send(new GetBucketPolicyCommand({Bucket:config.STORAGE_BUCKET}))}catch(e){if(e.name==='NoSuchBucketPolicy')privateBucket=true;else throw e}assert.ok(privateBucket,'Unexpected bucket policy; review before testing');client.destroy();
 fs.writeFileSync(path.join(dir,'startup-evidence.json'),JSON.stringify({...state,status:'PASS',readyHttp:200,privateBucket:true},null,2));console.log(JSON.stringify({status:'PASS',pid:child.pid,endpoint:config.STORAGE_ENDPOINT,bucket:config.STORAGE_BUCKET,privateBucket:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1});

