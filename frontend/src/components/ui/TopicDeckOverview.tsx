import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { TopicDeckCardTile, type TopicDeckCardRecord } from './TopicDeckCardTile';
import type { ProgressRecord } from '../../lib/api';

type ProgressStateKey = 'mastered' | 'correct' | 'partial' | 'wrong' | 'notAnswered';
const DECK_BULK_ACTIONS_ANIMATION_MS = 220;

interface TopicDeckOverviewProps {
  topicId: string;
  panelMessage?: string;
  cards: TopicDeckCardRecord[];
  progressByCardId: Record<string, ProgressRecord>;
  loading: boolean;
  error: string;
  selectionMode: boolean;
  selectedCardIds: Set<string>;
  onToggleCardSelection: (cardId: string, nextSelected: boolean) => void;
  onDeleteCard: (cardId: string) => void;
  onDuplicateCard: (cardId: string) => void;
  onMoveSelectedCards: () => void;
  onDeleteSelectedCards: () => void;
  onCancelSelection: () => void;
  onEditCard: (cardId: string) => void;
  getProgressStateKey: (record: ProgressRecord | null) => ProgressStateKey;
}

function toDomIdSuffix(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return 'unknown';
  return safe.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function TopicDeckOverview({
  topicId,
  panelMessage = '',
  cards,
  progressByCardId,
  loading,
  error,
  selectionMode,
  selectedCardIds,
  onToggleCardSelection,
  onDeleteCard,
  onDuplicateCard,
  onMoveSelectedCards,
  onDeleteSelectedCards,
  onCancelSelection,
  onEditCard,
  getProgressStateKey
}: TopicDeckOverviewProps) {
  const bulkActionsRef = useRef<HTMLDivElement | null>(null);
  const [bulkActionsMounted, setBulkActionsMounted] = useState(selectionMode);
  const [bulkActionsVisible, setBulkActionsVisible] = useState(selectionMode);
  const [bulkActionsHeight, setBulkActionsHeight] = useState(0);
  const topicIdSuffix = toDomIdSuffix(topicId);
  const selectedCount = selectedCardIds.size;
  const selectedCountWord = selectedCount === 1 ? 'selected' : 'selected';

  useLayoutEffect(() => {
    if (!bulkActionsMounted || !bulkActionsRef.current) return;
    setBulkActionsHeight(bulkActionsRef.current.scrollHeight);
  }, [bulkActionsMounted, bulkActionsVisible, selectedCount]);

  useEffect(() => {
    if (selectionMode) {
      setBulkActionsMounted(true);
      const frame = window.requestAnimationFrame(() => {
        setBulkActionsVisible(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setBulkActionsVisible(false);
    const timeout = window.setTimeout(() => {
      setBulkActionsMounted(false);
    }, DECK_BULK_ACTIONS_ANIMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [selectionMode]);

  const bulkActionsShellStyle: CSSProperties = {
    ...styles.bulkActionsShell,
    height: bulkActionsMounted && bulkActionsVisible ? `${bulkActionsHeight}px` : '0px',
    margin: bulkActionsMounted ? '0 0 var(--space-3)' : '0',
  };

  const bulkActionsStyle: CSSProperties = {
    ...styles.bulkActions,
    transform: bulkActionsVisible ? 'scaleY(1)' : 'scaleY(0.88)',
    opacity: bulkActionsVisible ? 1 : 0,
    pointerEvents: bulkActionsVisible ? 'auto' : 'none',
  };

  return (
    <section id={`deckPanel-${topicIdSuffix}`} style={styles.root}>
      <div style={styles.section} id="cardsOverviewSection">
        <div
          id="deckBulkActionsShell"
          style={bulkActionsShellStyle}
          aria-hidden={!bulkActionsVisible}
        >
          <div
            ref={bulkActionsRef}
            id="deckBulkActions"
            style={bulkActionsStyle}
          >
            <div className="tiny" id="deckSelectionCount" style={styles.bulkCount}>{`${selectedCount} ${selectedCountWord}`}</div>
            <button
              id="moveSelectedCardsBtn"
              className="btn"
              style={styles.bulkButton}
              disabled={selectedCount <= 0}
              type="button"
              onClick={onMoveSelectedCards}
            >
              Move
            </button>
            <button
              id="deleteSelectedCardsBtn"
              className="btn red"
              style={styles.bulkButton}
              disabled={selectedCount <= 0}
              type="button"
              onClick={onDeleteSelectedCards}
            >
              Delete
            </button>
            <button
              id="cancelCardSelectionBtn"
              className="btn"
              style={styles.bulkButton}
              type="button"
              onClick={onCancelSelection}
            >
              Cancel
            </button>
          </div>
        </div>

        {panelMessage ? <div id="deckPanelMessage" className="tiny" style={styles.panelMessage}>{panelMessage}</div> : null}

        <div id="cardsGrid" style={styles.cardsGrid}>
          {loading ? <div id="cardsGridLoading" className="tiny">Loading cards…</div> : null}
          {!loading && error ? <div id="cardsGridError" className="tiny">{error}</div> : null}
          {!loading && !error && !cards.length ? <div id="cardsGridEmpty" className="tiny">No cards yet.</div> : null}
          {!loading && !error && cards.map(card => {
            const cardId = String(card.id || '').trim();
            const cardIdSuffix = toDomIdSuffix(cardId);
            return (
              <TopicDeckCardTile
                key={cardId}
                idBase={`deckCard-${topicIdSuffix}-${cardIdSuffix}`}
                card={card}
                progressState={getProgressStateKey(progressByCardId[cardId] || null)}
                selectionMode={selectionMode}
                selected={selectedCardIds.has(cardId)}
                onEdit={() => onEditCard(cardId)}
                onDuplicate={() => onDuplicateCard(cardId)}
                onDelete={() => onDeleteCard(cardId)}
                onToggleSelect={nextSelected => onToggleCardSelection(cardId, nextSelected)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  root: {
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  section: {
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  bulkActionsShell: {
    overflow: 'hidden',
    transition: 'height 220ms cubic-bezier(0.22, 1, 0.36, 1), margin 220ms ease',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    padding: 'var(--space-3)',
    border: '1px solid #2e4068',
    borderRadius: '16px',
    background: 'rgba(12, 18, 34, 0.58)',
    transformOrigin: 'top center',
    willChange: 'transform, opacity',
    transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease',
  },
  bulkCount: {
    marginRight: 'auto',
    fontSize: '0.98rem',
  },
  bulkButton: {
    minHeight: '46px',
    padding: '0 18px',
    fontSize: '0.98rem',
    fontWeight: 400,
    borderRadius: '14px',
  },
  panelMessage: {
    marginBottom: 'var(--space-2)',
    color: '#bfd7ff',
    textAlign: 'center',
  },
  cardsGrid: {
    display: 'grid',
    gap: 'var(--space-3)',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
  },
});
