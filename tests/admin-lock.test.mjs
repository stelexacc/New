import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,writeFile,mkdir,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {hashAdminCode} from '../server/admin-auth.mjs';
const require=createRequire(import.meta.url);
const bundleModule=require('../desktop/admin-bundle.cjs');
const source=await readFile(new URL('../desktop/locked-admin.cjs',import.meta.url),'utf8');

async function fixture(t){
  const directory=await mkdtemp(path.join(tmpdir(),'stelex-admin-lock-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const resources=path.join(directory,'resources'),desktop=path.join(resources,'app','desktop');
  await mkdir(desktop,{recursive:true});
  const code='test-private-admin-code',data={codeHash:hashAdminCode(code),files:{'index.html':'private html','styles.css':'private CSS','app.js':'private script'}};
  await writeFile(path.join(resources,'private-admin.bundle.json'),JSON.stringify(bundleModule.seal(data,code)));
  const app=new EventEmitter();app.setName=()=>{};app.setAppUserModelId=()=>{};app.setPath=()=>{};app.getPath=()=>directory;app.whenReady=()=>Promise.resolve();app.quit=()=>{};app.exit=()=>{throw new Error('Unexpected process exit');};
  let window,handler,handoffs=0,time=1000;
  class BrowserWindow extends EventEmitter{
    constructor(){super();window=this;this.webContents=new EventEmitter();this.webContents.mainFrame={url:pathToFileURL(path.join(desktop,'locked-admin.html')).href};this.webContents.setWindowOpenHandler=()=>{};}
    loadFile(){return Promise.resolve();}hide(){this.hidden=true;}isDestroyed(){return false;}destroy(){this.destroyed=true;}
  }
  const globals={};
  const context={require(name){if(name==='electron')return{app,BrowserWindow,ipcMain:{handle(_name,fn){handler=fn;}}};if(name==='./admin-bundle.cjs')return bundleModule;if(name==='./main.cjs'){handoffs++;return{};}return require(name);},__dirname:desktop,process:{resourcesPath:resources,env:{},platform:'win32'},global:globals,Date:{now:()=>time},console};
  vm.runInNewContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  const event=()=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
  return{directory,resources,desktop,code,data,window,globals,unlock:(value,request=event())=>handler(request,value),handoffs:()=>handoffs,advance:()=>{time+=30001;}};
}

test('private files appear only after correct code, then control passes to the existing Admin app',async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>f.unlock(f.code,{sender:{},senderFrame:{}}));
  assert.equal((await f.unlock('incorrect-test-code')).ok,false);
  await assert.rejects(()=>access(path.join(f.resources,'app','admin')));
  assert.equal((await f.unlock(f.code)).ok,true);
  for(const[name,value]of Object.entries(f.data.files))assert.equal(await readFile(path.join(f.resources,'app','admin',name),'utf8'),value);
  assert.equal(JSON.parse(await readFile(path.join(f.resources,'owner-admin-auth.json'),'utf8')).codeHash,f.data.codeHash);
  assert.equal(JSON.parse(await readFile(path.join(f.directory,'Stelex Admin','server','admin-auth.json'),'utf8')).codeHash,f.data.codeHash);
  assert.equal(f.handoffs(),1);assert.equal(f.window.hidden,true);
  assert.equal(f.globals[Symbol.for('stelex.admin.launchCode')],f.code);
  assert.equal((await f.unlock(f.code)).ok,false);assert.equal(f.handoffs(),1);
});

test('five bad attempts throttle the unlock without exposing or writing private files',async t=>{
  const f=await fixture(t);
  for(let i=0;i<5;i++)assert.equal((await f.unlock('incorrect-test-code')).ok,false);
  assert.equal((await f.unlock(f.code)).ok,false);
  await assert.rejects(()=>access(path.join(f.resources,'owner-admin-auth.json')));
  assert.equal(f.handoffs(),0);
  f.advance();assert.equal((await f.unlock(f.code)).ok,true);assert.equal(f.handoffs(),1);
});


test('Windows file URL casing does not reject the legitimate unlock window',async t=>{
  const f=await fixture(t);
  const original=f.window.webContents.mainFrame.url;
  f.window.webContents.mainFrame.url=original.toUpperCase();
  assert.equal((await f.unlock(f.code)).ok,true);
  assert.equal(f.handoffs(),1);
});
