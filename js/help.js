import { VERSION } from './version.js';

const SECTIONS = [
  { heading: 'Layout', items: [
    { cmd: 'New',    desc: 'Split current pane vertically' },
    { cmd: 'Newcol', desc: 'Add a new column to the right' },
    { cmd: 'Del',    desc: 'Delete the current pane' },
  ]},
  { heading: 'File', items: [
    { cmd: 'Load', desc: 'Open a file into this pane' },
    { cmd: 'Save', desc: 'Save to file (prompts if unsaved)' },
    { cmd: 'Get',  desc: 'Reload from file or restore session' },
  ]},
  { heading: 'Edit', items: [
    { cmd: 'Find',    desc: 'Search in this pane' },
    { cmd: 'Replace', desc: 'Find & replace in this pane' },
    { cmd: 's/pat/rep/g', desc: 'Select an ed substitute, right-click anywhere to apply' },
  ]},
  { heading: 'View', items: [
    { cmd: 'Diff',    desc: 'Compare against the previously active pane' },
    { cmd: 'Plot',    desc: 'Render gnuplot spec (prev pane as data)' },
    { cmd: 'Eval',    desc: 'Run pane as JS; stdout → split pane' },
    { cmd: 'Preview', desc: 'Render pane as Markdown → HTML' },
  ]},
  { heading: 'Theme', items: [
    { cmd: 'dark',  desc: 'Switch to dark theme' },
    { cmd: 'light', desc: 'Switch to light theme' },
  ]},
  { heading: 'Keyboard', items: [
    { cmd: '⌘S / Ctrl+S', desc: 'Save session to localStorage' },
  ]},
];

const TOPICS = {
  plot: {
    title: 'Plot',
    body: `Plot renders a gnuplot-compatible spec from the current pane,
using the previously active pane as the data source.

<b>Supported set commands</b>
  set title "My chart"
  set xlabel "Time"
  set ylabel "Value"
  set xrange [0:100]
  set yrange [-1:1]
  set grid
  set key top left
  set datafile separator ","   (default: whitespace / auto-detect CSV)

<b>Plot command</b>
  plot "-" using 1:2 with lines title "Series A", \\
       "-" using 1:3 with points title "Series B"

<b>Styles</b>
  lines  points  linespoints  dots  impulses
  boxes  bars  area  steps

<b>Minimal example</b> (put in one pane, data in another)
  set title "Sine"
  set xlabel "x"
  plot "-" using 1:2 with lines title "sin(x)"

  Data pane:
  0    0
  1    0.841
  2    0.909
  3    0.141
  4   -0.757
  5   -0.959

<b>CSV example</b>
  set datafile separator ","
  set title "Revenue"
  plot "-" using 1:2 with bars title "Q1", \\
       "-" using 1:3 with bars title "Q2"

  Data pane:
  month,q1,q2
  Jan,120,95
  Feb,134,110
  Mar,148,127`,
  },

  diff: {
    title: 'Diff',
    body: `Diff compares the current pane against the previously active pane.

A colour-coded gutter appears on the left edge of the editor:
  red stripe   — line differs (deletion / change)
  green stripe — line only in the other pane (insertion)

Word-level differences are highlighted within changed line pairs.

Right-click <b>Diff</b> again on the same pane to dismiss the overlay.
The editor stays fully editable while the diff is shown.`,
  },

  eval: {
    title: 'Eval',
    body: `Eval runs the current pane's content as JavaScript in the browser.

console.log / warn / error are captured and shown in a split pane below.
The pane is reused on subsequent Eval runs (tag: eval-out Del).

<b>Example</b>
  const xs = [1,2,3,4,5];
  console.log(xs.map(x => x * x));

<b>Notes</b>
  • The code runs in a new Function() — module syntax not supported.
  • Return values are printed if non-undefined.
  • Errors are shown prefixed with !`,
  },

  preview: {
    title: 'Preview',
    body: `Preview renders the current pane as Markdown → HTML using marked v11.

The output appears in a split pane below (tag: preview Del).
Re-running Preview refreshes the same pane.

Supported: headings, bold/italic, code blocks, blockquotes,
           links, images, tables, horizontal rules.

<b>Tip</b>: combine with Load to preview a .md file from disk.`,
  },

  find: {
    title: 'Find / Replace',
    body: `Find opens a search bar at the bottom of the current pane.
Replace opens the same bar with an additional replacement field.

<b>Keyboard shortcuts in the bar</b>
  Enter / ↓   next match
  Shift+Enter / ↑   previous match
  Escape   close

<b>Replace buttons</b>
  →1    replace current match and advance
  →all  replace all matches

Matches are highlighted in the right-side gutter.
Search is case-insensitive string matching.`,
  },
};

// Normalise a topic string to a TOPICS key.
function _topic(sel) {
  if (!sel) return null;
  const key = sel.trim().toLowerCase().replace(/[^a-z]/g, '');
  return TOPICS[key] ? key : null;
}

function _renderTopic(key) {
  const { title, body } = TOPICS[key];
  return `<div class="help-content">
<h2>${title}</h2>
<div class="help-topic-body">${body}</div>
</div>`;
}

function _renderGeneral() {
  const sections = SECTIONS.map(({ heading, items }) => {
    const rows = items.map(({ cmd, desc }) =>
      `<div class="help-row"><span class="help-cmd">${cmd}</span><span class="help-desc">${desc}</span></div>`
    ).join('');
    return `<section class="help-section"><h3>${heading}</h3>${rows}</section>`;
  }).join('');
  return `<div class="help-content"><h2>dunno <span class="help-version">${VERSION}</span></h2>
<p class="help-inspiration">Inspired by Plan 9's Acme</p><p></p>
${sections}
<p class="help-tip">Tip: select a command name (e.g. <span class="help-cmd">plot</span>) then right-click <span class="help-cmd">Help</span> for details.</p>
</div>`;
}

export function renderHelpHTML(selection) {
  const key = _topic(selection);
  return key ? _renderTopic(key) : _renderGeneral();
}
