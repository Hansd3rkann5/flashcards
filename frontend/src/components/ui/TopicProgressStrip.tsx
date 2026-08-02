import { useId } from 'react';

export interface TopicProgressCounts {
  mastered: number;
  correct: number;
  partial: number;
  wrong: number;
  notAnswered: number;
}

interface TopicProgressStripProps {
  counts: TopicProgressCounts;
  idBase?: string;
  wrapperId?: string;
  barId?: string;
  legendId?: string;
  wrapperClassName?: string;
  barClassName?: string;
  legendClassName?: string;
  compactLegend?: boolean;
}

function toSafeCount(value: number | undefined): number {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.trunc(safe));
}

export function TopicProgressStrip({
  counts,
  idBase,
  wrapperId,
  barId,
  legendId,
  wrapperClassName = 'topic-progress',
  barClassName = 'topic-progress-bar',
  legendClassName = 'topic-progress-legend',
  compactLegend = true
}: TopicProgressStripProps) {
  const reactId = useId();
  const generatedBaseId = `topicProgressStrip-${reactId.replace(/[:]/g, '')}`;
  const baseId = String(idBase || generatedBaseId).trim();
  const resolvedWrapperId = wrapperId || `${baseId}-wrapper`;
  const resolvedBarId = barId || `${baseId}-bar`;
  const resolvedLegendId = legendId || `${baseId}-legend`;

  const mastered = toSafeCount(counts.mastered);
  const correct = toSafeCount(counts.correct);
  const partial = toSafeCount(counts.partial);
  const wrong = toSafeCount(counts.wrong);
  const notAnswered = toSafeCount(counts.notAnswered);
  const total = mastered + correct + partial + wrong + notAnswered;

  const masteredRatio = total > 0 ? (mastered / total) * 100 : 0;
  const correctRatio = total > 0 ? (correct / total) * 100 : 0;
  const partialRatio = total > 0 ? (partial / total) * 100 : 0;
  const wrongRatio = total > 0 ? (wrong / total) * 100 : 0;
  const notAnsweredRatio = total > 0 ? (notAnswered / total) * 100 : 0;

  return (
    <div id={resolvedWrapperId} className={wrapperClassName}>
      <div
        id={resolvedBarId}
        className={barClassName}
        role="img"
        aria-label="Progress ratio for mastered, correct, partially answered, wrong, and not answered yet cards"
      >
        {total > 0 ? (
          <>
            <span id={`${baseId}-seg-mastered`} className="topic-progress-seg topic-progress-mastered" style={{ width: `${masteredRatio}%` }} />
            <span id={`${baseId}-seg-correct`} className="topic-progress-seg topic-progress-correct" style={{ width: `${correctRatio}%` }} />
            <span id={`${baseId}-seg-partial`} className="topic-progress-seg topic-progress-partial" style={{ width: `${partialRatio}%` }} />
            <span id={`${baseId}-seg-wrong`} className="topic-progress-seg topic-progress-wrong" style={{ width: `${wrongRatio}%` }} />
            <span id={`${baseId}-seg-notAnswered`} className="topic-progress-seg topic-progress-notanswered" style={{ width: `${notAnsweredRatio}%` }} />
          </>
        ) : null}
      </div>
      <div id={resolvedLegendId} className={legendClassName}>
        <span id={`${baseId}-legend-mastered`} className="topic-progress-legend-mastered">{compactLegend ? `M:${mastered}` : `Mastered: ${mastered}`}</span>
        <span id={`${baseId}-legend-correct`} className="topic-progress-legend-correct">{compactLegend ? `C:${correct}` : `Correct: ${correct}`}</span>
        <span id={`${baseId}-legend-partial`} className="topic-progress-legend-partial">{compactLegend ? `P:${partial}` : `Partially: ${partial}`}</span>
        <span id={`${baseId}-legend-wrong`} className="topic-progress-legend-wrong">{compactLegend ? `W:${wrong}` : `Wrong: ${wrong}`}</span>
        <span id={`${baseId}-legend-notAnswered`} className="topic-progress-legend-notanswered">{compactLegend ? `N:${notAnswered}` : `Not answered yet: ${notAnswered}`}</span>
      </div>
    </div>
  );
}
