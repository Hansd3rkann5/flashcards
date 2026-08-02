// App button component
// ============================================================================

function toCssSize(value: SizeLike | undefined, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeHitSlopInsets(value: number | HitSlopInsets | undefined): Required<HitSlopInsets> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const safe = Math.max(0, value);
    return { top: safe, right: safe, bottom: safe, left: safe };
  }
  const raw = (value && typeof value === 'object') ? value : {};
  return {
    top: Math.max(0, Number(raw.top || 0)),
    right: Math.max(0, Number(raw.right || 0)),
    bottom: Math.max(0, Number(raw.bottom || 0)),
    left: Math.max(0, Number(raw.left || 0))
  };
}

function triggerPressHaptic(): void {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(16);
  } catch {
    // Optional browser API.
  }
}

function isSidebarToggleViewport(): boolean {
  if (document.body.classList.contains('sidebar-hidden')) return false;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const phoneLikeViewport = window.innerWidth <= 768;
  const tabletPortraitViewport = window.innerWidth <= 1024 && portrait;
  return phoneLikeViewport || tabletPortraitViewport;
}

function hasDefinedSize(value: SizeLike | undefined): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function createAppButton(options: AppButtonOptions): HTMLButtonElement {
  const safe = (options && typeof options === 'object') ? options : null;
  if (!safe) throw new Error('createAppButton requires a valid options object.');

  const onPress = typeof safe.onPress === 'function'
    ? safe.onPress
    : typeof safe.onClick === 'function'
      ? ((event: ButtonPressEvent) => safe.onClick?.(event as MouseEvent))
      : null;
  if (!onPress) throw new Error('createAppButton requires an onPress or onClick function.');

  const resolvedIcon = resolveIconSource(safe.icon, safe.iconColor);
  if (!resolvedIcon.src) throw new Error('createAppButton requires an icon path.');
  const iconSize = toCssSize(safe.iconSize, '18px');
  const variant: AppButtonVariant = safe.variant === 'sidebarToggle' ? 'sidebarToggle' : 'default';
  const isSidebarToggle = variant === 'sidebarToggle';
  const isRect = safe.rect === true;
  if (!isRect && (!hasDefinedSize(safe.width) || !hasDefinedSize(safe.height))) {
    throw new Error('createAppButton requires width and height when rect is not true.');
  }

  const disabled = !!safe.disabled;
  const loading = !!safe.loading;
  const isBlocked = disabled || loading;
  const visualDisabled = !!safe.visualDisabled;
  const appearanceDisabled = visualDisabled || isBlocked;
  const baseScale = appearanceDisabled ? 0.95 : 1;
  const pressedScale = 0.97;
  const backgroundColor = appearanceDisabled
    ? String(safe.backgroundColorDisabled || '#777777')
    : String(safe.backgroundColor || '#273655');
  const width = toCssSize(safe.width, isRect ? '40px' : '');
  const height = toCssSize(safe.height, isRect ? '40px' : '');

  const button = (
    <button
      type="button"
      id={safe.id ? String(safe.id).trim() : undefined}
      title={safe.title ? String(safe.title) : undefined}
      aria-label={safe.ariaLabel ? String(safe.ariaLabel) : undefined}
      aria-disabled={isBlocked ? 'true' : 'false'}
      aria-busy={loading ? 'true' : 'false'}
      disabled={isBlocked}
      style={{
        ...appButtonStyles.base,
        ...(isSidebarToggle ? appButtonStyles.sidebarToggleVariant : appButtonStyles.defaultVariant),
        width,
        height,
        backgroundColor,
        transform: `scale(${baseScale})`
      }}
    >
      <img
        src={resolvedIcon.src}
        alt=""
        aria-hidden="true"
        style={{
          ...appButtonStyles.icon,
          ...(resolvedIcon.isAntd ? appButtonStyles.antdIcon : appButtonStyles.localIcon),
          width: iconSize,
          height: iconSize
        }}
      />
    </button>
  ) as HTMLButtonElement;

  applyInlineStyle(button, safe.style);

  if (isSidebarToggle) {
    const syncSidebarToggleVisibility = (): void => {
      button.style.display = isSidebarToggleViewport() ? 'inline-flex' : 'none';
    };
    syncSidebarToggleVisibility();
    window.addEventListener('resize', syncSidebarToggleVisibility);
    window.addEventListener('orientationchange', syncSidebarToggleVisibility);
  }

  const insets = normalizeHitSlopInsets(safe.hitSlop);
  if (insets.top || insets.right || insets.bottom || insets.left) {
    button.style.backgroundClip = 'padding-box';
    button.style.borderStyle = 'solid';
    button.style.borderColor = 'transparent';
    button.style.borderTopWidth = `${insets.top}px`;
    button.style.borderRightWidth = `${insets.right}px`;
    button.style.borderBottomWidth = `${insets.bottom}px`;
    button.style.borderLeftWidth = `${insets.left}px`;
    button.style.marginTop = `${-insets.top}px`;
    button.style.marginRight = `${-insets.right}px`;
    button.style.marginBottom = `${-insets.bottom}px`;
    button.style.marginLeft = `${-insets.left}px`;
  }

  let pressActive = false;
  let massageIntervalRef: number | null = null;
  const stopMassage = (): void => {
    if (massageIntervalRef === null) return;
    window.clearInterval(massageIntervalRef);
    massageIntervalRef = null;
  };
  const setPressedVisualState = (pressed: boolean): void => {
    const base = appearanceDisabled ? 0.95 : 1;
    button.style.transform = `scale(${pressed ? base * pressedScale : base})`;
    button.style.opacity = pressed ? '0.6' : '1';
  };

  const handlePressIn = (event: ButtonPressEvent): void => {
    if (isBlocked || pressActive) {
      safe.onPressIn?.(event);
      return;
    }
    pressActive = true;
    setPressedVisualState(true);
    triggerPressHaptic();
    if (!safe.disableHapticOnPressOut) {
      massageIntervalRef = window.setInterval(triggerPressHaptic, 250);
    }
    safe.onPressIn?.(event);
  };

  const handlePressOut = (event: ButtonPressEvent): void => {
    const wasActive = pressActive;
    if (pressActive) {
      setPressedVisualState(false);
      pressActive = false;
    }
    if (wasActive && !safe.disableHapticOnPressOut) triggerPressHaptic();
    stopMassage();
    safe.onPressOut?.(event);
  };

  const isPressKey = (event: KeyboardEvent): boolean => event.key === 'Enter' || event.key === ' ';

  button.addEventListener('click', event => {
    if (isBlocked) return;
    onPress(event);
  });
  button.addEventListener('pointerdown', handlePressIn as EventListener);
  button.addEventListener('pointerup', handlePressOut as EventListener);
  button.addEventListener('pointercancel', handlePressOut as EventListener);
  button.addEventListener('pointerleave', handlePressOut as EventListener);
  button.addEventListener('blur', handlePressOut as EventListener);
  button.addEventListener('keydown', event => {
    if (!isPressKey(event)) return;
    handlePressIn(event);
  });
  button.addEventListener('keyup', event => {
    if (!isPressKey(event)) return;
    handlePressOut(event);
  });

  return button;
}

function createHeaderButton(options: HeaderButtonOptions): HTMLButtonElement {
  return createAppButton(options);
}

const appButtonStyles = ComponentStyleSheet.create({
  base: {
    border: 'none',
    borderRadius: 'var(--radius)',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
    cursor: 'pointer',
    minWidth: '40px',
    opacity: 1,
    transition: 'transform 140ms ease, opacity 140ms ease, background-color 140ms ease'
  },
  defaultVariant: {
    display: 'inline-flex',
    padding: '8px'
  },
  sidebarToggleVariant: {
    display: 'none',
    padding: 0,
    transformOrigin: 'center'
  },
  icon: {
    width: '18px',
    height: '18px'
  },
  localIcon: {
    objectFit: 'contain',
    display: 'block',
    pointerEvents: 'none',
    filter: 'brightness(0) invert(1)'
  },
  antdIcon: {
    objectFit: 'contain',
    display: 'block',
    pointerEvents: 'none',
    filter: 'none'
  }
});
