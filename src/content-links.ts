import type { CanvasNodeValue, ContentRef, Item, ManagedFile } from "./board";

export function resolveContent(items: Record<string, Item>, ref: ContentRef, files: ManagedFile[] = []) {
  if (ref.kind === "file") {
    const file = files.find(file => file.id === ref.id);
    return file ? { state: file.status === "purged" ? "purged" as const : file.deleted_at ? "trash" as const : "ready" as const, file } : { state: "missing" as const };
  }
  const item = items[ref.id];
  const value = item?.value;
  return value?.type === "text" || value?.type === "node"
    ? { state: "ready" as const, text: value.text }
    : { state: item?.value === null ? "deleted" as const : "missing" as const };
}

export function nodesForContent(items: Record<string, Item>, roomId: string, ref: ContentRef) {
  return Object.entries(items).flatMap(([id, item]): { id: string; value: CanvasNodeValue }[] => {
    const value = item.value;
    return value?.type === "canvas-node" && value.roomId === roomId &&
      value.contentRef.kind === ref.kind && value.contentRef.id === ref.id ? [{ id, value }] : [];
  });
}

export function relatedContent(items: Record<string, Item>, roomId: string, recordId: string) {
  return Object.entries(items).flatMap(([id, item]) => {
    const value = item.value;
    return value?.type === "content-link" && value.roomId === roomId && value.recordId === recordId
      ? [{ id, targetRef: value.targetRef }] : [];
  });
}
