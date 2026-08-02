import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';

interface AppSectionProps {
  id?: string;
  titleId?: string;
  bodyId?: string;
  title: string;
  children: ReactNode;
}

export function AppSection({ id, titleId, bodyId, title, children }: AppSectionProps) {
  const reactId = useId();
  const baseId = id || `appSection-${reactId.replace(/[:]/g, '')}`;
  const resolvedTitleId = titleId || `${baseId}-title`;
  const resolvedBodyId = bodyId || `${baseId}-body`;

  return (
    <div id={baseId} style={styles.root}>
      <h3 id={resolvedTitleId} style={styles.title}>{title}</h3>
      <div id={resolvedBodyId} style={styles.body}>{children}</div>
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
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s8)',
    minWidth: 0
  },
  title: {
    margin: 0,
    fontSize: '1rem',
    lineHeight: 1.3
  },
  body: {
    margin: 0,
    minWidth: 0
  }
});
