import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const core=createRequire(import.meta.url)('../../assets/cadavre-core.js');
const signed={authenticated:true,endpoint:'/cadavre/api/cadavre/chat',modelsEndpoint:'/cadavre/api/cadavre/models',readyEndpoint:'',wallEndpoint:'/cadavre/api/cadavre/wall',workEndpoint:'/cadavre/api/work',apiKey:'',model:'requested/model'};
test('signed resume links cannot override the private endpoint, and missing/malformed configuration fails closed',()=>{
 const url='https://tools.ailab.gc.cuny.edu/cadavre/ui/corpse.html?work=owned&endpoint=https://attacker.example/chat';
 assert.equal(core.connectionConfig({},signed,url).endpoint,signed.endpoint);
 for(const value of [undefined,{...signed,authenticated:false},{...signed,endpoint:'https://attacker.example/chat'},{...signed,workEndpoint:'https://attacker.example'},{...signed,apiKey:'unexpected'}])assert.throws(()=>core.connectionConfig({},value,url));
 const publicConfig=core.connectionConfig({endpoint:'original'},undefined,'https://inference-arcade.com/cadavre?endpoint=https://user-selected.example');assert.equal(publicConfig.endpoint,'https://user-selected.example');
});
test('edited-poem context is supplied once per request and never mutates the saved base prompt or formatting',()=>{
 const base=[{role:'system',content:'Original base prompt'},{role:'user',content:'A lantern'}];
 const poem='  Paper   lantern\n\n  holds the river\n';
 for(let i=0;i<10;i++){
  const prepared=core.withEditedPoem(base,poem);
  assert.equal(prepared[0].content.split(poem).length,2);
  assert.equal(base[0].content,'Original base prompt');
  assert.ok(prepared[0].content.endsWith(poem));
  const copied=base.concat([{role:'user',content:'Rewrite the last line'}]);
  const regenerated=core.withEditedPoem(copied,poem);
  assert.ok(regenerated[0].content.endsWith(poem));assert.equal(copied[0].content,'Original base prompt');
 }
});

test('Worker origin account configuration stays same-origin and ignores endpoint overrides',()=>{
 const supplied={...signed,endpoint:'/api/cadavre/chat',modelsEndpoint:'/api/cadavre/models',wallEndpoint:'/api/cadavre/wall',workEndpoint:'/api/work'};
 const url='https://cadavre.ailab-452.workers.dev/play/?work=owned&endpoint=https://attacker.example';
 assert.equal(core.connectionConfig({},supplied,url).endpoint,'/api/cadavre/chat');
 assert.throws(()=>core.connectionConfig({},{...supplied,endpoint:'https://attacker.example'},url));
});

test('dedicated Worker fails closed when its config is missing, including signed-out pages',()=>{
 const url='https://cadavre.ailab-452.workers.dev/?endpoint=https://attacker.example';
 for(const supplied of [undefined,{}, {authenticated:false}])assert.throws(()=>core.connectionConfig({},supplied,url));
 const supplied={authenticated:false,endpoint:'/api/cadavre/chat',modelsEndpoint:'/api/cadavre/models',readyEndpoint:'/api/cadavre/ready',wallEndpoint:'/api/cadavre/wall',workEndpoint:'',apiKey:'',model:'test/model'};
 assert.equal(core.connectionConfig({},supplied,url).endpoint,'/api/cadavre/chat');
 assert.throws(()=>core.connectionConfig({},{...supplied,endpoint:'https://attacker.example'},url));
});

test('reopening an old Gemma poem chooses Flash without changing the saved record',()=>{
 const saved={model:'@cf/google/gemma-4-26b-a4b-it',poem:'paper moons\ndissolve slowly',turns:[{model:'gemma-4-26b-a4b-it',text:'dissolve slowly'}]};
 const original=JSON.stringify(saved);
 const flash={id:'deepseek-v4-flash-0731',model:'@cf/deepseek-ai/deepseek-v4-flash-0731',available:true};
 const selected=core.chooseModel({default:flash.id,models:[flash]},[saved.model]);
 assert.equal(selected.id,flash.id);
 assert.equal(JSON.stringify(saved),original);
});
