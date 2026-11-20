import { useEffect, useRef, useState, type Ref } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Search, X } from "../../LagoonIcons";
import { RecordList } from "./RecordList";
import type { RecordRow, RecordSession } from "./session";

export function filterRecords(rows: RecordRow[], query: string) {
  const needle = query.trim().normalize("NFC").toLowerCase();
  return needle ? rows.filter(row => `${row.title ?? ""} ${row.text}`.normalize("NFC").toLowerCase().includes(needle)) : rows;
}

export function RecordSearch({ query, setQuery, inputRef, activeResult }: { query: string; setQuery(value: string): void; inputRef?: Ref<HTMLInputElement>; activeResult?: string }) {
  return <label className="xigra-record-search"><Search size={16} aria-hidden="true" />
    <input ref={inputRef} role={activeResult ? "combobox" : undefined} aria-expanded={activeResult ? true : undefined} aria-controls={activeResult ? "compact-record-results" : undefined} aria-activedescendant={activeResult} aria-autocomplete={activeResult ? "list" : undefined} type="search" aria-label="搜索便签" placeholder="搜索便签" value={query} onChange={event => setQuery(event.target.value)} />
  </label>;
}

export function GlobalRecordSearch({ session, open, setOpen, onSelect, blocked }: { session: RecordSession; onSelect(): void; blocked: boolean; open: boolean; setOpen(value: boolean): void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const rows = filterRecords(session.rows, query);
  const [active, setActive] = useState(0);
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    popup.current?.querySelectorAll('li button')[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const select = (id: string) => { if (!blocked && !session.volatile && !session.composing) { close(false); onSelect(); session.open(id); } };
  function close(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }
  return <Dialog.Root open={open} onOpenChange={close}>
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop record-search-backdrop" />
      <Dialog.Popup ref={popup} className="modal xigra-record-dialog" initialFocus={input} finalFocus={false} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); input.current?.focus(); setActive(value => Math.max(0, Math.min(rows.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter' && event.target === input.current && rows[active]) {
          event.preventDefault(); select(rows[active].id);
        }
      }}>
        <Dialog.Title>查找便笺</Dialog.Title>
        <Dialog.Close className="modal-close icon-button" aria-label="关闭查找"><X size={18} /></Dialog.Close>
        <RecordSearch query={query} setQuery={setQuery} inputRef={input} activeResult={rows[active] ? `search-result-${rows[active].id}` : undefined} />
        {rows.length ? <RecordList rows={rows} current={session.id} disabled={blocked || session.volatile || session.composing} onSelect={select} activeIndex={active} />
          : <p className="xigra-empty">{query.trim() ? "没有找到匹配的便笺。" : "写下第一张便笺后，会在这里看到它。"}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
