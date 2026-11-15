import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';

// Only the five brand letters respond; typing and canvas content remain stationary.
export function ProximityBrand() {
  const root = useRef<HTMLElement>(null);
  const frame = useRef(0);
  const enabled = useRef(false);
  function reset() {
    cancelAnimationFrame(frame.current);
    root.current?.querySelectorAll<HTMLElement>('.proximity-letter').forEach(letter => letter.style.setProperty('--letter-weight', '540'));
  }
  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { enabled.current = fine.matches && !reduced.matches; if (!enabled.current) reset(); };
    update();
    fine.addEventListener('change', update);
    reduced.addEventListener('change', update);
    return () => { fine.removeEventListener('change', update); reduced.removeEventListener('change', update); cancelAnimationFrame(frame.current); };
  }, []);
  function move(event: PointerEvent<HTMLElement>) {
    if (!enabled.current || event.pointerType !== 'mouse') return;
    const x = event.clientX, y = event.clientY;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const letters = Array.from(root.current?.querySelectorAll<HTMLElement>('.proximity-letter') || []);
      const weights = letters.map(letter => {
        const rect = letter.getBoundingClientRect();
        const distance = Math.hypot(x - rect.x - rect.width / 2, y - rect.y - rect.height / 2);
        return 540 + 220 * Math.max(0, 1 - distance / 64) ** 2;
      });
      letters.forEach((letter, index) => letter.style.setProperty('--letter-weight', String(Math.round(weights[index]))));
    });
  }
  return <b ref={root} className="proximity-brand" aria-label="Arasn" onPointerMove={move} onPointerLeave={reset}>
    {'Arasn'.split('').map((letter, index) => <span className="proximity-letter" aria-hidden="true" key={index} style={{ width: `${[.74, .4, .6, .55, .62][index]}em` }}>{letter}</span>)}
  </b>;
}
