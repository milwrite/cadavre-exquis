import { DurableObject } from 'cloudflare:workers';
import { isCailSubject } from '@cuny-ai-lab/cail-identity';
import { APPS, exact, boundedText, entryId, isApp, parseEntry, publicEntry, revision, InputError, type AppId, type EntryRow, type EntryContent } from './contract.ts';

type Profile = {display_name:string; reflection_enabled:number; default_app:AppId; revision:number; work_revision:number; created_at:number};
type Reply = {status:number; json:string};
const ok = (value:unknown, status=200): Reply => ({status,json:JSON.stringify(value)});
const fail = (code:string,message:string,status:number): Reply => ok({error:{code,message}},status);
const summaryColumns = 'id,app,kind,title,pinned,revision,created_at,updated_at';

export class AccountCoordinator extends DurableObject<Env> {
  // Serializes local read/compute/write sequences. The D1 transaction, not this
  // in-memory queue, is the commit authority and survives eviction/restarts.
  private tail: Promise<void> = Promise.resolve();
  private serial<T>(action:()=>Promise<T>): Promise<T> {
    const next = this.tail.then(action);
    this.tail = next.then(()=>undefined,()=>undefined);
    return next;
  }
  async run(subject:string, scope:AppId | null, method:string, path:string, input:unknown, query:string): Promise<Reply> {
    if (!isCailSubject(subject)) return fail('invalid_identity','Sign in with CUNY.',401);
    return this.serial(async () => {
      // Pin the coordinator's identity once. No subject is returned to clients.
      const saved = await this.ctx.storage.get<string>('owner');
      if (saved && saved !== subject) return fail('invalid_identity','Invalid account.',403);
      if (!saved) await this.ctx.storage.put('owner',subject);
      const db = this.env.DB.withSession('first-primary');
      const now = Date.now();
      await db.prepare('INSERT OR IGNORE INTO accounts(subject,created_at,updated_at) VALUES(?,?,?)').bind(subject,now,now).run();
      const profile = await db.prepare('SELECT display_name,reflection_enabled,default_app,revision,work_revision,created_at FROM accounts WHERE subject=?').bind(subject).first<Profile>();
      if (!profile) return fail('storage_unavailable','Your account could not be loaded.',503);
      const bump = () => db.prepare('UPDATE accounts SET work_revision=work_revision+1, updated_at=? WHERE subject=?').bind(now,subject);
      const record = (id:string) => db.prepare(`SELECT * FROM entries WHERE subject=? AND id=?${scope ? ' AND app=?' : ''}`).bind(...(scope ? [subject,id,scope] : [subject,id])).first<EntryRow>();
      try {
        if (path === '/profile' && method === 'GET') return ok({profile:{displayName:profile.display_name,reflectionEnabled:Boolean(profile.reflection_enabled),defaultApp:profile.default_app,revision:profile.revision,createdAt:profile.created_at,signIn:'CUNY'}});
        if (path === '/profile' && method === 'PATCH') {
          const v = exact(input,['displayName','reflectionEnabled','defaultApp','expectedRevision']);
          if (revision(v.expectedRevision) !== profile.revision) return fail('revision_conflict','Settings changed in another tab. Reload before saving.',409);
          if (typeof v.reflectionEnabled !== 'boolean' || !isApp(v.defaultApp)) throw new InputError('Invalid account settings.');
          const name = boundedText(v.displayName,80);
          const statements = [db.prepare('UPDATE accounts SET display_name=?,reflection_enabled=?,default_app=?,revision=revision+1,updated_at=? WHERE subject=? AND revision=?').bind(name,Number(v.reflectionEnabled),v.defaultApp,now,subject,profile.revision)];
          if (!v.reflectionEnabled) statements.push(db.prepare('DELETE FROM reflections WHERE subject=?').bind(subject));
          await db.batch(statements);
          return ok({profile:{displayName:name,reflectionEnabled:v.reflectionEnabled,defaultApp:v.defaultApp,revision:profile.revision+1,createdAt:profile.created_at,signIn:'CUNY'}});
        }
        if (path === '/dashboard' && method === 'GET') {
          const apps: Record<string,unknown> = {};
          for (const app of scope ? [scope] : APPS) {
            const [recent, pinned, count] = await db.batch([
              db.prepare(`SELECT ${summaryColumns} FROM entries WHERE subject=? AND app=? AND pinned=0 ORDER BY updated_at DESC,id DESC LIMIT 5`).bind(subject,app),
              db.prepare(`SELECT ${summaryColumns} FROM entries WHERE subject=? AND app=? AND pinned=1 ORDER BY updated_at DESC,id DESC LIMIT 20`).bind(subject,app),
              db.prepare('SELECT COUNT(*) AS total,SUM(pinned) AS pinned FROM entries WHERE subject=? AND app=?').bind(subject,app),
            ]);
            const totals = count.results[0] as {total:number;pinned:number|null};
            apps[app] = {recent:recent.results.map(r=>publicEntry(r as EntryRow)),pinned:pinned.results.map(r=>publicEntry(r as EntryRow)),total:totals.total,pinnedTotal:totals.pinned || 0};
          }
          const reflection = scope ? null : await db.prepare('SELECT state,model,text,generated_at,source_revision,source_json,failure_code,requested_at FROM reflections WHERE subject=?').bind(subject).first();
          const lastModel = await db.prepare(`SELECT model,app,completed_at FROM model_runs WHERE subject=?${scope ? ' AND app=?' : ''} ORDER BY completed_at DESC,id DESC LIMIT 1`).bind(...(scope ? [subject,scope] : [subject])).first();
          return ok({apps,reflection:reflection ? {...reflection,stale:reflection.source_revision !== profile.work_revision,sources:JSON.parse(String(reflection.source_json)),source_json:undefined} : null,lastModel,reflectionEnabled:Boolean(profile.reflection_enabled)});
        }
        if (path === '/entries' && method === 'GET') {
          const q = new URLSearchParams(query);
          const app = scope || q.get('app');
          if (!isApp(app)) throw new InputError('Select an application.');
          const offset = Number(q.get('offset') || 0);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new InputError('Invalid archive page.');
          const pin = q.get('pinned');
          if (pin !== null && pin !== '1' && pin !== '0') throw new InputError('Invalid pin filter.');
          const clause = pin === null ? '' : ` AND pinned=${pin}`;
          const result = await db.prepare(`SELECT ${summaryColumns} FROM entries WHERE subject=? AND app=?${clause} ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET ?`).bind(subject,app,offset).all<EntryRow>();
          return ok({items:result.results.slice(0,20).map(r=>publicEntry(r)),nextOffset:result.results.length > 20 ? offset+20 : null});
        }
        if (path === '/entries' && method === 'PUT') {
          const value = parseEntry(input,scope || undefined);
          const existing = await record(value.id);
          if (!existing && value.expectedRevision !== 0) return fail('not_found','That saved item is unavailable.',404);
          if (existing && (existing.app !== value.app || existing.revision !== value.expectedRevision)) return fail('revision_conflict','This item changed in another tab. Reopen it before saving.',409);
          // An ID belonging to another owner or app must never be claimed.
          if (!existing && await db.prepare('SELECT 1 FROM entries WHERE id=?').bind(value.id).first()) return fail('not_found','That saved item is unavailable.',404);
          const nextRevision = value.expectedRevision + 1;
          const content = JSON.stringify(value.content);
          if (new TextEncoder().encode(content).length > 192000) throw new InputError('The saved item is too large.');
          const write = existing
            ? db.prepare('UPDATE entries SET title=?,content=?,revision=revision+1,updated_at=? WHERE subject=? AND app=? AND id=? AND revision=?').bind(value.title,content,now,subject,value.app,value.id,value.expectedRevision)
            : db.prepare('INSERT INTO entries(id,subject,app,kind,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(value.id,subject,value.app,value.kind,value.title,content,now,now);
          await db.batch([write,bump(),db.prepare('INSERT INTO entry_events(id,subject,entry_id,revision,action,at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),subject,value.id,nextRevision,existing?'updated':'created',now)]);
          return ok({item:publicEntry((await record(value.id))!,true)},existing ? 200:201);
        }
        const match = /^\/entries\/([0-9a-f-]+)(\/pin)?$/.exec(path);
        if (match) {
          const id = entryId(match[1]);
          const item = await record(id);
          if (!item) return fail('not_found','That saved item is unavailable.',404);
          if (method === 'GET' && !match[2]) {
            const events = await db.prepare('SELECT revision,action,at FROM entry_events WHERE subject=? AND entry_id=? ORDER BY revision DESC LIMIT 20').bind(subject,id).all();
            return ok({item:publicEntry(item,true),events:events.results});
          }
          const v = exact(input,match[2] ? ['pinned','expectedRevision'] : ['expectedRevision']);
          if (revision(v.expectedRevision) !== item.revision) return fail('revision_conflict','This item changed in another tab. Reopen it before changing it.',409);
          if (match[2] && method === 'PATCH') {
            if (typeof v.pinned !== 'boolean') throw new InputError('Invalid pin setting.');
            await db.batch([
              db.prepare('UPDATE entries SET pinned=?,revision=revision+1,updated_at=? WHERE subject=? AND id=? AND revision=?').bind(Number(v.pinned),now,subject,id,item.revision),
              bump(),db.prepare('INSERT INTO entry_events(id,subject,entry_id,revision,action,at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),subject,id,item.revision+1,v.pinned?'pinned':'unpinned',now),
            ]);
            return ok({item:publicEntry((await record(id))!,true)});
          }
          if (!match[2] && method === 'DELETE') {
            // Remove derived text too: a deleted contribution must not survive
            // inside a previously generated synthesis or a late completion.
            await db.batch([db.prepare('DELETE FROM entries WHERE subject=? AND id=? AND revision=?').bind(subject,id,item.revision),db.prepare('DELETE FROM model_runs WHERE subject=? AND entry_id=?').bind(subject,id),db.prepare('DELETE FROM reflections WHERE subject=?').bind(subject),bump()]);
            return ok({deleted:true});
          }
        }
        if (path === '/export' && method === 'GET') {
          const size = await db.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(content AS BLOB))),0) AS bytes FROM entries WHERE subject=?${scope ? ' AND app=?' : ''}`).bind(...(scope ? [subject,scope] : [subject])).first<{n:number;bytes:number}>();
          if (!size || size.n > 1000 || size.bytes > 8000000) return fail('export_too_large','This workspace exceeds the single-download limit. Export individual items from the archive.',413);
          const entries = await db.prepare(`SELECT * FROM entries WHERE subject=?${scope ? ' AND app=?' : ''} ORDER BY created_at,id LIMIT 1001`).bind(...(scope ? [subject,scope] : [subject])).all<EntryRow>();
          // Bound export; callers can page the archive for unusually large accounts.
          if (entries.results.length > 1000) return fail('export_too_large','Export individual items from the archive.',413);
          return ok({schemaVersion:1,exportedAt:now,profile:{displayName:profile.display_name,reflectionEnabled:Boolean(profile.reflection_enabled),defaultApp:profile.default_app},entries:entries.results.map(r=>publicEntry(r,true))});
        }
        if (path === '/account-data' && method === 'DELETE' && scope === null) {
          const v = exact(input,['confirmation']);
          if (v.confirmation !== 'DELETE MY WORK') throw new InputError('Type DELETE MY WORK to confirm.');
          await db.prepare('DELETE FROM accounts WHERE subject=?').bind(subject).run();
          return ok({deleted:true});
        }
        return fail('not_found','No such account operation.',404);
      } catch (error) {
        if (error instanceof InputError) return fail('invalid_request',error.message,400);
        // Raw SQL, identities and private content never enter logs or errors.
        console.error(JSON.stringify({event:'accounts.storage.failed'}));
        return fail('storage_unavailable','Your work could not be saved. Try again.',503);
      }
    });
  }
  async modelCompleted(subject:string, app:AppId, model:string, id:string|null,generation:number): Promise<boolean> {
    return this.serial(async()=>{
      if (!isCailSubject(subject) || !isApp(app)) throw new InputError('Invalid model record.');
      boundedText(model,180,true);
      if (id) entryId(id);
      const db = this.env.DB.withSession('first-primary');
      const now = Date.now();
      const profile=await db.prepare('SELECT created_at FROM accounts WHERE subject=?').bind(subject).first<{created_at:number}>();
      if(!profile || profile.created_at!==generation)return false;
      await db.batch([
        db.prepare('INSERT INTO model_runs(id,subject,app,entry_id,model,completed_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),subject,app,id,model,now),
        db.prepare('UPDATE accounts SET work_revision=work_revision+1 WHERE subject=?').bind(subject),
      ]);
      return true;
    });
  }
  async prepareReflection(subject:string): Promise<Reply> {
    return this.serial(async()=>{
      const db = this.env.DB.withSession('first-primary');
      const profile = await db.prepare('SELECT reflection_enabled,work_revision FROM accounts WHERE subject=?').bind(subject).first<Profile>();
      if (!profile?.reflection_enabled) return fail('reflection_disabled','Enable reflections in settings first.',403);
      const prior = await db.prepare('SELECT state,requested_at FROM reflections WHERE subject=?').bind(subject).first<{state:string;requested_at:number}>();
      if (prior && Date.now()-prior.requested_at < 60000) return fail('reflection_busy','Wait a minute before requesting another reflection.',429);
      const last = await db.prepare('SELECT model FROM model_runs WHERE subject=? ORDER BY completed_at DESC,id DESC LIMIT 1').bind(subject).first<{model:string}>();
      if (!last) return fail('model_missing','Complete a model turn before asking for a reflection.',409);
      const items = await db.prepare('SELECT * FROM entries WHERE subject=? ORDER BY updated_at DESC,id DESC LIMIT 5').bind(subject).all<EntryRow>();
      if (!items.results.length) return fail('work_missing','Save some work before asking for a reflection.',409);
      const sources = items.results.map(r=>({id:r.id,app:r.app,title:r.title,revision:r.revision}));
      const contributions = items.results.map(r=>{
        const c = JSON.parse(r.content) as EntryContent;
        return {title:r.title,app:r.app,contributions:c.contributions.filter(m=>m.role==='user').slice(-20).map(m=>m.content.slice(0,1000)),text:c.text.slice(0,2000)};
      });
      const attempt = crypto.randomUUID();
      await db.prepare(`INSERT INTO reflections(subject,state,attempt_id,requested_at,model,source_revision,source_json) VALUES(?,'pending',?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET state='pending',attempt_id=excluded.attempt_id,requested_at=excluded.requested_at,failure_code=NULL`).bind(subject,attempt,Date.now(),last.model,profile.work_revision,JSON.stringify(sources)).run();
      return ok({attempt,model:last.model,sourceRevision:profile.work_revision,sources,contributions});
    });
  }
  async finishReflection(subject:string, attempt:string, plan:{model:string;sourceRevision:number;sources:unknown}, text:string|null): Promise<Reply> {
    return this.serial(async()=>{
      const db = this.env.DB.withSession('first-primary');
      const profile = await db.prepare('SELECT work_revision,reflection_enabled FROM accounts WHERE subject=?').bind(subject).first<Profile>();
      if (!profile?.reflection_enabled) return fail('reflection_cancelled','The reflection was cancelled.',409);
      const stale = profile.work_revision !== plan.sourceRevision;
      if (text && !stale) {
        const changed = await db.prepare("UPDATE reflections SET state='complete',model=?,source_revision=?,source_json=?,text=?,generated_at=?,failure_code=NULL WHERE subject=? AND attempt_id=?").bind(plan.model,plan.sourceRevision,JSON.stringify(plan.sources),text,Date.now(),subject,attempt).run();
        return changed.meta.changes ? ok({completed:true}) : fail('reflection_cancelled','The reflection was cancelled.',409);
      }
      await db.prepare("UPDATE reflections SET state='failed',failure_code=? WHERE subject=? AND attempt_id=?").bind(stale?'work_changed':'model_unavailable',subject,attempt).run();
      return fail(stale?'work_changed':'model_unavailable',stale?'Your work changed during the reflection. Request a fresh one.':'The most recently used model could not complete the reflection. Your previous reflection is kept.',stale?409:502);
    });
  }
}
