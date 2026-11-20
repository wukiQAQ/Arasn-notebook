const { randomUUID } = require("node:crypto");
const { validFreeViewport, validTopologyViewport } = require("../server.cjs");

const validNodeTypes = types => Array.isArray(types) && types.length <= 100 &&
  types.every(type => type && typeof type === "object" &&
    Object.keys(type).every(key => ["id", "name", "icon", "color", "description"].includes(key)) &&
    typeof type.id === "string" && /^[a-f0-9]{32}$/.test(type.id) &&
    typeof type.name === "string" && type.name.trim() === type.name && type.name.length > 0 && type.name.length <= 40 &&
    ["note", "question", "idea", "task", "file", "folder", "target", "bookmark", "calendar"].includes(type.icon) &&
    typeof type.color === "string" && /^#[a-f0-9]{6}$/i.test(type.color) &&
    (type.description === undefined || (typeof type.description === "string" && type.description.length <= 160))) &&
  new Set(types.map(type => type.id)).size === types.length;
const validCanvasOptions = value => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every(key => ["roomId", "grid", "snap", "minimap", "wheel", "nodeDisplay", "nodeTypes"].includes(key)) &&
  typeof value.roomId === "string" && value.roomId.length > 0 &&
  ["grid", "snap", "minimap"].every(key => typeof value[key] === "boolean") &&
  ["auto", "zoom", "pan"].includes(value.wheel) &&
  (value.nodeDisplay === undefined || ["detailed", "compact"].includes(value.nodeDisplay)) &&
  (value.nodeTypes === undefined || validNodeTypes(value.nodeTypes));
const objectTypes = {
  workspace: ["free-note", "free-file", "stroke"],
  relation: ["canvas-node", "canvas-edge"],
};
const valuesOf = (state, id) => Object.entries(state.items)
  .filter(([, item]) => item.value?.canvasId === id)
  .map(([key, item]) => ({ id: key, value: item.value }));

function cleanName(name, type) {
  if (typeof name !== "string" || /[\u0000-\u001f\u007f]/u.test(name) || name.length > 100)
    throw new Error("请输入 100 字以内的画布名称");
  return name.trim() || (type === "workspace" ? "未命名工作页" : "未命名关系图");
}

function metadata(type, name, id = randomUUID()) {
  if (!Object.hasOwn(objectTypes, type)) throw new Error("画布类型无效");
  const now = new Date().toISOString();
  return { id, type, name: cleanName(name, type), createdAt: now, updatedAt: now };
}

function scope(catalog, value) {
  if (!value?.canvasId || !catalog) return;
  const canvas = catalog.boards.find(entry => entry.id === value.canvasId);
  if (!canvas || canvas.deletedAt || !objectTypes[canvas.type].includes(value.type))
    throw new Error("画布已移至回收站或对象类型不匹配");
}

function viewportFor(type, camera, roomId) {
  const result = { roomId, x: camera?.x, y: camera?.y, zoom: camera?.zoom };
  return (type === "workspace" ? validFreeViewport : validTopologyViewport)(result) ? result : undefined;
}

function duplicate(objects, canvas, roomId) {
  if (!Array.isArray(objects) || objects.length > 5000) throw new Error("画布对象数量超出限制");
  const ids = new Map();
  for (const entry of objects) {
    if (!entry || typeof entry.id !== "string" || !/^[a-f0-9-]{32,36}$/.test(entry.id) || ids.has(entry.id) ||
        !objectTypes[canvas.type].includes(entry.value?.type)) throw new Error("画布对象格式无效");
    ids.set(entry.id, randomUUID());
  }
  return objects.map(({ id, value }) => {
    const scoped = { ...value, canvasId: canvas.id };
    if ("roomId" in value || value.type !== "stroke" && value.type !== "free-note") scoped.roomId = roomId;
    if (value.type === "canvas-edge") {
      scoped.fromNodeId = ids.get(value.fromNodeId);
      scoped.toNodeId = ids.get(value.toNodeId);
    }
    return { id: ids.get(id), value: scoped };
  }).sort((a, b) => Number(a.value.type === "canvas-edge") - Number(b.value.type === "canvas-edge"));
}

function references(objects) {
  const unique = new Map();
  for (const { value } of objects) {
    const ref = value.type === "free-note" ? { kind: "record", id: value.recordId } : value.contentRef;
    if (ref) unique.set(ref.kind + ":" + ref.id, ref);
  }
  return [...unique.values()];
}

function packageResources(list, references, kind) {
  if (list === undefined) return new Map();
  const allowed = new Set(references.filter(ref => ref.kind === kind).map(ref => ref.id));
  if (!Array.isArray(list) || list.length > allowed.size) throw new Error("画布包资源列表无效");
  const result = new Map();
  for (const item of list) {
    if (!item || !allowed.has(item.id) || result.has(item.id)) throw new Error("画布包资源引用无效");
    result.set(item.id, item);
  }
  return result;
}

module.exports = { cleanName, metadata, valuesOf, scope, viewportFor, duplicate, references, packageResources, validCanvasOptions };
