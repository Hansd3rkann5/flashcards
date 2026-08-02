// App layout-level frontend bootstrap (TS source)
// ============================================================================

type UiStructureMode = 'components';

const FRONTEND_TS_ROOT_ID = 'tsxAppRoot';
const LEGACY_STYLESHEET_ID = 'legacyStylesheet';

function isComponentsOnlyModeEnabled(): boolean {
  const runtimeFlag = (window as unknown as { __UI_COMPONENTS_ONLY__?: unknown }).__UI_COMPONENTS_ONLY__;
  if (typeof runtimeFlag === 'boolean') return runtimeFlag;
  return false;
}

function disableLegacyStylesheet(): void {
  const legacySheet = document.getElementById(LEGACY_STYLESHEET_ID);
  if (!(legacySheet instanceof HTMLLinkElement)) return;
  legacySheet.disabled = true;
}

function ensureFrontendTsRoot(): HTMLDivElement {
  const existing = document.getElementById(FRONTEND_TS_ROOT_ID);
  if (existing instanceof HTMLDivElement) return existing;
  const root = document.createElement('div');
  root.id = FRONTEND_TS_ROOT_ID;
  document.body.appendChild(root);
  return root;
}

function createMigrationSidebar(): HTMLElement {
  const listItems = [
    'Header',
    'Sidebar Navigation',
    'Subjects List',
    'Topic Panel',
    'Card Overview',
    'Study Session',
  ];
  return (
    <aside style={appWorkspaceStyles.sidebar}>
      <div style={appWorkspaceStyles.sidebarTitle}>Flashcards TS</div>
      <div style={appWorkspaceStyles.sidebarSubtitle}>Migration Workspace</div>
      <ul style={appWorkspaceStyles.sidebarList}>
        {listItems.map(item => (
          <li style={appWorkspaceStyles.sidebarListItem}>{item}</li>
        ))}
      </ul>
    </aside>
  ) as HTMLElement;
}

function createMigrationMain(): HTMLElement {
  const header = createAppHeader({
    id: 'tsxWorkspaceHeader',
    title: 'Frontend Components Workspace',
    leftButtons: [
      {
        id: 'tsxSidebarToggle',
        icon: 'antd:menu-outlined',
        rect: true,
        ariaLabel: 'Show migration outline',
        title: 'Show migration outline',
        onPress: () => {
          const root = document.getElementById(FRONTEND_TS_ROOT_ID);
          if (!(root instanceof HTMLElement)) return;
          root.classList.toggle('tsx-sidebar-hidden');
        }
      }
    ],
    rightButtons: [
      {
        id: 'tsxLoadingToggle',
        icon: 'antd:loading',
        rect: true,
        ariaLabel: 'Toggle loading helper preview',
        title: 'Toggle loading helper preview',
        onPress: () => {
          const overlay = el('appLoadingOverlay');
          const isVisible = overlay instanceof HTMLElement && overlay.classList.contains('is-visible');
          if (isVisible) window.hideGlobalLoading?.();
          else window.showGlobalLoading?.('Migrating UI components...');
        }
      }
    ]
  });

  const body = (
    <div style={appWorkspaceStyles.mainBody}>
      <section style={appWorkspaceStyles.infoCard}>
        <h3 style={appWorkspaceStyles.infoTitle}>Legacy UI Hidden</h3>
        <p style={appWorkspaceStyles.infoText}>
          Du siehst jetzt nur noch die neue Frontend-TS-Struktur. Migriere ab jetzt Panel fuer Panel in diese Shell.
        </p>
      </section>
      <section style={appWorkspaceStyles.infoCard}>
        <h3 style={appWorkspaceStyles.infoTitle}>Next Steps</h3>
        <p style={appWorkspaceStyles.infoText}>
          1) Sidebar als eigene Komponente fertigstellen. 2) Home/Topics migrieren. 3) Study Session migrieren.
        </p>
      </section>
    </div>
  ) as HTMLElement;

  return (
    <main style={appWorkspaceStyles.main}>
      {header}
      {body}
    </main>
  ) as HTMLElement;
}

function mountComponentsWorkspace(): void {
  const root = ensureFrontendTsRoot();
  const shell = (
    <div style={appWorkspaceStyles.shell}>
      {createMigrationSidebar()}
      {createMigrationMain()}
    </div>
  ) as HTMLDivElement;
  root.replaceChildren(shell);
}

function initializePanelComponentLayer(): void {
  if (!isComponentsOnlyModeEnabled()) return;
  document.body.dataset.uiStructureMode = 'components';
  document.body.dataset.uiComponentsOnly = '1';
  disableLegacyStylesheet();
  mountComponentsWorkspace();
  initializeLoadingHelperComponent({
    overlayId: 'appLoadingOverlay',
    labelId: 'appLoadingLabel',
    defaultMessage: 'Loading...'
  });
}

(window as unknown as { setUiStructureMode?: (mode: UiStructureMode) => void }).setUiStructureMode = () => {
  document.body.dataset.uiStructureMode = 'components';
  document.body.dataset.uiComponentsOnly = '1';
  mountComponentsWorkspace();
};

const appWorkspaceStyles = ComponentStyleSheet.create({
  shell: {
    minHeight: '100dvh',
    display: 'grid',
    gridTemplateColumns: 'clamp(220px, 24vw, 280px) minmax(0, 1fr)',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    boxSizing: 'border-box',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'Inter, Segoe UI, Roboto, system-ui, sans-serif'
  },
  sidebar: {
    border: '1px solid #30476f',
    borderRadius: 'var(--radius)',
    background: 'rgba(10, 16, 30, 0.92)',
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    boxShadow: '0 0px 20px var(--accent-glow)'
  },
  sidebarTitle: {
    fontSize: 'var(--font-size-title)',
    fontWeight: 700
  },
  sidebarSubtitle: {
    fontSize: 'var(--font-size-small)',
    color: 'var(--muted)'
  },
  sidebarList: {
    listStyle: 'none',
    margin: 'var(--space-2) 0 0 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)'
  },
  sidebarListItem: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(59, 84, 126, 0.8)',
    background: 'rgba(18, 28, 48, 0.86)',
    fontSize: 'var(--font-size-small)'
  },
  main: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)'
  },
  mainBody: {
    display: 'grid',
    gap: 'var(--space-3)',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
  },
  infoCard: {
    border: '1px solid #30476f',
    borderRadius: 'var(--radius)',
    background: 'rgba(10, 16, 30, 0.9)',
    padding: 'var(--space-3)',
    boxShadow: '0 0px 20px rgba(7, 16, 34, 0.35)'
  },
  infoTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700
  },
  infoText: {
    margin: 'var(--space-2) 0 0',
    color: 'var(--text)',
    lineHeight: 1.5,
    fontSize: 'var(--font-size-small)'
  }
});
