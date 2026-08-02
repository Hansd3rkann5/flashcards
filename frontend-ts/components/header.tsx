// Header component
// ============================================================================

function createAppHeader(options: HeaderComponentOptions): HTMLDivElement {
  const safe = (options && typeof options === 'object') ? options : null;
  if (!safe) {
    throw new Error('createAppHeader requires a valid options object.');
  }
  const title = String(safe.title || '').trim();
  if (!title) {
    throw new Error('createAppHeader requires a title.');
  }

  const leftButtons = Array.isArray(safe.leftButtons) ? safe.leftButtons : [];
  const rightButtons = Array.isArray(safe.rightButtons) ? safe.rightButtons : [];
  return (
    <div
      id={safe.id ? String(safe.id).trim() : undefined}
      style={headerStyles.root}
    >
      <div style={{ ...headerStyles.side, ...headerStyles.sideLeft }}>
        {leftButtons.map(buttonOptions => createAppButton(buttonOptions))}
      </div>
      <h2 style={headerStyles.title}>
        {title}
      </h2>
      <div style={{ ...headerStyles.side, ...headerStyles.sideRight }}>
        {rightButtons.map(buttonOptions => createAppButton(buttonOptions))}
      </div>
    </div>
  ) as HTMLDivElement;
}

const headerStyles = ComponentStyleSheet.create({
  root: {
    position: 'relative',
    margin: 0,
    width: '100%',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid #30476f',
    borderRadius: '16px',
    background: 'rgba(10, 16, 30, 0.899)',
    boxShadow: '0 0px 20px var(--accent)',
    isolation: 'isolate',
    transform: 'translateZ(0)',
    minHeight: '56px'
  },
  side: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0
  },
  sideLeft: {
    justifyContent: 'flex-start'
  },
  sideRight: {
    justifyContent: 'flex-end'
  },
  title: {
    margin: 0,
    justifySelf: 'center',
    textAlign: 'center',
    fontSize: 'var(--font-size-title)',
    lineHeight: 1.2,
    fontWeight: 700,
    pointerEvents: 'none',
    maxWidth: '100%'
  }
});
