// Worker metadata arrives through deployment-controlled service-binding props.
// No product list or application-specific route belongs in the shared service.
export type AppId = string;
export type WorkerManifest = {id:string;worker:string;version:number;name:string;description:string;kind:string;href:string;resumePath:string;workerRoutes?:true};
export const isApp = (value:unknown):value is AppId => typeof value==='string' && /^[a-z][a-z0-9-]{1,62}$/.test(value) && !['all','my-work','work-accounts','gateway','admin','cail-sso'].includes(value);
export function manifest(value:unknown):WorkerManifest {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Missing Worker registration');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['id','worker','version','name','description','kind','href','resumePath','workerRoutes'].includes(k)) || !isApp(v.id) || !Number.isSafeInteger(v.version) || Number(v.version)<1)throw new Error('Invalid Worker registration');
  const text=(key:string,max:number)=>{const value=v[key];if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Invalid Worker metadata');return value;};
  const worker=text('worker',63);
  if(!/^[a-z][a-z0-9-]{1,62}$/.test(worker))throw new Error('Invalid Worker name');
  if(v.workerRoutes!==undefined && v.workerRoutes!==true)throw new Error('Invalid Worker route mode');
  const path=(key:string)=>{const p=text(key,240);if((!v.workerRoutes && !p.startsWith('/'+v.id+'/'))|| !/^\/[a-zA-Z0-9/_-]*$/.test(p)||p.includes('//'))throw new Error('Invalid Worker route');return p;};
  const kind=text('kind',40);if(!/^[a-z][a-z0-9-]*$/.test(kind))throw new Error('Invalid record kind');
  return {id:v.id,worker,version:Number(v.version),name:text('name',80),description:text('description',240),kind,href:path('href'),resumePath:path('resumePath'),...(v.workerRoutes?{workerRoutes:true as const}:{})};
}
export async function registerWorker(db:D1Database,value:unknown) {
  const m=manifest(value), json=JSON.stringify(m);
  const current=await db.withSession('first-primary').prepare('SELECT worker,kind,version,manifest FROM registered_workers WHERE id=?').bind(m.id).first<{worker:string;kind:string;version:number;manifest:string}>();
  if(current){
    if(current.worker!==m.worker || current.kind!==m.kind || (current.version===m.version && current.manifest!==json))throw new Error('Conflicting Worker registration');
    if(current.version>=m.version)return {registered:true,id:m.id,version:current.version};
  }
  // Monotonic manifest versions prevent old serving isolates reverting routes.
  await db.prepare(`INSERT INTO registered_workers(id,worker,kind,version,manifest) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET version=excluded.version,manifest=excluded.manifest
    WHERE registered_workers.worker=excluded.worker AND registered_workers.kind=excluded.kind AND registered_workers.version<excluded.version`).bind(m.id,m.worker,m.kind,m.version,json).run();
  const row=await db.withSession('first-primary').prepare('SELECT worker,kind,version,manifest FROM registered_workers WHERE id=?').bind(m.id).first<{worker:string;kind:string;version:number;manifest:string}>();
  if(!row || row.worker!==m.worker || row.kind!==m.kind || (row.version===m.version && row.manifest!==json))throw new Error('Conflicting Worker registration');
  return {registered:true,id:m.id,version:row.version};
}
export async function workerCatalog(db:D1Database,scope:AppId|null) {
  const rows=await db.withSession('first-primary').prepare('SELECT manifest FROM registered_workers'+(scope?' WHERE id=?':'')+' ORDER BY id').bind(...(scope?[scope]:[])).all<{manifest:string}>();
  return rows.results.map(row=>{const m=manifest(JSON.parse(row.manifest));const workerOrigin='https://'+m.worker+'.ailab-452.workers.dev';return {...m,workerOrigin,href:m.workerRoutes?new URL(m.href,workerOrigin).href:m.href,resumePath:m.workerRoutes?new URL(m.resumePath,workerOrigin).href:m.resumePath,connection:'connected'};});
}
export const LAB_LINKS = [
  {label:'Lab access',href:'https://tools.ailab.gc.cuny.edu/welcome',description:'Membership and classes'},
  {label:'Model Access',href:'https://tools.ailab.gc.cuny.edu/model-access',description:'Models and account usage'},
  {label:'Administration',href:'https://tools.ailab.gc.cuny.edu/admin/',description:'Administrator access required'},
  {label:'Model Registry',href:'https://ailab.gc.cuny.edu/models/',description:'Explore available models'},
  {label:'Lab website',href:'https://ailab.gc.cuny.edu/',description:'Tools, teaching and research'},
] as const;
