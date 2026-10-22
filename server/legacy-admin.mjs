import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
export function importLegacyAdmin(db,file){
 if(!file||!existsSync(file)||db.prepare("SELECT 1 FROM settings WHERE key='legacy-admin-codes-1.4'").get())return;
 const source=new DatabaseSync(file,{readOnly:true});
 try{
  const columns=source.prepare('PRAGMA table_info(credit_keys)').all().map(c=>c.name);if(!columns.length)return;
  const keys=source.prepare('SELECT * FROM credit_keys').all();
  db.exec('BEGIN IMMEDIATE');try{
   const insert=db.prepare('INSERT OR IGNORE INTO credit_keys(id,codeHash,credits,note,createdAt,redeemedAt,redeemedBy,type,planId,durationDays) VALUES(?,?,?,?,?,?,?,?,?,?)');
   for(const key of keys){if(key.redeemedAt)continue;insert.run(key.id,key.codeHash,key.credits,key.note||'',key.createdAt,null,null,key.type||'credits',key.planId||null,key.durationDays||null);}
   db.prepare("INSERT INTO settings VALUES('legacy-admin-codes-1.4','true')").run();db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }finally{source.close();}
}
