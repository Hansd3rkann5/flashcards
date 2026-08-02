import type { CSSProperties } from 'react';
import { useId } from 'react';

export interface ProgressBarSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface ProgressBarProps {
  id?: string;
  title?: string;
  totalCards?: number;
  segments?: ProgressBarSegment[];
  ariaLabel?: string;
  emptyBarText?: string;
  emptyLegendText?: string;
}

function toCount(value: number | undefined): number {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.round(safe));
}

export function ProgressBar({
  id,
  title = 'Complete Progress',
  totalCards = 0,
  segments = [],
  ariaLabel = 'Review ratio for mastered, partially answered, wrong, and not answered yet',
  emptyBarText = 'No answered cards yet.',
  emptyLegendText = 'No data yet.'
}: ProgressBarProps) {
  const reactId = useId();
  const baseId = id || `progressBar-${reactId.replace(/[:]/g, '')}`;
  const normalizedSegments = segments.map(segment => ({
    ...segment,
    value: toCount(segment.value)
  }));
  const total = normalizedSegments.reduce((sum, segment) => sum + segment.value, 0);
  const safeTotalCards = toCount(totalCards);
  const cardWord = safeTotalCards === 1 ? 'card' : 'cards';
  const nonZeroSegments = normalizedSegments.filter(segment => segment.value > 0);

  return (
    <div id={baseId} style={styles.panel}>
      <div id={`${baseId}-header`} style={styles.header}>
        <h3 id={`${baseId}-title`} style={styles.title}>{title}</h3>
        <span id={`${baseId}-meta`} style={styles.meta}>{`${safeTotalCards} ${cardWord}`}</span>
      </div>

      <div id={`${baseId}-barWrap`} style={styles.barWrap}>
        <div
          id={`${baseId}-bar`}
          role="img"
          aria-label={total > 0
            ? normalizedSegments.map(segment => `${segment.label}: ${segment.value}`).join(', ')
            : ariaLabel}
          style={{
            ...styles.bar,
            ...(total <= 0 ? styles.barEmpty : {})
          }}
        >
          {total <= 0 ? (
            <span id={`${baseId}-emptyBarText`} style={styles.emptyText}>{emptyBarText}</span>
          ) : (
            nonZeroSegments.map(segment => {
              const ratio = (segment.value / total) * 100;
              const safeSegmentKey = String(segment.key || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'segment';
              return (
                <span
                  key={segment.key}
                  id={`${baseId}-segment-${safeSegmentKey}`}
                  title={`${segment.label}: ${segment.value}`}
                  style={{
                    ...styles.segment,
                    width: `${ratio.toFixed(3)}%`,
                    background: segment.color
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      <div id={`${baseId}-legend`} style={styles.legend}>
        {total <= 0 ? (
          <span id={`${baseId}-emptyLegendText`}>{emptyLegendText}</span>
        ) : (
          normalizedSegments.map(segment => (
            <span
              key={segment.key}
              id={`${baseId}-legendItem-${String(segment.key || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'segment'}`}
              style={styles.legendItem}
            >
              <span
                id={`${baseId}-legendDot-${String(segment.key || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'segment'}`}
                style={{ ...styles.legendDot, background: segment.color }}
              />
              <span id={`${baseId}-legendText-${String(segment.key || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'segment'}`}>{`${segment.label}: ${segment.value}`}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  panel: {
    border: '1px solid #30476f',
    borderRadius: 'var(--s16)',
    background: 'rgba(13, 22, 42, 0.58)',
    padding: 'var(--s16)',
    display: 'grid',
    gap: 'var(--s8)',
    alignContent: 'start'
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--s8)'
  },
  title: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '0.01em',
    color: '#dbe7ff'
  },
  meta: {
    color: '#bfd7ff',
    fontSize: '0.75rem'
  },
  barWrap: {
    width: '100%'
  },
  bar: {
    position: 'relative',
    minHeight: 'var(--s16)',
    borderRadius: '999px',
    border: '1px solid #2a3f66',
    background: '#1a2746',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'stretch'
  },
  barEmpty: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: '0.68rem',
    color: '#9db2d9',
    padding: '0 var(--s8)',
    lineHeight: 1.4
  },
  segment: {
    display: 'block',
    minWidth: 0,
    transition: 'width 0.26s ease'
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--s8) var(--s12)',
    color: '#c8d9f6',
    fontSize: '0.75rem'
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--s8)'
  },
  legendDot: {
    width: 'var(--s8)',
    height: 'var(--s8)',
    borderRadius: '999px',
    display: 'inline-block'
  }
});
