'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {run}=require('./python-builder.cjs');
let installation;
async function ensureBuilder({python,appRoot,onProgress=()=>{},runImpl=run}){
 const ready=async()=>{try{await fs.access(python);await runImpl(python,['-c','import PyInstaller,sys; sys.exit(0 if PyInstaller.__version__ == "6.16.0" else 1)'],{timeoutMs:30000});return true;}catch{return false;}};
 if(await ready())return;
 if(!installation)installation=(async()=>{
  onProgress({stage:'building',detail:'Python-EXE-Builder wird eingerichtet …'});
  let log='';const setup=path.join(appRoot,'..','..','Setup-Python.ps1');
  await fs.access(setup).catch(()=>{throw Error('Setup-Python.ps1 fehlt. Das aktuelle Setup erneut ausführen.');});
  try{await runImpl('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',setup,'-SkipWinget'],{timeoutMs:1200000,log:chunk=>{log=(log+chunk).slice(-200000);}});}catch(error){error.buildLog=log+'\n'+error.message;throw error;}
  if(!await ready())throw Object.assign(Error('Python-Builder wurde nicht startbereit. Details stehen im Python-Setup-Protokoll.'),{buildLog:log});
 })().finally(()=>{installation=null;});
 return installation;
}
module.exports={ensureBuilder};
