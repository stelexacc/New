'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {canonicalDirectory}=require('./output-files.cjs');
const MAX_EXE_BYTES=256*1024*1024;
function run(executable,args,{cwd,env=process.env,timeoutMs=600000,log=()=>{}}={}){
 return new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};const timer=setTimeout(()=>{child.kill();finish(Error('Der EXE-Build hat das Zeitlimit von 10 Minuten überschritten.'));},timeoutMs);child.on('error',finish);for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>log(chunk.toString()));child.on('exit',code=>finish(code===0?null:Error(`Python-Build fehlgeschlagen (Exit ${code}). Details stehen im Build-Log.`)));});
}
async function buildPythonExe({files,entryName,exeName,python,outputDirectory,onProgress=()=>{},runImpl=run}){
 if(process.platform!=='win32'&&!process.env.STELEX_BUILDER_TEST)throw Error('Windows-EXE-Builds sind nur in der Windows-App verfügbar.');
 try{await fs.access(python);}catch{throw Error('Der EXE-Builder fehlt. Install.bat erneut ausführen, um Python und PyInstaller einzurichten.');}const staging=await fs.mkdtemp(path.join(os.tmpdir(),'stelex-build-'));const source=path.join(staging,'source'),dist=path.join(staging,'dist');let logText='STELEX Python → Windows EXE\n';
 try{
  await fs.mkdir(source);for(const file of files){require('./output-files.cjs').decodeArtifact(file);await fs.writeFile(path.join(source,file.name),file.content,{encoding:'utf8',flag:'wx'});}
  if(!files.some(f=>f.name===entryName)||!/^.+\.py$/i.test(entryName))throw Error('Kein Python-Einstiegspunkt vorhanden.');
  onProgress({stage:'building'});
  await runImpl(python,['-m','PyInstaller','--noconfirm','--clean','--onefile','--name',path.basename(exeName,'.exe'),'--distpath',dist,'--workpath',path.join(staging,'work'),'--specpath',path.join(staging,'spec'),path.join(source,entryName)],{cwd:source,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'},log:chunk=>{logText=(logText+chunk).slice(-200000);}});
  const built=path.join(dist,exeName);const stat=await fs.lstat(built);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<64||stat.size>MAX_EXE_BYTES)throw Error('Ungültige EXE-Buildgröße.');
  const handle=await fs.open(built,'r');const magic=Buffer.alloc(2);await handle.read(magic,0,2,0);await handle.close();if(magic.toString()!=='MZ')throw Error('Der Build hat keine Windows-EXE erzeugt.');
  const bytes=await fs.readFile(built);onProgress({stage:'saving'});const saved=await commitUnique(outputDirectory,exeName,bytes);return{...saved,logText:logText+'\nBuild erfolgreich. Die EXE wurde nicht gestartet.\n'};
 }catch(error){error.buildLog=logText+'\n'+error.message+'\n';throw error;}finally{await fs.rm(staging,{recursive:true,force:true});}
}
async function commitUnique(directory,name,data){
 const real=await canonicalDirectory(directory);if(real!==directory)throw Error('Ausgabeordner verändert.');
 const {decodeArtifact}=require('./output-files.cjs');decodeArtifact({name,content:''});const ext=path.extname(name),stem=path.basename(name,ext);
 const temporary=path.join(directory,`.stelex-build-${randomUUID()}.tmp`);
 try{
  const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
  if(await canonicalDirectory(directory)!==directory)throw Error('Ausgabeordner verändert.');
  for(let suffix=0;suffix<100;suffix++){
   const output=path.join(directory,suffix?`${stem}-${suffix+1}${ext}`:name);
   try{await fs.link(temporary,output);return{path:output,name:path.basename(output),bytes:data.length};}catch(error){if(error.code==='EEXIST')continue;throw error;}
  }
 }finally{await fs.rm(temporary,{force:true});}
 throw Error('Zu viele Dateien mit gleichem Namen.');
}
module.exports={run,buildPythonExe,commitUnique,MAX_EXE_BYTES};
