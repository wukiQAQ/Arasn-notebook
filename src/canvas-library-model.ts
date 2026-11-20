import type { Item, TextValue } from "./board";
import type { Camera, CanvasOptions } from "./topology";

export type CanvasType = "workspace" | "relation";
export type CanvasEntry = {
  id: string;
  type: CanvasType;
  name: string;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  deletedAt?: string;
  viewport?: Camera & { roomId: string };
  options?: CanvasOptions;
  missingReferences?: number;
};
export type Catalog = { version: 1; roomId: string; boards: CanvasEntry[] };
export const canvasLabel = { workspace: "自由工作页", relation: "关系画布" };

export function canvasItems(items: Record<string, Item>, id: string) {
  return Object.entries(items).filter(([, item]) => item.value && "canvasId" in item.value && item.value.canvasId === id);
}

export function placedNote(value: Item["value"] | undefined, items: Record<string, Item>): TextValue | undefined {
  if (value?.type !== "free-note") return;
  const record = items[value.recordId]?.value;
  const { recordId: _, canvasId: _canvas, ...style } = value;
  return { ...style, type: "text", text: record?.type === "text" || record?.type === "node" ? record.text : "原始便签不可用",
    title: record?.type === "text" || record?.type === "node" ? record.title : undefined };
}

export type CanvasShare = {
  id: string;
  host: string;
  mode: "view" | "edit";
  link: string;
  includeNotes: boolean;
  includeFiles: boolean;
  viewers: number;
};
