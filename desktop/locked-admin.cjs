'use strict';
const { app,BrowserWindow,ipcMain }=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const {open}=require('./admin-bundle.cjs');
app.setName('Stelex Admin');
app.setAppUserModelId('com.stelex.admin');
const profile=path.join(app.getPath('appData'),'Stelex Admin');
app.setPath('userData',profile);
const bundleFile=path.join(process.resourcesPath,'private-admin.bundle.json');
const smoke=process.env.CI==='true' && process.env.STELEX_ADMIN_LOCK_SMOKE_RESULT && path.isAbsolute(process.env.STELEX_ADMIN_LOCK_SMOKE_RESULT) ? process.env.STELEX_ADMIN_LOCK_SMOKE_RESULT : null;
let unlocked=false,busy=false,attempts=[],window;
const loginFile=path.join(__dirname,'locked-admin.html');
async function unlock(event,code) {
  let senderFile;
  try { senderFile=path.normalize(fileURLToPath(event.senderFrame.url)); } catch { throw new Error('Unknown window.'); }
  const expectedFile=path.normalize(loginFile);
  const sameFile=process.platform==='win32' ? senderFile.toLowerCase()===expectedFile.toLowerCase() : senderFile===expectedFile;
  if (!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || !sameFile) throw new Error('Unknown window.');
  if (busy || unlocked) return {ok:false,error:'Bitte warten.'};
  attempts=attempts.filter(at=>Date.now()-at<30000);
  if (attempts.length>=5) return {ok:false,error:'Bitte warte 30 Sekunden und versuche es erneut.'};
  attempts.push(Date.now());busy=true;
  try {
    const bundle=JSON.parse(await fs.readFile(bundleFile,'utf8'));
    const privateData=open(bundle,code);
    const sharedProfile=path.join(app.getPath('appData'),'Stelex GPT');
    const adminDir=path.join(sharedProfile,'admin-ui');
    await fs.mkdir(adminDir,{recursive:true,mode:0o700});
    for (const [name,content] of Object.entries(privateData.files)) await fs.writeFile(path.join(adminDir,name),content,{mode:0o600});
    const auth=JSON.stringify({codeHash:privateData.codeHash})+'\n';
    await fs.mkdir(path.join(sharedProfile,'server'),{recursive:true,mode:0o700});
    await fs.writeFile(path.join(sharedProfile,'server','admin-auth.json'),auth,{mode:0o600});
    if(privateData.signingPrivateKey)await fs.writeFile(path.join(sharedProfile,'server','offline-issuer-private.pem'),privateData.signingPrivateKey,{mode:0o600});
    unlocked=true;
    global[Symbol.for('stelex.admin.unlocked')]=true;
    global[Symbol.for('stelex.admin.launchCode')]=code;
    app.once('browser-window-created',(_event,next)=>next.once('ready-to-show',()=>{ if(window && !window.isDestroyed()) window.destroy(); }));
    window.hide();
    require('./main.cjs');
    return {ok:true};
  } catch {
    return {ok:false,error:'Der Zugangscode ist falsch oder die Datei ist beschädigt.'};
  } finally {busy=false;}
}
app.whenReady().then(async()=>{
  window=new BrowserWindow({title:'Stelex Admin',width:650,height:670,minWidth:480,minHeight:570,backgroundColor:'#09090d',icon:path.join(__dirname,'assets','icon.ico'),webPreferences:{preload:path.join(__dirname,'locked-admin-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  ipcMain.handle('stelex-admin:unlock',unlock);
  window.on('closed',()=>{if(!unlocked)app.quit();});
  window.webContents.once('did-finish-load',async()=>{
    if(!smoke)return;
    try {
      const state=await window.webContents.executeJavaScript(`(async()=>{const denied=await window.stelexAdminUnlock.unlock('incorrect-test-code');return {ok:Boolean(document.querySelector('.admin-unlock') && denied.ok===false),view:'locked-admin',wrongCodeRejected:denied.ok===false};})()`);
      const missing=async file=>{try{await fs.access(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}};
      state.privateFilesAbsent=await missing(path.join(__dirname,'..','admin')) && await missing(path.join(process.resourcesPath,'owner-admin-auth.json'));
      state.ok=state.ok && state.privateFilesAbsent;
      await fs.mkdir(path.dirname(smoke),{recursive:true});await fs.writeFile(smoke,JSON.stringify(state)+'\n');app.exit(state.ok?0:1);
    } catch(error) {
      await fs.mkdir(path.dirname(smoke),{recursive:true});
      await fs.writeFile(smoke,JSON.stringify({ok:false,stage:'lock-smoke',error:error.message})+'\n');
      app.exit(1);
    }
  });
  await window.loadFile(loginFile);
}).catch(async error=>{
  if(smoke){try{await fs.mkdir(path.dirname(smoke),{recursive:true});await fs.writeFile(smoke,JSON.stringify({ok:false,stage:'startup',error:error.message})+'\n');}catch{}}
  app.exit(1);
});
