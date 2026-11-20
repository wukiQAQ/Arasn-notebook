import type { RecordRow } from "./session";

export const recordTitle = (text: string) => text.split("\n").find(line => line.trim())?.trim() || "未命名便笺";
const recordPreview = (text: string) => text.trim().split("\n").slice(1).join(" ").trim().replace(/\s+/g, " ").slice(0, 100);

export function RecordList({ rows, current, onSelect, disabled = false, compact = false, activeIndex }: {
  rows: RecordRow[]; current: string; onSelect(id: string): void; disabled?: boolean; compact?: boolean; activeIndex?: number;
}) {
  return <ul id={activeIndex === undefined ? undefined : "compact-record-results"} role={activeIndex === undefined ? undefined : "listbox"} aria-label={activeIndex === undefined ? undefined : "搜索结果"} className={compact ? "xigra-record-list compact" : "xigra-record-list"}>
    {rows.map(({ id, text, title }, index) => {
      const label = title?.trim() || recordTitle(text);
      const preview = compact ? "" : title?.trim() ? text.trim().replace(/\s+/g, " ").slice(0, 100) : recordPreview(text);
      return <li key={id} role={activeIndex === undefined ? undefined : "presentation"}>
        <button type="button" id={activeIndex === undefined ? undefined : `search-result-${id}`} role={activeIndex === undefined ? undefined : "option"} aria-selected={activeIndex === undefined ? undefined : activeIndex === index} data-search-active={activeIndex === index || undefined} aria-current={current === id ? "true" : undefined} disabled={disabled} onClick={() => onSelect(id)}>
          <strong title={compact ? label : undefined}>{label}</strong>
          {preview && <small>{preview}</small>}
        </button>
      </li>;
    })}
  </ul>;
}
