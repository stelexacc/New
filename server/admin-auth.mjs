import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashAdminCode(code) {
  if (typeof code !== 'string' || code.length < 16 || code.length > 500) throw new Error('Admin code must contain 16–500 characters.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(code, salt, 64).toString('hex')}`;
}

export function adminVerifier({ adminToken, adminCodeHash, adminEnabled = true } = {}) {
  if (!adminEnabled) return () => false;
  let cached;
  let salt, expected;
  if (adminCodeHash) {
    const match = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(adminCodeHash);
    if (!match) throw new Error('Invalid administrator code hash.');
    salt = match[1]; expected = Buffer.from(match[2], 'hex');
  } else if (adminToken) cached = createHash('sha256').update(adminToken).digest();
  return code => {
    if (typeof code !== 'string' || !code || code.length > 500) return false;
    const digest = createHash('sha256').update(code).digest();
    if (cached && timingSafeEqual(cached, digest)) return true;
    if (!expected || !timingSafeEqual(scryptSync(code, salt, 64), expected)) return false;
    cached = digest;
    return true;
  };
}
