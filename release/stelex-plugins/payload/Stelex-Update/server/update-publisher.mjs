import {mkdtemp,open,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
const repo='https://api.github.com/repos/stelexacc/New';
function failure(status,message){return Object.assign(new Error(message),{status,code:'UPDATE_PUBLISH_FAILED'});}
export async function publishUpdate(request,{fetchImpl=fetch}={}){
 const token=request.headers['x-github-token'],tag=request.headers['x-update-version'],kind=request.headers['x-update-kind'];
 if(typeof token!=='string'||token.length<20||token.length>500||!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag||'')||!['exe','zip'].includes(kind))throw failure(400,'Version (v1.8.2), GitHub-Token und Setup.exe oder ZIP angeben.');
 const expected=Number(request.headers['content-length']);
 if(!Number.isSafeInteger(expected)||expected<64||expected>600*1024*1024)throw failure(413,'Update muss zwischen 64 Byte und 600 MB groß sein.');
 const dir=await mkdtemp(join(tmpdir(),'stelex-update-'));const file=join(dir,'payload');let releaseId;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Stelex-Admin'};
 const api=async(url,init={})=>{const response=await fetchImpl(url,{...init,redirect:'error',headers:{...headers,...init.headers},signal:AbortSignal.timeout(15*60*1000)});if(!response.ok)throw failure(502,'GitHub meldet HTTP '+response.status+'. Token-Rechte, Versionsnummer und Verbindung prüfen.');return response.json();};
 try{
  let size=0;const hash=createHash('sha256');
  await pipeline(request,new Transform({transform(chunk,encoding,done){size+=chunk.length;if(size>expected)return done(failure(413,'Update überschreitet die angegebene Größe.'));hash.update(chunk);done(null,chunk);}}),createWriteStream(file,{flags:'wx',mode:0o600}));
  if(size!==expected)throw failure(400,'Upload ist unvollständig.');
  const handle=await open(file,'r');try{const prefix=Buffer.alloc(64);await handle.read(prefix,0,64,0);if(kind==='zip'){if(prefix.readUInt32LE(0)!==0x04034b50)throw failure(400,'Keine gültige ZIP-Datei.');}else{const offset=prefix.readUInt32LE(60);if(prefix.toString('ascii',0,2)!=='MZ'||offset<64||offset>size-4)throw failure(400,'Keine Windows-EXE.');const pe=Buffer.alloc(4);await handle.read(pe,0,4,offset);if(pe.readUInt32LE(0)!==0x00004550)throw failure(400,'Keine Windows-PE-Datei.');}}finally{await handle.close();}
  const checksum=hash.digest('hex'),name=kind==='exe'?'Setup.exe':'STELEX-GPT-Komplett-Aktualisiert.zip';
  const release=await api(repo+'/releases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:'release/stelex-deepseek-free-plugins',name:'STELEX GPT '+tag,draft:true,body:'Neue STELEX-GPT-Version. Download: '+name+'\n\nSHA-256: '+checksum})});releaseId=release.id;
  if(!Number.isSafeInteger(releaseId))throw failure(502,'Ungültige GitHub-Antwort.');
  const upload='https://uploads.github.com/repos/stelexacc/New/releases/'+releaseId+'/assets?name=';
  await api(upload+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Length':String(size)},body:createReadStream(file),duplex:'half'});
  const sidecar=checksum+'  '+name+'\n';await api(upload+encodeURIComponent(name+'.sha256'),{method:'POST',headers:{'Content-Type':'text/plain','Content-Length':String(Buffer.byteLength(sidecar))},body:sidecar});
  const published=await api(repo+'/releases/'+releaseId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,make_latest:'true'})});
  return {ok:true,version:tag,url:published.html_url,sha256:checksum};
 }catch(error){if(releaseId)error.message+=' Der unvollständige Entwurf bleibt auf GitHub unveröffentlicht und kann dort geprüft oder gelöscht werden.';throw error;}
 finally{await rm(dir,{recursive:true,force:true});}
}

let cachedLatest,latestUntil=0,latestPending;
export async function latestUpdate({fetchImpl=fetch,now=Date.now()}={}){
 if(cachedLatest&&now<latestUntil)return cachedLatest;
 if(latestPending)return latestPending;
 latestPending=(async()=>{const response=await fetchImpl(repo+'/releases/latest',{redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'Stelex-GPT'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw failure(502,'Update-Abfrage fehlgeschlagen (GitHub HTTP '+response.status+').');const data=await response.json();const url=new URL(data.html_url);if(url.origin!=='https://github.com'||!url.pathname.startsWith('/stelexacc/New/releases/tag/'))throw failure(502,'Ungültige Update-Adresse.');cachedLatest={tag_name:data.tag_name,name:data.name,html_url:url.href,published_at:data.published_at};latestUntil=now+60000;return cachedLatest;})();
 try{return await latestPending;}finally{latestPending=null;}
}
