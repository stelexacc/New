import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

const ADMIN='prompt-settings-test-admin';
async function fixture(t,options={}) {
  const calls=[];
  const app=await createApp({adminToken:ADMIN,initialCredits:10000,quotasEnabled:false,demoMode:false,aiBaseUrl:'http://127.0.0.1:11434/v1',models:[{id:'local-coder',name:'Coding model',upstreamModel:'qwen3.5-abliterated:9b'}],fetchImpl:async (url,init) => {
    if(url.endsWith('/models'))return Response.json({data:[]});
    const body=JSON.parse(init.body);calls.push(body);
    const input=body.messages.reduce((sum,item)=>sum+Math.ceil(item.content.length/4),0);
    return Response.json({choices:[{message:{content:'Provider reply.'}}],usage:{prompt_tokens:input,completion_tokens:10}});
  },...options});
  const base=await app.listen(0);t.after(()=>app.close());
  const request=async (path,{method='GET',body,cookie,admin=false}={}) => {
    const response=await fetch(base+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:`Bearer ${ADMIN}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const register=async()=>{const result=await request('/api/auth/register',{method:'POST',body:{email:`${randomUUID()}@test.invalid`,name:'Prompt tester',password:'test-long-password'}});assert.equal(result.status,200);return result;};
  const chat=(session,body={})=>request('/api/chat',{method:'POST',cookie:session.cookie,body:{message:'Test my settings',model:'local-coder',language:'en',...body}});
  return {app,request,register,chat,calls};
}

test('account instructions persist, are sent to the actual configured model and increase measured consumption',async t=>{
  const f=await fixture(t);const session=await f.register();
  assert.equal((await f.request('/api/preferences')).status,401);
  assert.deepEqual((await f.request('/api/preferences',{cookie:session.cookie})).data,{instructions:'',additionalPrompt:''});
  const plain=await f.chat(session);assert.equal(plain.status,200);
  const preferences={instructions:'Use short German examples. '+ 'Concrete detail. '.repeat(40),additionalPrompt:'Style extension: write as a workshop mentor.'};
  const saved=await f.request('/api/preferences',{method:'PUT',cookie:session.cookie,body:preferences});assert.equal(saved.status,200);assert.deepEqual(saved.data,preferences);
  const customized=await f.chat(session);assert.equal(customized.status,200,JSON.stringify(customized.data));
  assert.equal(f.calls[1].model,'qwen3.5-abliterated:9b');
  assert.ok(f.calls[1].messages[0].content.includes(preferences.instructions));assert.ok(f.calls[1].messages[0].content.includes(preferences.additionalPrompt));
  assert.match(f.calls[1].messages[0].content,/Reply in English/);
  assert.ok(customized.data.creditsCharged>plain.data.creditsCharged);
  assert.deepEqual((await f.request('/api/preferences',{cookie:session.cookie})).data,preferences);
});

test('chat overrides are scoped, survive reload, affect next reply and can return to account inheritance',async t=>{
  const f=await fixture(t);const a=await f.register();const b=await f.register();
  const defaults={instructions:'DEFAULT-ACCOUNT-VOICE',additionalPrompt:'DEFAULT-EXTRA'};
  await f.request('/api/preferences',{method:'PUT',cookie:a.cookie,body:defaults});
  const override={override:true,instructions:'THIS-CHAT-ONLY',additionalPrompt:'CHAT-EXTENSION'};
  const first=await f.chat(a,{promptSettings:override});assert.equal(first.status,200);
  const path=`/api/conversations/${first.data.conversationId}/instructions`;
  assert.deepEqual(first.data.promptSettings,override);
  assert.deepEqual((await f.request(path,{cookie:a.cookie})).data,override);
  assert.deepEqual((await f.request(`/api/conversations/${first.data.conversationId}`,{cookie:a.cookie})).data.promptSettings,override);
  assert.equal((await f.request(path,{cookie:b.cookie})).status,404);
  assert.equal((await f.request(path,{method:'PATCH',cookie:b.cookie,body:{override:false}})).status,404);
  await f.chat(a,{conversationId:first.data.conversationId,message:'Next message'});
  assert.match(f.calls[1].messages[0].content,/THIS-CHAT-ONLY/);assert.ok(!f.calls[1].messages[0].content.includes(defaults.instructions));
  const updated={...override,instructions:'EDITED-CHAT-VOICE'};
  assert.equal((await f.request(path,{method:'PATCH',cookie:a.cookie,body:updated})).status,200);
  await f.chat(a,{conversationId:first.data.conversationId,message:'After edit'});assert.match(f.calls[2].messages[0].content,/EDITED-CHAT-VOICE/);
  const reset=await f.request(path,{method:'PATCH',cookie:a.cookie,body:{override:false}});assert.deepEqual(reset.data,{...defaults,override:false});
  await f.chat(a,{conversationId:first.data.conversationId,message:'Inherited again'});assert.match(f.calls[3].messages[0].content,/DEFAULT-ACCOUNT-VOICE/);
  await f.chat(b);assert.ok(!f.calls[4].messages[0].content.includes(defaults.instructions));
  await f.request(`/api/conversations/${first.data.conversationId}`,{method:'DELETE',cookie:a.cookie});
  assert.equal(f.app.db.prepare('SELECT COUNT(*) count FROM conversation_instructions WHERE conversationId=?').get(first.data.conversationId).count,0);
});

test('an intentionally empty chat override omits personal defaults while preserving operator base and language',async t=>{
  const f=await fixture(t);const session=await f.register();
  await f.request('/api/preferences',{method:'PUT',cookie:session.cookie,body:{instructions:'ACCOUNT-DEFAULT-EXCLUDED',additionalPrompt:'OTHER-EXCLUDED'}});
  const result=await f.chat(session,{language:'de',promptSettings:{override:true,instructions:'',additionalPrompt:''}});assert.equal(result.status,200);
  assert.match(f.calls[0].messages[0].content,/Stelex GPT/);assert.match(f.calls[0].messages[0].content,/Reply in German/);
  assert.ok(!f.calls[0].messages[0].content.includes('EXCLUDED'));
});

test('completed retries keep original prompt snapshot after saved instructions change; explicit request edits conflict',async t=>{
  const f=await fixture(t);const session=await f.register();const requestId=randomUUID();
  await f.request('/api/preferences',{method:'PUT',cookie:session.cookie,body:{instructions:'FIRST-SNAPSHOT',additionalPrompt:''}});
  const first=await f.chat(session,{requestId});assert.equal(first.status,200);
  const snapshot=f.app.db.prepare('SELECT promptHash FROM chat_requests WHERE requestId=?').get(requestId).promptHash;assert.match(snapshot,/^[a-f0-9]{64}$/);
  await f.request('/api/preferences',{method:'PUT',cookie:session.cookie,body:{instructions:'CHANGED-SAVED-DEFAULT',additionalPrompt:''}});
  await f.request('/api/admin/ai-settings',{method:'PUT',admin:true,body:{systemPrompt:'Changed operator base.'}});
  const retried=await f.chat(session,{requestId});assert.deepEqual(retried.data,first.data);assert.equal(f.calls.length,1);
  assert.equal(f.app.db.prepare('SELECT promptHash FROM chat_requests WHERE requestId=?').get(requestId).promptHash,snapshot);
  const explicitId=randomUUID();const promptSettings={override:true,instructions:'explicit input',additionalPrompt:''};
  assert.equal((await f.chat(session,{requestId:explicitId,promptSettings})).status,200);
  const conflict=await f.chat(session,{requestId:explicitId,promptSettings:{...promptSettings,instructions:'changed explicit input'}});
  assert.equal(conflict.status,409);assert.equal(conflict.data.code,'REQUEST_ID_REUSED');assert.equal(f.calls.length,2);
});

test('invalid custom prompts never call the provider, change saved values or charge usage',async t=>{
  const f=await fixture(t);const session=await f.register();const initial=(await f.request('/api/me',{cookie:session.cookie})).data;
  for(const preferences of [{instructions:'x'.repeat(8001),additionalPrompt:''},{instructions:123,additionalPrompt:''},{instructions:'',additionalPrompt:null}]) {
    assert.equal((await f.request('/api/preferences',{method:'PUT',cookie:session.cookie,body:preferences})).status,400);
  }
  for(const promptSettings of [{override:true,instructions:'x'.repeat(8001),additionalPrompt:''},{override:'yes',instructions:'',additionalPrompt:''},{instructions:'',additionalPrompt:''}]) {
    const invalid=await f.chat(session,{promptSettings});assert.equal(invalid.status,400);assert.equal(invalid.data.code,'INVALID_PROMPT_SETTINGS');
  }
  assert.equal(f.calls.length,0);const after=(await f.request('/api/me',{cookie:session.cookie})).data;assert.equal(after.balance,initial.balance);assert.equal(after.usage.responses,0);
  assert.deepEqual((await f.request('/api/preferences',{cookie:session.cookie})).data,{instructions:'',additionalPrompt:''});
});

test('global prompt editor requires admin, reports actual model safely, persists across restart and excludes prompt text from audit',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'stelex-prompt-settings-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const dbPath=join(directory,'app.sqlite');
  const f=await fixture(t,{dbPath,aiApiKey:'SECRET-PROVIDER-KEY'});const session=await f.register();
  assert.equal((await f.request('/api/admin/ai-settings',{cookie:session.cookie})).status,401);
  const before=await f.request('/api/admin/ai-settings',{admin:true});assert.equal(before.status,200);assert.match(before.data.defaultSystemPrompt,/Stelex GPT/);
  assert.equal(before.data.provider.models[0].configuredModel,'qwen3.5-abliterated:9b');assert.ok(!JSON.stringify(before.data).includes('SECRET-PROVIDER-KEY'));
  for(const systemPrompt of ['', 'x'.repeat(16001),false])assert.equal((await f.request('/api/admin/ai-settings',{method:'PUT',admin:true,body:{systemPrompt}})).status,400);
  const operator='OPERATOR-PROMPT-SECRET-STYLE';const preferences={instructions:'PERSONAL-PROMPT-NOT-AUDITED',additionalPrompt:'EXTRA-PROMPT-NOT-AUDITED'};
  assert.equal((await f.request('/api/admin/ai-settings',{method:'PUT',admin:true,body:{systemPrompt:operator}})).status,200);
  await f.request('/api/preferences',{method:'PUT',cookie:session.cookie,body:preferences});
  const chat=await f.chat(session,{promptSettings:{override:true,instructions:'SAVED-CHAT-OVERRIDE',additionalPrompt:''}});assert.equal(chat.status,200);assert.ok(f.calls[0].messages[0].content.startsWith(operator));
  const audit=await f.request('/api/admin/events',{admin:true});for(const value of [operator,preferences.instructions,preferences.additionalPrompt,'SAVED-CHAT-OVERRIDE'])assert.ok(!JSON.stringify(audit.data).includes(value));
  await f.app.close();const reopened=await fixture(t,{dbPath});
  assert.equal((await reopened.request('/api/admin/ai-settings',{admin:true})).data.systemPrompt,operator);
  assert.deepEqual((await reopened.request('/api/preferences',{cookie:session.cookie})).data,preferences);
  assert.deepEqual((await reopened.request(`/api/conversations/${chat.data.conversationId}/instructions`,{cookie:session.cookie})).data,{override:true,instructions:'SAVED-CHAT-OVERRIDE',additionalPrompt:''});
});

test('editing chat instructions during generation is rejected so completion cannot replace a newer edit',async t=>{
  const started=Promise.withResolvers();const release=Promise.withResolvers();
  const f=await fixture(t,{fetchImpl:async () => {started.resolve();await release.promise;return Response.json({choices:[{message:{content:'Completed reply.'}}],usage:{prompt_tokens:10,completion_tokens:10}});}});
  const session=await f.register();
  const created=await f.request('/api/conversations',{method:'POST',cookie:session.cookie,body:{title:'Concurrent edit'}});assert.equal(created.status,201);
  const conversationId=created.data.conversation.id;
  const requestSettings={override:true,instructions:'Request snapshot',additionalPrompt:''};
  const pending=f.chat(session,{conversationId,promptSettings:requestSettings});await started.promise;
  try {
    const edit=await f.request(`/api/conversations/${conversationId}/instructions`,{method:'PATCH',cookie:session.cookie,body:{override:true,instructions:'Newer edit',additionalPrompt:''}});
    assert.equal(edit.status,409);assert.equal(edit.data.code,'CHAT_BUSY');
  } finally {release.resolve();}
  assert.equal((await pending).status,200);
  const path=`/api/conversations/${conversationId}/instructions`;
  assert.deepEqual((await f.request(path,{cookie:session.cookie})).data,requestSettings);
  const saved=await f.request(path,{method:'PATCH',cookie:session.cookie,body:{override:true,instructions:'Edit after completion',additionalPrompt:''}});
  assert.equal(saved.status,200);assert.equal(saved.data.instructions,'Edit after completion');
});
