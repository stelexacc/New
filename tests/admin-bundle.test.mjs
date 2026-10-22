import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {hashAdminCode} from '../server/admin-auth.mjs';
const {seal,open}=createRequire(import.meta.url)('../desktop/admin-bundle.cjs');
test('private admin bundle requires the exact code and detects modified ciphertext',()=>{
  const code='test-private-admin-code';
  const data={codeHash:hashAdminCode(code),files:{'index.html':'private html','app.js':'private JavaScript','styles.css':'private CSS'}};
  const sealed=seal(data,code);
  assert.equal(JSON.stringify(sealed).includes(data.codeHash),false);
  assert.equal(JSON.stringify(sealed).includes('private JavaScript'),false);
  assert.deepEqual(open(sealed,code),data);
  assert.throws(()=>open(sealed,'incorrect-test-code'));
  assert.throws(()=>open({...sealed,tag:'0'.repeat(32)},code));
  assert.throws(()=>open({...sealed,data:sealed.data.slice(0,-8)},code));
});
test('only the three expected bounded admin files can be extracted',()=>{
  const code='test-private-admin-code',codeHash=hashAdminCode(code);
  assert.throws(()=>seal({codeHash,files:{'../escape':'x'}},code));
  assert.throws(()=>seal({codeHash,files:{'index.html':'x','app.js':'x','styles.css':'x','other':'x'}},code));
  assert.throws(()=>seal({codeHash,files:{'index.html':'x','app.js':'x'.repeat(256*1024+1),'styles.css':'x'}},code));
});
