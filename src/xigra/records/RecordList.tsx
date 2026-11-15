import type { RecordRow } from "./session";

export const recordTitle = (text: string) => text.split("\n").find(line => line.trim())?.trim() || "未命名便笺";
const recordPreview = (text: string) => text.trim().split("\n").slice(1).join(" ").trim().replace(/\s+/g, " ").slice(0, 100);

export function RecordList({ rows, current, onSelect, disabled = false, compact = false }: {
  rows: RecordRow[]; current: string; onSelect(id: string): void; disabled?: boolean; compact?: boolean;
}) {
  return <ul className={compact ? "xigra-record-list compact" : "xigra-record-list"}>
    {rows.map(({ id, text, title }) => {
      const preview = compact ? "" : title?.trim() ? text.trim().replace(/\s+/g, " ").slice(0, 100) : recordPreview(text) || '暂无更多正文';
      return <li key={id}>
        <button type="button" aria-current={current === id ? "true" : undefined} disabled={disabled} onClick={() => onSelect(id)}>
          <strong>{title?.trim() || recordTitle(text)}</strong>
          {preview && <small>{preview}</small>}
        </button>
      </li>;
    })}
  </ul>;
}
