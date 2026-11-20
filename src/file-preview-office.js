
import { unzipSync } from "fflate";

function xml(bytes) {
  if (!bytes) return null;
  const text = new TextDecoder().decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null;
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return doc.querySelector("parsererror") ? null : doc;
}
const tags = (node, name) => Array.from(node?.getElementsByTagNameNS("*", name) ?? []);
const joined = (node, name) => tags(node, name).map(element => element.textContent).join("");
const summary = (node, limit) => tags(node, "p").slice(0, limit).map(p => joined(p, "t")).filter(Boolean).join("\n").slice(0, 8000);

function relationship(entries, folder, relationshipFile, item, targetPattern) {
  const id = Array.from(item?.attributes ?? []).find(attr => attr.localName === "id" && attr.namespaceURI)?.value;
  const rel = tags(xml(entries[relationshipFile]), "Relationship").find(node => node.getAttribute("Id") === id);
  const target = rel?.getAttribute("Target");
  if (!target || rel.getAttribute("TargetMode") === "External") return null;
  const resolved = new URL(target, "https://package.invalid/" + folder + "/");
  const name = resolved.pathname.slice(1);
  return resolved.origin === "https://package.invalid" && targetPattern.test(name) ? xml(entries[name]) : null;
}

export function office(bytes, extension) {
  let budget = 10 * 1024 * 1024;
  const entries = unzipSync(bytes, { filter: file => {
    if (file.originalSize > 3 * 1024 * 1024 || file.originalSize > budget ||
        !/^(word\/document|docProps\/core|ppt\/(presentation|_rels\/presentation\.xml\.rels|slides\/slide\d+)|xl\/(workbook|_rels\/workbook\.xml\.rels|sharedStrings|worksheets\/sheet\d+))(\.xml)?$/.test(file.name))
      return false;
    budget -= file.originalSize;
    return true;
  } });
  if (extension === "docx") {
    const doc = xml(entries["word/document.xml"]);
    const text = summary(doc, 40);
    if (!text) return null;
    const title = tags(xml(entries["docProps/core.xml"]), "title")[0]?.textContent?.slice(0, 240);
    return { kind: "document", text, title, approximate: true };
  }
  if (extension === "pptx") {
    const slides = tags(xml(entries["ppt/presentation.xml"]), "sldId");
    const slide = relationship(entries, "ppt", "ppt/_rels/presentation.xml.rels", slides[0], /^ppt\/slides\/slide\d+\.xml$/);
    const text = summary(slide, 30);
    if (!text) return null;
    return { kind: "document", text, count: slides.length, approximate: true };
  }
  const sheets = tags(xml(entries["xl/workbook.xml"]), "sheet");
  const sheet = relationship(entries, "xl", "xl/_rels/workbook.xml.rels", sheets[0], /^xl\/worksheets\/sheet\d+\.xml$/);
  if (!sheet) return null;
  const shared = tags(xml(entries["xl/sharedStrings.xml"]), "si");
  if (!shared.length && tags(sheet, "c").some(cell => cell.getAttribute("t") === "s")) return null;
  const table = tags(sheet, "row").slice(0, 24).map(row => {
    const cells = Array(12).fill("");
    for (const cell of tags(row, "c")) {
      const letters = /^[A-Z]+/.exec(cell.getAttribute("r") ?? "")?.[0];
      if (!letters) continue;
      const column = Array.from(letters).reduce((number, char) => number * 26 + char.charCodeAt(0) - 64, 0) - 1;
      if (column >= cells.length) continue;
      const value = joined(cell, "v");
      const type = cell.getAttribute("t");
      cells[column] = (type === "s" ? joined(shared[Number(value)], "t") :
        type === "inlineStr" ? joined(cell, "t") : type === "b" ? (value === "1" ? "TRUE" : "FALSE") : value).slice(0, 160);
    }
    while (cells.length > 1 && !cells.at(-1)) cells.pop();
    return cells;
  });
  if (!table.some(row => row.some(Boolean))) return null;
  return { kind: "table", table, count: sheets.length, title: sheets[0].getAttribute("name"), approximate: true };
}

export async function legacySheet(bytes) {
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (!ole.every((value, i) => value === bytes[i]) && !(bytes[0] === 9 && [0, 2, 4, 8].includes(bytes[1])))
    return null;
  const { read, utils } = await import("xlsx");
  const workbook = read(bytes, { type: "array", sheets: 0, sheetRows: 24, cellFormula: false, cellHTML: false });
  const title = workbook.SheetNames[0];
  const sheet = workbook.Sheets[title];
  if (!sheet?.["!ref"]) return null;
  const range = utils.decode_range(sheet["!ref"]);
  range.e.c = Math.min(range.e.c, range.s.c + 11);
  range.e.r = Math.min(range.e.r, range.s.r + 23);
  const table = utils.sheet_to_json(sheet, { header: 1, range, defval: "", raw: false })
    .map(row => row.map(value => String(value).slice(0, 160)));
  if (!table.some(row => row.some(Boolean))) return null;
  return { kind: "table", table, title, count: workbook.SheetNames.length, approximate: true };
}

export function csv(text) {
  const table = [];
  let row = [], field = "", quoted = false;
  function cell() {
    if (row.length < 12) row.push(field);
    field = "";
  }
  for (let i = 0; i < text.length && table.length < 24; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || !field) quoted = !quoted;
      else field += char;
    } else if (!quoted && char === ",") {
      cell();
    } else if (!quoted && (char === "\r" || char === "\n")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      cell();
      table.push(row);
      row = [];
    } else if (field.length < 160) {
      field += char;
    }
  }
  if (table.length < 24 && !quoted && (field || row.length)) { cell(); table.push(row); }
  return table;
}
