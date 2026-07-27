// Sentinel replaced by bundle.go at weave time; fetched from manifest at runtime.
export let VERSION = '__DUNNO_VERSION__';

export async function loadVersion() {
  try {
    const r = await fetch('manifest.json');
    const m = await r.json();
    if (m.version) VERSION = m.version;
  } catch {}
}
