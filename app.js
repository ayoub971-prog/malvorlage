import {fitSize,mapPoint,addStroke,undo,redo,paintStroke,extractLines} from './core.js';
const $=id=>document.getElementById(id);
const base=$('base'), ink=$('ink'), bx=base.getContext('2d'), ix=ink.getContext('2d');
const original=document.createElement('canvas'), template=document.createElement('canvas');
let source=null, width=0,height=0,view='template',tool='pen',history={strokes:[],redo:[]},active=null;
let db=null,ready=false,busy=false,processing=false,processId=0,worker=null,detailTimer,saveTimer,revision=0,savedRevision=-1;
let settings={detail:50,width:5,opacity:25,penOnly:false}, replacementAction=null, imageBusy=false;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function openDB(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('malvorlage-local',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('projects');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(new Error('Lokaler Speicher ist blockiert. Andere App-Fenster schliessen.'));
});}
function store(mode,callback){return new Promise((resolve,reject)=>{
 const tx=db.transaction('projects',mode),req=callback(tx.objectStore('projects'));
 let result;req.onsuccess=()=>{result=req.result;};
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||req.error);tx.onabort=()=>reject(tx.error||new Error('Speichern abgebrochen'));
});}
function markDirty(){revision++;clearTimeout(saveTimer);status(db?'Änderungen werden lokal gespeichert …':'Nur in dieser Sitzung: Bitte PNG speichern.',!db);saveTimer=setTimeout(saveProject,500);}
let saving=false,saveAgain=false;
async function saveProject(){
 if(!db||!source)return;
 if(saving){saveAgain=true;return;}
 saving=true; const version=revision;
 // structuredClone before awaiting ensures later pointer edits cannot mutate this snapshot.
 const project={version:1,source,settings:{...settings},history:structuredClone(history)};
 try {await store('readwrite',s=>s.put(project,'current'));savedRevision=version;
   if(revision===version)status('Auf diesem Gerät gespeichert.');
 }catch(e){status('Nicht gespeichert: Gerätespeicher ist voll oder gesperrt. Bitte PNG sichern.',true);}
 finally{saving=false;if(saveAgain||revision!==version){saveAgain=false;clearTimeout(saveTimer);saveTimer=setTimeout(saveProject,500);}}
}
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);saveProject();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishStroke();clearTimeout(saveTimer);saveProject();}});
function updateSettingsUI(){
 for(const key of ['detail','width','opacity']){$(key).value=settings[key];$(key+'Value').textContent=settings[key]+(key==='opacity'?' %':'');}
 $('penOnly').checked=settings.penOnly;
}
function updateHistoryUI(){$('undo').disabled=!history.strokes.length;$('redo').disabled=!history.redo.length;}
function redrawInk(){ix.clearRect(0,0,width,height);for(const stroke of history.strokes)paintStroke(ix,stroke);if(active)paintStroke(ix,active);updateHistoryUI();}
function renderBase(){
 bx.clearRect(0,0,width,height);bx.fillStyle='white';bx.fillRect(0,0,width,height);
 bx.globalAlpha=view==='draw'?settings.opacity/100:1;
 bx.drawImage(view==='original'?original:template,0,0);bx.globalAlpha=1;
}
function setView(next){finishStroke();view=next;
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 $('drawControls').hidden=view!=='draw';$('templateControls').hidden=view!=='template';
 $('drawingHint').hidden=view!=='draw';$('stage').classList.toggle('drawing',view==='draw');
 $('exportHint').textContent=view==='draw'?'Speichert deine Striche mit der blassen Vorlage auf weissem Papier.':'Speichert die schwarze Vorlage auf weissem Papier.';
 renderBase();
}
function setBusy(value){busy=value;
 for(const id of ['camera','gallery','newImage'])$(id).disabled=value||!ready;
 updateExportState();
}
function updateExportState(){for(const id of ['download','print','share'])$(id).disabled=busy||processing||!source;}
function acceptLines(id,pixels,error){
 if(id!==processId)return;
 if(error){processing=false;updateExportState();status('Die Vorlage konnte nicht erstellt werden. Bitte anderes Bild versuchen.',true);return;}
 template.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
 processing=false;updateExportState();renderBase();
 if(savedRevision===revision)status('Auf diesem Gerät gespeichert.');
 else if(db)status('Vorlage bereit. Änderungen werden lokal gespeichert …');
 else status('Vorlage bereit. Nur in dieser Sitzung – bitte PNG sichern.',true);
}
function generate(){
 if(!source)return;const id=++processId;processing=true;updateExportState();status('Linien werden auf deinem Gerät gezeichnet …');
 const pixels=original.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
 if(worker){worker.postMessage({id,width,height,detail:settings.detail,pixels:pixels.buffer},[pixels.buffer]);}
 else {setTimeout(()=>{try{acceptLines(id,extractLines(pixels,width,height,settings.detail).buffer);}catch(e){acceptLines(id,null,e.message);}},20);}
}
try{worker=new Worker('./worker.js',{type:'module'});worker.onmessage=({data})=>acceptLines(data.id,data.pixels,data.error);
 worker.onerror=()=>{worker.terminate();worker=null;if(source)generate();};}catch(e){worker=null;}
async function decodeImage(file){
 // Native browser decoding applies orientation; no server conversion or remote requests.
 const url=URL.createObjectURL(file),img=new Image();img.decoding='async';
 try{await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('Dieses Bildformat kann dein Browser nicht öffnen. Bitte JPG, PNG oder WebP verwenden.'));img.src=url;});
 if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>80000000)throw new Error('Dieses Bild ist zu gross. Bitte ein kleineres Foto auswählen.');
 return img;
 }finally{URL.revokeObjectURL(url);}
}
async function prepareImage(file){
 if(file.size>30*1024*1024)throw new Error('Das Bild ist grösser als 30 MB. Bitte ein kleineres Foto auswählen.');
 const img=await decodeImage(file), size=fitSize(img.naturalWidth,img.naturalHeight);
 const canvas=document.createElement('canvas');Object.assign(canvas,size);
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(img,0,0,size.width,size.height);
 return canvas;
}
function mountImage(canvas){
 width=canvas.width;height=canvas.height;
 for(const c of [base,ink,original,template]){c.width=width;c.height=height;}
 original.getContext('2d',{willReadFrequently:true}).drawImage(canvas,0,0);
 const tx=template.getContext('2d');tx.fillStyle='white';tx.fillRect(0,0,width,height);
 $('editor').hidden=false;$('empty').hidden=true;$('newImage').hidden=false;
 redrawInk();generate();setView('template');
}
async function importFile(file){
 if(!file||imageBusy)return;imageBusy=true;setBusy(true);status('Bild wird geöffnet …');
 try{
  // Decode before replacing anything. Failed imports leave the previous project intact.
  const canvas=await prepareImage(file);finishStroke();
  source=file;history={strokes:[],redo:[]};mountImage(canvas);markDirty();
 }catch(e){status(e.message||'Bild konnte nicht geöffnet werden.',true);}
 finally{imageBusy=false;setBusy(false);}
}
function confirmReplacement(action){
 if(busy)return;
 if(!source){action();return;}
 finishStroke();replacementAction=action;
 $('replaceMessage').textContent=(savedRevision!==revision?'Die letzten Änderungen sind noch nicht sicher gespeichert. ':'')+'Das bisherige Projekt wird ersetzt. Speichere wichtige Zeichnungen vorher als PNG. Ein abgebrochener Dateidialog lässt dein Projekt unverändert.';
 $('replaceDialog').showModal();
}
$('cancelReplace').onclick=()=>{$('replaceDialog').close();replacementAction=null;};
$('confirmReplace').onclick=()=>{const action=replacementAction;replacementAction=null;$('replaceDialog').close();action?.();};
$('replaceDialog').addEventListener('cancel',()=>{replacementAction=null;});
$('camera').onclick=()=>confirmReplacement(()=>$('cameraInput').click());
$('gallery').onclick=()=>confirmReplacement(()=>$('galleryInput').click());
$('newImage').onclick=()=>confirmReplacement(()=>$('galleryInput').click());
for(const id of ['cameraInput','galleryInput'])$(id).onchange=e=>{const file=e.target.files[0];e.target.value='';importFile(file);};
document.addEventListener('paste',e=>{
 if(!ready||busy||$('replaceDialog').open)return;
 const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));
 if(item){const file=item.getAsFile();if(file){e.preventDefault();confirmReplacement(()=>importFile(file));}}
});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('detail').oninput=()=>{settings.detail=Number($('detail').value);$('detailValue').textContent=settings.detail;
 clearTimeout(detailTimer);processId++;processing=true;updateExportState();detailTimer=setTimeout(generate,160);markDirty();};
$('width').oninput=()=>{settings.width=Number($('width').value);$('widthValue').textContent=settings.width;markDirty();};
$('opacity').oninput=()=>{settings.opacity=Number($('opacity').value);$('opacityValue').textContent=settings.opacity+' %';renderBase();markDirty();};
$('penOnly').onchange=()=>{finishStroke();settings.penOnly=$('penOnly').checked;markDirty();};
function selectTool(t){finishStroke();tool=t;$('pen').setAttribute('aria-pressed',String(t==='pen'));$('eraser').setAttribute('aria-pressed',String(t==='eraser'));}
$('pen').onclick=()=>selectTool('pen');$('eraser').onclick=()=>selectTool('eraser');
$('undo').onclick=()=>{finishStroke();history=undo(history);redrawInk();markDirty();};
$('redo').onclick=()=>{finishStroke();history=redo(history);redrawInk();markDirty();};
let pointerId=null;
function eventPoint(e){return {...mapPoint(e.clientX,e.clientY,ink.getBoundingClientRect(),width,height),pressure:e.pointerType==='pen'&&e.pressure>0?Math.max(.25,e.pressure*1.5):1};}
ink.addEventListener('pointerdown',e=>{
 if(view!=='draw'||busy||pointerId!==null||e.button!==0||settings.penOnly&&e.pointerType!=='pen')return;
 e.preventDefault();pointerId=e.pointerId;ink.setPointerCapture(pointerId);
 active={tool,width:settings.width,points:[eventPoint(e)]};paintStroke(ix,active);
});
ink.addEventListener('pointermove',e=>{
 if(e.pointerId!==pointerId||!active)return;e.preventDefault();
 for(const ev of (e.getCoalescedEvents?.()||[e])){
  const prev=active.points.at(-1),p=eventPoint(ev);active.points.push(p);
  paintStroke(ix,{...active,points:[prev,p]});
 }
});
function finishStroke(){
 if(!active)return;
 history=addStroke(history,active);active=null;
 const id=pointerId;pointerId=null;
 if(id!==null&&ink.hasPointerCapture(id))ink.releasePointerCapture(id);
 updateHistoryUI();markDirty();
}
ink.addEventListener('pointerup',e=>{if(e.pointerId===pointerId)finishStroke();});
ink.addEventListener('pointercancel',e=>{if(e.pointerId===pointerId)finishStroke();});
ink.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointerId)finishStroke();});
function exportCanvas(drawing){
 finishStroke();const c=document.createElement('canvas');c.width=width;c.height=height;
 const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
 ctx.globalAlpha=drawing?settings.opacity/100:1;ctx.drawImage(template,0,0);ctx.globalAlpha=1;
 if(drawing)ctx.drawImage(ink,0,0);return c;
}
function pngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG konnte nicht erstellt werden.')),'image/png'));}
$('download').onclick=async()=>{try{
 const drawing=view==='draw',blob=await pngBlob(exportCanvas(drawing)),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=drawing?'meine-zeichnung.png':'meine-malvorlage.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){status(e.message,true);}};
$('print').onclick=()=>{try{const img=$('printImage');img.onload=()=>window.print();img.src=exportCanvas(false).toDataURL('image/png');}catch(e){status('Drucken ist hier nicht möglich. Speichere die Vorlage als PNG.',true);}};
if(navigator.share&&navigator.canShare){$('share').hidden=false;}
$('share').onclick=async()=>{try{const file=new File([await pngBlob(exportCanvas(view==='draw'))],'malvorlage.png',{type:'image/png'});
 if(!navigator.canShare({files:[file]})){status('Bild teilen wird hier nicht unterstützt. Bitte PNG speichern.');return;}
 await navigator.share({files:[file],title:'Meine Malvorlage'});
 }catch(e){if(e.name!=='AbortError')status('Teilen nicht möglich. Bitte PNG speichern.',true);}};
async function init(){
 updateSettingsUI();
 try{db=await openDB();db.onversionchange=()=>{db.close();db=null;status('Lokaler Speicher wurde geändert. Bitte App neu öffnen.',true);};
 const saved=await store('readonly',s=>s.get('current'));
 if(saved&&saved.version===1&&saved.source instanceof Blob){
   const canvas=await prepareImage(saved.source);
   const s=saved.settings||{};
   settings={detail:Math.max(0,Math.min(100,Number(s.detail)||0)),width:Math.max(1,Math.min(35,Number(s.width)||5)),opacity:Math.max(0,Math.min(70,Number(s.opacity)||0)),penOnly:!!s.penOnly};
   source=saved.source;history=saved.history||{strokes:[],redo:[]};savedRevision=revision;
   updateSettingsUI();mountImage(canvas);status('Dein letztes Projekt wurde geöffnet.');
 }else status('Bereit für dein erstes Bild.');
 }catch(e){status('Lokaler Speicher ist nicht verfügbar. Deine Bilder funktionieren trotzdem; bitte PNG sichern.',true);db=null;}
 ready=true;setBusy(false);
 if('serviceWorker' in navigator){
  try{await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;
   const showOffline=()=>{$('offlineStatus').textContent=navigator.serviceWorker.controller?'Offline bereit auf diesem Gerät.':'Offline-Speicherung wird vorbereitet. Bitte später erneut öffnen.';};
   showOffline();navigator.serviceWorker.addEventListener('controllerchange',showOffline);
  }catch(e){$('offlineStatus').textContent='Offline-Speicherung nicht verfügbar. Die App braucht beim Öffnen eine Verbindung.';}
 }
}
init();
