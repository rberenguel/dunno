const _registry = new Map();

export function register(name, fn) {
  _registry.set(name.toLowerCase(), fn);
}

export function execute(name, ctx) {
  const fn = _registry.get((name || '').toLowerCase());
  if (!fn) return false;
  fn(ctx);
  return true;
}

export function isCommand(name) {
  return _registry.has((name || '').toLowerCase());
}
