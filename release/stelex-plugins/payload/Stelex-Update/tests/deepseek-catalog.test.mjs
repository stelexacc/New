import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
test('DeepSeek is advertised by desktop and by services launched with a stale four-model snapshot',async()=>{
const {catalog,localModels}=require('../desktop/model-catalog.cjs');
const id='stelex-deepseek-r1-abliterated:8b';assert.equal(catalog.length,5);assert.equal(localModels().filter(m=>m.id===id).length,1);assert.equal(localModels([id]).find(m=>m.id===id).available,true);
const dir=mkdtempSync(join(tmpdir(),'stelex-deepseek-'));
const stale=catalog.filter(m=>m.id!==id);const env={...process.env,STELEX_AI_MODELS:JSON.stringify(stale),STELEX_AI_TRANSPORT:'ollama-native',STELEX_DEMO_MODE:'true',STELEX_ADMIN_DISABLED:'true',STELEX_PORT:'0',STELEX_DATA_DIR:dir};
const child=spawn(process.execPath,[fileURLToPath(new URL('../server/index.mjs',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});
try{
 let output='';const url=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('startup timeout')),10000);child.once('exit',c=>reject(Error('server exit '+c)));child.stdout.on('data',b=>{output+=b;const m=output.match(/STELEX_READY=(http[^\s]+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});});
 const health=await (await fetch(url+'/api/health')).json();assert.equal(health.models.length,5);assert.equal(health.models.filter(m=>m.id===id).length,1);
 console.log('DeepSeek: desktop catalog has 5 models; backend health also has 5 despite a stale four-model launch snapshot.');
}finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));rmSync(dir,{recursive:true,force:true});}

});
