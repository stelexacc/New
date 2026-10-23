'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
function validateLink(value,expectedOrigin){if(!value||value.version!==1||value.siteUrl!==expectedOrigin||!/^https:\/\//.test(value.siteUrl)||!/^([a-f0-9]{64})$/.test(value.bridgeId||'')||!/^([a-f0-9]{64})$/.test(value.secret||'')||typeof value.serviceAccess!=='string'||value.serviceAccess.length<20||value.serviceAccess.length>500)throw Error('Ungueltige Verbindungsdatei oder falsche Website.');return value;}
function permittedPath(value){return typeof value==='string'&&value.startsWith('/api/')&&!/^\/api\/(admin|desktop)(\/|$)/.test(value)&&!value.includes('..')&&!value.includes('\\')&&!/[\x00-\x1f]/.test(value);}
function createWebLink({directory,safeStorage,expectedOrigin,localOrigin,handle,fetchImpl=fetch}){
 const file=path.join(directory,'web-link.encrypted');let config=null,controller=null,running=false;const inflight=new Set();let lastError=null;
 const state=()=>({connected:Boolean(config),siteUrl:config?.siteUrl||expectedOrigin,lastError});
 async function remote(route,options={}){const r=await fetchImpl(config.siteUrl+route,{...options,redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+config.serviceAccess,Authorization:'Bearer '+config.secret,'X-Stelex-Bridge':config.bridgeId,...options.headers}});if(!r.ok)throw Error('Website-Verbindung: HTTP '+r.status);return r.json();}
 async function execute(job){try{let result;const p=job.payload;
  if(p.kind==='http'){
   if(!permittedPath(p.path)||!['GET','POST','PUT','DELETE'].includes(p.method))throw Error('Vorgang nicht erlaubt.');
   const r=await fetchImpl(localOrigin+p.path,{method:p.method,redirect:'error',headers:{'Content-Type':'application/json',Origin:localOrigin,...(p.cookie?{Cookie:p.cookie}:{})},body:['GET','HEAD'].includes(p.method)?undefined:p.body,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(600000)])});
   const raw=Buffer.from(await r.arrayBuffer());if(raw.length>15000000)throw Error('Antwort zu gross fuer die Website.');result={status:r.status,body:raw.toString('base64'),contentType:r.headers.get('content-type')||'application/json',cookie:r.headers.get('set-cookie')||null};
  }else result={status:200,value:await handle(p.kind,p)};
  await remote('/bridge/agent/result',{method:'POST',body:JSON.stringify({id:job.id,result})});
 }catch(error){if(!controller?.signal.aborted)try{await remote('/bridge/agent/result',{method:'POST',body:JSON.stringify({id:job.id,result:{status:502,error:error.message}})});}catch{}}finally{inflight.delete(job.id);}}
 async function loop(){if(running)return;running=true;while(config&&!controller.signal.aborted){try{const r=await remote('/bridge/agent/poll');lastError=null;for(const job of r.jobs||[]){if(inflight.has(job.id))continue;inflight.add(job.id);void execute(job);}}catch(error){lastError=error.message;}await new Promise(r=>setTimeout(r,1200));}running=false;}
 async function connect(value){validateLink(value,expectedOrigin);if(!safeStorage.isEncryptionAvailable())throw Error('Windows-Verschluesselung ist nicht verfuegbar. Verbindung nicht gespeichert.');controller?.abort();await fs.mkdir(directory,{recursive:true});await fs.writeFile(file,safeStorage.encryptString(JSON.stringify(value)),{mode:0o600});config=value;controller=new AbortController();void loop();return state();}
 return{state,connect,async restore(){try{if(safeStorage.isEncryptionAvailable()){const value=JSON.parse(safeStorage.decryptString(await fs.readFile(file)));validateLink(value,expectedOrigin);config=value;controller=new AbortController();void loop();}}catch{}return state();},async disconnect(){controller?.abort();config=null;await fs.rm(file,{force:true});return state();},stop(){controller?.abort();}};
}
module.exports={createWebLink,validateLink,permittedPath};
