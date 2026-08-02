// DOM helpers for frontend TS components (global script scope)
// ============================================================================

declare const el: PanelSelectorFn;
type CssPrimitive = string | number | null | undefined;
type StyleLike = Record<string, CssPrimitive>;
type AppStyleSheetMap = Record<string, StyleLike>;

function toSafeInt(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(numeric);
}

function classTokens(value: unknown): string[] {
  return String(value || '')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function joinClassNames(...values: unknown[]): string {
  return values
    .flatMap(value => classTokens(value))
    .join(' ');
}

function applyClassNames(node: Element, ...values: unknown[]): void {
  values.forEach(value => {
    classTokens(value).forEach(token => node.classList.add(token));
  });
}

function applyInlineStyle(node: HTMLElement, style: StyleLike | undefined): void {
  if (!node || !style || typeof style !== 'object') return;
  Object.entries(style).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    node.style.setProperty(stylePropToKebabCase(key), String(value));
  });
}

const ComponentStyleSheet = {
  create<T extends AppStyleSheetMap>(styles: T): T {
    return styles;
  }
};
