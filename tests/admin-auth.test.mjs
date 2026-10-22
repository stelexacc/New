import test from 'node:test';
import assert from 'node:assert/strict';
import { adminVerifier, hashAdminCode } from '../server/admin-auth.mjs';
import { createApp } from '../server/app.mjs';
import { Readable } from 'node:stream';

test('owner code is salted, verified, and cannot be bypassed using a legacy token', () => {
  const code = 'test-only-owner-access-code';
  const first = hashAdminCode(code), second = hashAdminCode(code);
  assert.notEqual(first, second);
  assert.equal(first.includes(code), false);
  const verify = adminVerifier({ adminCodeHash:first, adminToken:'legacy-token-must-not-work' });
  for (const attempt of ['', 'wrong-owner-access-code', 'legacy-token-must-not-work', undefined, 'x'.repeat(501)]) assert.equal(verify(attempt), false);
  assert.equal(verify(code), true);
  assert.equal(verify(code), true);
  assert.equal(verify('wrong-after-success'), false);
  assert.equal(adminVerifier({adminEnabled:false,adminCodeHash:first})(code), false);
  assert.equal(adminVerifier()('anything'), false);
  assert.throws(() => adminVerifier({adminCodeHash:'broken'}));
});

function request(app, path, code, method = 'GET') {
  return new Promise(resolve => {
    const req = Readable.from([]);
    Object.assign(req,{url:path,method,headers:{host:'localhost',authorization:`Bearer ${code || ''}`},socket:{remoteAddress:'127.0.0.1'}});
    const response = {headersSent:false,setHeader(){},writeHead(status){this.status=status;this.headersSent=true;},end(body){resolve({status:this.status,body:String(body)});}};
    app.server.emit('request',req,response);
  });
}

test('owner routes require the configured code; public APIs never reveal the hash', async t => {
  const code='test-configured-owner-code';
  const codeHash=hashAdminCode(code);
  const app=await createApp({adminCodeHash:codeHash,adminToken:'legacy-bypass-token',demoMode:true});
  t.after(()=>app.close());
  for(const token of ['', 'wrong-owner-code', 'legacy-bypass-token']) assert.equal((await request(app,'/api/admin/stats',token)).status,401);
  assert.equal((await request(app,'/api/admin/login',code,'POST')).status,200);
  assert.equal((await request(app,'/api/admin/stats',code)).status,200);
  for(const path of ['/api/health','/api/plans']) {
    const result=await request(app,path);
    assert.equal(result.status,200);
    assert.equal(result.body.includes(codeHash),false);
    assert.equal(result.body.includes(code),false);
  }
});

test('customer mode disables both administrator API and static pages even with a valid owner code', async t => {
  const code='test-configured-owner-code';
  const app=await createApp({adminEnabled:false,adminCodeHash:hashAdminCode(code),demoMode:true});
  t.after(()=>app.close());
  for(const path of ['/api/admin/stats','/api/admin/users','/admin','/admin/','/admin/app.js']) assert.equal((await request(app,path,code)).status,404,path);
  assert.equal((await request(app,'/api/admin/login',code,'POST')).status,404);
  assert.equal((await request(app,'/api/health')).status,200);
});
