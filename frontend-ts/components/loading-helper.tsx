// Global loading helper component
// ============================================================================

class LoadingHelperComponent implements LoadingHelperComponentLike {
  readonly overlayId: string;
  readonly labelId: string;
  readonly defaultMessage: string;
  private fallbackVisibleCount: number;
  private useLegacyOverlayApi: boolean;
  private prefersReducedMotion: boolean;

  constructor(options: LoadingHelperOptions = {}) {
    const safe = (options && typeof options === 'object') ? options : {};
    this.overlayId = String(safe.overlayId || 'appLoadingOverlay').trim() || 'appLoadingOverlay';
    this.labelId = String(safe.labelId || 'appLoadingLabel').trim() || 'appLoadingLabel';
    this.defaultMessage = String(safe.defaultMessage || 'Loading...').trim() || 'Loading...';
    this.fallbackVisibleCount = 0;
    this.useLegacyOverlayApi = false;
    this.prefersReducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.ensureOverlay();
  }

  private getOverlay(): HTMLElement | null {
    const overlay = el(this.overlayId);
    return overlay instanceof HTMLElement ? overlay : null;
  }

  private getLabel(): HTMLElement | null {
    const label = el(this.labelId);
    return label instanceof HTMLElement ? label : null;
  }

  private createOverlayElement(): HTMLDialogElement {
    const cardBaseStyle = this.prefersReducedMotion
      ? { ...loadingHelperStyles.loaderCard, ...loadingHelperStyles.loaderCardReducedMotion }
      : loadingHelperStyles.loaderCard;

    return (
      <dialog id={this.overlayId} aria-hidden="true" style={loadingHelperStyles.overlay}>
        <div role="status" aria-live="polite" aria-atomic="true" style={loadingHelperStyles.inner}>
          <div aria-hidden="true" style={loadingHelperStyles.loaderStack}>
            <span style={{ ...cardBaseStyle, ...loadingHelperStyles.loaderCardOne }} />
            <span style={{ ...cardBaseStyle, ...loadingHelperStyles.loaderCardTwo }} />
            <span style={{ ...cardBaseStyle, ...loadingHelperStyles.loaderCardThree }} />
          </div>
          <div id={this.labelId} style={loadingHelperStyles.label}>{this.defaultMessage}</div>
        </div>
      </dialog>
    ) as HTMLDialogElement;
  }

  private ensureOverlay(): void {
    const existing = this.getOverlay();
    if (existing) {
      // Keep the legacy overlay wiring so existing app flows stay intact.
      this.useLegacyOverlayApi = true;
      return;
    }

    const overlay = this.createOverlayElement();
    overlay.dataset.loadingHelperOverlay = '1';
    document.body.appendChild(overlay);
    this.useLegacyOverlayApi = false;
  }

  private showFallback(message?: string): void {
    const overlay = this.getOverlay();
    if (!overlay) return;
    this.fallbackVisibleCount += 1;
    this.setMessage(message);
    if (this.fallbackVisibleCount > 1) return;

    applyInlineStyle(overlay, loadingHelperStyles.overlayVisible);
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('open', '');
    document.body.classList.add('app-loading');
  }

  private hideFallback(force = false): void {
    const overlay = this.getOverlay();
    if (!overlay) return;
    if (force) this.fallbackVisibleCount = 0;
    else this.fallbackVisibleCount = Math.max(0, this.fallbackVisibleCount - 1);
    if (this.fallbackVisibleCount > 0) return;

    applyInlineStyle(overlay, loadingHelperStyles.overlayHidden);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeAttribute('open');
    document.body.classList.remove('app-loading');
  }

  setMessage(message = this.defaultMessage): void {
    const next = String(message || '').trim() || this.defaultMessage;
    if (this.useLegacyOverlayApi && typeof setAppLoadingLabel === 'function') {
      setAppLoadingLabel(next);
      return;
    }
    const label = this.getLabel();
    if (!label) return;
    label.textContent = next;
  }

  show(message = this.defaultMessage): void {
    const next = String(message || '').trim() || this.defaultMessage;
    if (this.useLegacyOverlayApi && typeof setAppLoadingState === 'function') {
      setAppLoadingState(true, next);
      return;
    }
    this.showFallback(next);
  }

  hide(): void {
    if (this.useLegacyOverlayApi && typeof setAppLoadingState === 'function') {
      setAppLoadingState(false);
      return;
    }
    this.hideFallback(false);
  }

  forceHide(): void {
    if (this.useLegacyOverlayApi && typeof setAppLoadingState === 'function') {
      const overlay = this.getOverlay();
      const isVisible = !!overlay && overlay.classList.contains('is-visible');
      if (!isVisible) return;
      for (let i = 0; i < 200; i += 1) {
        setAppLoadingState(false);
        const stillVisible = !!overlay && overlay.classList.contains('is-visible');
        if (!stillVisible) break;
      }
      return;
    }
    this.hideFallback(true);
  }

  async withTask<T>(message: string, task: (() => Promise<T>) | (() => T)): Promise<T> {
    this.show(message);
    try {
      return await Promise.resolve(task());
    } finally {
      this.hide();
    }
  }
}

function initializeLoadingHelperComponent(options: LoadingHelperOptions = {}): LoadingHelperComponentLike {
  const helper = new LoadingHelperComponent(options);
  window.loadingHelper = helper;
  window.showGlobalLoading = (message?: string) => helper.show(message);
  window.hideGlobalLoading = () => helper.hide();
  window.setGlobalLoadingMessage = (message?: string) => helper.setMessage(message);
  return helper;
}

const loadingHelperStyles = ComponentStyleSheet.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 120,
    margin: 0,
    width: '100dvw',
    maxWidth: 'none',
    height: '100dvh',
    maxHeight: 'none',
    padding: 0,
    border: 'none',
    display: 'block',
    background: 'rgba(7, 12, 24, 0.56)',
    backdropFilter: 'blur(10px)',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.22s ease'
  },
  overlayVisible: {
    opacity: 1,
    pointerEvents: 'auto'
  },
  overlayHidden: {
    opacity: 0,
    pointerEvents: 'none'
  },
  inner: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    margin: 0,
    transform: 'translate(-50%, -50%)',
    minWidth: '176px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 18px 14px',
    borderRadius: '18px',
    border: '1px solid rgba(70, 98, 146, 0.65)',
    background: 'linear-gradient(180deg, rgba(19, 29, 52, 0.95) 0%, rgba(14, 22, 42, 0.95) 100%)',
    boxShadow: '0 16px 34px rgba(2, 7, 18, 0.54)'
  },
  loaderStack: {
    position: 'relative',
    width: '124px',
    height: '132px',
    transform: 'translateY(-30px)'
  },
  loaderCard: {
    position: 'absolute',
    left: '25%',
    top: '25%',
    width: '76px',
    height: '104px',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'linear-gradient(165deg, #e85f82 8%, #c155ba 52%, #48b4ee 100%)',
    boxShadow: '0 10px 24px rgba(20, 17, 52, 0.44)',
    animation: 'app-loader-card-pulse 1.05s ease-in-out infinite'
  },
  loaderCardOne: {
    '--tx': '-30px',
    '--ty': '-26px',
    '--rot': '-15deg',
    transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot))',
    zIndex: 3,
    animationDelay: '0s'
  },
  loaderCardTwo: {
    '--tx': '9px',
    '--ty': '-12px',
    '--rot': '14deg',
    transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot))',
    zIndex: 2,
    animationDelay: '0.18s',
    filter: 'saturate(0.96)'
  },
  loaderCardThree: {
    '--tx': '-1px',
    '--ty': '22px',
    '--rot': '43deg',
    transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot))',
    zIndex: 1,
    animationDelay: '0.36s',
    filter: 'saturate(0.92)'
  },
  loaderCardReducedMotion: {
    animation: 'none'
  },
  label: {
    marginTop: '-6px',
    textAlign: 'center',
    color: '#dbe7ff',
    fontWeight: 600,
    letterSpacing: '0.01em',
    fontSize: 'var(--font-size-small, 0.8rem)',
    lineHeight: 1.35
  }
});

/*
 * Default component pattern:
 * Keep local style definitions in `ComponentStyleSheet.create(...)`.
 * Extend these entries instead of sprinkling ad-hoc inline style literals.
 */
