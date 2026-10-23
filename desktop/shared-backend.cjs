'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function connectShared({root,runtime,appRoot,env,admin=false}){
  await fs.mkdir(root,{recursive:true,mode:0o700});
  const recordFile=path.join(root,'desktop-service-1.8.1.json'),lockFile=recordFile+'.lock';
  const read=async()=>{try{const item=JSON.parse(await fs.readFile(recordFile,'utf8'));const url=new URL(item.url);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:'||!item.key||!item.serviceId)return null;const response=await fetch(`${url.origin}/api/health`,{signal:AbortSignal.timeout(5000)});const health=await response.json();return response.ok&&health.serviceId===item.serviceId&&health.version==='1.8.1'?item:null;}catch{return null;}};
  let item=await read();
  if(!item){
    let lock;
    for(let attempt=0;attempt<100;attempt++){
      try{lock=await fs.open(lockFile,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:Date.now()}));break;}
      catch(error){if(error.code!=='EEXIST')throw error;try{const owner=JSON.parse(await fs.readFile(lockFile,'utf8'));try{process.kill(owner.pid,0);}catch{await fs.rm(lockFile,{force:true});continue;}}catch{}await wait(300);item=await read();if(item)break;}
    }
    if(!item&&!lock)throw new Error('Der gemeinsame Stelex-Dienst startet bereits. Beide Apps schließen und erneut starten.');
    if(lock){try{
      item=await read();
      if(!item){
        const key=randomBytes(32).toString('hex'),serviceId=randomUUID();
        const child=spawn(runtime,[path.join(appRoot,'server','index.mjs')],{cwd:appRoot,env:{...env,STELEX_DESKTOP_KEY:key,STELEX_SERVICE_ID:serviceId,STELEX_SERVICE_RECORD:recordFile,STELEX_DATA_DIR:path.join(root,'server'),STELEX_ADMIN_DIR:path.join(root,'admin-ui'),STELEX_ADMIN_DISABLED:'false',STELEX_ADMIN_TOKEN:'',STELEX_ADMIN_CODE_HASH:'',STELEX_OFFLINE_PUBLIC_KEY_FILE:path.join(appRoot,'server','offline-issuer-public.pem'),STELEX_OFFLINE_PRIVATE_KEY_FILE:path.join(root,'server','offline-issuer-private.pem'),STELEX_INITIAL_CREDITS:'0',STELEX_REMOVE_WELCOME:'true'},windowsHide:true,detached:true,stdio:'ignore'});
        let spawnError;child.once('error',error=>{spawnError=error;});child.unref();
        for(let attempt=0;attempt<120;attempt++){if(spawnError)throw spawnError;await wait(250);item=await read();if(item)break;}
        if(!item)throw new Error('Der gemeinsame Stelex-Dienst konnte nicht starten. Alte Stelex-Versionen schließen und erneut starten.');
      }
    }finally{await lock.close();await fs.rm(lockFile,{force:true});}}
  }
  const control=async(route,body)=>{const result=await fetch(`${item.url}/api/desktop/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${item.key}`},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});if(!result.ok)throw new Error('Stelex-Dienst konnte nicht verbunden werden.');};
  if(admin)await control('reload-admin',{});
  const clientId=randomUUID();await control('lease',{clientId});const heartbeat=setInterval(()=>void control('lease',{clientId}).catch(()=>{}),10000);heartbeat.unref();
  return{url:item.url,serviceId:item.serviceId,release(){clearInterval(heartbeat);void control('lease',{clientId,release:true}).catch(()=>{});}};
}
module.exports={connectShared};
