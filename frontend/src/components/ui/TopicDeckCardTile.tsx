import type { CSSProperties } from 'react';
import { RichTextContent } from './RichTextContent';
import { TileActionMenu } from './TileActionMenu';

interface CardOptionRecord {
  text?: string;
  correct?: boolean | string;
  order?: number | string;
}

export interface TopicDeckCardRecord {
  id: string;
  topicId: string;
  prompt?: string;
  answer?: string;
  type?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  meta?: {
    createdAt?: string | number;
    updatedAt?: string | number;
  };
  options?: CardOptionRecord[];
  optionsRequireOrder?: boolean;
  textAlign?: string;
  questionTextAlign?: string;
  answerTextAlign?: string;
  optionsTextAlign?: string;
}

type ProgressStateKey = 'mastered' | 'correct' | 'partial' | 'wrong' | 'notAnswered';

interface TopicDeckCardTileProps {
  idBase: string;
  card: TopicDeckCardRecord;
  progressState: ProgressStateKey;
  selectionMode: boolean;
  selected: boolean;
  className?: string;
  showMenu?: boolean;
  style?: CSSProperties;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleSelect?: (nextSelected: boolean) => void;
}

function toDomIdSuffix(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return 'unknown';
  return safe.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getProgressGlowClassName(progressState: ProgressStateKey): string {
  if (progressState === 'mastered') return 'card-progress-glow-mastered';
  if (progressState === 'correct') return 'card-progress-glow-correct';
  if (progressState === 'partial') return 'card-progress-glow-partial';
  if (progressState === 'wrong') return 'card-progress-glow-wrong';
  return '';
}

function getOrderedOptions(options: CardOptionRecord[], requireOrder: boolean): CardOptionRecord[] {
  if (!requireOrder) return options;
  return [...options].sort((left, right) => {
    const leftOrderRaw = Number(left?.order || 0);
    const rightOrderRaw = Number(right?.order || 0);
    const leftOrder = Number.isFinite(leftOrderRaw) && leftOrderRaw > 0 ? leftOrderRaw : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(rightOrderRaw) && rightOrderRaw > 0 ? rightOrderRaw : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function CardTextBlock({
  id,
  className,
  value,
  align
}: {
  id: string;
  className: string;
  value: string;
  align: unknown;
}) {
  return (
    <div id={id} className={className}>
      <RichTextContent
        className="card-tile-rich-text"
        content={String(value || '')}
        textAlign={String(align || 'center')}
      />
    </div>
  );
}

function CardAnswerBlock({ idBase, card }: { idBase: string; card: TopicDeckCardRecord }) {
  const isMcq = card.type === 'mcq' && Array.isArray(card.options) && card.options.length > 1;
  if (!isMcq) {
    return (
      <CardTextBlock
        id={`${idBase}AnswerBody`}
        className="card-tile-body"
        value={String(card.answer || '')}
        align={card.answerTextAlign || card.textAlign || 'center'}
      />
    );
  }

  const requireOrder = card.optionsRequireOrder === true;
  const options = getOrderedOptions(card.options || [], requireOrder);
  const optionsAlign = card.optionsTextAlign || card.answerTextAlign || card.textAlign || 'center';

  return (
    <div id={`${idBase}AnswerBody`} className="card-tile-body card-tile-mcq">
      <div id={`${idBase}McqOptions`} className="card-tile-mcq-options">
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
                'card-tile-mcq-option',
                requireOrder ? 'is-ordered' : '',
                !requireOrder && isCorrect ? 'is-correct' : ''
              ].filter(Boolean).join(' ')}
            >
              {requireOrder ? (
                <span id={`${idBase}McqOrder-${optionIdSuffix}`} className="card-tile-mcq-order-badge">
                  {order}
                </span>
              ) : null}
              <div
                id={`${idBase}McqText-${optionIdSuffix}`}
                className="card-tile-mcq-option-text"
              >
                <RichTextContent
                  className="card-tile-rich-text"
                  content={String(option?.text || '')}
                  textAlign={String(optionsAlign || 'center')}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TopicDeckCardTile({
  idBase,
  card,
  progressState,
  selectionMode,
  selected,
  className = '',
  showMenu = true,
  style,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleSelect
}: TopicDeckCardTileProps) {
  const glowClassName = getProgressGlowClassName(progressState);
  const tileClassName = [
    'card-tile',
    'card-tile-overview',
    className,
    glowClassName,
    selectionMode ? 'selection-mode' : '',
    selectionMode && selected ? 'selected-for-bulk' : ''
  ].filter(Boolean).join(' ');
  const checkboxId = `${idBase}SelectCheckbox`;

  return (
    <div
      id={`${idBase}Tile`}
      className={tileClassName}
      data-card-id={String(card.id || '').trim()}
      style={{ ...styles.root, ...(style || {}) }}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect?.(!selected);
        }
      }}
    >
      {selectionMode ? (
        <label
          id={`${idBase}SelectControl`}
          className="card-select-control"
          htmlFor={checkboxId}
          onClick={event => event.stopPropagation()}
        >
          <input
            id={checkboxId}
            type="checkbox"
            aria-label="Select card"
            checked={selected}
            onChange={event => onToggleSelect?.(event.target.checked)}
          />
        </label>
      ) : showMenu ? (
        <div id={`${idBase}Menu`} className="card-tile-menu">
          <TileActionMenu
            id={`${idBase}ActionMenu`}
            triggerId={`${idBase}EditBtn`}
            menuId={`${idBase}EditMenu`}
            triggerClassName="card-menu-btn"
            triggerAriaLabel="Open card menu"
            triggerTitle="Open card menu"
            items={[
              { id: 'edit', label: 'Edit', tone: 'green', onSelect: onEdit },
              { id: 'duplicate', label: 'Duplicate', tone: 'blue', onSelect: onDuplicate },
              { id: 'delete', label: 'Delete', tone: 'red', onSelect: onDelete }
            ]}
          />
        </div>
      ) : null}

      <div id={`${idBase}QuestionTitle`} className="card-tile-title">Q</div>
      <CardTextBlock
        id={`${idBase}QuestionBody`}
        className="card-tile-body"
        value={String(card.prompt || '')}
        align={card.questionTextAlign || card.textAlign || 'center'}
      />
      <div id={`${idBase}Separator`} className="card-tile-separator" />
      <div id={`${idBase}AnswerTitle`} className="card-tile-title">A</div>
      <CardAnswerBlock idBase={idBase} card={card} />
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box'
  }
});
