'use strict';
const { randomBytes, scryptSync, createCipheriv, createDecipheriv } = require('node:crypto');
const ALLOWED = ['app.js', 'index.html', 'styles.css'];
function key(code, salt) {
  if (typeof code !== 'string' || code.length < 16 || code.length > 500) throw new Error('Invalid code.');
  return scryptSync(code, salt, 32, { N:32768, r:8, p:1, maxmem:64*1024*1024 });
}
function validate(value) {
  if (!value || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value.codeHash)) throw new Error('Invalid private configuration.');
  if (!value.files || Object.keys(value.files).length !== ALLOWED.length) throw new Error('Invalid private files.');
  for (const name of ALLOWED) if (typeof value.files[name] !== 'string' || Buffer.byteLength(value.files[name]) > 256*1024) throw new Error('Invalid private file.');
  if (Object.keys(value.files).some(name => !ALLOWED.includes(name))) throw new Error('Unexpected private file.');
  if(value.signingPrivateKey!==undefined && (typeof value.signingPrivateKey!=='string'||value.signingPrivateKey.length>4096||!value.signingPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----')))throw new Error('Invalid signing key.');
  return value;
}
function seal(value, code) {
  validate(value);
  const salt=randomBytes(16), iv=randomBytes(12), derived=key(code,salt);
  try {
    const cipher=createCipheriv('aes-256-gcm',derived,iv);
    const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return { version:1, salt:salt.toString('hex'), iv:iv.toString('hex'), tag:cipher.getAuthTag().toString('hex'), data:data.toString('base64') };
  } finally { derived.fill(0); }
}
function open(value, code) {
  if (!value || value.version!==1 || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{24}$/.test(value.iv) || !/^[a-f0-9]{32}$/.test(value.tag) || typeof value.data!=='string' || value.data.length>1024*1024) throw new Error('Invalid encrypted bundle.');
  const derived=key(code,Buffer.from(value.salt,'hex'));
  try {
    const decipher=createDecipheriv('aes-256-gcm',derived,Buffer.from(value.iv,'hex'));
    decipher.setAuthTag(Buffer.from(value.tag,'hex'));
    const plain=Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]);
    try { return validate(JSON.parse(plain.toString('utf8'))); } finally { plain.fill(0); }
  } finally { derived.fill(0); }
}
module.exports={seal,open};
