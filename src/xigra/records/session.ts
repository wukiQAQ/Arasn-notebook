import { useEffect, useRef, useState } from "react";
import { type BoardClient, type Item, type TextValue, type NodeValue, uid } from "../../board";

const isRecord = (value: unknown): value is TextValue | NodeValue => Boolean(value && typeof value === "object" && "type" in value && ["text", "node"].includes(String(value.type)));

export type Selection = { start: number; end: number; direction: "forward" | "backward" | "none" };
export type RecordRow = { id: string; text: string; title?: string };

export function useRecordSession(client: BoardClient, items: Record<string, Item>) {
  const [id, setId] = useState("");
  const [buffer, setBuffer] = useState("");
  const [composition, setComposition] = useState<string | null>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [lastDeletion, setLastDeletion] = useState<{ id: string; value: TextValue | NodeValue }>();
  const active = useRef("");
  const draft = useRef("");
  const composing = useRef(false);
  const initialized = useRef(false);
  const carets = useRef(new Map<string, Selection>());
  const rows: RecordRow[] = Object.entries(items).flatMap(([key, item]) =>
    (item.value?.type === "text" || item.value?.type === "node") ? [{ id: key, text: item.value.text, title: item.value.title }] : []);
  const byId = new Map(rows.map(row => [row.id, row]));
  const recent = client.recentRecords.flatMap(key => byId.get(key) ?? []);
  const pinned = client.pinnedRecords.flatMap(key => byId.get(key) ?? []);
  const order = [...recent, ...rows.filter(row => !client.recentRecords.includes(row.id))];
  const record = byId.get(id);
  const deletionState = lastDeletion && client.recordDeletionState(lastDeletion.id);

  useEffect(() => {
    if (deletionState === "failed") setLastDeletion(undefined);
  }, [deletionState]);

  function focus() { setFocusVersion(version => version + 1); }

  function open(key: string) {
    if (composing.current || (!client.ready && draft.current.trim())) return;
    if (key && !["text", "node"].includes(client.view()[key]?.value?.type ?? "")) return;
    active.current = key;
    setId(key);
    draft.current = "";
    setBuffer("");
    if (key) client.rememberRecord(key);
    else carets.current.delete("");
    focus();
  }

  function write(text: string, selection?: Selection, title?: string) {
    const key = active.current;
    if (selection) carets.current.set(key, selection);
    if (composing.current) {
      setComposition(text);
      return;
    }
    const current = key ? client.view()[key]?.value : null;
    if (!client.ready || (!isRecord(current) && (!text.trim() && !title?.trim()))) {
      draft.current = text;
      setBuffer(text);
      return;
    }
    if (isRecord(current) && current.text === text && (title === undefined || current.title === title)) return;
    const noteId = isRecord(current) ? key : uid();
    const count = rows.length;
    client.edit(noteId, isRecord(current) ? { ...current, text, ...(title !== undefined ? { title } : {}) } : {
      type: "text", text, ...(title !== undefined ? { title } : {}), color: "#263449",
      x: 100 + (count % 4) * 330,
      y: 100 + (Math.floor(count / 4) % 4) * 190,
    });
    const previousCaret = carets.current.get(key);
    if (previousCaret) carets.current.set(noteId, previousCaret);
    active.current = noteId;
    setId(noteId);
    draft.current = "";
    setBuffer("");
    client.rememberRecord(noteId);
  }

  useEffect(() => {
    if (!client.ready || initialized.current) return;
    initialized.current = true;
    if (draft.current.trim()) write(draft.current);
    else if (!draft.current && !active.current && client.restoredRecordId) open(client.restoredRecordId);
  }, [client.ready]);

  function remove(key: string) {
    const value = client.view()[key]?.value;
    if (!client.ready || composing.current || !isRecord(value)) return;
    setLastDeletion({ id: key, value });
    client.edit(key, null);
    carets.current.delete(key);
    if (active.current === key) open("");
  }

  function restoreDeleted() {
    if (!lastDeletion || composing.current || client.recordDeletionState(lastDeletion.id) !== "deleted") return;
    setLastDeletion(undefined);
    const key = uid();
    client.edit(key, lastDeletion.value);
    open(key);
  }

  return {
    id, record, title: record?.title ?? "", rename: (title: string) => write(isRecord(client.view()[active.current]?.value) ? (client.view()[active.current].value as TextValue).text : buffer, undefined, title), rows: order, recent, pinned, text: composition ?? record?.text ?? buffer,
    volatile: Boolean(!client.ready && buffer.trim()), composing: composition !== null,
    hasVolatileText: () => Boolean(draft.current.trim()),
    focusVersion, focus, open, write, remove,
    deletion: lastDeletion && deletionState !== "failed" ? { text: lastDeletion.value.text, confirmed: deletionState === "deleted" } : undefined,
    restoreDeleted, dismissDeletion: () => setLastDeletion(undefined),
    rememberSelection: (selection: Selection) => carets.current.set(active.current, selection),
    selection: () => carets.current.get(active.current),
    startComposition(text: string) { composing.current = true; setComposition(text); },
    endComposition(text: string, selection: Selection) { composing.current = false; setComposition(null); write(text, selection); },
  };
}

export type RecordSession = ReturnType<typeof useRecordSession>;
