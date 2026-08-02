import type { CSSProperties, ReactNode } from 'react';
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import { AppButton } from './AppButton';

export interface AppSidebarOption {
  id: string;
  label: string;
  onClick?: () => void;
}

interface AppSidebarProps {
  id?: string;
  appTitle: string;
  options: AppSidebarOption[];
  subjects?: ReactNode[];
  onAddSubject?: () => void;
  onLogout?: () => void;
  logoutDisabled?: boolean;
  subjectsTitle?: string;
  metaText?: string;
  style?: CSSProperties;
}

export function AppSidebar({
  id = 'appSidebar',
  appTitle,
  options,
  subjects = [],
  onAddSubject,
  onLogout,
  logoutDisabled = false,
  subjectsTitle = 'Subjects',
  metaText = '© SimonBader',
  style
}: AppSidebarProps) {
  const safeBaseId = String(id || 'appSidebar').trim() || 'appSidebar';

  return (
    <aside id={safeBaseId} style={{ ...styles.root, ...(style || {}) }}>
      <div id={`${safeBaseId}-header`} style={styles.header}>
        <div id={`${safeBaseId}-appTitle`} style={styles.appTitle}>{appTitle}</div>
        <div id={`${safeBaseId}-options`} style={styles.options}>
          {options.map(option => (
            <AppButton
              key={option.id}
              id={`${safeBaseId}-option-${String(option.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'item'}`}
              width="100%"
              height="var(--s40)"
              title={option.label}
              ariaLabel={option.label}
              onClick={option.onClick}
              style={styles.optionButton}
            >
              {option.label}
            </AppButton>
          ))}
        </div>
      </div>

      <div id={`${safeBaseId}-subjects`} style={styles.subjects}>
        <div id={`${safeBaseId}-subjectsHeader`} style={styles.subjectsHeader}>
          <strong id={`${safeBaseId}-subjectsTitle`}>{subjectsTitle}</strong>
          <AppButton
            id={`${safeBaseId}-addSubjectBtn`}
            rect
            icon={<PlusOutlined />}
            ariaLabel="Add subject"
            title="Add subject"
            onClick={onAddSubject}
            style={styles.addSubjectButton}
          />
        </div>
        <div id={`${safeBaseId}-subjectList`} style={styles.subjectList}>
          {subjects.length > 0
            ? subjects.map((subject, index) => (
              <div key={index} id={`${safeBaseId}-subjectListItem-${index + 1}`} style={styles.subjectItemWrap}>
                {isPrimitive(subject) ? <div id={`${safeBaseId}-subjectTile-${index + 1}`} style={styles.subjectTile}>{String(subject)}</div> : subject}
              </div>
            ))
            : <div id={`${safeBaseId}-subjectListEmpty`} style={styles.emptyText}>No subjects yet.</div>}
        </div>
      </div>

      <div id={`${safeBaseId}-meta`} style={styles.meta}>
        <div id={`${safeBaseId}-metaLine`} style={styles.metaLine}>{metaText}</div>
      </div>

      {onLogout ? (
        <AppButton
          id={`${safeBaseId}-logoutBtn`}
          width="100%"
          height="var(--s40)"
          title="Log Out"
          ariaLabel="Log out"
          disabled={logoutDisabled}
          icon={<LogoutOutlined />}
          onClick={onLogout}
          style={styles.logoutButton}
        >
          Log Out
        </AppButton>
      ) : null}
    </aside>
  );
}

function isPrimitive(value: ReactNode): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  root: {
    border: '1px solid #30476f',
    borderRadius: 'var(--radius)',
    background: 'rgba(10, 16, 30, 0.92)',
    padding: 'var(--s16)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)',
    minWidth: 0,
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'visible'
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)'
  },
  appTitle: {
    fontSize: 'clamp(1rem, 1vw + 0.75rem, 1.3rem)',
    fontWeight: 700
  },
  options: {
    display: 'grid',
    gap: 'var(--s8)'
  },
  optionButton: {
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '0.9rem'
  },
  subjects: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)',
    minHeight: 0,
    flex: 1
  },
  subjectsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 'var(--s8)',
    fontSize: '0.9rem'
  },
  addSubjectButton: {
    background: 'var(--success, #16a34a)'
  },
  subjectList: {
    display: 'grid',
    gap: 'var(--s8)',
    padding: 'var(--s4)',
    minHeight: 0,
    overflowX: 'visible',
    overflowY: 'auto',
    alignContent: 'start'
  },
  subjectItemWrap: {
    minWidth: 0
  },
  subjectTile: {
    border: '1px solid rgba(59, 84, 126, 0.8)',
    background: 'rgba(18, 28, 48, 0.86)',
    borderRadius: 'var(--s12)',
    padding: 'var(--s12)',
    fontSize: 'clamp(0.76rem, 0.25vw + 0.7rem, 0.88rem)'
  },
  emptyText: {
    color: '#9db2d9',
    fontSize: '0.78rem'
  },
  meta: {
    paddingTop: 'var(--s4)'
  },
  metaLine: {
    fontSize: '0.7rem',
    color: '#9db2d9'
  },
  logoutButton: {
    marginTop: 'auto',
    background: '#b91c1c',
    color: '#ffe8e8',
    fontWeight: 700,
    fontSize: '0.9rem'
  }
});
