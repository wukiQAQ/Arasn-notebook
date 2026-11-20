const status = document.querySelector("#status");
const title = document.querySelector("#title");
const canvas = document.querySelector("#canvas");
const cards = document.querySelector("#cards");
const token = location.hash.slice(1);
const headers = { Authorization: "Bearer " + token };
let revision, busy = false;

function svg(tag, attributes, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text) element.textContent = text;
  return element;
}

function render(view) {
  title.textContent = view.name;
  status.textContent = view.mode === "edit" ? "已连接 · 可调整卡片和节点位置" : "已连接 · 仅查看";
  if (revision === view.revision) return;
  revision = view.revision;
  canvas.replaceChildren();
  cards.replaceChildren();
  const positions = new Map();
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  function bounds(x, y, width = 0, height = 0) {
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + width); bottom = Math.max(bottom, y + height);
  }
  for (const item of view.objects) {
    if (item.type === "stroke") for (const [x, y] of item.points) bounds(x - item.width, y - item.width, item.width * 2, item.width * 2);
    else if (item.type !== "canvas-edge") { positions.set(item.id, item); bounds(item.x, item.y, item.width, item.height); }
  }
  canvas.setAttribute("viewBox", Number.isFinite(left) ? [left - 30, top - 30, right - left + 60, bottom - top + 60].join(" ") : "0 0 400 300");
  for (const item of view.objects) {
    if (item.type === "canvas-edge") {
      const a = positions.get(item.from), b = positions.get(item.to);
      if (!a || !b) continue;
      const x1 = a.x + a.width / 2, y1 = a.y + a.height / 2, x2 = b.x + b.width / 2, y2 = b.y + b.height / 2;
      canvas.append(svg("line", { x1, y1, x2, y2, stroke: "#798a9d", "stroke-width": 2 }));
      if (item.label) canvas.append(svg("text", { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, fill: "currentColor", "text-anchor": "middle" }, item.label.slice(0, 28)));
    } else if (item.type === "stroke") {
      const points = item.points.length === 1 ? [...item.points, [item.points[0][0] + .01, item.points[0][1]]] : item.points;
      canvas.append(svg("polyline", { points: points.map(([x,y]) => x + "," + y).join(" "), fill: "none", stroke: item.color, "stroke-width": item.width, "stroke-linecap": "round", opacity: item.opacity ?? 1 }));
    }
  }
  for (const item of positions.values()) {
    canvas.append(svg("rect", { x: item.x, y: item.y, width: item.width, height: item.height, rx: 8, fill: "Canvas", stroke: "#798a9d" }));
    canvas.append(svg("text", { x: item.x + 10, y: item.y + 24, fill: "currentColor", "font-size": 15 }, (item.title || item.text || "便签").slice(0, 14)));
    const card = document.createElement("article"), heading = document.createElement("strong"), body = document.createElement("p");
    heading.textContent = item.title; body.textContent = item.text; card.append(heading, body);
    if (item.download) {
      const button = document.createElement("button");
      button.textContent = "下载附件";
      button.onclick = async () => {
        try {
          const response = await fetch("/api/attachment/" + item.id, { headers });
          if (!response.ok) throw new Error("附件已不可用");
          const url = URL.createObjectURL(await response.blob());
          const link = document.createElement("a");
          link.href = url; link.download = item.title; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (error) { status.textContent = error.message; }
      };
      card.append(button);
    }
    if (view.mode === "edit" && !item.locked) {
      const form = document.createElement("form");
      const fields = ["x", "y"].map(key => {
        const label = document.createElement("label"), input = document.createElement("input");
        input.type = "number"; input.min = -1000000; input.max = 1000000; input.step = "any"; input.required = true; input.value = item[key];
        label.append(key.toUpperCase() + " ", input); form.append(label);
        return input;
      });
      const submit = document.createElement("button"); submit.textContent = "保存位置"; form.append(submit);
      form.onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        busy = submit.disabled = true;
        try {
          const opId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
          const response = await fetch("/api/ops", { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, expected: item.version, x: fields[0].valueAsNumber, y: fields[1].valueAsNumber, opId }) });
          const result = await response.json();
          if (!response.ok) throw new Error(response.status === 409 ? "位置已被修改。请刷新后重试。" : result.error);
          render(result);
        } catch (error) { status.textContent = error.message || "保存失败"; }
        finally { busy = submit.disabled = false; }
      };
      card.append(form);
    }
    cards.append(card);
  }
}

async function refresh() {
  if (busy || cards.contains(document.activeElement) && document.activeElement.matches("input")) return;
  try {
    const response = await fetch("/api/board", { headers, signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      if ([401, 403, 410].includes(response.status)) { canvas.replaceChildren(); cards.replaceChildren(); revision = undefined; }
      throw new Error(response.status === 401 || response.status === 410 ? "共享链接已失效" : "暂时无法读取画布");
    }
    if (!busy) render(await response.json());
  } catch (error) { status.textContent = error.name === "Error" && error.message !== "Failed to fetch" ? error.message : "连接已断开，正在重连…"; }
}
if (!token) status.textContent = "请使用分享者提供的完整链接";
else { void refresh(); setInterval(refresh, 2500); }
