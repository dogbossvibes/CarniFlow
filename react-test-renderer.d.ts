// Minimale Typdeklaration für react-test-renderer (nur Testnutzung; das Paket
// liefert unter React 19 keine eigenen Typen). Keine neue Dependency.
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestInstance {
    findByType(type: unknown): ReactTestInstance;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
    props: Record<string, any>;
  }
  export interface ReactTestRenderer {
    root: ReactTestInstance;
    unmount(): void;
    update(element: ReactElement): void;
  }
  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): void;

  const _default: { create: typeof create; act: typeof act };
  export default _default;
}
