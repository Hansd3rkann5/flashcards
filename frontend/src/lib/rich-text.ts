const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css';
const KATEX_JS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js';
const KATEX_AUTORENDER_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js';
const KATEX_RENDER_OPTIONS = Object.freeze({
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true }
  ],
  throwOnError: false
});

type TextAlignValue = 'left' | 'center' | 'justify';

type RenderMathInElement = (
  element: HTMLElement,
  options: typeof KATEX_RENDER_OPTIONS
) => void;

declare global {
  interface Window {
    renderMathInElement?: RenderMathInElement;
    katex?: unknown;
  }
}

let katexLoadingPromise: Promise<boolean> | null = null;

function escapeHTML(value = ''): string {
  return String(value || '').replace(/[&<>"]/g, character => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character
  ));
}

function isEscaped(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) count += 1;
  return count % 2 === 1;
}

export function normalizeTextAlign(value = ''): TextAlignValue {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'center' || safe === 'justify') return safe;
  return 'left';
}

function tokenizeMathSegments(raw = ''): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  let output = '';
  let index = 0;

  while (index < raw.length) {
    if (raw.startsWith('$$', index) && !isEscaped(raw, index)) {
      let end = index + 2;
      while (end < raw.length) {
        if (raw[end] === '$' && raw[end + 1] === '$' && !isEscaped(raw, end)) break;
        end += 1;
      }
      if (end < raw.length) {
        const tokenIndex = tokens.length;
        tokens.push(raw.slice(index, end + 2));
        output += `@@MATH${tokenIndex}@@`;
        index = end + 2;
        continue;
      }
    }

    if (raw[index] === '$' && !isEscaped(raw, index)) {
      let end = index + 1;
      while (end < raw.length) {
        if (raw[end] === '$' && !isEscaped(raw, end)) break;
        end += 1;
      }
      if (end < raw.length) {
        const tokenIndex = tokens.length;
        tokens.push(raw.slice(index, end + 1));
        output += `@@MATH${tokenIndex}@@`;
        index = end + 1;
        continue;
      }
    }

    if (raw.startsWith('\\[', index)) {
      const end = raw.indexOf('\\]', index + 2);
      if (end !== -1) {
        const tokenIndex = tokens.length;
        tokens.push(raw.slice(index, end + 2));
        output += `@@MATH${tokenIndex}@@`;
        index = end + 2;
        continue;
      }
    }

    if (raw.startsWith('\\(', index)) {
      const end = raw.indexOf('\\)', index + 2);
      if (end !== -1) {
        const tokenIndex = tokens.length;
        tokens.push(raw.slice(index, end + 2));
        output += `@@MATH${tokenIndex}@@`;
        index = end + 2;
        continue;
      }
    }

    output += raw[index];
    index += 1;
  }

  return { text: output, tokens };
}

function applyInlineMarkdown(raw = ''): string {
  let text = escapeHTML(raw);
  text = text.replace(/\[(.*?)\]\{(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}/g, '<span style="color:$2">$1</span>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<u>$1</u>');
  text = text.replace(/_([^_]+)_/g, '<u>$1</u>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/-->/g, '<span class="inline-arrow">&rarr;</span>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  return text;
}

function restoreMathTokens(html = '', tokens: string[] = []): string {
  return html.replace(/@@MATH(\d+)@@/g, (_, value: string) => {
    const token = tokens[Number(value)];
    return token ? escapeHTML(token) : `@@MATH${value}@@`;
  });
}

function parseListLineMeta(line = ''):
  | { type: 'ol'; indent: string; text: string; sequence: number[] }
  | { type: 'ul'; indent: string; text: string; marker: string }
  | null {
  const indent = (line.match(/^\s*/) || [''])[0];
  const rest = line.slice(indent.length);

  const orderedMatch = rest.match(/^((?:\d+\.)+)(?:\s+(.*))?$/);
  if (orderedMatch) {
    const sequence = orderedMatch[1]
      .split('.')
      .filter(Boolean)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= 0);
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

function getListDepth(meta: ReturnType<typeof parseListLineMeta>): number {
  if (!meta) return 0;
  const indentDepth = Math.floor(String(meta.indent || '').replace(/\t/g, '  ').length / 2);
  if (meta.type === 'ol') {
    const sequenceDepth = Math.max(0, (meta.sequence?.length || 1) - 1);
    return Math.max(indentDepth, sequenceDepth);
  }
  return indentDepth;
}

function splitMarkdownTableRow(line = ''): string[] | null {
  const trimmed = String(line || '').trim();
  if (!trimmed || !trimmed.includes('|')) return null;
  let core = trimmed;
  if (core.startsWith('|')) core = core.slice(1);
  if (core.endsWith('|')) core = core.slice(0, -1);
  const cells: string[] = [];
  let current = '';

  for (let index = 0; index < core.length; index += 1) {
    const character = core[index];
    const previous = index > 0 ? core[index - 1] : '';
    if (character === '|' && previous !== '\\') {
      cells.push(current.trim().replace(/\\\|/g, '|'));
      current = '';
      continue;
    }
    current += character;
  }

  cells.push(current.trim().replace(/\\\|/g, '|'));
  return cells.length ? cells : null;
}

function parseMarkdownTableAlignments(line = '', expectedColumns = 0): Array<'left' | 'center' | 'right'> | null {
  const cells = splitMarkdownTableRow(line);
  if (!cells || (expectedColumns > 0 && cells.length !== expectedColumns)) return null;
  const alignments = cells.map(cell => {
    const marker = String(cell || '').replace(/\s+/g, '');
    if (!/^:?-{3,}:?$/.test(marker)) return null;
    if (marker.startsWith(':') && marker.endsWith(':')) return 'center';
    if (marker.endsWith(':')) return 'right';
    return 'left';
  });
  return alignments.some(alignment => !alignment) ? null : alignments as Array<'left' | 'center' | 'right'>;
}

function parseTableCellMetaToken(cell = ''): {
  align: 'left' | 'center' | 'right' | null;
  rowSpan: number;
  colSpan: number;
  covered: boolean;
  noHeader: boolean;
  text: string;
} {
  let rest = String(cell || '');
  let align: 'left' | 'center' | 'right' | null = null;
  let rowSpan = 1;
  let colSpan = 1;
  let covered = false;
  let noHeader = false;

  while (true) {
    const match = rest.match(/^\s*\[\[(align:(left|center|right)|span:(\d+)x(\d+)|merge|noheader)\]\]\s*/i);
    if (!match) break;
    const token = String(match[1] || '').toLowerCase();
    if (token === 'merge') {
      covered = true;
    } else if (token === 'noheader') {
      noHeader = true;
    } else if (token.startsWith('align:')) {
      align = String(match[2] || 'left').toLowerCase() as 'left' | 'center' | 'right';
    } else if (token.startsWith('span:')) {
      rowSpan = Math.max(1, Math.trunc(Number(match[3]) || 1));
      colSpan = Math.max(1, Math.trunc(Number(match[4]) || 1));
    }
    rest = rest.slice(match[0].length);
  }

  return { align, rowSpan, colSpan, covered, noHeader, text: rest };
}

function renderMarkdownTableHtml(
  headerCells: string[] = [],
  alignments: Array<'left' | 'center' | 'right'> = [],
  bodyRows: string[][] = []
): string {
  const columns = headerCells.length;
  if (!columns) return '';
  const renderHeaderAsBody = parseTableCellMetaToken(headerCells[0] || '').noHeader;

  const headerSkip = new Set<number>();
  const headerHtml: string[] = [];
  for (let index = 0; index < columns; index += 1) {
    if (headerSkip.has(index)) continue;
    const parsed = parseTableCellMetaToken(headerCells[index] || '');
    if (parsed.covered) continue;
    const align = parsed.align || alignments[index] || 'left';
    const colSpan = Math.max(1, Math.min(columns - index, parsed.colSpan || 1));
    if (colSpan > 1) {
      for (let cursor = index + 1; cursor < index + colSpan; cursor += 1) headerSkip.add(cursor);
    }
    const attributes = colSpan > 1 ? ` colspan="${colSpan}"` : '';
    const tagName = renderHeaderAsBody ? 'td' : 'th';
    headerHtml.push(
      `<${tagName} class="md-table-cell md-table-align-${align}"${attributes}>${applyInlineMarkdown(parsed.text || '') || '&nbsp;'}</${tagName}>`
    );
  }

  const bodySkip = Array.from({ length: bodyRows.length }, () => Array.from({ length: columns }, () => false));
  const rowsHtml = bodyRows.map((row, rowIndex) => {
    const cells = Array.isArray(row) ? row : [];
    const rowHtml: string[] = [];
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      if (bodySkip[rowIndex][columnIndex]) continue;
      const parsed = parseTableCellMetaToken(cells[columnIndex] ?? '');
      if (parsed.covered) continue;
      const align = parsed.align || alignments[columnIndex] || 'left';
      const rowSpan = Math.max(1, Math.min(bodyRows.length - rowIndex, parsed.rowSpan || 1));
      const colSpan = Math.max(1, Math.min(columns - columnIndex, parsed.colSpan || 1));
      if (rowSpan > 1 || colSpan > 1) {
        for (let rowCursor = rowIndex; rowCursor < rowIndex + rowSpan; rowCursor += 1) {
          for (let columnCursor = columnIndex; columnCursor < columnIndex + colSpan; columnCursor += 1) {
            if (rowCursor === rowIndex && columnCursor === columnIndex) continue;
            bodySkip[rowCursor][columnCursor] = true;
          }
        }
      }
      const attributes = [
        rowSpan > 1 ? `rowspan="${rowSpan}"` : '',
        colSpan > 1 ? `colspan="${colSpan}"` : ''
      ].filter(Boolean).join(' ');
      rowHtml.push(
        `<td class="md-table-cell md-table-align-${align}"${attributes ? ` ${attributes}` : ''}>${applyInlineMarkdown(parsed.text || '') || '&nbsp;'}</td>`
      );
    }
    return `<tr>${rowHtml.join('')}</tr>`;
  }).join('');

  const tableHead = renderHeaderAsBody ? '' : `<thead><tr>${headerHtml.join('')}</tr></thead>`;
  const bodyPrefix = renderHeaderAsBody ? `<tr>${headerHtml.join('')}</tr>` : '';
  return `<div class="md-table-wrap"><div class="md-table-fit"><table class="md-table">${tableHead}<tbody>${bodyPrefix}${rowsHtml}</tbody></table></div></div>`;
}

export function markdownToHtml(raw = ''): string {
  const { text, tokens } = tokenizeMathSegments(String(raw || ''));
  const lines = text.split('\n');
  const output: string[] = [];
  const listStack: Array<'ul' | 'ol'> = [];
  const listItemOpen: boolean[] = [];

  const closeOneLevel = () => {
    const index = listStack.length - 1;
    if (index < 0) return;
    if (listItemOpen[index]) {
      output.push('</li>');
      listItemOpen[index] = false;
    }
    output.push(`</${listStack[index]}>`);
    listStack.pop();
    listItemOpen.pop();
  };

  const closeToDepth = (targetDepth = 0) => {
    while (listStack.length > targetDepth) closeOneLevel();
  };

  const openListLevel = (type: 'ul' | 'ol', start = 1) => {
    if (type === 'ol' && Number.isFinite(start) && start > 1) {
      output.push(`<ol start="${start}">`);
    } else {
      output.push(`<${type}>`);
    }
    listStack.push(type);
    listItemOpen.push(false);
  };

  const ensureDepth = (
    depth: number,
    meta: Exclude<ReturnType<typeof parseListLineMeta>, null>
  ) => {
    while (listStack.length < depth + 1) {
      const parentIndex = listStack.length - 1;
      if (parentIndex >= 0 && !listItemOpen[parentIndex]) {
        output.push('<li>');
        listItemOpen[parentIndex] = true;
      }
      const levelIndex = listStack.length;
      const start = meta.type === 'ol' ? Number(meta.sequence?.[levelIndex] || 1) : 1;
      openListLevel(meta.type, start);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headerCells = splitMarkdownTableRow(line);
    const alignments = headerCells && index + 1 < lines.length
      ? parseMarkdownTableAlignments(lines[index + 1], headerCells.length)
      : null;

    if (headerCells && alignments) {
      closeToDepth(0);
      const bodyRows: string[][] = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length) {
        const rowCells = splitMarkdownTableRow(lines[rowIndex]);
        if (!rowCells || rowCells.length !== headerCells.length) break;
        bodyRows.push(rowCells);
        rowIndex += 1;
      }
      output.push(renderMarkdownTableHtml(headerCells, alignments, bodyRows));
      index = rowIndex - 1;
      continue;
    }

    const listMeta = parseListLineMeta(line);
    if (listMeta) {
      const depth = getListDepth(listMeta);
      closeToDepth(depth + 1);
      ensureDepth(depth, listMeta);

      if (listStack[depth] !== listMeta.type) {
        if (listItemOpen[depth]) {
          output.push('</li>');
          listItemOpen[depth] = false;
        }
        output.push(`</${listStack[depth]}>`);
        listStack.pop();
        listItemOpen.pop();
        const start = listMeta.type === 'ol' ? Number(listMeta.sequence?.[depth] || 1) : 1;
        openListLevel(listMeta.type, start);
      }

      if (listItemOpen[depth]) {
        output.push('</li>');
        listItemOpen[depth] = false;
      }

      output.push(`<li>${listMeta.text ? applyInlineMarkdown(listMeta.text) : '<br>'}`);
      listItemOpen[depth] = true;
      continue;
    }

    closeToDepth(0);
    if (!line.trim()) {
      output.push('<div class="md-line"><br></div>');
    } else {
      output.push(`<div class="md-line">${applyInlineMarkdown(line)}</div>`);
    }
  }

  closeToDepth(0);
  return restoreMathTokens(output.join(''), tokens);
}

export function hasPotentialMathContent(text = ''): boolean {
  return /(\$\$?[^$]|\\\(|\\\[)/.test(String(text || ''));
}

function forceMathMlOnly(container: HTMLElement): void {
  container.querySelectorAll('.katex').forEach(node => {
    node.querySelectorAll('.katex-html').forEach(htmlNode => htmlNode.remove());
    const mathmlNode = node.querySelector('.katex-mathml');
    if (mathmlNode) mathmlNode.classList.add('katex-mathml-only');
  });
}

function renderKatexInContainer(container: HTMLElement): boolean {
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
  } catch {
    container.dataset.mathPending = '1';
    return false;
  }
}

function ensureKatexStylesheet(): void {
  const existing = document.querySelector(`link[data-katex-css="1"]`) as HTMLLinkElement | null;
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = KATEX_CSS_URL;
  link.dataset.katexCss = '1';
  document.head.appendChild(link);
}

function loadScriptOnce(src: string, key: string): Promise<void> {
  const existing = document.querySelector(`script[data-loader-key="${key}"]`) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === '1') return Promise.resolve();
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.loaderKey = key;
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

export async function ensureKatexLoaded(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.katex && window.renderMathInElement) return true;
  if (katexLoadingPromise) return katexLoadingPromise;

  katexLoadingPromise = (async () => {
    try {
      ensureKatexStylesheet();
      await loadScriptOnce(KATEX_JS_URL, 'katex-js');
      await loadScriptOnce(KATEX_AUTORENDER_URL, 'katex-autorender');
      return !!(window.katex && window.renderMathInElement);
    } catch {
      return false;
    }
  })();

  const loaded = await katexLoadingPromise;
  if (!loaded) katexLoadingPromise = null;
  return loaded;
}

export function fitTablesWithin(root: ParentNode): void {
  const wraps = root.querySelectorAll('.rich-content .md-table-wrap');
  wraps.forEach(node => {
    const wrap = node as HTMLElement;
    const fit = wrap.querySelector('.md-table-fit') as HTMLElement | null;
    const table = wrap.querySelector('.md-table') as HTMLElement | null;
    if (!fit || !table) return;

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

export function postProcessRichContentSync(container: HTMLElement): boolean {
  fitTablesWithin(container);
  return renderKatexInContainer(container);
}

export function postProcessRichContent(container: HTMLElement): Promise<boolean> {
  if (postProcessRichContentSync(container)) return Promise.resolve(true);
  return ensureKatexLoaded().then(loaded => {
    if (!loaded) return false;
    const rendered = renderKatexInContainer(container);
    fitTablesWithin(container);
    return rendered;
  });
}
