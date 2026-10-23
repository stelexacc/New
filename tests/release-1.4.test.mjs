import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/app.mjs';
import {ollamaChat} from '../server/ollama.mjs';
import {hashAdminCode} from '../server/admin-auth.mjs';
import {migrateWelcomeGift} from '../server/welcome-migration.mjs';
import {initializePlans} from '../server/plans.mjs';
const require=createRequire(import.meta.url);
const {connectShared}=require('../desktop/shared-backend.cjs');
const root=path.resolve(import.meta.dirname,'..');
const code='test-owner-code-only-not-production';
async function temporary(t){const dir=await mkdtemp(path.join(tmpdir(),'stelex14-'));t.after(()=>rm(dir,{force:true,recursive:true}));return dir;}
async function call(base,route,{body,cookie,admin}={}){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:`Bearer ${admin}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
const register=base=>call(base,'/api/auth/register',{body:{name:'Tester',email:`${crypto.randomUUID()}@test.invalid`,password:'test-password-long-enough'}});
function stream(parts){return new Response(new ReadableStream({start(controller){for(const part of parts)controller.enqueue(new TextEncoder().encode(JSON.stringify(part)+'\n'));controller.close();}}));}

test('native Ollama disables hidden reasoning, streams only visible answer and requires final metering',async()=>{
 const seen=[],updates=[];const result=await ollamaChat({baseUrl:'http://localhost:11434/v1',model:'qwen3.5-abliterated:9b',messages:[{role:'user',content:'hi'}],maxOutputTokens:1536,fetchImpl:async(url,init)=>{seen.push({url,body:JSON.parse(init.body)});return stream([{message:{thinking:'private reasoning'}},{message:{content:'Hallo '}},{message:{content:'Welt'}},{done:true,prompt_eval_count:20,eval_count:4}]);},onProgress:p=>updates.push(p)});
 assert.equal(result.content,'Hallo Welt');assert.equal(seen[0].url,'http://localhost:11434/api/chat');assert.equal(seen[0].body.think,false);assert.equal(seen[0].body.keep_alive,'15m');assert.equal(seen[0].body.stream,true);assert.equal(result.inputTokens,20);assert(!JSON.stringify(updates).includes('private reasoning'));
 await assert.rejects(()=>ollamaChat({baseUrl:'http://localhost:11434',messages:[],fetchImpl:async()=>stream([{message:{content:'unmetered'}}])}),{code:'INVALID_PROVIDER_RESPONSE'});
 await assert.rejects(()=>ollamaChat({baseUrl:'http://localhost:11434',messages:[],fetchImpl:async()=>Response.json({error:'not found'},{status:404})}),{code:'MODEL_NOT_INSTALLED'});
});

test('Free covers sixty ordinary 1-minute exchanges with history and no purchased credits; model failure refunds allowance',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 let fail=false;const app=await createApp({demoMode:false,aiTransport:'ollama-native',aiBaseUrl:'http://localhost:11434/v1',fetchImpl:async(url,init)=>{if(url.endsWith('/models'))return Response.json({data:[]});if(fail)return Response.json({error:'model missing'},{status:404});const body=JSON.parse(init.body);const input=Math.min(7000,Math.ceil(JSON.stringify(body.messages).length/3));return stream([{message:{content:'Eine normale Antwort. '.repeat(60)}},{done:true,prompt_eval_count:input,eval_count:400}]);}});t.after(()=>app.close());const base=await app.listen(0);const user=await register(base);assert.equal(user.data.balance,0);let conversationId;
 for(let i=0;i<60;i++){t.mock.timers.tick(60000);const result=await call(base,'/api/chat',{cookie:user.cookie,body:{message:'Bitte hilf mir bei meinem Projekt. '.repeat(8),conversationId,requestId:crypto.randomUUID()}});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.creditsCharged,0);conversationId=result.data.conversationId;}
 const before=await call(base,'/api/me',{cookie:user.cookie});assert(before.data.quota.short.remainingPercent>0);assert.equal(before.data.balance,0);
 fail=true;const requestId=crypto.randomUUID();assert.equal((await call(base,'/api/chat',{cookie:user.cookie,body:{message:'Noch eine Frage',requestId}})).data.code,'MODEL_NOT_INSTALLED');const after=await call(base,'/api/me',{cookie:user.cookie});assert.deepEqual(after.data.quota,before.data.quota);
 const outsider=await register(base);assert.equal((await call(base,`/api/chat/status?requestId=${requestId}`,{cookie:outsider.cookie})).data.stage,'preparing');assert.equal((await call(base,`/api/chat/status?requestId=${requestId}`)).status,401);
});

test('legacy 500 gift removal preserves purchased balance and is idempotent',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,balance INTEGER);CREATE TABLE ledger(id TEXT,userId TEXT,type TEXT,credits INTEGER,balance INTEGER,createdAt TEXT,note TEXT);CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);');
 db.exec("INSERT INTO users VALUES('gift',576),('purchased',500),('spent',100);INSERT INTO ledger VALUES('a','gift','welcome',500,500,'',''),('b','gift','usage',-24,476,'',''),('c','gift','redeem',100,576,'',''),('d','purchased','redeem',500,500,'',''),('e','spent','welcome',500,500,'',''),('f','spent','usage',-600,0,'','');");migrateWelcomeGift(db);assert.deepEqual(db.prepare('SELECT balance FROM users ORDER BY id').all().map(v=>v.balance),[100,500,100]);migrateWelcomeGift(db);assert.equal(db.prepare("SELECT balance FROM users WHERE id='gift'").get().balance,100);db.close();
});

test('customer and unlocked Admin join one service; newly minted code redeems exactly once even after customer quits',async t=>{
 const directory=await temporary(t),shared=path.join(directory,'Stelex GPT');await mkdir(path.join(shared,'server'),{recursive:true});
 const env={...process.env,STELEX_HOST:'127.0.0.1',STELEX_PORT:'0',STELEX_DEMO_MODE:'true'};
 const customer=await connectShared({root:shared,runtime:process.execPath,appRoot:root,env});
 t.after(async()=>{customer.release();try{const record=JSON.parse(await readFile(path.join(shared,'desktop-service-1.8.json')));process.kill(record.pid,'SIGTERM');}catch{}});
 const user=await register(customer.url);assert.equal(user.data.balance,0);assert.equal((await call(customer.url,'/api/admin/stats',{admin:code})).status,401);
 await writeFile(path.join(shared,'server','admin-auth.json'),JSON.stringify({codeHash:hashAdminCode(code)}));
 const admin=await connectShared({root:shared,runtime:process.execPath,appRoot:root,env,admin:true});t.after(()=>admin.release());assert.equal(customer.serviceId,admin.serviceId);assert.equal(customer.url,admin.url);
 const created=await call(admin.url,'/api/admin/keys',{admin:code,body:{credits:123,count:1}});assert.equal(created.status,201,JSON.stringify(created.data));customer.release();
 const redeem=await call(customer.url,'/api/credits/redeem',{cookie:user.cookie,body:{code:created.data.keys[0].code}});assert.equal(redeem.status,200);assert.equal(redeem.data.balance,123);assert.equal((await call(admin.url,'/api/credits/redeem',{cookie:user.cookie,body:{code:created.data.keys[0].code}})).status,400);
});

test('old separate Admin database imports unused codes without resurrecting redeemed keys or overriding customer data',async t=>{
 const dir=await temporary(t),sourceFile=path.join(dir,'old-admin.sqlite');const old=await createApp({dbPath:sourceFile,adminToken:code,demoMode:true});const oldBase=await old.listen(0);const priorUser=await register(oldBase);const keys=(await call(oldBase,'/api/admin/keys',{admin:code,body:{count:2,credits:150}})).data.keys;
 assert.equal((await call(oldBase,'/api/credits/redeem',{cookie:priorUser.cookie,body:{code:keys[0].code}})).status,200);await old.close();
 const customerFile=path.join(dir,'customer.sqlite');const fresh=await createApp({dbPath:customerFile,legacyAdminDb:sourceFile,demoMode:true});t.after(()=>fresh.close());const base=await fresh.listen(0),user=await register(base);
 assert.equal((await call(base,'/api/credits/redeem',{cookie:user.cookie,body:{code:keys[0].code}})).status,400);
 assert.equal((await call(base,'/api/credits/redeem',{cookie:user.cookie,body:{code:keys[1].code}})).data.balance,150);
 assert.equal((await call(base,'/api/credits/redeem',{cookie:user.cookie,body:{code:keys[1].code}})).status,400);
});

test('old default quotas upgrade but customized operator quotas and prices survive',async t=>{
 const dir=await temporary(t),dbFile=path.join(dir,'catalog.sqlite');const first=await createApp({dbPath:dbFile,demoMode:true});const base=await first.listen(0);const catalog=(await call(base,'/api/plans')).data;await first.close();
 catalog.plans.find(p=>p.id==='free').shortLimit=60;catalog.plans.find(p=>p.id==='free').weekLimit=180;catalog.plans.find(p=>p.id==='free').maxOutputTokens=1024;
 catalog.plans.find(p=>p.id==='starter').shortLimit=777;catalog.plans.find(p=>p.id==='starter').weekLimit=7777;catalog.plans.find(p=>p.id==='starter').priceCents=1234;
 const db=new DatabaseSync(dbFile);db.prepare("UPDATE settings SET value=? WHERE key='catalog'").run(JSON.stringify(catalog));db.prepare("DELETE FROM settings WHERE key='quota-defaults-1.4'").run();db.close();
 const next=await createApp({dbPath:dbFile,demoMode:true});t.after(()=>next.close());const actual=(await call(await next.listen(0),'/api/plans')).data;assert.equal(actual.plans.find(p=>p.id==='free').shortLimit,6000);assert.equal(actual.plans.find(p=>p.id==='free').weekLimit,36000);assert.equal(actual.plans.find(p=>p.id==='starter').shortLimit,777);assert.equal(actual.plans.find(p=>p.id==='starter').priceCents,1234);
});
