import { randomUUID } from 'node:crypto';

const HOUR = 3_600_000;
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const rows = [
  ['free', 'Free Trial', 0, 6000, 36000, 0, 'low', 1536, 0, 'Kostenlos kennenlernen', ['Basis-Modell', 'Schneller Antwortmodus', 'Großzügige erneuerbare Kontingente']],
  ['starter', 'Starter', 799, 30000, 150000, 1, 'low', 2048, 1, 'Für deine täglichen Ideen', ['Mehr Kontingent', 'Schnelle Modelle bis Stufe 1', 'Längere Antworten']],
  ['pro', 'Pro', 1499, 90000, 500000, 2, 'medium', 4096, 2, 'Mehr Raum für große Projekte', ['Modelle bis Stufe 2', 'Mittlere Denktiefe bei unterstützten Modellen', '4.096 Ausgabetokens']],
  ['max', 'Max', 2999, 225000, 1400000, 3, 'high', 8192, 3, 'Für intensive Arbeit', ['Alle konfigurierten Modellstufen', 'Hohe Denktiefe bei unterstützten Modellen', '8.192 Ausgabetokens']],
];
export const DEFAULT_PLANS = rows.map(([id,name,priceCents,shortLimit,weekLimit,modelTier,reasoningEffort,maxOutputTokens,priority,description,features]) => ({id,name,priceCents,currency:'EUR',durationDays:30,shortLimit,shortWindowHours:5,weekLimit,weekWindowHours:168,modelTier,reasoningEffort,maxOutputTokens,priority,description,features}));
export const DEFAULT_PACKS = [[5,1000],[10,2200],[20,5000],[30,8000],[50,15000],[75,24000],[100,35000]].map(([euros,credits])=>({id:`credits-${euros}`,name:`${euros} € Credits`,credits,priceCents:euros*100,currency:'EUR'}));

export function validateCatalog(value) {
  if (!value || !Array.isArray(value.plans) || value.plans.length !== 4 || !Array.isArray(value.creditPacks) || value.creditPacks.length > 20) return false;
  const ids = new Set();
  for (const plan of value.plans) {
    if (!plan || !['free','starter','pro','max'].includes(plan.id) || ids.has(plan.id) || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 60 || plan.currency !== 'EUR' || !integer(plan.priceCents,0,1_000_000) || !integer(plan.durationDays,1,366) || !integer(plan.shortLimit,1,100_000_000) || !integer(plan.weekLimit,1,100_000_000) || !finite(plan.shortWindowHours,0.0166666667,8760) || !finite(plan.weekWindowHours,0.0166666667,8760) || plan.weekWindowHours < plan.shortWindowHours || !integer(plan.modelTier,0,3) || !['low','medium','high'].includes(plan.reasoningEffort) || !integer(plan.maxOutputTokens,128,32768) || !integer(plan.priority,0,10) || typeof plan.description !== 'string' || plan.description.length > 240 || !Array.isArray(plan.features) || plan.features.length > 12 || plan.features.some(f => typeof f !== 'string' || f.length > 160)) return false;
    if (plan.id === 'free' && plan.priceCents !== 0 || plan.id !== 'free' && plan.durationDays !== 30) return false;
    ids.add(plan.id);
  }
  ids.clear();
  for (const pack of value.creditPacks) {
    if (!pack || typeof pack.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(pack.id) || ids.has(pack.id) || typeof pack.name !== 'string' || !pack.name.trim() || pack.name.length > 60 || !integer(pack.credits,1,1_000_000_000) || !integer(pack.priceCents,0,1_000_000) || pack.currency !== 'EUR') return false;
    ids.add(pack.id);
  }
  return true;
}

export function initializePlans(db) {
  const addColumn = (table, name, definition) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  addColumn('users','planId',"TEXT NOT NULL DEFAULT 'free'");
  addColumn('users','planExpiresAt','INTEGER');
  addColumn('users','emailVerified','INTEGER NOT NULL DEFAULT 0');
  addColumn('credit_keys','type',"TEXT NOT NULL DEFAULT 'credits'");
  addColumn('credit_keys','planId','TEXT');
  addColumn('credit_keys','durationDays','INTEGER');
  addColumn('reservations','quotaUnits','INTEGER NOT NULL DEFAULT 0');
  addColumn('reservations','shortReset','INTEGER');
  addColumn('reservations','weekReset','INTEGER');
  addColumn('usage','includedUnits','INTEGER NOT NULL DEFAULT 0');
  addColumn('usage','weightedUnits','INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_grants (requestId TEXT PRIMARY KEY,inputHash TEXT NOT NULL,response TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quota_windows (userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,shortUsed INTEGER NOT NULL DEFAULT 0,shortReset INTEGER NOT NULL,weekUsed INTEGER NOT NULL DEFAULT 0,weekReset INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY,type TEXT NOT NULL,userId TEXT,email TEXT,createdAt TEXT NOT NULL,details TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS audit_time ON audit_events(createdAt);
    CREATE TABLE IF NOT EXISTS email_verifications (userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,codeHash TEXT NOT NULL,expiresAt INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sentAt INTEGER NOT NULL);`);
  addColumn('quota_windows','shortDuration','INTEGER NOT NULL DEFAULT 18000000');
  addColumn('quota_windows','weekDuration','INTEGER NOT NULL DEFAULT 604800000');
  const saved = db.prepare("SELECT value FROM settings WHERE key='catalog'").get();
  let catalog;
  if (saved) {
    catalog=JSON.parse(saved.value);
    // Rename the old top tier without changing purchased terms or existing codes.
    if (Array.isArray(catalog.plans) && catalog.plans.some(plan=>plan.id==='ultra')) {
      const oldPrices={starter:990,pro:1990,ultra:3990};
      for (const plan of catalog.plans) {
        const previousId=plan.id,wasDefaultPrice=plan.priceCents===oldPrices[previousId];
        if (plan.id==='ultra') {plan.id='max';if(plan.name==='Ultra')plan.name='Max';}
        if (plan.id!=='free')plan.durationDays=30;
        if (wasDefaultPrice) {const next=DEFAULT_PLANS.find(p=>p.id===plan.id);if(next)plan.priceCents=next.priceCents;}
      }
      const oldPacks=[['boost',500,490],['extra',1500,1190],['power',5000,2990]];
      if (Array.isArray(catalog.creditPacks) && catalog.creditPacks.length===3 && oldPacks.every(([id,credits,price])=>catalog.creditPacks.some(p=>p.id===id&&p.credits===credits&&p.priceCents===price))) catalog.creditPacks=structuredClone(DEFAULT_PACKS);
      if (!validateCatalog(catalog)) throw new Error('Stored plan catalog is invalid.');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec("UPDATE users SET planId='max' WHERE planId='ultra';UPDATE credit_keys SET planId='max' WHERE planId='ultra';");
        db.prepare("UPDATE settings SET value=? WHERE key='catalog'").run(JSON.stringify(catalog));
        db.exec('COMMIT');
      } catch(error) {db.exec('ROLLBACK');throw error;}
    }
    if (!db.prepare("SELECT 1 FROM settings WHERE key='quota-defaults-1.4'").get()) {
      const old={free:[60,180],starter:[600,3000],pro:[1800,10000],max:[4500,28000]};
      for(const plan of catalog.plans){const previous=old[plan.id],next=DEFAULT_PLANS.find(p=>p.id===plan.id);if(previous && plan.shortLimit===previous[0] && plan.weekLimit===previous[1]){plan.shortLimit=next.shortLimit;plan.weekLimit=next.weekLimit;if(plan.id==='free' && plan.maxOutputTokens===1024)plan.maxOutputTokens=1536;}}
      db.prepare("UPDATE settings SET value=? WHERE key='catalog'").run(JSON.stringify(catalog));
      db.prepare("INSERT INTO settings VALUES('quota-defaults-1.4','true')").run();
    }
    if (!validateCatalog(catalog)) throw new Error('Stored plan catalog is invalid.');
  }
  else { catalog = {plans:DEFAULT_PLANS,creditPacks:DEFAULT_PACKS}; db.prepare('INSERT INTO settings VALUES(?,?)').run('catalog',JSON.stringify(catalog)); }
  return {
    get catalog() { return catalog; },
    save(next) { catalog = structuredClone(next); db.prepare("UPDATE settings SET value=? WHERE key='catalog'").run(JSON.stringify(catalog)); },
    effectivePlan(user,now=Date.now()) { const id = user.planExpiresAt && user.planExpiresAt <= now ? 'free' : user.planId; return catalog.plans.find(plan => plan.id === id) || catalog.plans.find(plan => plan.id === 'free'); },
    audit(type,user,details={}) { db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?)').run(randomUUID(),type,user?.id || null,user?.email || null,new Date().toISOString(),JSON.stringify(details)); },
  };
}

export function quotaWindow(db,userId,plan,now=Date.now()) {
  let item = db.prepare('SELECT * FROM quota_windows WHERE userId=?').get(userId);
  const shortDuration = Math.round(plan.shortWindowHours*HOUR),weekDuration = Math.round(plan.weekWindowHours*HOUR);
  if (!item) {
    db.prepare('INSERT INTO quota_windows(userId,shortUsed,shortReset,weekUsed,weekReset,shortDuration,weekDuration) VALUES(?,?,?,?,?,?,?)').run(userId,0,now+shortDuration,0,now+weekDuration,shortDuration,weekDuration);
    item = db.prepare('SELECT * FROM quota_windows WHERE userId=?').get(userId);
  }
  // Configuration changes preserve the current window's start and already consumed units.
  // Outstanding reservations follow a changed deadline so a later refund remains exact.
  for (const [kind,duration] of [['short',shortDuration],['week',weekDuration]]) {
    const resetKey=`${kind}Reset`,durationKey=`${kind}Duration`;
    if (item[durationKey] !== duration) {
      const oldReset=item[resetKey];
      const nextReset=oldReset-item[durationKey]+duration;
      item[resetKey]=nextReset;item[durationKey]=duration;
      if (nextReset > now) db.prepare(`UPDATE reservations SET ${resetKey}=? WHERE userId=? AND ${resetKey}=?`).run(nextReset,userId,oldReset);
    }
  }
  // Fixed windows renew on the first request after expiry; unused allowance does not accumulate.
  if (item.shortReset <= now) { item.shortUsed=0; item.shortReset=now+shortDuration; }
  if (item.weekReset <= now) { item.weekUsed=0; item.weekReset=now+weekDuration; }
  db.prepare('UPDATE quota_windows SET shortUsed=?,shortReset=?,weekUsed=?,weekReset=?,shortDuration=?,weekDuration=? WHERE userId=?').run(item.shortUsed,item.shortReset,item.weekUsed,item.weekReset,item.shortDuration,item.weekDuration,userId);
  return item;
}
export function publicQuota(item,plan) {
  const format = (used,limit,reset) => ({limit,used,usedPercent:Math.min(100,Math.round(used/limit*1000)/10),remainingPercent:Math.max(0,Math.round((1-used/limit)*1000)/10),resetAt:new Date(reset).toISOString()});
  return {short:{...format(item.shortUsed,plan.shortLimit,item.shortReset),windowHours:plan.shortWindowHours},week:{...format(item.weekUsed,plan.weekLimit,item.weekReset),windowHours:plan.weekWindowHours}};
}
export function restoreQuota(db,reservation,refund) {
  if (!refund) return;
  db.prepare('UPDATE quota_windows SET shortUsed=CASE WHEN shortReset=? THEN MAX(0,shortUsed-?) ELSE shortUsed END,weekUsed=CASE WHEN weekReset=? THEN MAX(0,weekUsed-?) ELSE weekUsed END WHERE userId=?').run(reservation.shortReset,refund,reservation.weekReset,refund,reservation.userId);
}
