import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';
import { RichTextContent } from './RichTextContent';
import {
  deleteCardBankById,
  deleteCardById,
  deleteProgressByCardId,
  deleteSubjectById,
  deleteTopicById,
  getCardsByTopicIds,
  getSubjects,
  getTopicsBySubject,
  upsertSubject,
  type CardRecord,
  type SubjectRecord,
  type TopicRecord
} from '../../lib/api';
import {
  getCardsFromSupabaseByTopicIdsIfConfigured,
  getSubjectsFromSupabaseIfConfigured,
  getTopicsFromSupabaseIfConfigured,
  upsertSubjectToSupabaseIfConfigured
} from '../../lib/supabase-subjects';
import { normalizeHexColor } from '../../lib/subjects';
import '../../styles/topic-panel.css';

interface ArchivedSubjectsDialogProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}

type LoadingState = 'idle' | 'loading' | 'error';

interface ArchiveActionState {
  type: 'restore' | 'delete' | '';
  subjectId: string;
}

export function ArchivedSubjectsDialog({
  open,
  onClose,
  onChanged
}: ArchivedSubjectsDialogProps) {
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [topicsBySubjectId, setTopicsBySubjectId] = useState<Record<string, TopicRecord[]>>({});
  const [cardsByTopicId, setCardsByTopicId] = useState<Record<string, CardRecord[]>>({});
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(() => new Set());
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(() => new Set());
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [message, setMessage] = useState('');
  const [actionState, setActionState] = useState<ArchiveActionState>({ type: '', subjectId: '' });

  const loadArchivedSubjects = useCallback(async () => {
    setLoadingState('loading');
    setMessage('');
    try {
      let rows = await getSubjects();
      if (!rows.some(subject => subject?.isArchived === true)) {
        const fallbackRows = await getSubjectsFromSupabaseIfConfigured();
        if (Array.isArray(fallbackRows) && fallbackRows.length) rows = fallbackRows;
      }
      const archived = rows
        .filter(subject => subject?.isArchived === true)
        .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')));

      const nextTopicsBySubjectId: Record<string, TopicRecord[]> = {};
      await Promise.all(archived.map(async subject => {
        const subjectId = String(subject?.id || '').trim();
        if (!subjectId) return;
        let topics: TopicRecord[] = [];
        try {
          topics = await getTopicsBySubject(subjectId, true);
          if (!topics.length) {
            const fallbackTopics = await getTopicsFromSupabaseIfConfigured(subjectId, true);
            topics = Array.isArray(fallbackTopics) ? fallbackTopics : [];
          }
        } catch {
          const fallbackTopics = await getTopicsFromSupabaseIfConfigured(subjectId, true);
          topics = Array.isArray(fallbackTopics) ? fallbackTopics : [];
        }
        nextTopicsBySubjectId[subjectId] = topics.sort((left, right) => (
          String(left?.name || '').localeCompare(String(right?.name || ''))
        ));
      }));

      setSubjects(archived);
      setTopicsBySubjectId(nextTopicsBySubjectId);
      setLoadingState('idle');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLoadingState('error');
      setMessage(`Could not load archived subjects: ${errorMessage}`);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setExpandedSubjectIds(new Set());
    setExpandedTopicIds(new Set());
    setCardsByTopicId({});
    void loadArchivedSubjects();
  }, [open, loadArchivedSubjects]);

  const totals = useMemo(() => {
    const topicCount = Object.values(topicsBySubjectId).reduce((sum, topics) => sum + topics.length, 0);
    const cardCount = Object.values(topicsBySubjectId).reduce((sum, topics) => (
      sum + topics.reduce((innerSum, topic) => innerSum + getTopicCardCount(topic, cardsByTopicId), 0)
    ), 0);
    return { topicCount, cardCount };
  }, [topicsBySubjectId, cardsByTopicId]);

  const description = `${subjects.length} archived ${subjects.length === 1 ? 'subject' : 'subjects'} • ${totals.topicCount} ${totals.topicCount === 1 ? 'topic' : 'topics'} • ${totals.cardCount} ${totals.cardCount === 1 ? 'card' : 'cards'}`;

  const toggleSubject = (subjectId: string) => {
    const safeSubjectId = String(subjectId || '').trim();
    if (!safeSubjectId) return;
    setExpandedSubjectIds(previous => {
      const next = new Set(previous);
      if (next.has(safeSubjectId)) next.delete(safeSubjectId);
      else next.add(safeSubjectId);
      return next;
    });
  };

  const toggleTopic = async (topicId: string) => {
    const safeTopicId = String(topicId || '').trim();
    if (!safeTopicId) return;
    const willExpand = !expandedTopicIds.has(safeTopicId);
    setExpandedTopicIds(previous => {
      const next = new Set(previous);
      if (next.has(safeTopicId)) next.delete(safeTopicId);
      else next.add(safeTopicId);
      return next;
    });
    if (!willExpand || cardsByTopicId[safeTopicId]) return;
    setMessage('');
    try {
      let cards: CardRecord[] = [];
      try {
        cards = await getCardsByTopicIds([safeTopicId]);
        if (!cards.length) {
          const fallbackCards = await getCardsFromSupabaseByTopicIdsIfConfigured([safeTopicId]);
          cards = Array.isArray(fallbackCards) ? fallbackCards : [];
        }
      } catch {
        const fallbackCards = await getCardsFromSupabaseByTopicIdsIfConfigured([safeTopicId]);
        cards = Array.isArray(fallbackCards) ? fallbackCards : [];
      }
      setCardsByTopicId(previous => ({
        ...previous,
        [safeTopicId]: cards.sort((left, right) => getRecordTimestamp(right) - getRecordTimestamp(left))
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Could not load cards: ${errorMessage}`);
    }
  };

  const handleRestoreSubject = async (subject: SubjectRecord) => {
    const subjectId = String(subject?.id || '').trim();
    if (!subjectId) return;
    setActionState({ type: 'restore', subjectId });
    setMessage('');
    try {
      const nowIso = new Date().toISOString();
      const restoredSubject = {
        ...subject,
        isArchived: false,
        updatedAt: nowIso,
        meta: {
          ...(subject.meta || {}),
          updatedAt: nowIso
        }
      };
      const supabaseResult = await upsertSubjectToSupabaseIfConfigured(restoredSubject);
      try {
        await upsertSubject(restoredSubject);
      } catch (apiError) {
        if (!supabaseResult) throw apiError;
      }
      await loadArchivedSubjects();
      await onChanged?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Could not restore subject: ${errorMessage}`);
    } finally {
      setActionState({ type: '', subjectId: '' });
    }
  };

  const handleDeleteSubject = async (subject: SubjectRecord) => {
    const subjectId = String(subject?.id || '').trim();
    if (!subjectId) return;
    if (!window.confirm(`Delete "${subject.name}" and all its topics/cards permanently?`)) return;
    setActionState({ type: 'delete', subjectId });
    setMessage('');
    try {
      let topics = topicsBySubjectId[subjectId] || [];
      if (!topics.length) {
        topics = await getTopicsBySubject(subjectId, true);
        if (!topics.length) {
          const fallbackTopics = await getTopicsFromSupabaseIfConfigured(subjectId, true);
          topics = Array.isArray(fallbackTopics) ? fallbackTopics : [];
        }
      }
      const topicIds = topics.map(topic => String(topic?.id || '').trim()).filter(Boolean);
      let cards = topicIds.length ? await getCardsByTopicIds(topicIds) : [];
      if (topicIds.length && !cards.length) {
        const fallbackCards = await getCardsFromSupabaseByTopicIdsIfConfigured(topicIds);
        cards = Array.isArray(fallbackCards) ? fallbackCards : [];
      }
      const cardIds = cards.map(card => String(card?.id || '').trim()).filter(Boolean);

      await Promise.allSettled(cardIds.map(cardId => deleteProgressByCardId(cardId)));
      await Promise.allSettled(cardIds.map(cardId => deleteCardBankById(cardId)));
      await Promise.allSettled(cardIds.map(cardId => deleteCardById(cardId)));
      await Promise.allSettled(topicIds.map(topicId => deleteTopicById(topicId)));
      await deleteSubjectById(subjectId);

      setSubjects(previous => previous.filter(item => String(item?.id || '').trim() !== subjectId));
      setExpandedSubjectIds(previous => {
        const next = new Set(previous);
        next.delete(subjectId);
        return next;
      });
      setTopicsBySubjectId(previous => {
        const next = { ...previous };
        delete next[subjectId];
        return next;
      });
      await onChanged?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Could not delete subject: ${errorMessage}`);
    } finally {
      setActionState({ type: '', subjectId: '' });
    }
  };

  return (
    <AppDialog
      id="archiveSubjectsDialog"
      open={open}
      title="Archived Subjects"
      description={description}
      message={message}
      onClose={onClose}
      closeIcon={<img className="archive-dialog-close-icon" src="/icons/close.svg" alt="" aria-hidden="true" />}
      backdropStyle={styles.backdrop}
      dialogStyle={styles.dialog}
      contentStyle={styles.content}
    >
      <div className="archive-dialog-body topic-panel-legacy">
        {loadingState === 'loading' ? <div className="archive-dialog-status tiny">Loading archived subjects...</div> : null}
        {loadingState === 'error' ? <div className="archive-dialog-status tiny">{message}</div> : null}
        {loadingState !== 'loading' && subjects.length <= 0 ? (
          <div className="archive-dialog-status tiny">No archived subjects.</div>
        ) : null}
        {subjects.map(subject => {
          const subjectId = String(subject?.id || '').trim();
          const expanded = expandedSubjectIds.has(subjectId);
          const accent = normalizeHexColor(subject?.accent || '#2dd4bf');
          const topics = topicsBySubjectId[subjectId] || [];
          const cardCount = topics.reduce((sum, topic) => sum + getTopicCardCount(topic, cardsByTopicId), 0);
          const isBusy = actionState.subjectId === subjectId;

          return (
            <section
              key={subjectId}
              className={['archive-subject-tile', expanded ? 'is-expanded' : ''].filter(Boolean).join(' ')}
              style={getAccentVars(accent)}
            >
              <div
                className="archive-subject-row"
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => toggleSubject(subjectId)}
                onKeyDown={event => handleKeyboardToggle(event, () => toggleSubject(subjectId))}
              >
                <div className="archive-tile-main">
                  <strong>{String(subject?.name || '').trim() || 'Untitled subject'}</strong>
                  <span>{topics.length} {topics.length === 1 ? 'topic' : 'topics'} • {cardCount} {cardCount === 1 ? 'card' : 'cards'}</span>
                </div>
                <div className="archive-subject-actions" onClick={event => event.stopPropagation()}>
                  <ArchiveActionButton
                    id={`archiveRestoreSubject-${toDomIdSuffix(subjectId)}`}
                    label={isBusy && actionState.type === 'restore' ? 'Restoring' : 'Restore'}
                    icon="/icons/unarchive.png"
                    tone="restore"
                    disabled={isBusy}
                    onClick={() => void handleRestoreSubject(subject)}
                  />
                  <ArchiveActionButton
                    id={`archiveDeleteSubject-${toDomIdSuffix(subjectId)}`}
                    label={isBusy && actionState.type === 'delete' ? 'Deleting' : 'Delete'}
                    icon="/icons/trash.svg"
                    tone="delete"
                    disabled={isBusy}
                    onClick={() => void handleDeleteSubject(subject)}
                  />
                </div>
                <span className="archive-chevron" aria-hidden="true">{expanded ? '▼' : '▶'}</span>
              </div>

              <div
                className={['archive-topic-list-shell', expanded ? 'is-open' : ''].filter(Boolean).join(' ')}
                aria-hidden={!expanded}
              >
                <div className="archive-topic-list">
                  {topics.length ? topics.map(topic => {
                    const topicId = String(topic?.id || '').trim();
                    const topicExpanded = expandedTopicIds.has(topicId);
                    const cards = cardsByTopicId[topicId] || [];
                    const hasLoadedCards = Object.prototype.hasOwnProperty.call(cardsByTopicId, topicId);
                    return (
                      <div key={topicId} className={['archive-topic-tile', topicExpanded ? 'is-expanded' : ''].filter(Boolean).join(' ')}>
                        <div
                          className="archive-topic-row"
                          role="button"
                          tabIndex={expanded ? 0 : -1}
                          aria-expanded={topicExpanded}
                          onClick={() => void toggleTopic(topicId)}
                          onKeyDown={event => handleKeyboardToggle(event, () => void toggleTopic(topicId))}
                        >
                          <div className="archive-tile-main">
                            <strong>{String(topic?.name || '').trim() || 'Untitled topic'}</strong>
                            <span>{getTopicCardCount(topic, cardsByTopicId)} {getTopicCardCount(topic, cardsByTopicId) === 1 ? 'card' : 'cards'}</span>
                          </div>
                          <span className="archive-chevron" aria-hidden="true">{topicExpanded ? '▼' : '▶'}</span>
                        </div>
                        <div
                          className={['archive-card-grid-shell', topicExpanded ? 'is-open' : ''].filter(Boolean).join(' ')}
                          aria-hidden={!topicExpanded}
                        >
                          <div className="archive-card-grid">
                            {!hasLoadedCards ? <div className="archive-dialog-status tiny">Loading cards...</div> : null}
                            {hasLoadedCards && !cards.length ? <div className="archive-dialog-status tiny">No cards in this topic.</div> : null}
                            {cards.map(card => (
                              <ArchiveCardTile key={card.id} card={card} />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }) : <div className="archive-dialog-status tiny">No topics in this subject.</div>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </AppDialog>
  );
}

function ArchiveActionButton({
  id,
  label,
  icon,
  tone,
  disabled,
  onClick
}: {
  id: string;
  label: string;
  icon: string;
  tone: 'restore' | 'delete';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <AppButton
      id={id}
      className={`archive-action-button archive-action-${tone}`}
      disabled={disabled}
      ariaLabel={label}
      title={label}
      onClick={onClick}
    >
      <img className="archive-action-icon" src={icon} alt="" aria-hidden="true" />
      <span className="archive-action-label">{label}</span>
    </AppButton>
  );
}

function ArchiveCardTile({ card }: { card: CardRecord }) {
  return (
    <article className="archive-card-tile">
      <span className="archive-preview-pill">Preview</span>
      <div className="archive-card-half">
        <div className="card-tile-title">Q</div>
        <div className="card-tile-body">
          <RichTextContent
            className="card-tile-rich-text"
            content={String(card.prompt || '')}
            textAlign={String(card.questionTextAlign || card.textAlign || 'center')}
          />
        </div>
      </div>
      <div className="card-tile-separator" />
      <div className="archive-card-half">
        <div className="card-tile-title">A</div>
        <div className="card-tile-body">
          <RichTextContent
            className="card-tile-rich-text"
            content={getCardAnswerPreview(card)}
            textAlign={String(card.answerTextAlign || card.textAlign || 'center')}
          />
        </div>
      </div>
    </article>
  );
}

function getCardAnswerPreview(card: CardRecord): string {
  const answer = String(card.answer || '').trim();
  if (answer) return answer;
  const options = Array.isArray(card.options) ? card.options : [];
  return options
    .filter(option => option?.correct === true || String(option?.correct || '').toLowerCase() === 'true')
    .map(option => String(option?.text || '').trim())
    .filter(Boolean)
    .join(', ');
}

function getTopicCardCount(topic: TopicRecord, cardsByTopicId: Record<string, CardRecord[]>): number {
  const topicId = String(topic?.id || '').trim();
  const loadedCards = cardsByTopicId[topicId];
  if (Array.isArray(loadedCards)) return loadedCards.length;
  const count = Number(topic?.cardCount || 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function getRecordTimestamp(record: { updatedAt?: string | number; createdAt?: string | number; meta?: { updatedAt?: string | number; createdAt?: string | number } }): number {
  const raw = record?.meta?.updatedAt ?? record?.updatedAt ?? record?.meta?.createdAt ?? record?.createdAt ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAccentVars(accent: string): CSSProperties {
  return {
    '--subject-accent': accent,
    '--tile-accent': accent,
    '--subject-accent-bg': hexToRgba(accent, 0.1),
    '--subject-accent-card-bg': hexToRgba(accent, 0.16),
    '--subject-accent-glow': hexToRgba(accent, 0.24)
  } as CSSProperties;
}

function hexToRgba(hex: string, alpha: number): string {
  const safe = normalizeHexColor(hex).slice(1);
  const red = Number.parseInt(safe.slice(0, 2), 16);
  const green = Number.parseInt(safe.slice(2, 4), 16);
  const blue = Number.parseInt(safe.slice(4, 6), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function handleKeyboardToggle(event: KeyboardEvent<HTMLElement>, callback: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  callback();
}

function toDomIdSuffix(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return 'unknown';
  return safe.replace(/[^a-zA-Z0-9_-]/g, '-');
}

const styles = {
  backdrop: {
    background: 'rgba(8, 14, 28, 0.55)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)'
  },
  dialog: {
    width: 'min(50vw, 1120px)',
    minWidth: 'min(92vw, 720px)',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '88dvh',
    padding: 'var(--s24)',
    overflow: 'hidden'
  },
  content: {
    minHeight: 0,
    overflow: 'hidden'
  }
} as const;
