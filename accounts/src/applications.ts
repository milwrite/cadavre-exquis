// Registered application metadata is the shared source for storage validation,
// dashboard navigation and resume links. Each adapter also needs a named,
// exact-audience WorkerEntrypoint; listing an app never grants it access.
export const APPLICATIONS = [
  {id:'cadavre',name:'Cadavre',description:'Write a poem, one contribution at a time.',kind:'poem',category:'Writing',href:'/cadavre/',resumePath:'/cadavre/ui/corpse.html',connection:'connected'},
  {id:'jeopardy',name:'Jeopardy Generator',description:'Build question boards for play and learning.',kind:'board',category:'Games',href:null,resumePath:null,connection:'planned'},
  {id:'cloze',name:'Cloze Reader',description:'Read closely through questions, gaps and hints.',kind:'exercise',category:'Reading',href:null,resumePath:null,connection:'planned'},
] as const;
export type AppId = typeof APPLICATIONS[number]['id'];
export const APPS = APPLICATIONS.map(app=>app.id);
export const isApp = (value:unknown):value is AppId => APPLICATIONS.some(app=>app.id===value);
export const application = (id:AppId) => APPLICATIONS.find(app=>app.id===id)!;
export const LAB_LINKS = [
  {label:'Lab access',href:'/welcome',description:'Membership and classes'},
  {label:'Model Access',href:'/model-access',description:'Models and account usage'},
  {label:'Administration',href:'/admin/',description:'Administrator access required'},
  {label:'Model Registry',href:'https://ailab.gc.cuny.edu/models/',description:'Explore available models'},
  {label:'Lab website',href:'https://ailab.gc.cuny.edu/',description:'Tools, teaching and research'},
] as const;
