// Gnuplot-compatible (reduced) parser and SVG renderer.
//
// Supported:
//   set title / xlabel / ylabel / xrange / yrange / grid / key / datafile separator
//   plot "-" using X:Y with lines|points|linespoints|dots|impulses|boxes|bars|area|steps title "..."
//
// "-" always refers to the data pane (equivalent to stdin in real gnuplot).
// Multiple series separated by commas.

const COLORS = ['#5599ff','#ff6644','#44cc88','#ffaa22','#cc55ff','#44ddcc','#ff4488','#aacc22'];

// ── Parser ─────────────────────────────────────────────────────────────────────

export function parsePlotSpec(text) {
  const spec = {
    title: '', xlabel: '', ylabel: '',
    xrange: null, yrange: null,
    grid: false, key: 'top right',
    separator: null,
    series: [],
  };
  const src = text.replace(/\\\n\s*/g, ' ');
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    _cmd(line, spec);
  }
  return spec;
}

function _cmd(line, spec) {
  let m;
  if ((m = line.match(/^set\s+(\w+)\s*(.*)/s))) {
    _set(m[1], m[2].trim(), spec);
  } else if (line.match(/^plot(\s|$)/)) {
    spec.series = _plotArgs(line.slice(4).trim());
  }
}

function _set(key, rest, spec) {
  switch (key) {
    case 'title':    spec.title  = _str(rest); break;
    case 'xlabel':   spec.xlabel = _str(rest); break;
    case 'ylabel':   spec.ylabel = _str(rest); break;
    case 'xrange':   spec.xrange = _range(rest); break;
    case 'yrange':   spec.yrange = _range(rest); break;
    case 'grid':     spec.grid   = !rest.startsWith('no'); break;
    case 'key':      spec.key    = rest || 'top right'; break;
    case 'datafile': {
      const m = rest.match(/separator\s+["']?([^"'\s]+)["']?/);
      if (m) spec.separator = (m[1] === 'tab' || m[1] === '\\t') ? '\t' : m[1];
      break;
    }
  }
}

function _str(s)  { const m = s.match(/^["'](.*)["']$/); return m ? m[1] : s; }
function _range(s) {
  const m = s.match(/\[\s*([^:\]]+)\s*:\s*([^\]]+)\s*\]/);
  if (!m) return null;
  const lo = m[1].trim(), hi = m[2].trim();
  return [lo === '*' ? null : +lo, hi === '*' ? null : +hi];
}

function _plotArgs(s) { return _splitSeries(s).map(_series); }

function _splitSeries(s) {
  const out = []; let depth = 0, inStr = false, ch = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === ch) inStr = false; }
    else if (c === '"' || c === "'") { inStr = true; ch = c; }
    else if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ',' && !depth) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

function _series(s) {
  const ser = { using: [1, 2], style: 'lines', title: null };
  // Strip source token (filename or "-") — we always use the data pane
  s = s.replace(/^["'][^"']*["']\s*/, '').replace(/^-\s*/, '');
  let m;
  if ((m = s.match(/\busing\s+([\d:]+)/))) {
    const cols = m[1].split(':').map(Number);
    // Column 0 = record number (gnuplot convention)
    ser.using = cols.length >= 2 ? [cols[0], cols[1]] : [0, cols[0]];
  }
  if ((m = s.match(/\bwith\s+(\w+)/)))              ser.style = m[1];
  if ((m = s.match(/\btitle\s+["']([^"']*)["']/)))  ser.title = m[1];
  return ser;
}

// ── Data parser ────────────────────────────────────────────────────────────────

function _parseData(text, separator) {
  const lines = text.trim().split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!lines.length) return { headers: [], rows: [] };

  const sep = separator ??
    (lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null);
  const split = sep ? l => l.split(sep).map(s => s.trim())
                     : l => l.trim().split(/\s+/);

  const raw = lines.map(split);
  let headers = [], rows = raw;
  if (raw[0].some(v => v && isNaN(+v))) { headers = raw[0]; rows = raw.slice(1); }
  return { headers, rows: rows.map(r => r.map(Number)) };
}

// ── SVG renderer ───────────────────────────────────────────────────────────────

const VW = 700, VH = 440;
const M  = { top: 38, right: 28, bottom: 54, left: 64 };
const PW = VW - M.left - M.right;
const PH = VH - M.top  - M.bottom;

export function renderSVG(spec, dataText) {
  const { rows } = _parseData(dataText, spec.separator);
  if (!rows.length) return _err('No data');

  // Collect all X and Y values across series to compute domains
  const allX = [], allY = [];
  for (const s of spec.series) {
    rows.forEach((row, ri) => {
      const x = s.using[0] === 0 ? ri + 1 : row[s.using[0] - 1];
      const y = row[s.using[1] - 1];
      if (isFinite(x)) allX.push(x);
      if (isFinite(y)) allY.push(y);
    });
  }
  if (!allX.length || !allY.length) return _err('No numeric data');

  const xd = _domain(allX, spec.xrange, false);
  const yd = _domain(allY, spec.yrange, _needsZero(spec));
  const xs = v => (v - xd[0]) / (xd[1] - xd[0]) * PW;
  const ys = v => PH - (v - yd[0]) / (yd[1] - yd[0]) * PH;

  const xTicks = _ticks(...xd);
  const yTicks = _ticks(...yd);

  let g = '';

  // Grid
  if (spec.grid) {
    for (const t of xTicks)
      g += `<line x1="${f(xs(t))}" y1="0" x2="${f(xs(t))}" y2="${PH}" stroke="#1e1e3a" stroke-width="1"/>`;
    for (const t of yTicks)
      g += `<line x1="0" y1="${f(ys(t))}" x2="${PW}" y2="${f(ys(t))}" stroke="#1e1e3a" stroke-width="1"/>`;
  }

  // Zero lines (if in range)
  if (xd[0] < 0 && xd[1] > 0)
    g += `<line x1="${f(xs(0))}" y1="0" x2="${f(xs(0))}" y2="${PH}" stroke="#44445a" stroke-width="1"/>`;
  if (yd[0] < 0 && yd[1] > 0)
    g += `<line x1="0" y1="${f(ys(0))}" x2="${PW}" y2="${f(ys(0))}" stroke="#44445a" stroke-width="1"/>`;

  // Series (clipped)
  g += `<g clip-path="url(#pa)">`;
  spec.series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length];
    const pts = rows.map((row, ri) => [
      s.using[0] === 0 ? ri + 1 : row[s.using[0] - 1],
      row[s.using[1] - 1],
    ]).filter(([x, y]) => isFinite(x) && isFinite(y));
    g += _renderSeries(pts, s.style, color, xs, ys);
  });
  g += '</g>';

  // Axes
  g += `<line x1="0" y1="0" x2="0" y2="${PH}" stroke="#7777aa" stroke-width="1.5"/>`;
  g += `<line x1="0" y1="${PH}" x2="${PW}" y2="${PH}" stroke="#7777aa" stroke-width="1.5"/>`;

  // X ticks + labels
  for (const t of xTicks) {
    const x = xs(t); if (x < -1 || x > PW + 1) continue;
    g += `<line x1="${f(x)}" y1="${PH}" x2="${f(x)}" y2="${PH + 5}" stroke="#7777aa"/>`;
    g += `<text x="${f(x)}" y="${PH + 18}" text-anchor="middle" fill="#8888aa" font-size="11" font-family="monospace">${_ft(t)}</text>`;
  }

  // Y ticks + labels
  for (const t of yTicks) {
    const y = ys(t); if (y < -1 || y > PH + 1) continue;
    g += `<line x1="-5" y1="${f(y)}" x2="0" y2="${f(y)}" stroke="#7777aa"/>`;
    g += `<text x="-8" y="${f(y + 4)}" text-anchor="end" fill="#8888aa" font-size="11" font-family="monospace">${_ft(t)}</text>`;
  }

  // Axis labels
  if (spec.xlabel) g += `<text x="${PW/2}" y="${PH+44}" text-anchor="middle" fill="#aaaacc" font-size="13" font-family="sans-serif">${_e(spec.xlabel)}</text>`;
  if (spec.ylabel) g += `<text x="${-PH/2}" y="-50" text-anchor="middle" fill="#aaaacc" font-size="13" font-family="sans-serif" transform="rotate(-90)">${_e(spec.ylabel)}</text>`;
  if (spec.title)  g += `<text x="${PW/2}" y="-14" text-anchor="middle" fill="#ddddff" font-size="15" font-weight="bold" font-family="sans-serif">${_e(spec.title)}</text>`;

  // Legend
  if (spec.key !== 'off') {
    const labeled = spec.series.filter(s => s.title !== null);
    labeled.forEach((s, i) => {
      const color = COLORS[spec.series.indexOf(s) % COLORS.length];
      const ly = 8 + i * 20, lx = PW - 10;
      g += `<line x1="${lx-22}" y1="${ly+5}" x2="${lx-4}" y2="${ly+5}" stroke="${color}" stroke-width="2"/>`;
      g += `<text x="${lx-26}" y="${ly+9}" text-anchor="end" fill="#aaaacc" font-size="11" font-family="sans-serif">${_e(s.title)}</text>`;
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet">
<rect width="${VW}" height="${VH}" fill="#0d0e1a"/>
<defs><clipPath id="pa"><rect x="0" y="0" width="${PW}" height="${PH}"/></clipPath></defs>
<g transform="translate(${M.left},${M.top})">${g}</g>
</svg>`;
}

// ── Series renderers ───────────────────────────────────────────────────────────

function _renderSeries(pts, style, color, xs, ys) {
  if (!pts.length) return '';
  switch (style) {
    case 'points':
      return pts.map(([x,y]) => `<circle cx="${f(xs(x))}" cy="${f(ys(y))}" r="3.5" fill="${color}"/>`).join('');
    case 'dots':
      return pts.map(([x,y]) => `<circle cx="${f(xs(x))}" cy="${f(ys(y))}" r="1.5" fill="${color}"/>`).join('');
    case 'linespoints':
      return _renderSeries(pts,'lines',color,xs,ys) + _renderSeries(pts,'points',color,xs,ys);
    case 'impulses': {
      const y0 = f(ys(0));
      return pts.map(([x,y]) => `<line x1="${f(xs(x))}" y1="${y0}" x2="${f(xs(x))}" y2="${f(ys(y))}" stroke="${color}" stroke-width="1.5"/>`).join('');
    }
    case 'boxes':
    case 'bars': {
      const y0 = ys(0);
      const bw = pts.length > 1
        ? Math.max(2, (xs(pts[1][0]) - xs(pts[0][0])) * 0.75)
        : 10;
      return pts.map(([x,y]) => {
        const px = xs(x), py = ys(y);
        return `<rect x="${f(px-bw/2)}" y="${f(Math.min(py,y0))}" width="${f(bw)}" height="${f(Math.abs(py-y0))}" fill="${color}" fill-opacity="0.75"/>`;
      }).join('');
    }
    case 'area': {
      const y0 = ys(0);
      const d = `M${f(xs(pts[0][0]))},${f(y0)} ` +
        pts.map(([x,y]) => `L${f(xs(x))},${f(ys(y))}`).join(' ') +
        ` L${f(xs(pts[pts.length-1][0]))},${f(y0)} Z`;
      return `<path d="${d}" fill="${color}" fill-opacity="0.25"/>` +
             _renderSeries(pts, 'lines', color, xs, ys);
    }
    case 'steps': {
      let d = `M${f(xs(pts[0][0]))},${f(ys(pts[0][1]))}`;
      for (let i = 1; i < pts.length; i++)
        d += ` H${f(xs(pts[i][0]))} V${f(ys(pts[i][1]))}`;
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    }
    default: { // lines
      const d = pts.map(([x,y],i) => `${i?'L':'M'}${f(xs(x))},${f(ys(y))}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const f = n => n.toFixed(1);

function _needsZero(spec) {
  return spec.series.some(s => ['bars','boxes','impulses','area'].includes(s.style));
}

function _domain(vals, override, extendZero) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (extendZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi)  { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.05;
  lo -= pad; hi += pad;
  if (override) {
    if (override[0] != null) lo = override[0];
    if (override[1] != null) hi = override[1];
  }
  return [lo, hi];
}

function _ticks(lo, hi, n = 5) {
  const rng = hi - lo;
  const raw = rng / n;
  const exp = Math.floor(Math.log10(raw));
  const frac = raw / 10 ** exp;
  const nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  const step = nice * 10 ** exp;
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let t = start; t <= hi + step * 1e-9; t = +(t + step).toPrecision(12))
    out.push(t);
  return out;
}

function _ft(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  return (a >= 1e6 || a < 0.01) ? v.toExponential(1) : String(+v.toPrecision(6));
}

function _e(s) {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _err(msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 80"><rect width="400" height="80" fill="#0d0e1a"/><text x="200" y="45" text-anchor="middle" fill="#ff6644" font-size="14" font-family="sans-serif">${_e(msg)}</text></svg>`;
}
