import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
test('catalog migration preserves populated FK graph and supports future app records',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("migration test")}}',d1Databases:['DB']}));
  try{
    const db=await mf.getD1Database('DB');
    const statements=async(file:string)=>(await readFile('migrations/'+file,'utf8')).split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s));
    await db.batch(await statements('0001_accounts.sql'));
    await db.batch([
      db.prepare("INSERT INTO accounts(subject,display_name,default_app,created_at,updated_at) VALUES('owner','Kept','cloze',1,2)"),
      db.prepare("INSERT INTO entries(id,subject,app,kind,title,content,pinned,revision,created_at,updated_at) VALUES('item','owner','cadavre','poem','Keep this','{}',1,3,1,2)"),
      db.prepare("INSERT INTO model_runs(id,subject,app,entry_id,model,completed_at) VALUES('run','owner','cadavre','item','test/model',2)"),
      db.prepare("INSERT INTO reflections(subject,state,attempt_id,requested_at,model,source_revision,source_json,text) VALUES('owner','complete','attempt',2,'test/model',3,'[]','historical text')"),
      db.prepare("INSERT INTO entry_events(id,subject,entry_id,revision,action,at) VALUES('event','owner','item',3,'pinned',2)"),
    ]);
    const tables=['accounts','entries','entry_events','model_runs','reflections'];
    const before=await Promise.all(tables.map(table=>db.prepare('SELECT * FROM '+table).all()));
    await db.batch(await statements('0002_application_catalog.sql'));
    for(let i=0;i<tables.length;i++)assert.deepEqual((await db.prepare('SELECT * FROM '+tables[i]).all()).results,before[i].results);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
    await db.prepare("UPDATE accounts SET default_app='all' WHERE subject='owner'").run();
    await db.prepare("INSERT INTO entries(id,subject,app,kind,title,content,created_at,updated_at) VALUES('future','owner','future-tool','artifact','Future artifact','{}',3,3)").run();
    await db.prepare("DELETE FROM accounts WHERE subject='owner'").run();
    for(const table of tables)assert.deepEqual((await db.prepare('SELECT * FROM '+table).all()).results,[]);
  }finally{await mf.dispose();}
});
