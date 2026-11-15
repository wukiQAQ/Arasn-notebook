import { useLayoutEffect, useRef } from "react";
import type { RecordSession, Selection } from "./session";

function selection(element: HTMLTextAreaElement): Selection {
  return { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection };
}

export function RecordEditor({ session, className = "quick-input", focusContext }: { session: RecordSession; className?: string; focusContext?: string }) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element || !element.getClientRects().length) return;
    const caret = session.selection();
    element.focus({ preventScroll: true });
    if (caret) element.setSelectionRange(Math.min(caret.start, element.value.length), Math.min(caret.end, element.value.length), caret.direction);
    else element.setSelectionRange(element.value.length, element.value.length);
  }, [session.focusVersion, focusContext]);

  return <textarea
    ref={input} className={className} aria-label="便笺文字" maxLength={10000}
    value={session.text} placeholder="把刚想到的，写在这里。" spellCheck={false}
    onChange={event => session.write(event.currentTarget.value, selection(event.currentTarget))}
    onSelect={event => session.rememberSelection(selection(event.currentTarget))}
    onBlur={event => session.rememberSelection(selection(event.currentTarget))}
    onCompositionStart={event => session.startComposition(event.currentTarget.value)}
    onCompositionEnd={event => session.endComposition(event.currentTarget.value, selection(event.currentTarget))}
  />;
}
