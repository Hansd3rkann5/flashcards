import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useId } from 'react';

interface AppHeaderProps {
  id?: string;
  titleId?: string;
  leftSlotId?: string;
  rightSlotId?: string;
  title: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export function AppHeader({
  id,
  titleId,
  leftSlotId,
  rightSlotId,
  title,
  leftSlot,
  rightSlot
}: AppHeaderProps) {
  const reactId = useId();
  const baseId = id || `appHeader-${reactId.replace(/[:]/g, '')}`;
  const resolvedTitleId = titleId || `${baseId}-title`;
  const resolvedLeftSlotId = leftSlotId || `${baseId}-leftSlot`;
  const resolvedRightSlotId = rightSlotId || `${baseId}-rightSlot`;

  return (
    <header id={baseId} style={styles.header}>
      <div id={resolvedLeftSlotId} style={{ ...styles.side, ...styles.sideLeft }}>{leftSlot}</div>
      <h1 id={resolvedTitleId} style={styles.title}>{title}</h1>
      <div id={resolvedRightSlotId} style={{ ...styles.side, ...styles.sideRight }}>{rightSlot}</div>
    </header>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  header: {
    position: 'relative',
    border: '1px solid #30476f',
    borderRadius: 'var(--radius)',
    background: 'rgba(10, 16, 30, 0.9)',
    padding: 'var(--s12) var(--s16)',
    minHeight: 'var(--s56)',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    columnGap: 'var(--s12)',
    minWidth: 0
  },
  title: {
    margin: 0,
    justifySelf: 'center',
    textAlign: 'center',
    fontSize: 'clamp(1.02rem, 1.1vw + 0.78rem, 1.4rem)',
    minWidth: 0,
    width: '100%',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical'
  },
  side: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--s8)',
    minWidth: 0
  },
  sideLeft: {
    justifyContent: 'flex-start'
  },
  sideRight: {
    justifyContent: 'flex-end'
  }
});
