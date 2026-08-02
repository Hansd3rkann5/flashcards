// Panel component
// ============================================================================

/**
 * Encapsulates one panel DOM node and its active state.
 */
class PanelComponent implements PanelComponentLike {
  readonly element: HTMLElement | null;
  readonly index: number;
  readonly id: string;

  constructor(element: HTMLElement | null, index = 0) {
    this.element = element instanceof HTMLElement ? element : null;
    this.index = toSafeInt(index, 0);
    this.id = this.element?.id || `panel-${this.index}`;
  }

  setActive(active: boolean): void {
    if (!this.element) return;
    const isActive = !!active;
    this.element.classList.toggle('is-active-panel', isActive);
    this.element.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    this.element.dataset.panelActive = isActive ? '1' : '0';
    applyInlineStyle(this.element, isActive ? panelStyles.active : panelStyles.inactive);
  }
}

const panelStyles = ComponentStyleSheet.create({
  active: {},
  inactive: {}
});
