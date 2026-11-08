// Pure, browser-independent image and drawing helpers. No network or storage.
export function fitSize(w, h, max = 1440) {
  if (!(w > 0 && h > 0 && max > 0)) throw new Error('Ungültige Bildgrösse');
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w*s)), height: Math.max(1, Math.round(h*s)) };
}
export function mapPoint(x, y, rect, width, height) {
  return { x: Math.max(0, Math.min(width, (x-rect.left)*width/rect.width)),
    y: Math.max(0, Math.min(height, (y-rect.top)*height/rect.height)) };
}
// Synthetic events and some browser dispatch paths return an empty coalesced list.
// An empty array is truthy: always fall back to the actual move in that case.
export function pointerSamples(event) {
  const samples = event.getCoalescedEvents?.();
  return samples?.length ? samples : [event];
}
export function addStroke(history, stroke) { return { strokes: [...history.strokes, stroke], redo: [] }; }
export function undo(history) {
  if (!history.strokes.length) return history;
  return { strokes: history.strokes.slice(0,-1), redo: [...history.redo, history.strokes.at(-1)] };
}
export function redo(history) {
  if (!history.redo.length) return history;
  return { strokes: [...history.strokes, history.redo.at(-1)], redo: history.redo.slice(0,-1) };
}
// A fixed smoothing pass makes increasing detail strictly lower the edge threshold.
// Transparent pixels are composited onto white before luminance conversion.
export function extractLines(rgba, w, h, detail = 50) {
  if (rgba.length !== w*h*4) throw new Error('Ungültige Bilddaten');
  const gray = new Float32Array(w*h), blur = new Float32Array(w*h);
  for (let i=0;i<w*h;i++) {
    const p=i*4,a=rgba[p+3]/255;
    gray[i]=(rgba[p]*.299+rgba[p+1]*.587+rgba[p+2]*.114)*a+255*(1-a);
  }
  // Separable 1-2-1 Gaussian; clamp borders.
  const tmp = new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=y*w+x; tmp[i]=(gray[y*w+Math.max(0,x-1)]+2*gray[i]+gray[y*w+Math.min(w-1,x+1)])/4;
  }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=y*w+x; blur[i]=(tmp[Math.max(0,y-1)*w+x]+2*tmp[i]+tmp[Math.min(h-1,y+1)*w+x])/4;
  }
  const out = new Uint8ClampedArray(w*h*4); out.fill(255);
  const threshold = 165 - Math.max(0,Math.min(100,detail))*1.45;
  const magnitudes = new Float32Array(w*h), directions = new Uint8Array(w*h);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
    const i=y*w+x;
    const gx=-blur[i-w-1]+blur[i-w+1]-2*blur[i-1]+2*blur[i+1]-blur[i+w-1]+blur[i+w+1];
    const gy=-blur[i-w-1]-2*blur[i-w]-blur[i-w+1]+blur[i+w-1]+2*blur[i+w]+blur[i+w+1];
    magnitudes[i]=Math.hypot(gx,gy);
    const angle=(Math.atan2(gy,gx)*180/Math.PI+180)%180;
    directions[i]=angle<22.5||angle>=157.5?0:angle<67.5?1:angle<112.5?2:3;
  }
  // Non-maximum suppression keeps outlines narrow rather than thick dark bands.
  const offsets=[1,w+1,w,w-1];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
    const i=y*w+x,m=magnitudes[i],o=offsets[directions[i]];
    if(m>=threshold && m>=magnitudes[i-o] && m>=magnitudes[i+o]) {
      out[i*4]=out[i*4+1]=out[i*4+2]=0;
    }
  }
  return out;
}
export function paintStroke(ctx, stroke) {
  ctx.save(); ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
  ctx.strokeStyle='#202c32'; ctx.fillStyle='#202c32'; ctx.lineCap='round'; ctx.lineJoin='round';
  const pts=stroke.points;
  for(let i=0;i<pts.length;i++) {
    const p=pts[i], prev=pts[Math.max(0,i-1)];
    const size=stroke.width*(p.pressure || 1);
    ctx.lineWidth=size;
    if(i===0) { ctx.beginPath();ctx.arc(p.x,p.y,size/2,0,Math.PI*2);ctx.fill(); }
    else {ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();}
  }
  ctx.restore();
}
