import { useEffect } from 'react';

// Semantic, interruptible icon gestures. No motion is attached to canvas content or OS windows.
export function LagoonMotion() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const running = new Set<Animation>();
    const quietControls = '.file-station, .file-preview, .note-handle, .lagoon-rail, .header-actions, .xigra-shell, .xigra-record-workspace, .modal, .command-popup, .file-popover';
    const current = new WeakMap<Element, Animation>();
    const play = (node: Element, frames: Keyframe[], duration: number) => {
      current.get(node)?.cancel();
      const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
      current.set(node, animation); running.add(animation);
      animation.onfinish = animation.oncancel = () => running.delete(animation);
    };
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      const button = (event.target as Element).closest('button');
      if (!button || button.contains(event.relatedTarget as Node | null) || button.disabled ||
          button.closest(quietControls)) return;
      const svg = button.querySelector('svg'); if (!svg) return;
      const name = svg.getAttribute('data-lagoon-icon') || svg.getAttribute('class') || '';
      if (name.includes('tray')) {
        const mouth = svg.querySelector('path:last-child');
        if (mouth) play(mouth, [{transform:'translateY(0)'},{transform:'translateY(-2px)',offset:.45},{transform:'translateY(0)'}], 230);
      } else if (name.includes('pen') || name.includes('pencil')) {
        play(svg,[{transform:'rotate(0)'},{transform:'translate(1px,-2px) rotate(-14deg)',offset:.5},{transform:'rotate(0)'}],230);
      } else if (name.includes('search')) {
        play(svg,[{transform:'rotate(0)'},{transform:'rotate(-16deg) scale(1.08)',offset:.45},{transform:'rotate(0) scale(1)'}],220);
      } else if (name.includes('trash')) {
        const lid=svg.querySelector('path'); if(lid) play(lid,[{transform:'translateY(0)'},{transform:'translateY(-1.5px)',offset:.5},{transform:'translateY(0)'}],180);
      } else if (name.includes('plus') || name.includes('note')) {
        play(svg,[{transform:'translateY(0)'},{transform:'translateY(-2px) rotate(6deg)',offset:.5},{transform:'translateY(0) rotate(0)'}],220);
      } else {
        play(svg,[{transform:'scale(1)'},{transform:'scale(1.1)',offset:.5},{transform:'scale(1)'}],180);
      }
    };
    const click = (event: MouseEvent) => {
      if (!event.detail || reduced.matches) return;
      const button=(event.target as Element).closest('button'); const svg=button?.querySelector('svg');
      if(svg && !button?.disabled && !button?.closest(quietControls))
        play(svg,[{transform:'scale(.83)'},{transform:'scale(1.08)',offset:.65},{transform:'scale(1)'}],180);
    };
    document.addEventListener('pointerover', hover); document.addEventListener('click',click);
    const stop=()=>{if(reduced.matches) for(const a of running) a.cancel();};reduced.addEventListener('change',stop);
    return () => {document.removeEventListener('pointerover',hover);document.removeEventListener('click',click);reduced.removeEventListener('change',stop);for(const a of running) a.cancel();};
  },[]);
  return null;
}
