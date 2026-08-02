// Minimal JSX runtime for DOM-based TSX components (global script scope)
// ============================================================================

type JsxRuntimeChild = Node | string | number | boolean | null | undefined | JsxRuntimeChild[];
type JsxProps = Record<string, unknown> & { children?: JsxRuntimeChild | JsxRuntimeChild[] };

function appendJsxChild(parent: Node, child: JsxRuntimeChild): void {
  if (Array.isArray(child)) {
    child.forEach(inner => appendJsxChild(parent, inner));
    return;
  }
  if (child === null || child === undefined || typeof child === 'boolean') return;
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

function stylePropToKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function setJsxProp(element: HTMLElement, key: string, value: unknown): void {
  if (key === 'children') return;
  if (value === null || value === undefined || value === false) return;

  if (key === 'className' || key === 'class') {
    element.setAttribute('class', joinClassNames(value));
    return;
  }

  if (key === 'style' && value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value as Record<string, unknown>).forEach(([styleName, styleValue]) => {
      if (styleValue === null || styleValue === undefined) return;
      element.style.setProperty(stylePropToKebabCase(styleName), String(styleValue));
    });
    return;
  }

  if (key.startsWith('on') && typeof value === 'function') {
    element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    return;
  }

  if (value === true) {
    element.setAttribute(key, '');
    return;
  }

  if (!key.startsWith('aria-') && !key.startsWith('data-') && key in element) {
    try {
      (element as unknown as Record<string, unknown>)[key] = value;
      return;
    } catch {
      // Falls through to setAttribute for read-only/native mismatches.
    }
  }

  element.setAttribute(key, String(value));
}

function Fragment(props: { children?: JsxRuntimeChild | JsxRuntimeChild[] } = {}): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendJsxChild(fragment, props.children ?? []);
  return fragment;
}

function h(
  tag: string | ((props: JsxProps) => Node),
  props: JsxProps | null = null,
  ...children: JsxRuntimeChild[]
): Node {
  const safeProps = (props && typeof props === 'object') ? props : {};
  const normalizedChildren = [
    ...(Array.isArray(safeProps.children) ? safeProps.children : [safeProps.children]),
    ...children
  ];

  if (typeof tag === 'function') {
    return tag({ ...safeProps, children: normalizedChildren });
  }

  const element = document.createElement(tag);
  Object.entries(safeProps).forEach(([key, value]) => setJsxProp(element, key, value));
  normalizedChildren.forEach(child => appendJsxChild(element, child));
  return element;
}
