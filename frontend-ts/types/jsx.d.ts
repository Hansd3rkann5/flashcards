// JSX declarations for the custom DOM runtime (`h`/`Fragment`)
// ============================================================================

type JsxChild = Node | string | number | boolean | null | undefined | JsxChild[];
type JsxComponentProps = Record<string, unknown> & { children?: JsxChild | JsxChild[] };

declare function h(
  tag: keyof HTMLElementTagNameMap | ((props: JsxComponentProps) => Node),
  props?: JsxComponentProps | null,
  ...children: JsxChild[]
): Node;

declare function Fragment(props?: { children?: JsxChild | JsxChild[] }): DocumentFragment;

declare namespace JSX {
  type Element = Node;
  interface ElementChildrenAttribute {
    children: unknown;
  }
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}
