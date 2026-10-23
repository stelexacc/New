'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
const {parseGeneratedFiles}=require('./generated-files.cjs');
const {saveArtifact}=require('./output-files.cjs');
const {buildPythonExe}=require('./python-builder.cjs');
async function saveUnique(directory,file){const ext=path.extname(file.name),stem=path.basename(file.name,ext);for(let n=0;n<100;n++){const name=n?`${stem}-${n+1}${ext}`:file.name;try{const result=await saveArtifact(directory,{...file,name});if(!result.canceled)return result;}catch(error){if(error.code!=='EEXIST')throw error;}}throw Error('Zu viele gleichnamige Dateien.');}
async function generateFiles({directory,dataRoot,python,requestId,content,requestText,onProgress=()=>{},builder=buildPythonExe}){
 if(!/^[a-f0-9-]{36}$/i.test(requestId||''))throw Error('Ungültige Auftragskennung.');
 const manifestFile=path.join(dataRoot,'generated-files.json');let jobs={};try{jobs=JSON.parse(await fs.readFile(manifestFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(jobs[requestId])return{...jobs[requestId],cached:true};
 const parsed=parseGeneratedFiles(content,requestText);if(!parsed.files.length)return{files:[],error:parsed.wantsExe?'Für eine EXE muss die KI zunächst vollständigen Python-Code liefern.':null};
 onProgress({stage:'saving'});const files=[];for(const file of parsed.files){const destination=await require('./project-paths.cjs').projectDestination(directory,file.name);const saved=await saveUnique(destination.directory,{...file,name:destination.name});files.push({...saved,name:require('node:path').relative(directory,saved.path)});}let error=null;
 if(parsed.wantsExe){try{if(!parsed.entryName)throw Error('Die Antwort enthält keinen Python-Code zum Erstellen der EXE.');const built=await builder({files:parsed.files,entryName:parsed.entryName,exeName:parsed.exeName,python,outputDirectory:directory,onProgress});files.push({path:built.path,name:built.name,bytes:built.bytes});files.push(await saveUnique(directory,{name:parsed.exeName+'.build.log',content:built.logText}));}catch(failure){error=failure.message||'EXE-Build fehlgeschlagen.';files.push(await saveUnique(directory,{name:parsed.exeName+'.build.log',content:failure.buildLog||error}));}}
 const result={files,error,completedAt:Date.now()};jobs[requestId]=result;const keys=Object.keys(jobs);for(const key of keys.slice(0,Math.max(0,keys.length-200)))delete jobs[key];await fs.mkdir(dataRoot,{recursive:true});const temporary=manifestFile+'.tmp';await fs.writeFile(temporary,JSON.stringify(jobs)+'\n',{mode:0o600});await fs.rename(temporary,manifestFile);return result;
}
module.exports={generateFiles,saveUnique};
