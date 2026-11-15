import { useRef, useState, type Ref } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Search, X } from "../../LagoonIcons";
import { RecordList } from "./RecordList";
import type { RecordRow, RecordSession } from "./session";

export function filterRecords(rows: RecordRow[], query: string) {
  const needle = query.trim().normalize("NFC").toLowerCase();
  return needle ? rows.filter(row => `${row.title ?? ""} ${row.text}`.normalize("NFC").toLowerCase().includes(needle)) : rows;
}

export function RecordSearch({ query, setQuery, inputRef }: { query: string; setQuery(value: string): void; inputRef?: Ref<HTMLInputElement> }) {
  return <label className="xigra-record-search"><Search size={16} aria-hidden="true" />
    <input ref={inputRef} type="search" aria-label="搜索便笺正文" placeholder="搜索便笺正文" value={query} onChange={event => setQuery(event.target.value)} />
  </label>;
}

export function CompactRecordSearch({ session, open, setOpen }: { session: RecordSession; open: boolean; setOpen(value: boolean): void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const rows = filterRecords(session.rows, query);
  function close(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }
  return <Dialog.Root open={open} onOpenChange={close}>
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop" />
      <Dialog.Popup className="modal xigra-record-dialog" initialFocus={input} finalFocus={false}>
        <Dialog.Title>查找便笺</Dialog.Title>
        <Dialog.Close className="modal-close icon-button" aria-label="关闭查找"><X size={18} /></Dialog.Close>
        <RecordSearch query={query} setQuery={setQuery} inputRef={input} />
        {rows.length ? <RecordList rows={rows} current={session.id} disabled={session.volatile} onSelect={id => { close(false); session.open(id); }} />
          : <p className="xigra-empty">{query.trim() ? "没有找到匹配的便笺。" : "写下第一张便笺后，会在这里看到它。"}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
