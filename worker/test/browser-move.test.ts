import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {retiredCadavre,receiveBrowserMove} from '../src/browser-move.ts';
import retired from '../src/retired.ts';

const oldOrigin='https://cail-cadavre.ailab-452.workers.dev';
const newOrigin='https://cadavre.ailab-452.workers.dev';
async function browser(response:Response,initial:Record<string,string>={},opener:unknown=null){
  const html=await response.text(),script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const storage=new Map(Object.entries(initial));
  const elements:Record<string,{textContent:string;onclick?:()=>void}>={};
  const listeners:Record<string,(event:unknown)=>void>={};
  const sent:{message:any;origin:string}[]=[];
  const destination={postMessage:(message:unknown,origin:string)=>sent.push({message,origin})};
  const opened:unknown[][]=[];
  runInNewContext(script,{
    document:{getElementById:(id:string)=>elements[id]??=( {textContent:''})},
    localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},
    window:{opener,open:(...args:unknown[])=>{opened.push(args);return destination;},addEventListener:(name:string,fn:(event:unknown)=>void)=>listeners[name]=fn},
  });
  return {storage,elements,sent,destination,opened,message:(event:unknown)=>listeners.message(event)};
}

test('retired sender needs a click and exact recipient window/origin, and copies no credential keys',async()=>{
  const source=await browser(retiredCadavre(),{cadavreWallDeleteTokens:'{"poem":"delete-capability"}',corpseConn:'private-api-key',unrelated:'secret'});
  source.message({origin:newOrigin,source:source.destination,data:{type:'cadavre-move-ready'}});
  assert.equal(source.sent.length,0);
  source.elements.move.onclick!();
  assert.equal(source.opened[0][0],newOrigin+'/move');
  for(const event of [
    {origin:'https://evil.example',source:source.destination},
    {origin:newOrigin,source:{}},
  ])source.message({...event,data:{type:'cadavre-move-ready'}});
  assert.equal(source.sent.length,0);
  source.message({origin:newOrigin,source:source.destination,data:{type:'cadavre-move-ready'}});
  assert.equal(source.sent.length,1);
  assert.equal(source.sent[0].origin,newOrigin);
  assert.deepEqual(Object.keys(source.sent[0].message.values),['cadavreWallDeleteTokens']);
  assert.equal(source.storage.get('cadavreWallDeleteTokens'),'{"poem":"delete-capability"}');
});

test('receiver rejects wrong origins/windows and merges once without replacing existing capabilities or settings',async()=>{
  const ready:unknown[][]=[],opener={postMessage:(...args:unknown[])=>ready.push(args)};
  const target=await browser(receiveBrowserMove(),{cadavreWallDeleteTokens:'{"existing":"new-capability","collision":"keep"}','corpse.settings':'new-settings'},opener);
  assert.equal(ready.length,1);assert.equal(ready[0][1],oldOrigin);
  const data={type:'cadavre-browser-move',values:{cadavreWallDeleteTokens:'{"older":"old-capability","collision":"old"}','corpse.settings':'old-settings',corpseConn:'do-not-copy'}};
  target.message({origin:'https://evil.example',source:opener,data});
  target.message({origin:oldOrigin,source:{},data});
  assert.equal(target.storage.get('cadavreWallDeleteTokens'),'{"existing":"new-capability","collision":"keep"}');
  target.message({origin:oldOrigin,source:opener,data});
  assert.deepEqual(JSON.parse(target.storage.get('cadavreWallDeleteTokens')!),{older:'old-capability',collision:'keep',existing:'new-capability'});
  assert.equal(target.storage.get('corpse.settings'),'new-settings');
  assert.equal(target.storage.has('corpseConn'),false);
  target.message({origin:oldOrigin,source:opener,data:{type:'cadavre-browser-move',values:{cadavreWallVoterToken:'replayed'}}});
  assert.equal(target.storage.has('cadavreWallVoterToken'),false);
});

test('direct arrival explains recovery and retirement disables API and mutating requests',async()=>{
  const target=await browser(receiveBrowserMove());
  assert.match(target.elements.instructions.textContent,/Open the old Cadavre address/);
  for(const request of [new Request(oldOrigin+'/api/cadavre/wall'),new Request(oldOrigin+'/',{method:'POST'})])assert.equal(retired.fetch(request).status,410);
  const page=retired.fetch(new Request(oldOrigin+'/'));
  assert.equal(page.headers.get('cache-control'),'no-store');
  assert.match(page.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
});
