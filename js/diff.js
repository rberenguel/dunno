function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);
  const out = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      out.push({ type: 'eq',  tok: a[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      out.push({ type: 'ins', tok: b[j-1] }); j--;
    } else {
      out.push({ type: 'del', tok: a[i-1] }); i--;
    }
  }
  return out.reverse();
}

// Split into words + whitespace tokens so spaces are preserved
function tokenize(s) { return s.match(/\S+|\s+/g) ?? []; }

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Word-level diff between two lines; returns {delHtml, insHtml}
function wordDiff(a, b) {
  const hunks = lcs(tokenize(a), tokenize(b));
  let delHtml = '', insHtml = '';
  for (const h of hunks) {
    const e = esc(h.tok);
    if (h.type === 'eq')  { delHtml += e; insHtml += e; }
    if (h.type === 'del') { delHtml += `<mark class="word-del">${e}</mark>`; }
    if (h.type === 'ins') { insHtml += `<mark class="word-ins">${e}</mark>`; }
  }
  return { delHtml, insHtml };
}

// Line-level diff
export function diffLines(a, b) {
  return lcs((a || '').split('\n'), (b || '').split('\n'));
}

// Render: consecutive del+ins → word-level mod; lone del/ins → full-line colour
export function renderDiffHtml(hunks) {
  const parts = [];
  let i = 0;
  while (i < hunks.length) {
    const h = hunks[i];
    if (h.type === 'del' && i + 1 < hunks.length && hunks[i + 1].type === 'ins') {
      const { delHtml, insHtml } = wordDiff(h.tok, hunks[i + 1].tok);
      parts.push(`<span class="diff-del diff-mod">${delHtml}</span>`);
      parts.push(`<span class="diff-ins diff-mod">${insHtml}</span>`);
      i += 2;
    } else if (h.type === 'eq') {
      parts.push(`<span class="diff-eq">${esc(h.tok)}</span>`);
      i++;
    } else if (h.type === 'del') {
      parts.push(`<span class="diff-del">${esc(h.tok)}</span>`);
      i++;
    } else {
      parts.push(`<span class="diff-ins">${esc(h.tok)}</span>`);
      i++;
    }
  }
  return parts.join('');
}
