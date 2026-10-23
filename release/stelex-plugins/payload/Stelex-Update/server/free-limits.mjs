// Successful Free responses have their own persistent budget, separate from tokens/credits.
export function createFreeLimits(db,{now=Date.now}={}) {
 db.exec(`CREATE TABLE IF NOT EXISTS free_message_windows(userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,shortUsed INTEGER NOT NULL DEFAULT 0,shortReset INTEGER NOT NULL,weekUsed INTEGER NOT NULL DEFAULT 0,weekReset INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS free_message_pending(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,shortReset INTEGER NOT NULL,weekReset INTEGER NOT NULL);`);
 const limits=plan=>({short:plan.freeShortMessages??10,week:plan.freeWeekMessages??30});
 function window(id){
  const time=now();let row=db.prepare('SELECT * FROM free_message_windows WHERE userId=?').get(id);
  if(!row){db.prepare('INSERT INTO free_message_windows VALUES(?,0,?,0,?)').run(id,time+18000000,time+604800000);row=db.prepare('SELECT * FROM free_message_windows WHERE userId=?').get(id);}
  if(row.shortReset<=time){row.shortUsed=0;row.shortReset=time+18000000;}
  if(row.weekReset<=time){row.weekUsed=0;row.weekReset=time+604800000;}
  db.prepare('UPDATE free_message_windows SET shortUsed=?,shortReset=?,weekUsed=?,weekReset=? WHERE userId=?').run(row.shortUsed,row.shortReset,row.weekUsed,row.weekReset,id);return row;
 }
 function release(id){const p=db.prepare('SELECT * FROM free_message_pending WHERE id=?').get(id);if(!p)return;
  db.prepare('UPDATE free_message_windows SET shortUsed=CASE WHEN shortReset=? THEN MAX(0,shortUsed-1) ELSE shortUsed END,weekUsed=CASE WHEN weekReset=? THEN MAX(0,weekUsed-1) ELSE weekUsed END WHERE userId=?').run(p.shortReset,p.weekReset,p.userId);
  db.prepare('DELETE FROM free_message_pending WHERE id=?').run(id);
 }
 // Called under the application's single-database lock; recover interrupted generations.
 db.exec('BEGIN IMMEDIATE');try{for(const p of db.prepare('SELECT id FROM free_message_pending').all())release(p.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 return {
  state(id,plan){if(plan.id!=='free')return null;const w=window(id),l=limits(plan);const part=k=>({used:w[k+'Used'],limit:l[k],remaining:Math.max(0,l[k]-w[k+'Used']),resetAt:new Date(w[k+'Reset']).toISOString()});return {short:part('short'),week:part('week')};},
  reserve(id,plan,requestId){if(plan.id!=='free')return;const w=window(id),l=limits(plan);const blocked=['short','week'].filter(k=>w[k+'Used']>=l[k]);
   if(blocked.length){const reset=Math.max(...blocked.map(k=>w[k+'Reset']));throw Object.assign(new Error('Free-Limit erreicht. Wieder verfügbar ab '+new Date(reset).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})+' (Europe/Berlin).'),{status:429,code:'FREE_MESSAGE_LIMIT',retryAfter:Math.max(1,Math.ceil((reset-now())/1000)),resetAt:new Date(reset).toISOString()});}
   db.prepare('UPDATE free_message_windows SET shortUsed=shortUsed+1,weekUsed=weekUsed+1 WHERE userId=?').run(id);
   db.prepare('INSERT INTO free_message_pending VALUES(?,?,?,?)').run(requestId,id,w.shortReset,w.weekReset);
  },
  commit(id){db.prepare('DELETE FROM free_message_pending WHERE id=?').run(id);},release
 };
}
