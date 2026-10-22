import {randomUUID} from 'node:crypto';
export function migrateWelcomeGift(db){
  if(db.prepare("SELECT 1 FROM settings WHERE key='welcome-gift-removal-1.4'").get())return;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const user of db.prepare("SELECT u.id,u.balance,SUM(l.credits) gift FROM users u JOIN ledger l ON u.id=l.userId WHERE l.type='welcome' GROUP BY u.id HAVING SUM(l.credits)=500").all()){
      const spent=db.prepare("SELECT COALESCE(SUM(-credits),0) spent FROM ledger WHERE userId=? AND credits<0 AND type='usage'").get(user.id).spent;
      const remove=Math.min(user.balance,Math.max(0,user.gift-spent));if(!remove)continue;
      db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(remove,user.id);
      db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(),user.id,'welcome-correction',-remove,user.balance-remove,new Date().toISOString(),'Unspent legacy signup gift removed; purchased credits preserved');
    }
    db.prepare("INSERT INTO settings VALUES('welcome-gift-removal-1.4','true')").run();db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
