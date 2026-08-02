import {
  DeleteOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';
import { EditorTextToolbar, type EditorTextAlign } from './EditorTextToolbar';
import { RichTextContent } from './RichTextContent';
import { TableGeneratorDialog } from './TableGeneratorDialog';
import type { TopicDeckCardRecord } from './TopicDeckCardTile';

export interface TopicCardEditorPayload {
  prompt: string;
  answer: string;
  questionTextAlign: EditorTextAlign;
  answerTextAlign: EditorTextAlign;
  optionsTextAlign: EditorTextAlign;
  optionsRequireOrder: boolean;
  primaryAnswerCorrect: boolean;
  options: Array<{
    text: string;
    correct: boolean;
  }>;
}

interface TopicCardEditorPanelProps {
  topicName: string;
  cards: TopicDeckCardRecord[];
  panelMessage?: string;
  saving?: boolean;
  sidebarOpen: boolean;
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;
  onCloseSidebar: () => void;
  onOpenRecentQuestionImages: () => void;
  onOpenRecentAnswerImages: () => void;
  onSubmit: (payload: TopicCardEditorPayload) => Promise<boolean>;
}

interface EditorOptionDraft {
  id: string;
  text: string;
  correct: boolean;
}

type TableInsertionTarget = 'question' | 'answer';

const NARROW_EDITOR_BREAKPOINT = 980;
const EDITOR_INTRO_SHORTCUTS = Object.freeze([
  Object.freeze({
    keys: ['Shift', 'Enter'],
    description: 'Create a flashcard in the create editor or save changes in the edit dialog.'
  }),
  Object.freeze({
    keys: ['Ctrl', '+'],
    description: 'Add one additional MCQ answer option in create and edit fields.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'B'],
    description: 'Toggle bold markdown markers around the current selection.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'I'],
    description: 'Toggle italic markdown markers around the current selection.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'U'],
    description: 'Toggle underline markdown markers around the current selection.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'L'],
    description: 'Apply left alignment to the active editor field.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'C'],
    description: 'Apply center alignment when no text is selected (copy still works with selected text).'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'J'],
    description: 'Apply justify alignment to the active editor field.'
  }),
  Object.freeze({
    keys: ['Escape'],
    description: 'Close an open inline color picker menu.'
  }),
  Object.freeze({
    keys: ['Tab'],
    description: 'In the Question field: jump directly to the Answer field.'
  }),
  Object.freeze({
    keys: ['Tab', 'Shift', 'Tab'],
    description: 'In list lines: indent (Tab) or outdent (Shift+Tab).'
  }),
  Object.freeze({
    keys: ['Enter'],
    description: 'In list lines: continue numbering/bullets, or exit the list on empty item.'
  }),
  Object.freeze({
    keys: ['Enter'],
    description: 'In primary MCQ answer mode: Enter is blocked to keep the answer single-line.'
  }),
  Object.freeze({
    keys: ['Shift', 'Enter'],
    description: 'In the table dialog: insert or update the generated markdown table.'
  }),
  Object.freeze({
    keys: ['(', '[', '{', '$'],
    description: 'Wrap current selection with matching pairs in editor text fields.'
  })
]);

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function toDomIdSuffix(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return 'unknown';
  return safe.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getOrderedCardOptions(card: TopicDeckCardRecord) {
  const options = Array.isArray(card.options) ? card.options : [];
  if (card.optionsRequireOrder !== true) return options;
  return [...options].sort((left, right) => {
    const leftOrder = Number(left?.order || 0);
    const rightOrder = Number(right?.order || 0);
    const safeLeft = Number.isFinite(leftOrder) && leftOrder > 0 ? leftOrder : Number.MAX_SAFE_INTEGER;
    const safeRight = Number.isFinite(rightOrder) && rightOrder > 0 ? rightOrder : Number.MAX_SAFE_INTEGER;
    return safeLeft - safeRight;
  });
}

function applyTextInsertion(
  textarea: HTMLTextAreaElement | null,
  transform: (selectedText: string) => { nextValue: string; selectionStart: number; selectionEnd: number }
): void {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.slice(start, end);
  const result = transform(selectedText);
  const nextValue = textarea.value.slice(0, start) + result.nextValue + textarea.value.slice(end);
  textarea.value = nextValue;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + result.selectionStart, start + result.selectionEnd);
  });
}

function applyTextareaReplacement(
  textarea: HTMLTextAreaElement,
  nextValue: string,
  selectionStart: number,
  selectionEnd = selectionStart
): void {
  textarea.value = nextValue;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
  });
}

function toggleMarkdownMarkers(
  textarea: HTMLTextAreaElement,
  markerBefore: string,
  markerAfter = markerBefore
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  if (start === end) {
    const nextValue = `${value.slice(0, start)}${markerBefore}${markerAfter}${value.slice(end)}`;
    const caret = start + markerBefore.length;
    applyTextareaReplacement(textarea, nextValue, caret, caret);
    return;
  }

  const selectedText = value.slice(start, end);
  const hasMarkers = value.slice(start - markerBefore.length, start) === markerBefore
    && value.slice(end, end + markerAfter.length) === markerAfter;
  if (hasMarkers) {
    const nextValue = `${value.slice(0, start - markerBefore.length)}${selectedText}${value.slice(end + markerAfter.length)}`;
    const nextStart = start - markerBefore.length;
    applyTextareaReplacement(textarea, nextValue, nextStart, nextStart + selectedText.length);
    return;
  }

  const nextValue = `${value.slice(0, start)}${markerBefore}${selectedText}${markerAfter}${value.slice(end)}`;
  applyTextareaReplacement(
    textarea,
    nextValue,
    start + markerBefore.length,
    end + markerBefore.length
  );
}

function wrapSelectionWithPair(textarea: HTMLTextAreaElement, open: string, close: string): boolean {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) return false;
  const value = textarea.value;
  const selectedText = value.slice(start, end);
  const nextValue = `${value.slice(0, start)}${open}${selectedText}${close}${value.slice(end)}`;
  applyTextareaReplacement(textarea, nextValue, start + open.length, end + open.length);
  return true;
}

function buildListInsertion(selectedText: string, kind: 'ul' | 'ol'): { nextValue: string; selectionStart: number; selectionEnd: number } {
  const source = selectedText || 'List item';
  const lines = source.split('\n');
  const mapped = lines.map((line, index) => {
    const prefix = kind === 'ul' ? '- ' : `${index + 1}. `;
    return `${prefix}${line.trim() || 'List item'}`;
  });
  const nextValue = mapped.join('\n');
  return {
    nextValue,
    selectionStart: 0,
    selectionEnd: nextValue.length
  };
}

function getCurrentLineInfo(textarea: HTMLTextAreaElement): {
  value: string;
  lineStart: number;
  lineEnd: number;
  line: string;
} {
  const value = textarea.value;
  const cursor = textarea.selectionStart;
  const lineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const lineBreak = value.indexOf('\n', cursor);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  return {
    value,
    lineStart,
    lineEnd,
    line: value.slice(lineStart, lineEnd)
  };
}

function getListLineMeta(line: string): {
  indent: string;
  marker: string;
  text: string;
  nextMarker: string;
} | null {
  const unordered = line.match(/^(\s*)([-*•])\s(.*)$/);
  if (unordered) {
    return {
      indent: unordered[1] || '',
      marker: `${unordered[2]} `,
      text: unordered[3] || '',
      nextMarker: `${unordered[2]} `
    };
  }
  const ordered = line.match(/^(\s*)(\d+)\.\s(.*)$/);
  if (ordered) {
    const number = Number(ordered[2]);
    return {
      indent: ordered[1] || '',
      marker: `${ordered[2]}. `,
      text: ordered[3] || '',
      nextMarker: `${Number.isFinite(number) ? number + 1 : 1}. `
    };
  }
  return null;
}

function continueOrExitListLine(textarea: HTMLTextAreaElement): boolean {
  if (textarea.selectionStart !== textarea.selectionEnd) return false;
  const { value, lineStart, lineEnd, line } = getCurrentLineInfo(textarea);
  const meta = getListLineMeta(line);
  if (!meta) return false;
  if (!meta.text.trim()) {
    const nextValue = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
    applyTextareaReplacement(textarea, nextValue, lineStart, lineStart);
    return true;
  }
  const insertion = `\n${meta.indent}${meta.nextMarker}`;
  const cursor = textarea.selectionStart;
  const nextValue = `${value.slice(0, cursor)}${insertion}${value.slice(cursor)}`;
  const nextCursor = cursor + insertion.length;
  applyTextareaReplacement(textarea, nextValue, nextCursor, nextCursor);
  return true;
}

function indentCurrentListLine(textarea: HTMLTextAreaElement, outdent: boolean): boolean {
  const { value, lineStart, lineEnd, line } = getCurrentLineInfo(textarea);
  const meta = getListLineMeta(line);
  if (!meta) return false;
  const nextLine = outdent
    ? line.replace(/^ {1,2}/, '')
    : `  ${line}`;
  const nextValue = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`;
  const cursorDelta = nextLine.length - line.length;
  const nextCursor = Math.max(lineStart, textarea.selectionStart + cursorDelta);
  applyTextareaReplacement(textarea, nextValue, nextCursor, nextCursor);
  return true;
}

function buildTableInsertion(markdown: string): { nextValue: string; selectionStart: number; selectionEnd: number } {
  const nextValue = `\n${String(markdown || '').trim()}\n`;
  return {
    nextValue,
    selectionStart: 0,
    selectionEnd: nextValue.length
  };
}

export function TopicCardEditorPanel({
  topicName,
  cards,
  panelMessage = '',
  saving = false,
  sidebarOpen,
  shortcutsOpen,
  onCloseShortcuts,
  onCloseSidebar,
  onOpenRecentQuestionImages,
  onOpenRecentAnswerImages,
  onSubmit
}: TopicCardEditorPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [questionTextAlign, setQuestionTextAlign] = useState<EditorTextAlign>('left');
  const [answerTextAlign, setAnswerTextAlign] = useState<EditorTextAlign>('center');
  const [optionsTextAlign, setOptionsTextAlign] = useState<EditorTextAlign>('center');
  const [optionsRequireOrder, setOptionsRequireOrder] = useState(false);
  const [primaryAnswerCorrect, setPrimaryAnswerCorrect] = useState(true);
  const [options, setOptions] = useState<EditorOptionDraft[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [tableInsertionTarget, setTableInsertionTarget] = useState<TableInsertionTarget | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.innerWidth <= NARROW_EDITOR_BREAKPOINT);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleResize = () => setIsNarrowViewport(window.innerWidth <= NARROW_EDITOR_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const questionError = showValidation && !String(prompt || '').trim();
  const answerError = showValidation && !String(answer || '').trim();
  const hasMcqOptions = options.length > 0;
  const cardCountText = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;

  const editorGridStyle = useMemo<CSSProperties>(() => {
    if (isNarrowViewport) {
      return {
        ...styles.grid,
        gridTemplateColumns: 'minmax(0, 1fr)'
      };
    }
    return {
      ...styles.grid,
      gridTemplateColumns: sidebarOpen
        ? 'minmax(230px, 360px) 1px minmax(0, 1fr)'
        : '0px 0px minmax(0, 1fr)'
    };
  }, [isNarrowViewport, sidebarOpen]);

  const sidebarStyle = useMemo<CSSProperties>(() => {
    if (isNarrowViewport) {
      return {
        ...styles.sidebar,
        ...styles.sidebarNarrow,
        transform: sidebarOpen ? 'translateX(0%)' : 'translateX(-108%)',
        opacity: sidebarOpen ? 1 : 0,
        pointerEvents: sidebarOpen ? 'auto' : 'none'
      };
    }
    return {
      ...styles.sidebar,
      transform: sidebarOpen ? 'translateX(0%)' : 'translateX(-12px)',
      opacity: sidebarOpen ? 1 : 0,
      pointerEvents: sidebarOpen ? 'auto' : 'none'
    };
  }, [isNarrowViewport, sidebarOpen]);

  const separatorStyle = useMemo<CSSProperties>(() => ({
    ...styles.separator,
    opacity: !isNarrowViewport && sidebarOpen ? 1 : 0
  }), [isNarrowViewport, sidebarOpen]);

  const overlayStyle = useMemo<CSSProperties>(() => ({
    ...styles.overlay,
    opacity: isNarrowViewport && sidebarOpen ? 1 : 0,
    pointerEvents: isNarrowViewport && sidebarOpen ? 'auto' : 'none'
  }), [isNarrowViewport, sidebarOpen]);

  const resetForm = () => {
    setPrompt('');
    setAnswer('');
    setQuestionTextAlign('left');
    setAnswerTextAlign('center');
    setOptionsTextAlign('center');
    setOptionsRequireOrder(false);
    setPrimaryAnswerCorrect(true);
    setOptions([]);
    setShowValidation(false);
  };

  const handleAddOption = () => {
    setOptions(previous => [...previous, { id: createLocalId(), text: '', correct: false }]);
  };

  const applyAlignmentForTextarea = (textarea: HTMLTextAreaElement, align: EditorTextAlign) => {
    if (textarea.id === 'cardPrompt') {
      setQuestionTextAlign(align);
      return;
    }
    if (textarea.id === 'cardAnswer') {
      setAnswerTextAlign(align);
      return;
    }
    setOptionsTextAlign(align);
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const usesModifier = event.metaKey || event.ctrlKey;
    const isCreateShortcut = event.key === 'Enter' && event.shiftKey;
    if (isCreateShortcut) {
      event.preventDefault();
      void handleSubmit();
      return;
    }

    if (usesModifier && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        toggleMarkdownMarkers(textarea, '**');
        return;
      }
      if (key === 'i') {
        event.preventDefault();
        toggleMarkdownMarkers(textarea, '*');
        return;
      }
      if (key === 'u') {
        event.preventDefault();
        toggleMarkdownMarkers(textarea, '__');
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        applyAlignmentForTextarea(textarea, 'left');
        return;
      }
      if (key === 'j') {
        event.preventDefault();
        applyAlignmentForTextarea(textarea, 'justify');
        return;
      }
      if (key === 'c' && textarea.selectionStart === textarea.selectionEnd) {
        event.preventDefault();
        applyAlignmentForTextarea(textarea, 'center');
        return;
      }
    }

    const isAddAnswerShortcut = (event.ctrlKey || event.metaKey)
      && !event.altKey
      && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd');
    if (isAddAnswerShortcut) {
      event.preventDefault();
      handleAddOption();
      return;
    }

    if (event.key === 'Tab') {
      if (indentCurrentListLine(textarea, event.shiftKey)) {
        event.preventDefault();
        return;
      }
      if (textarea.id === 'cardPrompt' && !event.shiftKey) {
        event.preventDefault();
        answerRef.current?.focus();
      }
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      if (textarea.id === 'cardAnswer' && hasMcqOptions) {
        event.preventDefault();
        return;
      }
      if (continueOrExitListLine(textarea)) {
        event.preventDefault();
        return;
      }
    }

    const pairMap: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '$': '$'
    };
    if (!event.metaKey && !event.ctrlKey && pairMap[event.key]) {
      const wrapped = wrapSelectionWithPair(textarea, event.key, pairMap[event.key]);
      if (wrapped) event.preventDefault();
    }
  };

  const handleSubmit = async () => {
    const safePrompt = String(prompt || '').trim();
    const safeAnswer = String(answer || '').trim();
    if (!safePrompt || !safeAnswer) {
      setShowValidation(true);
      return;
    }
    const safeOptions = options
      .map(option => ({
        id: option.id,
        text: String(option.text || '').trim(),
        correct: optionsRequireOrder ? true : option.correct
      }))
      .filter(option => option.text);
    const success = await onSubmit({
      prompt: safePrompt,
      answer: safeAnswer,
      questionTextAlign,
      answerTextAlign,
      optionsTextAlign,
      optionsRequireOrder,
      primaryAnswerCorrect: optionsRequireOrder ? true : primaryAnswerCorrect,
      options: safeOptions
    });
    if (!success) return;
    resetForm();
    promptRef.current?.focus();
  };

  const handleInsertGeneratedTable = (markdown: string) => {
    const targetRef = tableInsertionTarget === 'answer' ? answerRef.current : promptRef.current;
    applyTextInsertion(targetRef, () => buildTableInsertion(markdown));
    setTableInsertionTarget(null);
  };

  return (
    <section id="editorPanel" style={styles.root}>
      {panelMessage ? <div id="editorPanelMessage" className="tiny" style={styles.panelMessage}>{panelMessage}</div> : null}
      <EditorQuickIntroDialog open={shortcutsOpen} onClose={onCloseShortcuts} />
      <div id="editorOverlay" style={overlayStyle} onClick={onCloseSidebar} />
      <div id="editorGrid" style={editorGridStyle}>
        <aside id="editorSidebar" style={sidebarStyle}>
          <div id="editorListHeader" style={styles.sidebarHeader}>
            <div id="editorListHeading" className="tiny">Existing cards</div>
            <div id="deckTopicCardCountEditor" className="tiny">{cardCountText}</div>
          </div>
          <div id="editorCardsList" style={styles.cardList}>
            {cards.length ? cards.map(card => {
              const cardId = String(card.id || '').trim() || createLocalId();
              return (
                <EditorSidebarCardTile
                  key={cardId}
                  idBase={`editorCardListItem-${cardId}`}
                  card={card}
                />
              );
            }) : (
              <div id="editorCardsListEmpty" className="tiny" style={styles.emptyText}>
                No cards in {topicName} yet.
              </div>
            )}
          </div>
        </aside>

        <div id="editorSeparator" style={separatorStyle} aria-hidden="true" />

        <div id="editorMain" style={styles.main}>
          <div id="editorMainScroll" style={styles.mainScroll}>
            <div id="editorQuestionField" style={styles.field}>
              <div id="editorQuestionFieldHead" style={styles.fieldHead}>
                <label id="editorQuestionLabel" htmlFor="cardPrompt" style={styles.fieldLabel}>Question</label>
                <AppButton
                  id="openRecentCreateQuestionImagesBtn"
                  className="btn btn-small image-recent-btn"
                  style={styles.smallButton}
                  onClick={onOpenRecentQuestionImages}
                >
                  Recent Images
                </AppButton>
              </div>
              <div id="editorQuestionInputRow" style={styles.inputMediaRow}>
                <textarea
                  id="cardPrompt"
                  ref={promptRef}
                  value={prompt}
                  placeholder="Type your question..."
                  style={{ ...styles.textarea, textAlign: questionTextAlign }}
                  onChange={event => setPrompt(event.target.value)}
                  onKeyDown={handleEditorKeyDown}
                />
                <div id="questionImagePreview" style={styles.imagePreview}>Drop image here</div>
              </div>
              <EditorTextToolbar
                idBase="createQuestionToolbar"
                align={questionTextAlign}
                onAlignChange={setQuestionTextAlign}
                onInsertList={kind => applyTextInsertion(promptRef.current, selectedText => buildListInsertion(selectedText, kind))}
                onInsertTable={() => setTableInsertionTarget('question')}
              />
              {questionError ? <div id="questionError" style={styles.errorText}>Please fill in the question.</div> : null}
            </div>

            <div id="editorDivider" style={styles.divider} />

            <div id="editorAnswerField" style={styles.field}>
              {hasMcqOptions ? (
                <div id="primaryAnswerHeader" style={styles.primaryAnswerHeader}>
                  <span id="primaryAnswerBadge" style={styles.primaryBadge}>Primary Answer</span>
                  <label id="primaryAnswerToggleWrap" style={styles.toggleLabel}>
                    <input
                      id="primaryAnswerToggle"
                      type="checkbox"
                      checked={optionsRequireOrder ? true : primaryAnswerCorrect}
                      disabled={optionsRequireOrder}
                      onChange={event => setPrimaryAnswerCorrect(event.target.checked)}
                    />
                    <span>Correct</span>
                  </label>
                </div>
              ) : null}
              <div id="editorAnswerFieldHead" style={styles.fieldHead}>
                <label id="editorAnswerLabel" htmlFor="cardAnswer" style={styles.fieldLabel}>Answer</label>
                <AppButton
                  id="openRecentCreateAnswerImagesBtn"
                  className="btn btn-small image-recent-btn"
                  style={styles.smallButton}
                  onClick={onOpenRecentAnswerImages}
                >
                  Recent Images
                </AppButton>
              </div>
              <div id="editorAnswerInputRow" style={styles.inputMediaRow}>
                <textarea
                  id="cardAnswer"
                  ref={answerRef}
                  value={answer}
                  placeholder="Type the answer..."
                  style={{ ...styles.textarea, textAlign: answerTextAlign }}
                  onChange={event => setAnswer(event.target.value)}
                  onKeyDown={handleEditorKeyDown}
                />
                <div id="answerImagePreview" style={styles.imagePreview}>Drop image here</div>
              </div>
              <EditorTextToolbar
                idBase="createAnswerToolbar"
                align={answerTextAlign}
                onAlignChange={setAnswerTextAlign}
                onInsertList={kind => applyTextInsertion(answerRef.current, selectedText => buildListInsertion(selectedText, kind))}
                onInsertTable={() => setTableInsertionTarget('answer')}
              />

              {hasMcqOptions ? (
                <div id="mcqOptionsContainer" style={styles.optionsWrap}>
                  <div id="mcqOptionsMeta" className="tiny">Multi-select answers</div>
                  <EditorTextToolbar
                    idBase="createOptionsToolbar"
                    align={optionsTextAlign}
                    onAlignChange={setOptionsTextAlign}
                    onInsertList={() => undefined}
                    onInsertTable={() => undefined}
                    extraContent={(
                      <label id="mcqRequireOrderToggleWrap" style={styles.toggleLabel}>
                        <input
                          id="mcqRequireOrderToggle"
                          type="checkbox"
                          checked={optionsRequireOrder}
                          onChange={event => setOptionsRequireOrder(event.target.checked)}
                        />
                        <span>Require ordered answers</span>
                      </label>
                    )}
                  />
                  <div id="mcqOptions" style={styles.optionList}>
                    {options.map((option, index) => (
                      <div key={option.id} id={`mcqOptionRow-${option.id}`} style={styles.optionRow}>
                        <div id={`mcqOptionMeta-${option.id}`} style={styles.optionMeta}>
                          <span id={`mcqOptionLabel-${option.id}`} style={styles.optionLabel}>
                            {optionsRequireOrder ? `Step ${index + 2}` : `Answer ${index + 2}`}
                          </span>
                          <label id={`mcqOptionToggleWrap-${option.id}`} style={styles.toggleLabel}>
                            <input
                              id={`mcqOptionToggle-${option.id}`}
                              type="checkbox"
                              checked={optionsRequireOrder ? true : option.correct}
                              disabled={optionsRequireOrder}
                              onChange={event => {
                                setOptions(previous => previous.map(entry => (
                                  entry.id === option.id
                                    ? { ...entry, correct: event.target.checked }
                                    : entry
                                )));
                              }}
                            />
                            <span>Correct</span>
                          </label>
                        </div>
                        <div id={`mcqOptionInputWrap-${option.id}`} style={styles.optionInputWrap}>
                          <textarea
                            id={`mcqOptionInput-${option.id}`}
                            value={option.text}
                            placeholder="Type another answer..."
                            style={{ ...styles.optionTextarea, textAlign: optionsTextAlign }}
                            onChange={event => {
                              const nextValue = event.target.value;
                              setOptions(previous => previous.map(entry => (
                                entry.id === option.id
                                  ? { ...entry, text: nextValue }
                                  : entry
                              )));
                            }}
                            onKeyDown={handleEditorKeyDown}
                          />
                          <AppButton
                            id={`mcqOptionDelete-${option.id}`}
                            className="btn"
                            rect
                            icon={<DeleteOutlined />}
                            ariaLabel="Delete answer"
                            title="Delete answer"
                            style={styles.deleteOptionButton}
                            onClick={() => {
                              setOptions(previous => previous.filter(entry => entry.id !== option.id));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {answerError ? <div id="answerError" style={styles.errorText}>Please enter at least one answer.</div> : null}
            </div>
          </div>

          <TableGeneratorDialog
            open={tableInsertionTarget !== null}
            onClose={() => setTableInsertionTarget(null)}
            onInsert={handleInsertGeneratedTable}
          />

          <div id="editorFooter" style={styles.footer}>
            <AppButton
              id="addMcqOptionBtn"
              className="btn"
              style={styles.footerButton}
              onClick={handleAddOption}
            >
              Add Answer
            </AppButton>
            <AppButton
              id="addCardBtn"
              className="btn"
              icon={<FileTextOutlined />}
              disabled={saving}
              style={styles.primaryFooterButton}
              onClick={() => void handleSubmit()}
            >
              {saving ? 'Creating…' : 'Create Flashcard'}
            </AppButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function EditorQuickIntroDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AppDialog
      id="editorQuickIntroDialog"
      open={open}
      title="Editor Quick Intro"
      onClose={onClose}
      backdropStyle={{
        background: 'rgba(8, 14, 28, 0.55)',
        backdropFilter: 'blur(8px)'
      }}
      dialogStyle={{
        width: 'min(92vw, 1120px)',
        maxHeight: '88dvh',
        padding: 'var(--s24)',
        gap: 'var(--s16)'
      }}
      contentStyle={{ minHeight: 0 }}
    >
      <div className="editor-quick-intro">
        <p className="editor-quick-intro-lede">
          This panel is optimized for quick card creation. Here are the available keyboard shortcuts and key-driven behaviors.
        </p>
        <div className="editor-quick-intro-list">
          {EDITOR_INTRO_SHORTCUTS.map((shortcut, index) => (
            <div key={`${shortcut.keys.join('-')}-${index}`} className="editor-quick-intro-row">
              <div className="editor-quick-intro-keys" aria-label={shortcut.keys.join(' plus ')}>
                {shortcut.keys.map(key => (
                  <kbd key={`${index}-${key}`}>{key}</kbd>
                ))}
              </div>
              <div className="editor-quick-intro-description">{shortcut.description}</div>
            </div>
          ))}
        </div>
        <AppButton className="btn editor-quick-intro-start-btn" onClick={onClose}>
          Start Editing
        </AppButton>
      </div>
    </AppDialog>
  );
}

function EditorSidebarCardTile({
  idBase,
  card
}: {
  idBase: string;
  card: TopicDeckCardRecord;
}) {
  const isMcq = card.type === 'mcq' && Array.isArray(card.options) && card.options.length > 1;
  const options = getOrderedCardOptions(card);
  const answerAlign = card.answerTextAlign || card.textAlign || 'center';
  const optionsAlign = card.optionsTextAlign || answerAlign;

  return (
    <article
      id={`${idBase}Tile`}
      className="editor-sidebar-full-card"
      data-card-id={String(card.id || '').trim()}
    >
      <div id={`${idBase}QuestionTitle`} className="editor-sidebar-full-card-title">Q</div>
      <div id={`${idBase}QuestionBody`} className="editor-sidebar-full-card-body">
        <RichTextContent
          className="editor-sidebar-full-card-rich"
          content={String(card.prompt || '')}
          textAlign={String(card.questionTextAlign || card.textAlign || 'center')}
        />
      </div>
      <div id={`${idBase}Separator`} className="editor-sidebar-full-card-separator" />
      <div id={`${idBase}AnswerTitle`} className="editor-sidebar-full-card-title">A</div>
      <div id={`${idBase}AnswerBody`} className="editor-sidebar-full-card-body">
        {isMcq ? (
          <div id={`${idBase}McqOptions`} className="editor-sidebar-full-card-options">
            {options.map((option, index) => {
              const optionIdSuffix = toDomIdSuffix(`${idBase}-${index + 1}`);
              const isCorrect = option?.correct === true || String(option?.correct || '').trim().toLowerCase() === 'true';
              const orderRaw = Number(option?.order || 0);
              const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.round(orderRaw) : index + 1;
              return (
                <div
                  key={`${optionIdSuffix}-${String(option.text || '')}`}
                  id={`${idBase}McqOption-${optionIdSuffix}`}
                  className={[
                    'editor-sidebar-full-card-option',
                    card.optionsRequireOrder === true ? 'is-ordered' : '',
                    card.optionsRequireOrder !== true && isCorrect ? 'is-correct' : ''
                  ].filter(Boolean).join(' ')}
                >
                  {card.optionsRequireOrder === true ? (
                    <span id={`${idBase}McqOrder-${optionIdSuffix}`} className="editor-sidebar-full-card-option-badge">
                      {order}
                    </span>
                  ) : null}
                  <RichTextContent
                    className="editor-sidebar-full-card-rich"
                    content={String(option?.text || '')}
                    textAlign={String(optionsAlign || 'center')}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <RichTextContent
            className="editor-sidebar-full-card-rich"
            content={String(card.answer || '')}
            textAlign={String(answerAlign || 'center')}
          />
        )}
      </div>
    </article>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 0,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)',
    overflow: 'hidden'
  },
  panelMessage: {
    border: '1px solid rgba(59, 84, 126, 0.8)',
    background: 'rgba(18, 28, 48, 0.86)',
    borderRadius: 'var(--s10)',
    padding: 'var(--s8) var(--s12)',
    color: '#bfd7ff'
  },
  shortcutsPanel: {
    border: '1px solid rgba(59, 84, 126, 0.76)',
    background: 'rgba(18, 28, 48, 0.86)',
    borderRadius: '16px',
    padding: 'var(--s12)',
    display: 'grid',
    gap: 'var(--s10)'
  },
  shortcutsTitle: {
    fontSize: '1rem',
    fontWeight: 700
  },
  shortcutsBody: {
    display: 'grid',
    gap: 'var(--s8)'
  },
  shortcutItem: {
    display: 'flex',
    gap: 'var(--s10)',
    alignItems: 'center',
    color: '#d8e6ff'
  },
  shortcutKey: {
    minWidth: '120px',
    color: 'var(--subject-accent, #2dd4bf)'
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(4, 8, 18, 0.56)',
    transition: 'opacity 220ms ease',
    zIndex: 3,
    borderRadius: '18px'
  },
  grid: {
    position: 'relative',
    width: '100%',
    display: 'grid',
    gap: 'var(--s12)',
    minHeight: 0,
    flex: '1 1 0',
    alignItems: 'stretch',
    overflow: 'hidden'
  },
  sidebar: {
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s10)',
    border: '1px solid rgba(59, 84, 126, 0.76)',
    background: 'rgba(12, 20, 36, 0.9)',
    borderRadius: '18px',
    padding: 'var(--s12)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease'
  },
  sidebarNarrow: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width: 'min(82vw, 320px)',
    zIndex: 4
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--s8)',
    paddingBottom: 'var(--s12)',
  },
  cardList: {
    display: 'grid',
    gap: 'var(--s12)',
    minHeight: 0,
    flex: 1,
    overflowY: 'auto',
    alignContent: 'start'
  },
  emptyText: {
    padding: 'var(--s8)'
  },
  separator: {
    width: '1px',
    background: 'linear-gradient(180deg, rgba(76, 101, 145, 0) 0%, rgba(76, 101, 145, 0.9) 18%, rgba(76, 101, 145, 0.9) 82%, rgba(76, 101, 145, 0) 100%)',
    transition: 'opacity 180ms ease'
  },
  main: {
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    border: '1px solid rgba(59, 84, 126, 0.76)',
    background: 'rgba(14, 22, 40, 0.92)',
    borderRadius: '18px',
    overflow: 'hidden'
  },
  mainScroll: {
    minHeight: 0,
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s16)',
    padding: 'var(--s16)'
  },
  field: {
    display: 'flex',
    gap: 'var(--s12)',
    flexDirection: 'column',
    flex: '1 1 0',
    minHeight: 0,
    overflow: 'auto'
  },
  fieldHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--s8)',
    flexWrap: 'wrap'
  },
  fieldLabel: {
    fontWeight: 700
  },
  smallButton: {
    minHeight: '36px',
    borderRadius: '12px',
    fontWeight: 400,
    fontSize: '0.84rem',
    background: 'rgba(31, 45, 73, 0.88)'
  },
  inputMediaRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 220px)',
    gridTemplateRows: 'minmax(0, 1fr)',
    alignItems: 'stretch',
    gap: 'var(--s12)',
    flex: '1 1 0',
    minHeight: '180px',
    maxHeight: '300px',
  },
  textarea: {
    minHeight: 0,
    resize: 'vertical',
    borderRadius: '16px',
    border: '1px solid #30476f',
    background: '#15213a',
    color: '#edf2ff',
    padding: 'var(--s12)',
    font: 'inherit',
    lineHeight: 1.5,
    boxSizing: 'border-box'
  },
  imagePreview: {
    minHeight: 0,
    borderRadius: '16px',
    border: '1px dashed rgba(86, 111, 156, 0.8)',
    background: 'rgba(12, 18, 34, 0.52)',
    color: '#9db2d9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--s12)',
    textAlign: 'center'
  },
  divider: {
    height: '1px',
    flex: '0 0 auto',
    background: 'rgba(48, 69, 111, 0.95)'
  },
  primaryAnswerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--s10)',
    flexWrap: 'wrap'
  },
  primaryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '32px',
    padding: '0 12px',
    borderRadius: '999px',
    background: 'rgba(34, 197, 94, 0.22)',
    color: '#a7f3d0',
    fontWeight: 600
  },
  toggleLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--s8)',
    color: '#d6e4ff',
    fontSize: '0.9rem'
  },
  optionsWrap: {
    display: 'grid',
    gap: 'var(--s10)',
    padding: 'var(--s12)',
    border: '1px solid rgba(59, 84, 126, 0.68)',
    borderRadius: '16px',
    background: 'rgba(11, 18, 32, 0.48)'
  },
  optionList: {
    display: 'grid',
    gap: 'var(--s10)'
  },
  optionRow: {
    display: 'grid',
    gap: 'var(--s8)',
    padding: 'var(--s10)',
    borderRadius: '14px',
    border: '1px solid rgba(59, 84, 126, 0.64)',
    background: 'rgba(18, 28, 48, 0.86)'
  },
  optionMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--s10)',
    flexWrap: 'wrap'
  },
  optionLabel: {
    fontWeight: 600,
    color: '#edf2ff'
  },
  optionInputWrap: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 'var(--s10)',
    alignItems: 'start'
  },
  optionTextarea: {
    minHeight: '88px',
    resize: 'vertical',
    borderRadius: '14px',
    border: '1px solid #30476f',
    background: '#15213a',
    color: '#edf2ff',
    padding: 'var(--s10)',
    font: 'inherit',
    lineHeight: 1.45,
    boxSizing: 'border-box'
  },
  deleteOptionButton: {
    width: '40px',
    minWidth: '40px',
    height: '40px',
    minHeight: '40px',
    borderRadius: '12px',
    background: '#8b1e1e',
    color: '#ffe8e8'
  },
  errorText: {
    color: '#fecaca',
    fontSize: '0.84rem'
  },
  footer: {
    position: 'sticky',
    bottom: 0,
    zIndex: 2,
    padding: 'var(--s12)',
    display: 'flex',
    gap: 'var(--s12)',
    background: 'rgba(14, 22, 40, 0.28)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    flexDirection: 'column',
  },
  footerButton: {
    minHeight: '44px',
    borderRadius: '14px',
    fontWeight: 400
  },
  primaryFooterButton: {
    minHeight: '44px',
    borderRadius: '14px',
    background: 'var(--subject-accent, #2dd4bf)',
    color: '#08131d',
    fontWeight: 600
  }
});
