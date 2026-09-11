const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  const callbacks = [];
  const properties = new Map();
  const attributes = new Map();
  const media = { matches: true };
  const viewport = { height:844, scale:1, offsetTop:0, addEventListener(type,fn){ this[type]=fn; } };
  const field = { focused:0, matches:()=>true, closest:()=>null, getBoundingClientRect:()=>({top:380,bottom:424}), focus(){this.focused++;} };
  const document = { activeElement:null, documentElement:{style:{setProperty:(k,v)=>properties.set(k,v)},toggleAttribute:(k,v)=>attributes.set(k,v)}, addEventListener(){} };
  const window = { visualViewport:viewport, innerHeight:844, scrolls:[], scrollBy(x,y){this.scrolls.push(y);}, addEventListener(){} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/cadavre-viewport.js'),'utf8'),{
    window, document, matchMedia:()=>media, requestAnimationFrame:fn=>(callbacks.push(fn),callbacks.length), cancelAnimationFrame(){},
  });
  const flush=()=>{while(callbacks.length) callbacks.shift()();};
  flush();
  return {window,document,viewport,field,media,properties,attributes,flush};
}

test('phone focus is always player initiated; desktop can keep its writing focus',()=>{
  const x=setup();
  x.window.CadavreViewport.focus(x.field);
  assert.equal(x.field.focused,0);
  x.media.matches=false;
  x.window.CadavreViewport.focus(x.field);
  assert.equal(x.field.focused,1);
});

test('keyboard space moves the active writing edge; pinch zoom does not resize the poem',()=>{
  const x=setup();
  x.document.activeElement=x.field;
  x.viewport.height=440;x.viewport.resize();x.flush();
  assert.equal(x.properties.get('--visual-height'),'440px');
  assert.equal(x.attributes.get('data-keyboard-open'),true);
  assert.deepEqual(x.window.scrolls,[32]);
  x.viewport.scale=1.5;x.viewport.height=280;x.viewport.resize();x.flush();
  assert.equal(x.properties.get('--visual-height'),'440px');
  assert.deepEqual(x.window.scrolls,[32]);
  x.document.activeElement=null;x.viewport.scale=1;x.viewport.height=844;x.viewport.resize();x.flush();
  assert.equal(x.attributes.get('data-keyboard-open'),false);
  assert.equal(x.field.focused,0);
});
