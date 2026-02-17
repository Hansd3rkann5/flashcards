// Text Rendering (Markdown, Tables, KaTeX)
// ============================================================================
/**
* @function escapeHTML
 * @description Escapes HTML special characters for safe rendering.
 */

function escapeHTML(str = '') {
  return str.replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

/**
 * @function isEscaped
 * @description Returns whether escaped.
 */

function isEscaped(str, idx) {
  let count = 0;
  for (let i = idx - 1; i >= 0 && str[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

/**
 * @function normalizeTextAlign
 * @description Normalizes text align.
 */

function normalizeTextAlign(value = '') {
  const v = String(value || '').toLowerCase();
  if (v === 'center' || v === 'justify') return v;
  return 'left';
}

/**
 * @function hasActiveTextSelection
 * @description Returns whether active text selection.
 */

function hasActiveTextSelection() {
  const selection = window.getSelection ? window.getSelection() : null;
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return false;
  return true;
}

/**
 * @function tokenizeMathSegments
 * @description Handles tokenize math segments logic.
 */

function tokenizeMathSegments(raw = '') {
  const tokens = [];
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith('$$', i) && !isEscaped(raw, i)) {
      let j = i + 2;
      while (j < raw.length) {
        if (raw[j] === '$' && raw[j + 1] === '$' && !isEscaped(raw, j)) break;
        j++;
      }
      if (j < raw.length) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 2));
        out += `@@MATH${tokenId}@@`;
        i = j + 2;
        continue;
      }
    }
    if (raw[i] === '$' && !isEscaped(raw, i)) {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '$' && !isEscaped(raw, j)) break;
        j++;
      }
      if (j < raw.length) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 1));
        out += `@@MATH${tokenId}@@`;
        i = j + 1;
        continue;
      }
    }
    if (raw.startsWith('\\[', i)) {
      const j = raw.indexOf('\\]', i + 2);
      if (j !== -1) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 2));
        out += `@@MATH${tokenId}@@`;
        i = j + 2;
        continue;
      }
    }
    if (raw.startsWith('\\(', i)) {
      const j = raw.indexOf('\\)', i + 2);
      if (j !== -1) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 2));
        out += `@@MATH${tokenId}@@`;
        i = j + 2;
        continue;
      }
    }
    out += raw[i];
    i += 1;
  }
  return { text: out, tokens };
}

/**
 * @function applyInlineMarkdown
 * @description Applies inline markdown.
 */

function applyInlineMarkdown(raw = '') {
  let t = escapeHTML(raw);
  t = t.replace(/\[(.*?)\]\{(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}/g, '<span style="color:$2">$1</span>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__(.+?)__/g, '<u>$1</u>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/-->/g, '<span class="inline-arrow">&rarr;</span>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}

/**
 * @function restoreMathTokens
 * @description Handles restore math tokens logic.
 */

function restoreMathTokens(html = '', tokens = []) {
  return html.replace(/@@MATH(\d+)@@/g, (_, idx) => {
    const token = tokens[Number(idx)];
    return token ? escapeHTML(token) : `@@MATH${idx}@@`;
  });
}

/**
 * @function parseListLineMeta
 * @description Parses list line meta.
 */

function parseListLineMeta(line = '') {
  const indent = (line.match(/^\s*/) || [''])[0];
  const rest = line.slice(indent.length);

  const orderedMatch = rest.match(/^((?:\d+\.)+)(?:\s+(.*))?$/);
  if (orderedMatch) {
    const sequence = orderedMatch[1]
      .split('.')
      .filter(Boolean)
      .map(num => Number(num))
      .filter(num => Number.isFinite(num) && num >= 0);
    if (sequence.length) {
      return {
        type: 'ol',
        indent,
        text: orderedMatch[2] ?? '',
        sequence
      };
    }
  }

  const unorderedMatch = rest.match(/^([-*•◦▪])(?:\s+(.*))?$/);
  if (unorderedMatch) {
    return {
      type: 'ul',
      indent,
      marker: unorderedMatch[1],
      text: unorderedMatch[2] ?? ''
    };
  }
  return null;
}

/**
 * @function formatOrderedSequence
 * @description Formats ordered sequence.
 */

function formatOrderedSequence(sequence = []) {
  const safe = Array.isArray(sequence) ? sequence.filter(n => Number.isFinite(n)) : [];
  if (!safe.length) return '1.';
  return `${safe.join('.')}.`;
}

/**
 * @function getNestedBulletMarker
 * @description Returns the nested bullet marker.
 */

function getNestedBulletMarker(marker = '-') {
  if (marker === '-' || marker === '*') return '•';
  if (marker === '•') return '◦';
  if (marker === '◦') return '▪';
  return '▪';
}

/**
 * @function getOutdentedBulletMarker
 * @description Returns the outdented bullet marker.
 */

function getOutdentedBulletMarker(marker = '-') {
  if (marker === '▪') return '◦';
  if (marker === '◦') return '•';
  if (marker === '•') return '-';
  if (marker === '*') return '-';
  return '-';
}

/**
 * @function getPreviousNonEmptyLineMeta
 * @description Returns the previous non empty line meta.
 */

function getPreviousNonEmptyLineMeta(value = '', currentLineStart = 0) {
  let cursor = currentLineStart - 1;
  while (cursor >= 0) {
    const prevLineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
    const prevLine = value.slice(prevLineStart, cursor + 1);
    if (prevLine.trim()) return parseListLineMeta(prevLine);
    cursor = prevLineStart - 1;
  }
  return null;
}

/**
 * @function getListDepth
 * @description Returns the list depth.
 */

function getListDepth(meta) {
  if (!meta) return 0;
  const indentDepth = Math.floor(String(meta.indent || '').replace(/\t/g, '  ').length / 2);
  if (meta.type === 'ol') {
    const seqDepth = Math.max(0, (meta.sequence?.length || 1) - 1);
    return Math.max(indentDepth, seqDepth);
  }
  return indentDepth;
}

/**
 * @function splitMarkdownTableRow
 * @description Handles split markdown table row logic.
 */

function splitMarkdownTableRow(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed || !trimmed.includes('|')) return null;
  let core = trimmed;
  if (core.startsWith('|')) core = core.slice(1);
  if (core.endsWith('|')) core = core.slice(0, -1);
  const cells = [];
  let current = '';
  for (let i = 0; i < core.length; i++) {
    const char = core[i];
    const prev = i > 0 ? core[i - 1] : '';
    if (char === '|' && prev !== '\\') {
      cells.push(current.trim().replace(/\\\|/g, '|'));
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim().replace(/\\\|/g, '|'));
  if (!cells.length) return null;
  return cells;
}

/**
 * @function parseMarkdownTableAlignments
 * @description Parses markdown table alignments.
 */

function parseMarkdownTableAlignments(line = '', expectedCols = 0) {
  const cells = splitMarkdownTableRow(line);
  if (!cells || (expectedCols > 0 && cells.length !== expectedCols)) return null;
  const alignments = cells.map(cell => {
    const marker = String(cell || '').replace(/\s+/g, '');
    if (!/^:?-{3,}:?$/.test(marker)) return null;
    if (marker.startsWith(':') && marker.endsWith(':')) return 'center';
    if (marker.endsWith(':')) return 'right';
    return 'left';
  });
  if (alignments.some(align => !align)) return null;
  return alignments;
}

/**
 * @function parseTableCellMetaToken
 * @description Parses supported table cell tokens (align/span/merge) from the beginning of a cell.
 */

function parseTableCellMetaToken(cell = '') {
  let rest = String(cell || '');
  let align = null;
  let rowSpan = 1;
  let colSpan = 1;
  let covered = false;

  while (true) {
    const match = rest.match(/^\s*\[\[(align:(left|center|right)|span:(\d+)x(\d+)|merge)\]\]\s*/i);
    if (!match) break;
    const token = String(match[1] || '').toLowerCase();
    if (token === 'merge') {
      covered = true;
    } else if (token.startsWith('align:')) {
      align = normalizeTextAlign(match[2] || 'left');
    } else if (token.startsWith('span:')) {
      rowSpan = Math.max(1, Math.trunc(Number(match[3]) || 1));
      colSpan = Math.max(1, Math.trunc(Number(match[4]) || 1));
    }
    rest = rest.slice(match[0].length);
  }

  return {
    align,
    rowSpan,
    colSpan,
    covered,
    text: rest
  };
}

/**
 * @function parseTableCellAlignmentToken
 * @description Parses table cell alignment token.
 */

function parseTableCellAlignmentToken(cell = '') {
  const parsed = parseTableCellMetaToken(cell);
  return {
    align: parsed.align,
    text: parsed.text
  };
}

/**
 * @function renderMarkdownTableHtml
 * @description Renders markdown table HTML.
 */

function renderMarkdownTableHtml(headerCells = [], alignments = [], bodyRows = []) {
  const safeHeader = Array.isArray(headerCells) ? headerCells : [];
  const safeBody = Array.isArray(bodyRows) ? bodyRows : [];
  const cols = safeHeader.length;
  if (!cols) return '';

  const headerSkip = new Set();
  const th = [];
  for (let idx = 0; idx < cols; idx++) {
    if (headerSkip.has(idx)) continue;
    const parsed = parseTableCellMetaToken(safeHeader[idx] || '');
    if (parsed.covered) continue;
    const align = parsed.align || alignments[idx] || 'left';
    const colSpan = Math.max(1, Math.min(cols - idx, parsed.colSpan || 1));
    if (colSpan > 1) {
      for (let c = idx + 1; c < idx + colSpan; c++) headerSkip.add(c);
    }
    const attrs = colSpan > 1 ? ` colspan="${colSpan}"` : '';
    th.push(`<th class="md-table-cell md-table-align-${align}"${attrs}>${applyInlineMarkdown(parsed.text || '') || '&nbsp;'}</th>`);
  }

  const bodySkip = Array.from({ length: safeBody.length }, () => Array.from({ length: cols }, () => false));
  const rowsHtml = safeBody.map((row, rowIdx) => {
    const cells = Array.isArray(row) ? row : [];
    const tds = [];
    for (let colIdx = 0; colIdx < cols; colIdx++) {
      if (bodySkip[rowIdx][colIdx]) continue;
      const parsed = parseTableCellMetaToken(cells[colIdx] ?? '');
      if (parsed.covered) continue;
      const align = parsed.align || alignments[colIdx] || 'left';
      const rowSpan = Math.max(1, Math.min(safeBody.length - rowIdx, parsed.rowSpan || 1));
      const colSpan = Math.max(1, Math.min(cols - colIdx, parsed.colSpan || 1));
      if (rowSpan > 1 || colSpan > 1) {
        for (let r = rowIdx; r < rowIdx + rowSpan; r++) {
          for (let c = colIdx; c < colIdx + colSpan; c++) {
            if (r === rowIdx && c === colIdx) continue;
            bodySkip[r][c] = true;
          }
        }
      }
      const attrs = [
        rowSpan > 1 ? `rowspan="${rowSpan}"` : '',
        colSpan > 1 ? `colspan="${colSpan}"` : ''
      ].filter(Boolean).join(' ');
      const attrString = attrs ? ` ${attrs}` : '';
      tds.push(`<td class="md-table-cell md-table-align-${align}"${attrString}>${applyInlineMarkdown(parsed.text || '') || '&nbsp;'}</td>`);
    }
    return `<tr>${tds.join('')}</tr>`;
  }).join('');

  return `<div class="md-table-wrap"><div class="md-table-fit"><table class="md-table"><thead><tr>${th.join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}

/**
 * @function markdownToHtml
 * @description Converts markdown-like card text into HTML, including lists, tables, and math placeholders.
 */

function markdownToHtml(raw = '') {
  const { text, tokens } = tokenizeMathSegments(raw || '');
  const lines = text.split('\n');
  const out = [];
  const listStack = [];
  const liOpen = [];

  const closeOneLevel = () => {
    const idx = listStack.length - 1;
    if (idx < 0) return;
    if (liOpen[idx]) {
      out.push('</li>');
      liOpen[idx] = false;
    }
    out.push(`</${listStack[idx]}>`);
    listStack.pop();
    liOpen.pop();
  };

  const closeToDepth = (targetDepth = 0) => {
    while (listStack.length > targetDepth) closeOneLevel();
  };

  const openListLevel = (type, start = 1) => {
    if (type === 'ol' && Number.isFinite(start) && start > 1) {
      out.push(`<ol start="${start}">`);
    } else {
      out.push(`<${type}>`);
    }
    listStack.push(type);
    liOpen.push(false);
  };

  const ensureDepth = (depth, meta) => {
    while (listStack.length < depth + 1) {
      const parentIdx = listStack.length - 1;
      if (parentIdx >= 0 && !liOpen[parentIdx]) {
        out.push('<li>');
        liOpen[parentIdx] = true;
      }
      const levelIndex = listStack.length;
      const start = meta.type === 'ol' ? Number(meta.sequence?.[levelIndex] || 1) : 1;
      openListLevel(meta.type, start);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerCells = splitMarkdownTableRow(line);
    const alignments = headerCells && i + 1 < lines.length
      ? parseMarkdownTableAlignments(lines[i + 1], headerCells.length)
      : null;
    if (headerCells && alignments) {
      closeToDepth(0);
      const bodyRows = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowCells = splitMarkdownTableRow(lines[j]);
        if (!rowCells || rowCells.length !== headerCells.length) break;
        bodyRows.push(rowCells);
        j += 1;
      }
      out.push(renderMarkdownTableHtml(headerCells, alignments, bodyRows));
      i = j - 1;
      continue;
    }

    const meta = parseListLineMeta(line);
    if (meta) {
      const depth = getListDepth(meta);
      closeToDepth(depth + 1);
      ensureDepth(depth, meta);

      if (listStack[depth] !== meta.type) {
        if (liOpen[depth]) {
          out.push('</li>');
          liOpen[depth] = false;
        }
        out.push(`</${listStack[depth]}>`);
        listStack.pop();
        liOpen.pop();
        const start = meta.type === 'ol' ? Number(meta.sequence?.[depth] || 1) : 1;
        openListLevel(meta.type, start);
      }

      if (liOpen[depth]) {
        out.push('</li>');
        liOpen[depth] = false;
      }

      const item = meta.text ? applyInlineMarkdown(meta.text) : '<br>';
      out.push(`<li>${item}`);
      liOpen[depth] = true;
      continue;
    }

    closeToDepth(0);
    if (!line.trim()) {
      out.push('<div class="md-line"><br></div>');
    } else {
      out.push(`<div class="md-line">${applyInlineMarkdown(line)}</div>`);
    }
  }
  closeToDepth(0);
  return restoreMathTokens(out.join(''), tokens);
}

/**
 * @function hasPotentialMathContent
 * @description Returns whether potential math content.
 */

function hasPotentialMathContent(text = '') {
  return /(\$\$?[^$]|\\\(|\\\[)/.test(String(text || ''));
}

/**
 * @function forceMathMlOnly
 * @description Handles force math ml only logic.
 */

function forceMathMlOnly(container) {
  if (!container) return;
  container.querySelectorAll('.katex').forEach(node => {
    node.querySelectorAll('.katex-html').forEach(htmlNode => htmlNode.remove());
    const mathmlNode = node.querySelector('.katex-mathml');
    if (mathmlNode) mathmlNode.classList.add('katex-mathml-only');
  });
}

/**
 * @function renderKatexInContainer
 * @description Renders KaTeX in container.
 */

function renderKatexInContainer(container) {
  if (!container) return false;
  if (!hasPotentialMathContent(container.textContent || '')) {
    container.dataset.mathPending = '0';
    return true;
  }
  if (!window.renderMathInElement) {
    container.dataset.mathPending = '1';
    return false;
  }
  try {
    window.renderMathInElement(container, KATEX_RENDER_OPTIONS);
    forceMathMlOnly(container);
    container.dataset.mathPending = '0';
    return true;
  } catch (err) {
    container.dataset.mathPending = '1';
    return false;
  }
}

let overviewTableFitScheduled = false;
/**
 * @function fitOverviewTables
 * @description Handles fit overview tables logic.
 */
function fitOverviewTables() {
  const wraps = document.querySelectorAll(
    '.card-tile .rich-content .md-table-wrap, .topic-search-result .rich-content .md-table-wrap'
  );
  wraps.forEach(wrap => {
    const fit = wrap.querySelector('.md-table-fit');
    const table = wrap.querySelector('.md-table');
    if (!fit || !table) return;

    // Reset previous scaling before taking fresh measurements.
    wrap.classList.remove('md-table-wrap-fitted');
    wrap.style.height = '';
    fit.style.width = '';
    fit.style.transform = '';

    const availableWidth = wrap.clientWidth;
    const naturalWidth = table.scrollWidth;
    if (!availableWidth || !naturalWidth) return;
    if (naturalWidth <= availableWidth + 1) return;

    const scale = availableWidth / naturalWidth;
    fit.style.width = `${naturalWidth}px`;
    fit.style.transform = `scale(${scale})`;
    wrap.style.height = `${Math.ceil(table.scrollHeight * scale)}px`;
    wrap.classList.add('md-table-wrap-fitted');
  });
}

/**
 * @function scheduleOverviewTableFit
 * @description Handles schedule overview table fit logic.
 */

function scheduleOverviewTableFit() {
  if (overviewTableFitScheduled) return;
  overviewTableFitScheduled = true;
  requestAnimationFrame(() => {
    overviewTableFitScheduled = false;
    fitOverviewTables();
  });
}

/**
 * @function rerenderAllRichMath
 * @description Handles rerender all rich math logic.
 */

function rerenderAllRichMath() {
  document.querySelectorAll('.rich-content').forEach(node => renderKatexInContainer(node));
  scheduleOverviewTableFit();
}

/**
 * @function renderRich
 * @description Renders rich card content with alignment, markdown parsing, and deferred KaTeX rendering.
 */

function renderRich(container, content, options = {}) {
  if (!container) return;
  const textAlign = normalizeTextAlign(options.textAlign);
  container.classList.add('rich-content');
  container.classList.remove('rich-align-left', 'rich-align-center', 'rich-align-justify');
  container.classList.add(`rich-align-${textAlign}`);
  container.innerHTML = markdownToHtml(content || '');
  scheduleOverviewTableFit();
  if (renderKatexInContainer(container)) return;
  ensureKatexLoaded().then(loaded => {
    if (!loaded) return;
    rerenderAllRichMath();
  });
}

/**
 * @function isInMathMode
 * @description Returns whether in math mode.
 */

function isInMathMode(text, pos) {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    if (text[i] === '$' && text[i - 1] !== '\\') count++;
  }
  return count % 2 === 1;
}

/**
 * @function attachAutoClose
 * @description Attaches handlers for auto close.
 */

function attachAutoClose(elm) {
  if (!elm) return;
  const pairs = { '(': ')', '[': ']', '{': '}', '$': '$' };
  elm.addEventListener('keydown', e => {
    if (!pairs[e.key]) return;
    const start = elm.selectionStart;
    const end = elm.selectionEnd;
    const text = elm.value;
    // if (!isInMathMode(text, start)) return;
    e.preventDefault();
    const open = e.key;
    const close = pairs[e.key];
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    elm.value = `${before}${open}${selected}${close}${after}`;
    if (start !== end) {
      elm.setSelectionRange(start + 1, start + 1 + selected.length);
    } else {
      const cursor = start + 1;
      elm.setSelectionRange(cursor, cursor);
    }
  });
  elm.addEventListener('input', () => {
    const pos = elm.selectionStart;
    if (pos == null) return;

    const text = elm.value;

    // nur innerhalb von $ ... $
    if (!isInMathMode(text, pos)) return;

    const before = text.slice(0, pos);

    // Achtung: im JS-String muss \ als \\ geschrieben werden
    if (!before.endsWith('\\frac')) return;

    elm.value =
      text.slice(0, pos) +
      '{}{}' +
      text.slice(pos);

    // Cursor in das erste {}
    elm.setSelectionRange(pos + 1, pos + 1);
  });
}

// ============================================================================
