import { useEffect, useRef, useState } from 'react';

/**
 * Shows a rendered invoice (HTML string) at true A4 width, scaled down to fit the screen —
 * so phones see the whole page, exactly as it prints.
 */
export function InvoicePreview({ html, thermal, className }: { html: string; thermal?: boolean; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const base = thermal ? 320 : 820;
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1100);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / base)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [base]);

  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const measure = () => {
      const b = f.contentDocument?.body;
      const h = b ? Math.max(b.scrollHeight, b.offsetHeight) : 0;
      if (h) setHeight(h + 8);
    };
    f.addEventListener('load', measure);
    const t = setTimeout(measure, 300);
    return () => {
      f.removeEventListener('load', measure);
      clearTimeout(t);
    };
  }, [html]);

  return (
    <div ref={wrap} className={className}>
      <div style={{ height: height * scale, overflow: 'hidden' }}>
        <iframe
          ref={frame}
          title="Invoice preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{ width: base, height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff' }}
        />
      </div>
    </div>
  );
}
