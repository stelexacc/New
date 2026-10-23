'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {randomUUID}=require('node:crypto');const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const {generateFiles}=require('../desktop/generation-jobs.cjs');const {ensureBuilder}=require('../desktop/builder-setup.cjs');const {canonicalDirectory}=require('../desktop/output-files.cjs');
(async()=>{
 assert.equal(process.platform,'win32');const root=await fs.mkdtemp(path.join(os.tmpdir(),'stelex-real-artifacts-'));const directoryPath=path.join(root,'output');await fs.mkdir(directoryPath);const directory=await canonicalDirectory(directoryPath);const dataRoot=path.join(root,'data');await fs.mkdir(dataRoot);
 const python=path.join(process.env.APPDATA,'Stelex GPT','tools','python-builder','Scripts','python.exe');const appRoot=path.resolve(__dirname,'..');
 const content='```python filename="hallo.py"\nprint("STELEX_FIXTURE_OK")\n```';
 try{
  const saved=await generateFiles({directory,dataRoot,requestId:randomUUID(),content,requestText:'Erstelle hallo.py'});assert.equal(saved.error,null);assert.equal(await fs.readFile(path.join(directory,'hallo.py'),'utf8'),'print("STELEX_FIXTURE_OK")\n');
  console.log('::notice::Real artifact test: Python source file saved and verified.');
  const built=await generateFiles({directory,dataRoot,python,requestId:randomUUID(),content,requestText:'Erstelle eine EXE',ensureBuilder:options=>ensureBuilder({...options,appRoot}),onProgress:state=>console.log('Artifact stage:',state.stage)});
  assert.equal(built.error,null,built.error);const executable=built.files.find(f=>f.name.endsWith('.exe'));assert.ok(executable,'No compiled EXE');const bytes=await fs.readFile(executable.path);assert.equal(bytes.toString('ascii',0,2),'MZ');const peOffset=bytes.readUInt32LE(60);assert.equal(bytes.toString('binary',peOffset,peOffset+4),'PE\0\0');
  // Only this known, harmless fixture is executed by CI. Production never auto-runs generated EXEs.
  const result=await promisify(execFile)(executable.path,[],{timeout:30000,windowsHide:true});assert.match(result.stdout,/STELEX_FIXTURE_OK/);
  console.log('::notice::Real artifact test: genuine Windows PE compiled with PyInstaller and trusted fixture output verified.');
  const failedId=randomUUID();const bad=await generateFiles({directory,dataRoot,python,requestId:failedId,content:'```python filename="retry.py"\ndef broken(\n```',requestText:'Erstelle EXE'});assert.ok(bad.error);assert.equal(bad.files.some(f=>f.name==='retry.exe'),false);assert.ok(bad.files.some(f=>f.name.endsWith('.build.log')));
  const retry=await generateFiles({directory,dataRoot,python,requestId:failedId,content:'```python filename="retry.py"\nprint("RETRY_OK")\n```',requestText:'Erstelle EXE'});assert.equal(retry.error,null,retry.error);assert.ok(retry.files.some(f=>f.name==='retry.exe'));
  console.log('::notice::Real artifact test: invalid Python produces a build error/log, and corrected same-ID retry succeeds.');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error('::error::'+error.message);process.exitCode=1;});
