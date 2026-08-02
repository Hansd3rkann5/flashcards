// Panel view manager
// ============================================================================

/**
 * Central panel-navigation component for the current vanilla app shell.
 */
class PanelViewManager {
  readonly trackId: string;
  readonly exchangeViewIndex: number;
  readonly hideSidebarViewIndex: number;
  currentView: number;
  track: HTMLElement | null;
  panels: PanelComponentLike[];

  constructor(options: PanelViewManagerOptions = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    this.trackId = String(opts.trackId || 'track').trim() || 'track';
    this.exchangeViewIndex = toSafeInt(opts.exchangeViewIndex, 4);
    this.hideSidebarViewIndex = toSafeInt(opts.hideSidebarViewIndex, 3);
    this.currentView = 0;
    this.track = null;
    this.panels = [];
  }

  ensurePanels(): void {
    const track = el(this.trackId);
    this.track = track instanceof HTMLElement ? track : null;
    if (!this.track) {
      this.panels = [];
      return;
    }
    const panelElements = Array.from(this.track.querySelectorAll(':scope > .panel'));
    this.panels = panelElements.map((panelElement, index) => {
      return new PanelComponent(panelElement instanceof HTMLElement ? panelElement : null, index);
    });
  }

  getPanelCount(): number {
    this.ensurePanels();
    return Math.max(1, this.panels.length || 1);
  }

  clampStep(step: number): number {
    const safeStep = toSafeInt(step, 0);
    const maxIndex = this.getPanelCount() - 1;
    return Math.max(0, Math.min(maxIndex, safeStep));
  }

  syncSidebarHiddenState(step = this.currentView): void {
    const studySection = el('studySessionSection');
    const hideForStudy = step === 2 && !!studySection && !studySection.classList.contains('hidden');
    const hideSidebar = step === this.hideSidebarViewIndex || hideForStudy;
    document.body.classList.toggle('sidebar-hidden', hideSidebar);
    if (hideSidebar) document.body.classList.remove('sidebar-open');
  }

  updateTrackTransform(step = this.currentView): void {
    if (!this.track) return;
    const panelCount = Math.max(1, this.panels.length || 1);
    this.track.style.transform = `translateX(${-100 * step / panelCount}%)`;
  }

  updatePanelActiveStates(step = this.currentView): void {
    this.panels.forEach((panel, index) => {
      panel.setActive(index === step);
    });
  }

  setView(step = 0): number {
    this.ensurePanels();
    if (!this.track) return this.currentView;

    const previousStep = toSafeInt(this.currentView, 0);
    const safeStep = this.clampStep(step);
    const shouldJumpWithoutSlide = safeStep === this.exchangeViewIndex || previousStep === this.exchangeViewIndex;

    document.body.classList.toggle('exchange-only-view', safeStep === this.exchangeViewIndex);
    if (shouldJumpWithoutSlide) this.track.classList.add('view-jump');

    this.currentView = safeStep;
    this.updateTrackTransform(safeStep);
    this.updatePanelActiveStates(safeStep);

    if (shouldJumpWithoutSlide) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.track?.classList.remove('view-jump');
        });
      });
    }

    if (safeStep !== this.hideSidebarViewIndex) {
      document.querySelector('#editorPanel .editor-shell')?.classList.remove('sidebar-open');
    }
    if (safeStep !== this.exchangeViewIndex) {
      document.body.classList.remove('content-exchange-open');
    }
    this.syncSidebarHiddenState(safeStep);
    return safeStep;
  }
}

function createPanelViewManager(options: PanelViewManagerOptions = {}): PanelViewManager {
  return new PanelViewManager(options);
}

(window as unknown as { createPanelViewManager: typeof createPanelViewManager }).createPanelViewManager = createPanelViewManager;
