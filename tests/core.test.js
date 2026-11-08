import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSize,mapPoint,extractLines,addStroke,undo,redo,paintStroke} from '../core.js';
function image(w,h,pixel){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set(pixel(x,y),(y*w+x)*4);return a;}
const blackCount=a=>a.reduce((n,v,i)=>n+(i%4===0&&v===0?1:0),0);
test('resize keeps aspect and bounds without upscaling',()=>{
 assert.deepEqual(fitSize(4000,2000),{width:1440,height:720});
 assert.deepEqual(fitSize(2000,4000),{width:720,height:1440});
 assert.deepEqual(fitSize(40,80),{width:40,height:80});
 assert.deepEqual(fitSize(1,5000),{width:1,height:1440});
 assert.throws(()=>fitSize(0,200));
});
test('blank, solid and transparent images have no invented edges',()=>{
 for(const p of [[255,255,255,255],[0,0,0,255],[200,14,33,0]]){
  for(const d of [0,50,100])assert.equal(blackCount(extractLines(image(40,40,()=>p),40,40,d)),0);
 }
});
test('transparent colours composite white before extraction',()=>{
 const a=image(40,40,(x,y)=>[x*6,y*6,0,0]);
 assert.equal(blackCount(extractLines(a,40,40,100)),0);
 const b=image(40,40,x=>x<20?[0,0,0,0]:[255,255,255,255]);
 assert.equal(blackCount(extractLines(b,40,40,100)),0);
});
test('more details monotonically adds edges, output binary opaque and input unchanged',()=>{
 const a=image(100,80,(x,y)=>{const v=(x<20?255:x<40?180:x<60?140:x<80?100:0)+(y>40?10:0);return [v,v,v,255];});
 const before=a.slice();let prev=null,counts=[];
 for(const detail of [0,25,50,75,100]){
  const out=extractLines(a,100,80,detail);counts.push(blackCount(out));
  for(let i=0;i<out.length;i+=4){assert.equal(out[i],out[i+1]);assert.equal(out[i],out[i+2]);assert.equal(out[i+3],255);assert.ok(out[i]===0||out[i]===255);if(prev&&prev[i]===0)assert.equal(out[i],0);}
  prev=out;
 }
 assert.ok(counts.at(-1)>counts[0]);assert.deepEqual(a,before);
});
test('small dimensions safe and invalid buffers rejected',()=>{
 for(const [w,h] of [[1,1],[1,50],[50,1],[2,2]])assert.equal(extractLines(image(w,h,()=>[0,0,0,255]),w,h).length,w*h*4);
 assert.throws(()=>extractLines(new Uint8Array(1),10,10));
});
test('pointer maps viewport coordinates with responsive scale and scroll offsets',()=>{
 assert.deepEqual(mapPoint(210,360,{left:10,top:160,width:400,height:200},1200,600),{x:600,y:600});
 assert.deepEqual(mapPoint(210,60,{left:10,top:-40,width:400,height:200},1200,600),{x:600,y:300});
 assert.deepEqual(mapPoint(-10,999,{left:10,top:0,width:400,height:200},1200,600),{x:0,y:600});
});
test('stroke history undo redo and branch do not mutate previous arrays',()=>{
 const a={tool:'pen',width:4,points:[{x:10,y:10,pressure:1}]},b={...a,tool:'eraser'};
 const empty={strokes:[],redo:[]},one=addStroke(empty,a),two=addStroke(one,b);
 assert.equal(empty.strokes.length,0);assert.equal(one.strokes.length,1);
 const u=undo(two);assert.deepEqual(u.strokes,[a]);assert.deepEqual(redo(u),two);
 assert.deepEqual(addStroke(u,a).redo,[]);assert.equal(undo(empty),empty);assert.equal(redo(empty),empty);
});
test('ink-only erase compositing, pressure width and state restoration',()=>{
 const calls=[],ctx={save(){calls.push('save');},restore(){calls.push('restore');},beginPath(){},arc(...args){calls.push(['dot',...args]);},fill(){calls.push(['fill',this.globalCompositeOperation]);},moveTo(){},lineTo(){},stroke(){calls.push(['line',this.globalCompositeOperation,this.lineWidth]);}};
 paintStroke(ctx,{tool:'eraser',width:10,points:[{x:2,y:3,pressure:.5},{x:5,y:6,pressure:1}]});
 assert.deepEqual(calls[0],'save');assert.deepEqual(calls.at(-1),'restore');
 assert.ok(calls.some(c=>c[0]==='line'&&c[1]==='destination-out'&&c[2]===10));
 paintStroke(ctx,{tool:'pen',width:8,points:[{x:1,y:1,pressure:.5}]});
 assert.ok(calls.some(c=>c[0]==='dot'&&c[3]===2));
 assert.ok(calls.some(c=>c[0]==='fill'&&c[1]==='source-over'));
});
test('project schema including source Blob and erased history survives structured clone',async()=>{
 const p={version:1,source:new Blob(['fixture'],{type:'image/png'}),settings:{detail:30,opacity:25,penOnly:true},history:{strokes:[{tool:'eraser',width:12,points:[{x:14,y:20,pressure:.8}]}],redo:[]}};
 const copy=structuredClone(p);p.history.strokes[0].points[0].x=55;
 assert.equal(copy.history.strokes[0].points[0].x,14);assert.equal(await copy.source.text(),'fixture');assert.equal(copy.settings.penOnly,true);
});
