export function renderPreviewHTML(markdown) {
  if (!window.marked) return '<p style="color:red">marked not loaded</p>';
  const body = window.marked.parse(markdown);
  return `<div class="preview-content">${body}</div>`;
}
