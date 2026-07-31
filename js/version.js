// Sentinel replaced by bundle.go at weave time; fetched from manifest at runtime.
export let VERSION = '__DUNNO_VERSION__';

export async function loadVersion() {
  // In the woven single-file build, bundle.go already replaces the sentinel
  // above with the real version at build time — no manifest.json ships
  // alongside dist/dunno.html, so skip the network round-trip (it would
  // otherwise always fail, e.g. under file:// or when the file is moved).
  if (VERSION !== '__DUNNO_VERSION__') return;
  try {
    const r = await fetch('manifest.json');
    const m = await r.json();
    if (m.version) VERSION = m.version;
  } catch {}
}
