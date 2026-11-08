import test from 'node:test';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {mapPoint,addStroke,undo,redo,paintStroke,pointerSamples} from '../core.js';
test('real tool handlers, pen-only migration, styled history and clear confirmation',()=>{
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const handlers={},nodes={},calls=[];let confirm=false;const ix={save(){},restore(){},clearRect(){calls.length=0},beginPath(){},arc(){},fill(){calls.push([this.fillStyle,this.globalAlpha,this.lineWidth])},moveTo(){},lineTo(){},stroke(){calls.push([this.strokeStyle,this.globalAlpha,this.lineWidth])}};
const ctx={view:'draw',busy:false,tool:'pen',settings:{width:8,penOnly:true,colour:'#d83131',brush:'marker'},width:800,height:600,active:null,history:{strokes:[],redo:[]},mapPoint,addStroke,undo,redo,paintStroke,pointerSamples,ix,markDirty(){},updateHistoryUI(){},window:{confirm:()=>confirm},$:id=>nodes[id]??=( {} ),ink:{addEventListener:(n,f)=>handlers[n]=f,setPointerCapture(){},hasPointerCapture:()=>false,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}};
vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function redrawInk()'),app.indexOf('function renderBase()')),ctx);vm.runInContext(app.slice(app.indexOf('let pointerId=null;'),app.indexOf('function exportCanvas(drawing)')),ctx);
const ev=(type,x=10)=>({pointerId:1,button:0,pointerType:type,pressure:.5,clientX:x,clientY:10,preventDefault(){}});
for(const type of ['touch','mouse']){handlers.pointerdown(ev(type));assert.equal(ctx.active,null)}
handlers.pointerdown(ev('pen'));handlers.pointermove(ev('pen',20));const live=structuredClone(calls);handlers.pointerup(ev('pen'));assert.equal(ctx.history.strokes.length,1);assert.equal(ctx.history.strokes[0].brush,'marker');assert.equal(ctx.history.strokes[0].colour,'#d83131');
ctx.settings.colour='#2269d8';ctx.settings.brush='brush';ctx.history=redo(undo(structuredClone(ctx.history)));ctx.redrawInk();assert.deepEqual(calls,live);console.log('PASS real pointer rejection/acceptance, styled history clone/undo/redo and marker replay');
const clear=app.split('\n').find(l=>l.startsWith("$('clearInk').onclick="));vm.runInContext(clear,ctx);const old=ctx.history;nodes.clearInk.onclick();assert.equal(ctx.history,old);confirm=true;nodes.clearInk.onclick();assert.equal(ctx.history.strokes.length,0);assert.equal(ctx.history.redo.length,0);console.log('PASS clear cancellation and confirmed empty history');
const migration=app.split('\n').find(l=>l.trim().startsWith('settings={detail:Math.max'));for(const [s,want] of [[{penOnly:false},true],[{penOnly:false,toolsVersion:4},false],[{penOnly:true,toolsVersion:4},true]]){ctx.s=s;vm.runInContext(migration,ctx);assert.equal(ctx.settings.penOnly,want);assert.equal(ctx.settings.toolsVersion,4)}console.log('PASS legacy migration and explicit version-4 choices');

});
