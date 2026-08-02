import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  hasPotentialMathContent,
  markdownToHtml,
  normalizeTextAlign,
  postProcessRichContent,
  postProcessRichContentSync
} from '../../lib/rich-text';

interface RichTextContentProps {
  id?: string;
  className?: string;
  content?: string;
  textAlign?: string;
}

export function RichTextContent({
  id,
  className = '',
  content = '',
  textAlign = 'left'
}: RichTextContentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => markdownToHtml(content || ''), [content]);
  const alignClassName = `rich-align-${normalizeTextAlign(textAlign)}`;
  const containsMath = useMemo(() => hasPotentialMathContent(content || ''), [content]);
  const [isProcessed, setIsProcessed] = useState(() => !containsMath);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handledImmediately = postProcessRichContentSync(container);
    setIsProcessed(!containsMath || handledImmediately);
    if (!containsMath || handledImmediately) return;
    let active = true;
    void postProcessRichContent(container).then(() => {
      if (!active) return;
      setIsProcessed(true);
    });
    return () => {
      active = false;
    };
  }, [html, containsMath]);

  return (
    <div
      id={id}
      ref={containerRef}
      className={['rich-content', alignClassName, className].filter(Boolean).join(' ')}
      style={containsMath && !isProcessed ? styles.pending : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const styles = {
  pending: {
    opacity: 0
  }
} as const;
