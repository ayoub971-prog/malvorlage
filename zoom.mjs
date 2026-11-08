/** Width-only zoom: canvas backing stores and export pixels are never changed. */
export const clamp = (value, min = 1, max = 5) => Math.min(max, Math.max(min, value));
export function anchoredScroll(scroll, center, oldScale, newScale) {
  return Math.max(0, (scroll + center) * newScale / oldScale - center);
}
export function createZoom({viewport, stage, minus, plus, fit, output, panButton,
  hint, shouldPanTouch = () => false, beforePan = () => {}, onChange = () => {},
  step = 1.25, observeResize = true, getAspectRatio = () => Infinity}) {
  if (!(step > 1) || !Number.isFinite(step)) throw new TypeError('step must be finite and > 1');
  let scale = 1, panMode = false, gesture = null, destroyed = false;
  let basePercent = 1;
  function fitBase() {
    const aspect = getAspectRatio();
    basePercent = viewport.clientWidth > 0 && aspect > 0
      ? Math.min(1, viewport.clientHeight * aspect / viewport.clientWidth) : 1;
  }
  fitBase();
  const contacts = new Map(), owned = new Set(), suppressed = new Set();
  let acquiring = false;
  const disposers = [];
  const previous = {width: stage.style.width, touchAction: viewport.style.touchAction};
  viewport.style.touchAction = 'none';
  const listen = (node, type, fn, options) => {
    if (!node) return;
    node.addEventListener(type, fn, options);
    disposers.push(() => node.removeEventListener(type, fn, options));
  };
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  function render() {
    stage.style.width = `${basePercent * scale * 100}%`;
    if (minus) minus.disabled = scale <= 1;
    if (plus) plus.disabled = scale >= 5;
    if (fit) fit.disabled = scale === 1 && !viewport.scrollLeft && !viewport.scrollTop;
    if (output) output.textContent = `${Math.round(scale * 100)} %`;
    if (panButton) panButton.setAttribute('aria-pressed', String(panMode));
    if (hint) hint.textContent = panMode ? 'Verschieben: Bild mit Stift oder Finger bewegen.' :
      'Zwei Finger: vergrössern und verkleinern. Verschieben: Bild bewegen. Im Nur-S-Pen-Modus bewegt auch ein Finger das Bild.';
    onChange({scale, percent: Math.round(scale * 100), panMode});
  }
  function release(id) {
    try { viewport.releasePointerCapture(id); } catch { /* already released */ }
  }
  function end() {
    const ids = [...owned];
    for (const id of ids) suppressed.add(id);
    contacts.clear(); owned.clear(); gesture = null;
    ids.forEach(release);
  }
  function local(p) {
    const rect = viewport.getBoundingClientRect();
    return {x:p.x - rect.left - (viewport.clientLeft || 0),
      y:p.y - rect.top - (viewport.clientTop || 0)};
  }
  function geometry() {
    const points = [...contacts.entries()].filter(([id]) => owned.has(id));
    const touches = points.filter(([,p]) => p.type === 'touch');
    const chosen = touches.length >= 2 ? touches.slice(0,2) : points.slice(0,1);
    if (!chosen.length) return null;
    const p = local(chosen[0][1]), q = chosen[1] ? local(chosen[1][1]) : p;
    return {x:(p.x+q.x)/2, y:(p.y+q.y)/2,
      distance: chosen.length === 2 ? Math.hypot(p.x-q.x,p.y-q.y) : 0};
  }
  function rebase() {
    const g = geometry();
    gesture = g && {...g, scale, anchorX:(viewport.scrollLeft+g.x)/scale,
      anchorY:(viewport.scrollTop+g.y)/scale};
  }
  function acquire() {
    // Ink's old lostpointercapture can bubble during cancellation; it is not ours.
    acquiring = true;
    try {
      if (!owned.size) beforePan();
      for (const id of contacts.keys()) {
        owned.add(id);
        try { viewport.setPointerCapture(id); } catch { /* continue consuming safely */ }
      }
    } finally { acquiring = false; }
    rebase();
  }
  function setZoom(value, {reset = false} = {}) {
    if (destroyed) return;
    if (!Number.isFinite(value)) throw new TypeError('zoom must be finite');
    end();
    const next = clamp(value), old = scale;
    const x = anchoredScroll(viewport.scrollLeft, viewport.clientWidth / 2, old, next);
    const y = anchoredScroll(viewport.scrollTop, viewport.clientHeight / 2, old, next);
    scale = next;
    stage.style.width = `${basePercent * scale * 100}%`;
    // Width writes precede scroll writes so browsers clamp against the new layout.
    viewport.scrollLeft = reset ? 0 : x;
    viewport.scrollTop = reset ? 0 : y;
    render();
  }
  function reset() { fitBase(); setZoom(1, {reset: true}); }
  function setPanMode(value) { end(); panMode = Boolean(value); render(); }
  function down(e) {
    if (destroyed || (e.button !== undefined && e.button !== 0)) return;
    suppressed.delete(e.pointerId); // Pointer ids may be reused by a normal pen stroke.
    const touch = e.pointerType === 'touch';
    if (!touch && !panMode) return; // Normal pen drawing is never consumed.
    contacts.set(e.pointerId, {x:e.clientX,y:e.clientY,type:e.pointerType});
    if (owned.size || panMode || (touch && shouldPanTouch()) ||
        [...contacts.values()].filter(p => p.type === 'touch').length >= 2) {
      consume(e); acquire();
    }
  }
  function move(e) {
    if (suppressed.has(e.pointerId)) { consume(e); return; }
    const point = contacts.get(e.pointerId);
    if (!point) return;
    point.x = e.clientX; point.y = e.clientY;
    if (!owned.has(e.pointerId)) return;
    consume(e);
    const g = geometry();
    if (!g || !gesture) return;
    if (gesture.distance > 0 && g.distance > 0) {
      scale = clamp(gesture.scale * g.distance / gesture.distance);
    }
    stage.style.width = `${basePercent * scale * 100}%`;
    viewport.scrollLeft = Math.max(0, gesture.anchorX * scale - g.x);
    viewport.scrollTop = Math.max(0, gesture.anchorY * scale - g.y);
    render();
  }
  function up(e) {
    if (suppressed.delete(e.pointerId)) { consume(e); return; }
    const wasOwned = owned.delete(e.pointerId);
    contacts.delete(e.pointerId);
    if (!wasOwned) return;
    consume(e);
    // Remove before release: synchronous lostcapture cannot terminate a survivor.
    release(e.pointerId); rebase(); render();
  }
  function lost(e) {
    if (e.target !== viewport || acquiring) return;
    if (owned.has(e.pointerId)) {
      // Keep terminal events suppressed: cancellation must not finish an ink stroke.
      suppressed.add(e.pointerId);
      owned.delete(e.pointerId); contacts.delete(e.pointerId); rebase();
      consume(e);
    }
  }
  const capture = {capture: true, passive: false};
  listen(viewport, 'pointerdown', down, capture);
  listen(viewport, 'pointermove', move, capture);
  listen(viewport, 'pointerup', up, capture);
  listen(viewport, 'pointercancel', up, capture);
  listen(viewport, 'lostpointercapture', lost, capture);
  listen(minus, 'click', () => setZoom(scale / step));
  listen(plus, 'click', () => setZoom(scale * step));
  listen(fit, 'click', reset);
  listen(panButton, 'click', () => setPanMode(!panMode));
  let observer;
  function outerSize() {
    const rect = viewport.getBoundingClientRect?.();
    // Client dimensions change when zoom itself introduces scrollbars. Only
    // actual outer layout changes should refit. Fallback supports minimal fakes.
    return {width: Number.isFinite(rect?.width) ? rect.width : viewport.clientWidth,
      height: Number.isFinite(rect?.height) ? rect.height : viewport.clientHeight};
  }
  let measured = outerSize();
  function resize() {
    if (destroyed) return;
    const next = outerSize();
    if (next.width === measured.width && next.height === measured.height) return;
    measured = next; reset();
  }
  if (observeResize && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize);
    try { observer.observe(viewport, {box:'border-box'}); }
    catch { observer.observe(viewport); } // Older browsers: callback still compares outer box.
  }
  render();
  return {setZoom, fit: reset, reset, resize, setPanMode,
    get scale() { return scale; },
    destroy() { end(); destroyed = true; observer?.disconnect();
      disposers.forEach(fn => fn()); suppressed.clear(); stage.style.width = previous.width;
      viewport.style.touchAction = previous.touchAction; }
  };
}
