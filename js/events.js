// Tiny internal event bus for dunno extensions.
// Fires at existing hook points; listeners never see raw pane objects.

const _listeners = new Map(); // event -> Set<fn>
const _wildcards = new Set();

export function on(event, fn) {
  if (event === '*') {
    _wildcards.add(fn);
    return () => { _wildcards.delete(fn); };
  }
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  if (event === '*') { _wildcards.delete(fn); return; }
  _listeners.get(event)?.delete(fn);
}

export function emit(event, ...args) {
  _wildcards.forEach(fn => {
    try { fn(event, ...args); } catch (e) { console.error('dunno event error:', e); }
  });
  _listeners.get(event)?.forEach(fn => {
    try { fn(...args); } catch (e) { console.error('dunno event error:', e); }
  });
}
