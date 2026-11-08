import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp, anchoredScroll, createZoom} from '../zoom.mjs';
class Element {
  style = {width:'',touchAction:''}; listeners = new Map(); attrs={};
  clientWidth=400; clientHeight=300; scrollLeft=0; scrollTop=0;
  addEventListener(type, fn, options) { const list=this.listeners.get(type)||[]; list.push({fn,options}); this.listeners.set(type,list); }
  removeEventListener(type, fn) {this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x.fn!==fn));}
  getBoundingClientRect() {return {left:10,top:20};}
  setAttribute(k,v) { this.attrs[k]=v; }
  setPointerCapture(id) {this.captured=id;}
  releasePointerCapture() {this.captured=null;}
  emit(type, data={}) {
    const event={target:this,pointerId:1,pointerType:'touch',button:0,clientX:200,clientY:150,
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...data};
    for(const {fn} of this.listeners.get(type)||[]) {fn(event); if(event.stopped) break;}
    return event;
  }
}
function setup(options={}) {
  const nodes=Object.fromEntries(['viewport','stage','minus','plus','fit','output','panButton','hint'].map(k=>[k,new Element()]));
  return {...nodes,api:createZoom({...nodes,...options})};
}
test('pure clamp and center anchoring arithmetic',()=>{
 assert.equal(clamp(0),1); assert.equal(clamp(8),5);
 assert.equal(anchoredScroll(100,200,1,2),400);
 assert.equal(anchoredScroll(0,200,2,1),0);
});
test('bounds, buttons, numeric output and unchanged canvas backing stores',()=>{
 const x=setup(); x.stage.children=[{width:1200,height:800},{width:1200,height:800}];
 assert.equal(x.minus.disabled,true); x.api.setZoom(10);
 assert.equal(x.api.scale,5); assert.equal(x.stage.style.width,'500%');
 assert.equal(x.output.textContent,'500 %'); assert.equal(x.plus.disabled,true);
 assert.equal(x.stage.children[1].width,1200);
 x.api.setZoom(-2); assert.equal(x.api.scale,1);
 assert.throws(()=>x.api.setZoom(NaN),TypeError);
});
test('zoom preserves visible center, fit/new-image reset returns top left',()=>{
 const x=setup(); x.viewport.scrollLeft=100; x.viewport.scrollTop=50;
 x.api.setZoom(2); assert.equal(x.viewport.scrollLeft,400); assert.equal(x.viewport.scrollTop,250);
 x.api.reset(); assert.equal(x.viewport.scrollLeft,0); assert.equal(x.viewport.scrollTop,0); assert.equal(x.api.scale,1);
 x.plus.emit('click'); assert.equal(x.api.scale,1.25); x.fit.emit('click'); assert.equal(x.api.scale,1);
});
test('resize resets only for changed dimensions',()=>{
 const x=setup(); x.api.setZoom(3); x.api.resize(); assert.equal(x.api.scale,3);
 x.viewport.clientWidth=600; x.api.resize(); assert.equal(x.api.scale,1); assert.equal(x.viewport.scrollLeft,0);
});
test('pen and touch pass through in normal drawing mode',()=>{
 const x=setup();
 for(const pointerType of ['pen','touch','mouse']) assert.equal(x.viewport.emit('pointerdown',{pointerType}).stopped,undefined);
});
test('pen-only mode consumes touch before app handler, not pen',()=>{
 let calls=0, draw=0; const x=setup({shouldPanTouch:()=>true,beforePan:()=>calls++});
 x.viewport.addEventListener('pointerdown',()=>draw++);
 assert.equal(x.viewport.listeners.get('pointerdown')[0].options.capture,true);
 assert.equal(x.viewport.emit('pointerdown').prevented,true); assert.equal(draw,0); assert.equal(calls,1);
 x.viewport.emit('pointermove',{clientX:100}); assert.equal(x.viewport.scrollLeft,100);
 assert.equal(x.viewport.emit('pointerdown',{pointerType:'pen',pointerId:3}).stopped,undefined); assert.equal(draw,1);
 x.viewport.emit('pointerup'); assert.equal(x.viewport.captured,null);
 assert.equal(x.viewport.emit('pointermove').stopped,undefined);
});
test('explicit pan, extra fingers, cancel/lost capture and mode changes do not stick',()=>{
 const x=setup(); x.panButton.emit('click'); assert.equal(x.panButton.attrs['aria-pressed'],'true');
 assert.equal(x.viewport.emit('pointerdown',{pointerType:'pen'}).stopped,true);
 x.viewport.emit('pointerdown',{pointerId:2}); assert.equal(x.viewport.captured,2);
 x.viewport.emit('pointercancel'); x.viewport.emit('pointercancel',{pointerId:2}); assert.equal(x.viewport.captured,null);
 x.viewport.emit('pointerdown'); x.viewport.emit('lostpointercapture');
 assert.equal(x.viewport.emit('pointermove').stopped,true); x.viewport.emit('pointerup');
 x.viewport.emit('pointerdown'); x.api.setPanMode(false); assert.equal(x.viewport.captured,null);
 assert.equal(x.panButton.attrs['aria-pressed'],'false');
});
test('capture failure and destroy release gestures and listeners/styles',()=>{
 const x=setup({shouldPanTouch:()=>true}); x.viewport.setPointerCapture=()=>{throw Error();};
 x.viewport.emit('pointerdown'); assert.equal(x.viewport.emit('pointermove').stopped,true);
 x.api.destroy(); assert.equal(x.viewport.style.touchAction,''); assert.equal(x.stage.style.width,'');
 assert.equal(x.viewport.listeners.get('pointerdown').length,0);
});
test('pinch spread, midpoint translation, shrink and clamped bounds',()=>{
 const x=setup(); x.api.setZoom(2); x.viewport.scrollLeft=200; x.viewport.scrollTop=150;
 x.viewport.emit('pointerdown',{clientX:110,clientY:120});
 x.viewport.emit('pointerdown',{pointerId:2,clientX:210,clientY:120});
 x.viewport.emit('pointermove',{pointerId:2,clientX:310,clientY:120});
 assert.equal(x.api.scale,4); assert.equal(x.viewport.scrollLeft,500); assert.equal(x.viewport.scrollTop,400);
 x.viewport.emit('pointermove',{pointerId:2,clientX:1010,clientY:120}); assert.equal(x.api.scale,5);
 x.viewport.emit('pointermove',{pointerId:2,clientX:135,clientY:120}); assert.equal(x.api.scale,1);
 x.viewport.emit('pointerup',{pointerId:2});
 const left=x.viewport.scrollLeft;
 x.viewport.emit('pointermove',{clientX:90,clientY:120}); assert.equal(x.viewport.scrollLeft,left+20);
 assert.equal(x.viewport.emit('pointerup').stopped,true);
 assert.equal(x.viewport.emit('pointermove').stopped,undefined);
});
test('second touch cancels ink once, reclaims both captures; ink lost capture ignored',()=>{
 let n=0; let x;
 x=setup({beforePan:()=>{n++; x.viewport.emit('lostpointercapture',{target:x.ink});}}); x.ink={};
 const captures=[]; x.viewport.setPointerCapture=id=>captures.push(id);
 assert.equal(x.viewport.emit('pointerdown',{clientX:100}).stopped,undefined);
 assert.equal(x.viewport.emit('pointermove',{clientX:90}).stopped,undefined);
 assert.equal(x.viewport.emit('pointerdown',{pointerId:9,pointerType:'pen'}).stopped,undefined);
 x.viewport.emit('pointerdown',{pointerId:2,clientX:200});
 assert.equal(n,1); assert.deepEqual(captures,[1,2]);
 x.viewport.emit('lostpointercapture',{target:x.ink});
 assert.equal(x.viewport.emit('pointermove',{clientX:50}).stopped,true);
 x.viewport.emit('pointerdown',{pointerId:3}); assert.equal(n,1);
 x.viewport.emit('pointercancel',{pointerId:2});
 assert.equal(x.viewport.emit('pointermove',{pointerId:3,clientX:180}).stopped,true);
 x.api.fit(); assert.equal(x.api.scale,1);
 assert.equal(x.viewport.emit('pointerup').stopped,true);
 assert.equal(x.viewport.emit('pointerup',{pointerId:3}).stopped,true);
});
test('portrait and landscape whole-image fit, reset recomputes base, resize stable',()=>{
 let aspect=0.5; const x=setup({getAspectRatio:()=>aspect});
 assert.equal(x.stage.style.width,'37.5%'); // width150, height300
 x.api.setZoom(2); assert.equal(x.stage.style.width,'75%');
 aspect=2; x.api.reset(); assert.equal(x.stage.style.width,'100%'); // width400,height200
 x.viewport.clientHeight=100; x.api.resize(); assert.equal(x.stage.style.width,'50%');
 x.api.setZoom(2); x.api.resize(); assert.equal(x.api.scale,2);
});
test('scrollbar client changes do not reset zoom; outer resize does',()=>{
 const Previous=globalThis.ResizeObserver;
 let callback, observedOptions;
 globalThis.ResizeObserver=class {
   constructor(fn){callback=fn;} observe(node,options){observedOptions=options;} disconnect(){}
 };
 try {
   const x=setup();
   // Simulate initial box measurement once before testing scrollbar changes.
   let rect={left:10,top:20,width:996,height:696.8};
   x.viewport.getBoundingClientRect=()=>rect;
   callback(); // Initial real outer layout change fits.
   assert.deepEqual(observedOptions,{box:'border-box'});
   x.plus.emit('click'); assert.equal(x.api.scale,1.25);
   const width=x.stage.style.width;
   x.viewport.clientWidth-=15; x.viewport.clientHeight-=15;
   callback(); assert.equal(x.api.scale,1.25); assert.equal(x.stage.style.width,width);
   rect={...rect,width:800}; callback(); assert.equal(x.api.scale,1);
   x.api.destroy();
 } finally {globalThis.ResizeObserver=Previous;}
});
test('reused pointer id normal pen clears previous pan suppression',()=>{
 const x=setup(); x.api.setPanMode(true);
 x.viewport.emit('pointerdown',{pointerType:'pen'}); x.api.fit(); x.api.setPanMode(false);
 assert.equal(x.viewport.emit('pointerdown',{pointerType:'pen'}).stopped,undefined);
 assert.equal(x.viewport.emit('pointermove',{pointerType:'pen'}).stopped,undefined);
 assert.equal(x.viewport.emit('pointerup',{pointerType:'pen'}).stopped,undefined);
});

test('new pen contact clears suppression after cancelled pan',()=>{const x=setup();x.api.setPanMode(true);x.viewport.emit('pointerdown',{pointerId:9,pointerType:'pen'});x.api.setPanMode(false);assert.equal(x.viewport.emit('pointerdown',{pointerId:9,pointerType:'pen'}).stopped,undefined);assert.equal(x.viewport.emit('pointermove',{pointerId:9,pointerType:'pen'}).stopped,undefined);});
