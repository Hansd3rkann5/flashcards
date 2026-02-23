// EditorPanel (MCQ, Formatting, Table Builder, Formula)
// ============================================================================
/**
* @function syncPrimaryMcqUi
 * @description Synchronizes primary MCQ UI.
 */

function syncPrimaryMcqUi(edit = false) {
  const field = el(edit ? 'editPrimaryAnswerRow' : 'primaryAnswerRow');
  const badge = el(edit ? 'editPrimaryAnswerBadge' : 'primaryAnswerBadge');
  const toggle = el(edit ? 'editPrimaryAnswerToggle' : 'primaryAnswerToggle');
  if (!field || !badge || !toggle) return;
  const isCorrect = !!toggle.checked;
  field.classList.toggle('correct', isCorrect);
  field.classList.toggle('wrong', !isCorrect);
  badge.className = `mcq-badge ${isCorrect ? 'correct' : 'wrong'}`;
  badge.textContent = isCorrect ? 'Correct Answer ✓' : 'Wrong Answer ✕';
}

/**
 * @function setMcqModeState
 * @description Sets the MCQ mode state.
 */

function setMcqModeState(edit = false, enabled = false) {
  const field = el(edit ? 'editPrimaryAnswerRow' : 'primaryAnswerRow');
  const header = el(edit ? 'editPrimaryAnswerHeader' : 'primaryAnswerHeader');
  const toggle = el(edit ? 'editPrimaryAnswerToggle' : 'primaryAnswerToggle');
  const optionsEl = el(edit ? 'editMcqOptions' : 'mcqOptions');
  const optionsToolbar = el(edit ? 'editOptionsToolbar' : 'createOptionsToolbar');
  const answerInput = el(edit ? 'editCardAnswer' : 'cardAnswer');
  if (!field || !header || !toggle || !optionsEl) return;
  if (edit) editMcqMode = enabled;
  else mcqMode = enabled;
  optionsEl.classList.toggle('hidden', !enabled);
  if (optionsToolbar) optionsToolbar.classList.toggle('hidden', !enabled);
  header.classList.toggle('hidden', !enabled);
  field.classList.toggle('mcq-primary', enabled);
  field.classList.toggle('mcq-row', enabled);
  if (answerInput instanceof HTMLTextAreaElement) {
    answerInput.wrap = enabled ? 'off' : 'soft';
  }
  if (!enabled) {
    field.classList.remove('correct', 'wrong');
    return;
  }
  toggle.onchange = () => syncPrimaryMcqUi(edit);
  syncPrimaryMcqUi(edit);
  if (answerInput instanceof HTMLTextAreaElement) {
    enforcePrimaryMcqAnswerSingleLine(answerInput);
  }
  if (!edit) updateCreateValidation();
}

/**
 * @function isPrimaryMcqAnswerSingleLineMode
 * @description Returns whether primary MCQ answer single line mode.
 */

function isPrimaryMcqAnswerSingleLineMode(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return false;
  if (textarea.id === 'cardAnswer') return !!el('primaryAnswerRow')?.classList.contains('mcq-primary');
  if (textarea.id === 'editCardAnswer') return !!el('editPrimaryAnswerRow')?.classList.contains('mcq-primary');
  return false;
}

/**
 * @function enforcePrimaryMcqAnswerSingleLine
 * @description Handles enforce primary MCQ answer single line logic.
 */

function enforcePrimaryMcqAnswerSingleLine(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (!isPrimaryMcqAnswerSingleLineMode(textarea)) return;
  const value = String(textarea.value || '');
  const normalized = value.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ');
  if (normalized === value) return;
  const pos = textarea.selectionStart ?? normalized.length;
  const nextPos = Math.max(0, Math.min(normalized.length, pos));
  textarea.value = normalized;
  textarea.setSelectionRange(nextPos, nextPos);
  if (textarea.id === 'cardAnswer') updateCreateValidation();
}

/**
 * @function handlePrimaryMcqAnswerKeydown
 * @description Handles primary MCQ answer keydown.
 */

function handlePrimaryMcqAnswerKeydown(e) {
  const textarea = e.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (!isPrimaryMcqAnswerSingleLineMode(textarea)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
  }
}

/**
 * @function getAdditionalMcqRowCount
 * @description Returns the additional MCQ row count.
 */

function getAdditionalMcqRowCount(edit = false) {
  const optionsEl = el(edit ? 'editMcqOptions' : 'mcqOptions');
  if (!optionsEl) return 0;
  return optionsEl.querySelectorAll('.mcq-row[data-primary="false"]').length;
}

/**
 * @function syncMcqPrimaryAnswerMode
 * @description Synchronizes MCQ primary answer mode.
 */

function syncMcqPrimaryAnswerMode(edit = false) {
  const hasAdditionalRows = getAdditionalMcqRowCount(edit) > 0;
  setMcqModeState(edit, hasAdditionalRows);
  if (!edit) updateCreateValidation();
}

let createTouched = false;
/**
 * @function updateCreateValidation
 * @description Updates create validation.
 */
function updateCreateValidation(showErrors = false) {
  const question = el('cardPrompt');
  const answer = el('cardAnswer');
  const hasQuestionImage = getFieldImageList(question, 'imageDataQ').length > 0;
  const hasAnswerImage = getFieldImageList(answer, 'imageDataA').length > 0;
  const qValid = question.value.trim().length > 0 || hasQuestionImage;
  const aValid = mcqMode
    ? getCreateOptionCount() > 0
    : answer.value.trim().length > 0 || hasAnswerImage;
  const isValid = qValid && aValid;

  const addBtn = el('addCardBtn');
  if (addBtn) addBtn.disabled = !isValid;

  const shouldShow = showErrors || createTouched;
  question.classList.toggle('field-invalid', shouldShow && !qValid);
  answer.classList.toggle('field-invalid', shouldShow && !aValid);
  el('questionError').classList.toggle('hidden', !(shouldShow && !qValid));
  el('answerError').classList.toggle('hidden', !(shouldShow && !aValid));
  return isValid;
}

/**
 * @function debounce
 * @description Handles debounce logic.
 */

function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * @function setPreview
 * @description Sets the preview.
 */

function setPreview(previewId, value, textAlign = 'left') {
  const preview = el(previewId);
  if (!preview) return;
  const align = normalizeTextAlign(textAlign);
  preview.classList.add('rich-content');
  preview.classList.remove('rich-align-left', 'rich-align-center', 'rich-align-justify');
  preview.classList.add(`rich-align-${align}`);
  if (!value || !value.trim()) {
    preview.innerHTML = '<span class="tiny">Live preview</span>';
    return;
  }
  renderRich(preview, value, { textAlign: align });
}

/**
 * @function wireLivePreview
 * @description Wires live preview.
 */

function wireLivePreview(inputId, previewId, getAlign = () => 'left') {
  const input = el(inputId);
  const preview = el(previewId);
  if (!input || !preview) return;
  const render = () => setPreview(previewId, input.value, getAlign());
  const debounced = debounce(render, 300);
  input.addEventListener('input', debounced);
  render();
}

/**
 * @function syncToolbarAlignmentButtons
 * @description Synchronizes toolbar alignment buttons.
 */

function syncToolbarAlignmentButtons(group, align) {
  const normalized = normalizeTextAlign(align);
  document.querySelectorAll(`.text-toolbar [data-action="align"][data-group="${group}"]`).forEach(btn => {
    const active = btn.dataset.align === normalized;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/**
 * @function applyCreateQuestionTextAlign
 * @description Applies create question text align.
 */

function applyCreateQuestionTextAlign(align) {
  createQuestionTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('create-question', createQuestionTextAlign);
  setPreview('questionPreview', el('cardPrompt')?.value || '', createQuestionTextAlign);
}

/**
 * @function applyCreateAnswerTextAlign
 * @description Applies create answer text align.
 */

function applyCreateAnswerTextAlign(align) {
  createAnswerTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('create-answer', createAnswerTextAlign);
  setPreview('answerPreview', el('cardAnswer')?.value || '', createAnswerTextAlign);
}

/**
 * @function applyEditQuestionTextAlign
 * @description Applies edit question text align.
 */

function applyEditQuestionTextAlign(align) {
  editQuestionTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('edit-question', editQuestionTextAlign);
  setPreview('editQuestionPreview', el('editCardPrompt')?.value || '', editQuestionTextAlign);
}

/**
 * @function applyEditAnswerTextAlign
 * @description Applies edit answer text align.
 */

function applyEditAnswerTextAlign(align) {
  editAnswerTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('edit-answer', editAnswerTextAlign);
  setPreview('editAnswerPreview', el('editCardAnswer')?.value || '', editAnswerTextAlign);
}

/**
 * @function applyCreateOptionsTextAlign
 * @description Applies create options text align.
 */

function applyCreateOptionsTextAlign(align) {
  createOptionsTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('create-options', createOptionsTextAlign);
}

/**
 * @function applyEditOptionsTextAlign
 * @description Applies edit options text align.
 */

function applyEditOptionsTextAlign(align) {
  editOptionsTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('edit-options', editOptionsTextAlign);
}

/**
 * @function ensureListInputLeftAligned
 * @description Ensures list input left aligned.
 */

function ensureListInputLeftAligned(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (textarea.id === 'cardPrompt') applyCreateQuestionTextAlign('left');
  else if (textarea.id === 'cardAnswer') applyCreateAnswerTextAlign('left');
  else if (textarea.id === 'editCardPrompt') applyEditQuestionTextAlign('left');
  else if (textarea.id === 'editCardAnswer') applyEditAnswerTextAlign('left');
}

/**
 * @function emitTextareaInput
 * @description Emits textarea input.
 */

function emitTextareaInput(textarea) {
  if (!textarea) return;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @function toggleInlineFormat
 * @description Toggles inline format.
 */

function toggleInlineFormat(textarea, format = 'bold') {
  if (!textarea) return;
  const markers = { bold: '**', italic: '*', underline: '__' };
  const marker = markers[format];
  if (!marker) return;

  const value = textarea.value || '';
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = value.slice(start, end);

  if (start === end) {
    const insert = `${marker}${marker}`;
    textarea.setRangeText(insert, start, end, 'end');
    const caret = start + marker.length;
    textarea.setSelectionRange(caret, caret);
    textarea.focus();
    emitTextareaInput(textarea);
    return;
  }

  const wrappedSelection = selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2;
  const wrappedAroundSelection = start >= marker.length
    && value.slice(start - marker.length, start) === marker
    && value.slice(end, end + marker.length) === marker;

  if (wrappedSelection) {
    const unwrapped = selected.slice(marker.length, selected.length - marker.length);
    textarea.setRangeText(unwrapped, start, end, 'end');
    textarea.setSelectionRange(start, start + unwrapped.length);
  } else if (wrappedAroundSelection) {
    textarea.setRangeText(selected, start - marker.length, end + marker.length, 'end');
    const nextStart = start - marker.length;
    textarea.setSelectionRange(nextStart, nextStart + selected.length);
  } else {
    const wrapped = `${marker}${selected}${marker}`;
    textarea.setRangeText(wrapped, start, end, 'end');
    textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
  }

  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function normalizeInlineTextColor
 * @description Validates and normalizes inline text color values.
 */

function normalizeInlineTextColor(color = '') {
  const raw = String(color || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw.toLowerCase();
  if (/^[a-zA-Z]+$/.test(raw)) return raw.toLowerCase();
  return '';
}

/**
 * @function applyInlineColor
 * @description Wraps selected text with markdown color syntax: [text]{color}.
 */

function applyInlineColor(inputEl, color = '') {
  const isSupportedInput =
    inputEl instanceof HTMLTextAreaElement
    || (inputEl instanceof HTMLInputElement && inputEl.type === 'text');
  if (!isSupportedInput) return;
  const safeColor = normalizeInlineTextColor(color);
  if (!safeColor) return;

  const value = String(inputEl.value || '');
  const start = inputEl.selectionStart ?? 0;
  const end = inputEl.selectionEnd ?? start;
  const selected = value.slice(start, end);

  if (start === end) {
    const placeholder = 'text';
    const insert = `[${placeholder}]{${safeColor}}`;
    inputEl.setRangeText(insert, start, end, 'end');
    const nextStart = start + 1;
    inputEl.setSelectionRange(nextStart, nextStart + placeholder.length);
    inputEl.focus();
    emitTextareaInput(inputEl);
    return;
  }

  const wrapped = `[${selected}]{${safeColor}}`;
  inputEl.setRangeText(wrapped, start, end, 'end');
  inputEl.setSelectionRange(start + 1, start + 1 + selected.length);
  inputEl.focus();
  emitTextareaInput(inputEl);
}

/**
 * @function closeInlineColorMenus
 * @description Closes all inline color menus, except an optional control node.
 */

function closeInlineColorMenus(exceptControl = null) {
  document.querySelectorAll('.inline-color-control').forEach(control => {
    if (exceptControl && control === exceptControl) return;
    control.classList.remove('open');
    const toggle = control.querySelector('.inline-color-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

/**
 * @function wireInlineColorMenuGlobalListeners
 * @description Wires global listeners for closing inline color menus.
 */

function wireInlineColorMenuGlobalListeners() {
  if (inlineColorMenuListenersWired) return;
  inlineColorMenuListenersWired = true;

  document.addEventListener('click', e => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const inControl = target.closest('.inline-color-control');
    if (inControl) return;
    closeInlineColorMenus();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeInlineColorMenus();
  });
}

/**
 * @function buildInlineColorToolbarControl
 * @description Builds one inline color toolbar control with an expandable 4x2 swatch menu.
 */

function buildInlineColorToolbarControl(group = '', targetId = '') {
  const control = document.createElement('div');
  control.className = 'inline-color-control';
  control.dataset.group = group;
  control.dataset.target = targetId;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-small toolbar-btn inline-color-toggle';
  toggle.textContent = 'Color';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-label', 'Choose text color');

  const menu = document.createElement('div');
  menu.className = 'inline-color-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Text colors');

  INLINE_TEXT_COLOR_SWATCHES.forEach(swatch => {
    const swatchBtn = document.createElement('button');
    swatchBtn.type = 'button';
    swatchBtn.className = 'inline-color-swatch';
    swatchBtn.title = swatch.name;
    swatchBtn.setAttribute('aria-label', swatch.name);
    swatchBtn.style.setProperty('--inline-swatch-color', swatch.value);
    swatchBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const targetInput = el(targetId);
      if (targetInput) applyInlineColor(targetInput, swatch.value);
      closeInlineColorMenus();
    });
    menu.appendChild(swatchBtn);
  });

  toggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = control.classList.contains('open');
    closeInlineColorMenus();
    if (isOpen) return;
    control.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  });

  control.appendChild(toggle);
  control.appendChild(menu);
  return control;
}

/**
 * @function ensureInlineColorToolbarControls
 * @description Injects inline color controls into relevant editor toolbars.
 */

function ensureInlineColorToolbarControls() {
  Object.entries(INLINE_TEXT_COLOR_TOOLBAR_TARGETS).forEach(([group, targetId]) => {
    const toolbar = document.querySelector(`.text-toolbar[data-group="${group}"]`);
    if (!toolbar) return;
    if (toolbar.querySelector('.inline-color-control')) return;
    const control = buildInlineColorToolbarControl(group, targetId);
    const tableBtn = toolbar.querySelector(`.toolbar-btn[data-action="table"][data-target="${targetId}"]`);
    const tableSegment = tableBtn?.closest('.toolbar-segment');
    if (tableBtn && tableSegment) {
      tableBtn.insertAdjacentElement('afterend', control);
    } else {
      const fallbackSegment = toolbar.querySelector('.toolbar-segment:last-child');
      if (fallbackSegment) fallbackSegment.appendChild(control);
      else toolbar.appendChild(control);
    }
  });
  wireInlineColorMenuGlobalListeners();
}

/**
 * @function toggleListPrefix
 * @description Toggles list prefix.
 */

function toggleListPrefix(textarea, listType = 'ul') {
  if (!textarea) return;
  const value = textarea.value || '';
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const meta = parseListLineMeta(line);
  const indent = (line.match(/^\s*/) || [''])[0];
  const content = line.slice(indent.length);
  const plainText = meta ? meta.text : content;

  let nextLine = line;
  if (listType === 'ol') {
    if (meta?.type === 'ol') nextLine = meta.indent + plainText;
    else nextLine = indent + '1. ' + plainText;
  } else {
    if (meta?.type === 'ul') nextLine = meta.indent + plainText;
    else nextLine = indent + '- ' + plainText;
  }

  textarea.setRangeText(nextLine, lineStart, lineEnd, 'end');
  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function getTableTargetLabel
 * @description Returns the table target label.
 */

function getTableTargetLabel(targetId = '') {
  const map = {
    cardPrompt: 'Question',
    cardAnswer: 'Answer',
    editCardPrompt: 'Edit Question',
    editCardAnswer: 'Edit Answer'
  };
  return map[targetId] || 'Question';
}

/**
 * @function clampTableRows
 * @description Clamps table rows.
 */

function clampTableRows(value = 3) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value) || 3)));
}

/**
 * @function clampTableCols
 * @description Clamps table cols.
 */

function clampTableCols(value = 3) {
  return Math.max(1, Math.min(10, Math.trunc(Number(value) || 3)));
}

/**
 * @function normalizeTableCellAlign
 * @description Normalizes table cell align.
 */

function normalizeTableCellAlign(value = '') {
  const v = String(value || '').toLowerCase();
  if (v === 'center' || v === 'right') return v;
  return 'left';
}

/**
 * @function normalizeTableMergeRegion
 * @description Normalizes a table merge region to current table bounds.
 */

function normalizeTableMergeRegion(region, state) {
  const safeState = state && typeof state === 'object' ? state : normalizeTableBuilderState();
  const zone = String(region?.zone || '') === 'header' ? 'header' : 'body';
  if (zone === 'header' && !safeState.withHeader) return null;
  const maxRow = zone === 'header' ? 0 : Math.max(0, safeState.rows - 1);
  const maxCol = Math.max(0, safeState.cols - 1);

  const startRowRaw = Number.isFinite(Number(region?.startRow)) ? Number(region.startRow) : 0;
  const endRowRaw = Number.isFinite(Number(region?.endRow)) ? Number(region.endRow) : startRowRaw;
  const startColRaw = Number.isFinite(Number(region?.startCol)) ? Number(region.startCol) : 0;
  const endColRaw = Number.isFinite(Number(region?.endCol)) ? Number(region.endCol) : startColRaw;

  let startRow = Math.max(0, Math.min(maxRow, Math.trunc(startRowRaw)));
  let endRow = Math.max(0, Math.min(maxRow, Math.trunc(endRowRaw)));
  let startCol = Math.max(0, Math.min(maxCol, Math.trunc(startColRaw)));
  let endCol = Math.max(0, Math.min(maxCol, Math.trunc(endColRaw)));

  if (zone === 'header') {
    startRow = 0;
    endRow = 0;
  }
  if (endRow < startRow) [startRow, endRow] = [endRow, startRow];
  if (endCol < startCol) [startCol, endCol] = [endCol, startCol];
  if (startRow === endRow && startCol === endCol) return null;

  return { zone, startRow, endRow, startCol, endCol };
}

/**
 * @function tableRegionsIntersect
 * @description Returns true when two merge/selection regions overlap.
 */

function tableRegionsIntersect(a, b) {
  if (!a || !b) return false;
  if (a.zone !== b.zone) return false;
  return !(a.endRow < b.startRow || b.endRow < a.startRow || a.endCol < b.startCol || b.endCol < a.startCol);
}

/**
 * @function tableRegionEquals
 * @description Returns true when two regions are identical.
 */

function tableRegionEquals(a, b) {
  if (!a || !b) return false;
  return a.zone === b.zone
    && a.startRow === b.startRow
    && a.endRow === b.endRow
    && a.startCol === b.startCol
    && a.endCol === b.endCol;
}

/**
 * @function normalizeTableMergeRegions
 * @description Normalizes and de-duplicates merge regions for current table state.
 */

function normalizeTableMergeRegions(regions = [], state = null) {
  const safeState = state && typeof state === 'object' ? state : normalizeTableBuilderState();
  const out = [];
  const list = Array.isArray(regions) ? regions : [];
  list.forEach(region => {
    const normalized = normalizeTableMergeRegion(region, safeState);
    if (!normalized) return;
    if (out.some(existing => tableRegionsIntersect(existing, normalized))) return;
    out.push(normalized);
  });
  return out;
}

/**
 * @function buildTableMergeLookup
 * @description Builds anchor/covered lookup for merged cells.
 */

function buildTableMergeLookup(state, zone = 'body') {
  const safeState = state && typeof state === 'object' ? state : normalizeTableBuilderState();
  const lookup = new Map();
  const wantedZone = zone === 'header' ? 'header' : 'body';
  const regions = normalizeTableMergeRegions(safeState.mergeRegions, safeState).filter(region => region.zone === wantedZone);
  regions.forEach(region => {
    const rowSpan = region.endRow - region.startRow + 1;
    const colSpan = region.endCol - region.startCol + 1;
    for (let row = region.startRow; row <= region.endRow; row++) {
      for (let col = region.startCol; col <= region.endCol; col++) {
        const key = `${wantedZone}:${row}:${col}`;
        if (row === region.startRow && col === region.startCol) {
          lookup.set(key, {
            kind: 'anchor',
            zone: wantedZone,
            startRow: region.startRow,
            endRow: region.endRow,
            startCol: region.startCol,
            endCol: region.endCol,
            rowSpan,
            colSpan
          });
        } else {
          lookup.set(key, {
            kind: 'covered',
            zone: wantedZone,
            anchorRow: region.startRow,
            anchorCol: region.startCol
          });
        }
      }
    }
  });
  return lookup;
}

/**
 * @function getTableSelectionRegion
 * @description Returns the current selection as a normalized region.
 */

function getTableSelectionRegion() {
  const selection = getTableBuilderSelection();
  if (!selection) return null;
  return {
    zone: selection.zone,
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol)
  };
}

/**
 * @function resizeTableGrid
 * @description Handles resize table grid logic.
 */

function resizeTableGrid(source = [], rows = 1, cols = 1) {
  const safeSource = Array.isArray(source) ? source : [];
  return Array.from({ length: rows }, (_, rowIdx) => {
    const prevRow = Array.isArray(safeSource[rowIdx]) ? safeSource[rowIdx] : [];
    return Array.from({ length: cols }, (_, colIdx) => String(prevRow[colIdx] ?? ''));
  });
}

/**
 * @function resizeTableAlignmentGrid
 * @description Handles resize table alignment grid logic.
 */

function resizeTableAlignmentGrid(source = [], rows = 1, cols = 1) {
  const safeSource = Array.isArray(source) ? source : [];
  return Array.from({ length: rows }, (_, rowIdx) => {
    const prevRow = Array.isArray(safeSource[rowIdx]) ? safeSource[rowIdx] : [];
    return Array.from({ length: cols }, (_, colIdx) => normalizeTableCellAlign(prevRow[colIdx] ?? 'left'));
  });
}

/**
 * @function normalizeTableBuilderState
 * @description Normalizes table builder state.
 */

function normalizeTableBuilderState(next = {}) {
  const rows = clampTableRows(next.rows ?? tableBuilderState.rows);
  const cols = clampTableCols(next.cols ?? tableBuilderState.cols);
  const withHeader = typeof next.withHeader === 'boolean'
    ? next.withHeader
    : !!tableBuilderState.withHeader;
  const headerSource = Array.isArray(next.header) ? [next.header] : [tableBuilderState.header];
  const bodySource = Array.isArray(next.body) ? next.body : tableBuilderState.body;
  const headerAlignSource = Array.isArray(next.headerAlign) ? [next.headerAlign] : [tableBuilderState.headerAlign];
  const bodyAlignSource = Array.isArray(next.bodyAlign) ? next.bodyAlign : tableBuilderState.bodyAlign;
  const header = resizeTableGrid(headerSource, 1, cols)[0];
  const body = resizeTableGrid(bodySource, rows, cols);
  const headerAlign = resizeTableAlignmentGrid(headerAlignSource, 1, cols)[0];
  const bodyAlign = resizeTableAlignmentGrid(bodyAlignSource, rows, cols);
  const mergeSource = Array.isArray(next.mergeRegions) ? next.mergeRegions : tableBuilderState.mergeRegions;
  const baseState = { rows, cols, withHeader, header, body, headerAlign, bodyAlign, mergeRegions: [] };
  const mergeRegions = normalizeTableMergeRegions(mergeSource, baseState);
  tableBuilderState = { ...baseState, mergeRegions };
  return tableBuilderState;
}

/**
 * @function getTableBuilderCellAlign
 * @description Returns the table builder cell align.
 */

function getTableBuilderCellAlign(zone = 'body', row = 0, col = 0) {
  const state = normalizeTableBuilderState();
  if (zone === 'header') return normalizeTableCellAlign(state.headerAlign[col] || 'left');
  return normalizeTableCellAlign(state.bodyAlign[row]?.[col] || 'left');
}

/**
 * @function setTableBuilderCellAlign
 * @description Sets the table builder cell align.
 */

function setTableBuilderCellAlign(zone = 'body', row = 0, col = 0, align = 'left') {
  const state = normalizeTableBuilderState();
  const safeAlign = normalizeTableCellAlign(align);
  if (zone === 'header') {
    if (col < 0 || col >= state.cols) return;
    state.headerAlign[col] = safeAlign;
  } else {
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return;
    state.bodyAlign[row][col] = safeAlign;
  }
}

/**
 * @function getTableBuilderSelection
 * @description Returns the table builder selection.
 */

function getTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  if (!tableBuilderSelection) return null;
  const zone = tableBuilderSelection.zone === 'header' ? 'header' : 'body';
  if (zone === 'header' && !state.withHeader) return null;

  const maxRow = zone === 'header' ? 0 : Math.max(0, state.rows - 1);
  const maxCol = Math.max(0, state.cols - 1);
  const startRow = Math.max(0, Math.min(maxRow, Math.trunc(Number(tableBuilderSelection.startRow ?? tableBuilderSelection.row ?? 0))));
  const endRow = Math.max(0, Math.min(maxRow, Math.trunc(Number(tableBuilderSelection.endRow ?? tableBuilderSelection.row ?? startRow))));
  const startCol = Math.max(0, Math.min(maxCol, Math.trunc(Number(tableBuilderSelection.startCol ?? tableBuilderSelection.col ?? 0))));
  const endCol = Math.max(0, Math.min(maxCol, Math.trunc(Number(tableBuilderSelection.endCol ?? tableBuilderSelection.col ?? startCol))));

  if (zone === 'header') {
    return {
      zone,
      startRow: 0,
      endRow: 0,
      startCol: Math.min(startCol, endCol),
      endCol: Math.max(startCol, endCol)
    };
  }
  return {
    zone,
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol)
  };
}

/**
 * @function setTableBuilderSelection
 * @description Sets the table builder selection.
 */

function setTableBuilderSelection(zone = 'body', row = 0, col = 0, options = {}) {
  const state = normalizeTableBuilderState();
  const safeZone = zone === 'header' ? 'header' : 'body';
  const safeRow = Math.max(0, Number(row || 0));
  const safeCol = Math.max(0, Number(col || 0));
  if (safeCol >= state.cols || safeCol < 0) return;
  const opts = options && typeof options === 'object' ? options : {};
  const extendRange = !!opts.extendRange;
  const userInitiated = opts.userInitiated !== false;
  const current = getTableBuilderSelection();
  if (safeZone === 'header') {
    if (!state.withHeader) return;
    const anchorCol = extendRange && current?.zone === 'header' ? current.startCol : safeCol;
    tableBuilderSelection = {
      zone: 'header',
      startRow: 0,
      endRow: 0,
      startCol: Math.min(anchorCol, safeCol),
      endCol: Math.max(anchorCol, safeCol)
    };
  } else {
    if (safeRow >= state.rows || safeRow < 0) return;
    const anchorRow = extendRange && current?.zone === 'body' ? current.startRow : safeRow;
    const anchorCol = extendRange && current?.zone === 'body' ? current.startCol : safeCol;
    tableBuilderSelection = {
      zone: 'body',
      startRow: Math.min(anchorRow, safeRow),
      endRow: Math.max(anchorRow, safeRow),
      startCol: Math.min(anchorCol, safeCol),
      endCol: Math.max(anchorCol, safeCol)
    };
  }
  if (userInitiated) tableBuilderHasUserSelection = true;
  syncTableBuilderAlignmentButtons();
  syncTableBuilderSelectionLabel();
  syncTableBuilderMergeButtons();
}

/**
 * @function ensureTableBuilderSelection
 * @description Ensures table builder selection.
 */

function ensureTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  if (!state.rows || !state.cols) {
    tableBuilderSelection = null;
    return null;
  }
  return getTableBuilderSelection();
}

/**
 * @function clearTableBuilderSelection
 * @description Clears current table-builder selection and resets related controls.
 */

function clearTableBuilderSelection() {
  tableBuilderSelection = null;
  tableBuilderHasUserSelection = false;
  syncTableBuilderAlignmentButtons();
  syncTableBuilderSelectionLabel();
  syncTableBuilderMergeButtons();
}

/**
 * @function syncTableBuilderAlignmentButtons
 * @description Synchronizes table builder alignment buttons.
 */

function syncTableBuilderAlignmentButtons() {
  const selection = ensureTableBuilderSelection();
  let selectedAlign = null;
  if (selection) {
    const aligns = [];
    for (let row = selection.startRow; row <= selection.endRow; row++) {
      for (let col = selection.startCol; col <= selection.endCol; col++) {
        aligns.push(getTableBuilderCellAlign(selection.zone, row, col));
      }
    }
    if (aligns.length && aligns.every(align => align === aligns[0])) selectedAlign = aligns[0];
  }
  document.querySelectorAll('.table-builder-align-btn').forEach(btn => {
    const align = normalizeTableCellAlign(btn.dataset.align || 'left');
    const isActive = !!selectedAlign && selectedAlign === align;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/**
 * @function syncTableBuilderSelectionLabel
 * @description Synchronizes table builder selection label.
 */

function syncTableBuilderSelectionLabel() {
  const label = el('tableCellSelectionLabel');
  if (!label) return;
  const selection = ensureTableBuilderSelection();
  if (!selection) {
    label.textContent = 'Cell: none selected';
    return;
  }
  const isRange = selection.startRow !== selection.endRow || selection.startCol !== selection.endCol;
  if (selection.zone === 'header') {
    label.textContent = isRange
      ? `Cells: Header ${selection.startCol + 1}-${selection.endCol + 1}`
      : `Cell: Header ${selection.startCol + 1}`;
    return;
  }
  label.textContent = isRange
    ? `Cells: R${selection.startRow + 1}C${selection.startCol + 1} → R${selection.endRow + 1}C${selection.endCol + 1}`
    : `Cell: R${selection.startRow + 1} C${selection.startCol + 1}`;
}

/**
 * @function applyTableBuilderInputAlign
 * @description Applies table builder input align.
 */

function applyTableBuilderInputAlign(input, align = 'left') {
  if (!(input instanceof HTMLInputElement)) return;
  const safeAlign = normalizeTableCellAlign(align);
  input.classList.remove('table-align-left', 'table-align-center', 'table-align-right');
  input.classList.add(`table-align-${safeAlign}`);
}

/**
 * @function syncTableBuilderControls
 * @description Synchronizes table builder controls.
 */

function syncTableBuilderControls() {
  const rowsInput = el('tableRowsInput');
  const colsInput = el('tableColsInput');
  const headerToggle = el('tableHeaderToggle');
  const state = normalizeTableBuilderState();
  if (rowsInput) rowsInput.value = String(state.rows);
  if (colsInput) colsInput.value = String(state.cols);
  if (headerToggle) headerToggle.checked = !!state.withHeader;
}

/**
 * @function createTableBuilderInput
 * @description Creates table builder input.
 */

function createTableBuilderInput(zone = 'body', row = 0, col = 0, value = '', align = 'left') {
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.className = 'table-builder-cell-input';
  input.dataset.zone = zone;
  input.dataset.row = String(row);
  input.dataset.col = String(col);
  input.placeholder = zone === 'header' ? `Header ${col + 1}` : `R${row + 1}C${col + 1}`;
  input.value = value;
  applyTableBuilderInputAlign(input, align);
  attachAutoClose(input);
  input.addEventListener('keydown', handleInlineFormatShortcut);
  input.addEventListener('keydown', handleTextAlignShortcut);
  return input;
}

/**
 * @function renderTableBuilderGrid
 * @description Renders table builder grid.
 */

function renderTableBuilderGrid() {
  const container = el('tableBuilderGrid');
  if (!container) return;
  const state = normalizeTableBuilderState();
  container.innerHTML = '';

  const sheet = document.createElement('table');
  sheet.className = 'table-builder-sheet';
  const selection = getTableSelectionRegion();
  const headerMergeLookup = buildTableMergeLookup(state, 'header');
  const bodyMergeLookup = buildTableMergeLookup(state, 'body');

  if (state.withHeader) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (let colIdx = 0; colIdx < state.cols; colIdx++) {
      const key = `header:0:${colIdx}`;
      const mergeMeta = headerMergeLookup.get(key);
      if (mergeMeta?.kind === 'covered') continue;
      const th = document.createElement('th');
      const region = mergeMeta?.kind === 'anchor'
        ? mergeMeta
        : { zone: 'header', startRow: 0, endRow: 0, startCol: colIdx, endCol: colIdx, rowSpan: 1, colSpan: 1 };
      const isSelected = !!selection && tableRegionsIntersect(selection, region);
      th.classList.toggle('is-selected', isSelected);
      if (region.colSpan > 1) th.colSpan = region.colSpan;
      const input = createTableBuilderInput('header', 0, colIdx, state.header[colIdx], state.headerAlign[colIdx]);
      th.appendChild(input);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    sheet.appendChild(thead);
  }

  const tbody = document.createElement('tbody');
  state.body.forEach((rowValues, rowIdx) => {
    const tr = document.createElement('tr');
    for (let colIdx = 0; colIdx < rowValues.length; colIdx++) {
      const key = `body:${rowIdx}:${colIdx}`;
      const mergeMeta = bodyMergeLookup.get(key);
      if (mergeMeta?.kind === 'covered') continue;
      const td = document.createElement('td');
      const region = mergeMeta?.kind === 'anchor'
        ? mergeMeta
        : { zone: 'body', startRow: rowIdx, endRow: rowIdx, startCol: colIdx, endCol: colIdx, rowSpan: 1, colSpan: 1 };
      const isSelected = !!selection && tableRegionsIntersect(selection, region);
      td.classList.toggle('is-selected', isSelected);
      if (region.colSpan > 1) td.colSpan = region.colSpan;
      if (region.rowSpan > 1) td.rowSpan = region.rowSpan;
      const input = createTableBuilderInput('body', rowIdx, colIdx, rowValues[colIdx], state.bodyAlign[rowIdx][colIdx]);
      td.appendChild(input);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  sheet.appendChild(tbody);
  container.appendChild(sheet);
  syncTableBuilderAlignmentButtons();
  syncTableBuilderSelectionLabel();
  syncTableBuilderMergeButtons();
}

/**
 * @function updateTableBuilderFromControls
 * @description Updates table builder from controls.
 */

function updateTableBuilderFromControls() {
  const rowsInput = el('tableRowsInput');
  const colsInput = el('tableColsInput');
  const headerToggle = el('tableHeaderToggle');
  normalizeTableBuilderState({
    rows: clampTableRows(rowsInput?.value),
    cols: clampTableCols(colsInput?.value),
    withHeader: !!headerToggle?.checked
  });
  syncTableBuilderControls();
  renderTableBuilderGrid();
}

/**
 * @function stepTableBuilderSize
 * @description Steps table builder size.
 */

function stepTableBuilderSize(axis = 'rows', delta = 1) {
  const state = normalizeTableBuilderState();
  if (axis === 'cols') {
    normalizeTableBuilderState({ cols: clampTableCols(state.cols + delta) });
  } else {
    normalizeTableBuilderState({ rows: clampTableRows(state.rows + delta) });
  }
  syncTableBuilderControls();
  renderTableBuilderGrid();
}

/**
 * @function handleTableBuilderInput
 * @description Handles table builder input.
 */

function handleTableBuilderInput(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('table-builder-cell-input')) return;
  const zone = target.dataset.zone || 'body';
  const row = Math.max(0, Number(target.dataset.row || 0));
  const col = Math.max(0, Number(target.dataset.col || 0));
  const value = String(target.value || '');
  const state = normalizeTableBuilderState();
  if (zone === 'header') {
    if (col < state.cols) state.header[col] = value;
  } else if (row < state.rows && col < state.cols) {
    state.body[row][col] = value;
  }
}

/**
 * @function handleTableBuilderPointerDown
 * @description Tracks pointer-origin focus so Shift+click range selection is not reset by focus events.
 */

function handleTableBuilderPointerDown(e) {
  const target = e.target;
  suppressTableBuilderFocusSelection = !!(target instanceof HTMLInputElement && target.classList.contains('table-builder-cell-input'));
}

/**
 * @function handleTableBuilderSelection
 * @description Handles table builder selection.
 */

function handleTableBuilderSelection(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('table-builder-cell-input')) return;
  if (e.type === 'focusin' && (suppressTableBuilderFocusSelection || suppressTableBuilderProgrammaticFocusSelection)) {
    suppressTableBuilderProgrammaticFocusSelection = false;
    return;
  }
  const zone = target.dataset.zone || 'body';
  const row = Math.max(0, Number(target.dataset.row || 0));
  const col = Math.max(0, Number(target.dataset.col || 0));
  const hasSelection = !!getTableBuilderSelection();
  const extendRange = e.type === 'click' && !!e.shiftKey && hasSelection && tableBuilderHasUserSelection;
  setTableBuilderSelection(zone, row, col, { extendRange });
  if (e.type === 'click') suppressTableBuilderFocusSelection = false;
}

/**
 * @function applyTableBuilderSelectedAlignment
 * @description Applies table builder selected alignment.
 */

function applyTableBuilderSelectedAlignment(align = 'left') {
  const selection = ensureTableBuilderSelection();
  if (!selection) return;
  const safeAlign = normalizeTableCellAlign(align);
  for (let row = selection.startRow; row <= selection.endRow; row++) {
    for (let col = selection.startCol; col <= selection.endCol; col++) {
      setTableBuilderCellAlign(selection.zone, row, col, safeAlign);
      const input = document.querySelector(
        `.table-builder-cell-input[data-zone="${selection.zone}"][data-row="${row}"][data-col="${col}"]`
      );
      applyTableBuilderInputAlign(input, safeAlign);
    }
  }
  syncTableBuilderAlignmentButtons();
}

/**
 * @function syncTableBuilderMergeButtons
 * @description Updates merge/unmerge control states based on current selection.
 */

function syncTableBuilderMergeButtons() {
  const mergeBtn = el('tableMergeBtn');
  const unmergeBtn = el('tableUnmergeBtn');
  if (!mergeBtn && !unmergeBtn) return;
  const selection = getTableSelectionRegion();
  if (!selection) {
    if (mergeBtn) mergeBtn.disabled = true;
    if (unmergeBtn) unmergeBtn.disabled = true;
    return;
  }
  const hasRange = selection.startRow !== selection.endRow || selection.startCol !== selection.endCol;
  if (mergeBtn) mergeBtn.disabled = !hasRange;
  if (unmergeBtn) {
    const state = normalizeTableBuilderState();
    const regions = normalizeTableMergeRegions(state.mergeRegions, state);
    const hasIntersectingRegion = regions.some(region => tableRegionsIntersect(region, selection));
    unmergeBtn.disabled = !hasIntersectingRegion;
  }
}

/**
 * @function mergeTableBuilderSelection
 * @description Merges the currently selected rectangular range into one cell.
 */

function mergeTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  const selection = getTableSelectionRegion();
  if (!selection) return;
  const hasRange = selection.startRow !== selection.endRow || selection.startCol !== selection.endCol;
  if (!hasRange) return;

  const regions = normalizeTableMergeRegions(state.mergeRegions, state);
  const overlaps = regions.some(region => tableRegionsIntersect(region, selection) && !tableRegionEquals(region, selection));
  if (overlaps) {
    alert('Selection overlaps an existing merged area. Please unmerge first.');
    return;
  }

  const anchorRow = selection.startRow;
  const anchorCol = selection.startCol;
  const anchorAlign = getTableBuilderCellAlign(selection.zone, anchorRow, anchorCol);
  const nextRegions = regions.filter(region => !tableRegionEquals(region, selection));
  nextRegions.push(selection);
  state.mergeRegions = normalizeTableMergeRegions(nextRegions, state);

  if (selection.zone === 'header') {
    for (let col = selection.startCol; col <= selection.endCol; col++) {
      if (col === anchorCol) continue;
      state.header[col] = '';
      state.headerAlign[col] = anchorAlign;
    }
  } else {
    for (let row = selection.startRow; row <= selection.endRow; row++) {
      for (let col = selection.startCol; col <= selection.endCol; col++) {
        if (row === anchorRow && col === anchorCol) continue;
        state.body[row][col] = '';
        state.bodyAlign[row][col] = anchorAlign;
      }
    }
  }

  renderTableBuilderGrid();
}

/**
 * @function unmergeTableBuilderSelection
 * @description Removes merged regions intersecting the current selection.
 */

function unmergeTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  const selection = getTableSelectionRegion();
  if (!selection) return;
  const regions = normalizeTableMergeRegions(state.mergeRegions, state);
  const nextRegions = regions.filter(region => !tableRegionsIntersect(region, selection));
  if (nextRegions.length === regions.length) return;
  state.mergeRegions = nextRegions;
  renderTableBuilderGrid();
}

/**
 * @function escapeMarkdownTableCell
 * @description Handles escape markdown table cell logic.
 */

function escapeMarkdownTableCell(value = '') {
  return String(value || '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * @function encodeMarkdownTableCell
 * @description Handles encode markdown table cell logic.
 */

function encodeMarkdownTableCell(value = '', align = 'left', options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  if (opts.covered) return '[[merge]]';
  const text = escapeMarkdownTableCell(value);
  const safeAlign = normalizeTableCellAlign(align);
  const rowSpan = Math.max(1, Math.trunc(Number(opts.rowSpan) || 1));
  const colSpan = Math.max(1, Math.trunc(Number(opts.colSpan) || 1));
  const tokens = [];
  if (rowSpan > 1 || colSpan > 1) tokens.push(`[[span:${rowSpan}x${colSpan}]]`);
  if (safeAlign !== 'left') tokens.push(`[[align:${safeAlign}]]`);
  if (!tokens.length) return text;
  return `${tokens.join(' ')} ${text}`.trim();
}

/**
 * @function buildMarkdownTableFromState
 * @description Builds markdown table from state.
 */

function buildMarkdownTableFromState() {
  const state = normalizeTableBuilderState();
  const cols = state.cols;
  const headerMergeLookup = buildTableMergeLookup(state, 'header');
  const bodyMergeLookup = buildTableMergeLookup(state, 'body');
  const headerCells = state.withHeader
    ? state.header.map((value, idx) => {
      const mergeMeta = headerMergeLookup.get(`header:0:${idx}`);
      if (mergeMeta?.kind === 'covered') return encodeMarkdownTableCell('', 'left', { covered: true });
      return encodeMarkdownTableCell(value, state.headerAlign[idx], {
        rowSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.rowSpan : 1,
        colSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.colSpan : 1
      });
    })
    : Array.from({ length: cols }, () => '');
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
  ];
  state.body.forEach((row, rowIdx) => {
    lines.push(`| ${row.map((value, colIdx) => {
      const mergeMeta = bodyMergeLookup.get(`body:${rowIdx}:${colIdx}`);
      if (mergeMeta?.kind === 'covered') return encodeMarkdownTableCell('', 'left', { covered: true });
      return encodeMarkdownTableCell(value, state.bodyAlign[rowIdx][colIdx], {
        rowSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.rowSpan : 1,
        colSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.colSpan : 1
      });
    }).join(' | ')} |`);
  });
  return lines.join('\n');
}

/**
 * @function decodeMarkdownTableCell
 * @description Decodes alignment token + text from a markdown table cell.
 */

function decodeMarkdownTableCell(value = '') {
  const parsed = parseTableCellMetaToken(value);
  return {
    text: String(parsed.text || ''),
    align: normalizeTableCellAlign(parsed.align || 'left'),
    hasAlignToken: !!parsed.align,
    covered: !!parsed.covered,
    rowSpan: Math.max(1, Math.trunc(Number(parsed.rowSpan) || 1)),
    colSpan: Math.max(1, Math.trunc(Number(parsed.colSpan) || 1))
  };
}

/**
 * @function findMarkdownTableAtSelection
 * @description Finds a markdown table block at the textarea selection and converts it into table builder state.
 */

function findMarkdownTableAtSelection(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return null;
  const raw = String(textarea.value || '');
  if (!raw.includes('|')) return null;

  const lines = raw.split('\n');
  if (lines.length < 2) return null;

  const lineStarts = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push(cursor);
    cursor += lines[i].length + 1;
  }

  const selectionStart = Math.max(0, Math.min(raw.length, Number(textarea.selectionStart || 0)));
  const selectionEnd = Math.max(0, Math.min(raw.length, Number(textarea.selectionEnd || selectionStart)));
  const minSel = Math.min(selectionStart, selectionEnd);
  const maxSel = Math.max(selectionStart, selectionEnd);

  for (let i = 0; i < lines.length - 1; i++) {
    const headerCells = splitMarkdownTableRow(lines[i]);
    if (!headerCells) continue;

    const alignments = parseMarkdownTableAlignments(lines[i + 1], headerCells.length);
    if (!alignments) continue;

    const bodyRows = [];
    let j = i + 2;
    while (j < lines.length) {
      const rowCells = splitMarkdownTableRow(lines[j]);
      if (!rowCells || rowCells.length !== headerCells.length) break;
      bodyRows.push(rowCells);
      j += 1;
    }

    const blockStart = lineStarts[i];
    const lastLineIdx = Math.max(i + 1, j - 1);
    const blockEnd = lineStarts[lastLineIdx] + lines[lastLineIdx].length;
    const overlapsSelection = maxSel >= blockStart && minSel <= blockEnd;
    if (!overlapsSelection) {
      i = Math.max(i, j - 1);
      continue;
    }

    const cols = headerCells.length;
    const normalizedBodyRows = bodyRows.length
      ? bodyRows
      : [Array.from({ length: cols }, () => '')];

    const decodedHeader = headerCells.map((cell, idx) => {
      const decoded = decodeMarkdownTableCell(cell);
      return {
        text: decoded.covered ? '' : decoded.text,
        align: decoded.hasAlignToken ? decoded.align : normalizeTableCellAlign(alignments[idx] || 'left'),
        covered: decoded.covered,
        rowSpan: decoded.rowSpan,
        colSpan: decoded.colSpan
      };
    });
    const decodedBody = normalizedBodyRows.map(row => Array.from({ length: cols }, (_, idx) => {
      const decoded = decodeMarkdownTableCell(row[idx] ?? '');
      return {
        text: decoded.covered ? '' : decoded.text,
        align: decoded.hasAlignToken ? decoded.align : normalizeTableCellAlign(alignments[idx] || 'left'),
        covered: decoded.covered,
        rowSpan: decoded.rowSpan,
        colSpan: decoded.colSpan
      };
    }));

    const withHeader = decodedHeader.some(cell => cell.text.trim().length > 0);
    const mergeRegions = [];
    decodedHeader.forEach((cell, colIdx) => {
      if (cell.covered) return;
      if (cell.colSpan <= 1) return;
      mergeRegions.push({
        zone: 'header',
        startRow: 0,
        endRow: 0,
        startCol: colIdx,
        endCol: Math.min(cols - 1, colIdx + cell.colSpan - 1)
      });
    });
    decodedBody.forEach((row, rowIdx) => {
      row.forEach((cell, colIdx) => {
        if (cell.covered) return;
        if (cell.rowSpan <= 1 && cell.colSpan <= 1) return;
        mergeRegions.push({
          zone: 'body',
          startRow: rowIdx,
          endRow: Math.min(decodedBody.length - 1, rowIdx + cell.rowSpan - 1),
          startCol: colIdx,
          endCol: Math.min(cols - 1, colIdx + cell.colSpan - 1)
        });
      });
    });
    return {
      range: { start: blockStart, end: blockEnd },
      state: {
        rows: Math.max(1, decodedBody.length),
        cols,
        withHeader,
        header: decodedHeader.map(cell => cell.text),
        body: decodedBody.map(row => row.map(cell => cell.text)),
        headerAlign: decodedHeader.map(cell => cell.align),
        bodyAlign: decodedBody.map(row => row.map(cell => cell.align)),
        mergeRegions
      }
    };
  }

  return null;
}

/**
 * @function insertGeneratedTableIntoTextarea
 * @description Handles insert generated table into textarea logic.
 */

function insertGeneratedTableIntoTextarea(textarea, tableMarkdown = '') {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const tableText = String(tableMarkdown || '').trim();
  if (!tableText) return;
  ensureListInputLeftAligned(textarea);
  const value = textarea.value || '';
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const needsLeadingBreak = start > 0 && value[start - 1] !== '\n';
  const needsTrailingBreak = end < value.length && value[end] !== '\n';
  const prefix = needsLeadingBreak ? '\n' : '';
  const suffix = needsTrailingBreak ? '\n' : '';
  const insertText = `${prefix}${tableText}${suffix}`;
  textarea.setRangeText(insertText, start, end, 'end');
  const caret = start + insertText.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function replaceGeneratedTableInTextarea
 * @description Replaces an existing markdown table block in a textarea.
 */

function replaceGeneratedTableInTextarea(textarea, tableMarkdown = '', start = 0, end = 0) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const tableText = String(tableMarkdown || '').trim();
  if (!tableText) return;
  ensureListInputLeftAligned(textarea);
  const value = String(textarea.value || '');
  const safeStart = Math.max(0, Math.min(value.length, Math.trunc(Number(start) || 0)));
  const safeEnd = Math.max(safeStart, Math.min(value.length, Math.trunc(Number(end) || safeStart)));
  textarea.setRangeText(tableText, safeStart, safeEnd, 'end');
  const caret = safeStart + tableText.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function openTableDialog
 * @description Opens the table dialog.
 */

function openTableDialog(targetId = '') {
  const dialog = el('tableDialog');
  if (!dialog) return;
  suppressTableBuilderFocusSelection = false;
  suppressTableBuilderProgrammaticFocusSelection = false;
  tableTarget = targetId || 'cardPrompt';
  const targetLabel = el('tableTargetLabel');
  const insertBtn = el('insertTableBtn');
  const targetText = getTableTargetLabel(tableTarget);
  tableEditRange = null;
  tableBuilderSelection = null;
  tableBuilderHasUserSelection = false;

  const textarea = el(tableTarget);
  const existingTable = findMarkdownTableAtSelection(textarea);
  if (existingTable) {
    tableEditRange = {
      targetId: tableTarget,
      start: existingTable.range.start,
      end: existingTable.range.end
    };
    normalizeTableBuilderState(existingTable.state);
    if (targetLabel) targetLabel.textContent = `Target: ${targetText} (Edit table)`;
    if (insertBtn) insertBtn.textContent = 'Update Table';
  } else {
    normalizeTableBuilderState({
      rows: 3,
      cols: 3,
      withHeader: true,
      header: [],
      body: [],
      headerAlign: [],
      bodyAlign: [],
      mergeRegions: []
    });
    if (targetLabel) targetLabel.textContent = `Target: ${targetText}`;
    if (insertBtn) insertBtn.textContent = 'Insert Table';
  }

  syncTableBuilderControls();
  renderTableBuilderGrid();
  showDialog(dialog);
  setTimeout(() => {
    const preferredSelector = tableBuilderSelection
      ? `.table-builder-cell-input[data-zone="${tableBuilderSelection.zone}"][data-row="${tableBuilderSelection.startRow}"][data-col="${tableBuilderSelection.startCol}"]`
      : '.table-builder-cell-input';
    const preferredCell = dialog.querySelector(preferredSelector);
    const firstCell = preferredCell || dialog.querySelector('.table-builder-cell-input');
    if (firstCell instanceof HTMLInputElement) {
      suppressTableBuilderProgrammaticFocusSelection = true;
      firstCell.focus();
      firstCell.select();
    }
  }, 0);
}

/**
 * @function insertTableFromDialog
 * @description Builds insert table from dialog.
 */

function insertTableFromDialog() {
  const textarea = el(tableTarget || '');
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const tableMarkdown = buildMarkdownTableFromState();
  const canReplaceExistingTable = tableEditRange
    && tableEditRange.targetId === tableTarget
    && Number.isFinite(Number(tableEditRange.start))
    && Number.isFinite(Number(tableEditRange.end));
  if (canReplaceExistingTable) {
    replaceGeneratedTableInTextarea(textarea, tableMarkdown, tableEditRange.start, tableEditRange.end);
  } else {
    insertGeneratedTableIntoTextarea(textarea, tableMarkdown);
  }
  tableEditRange = null;
  closeDialog(el('tableDialog'));
}

/**
 * @function handleListAutoIndent
 * @description Handles list auto indent.
 */

function handleListAutoIndent(e) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const textarea = e.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  if (start !== end) return;

  const value = textarea.value || '';
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', start);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const listMeta = parseListLineMeta(line);
  if (!listMeta) return;

  e.preventDefault();
  if (!listMeta.text.trim()) {
    const depth = getListDepth(listMeta);
    if (depth > 0) {
      const outdentedIndent = listMeta.indent.slice(0, Math.max(0, listMeta.indent.length - 2));
      let outdentedLine = '';
      if (listMeta.type === 'ol') {
        const outdentedSequence = listMeta.sequence.length > 1
          ? listMeta.sequence.slice(0, -1)
          : [1];
        outdentedLine = `${outdentedIndent}${formatOrderedSequence(outdentedSequence)} `;
      } else {
        const outdentedMarker = getOutdentedBulletMarker(listMeta.marker || '-');
        outdentedLine = `${outdentedIndent}${outdentedMarker} `;
      }
      textarea.setRangeText(outdentedLine, lineStart, lineEnd, 'end');
      const nextCaret = Math.min(lineStart + outdentedLine.length, textarea.value.length);
      textarea.setSelectionRange(nextCaret, nextCaret);
      emitTextareaInput(textarea);
      return;
    }
    // Root-level empty list line: remove marker in-place instead of creating a new line.
    textarea.setRangeText('', lineStart, lineEnd, 'end');
    textarea.setSelectionRange(lineStart, lineStart);
    emitTextareaInput(textarea);
    return;
  }

  let insert = '\n';
  if (listMeta.type === 'ul') {
    insert = `\n${listMeta.indent}${listMeta.marker || '-'} `;
  } else if (listMeta.type === 'ol') {
    const nextSequence = [...listMeta.sequence];
    nextSequence[nextSequence.length - 1] = (nextSequence[nextSequence.length - 1] || 0) + 1;
    insert = `\n${listMeta.indent}${formatOrderedSequence(nextSequence)} `;
  }
  textarea.setRangeText(insert, start, end, 'end');
  emitTextareaInput(textarea);
}

/**
 * @function handleListTabIndent
 * @description Handles list tab indent.
 */

function handleListTabIndent(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  const textarea = e.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  if (start !== end) return;

  const value = textarea.value || '';
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', start);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const listMeta = parseListLineMeta(line);
  if (!listMeta) {
    if (textarea.id === 'cardPrompt' && !e.shiftKey) {
      e.preventDefault();
      const answerField = el('cardAnswer');
      if (!(answerField instanceof HTMLTextAreaElement)) return;
      answerField.focus();
      const caret = answerField.value.length;
      answerField.setSelectionRange(caret, caret);
    }
    return;
  }

  e.preventDefault();
  let nextLine = line;
  if (e.shiftKey) {
    const outdentedIndent = listMeta.indent.slice(0, Math.max(0, listMeta.indent.length - 2));
    if (listMeta.type === 'ol') {
      const outdentedSequence = listMeta.sequence.length > 1
        ? listMeta.sequence.slice(0, -1)
        : listMeta.sequence;
      nextLine = `${outdentedIndent}${formatOrderedSequence(outdentedSequence)} ${listMeta.text || ''}`;
    } else {
      const outdentedMarker = getOutdentedBulletMarker(listMeta.marker || '-');
      nextLine = `${outdentedIndent}${outdentedMarker} ${listMeta.text || ''}`;
    }
  } else {
    const nestedIndent = `${listMeta.indent}  `;
    if (listMeta.type === 'ol') {
      const prevMeta = getPreviousNonEmptyLineMeta(value, lineStart);
      let parentSequence = listMeta.sequence.length > 1
        ? listMeta.sequence.slice(0, -1)
        : listMeta.sequence.slice();
      if (prevMeta?.type === 'ol' && prevMeta.sequence.length) {
        parentSequence = prevMeta.sequence.slice();
      }
      const nestedSequence = [...parentSequence, 1];
      nextLine = `${nestedIndent}${formatOrderedSequence(nestedSequence)} ${listMeta.text || ''}`;
    } else {
      const nestedMarker = getNestedBulletMarker(listMeta.marker || '-');
      nextLine = `${nestedIndent}${nestedMarker} ${listMeta.text || ''}`;
    }
  }

  textarea.setRangeText(nextLine, lineStart, lineEnd, 'end');
  const nextCaret = Math.min(lineStart + nextLine.length, textarea.value.length);
  textarea.setSelectionRange(nextCaret, nextCaret);
  emitTextareaInput(textarea);
}

/**
 * @function handleInlineFormatShortcut
 * @description Handles inline format shortcut.
 */

function handleInlineFormatShortcut(e) {
  if (e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey)) return;
  const inputEl = e.target;
  const isSupportedInput =
    inputEl instanceof HTMLTextAreaElement
    || (inputEl instanceof HTMLInputElement && inputEl.type === 'text');
  if (!isSupportedInput) return;
  const key = String(e.key || '').toLowerCase();
  if (key === 'b') {
    e.preventDefault();
    toggleInlineFormat(inputEl, 'bold');
  } else if (key === 'i') {
    e.preventDefault();
    toggleInlineFormat(inputEl, 'italic');
  } else if (key === 'u') {
    e.preventDefault();
    toggleInlineFormat(inputEl, 'underline');
  }
}

/**
 * @function applyInputAlignmentShortcut
 * @description Applies alignment shortcuts for editor text fields and MCQ option inputs.
 */

function applyInputAlignmentShortcut(inputEl, align = 'left') {
  if (!(inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement)) return;
  const targetAlign = normalizeTextAlign(align);
  if (inputEl.id === 'cardPrompt') applyCreateQuestionTextAlign(targetAlign);
  else if (inputEl.id === 'cardAnswer') applyCreateAnswerTextAlign(targetAlign);
  else if (inputEl.id === 'editCardPrompt') applyEditQuestionTextAlign(targetAlign);
  else if (inputEl.id === 'editCardAnswer') applyEditAnswerTextAlign(targetAlign);
  else if (inputEl.classList.contains('table-builder-cell-input')) {
    const zone = inputEl.dataset.zone === 'header' ? 'header' : 'body';
    const row = Math.max(0, Number(inputEl.dataset.row || 0));
    const col = Math.max(0, Number(inputEl.dataset.col || 0));
    const currentSelection = getTableBuilderSelection();
    const isInsideCurrentSelection = !!currentSelection
      && currentSelection.zone === zone
      && row >= currentSelection.startRow
      && row <= currentSelection.endRow
      && col >= currentSelection.startCol
      && col <= currentSelection.endCol;
    if (!isInsideCurrentSelection) {
      setTableBuilderSelection(zone, row, col, { userInitiated: true });
    }
    applyTableBuilderSelectedAlignment(targetAlign);
  }
  else if (inputEl.closest('#mcqOptions')) applyCreateOptionsTextAlign(targetAlign);
  else if (inputEl.closest('#editMcqOptions')) applyEditOptionsTextAlign(targetAlign);
}

/**
 * @function handleTextAlignShortcut
 * @description Handles text align shortcut.
 */

function handleTextAlignShortcut(e) {
  if (e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey)) return;
  const inputEl = e.target;
  const isSupportedInput =
    inputEl instanceof HTMLTextAreaElement
    || (inputEl instanceof HTMLInputElement && inputEl.type === 'text');
  if (!isSupportedInput) return;
  const key = String(e.key || '').toLowerCase();
  if (key === 'l') {
    e.preventDefault();
    applyInputAlignmentShortcut(inputEl, 'left');
  } else if (key === 'c') {
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? start;
    if (end > start) return; // keep native Cmd/Ctrl+C copy when text is selected
    e.preventDefault();
    applyInputAlignmentShortcut(inputEl, 'center');
  } else if (key === 'j') {
    e.preventDefault();
    applyInputAlignmentShortcut(inputEl, 'justify');
  }
}

/**
 * @function wireTextFormattingToolbar
 * @description Wires text formatting toolbar.
 */

function wireTextFormattingToolbar() {
  ensureInlineColorToolbarControls();
  document.querySelectorAll('.text-toolbar .toolbar-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const action = btn.dataset.action || '';
      if (action === 'align') {
        const group = btn.dataset.group || 'create-question';
        const align = normalizeTextAlign(btn.dataset.align || 'left');
        if (group === 'create-question') applyCreateQuestionTextAlign(align);
        else if (group === 'create-answer') applyCreateAnswerTextAlign(align);
        else if (group === 'edit-question') applyEditQuestionTextAlign(align);
        else if (group === 'edit-answer') applyEditAnswerTextAlign(align);
        else if (group === 'create-options') applyCreateOptionsTextAlign(align);
        else if (group === 'edit-options') applyEditOptionsTextAlign(align);
        else applyCreateQuestionTextAlign(align);
        return;
      }
      if (action === 'format') {
        const targetId = btn.dataset.target || '';
        const textarea = el(targetId);
        const format = btn.dataset.format || 'bold';
        toggleInlineFormat(textarea, format);
        return;
      }
      if (action === 'list') {
        const targetId = btn.dataset.target || '';
        const textarea = el(targetId);
        const listType = btn.dataset.list || 'ul';
        toggleListPrefix(textarea, listType);
        return;
      }
      if (action === 'table') {
        const targetId = btn.dataset.target || '';
        openTableDialog(targetId);
      }
    });
  });

  ['cardPrompt', 'cardAnswer', 'editCardPrompt', 'editCardAnswer'].forEach(id => {
    const textarea = el(id);
    if (!textarea) return;
    textarea.addEventListener('keydown', handleListTabIndent);
    textarea.addEventListener('keydown', handleListAutoIndent);
    textarea.addEventListener('keydown', handleInlineFormatShortcut);
    textarea.addEventListener('keydown', handleTextAlignShortcut);
  });

  syncToolbarAlignmentButtons('create-question', createQuestionTextAlign);
  syncToolbarAlignmentButtons('create-answer', createAnswerTextAlign);
  syncToolbarAlignmentButtons('edit-question', editQuestionTextAlign);
  syncToolbarAlignmentButtons('edit-answer', editAnswerTextAlign);
  syncToolbarAlignmentButtons('create-options', createOptionsTextAlign);
  syncToolbarAlignmentButtons('edit-options', editOptionsTextAlign);
}

const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
let html2canvasLoading = null;
let katexCssCache = null;
/**
 * @function ensureHtml2Canvas
 * @description Ensures html2 canvas.
 */
function ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  if (html2canvasLoading) return html2canvasLoading;
  html2canvasLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HTML2CANVAS_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.head.appendChild(script);
  });
  return html2canvasLoading;
}

/**
 * @function ensureStylesheetLoaded
 * @description Ensures stylesheet loaded.
 */

function ensureStylesheetLoaded(url) {
  if (!url) return;
  if (document.querySelector(`link[rel="stylesheet"][href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * @function loadScriptOnce
 * @description Loads script once.
 */

function loadScriptOnce(url) {
  if (!url) return Promise.reject(new Error('Missing script URL'));
  if (scriptLoadCache.has(url)) return scriptLoadCache.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadCache.delete(url);
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.head.appendChild(script);
  });
  scriptLoadCache.set(url, promise);
  return promise;
}

/**
 * @function ensureKatexLoaded
 * @description Loads KaTeX assets on demand before formula rendering is used.
 */

async function ensureKatexLoaded() {
  if (window.katex && window.renderMathInElement) return true;
  if (katexLoading) return katexLoading;
  katexLoading = (async () => {
    try {
      ensureStylesheetLoaded(KATEX_CSS_URL);
      if (!window.katex) await loadScriptOnce(KATEX_JS_URL);
      if (!window.renderMathInElement) await loadScriptOnce(KATEX_AUTORENDER_URL);
      return !!(window.katex && window.renderMathInElement);
    } catch (err) {
      return false;
    }
  })();
  const loaded = await katexLoading;
  if (!loaded) katexLoading = null;
  return loaded;
}

/**
 * @function getKatexCssText
 * @description Returns the KaTeX CSS text.
 */

async function getKatexCssText() {
  if (katexCssCache !== null) return katexCssCache;
  const link = document.querySelector('link[href*="katex.min.css"]');
  const href = link?.href || KATEX_CSS_URL;
  try {
    const res = await fetch(href);
    katexCssCache = res.ok ? await res.text() : '';
  } catch (err) {
    katexCssCache = '';
  }
  return katexCssCache;
}

/**
 * @function renderFormulaToSvgDataUrl
 * @description Renders formula to SVG data URL.
 */

async function renderFormulaToSvgDataUrl(renderEl) {
  const css = await getKatexCssText();
  const rect = renderEl.getBoundingClientRect();
  const width = Math.max(10, Math.ceil(rect.width || 0));
  const height = Math.max(10, Math.ceil(rect.height || 0));
  const safeCss = (css || '').replace(/<\/style>/g, '<\\/style>');
  const html = renderEl.outerHTML;
  const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block;">
              <style>${safeCss}</style>
              ${html}
            </div>
          </foreignObject>
        </svg>
      `;
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

const formulaTargets = {
  cardPrompt: { previewId: 'questionImagePreview', legacyKey: 'imageDataQ', label: 'Question' },
  cardAnswer: { previewId: 'answerImagePreview', legacyKey: 'imageDataA', label: 'Answer' },
  editCardPrompt: { previewId: 'editQuestionImagePreview', legacyKey: 'imageDataQ', label: 'Edit Question' },
  editCardAnswer: { previewId: 'editAnswerImagePreview', legacyKey: 'imageDataA', label: 'Edit Answer' }
};

/**
 * @function normalizeFormulaInput
 * @description Normalizes formula input.
 */

function normalizeFormulaInput(raw, displayToggle) {
  const t = (raw || '').trim();
  if (!t) return { text: '', display: !!displayToggle?.checked, detected: null };
  if (t.startsWith('$$') && t.endsWith('$$') && t.length > 4) {
    return { text: t.slice(2, -2).trim(), display: true, detected: true };
  }
  if (t.startsWith('\\[') && t.endsWith('\\]') && t.length > 4) {
    return { text: t.slice(2, -2).trim(), display: true, detected: true };
  }
  if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
    return { text: t.slice(1, -1).trim(), display: false, detected: false };
  }
  if (t.startsWith('\\(') && t.endsWith('\\)') && t.length > 4) {
    return { text: t.slice(2, -2).trim(), display: false, detected: false };
  }
  return { text: t, display: !!displayToggle?.checked, detected: null };
}

/**
 * @function renderFormulaPreview
 * @description Renders formula preview.
 */

function renderFormulaPreview() {
  const input = el('formulaInput');
  const renderEl = el('formulaRender');
  const errorEl = el('formulaError');
  const displayToggle = el('formulaDisplayToggle');
  const insertBtn = el('insertFormulaBtn');
  if (!input || !renderEl || !displayToggle || !errorEl || !insertBtn) return;

  const { text, display, detected } = normalizeFormulaInput(input.value, displayToggle);
  if (detected !== null) displayToggle.checked = display;
  renderEl.innerHTML = '';
  errorEl.classList.add('hidden');
  insertBtn.disabled = !text;
  if (!text) return;

  if (!window.katex) {
    errorEl.textContent = 'Loading formula renderer...';
    errorEl.classList.remove('hidden');
    insertBtn.disabled = true;
    ensureKatexLoaded().then(loaded => {
      if (loaded) {
        renderFormulaPreview();
        return;
      }
      errorEl.textContent = 'Formula renderer not available.';
      errorEl.classList.remove('hidden');
      insertBtn.disabled = true;
    });
    return;
  }
  try {
    window.katex.render(text, renderEl, { displayMode: display, throwOnError: true });
  } catch (err) {
    errorEl.textContent = 'Invalid formula. Please check your LaTeX.';
    errorEl.classList.remove('hidden');
    insertBtn.disabled = true;
  }
}

/**
 * @function insertFormulaImage
 * @description Handles insert formula image logic.
 */

async function insertFormulaImage() {
  const target = formulaTargets[formulaTarget];
  const input = el('formulaInput');
  const renderEl = el('formulaRender');
  const dialog = el('formulaDialog');
  if (!target || !input || !renderEl || !dialog) return;
  if (!input.value.trim()) return;
  renderFormulaPreview();
  let dataUrl = '';
  try {
    await ensureHtml2Canvas();
    if (window.html2canvas) {
      const canvas = await window.html2canvas(renderEl, { backgroundColor: null, scale: 2, useCORS: true });
      dataUrl = canvas.toDataURL('image/png');
    }
  } catch (err) {
    dataUrl = '';
  }
  if (!dataUrl) {
    dataUrl = await renderFormulaToSvgDataUrl(renderEl);
  }
  const targetField = el(formulaTarget);
  const previewEl = el(target.previewId);
  if (!targetField || !previewEl) return;

  const isCreateField = formulaTarget === 'cardPrompt' || formulaTarget === 'cardAnswer';
  appendImagesToField(
    targetField,
    previewEl,
    [dataUrl],
    target.legacyKey,
    () => { if (isCreateField) updateCreateValidation(); }
  );
  if (isCreateField) updateCreateValidation();
  dialog.close();
}

/**
 * @function openFormulaDialog
 * @description Opens the formula dialog.
 */

function openFormulaDialog(targetId) {
  const dialog = el('formulaDialog');
  const targetLabel = el('formulaTargetLabel');
  const input = el('formulaInput');
  const displayToggle = el('formulaDisplayToggle');
  if (!dialog || !input || !displayToggle) return;
  formulaTarget = targetId;
  const targetMeta = formulaTargets[targetId];
  if (targetLabel && targetMeta) targetLabel.textContent = `Target: ${targetMeta.label}`;
  input.value = '';
  displayToggle.checked = false;
  renderFormulaPreview();
  dialog.showModal();
}

/**
 * @function getCreateOptionCount
 * @description Returns the create option count.
 */

function getCreateOptionCount() {
  const primaryText = el('cardAnswer').value.trim();
  let count = primaryText ? 1 : 0;
  Array.from(el('mcqOptions').querySelectorAll('.mcq-row[data-primary="false"] input[type="text"]'))
    .forEach(input => {
      if (input.value.trim()) count += 1;
    });
  return count;
}

/**
 * @function parseMcqOptions
 * @description Parses MCQ options.
 */

function parseMcqOptions() {
  if (!mcqMode) return [];
  const options = [];
  const primaryText = el('cardAnswer').value.trim();
  const primaryToggle = el('primaryAnswerToggle');
  if (primaryText) {
    options.push({ text: primaryText, correct: primaryToggle ? primaryToggle.checked : true });
  }
  const rows = Array.from(el('mcqOptions').querySelectorAll('.mcq-row[data-primary="false"]'));
  rows.forEach(row => {
    const text = row.querySelector('input[type="text"]').value.trim();
    const correct = row.querySelector('.mcq-toggle input[type="checkbox"]').checked;
    if (text) options.push({ text, correct });
  });
  return options;
}

/**
 * @function addMcqRow
 * @description Adds one additional MCQ answer row in the create editor.
 */

function addMcqRow(text = '', correct = false, options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  const insertAtTop = opts.insertAtTop !== false;
  const focusInput = opts.focusInput !== false;
  const wrap = document.createElement('div');
  wrap.className = `mcq-row ${correct ? 'correct' : 'wrong'}`;
  wrap.dataset.primary = 'false';
  wrap.innerHTML = `
        <div class="mcq-row-header">
          <span class="mcq-badge ${correct ? 'correct' : 'wrong'}">${correct ? 'Correct Answer ✓' : 'Wrong Answer ✕'}</span>
          <label class="toggle mcq-toggle">
            <input type="checkbox" ${correct ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <input type="text" placeholder="Answer option..." value="${escapeHTML(text)}" />
        <div class="mcq-row-actions">
          <div class="tiny">Additional answer option</div>
          <button class="btn mcq-remove" type="button">Remove</button>
        </div>
      `;
  const toggle = wrap.querySelector('.mcq-toggle input[type="checkbox"]');
  const update = () => {
    const isCorrect = toggle.checked;
    wrap.classList.toggle('correct', isCorrect);
    wrap.classList.toggle('wrong', !isCorrect);
    const badge = wrap.querySelector('.mcq-badge');
    badge.className = `mcq-badge ${isCorrect ? 'correct' : 'wrong'}`;
    badge.textContent = isCorrect ? 'Correct Answer ✓' : 'Wrong Answer ✕';
  };
  toggle.addEventListener('change', update);
  const input = wrap.querySelector('input[type="text"]');
  if (input) {
    input.addEventListener('input', () => updateCreateValidation());
    input.addEventListener('keydown', handleInlineFormatShortcut);
    input.addEventListener('keydown', handleTextAlignShortcut);
  }
  wrap.querySelector('.mcq-remove').onclick = () => {
    wrap.remove();
    syncMcqPrimaryAnswerMode(false);
  };
  update();
  const optionsWrap = el('mcqOptions');
  if (!optionsWrap) return;
  if (insertAtTop && optionsWrap.firstChild) optionsWrap.insertBefore(wrap, optionsWrap.firstChild);
  else optionsWrap.appendChild(wrap);
  if (focusInput && input instanceof HTMLInputElement) {
    requestAnimationFrame(() => {
      input.focus();
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    });
  }
}

/**
 * @function parseEditMcqOptions
 * @description Parses edit MCQ options.
 */

function parseEditMcqOptions() {
  if (!editMcqMode) return [];
  const options = [];
  const primaryText = el('editCardAnswer').value.trim();
  const primaryToggle = el('editPrimaryAnswerToggle');
  if (primaryText) {
    options.push({ text: primaryText, correct: primaryToggle ? primaryToggle.checked : true });
  }
  const rows = Array.from(el('editMcqOptions').querySelectorAll('.mcq-row[data-primary="false"]'));
  rows.forEach(row => {
    const text = row.querySelector('input[type="text"]').value.trim();
    const correct = row.querySelector('.mcq-toggle input[type="checkbox"]').checked;
    if (text) options.push({ text, correct });
  });
  return options;
}

/**
 * @function addEditMcqRow
 * @description Adds one additional MCQ answer row in the edit dialog.
 */

function addEditMcqRow(text = '', correct = false, options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  const insertAtTop = opts.insertAtTop !== false;
  const focusInput = opts.focusInput !== false;
  const wrap = document.createElement('div');
  wrap.className = `mcq-row ${correct ? 'correct' : 'wrong'}`;
  wrap.dataset.primary = 'false';
  wrap.innerHTML = `
        <div class="mcq-row-header">
          <span class="mcq-badge ${correct ? 'correct' : 'wrong'}">${correct ? 'Correct Answer ✓' : 'Wrong Answer ✕'}</span>
          <label class="toggle mcq-toggle">
            <input type="checkbox" ${correct ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <input type="text" placeholder="Answer option..." value="${escapeHTML(text)}" />
        <div class="mcq-row-actions">
          <div class="tiny">Additional answer option</div>
          <button class="btn mcq-remove" type="button">Remove</button>
        </div>
      `;
  const toggle = wrap.querySelector('.mcq-toggle input[type="checkbox"]');
  const update = () => {
    const isCorrect = toggle.checked;
    wrap.classList.toggle('correct', isCorrect);
    wrap.classList.toggle('wrong', !isCorrect);
    const badge = wrap.querySelector('.mcq-badge');
    badge.className = `mcq-badge ${isCorrect ? 'correct' : 'wrong'}`;
    badge.textContent = isCorrect ? 'Correct Answer ✓' : 'Wrong Answer ✕';
  };
  toggle.addEventListener('change', update);
  const input = wrap.querySelector('input[type="text"]');
  if (input) {
    input.addEventListener('keydown', handleInlineFormatShortcut);
    input.addEventListener('keydown', handleTextAlignShortcut);
  }
  wrap.querySelector('.mcq-remove').onclick = () => {
    wrap.remove();
    syncMcqPrimaryAnswerMode(true);
  };
  update();
  const optionsWrap = el('editMcqOptions');
  if (!optionsWrap) return;
  if (insertAtTop && optionsWrap.firstChild) optionsWrap.insertBefore(wrap, optionsWrap.firstChild);
  else optionsWrap.appendChild(wrap);
  if (focusInput && input instanceof HTMLInputElement) {
    requestAnimationFrame(() => {
      input.focus();
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    });
  }
}

/**
 * @function openEditDialog
 * @description Opens the edit dialog.
 */

function openEditDialog(card) {
  editingCardId = card.id;
  editingCardSnapshot = cloneData(card);
  const questionAlign = card.questionTextAlign || card.textAlign || 'center';
  const answerAlign = card.answerTextAlign || card.textAlign || 'center';
  applyEditQuestionTextAlign(questionAlign);
  applyEditAnswerTextAlign(answerAlign);
  applyEditOptionsTextAlign(card.optionsTextAlign || 'center');
  el('editCardPrompt').value = card.prompt || '';
  el('editCardAnswer').value = card.answer || '';
  replaceFieldImages(
    el('editCardPrompt'),
    el('editQuestionImagePreview'),
    getCardImageList(card, 'Q'),
    'imageDataQ'
  );
  replaceFieldImages(
    el('editCardAnswer'),
    el('editAnswerImagePreview'),
    getCardImageList(card, 'A'),
    'imageDataA'
  );
  setPreview('editQuestionPreview', el('editCardPrompt').value || '', editQuestionTextAlign);
  setPreview('editAnswerPreview', el('editCardAnswer').value || '', editAnswerTextAlign);
  el('editMcqOptions').innerHTML = '';
  const opts = card.options || [];
  const hasMcq = card.type === 'mcq' && opts.length > 1;
  setMcqModeState(true, hasMcq);
  if (hasMcq) {
    const primaryText = (el('editCardAnswer').value || '').trim();
    let primaryIdx = opts.findIndex(opt => (opt.text || '').trim() === primaryText);
    if (primaryIdx === -1) primaryIdx = 0;
    const primaryOpt = opts[primaryIdx];
    const toggle = el('editPrimaryAnswerToggle');
    if (toggle && primaryOpt) toggle.checked = !!primaryOpt.correct;
    syncPrimaryMcqUi(true);
    opts.forEach((opt, i) => {
      if (i === primaryIdx) return;
      addEditMcqRow(opt.text, opt.correct, { insertAtTop: false, focusInput: false });
    });
  }
  syncMcqPrimaryAnswerMode(true);
  el('editCardDialog').showModal();
}

/**
 * @function deleteCardById
 * @description Deletes card by ID.
 */

async function deleteCardById(cardId, options = {}) {
  const { skipSubjectTouch = false, uiBlocking = true } = options;
  const card = await getById('cards', cardId);
  await del('cards', cardId, { uiBlocking });
  await del('progress', cardId, { uiBlocking });
  await del('cardbank', cardId, { uiBlocking });
  progressByCardId.delete(cardId);
  if (!skipSubjectTouch && card?.topicId) {
    await touchSubjectByTopicId(card.topicId);
  }
  if (session.active) {
    session.activeQueue = session.activeQueue.filter(c => c.id !== cardId);
    session.mastered = session.mastered.filter(c => c.id !== cardId);
    delete session.counts[cardId];
    delete session.gradeMap[cardId];
    renderSessionPills();
    renderSessionCard();
  }
}

// ============================================================================
