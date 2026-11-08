import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pointerSamples,mapPoint,addStroke,paintStroke,undo,redo} from '../core.js';

test('pointer samples fall back for missing or empty coalesced events',()=>{
 const absent={};assert.deepEqual(pointerSamples(absent),[absent]);
 const empty={getCoalescedEvents:()=>[]};assert.deepEqual(pointerSamples(empty),[empty]);
 const list=[{clientX:1},{clientX:2}];
 assert.equal(pointerSamples({getCoalescedEvents:()=>list}),list);
});
function harness(tool='eraser',penOnly=false){
 // Exercise the actual app pointer handlers, not a copied implementation.
 const source=fs.readFileSync(process.env.APP_UNDER_TEST||new URL('../app.js',import.meta.url),'utf8');
 const start=source.indexOf('let pointerId=null;'),end=source.indexOf('function exportCanvas(drawing)');
 assert.ok(start>=0&&end>start);
 const handlers={},captures=new Set(),calls=[];
 const ix={save(){},restore(){},beginPath(){},arc(){},fill(){calls.push(this.globalCompositeOperation);},moveTo(){},lineTo(){},stroke(){calls.push(this.globalCompositeOperation);}};
 const ctx={view:'draw',busy:false,tool,settings:{width:8,penOnly},width:800,height:600,active:null,history:{strokes:[],redo:[]},
  mapPoint,addStroke,paintStroke,pointerSamples,ix,markDirty(){},updateHistoryUI(){},
  ink:{addEventListener:(name,fn)=>{handlers[name]=fn;},setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),getBoundingClientRect:()=>({left:50,top:-100,width:400,height:300})}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const event=(extra={})=>({pointerId:7,button:0,pointerType:'mouse',pressure:0,clientX:100,clientY:-50,preventDefault(){},...extra});
 return {ctx,handlers,event,calls};
}
test('actual eraser drag keeps empty-coalesced movement, scaled coordinates, replay and history',()=>{
 const h=harness(),{ctx,handlers,event}=h;
 handlers.pointerdown(event());
 handlers.pointermove(event({clientX:250,clientY:50,getCoalescedEvents:()=>[]}));
 handlers.pointerup(event({clientX:250,clientY:50}));
 const stroke=ctx.history.strokes[0];
 assert.equal(stroke.tool,'eraser');assert.equal(stroke.points.length,2,'empty coalesced list must not drop the eraser move');
 assert.deepEqual(Array.from(stroke.points,p=>[p.x,p.y]),[[100,100],[400,300]]);
 assert.ok(h.calls.every(op=>op==='destination-out'));
 const cloned=structuredClone(ctx.history),undone=undo(cloned);
 assert.equal(undone.strokes.length,0);assert.deepEqual(redo(undone),cloned);
 const replay=[];paintStroke({save(){},restore(){},beginPath(){},arc(){},fill(){replay.push(this.globalCompositeOperation);},moveTo(){},lineTo(){},stroke(){replay.push(this.globalCompositeOperation);}},cloned.strokes[0]);
 assert.ok(replay.length>1&&replay.every(op=>op==='destination-out'));
});
test('actual pen handler preserves coalesced points and pressure, accepts missing API',()=>{
 const {ctx,handlers,event}=harness('pen');
 handlers.pointerdown(event({pointerType:'pen',pressure:.5}));
 handlers.pointermove(event({getCoalescedEvents:()=>[event({pointerType:'pen',pressure:.8,clientX:150}),event({pointerType:'pen',pressure:.4,clientX:175})]}));
 handlers.pointermove(event({clientX:200}));
 handlers.pointerup(event());
 assert.equal(ctx.history.strokes[0].points.length,4);
 assert.ok(Math.abs(ctx.history.strokes[0].points[1].pressure-1.2)<1e-9);
 assert.equal(ctx.history.strokes[0].points.at(-1).x,300);
});
test('actual pen-only handler ignores finger and keeps pen strokes on cancellation',()=>{
 const {ctx,handlers,event}=harness('pen',true);
 handlers.pointerdown(event({pointerType:'touch'}));assert.equal(ctx.active,null);
 handlers.pointerdown(event({pointerType:'pen',pressure:.6}));
 handlers.pointermove(event({pointerType:'pen',clientX:200,getCoalescedEvents:()=>[]}));
 handlers.pointercancel(event({pointerType:'pen'}));
 assert.equal(ctx.history.strokes.length,1);assert.equal(ctx.history.strokes[0].points.length,2);
});
