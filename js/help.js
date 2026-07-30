import { VERSION } from './version.js';

const SECTIONS = [
  { heading: 'Layout', items: [
    { cmd: 'New',    desc: 'Split current pane vertically' },
    { cmd: 'Newcol', desc: 'Add a new column to the right' },
    { cmd: 'Swap',   desc: 'Toggle stacked/side-by-side with the previous pane' },
    { cmd: 'Del',    desc: 'Delete the current pane' },
    { cmd: 'Tab',    desc: 'New workspace tab' },
    { cmd: 'Deltab', desc: 'Close current workspace tab' },
    { cmd: 'Zoom',   desc: 'Toggle full-screen for this pane' },
  ]},
  { heading: 'File', items: [
    { cmd: 'Load', desc: 'Open a file into this pane' },
    { cmd: 'Save', desc: 'Save to file (prompts if unsaved)' },
    { cmd: 'Get',  desc: 'Reload from file or restore session' },
  ]},
  { heading: 'Edit', items: [
    { cmd: 'Find',    desc: 'Search in this pane' },
    { cmd: 'Replace', desc: 'Find & replace in this pane' },
    { cmd: 'Nums',    desc: 'Toggle line numbers' },
    { cmd: 'Now',     desc: 'Insert ISO timestamp at cursor' },
    { cmd: 'Copy',    desc: 'Copy pane body to clipboard' },
    { cmd: 'Sort',    desc: 'Sort lines (select num or column)' },
    { cmd: 'Trim',    desc: 'Strip trailing whitespace' },
    { cmd: 'Lower',   desc: 'To lowercase' },
    { cmd: 'Upper',   desc: 'To uppercase' },
    { cmd: 'Title',   desc: 'Title-case words' },
    { cmd: 'Unique',  desc: 'Remove duplicate lines' },
    { cmd: 'Reverse', desc: 'Reverse line order' },
    { cmd: 's/pat/rep/g', desc: 'Select an ed substitute, right-click anywhere to apply' },
  ]},
  { heading: 'View', items: [
    { cmd: 'Diff',    desc: 'Compare against the previously active pane' },
    { cmd: 'Plot',    desc: 'Render gnuplot spec (prev pane as data)' },
    { cmd: 'Eval',    desc: 'Run pane as JS; stdout → split pane' },
    { cmd: 'Preview', desc: 'Render pane as Markdown → HTML' },
    { cmd: 'Format',  desc: 'Reformat pane (select a language, or infer from filename)' },
    { cmd: 'Calc',    desc: 'Turn pane into a bc-style calculator (math.js)' },
    { cmd: 'Grep',    desc: 'Search all panes in this workspace' },
    { cmd: 'Ruler',   desc: 'Toggle 80-char guide' },
    { cmd: 'Big',     desc: 'Increase font size' },
    { cmd: 'Small',   desc: 'Decrease font size' },
  ]},
  { heading: 'Theme', items: [
    { cmd: 'dark',  desc: 'Switch to dark theme' },
    { cmd: 'light', desc: 'Switch to light theme' },
  ]},
  { heading: 'Session', items: [
    { cmd: 'Export', desc: 'Dump all workspaces as JSON' },
    { cmd: 'Import', desc: 'Restore workspace(s) from JSON' },
    { cmd: 'Break',  desc: 'Split pane content at cursor' },
    { cmd: 'Lock',   desc: 'Toggle read-only for this pane' },
  ]},
  { heading: 'Keyboard', items: [
    { cmd: '⌘S / Ctrl+S', desc: 'Save session to localStorage' },
  ]},
];

const TOPICS = {
  tab: {
    title: 'Tab',
    body: `Tab creates a new workspace. Each workspace is an independent
layout of columns and panes.

The new workspace starts with a single empty pane ready for work.
Right-click Tab again to create another.

Workspaces persist across reloads. The current workspace is saved
automatically when you switch tabs or close the app.`,
  },

  deltab: {
    title: 'Deltab',
    body: `Deltab closes the current workspace tab.

The last tab cannot be closed — use 42clear to wipe everything.`,
  },

  zoom: {
    title: 'Zoom',
    body: `Zoom temporarily maximizes the current pane to fill the viewport.

Right-click Zoom again to restore the normal tiled layout.
A zoom indicator (⤢) appears in the tag bar.`,
  },

  nums: {
    title: 'Nums',
    body: `Nums toggles line numbers in the current pane.

A subtle gutter appears on the left edge. Line numbers update
automatically as you edit.`,
  },

  now: {
    title: 'Now',
    body: `Now inserts a timestamp at the cursor position.

<b>Default</b> (no selection): local time
  2026-07-30 11:27:15

<b>Timezone-aware</b>: select a zone name, then right-click Now.
  <span class="help-cmd">PST</span>  →  2026-07-30 03:27:15 PDT
  <span class="help-cmd">UTC</span>  →  2026-07-30 18:27:15 UTC
  <span class="help-cmd">EST</span>  →  2026-07-30 06:27:15 EDT

Supported keywords:
  PST PDT Pacific Sunnyvale
  EST EDT Eastern
  CST CDT Central
  MST MDT Mountain
  UTC GMT
  local

DST is handled automatically by the browser's Intl engine.`,
  },

  copy: {
    title: 'Copy',
    body: `Copy copies the entire body of the current pane to the clipboard.

A toast confirms the action. Useful for grabbing a bash snippet
to paste into a real terminal.`,
  },

  grep: {
    title: 'Grep',
    body: `Grep searches all panes across every workspace tab.

Select a pattern, then right-click Grep. Results appear in a split
pane showing tab name, filename, match count, and matching lines.

Search is case-insensitive regex. The pattern is taken from your
current text selection.`,
  },

  sort: {
    title: 'Sort',
    body: `Sort sorts the lines of the current pane in place.

<b>Default</b>: alphabetical sort.

<b>Numeric</b>: select <span class="help-cmd">num</span> or <span class="help-cmd">n</span>, then right-click Sort.

<b>By column</b>: select a number (1-indexed), then right-click Sort.
  <span class="help-cmd">2</span>  → sorts by the second whitespace-delimited field.

Lines are sorted in-place; the original order is lost.`,
  },

  trim: {
    title: 'Trim',
    body: `Trim strips trailing whitespace from every line and ensures
exactly one trailing newline at the end of the pane.`,
  },

  lower: {
    title: 'Lower',
    body: `Lower converts the entire pane to lowercase.`,
  },

  upper: {
    title: 'Upper',
    body: `Upper converts the entire pane to uppercase.`,
  },

  title: {
    title: 'Title',
    body: `Title converts every word to Title Case (first letter uppercase,
rest lowercase).`,
  },

  unique: {
    title: 'Unique',
    body: `Unique removes duplicate lines, keeping the first occurrence.
Line order of unique lines is preserved.`,
  },

  reverse: {
    title: 'Reverse',
    body: `Reverse reverses the order of all lines in the pane.`,
  },

  ruler: {
    title: 'Ruler',
    body: `Ruler toggles a subtle 80-character vertical guide line in the
current pane. The line scales automatically with font size changes.`,
  },

  big: {
    title: 'Big',
    body: `Big increases the font size of the current pane by 2px
(up to a maximum of 24px).`,
  },

  small: {
    title: 'Small',
    body: `Small decreases the font size of the current pane by 2px
(down to a minimum of 10px).`,
  },

  break: {
    title: 'Break',
    body: `Break splits the current pane's content at the cursor position.
Everything before the cursor stays in the current pane; everything
after moves into a new pane below.`,
  },

  lock: {
    title: 'Lock',
    body: `Lock toggles read-only mode for the current pane.

When locked, the editor dims and ignores keystrokes. Right-click
Lock again to unlock. The lock state persists across sessions.`,
  },

  export: {
    title: 'Export',
    body: `Export dumps all workspace tabs as JSON into a split pane.

You can save the JSON to a file, email it, or gist it. Use Import
to restore the exact same layout later.`,
  },

  import: {
    title: 'Import',
    body: `Import restores workspace(s) from JSON.

<b>Single workspace</b>: JSON object with colOrder / panes → imported
into the current tab.

<b>Multiple workspaces</b>: JSON array of { label, state } objects →
replaces all tabs and reloads the page.

Use Export to generate the JSON.`,
  },

  swap: {
    title: 'Swap',
    body: `Swap toggles the layout relationship between the current pane and
the previously active pane (same "current + previous" reference Diff uses).

<b>Stacked → side-by-side</b>
  If the two panes currently share a column (stacked), Swap pulls the
  current pane out into its own new column, placed right after.

<b>Side-by-side → stacked</b>
  If the two panes are already in separate columns, Swap folds the
  current pane into the other's column, directly below it.

The pane being moved keeps its content, tag, filename, and dirty state.
If moving a pane empties its old column, that column is removed and the
remaining columns close the gap.

<b>Usage</b>: click pane A, then click pane B, then right-click <b>Swap</b>
inside pane B — B moves relative to A. Same click-then-right-click flow
as Diff (click the pane to compare against, then Diff the other one).`,
  },

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

  calc: {
    title: 'Calc',
    body: `Calc turns the current pane into a bc-style calculator powered by math.js.

<b>How it works</b>
  Type an expression and press Enter — the result appears on the next line
  prefixed with <b>=</b>, and the cursor moves to a new input line.
  Variables persist for the lifetime of the pane.

<b>Examples</b>
  2 + 2                → = 4
  x = 5                → (no output — assignment)
  x * sin(pi / 2)      → = 5
  sqrt(2) ^ 2          → = 2

<b>Supported</b>
  Arithmetic, trig, logarithms, complex numbers, units, matrices.
  Lines starting with <b>#</b> are treated as comments.
  Lines starting with <b>=</b> are result lines and are skipped.

<b>Notes</b>
  • Right-clicking Calc on an existing calc pane resets the scope.
  • The pane tag changes to <b>calc Del</b>.
  • Regular editor commands (Find, Replace, Save, Load) still work.`,
  },

  format: {
    title: 'Format',
    body: `Format reformats the current pane's content in place using Prettier.

<b>Choosing a language</b>
  Select a language word first, then right-click <b>Format</b>:
    js  jsx  javascript  css  scss  less  html  markdown  md  yaml  yml  json

  No selection? Format falls back to the pane's loaded filename extension
  (.js .jsx .mjs .cjs .css .scss .less .html .htm .md .markdown .yml .yaml .json).

  Neither available → defaults to <b>markdown</b>.

<b>Example</b>
  Select <b>js</b> anywhere (tag bar or body), right-click <b>Format</b>
  — same mechanic as selecting <b>plot</b> then right-clicking <b>Help</b>.

<b>Notes</b>
  • Formatting happens in place — no split pane, the buffer is rewritten.
  • Marks the pane dirty, same as any manual edit.
  • Not in the default tag bar; type <b>Format</b> into a pane's tag bar
    once, same as Diff / Preview / Eval / Plot.
  • TypeScript is not supported (parser omitted to keep bundle size down).`,
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
