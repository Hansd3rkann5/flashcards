import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useId } from 'react';

interface AppPanelSection {
  content: ReactNode;
  framed?: boolean;
}

interface AppPanelProps {
  id?: string;
  headerWrapId?: string;
  sectionsId?: string;
  sectionIdPrefix?: string;
  header?: ReactNode;
  sections: Array<ReactNode | AppPanelSection>;
  style?: CSSProperties;
}

export function AppPanel({
  id,
  headerWrapId,
  sectionsId,
  sectionIdPrefix,
  header,
  sections,
  style
}: AppPanelProps) {
  const reactId = useId();
  const baseId = id || `appPanel-${reactId.replace(/[:]/g, '')}`;
  const resolvedHeaderWrapId = headerWrapId || `${baseId}-headerWrap`;
  const resolvedSectionsId = sectionsId || `${baseId}-sections`;
  const resolvedSectionIdPrefix = sectionIdPrefix || `${baseId}-section`;

  return (
    <section id={baseId} style={{ ...styles.panel, ...(style || {}) }}>
      {header ? <div id={resolvedHeaderWrapId} style={styles.headerWrap}>{header}</div> : null}
      <div id={resolvedSectionsId} style={styles.sections}>
        {sections.map((sectionEntry, index) => {
          const section = isPanelSection(sectionEntry)
            ? sectionEntry
            : { content: sectionEntry, framed: true };
          const framed = section.framed !== false;
          return (
            <section
              key={index}
              id={`${resolvedSectionIdPrefix}-${index + 1}`}
              style={{
                ...styles.sectionItem,
                ...(framed ? styles.sectionItemFramed : styles.sectionItemBare)
              }}
            >
              {section.content}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function isPanelSection(value: ReactNode | AppPanelSection): value is AppPanelSection {
  return typeof value === 'object' && value !== null && 'content' in value;
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    height: 'calc(100dvh - (var(--s20) * 2))',
    minHeight: 'calc(100dvh - (var(--s20) * 2))',
    maxHeight: 'calc(100dvh - (var(--s20) * 2))',
    boxSizing: 'border-box',
    padding: 'var(--s16)',
    border: '1px solid #30476f',
    borderRadius: 'var(--s16)',
    background: 'rgba(10, 16, 30, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)',
    overflow: 'hidden'
  },
  headerWrap: {
    width: '100%'
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)',
    minWidth: 0,
    minHeight: 0,
    flex: '1 1 auto',
    overflowY: 'auto',
    overflowX: 'hidden'
  },
  sectionItem: {
    minWidth: 0,
    minHeight: 0
  },
  sectionItemFramed: {
    border: '1px solid rgba(59, 84, 126, 0.8)',
    background: 'rgba(18, 28, 48, 0.86)',
    borderRadius: 'var(--s12)',
    padding: 'var(--s12)'
  },
  sectionItemBare: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    border: 'none',
    background: 'transparent',
    borderRadius: 0,
    padding: 0,
    overflow: 'hidden'
  }
});
