import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, Ellipsis, Grid2X2, Layers3, List, Plus, Search, Share2, Trash2, Upload } from "lucide-react";
import { Button } from "./Button";
import { AppSelect } from "./xigra/AppSelect";
import { canvasItems, canvasLabel, placedNote, type CanvasEntry, type CanvasType } from "./canvas-library-model";
import type { Item } from "./board";
import { enclosingBounds } from "./topology";
import { strokeBounds } from "./drawing";
import { exportPalette, freeExportSource, renderCanvasExport } from "./render-export";
import "./canvas-library.css";

type Action = "rename" | "duplicate" | "share" | "export" | "trash" | "restore" | "purge";
const previews = new Map<string, { signature: string; data: string }>();
function Preview({ board, items, theme }: { board: CanvasEntry; items: Record<string, Item>; theme: string }) {
  const entries = canvasItems(items, board.id);
  const signature = JSON.stringify([theme, entries.map(([id, item]) => {
    const value = item.value;
    const ref = value?.type === "free-note" ? value.recordId : value?.type === "canvas-node" ? value.contentRef.id : "";
    return [id, item.version, items[ref]?.version];
  })]);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const [image, setImage] = useState(() => previews.get(board.id)?.data ?? "");
  useEffect(() => {
    if (!visible) return;
    const cached = previews.get(board.id);
    if (cached?.signature === signature) { setImage(cached.data); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let data = "";
      try {
        const camera = { x: 0, y: 0, zoom: 1 };
        const source = freeExportSource(entries.map(([id, item]) => [id, { ...item, value: placedNote(item.value, items) ?? item.value }]), document.body, camera);
        if (board.type === "relation") {
          source.palette = exportPalette(document.body);
          for (const [id, { value }] of entries) {
            if (value?.type === "canvas-edge") source.edges.push(value);
            if (value?.type !== "canvas-node" || value.layout.hidden) continue;
            const ref = items[value.contentRef.id]?.value;
            const text = ref?.type === "text" || ref?.type === "node" ? ref.text : "";
            source.cards.push({ id, kind: "node", box: value.layout, text, title: ref?.type === "text" || ref?.type === "node" ? ref.title || text.split("\n")[0] : "引用节点", color: value.layout.color });
          }
        }
        const bounds = enclosingBounds([...source.cards.map(card => card.box), ...source.strokes.map(stroke => strokeBounds(stroke.points))]);
        if (bounds) {
          source.zoom = Math.min(1, 420 / (Math.max(bounds.width, bounds.height) + 112));
          const result = await renderCanvasExport(source, { mode: "all", multiplier: 1, padding: 24 }, id => window.desktop!.files.thumbnail(id).catch(() => null).then(url => url ?? undefined));
          data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(result.blob); });
        }
      } catch { /* The card keeps its empty preview when a resource cannot be decoded. */ }
      if (!cancelled) {
        if (previews.size >= 128) previews.delete(previews.keys().next().value!);
        previews.set(board.id, { signature, data });
        setImage(data);
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [board.id, board.type, signature, visible]);
  return <div className="canvas-library-preview" ref={root}>{image ? <img src={image} alt="" draggable={false}/> : <Layers3 aria-hidden="true" size={26} strokeWidth={1.2}/>}</div>;
}

const labels: Record<Action, string> = { rename: "重命名", duplicate: "复制", share: "分享", export: "导出画布包", trash: "移至回收站", restore: "恢复", purge: "永久删除" };
export function CanvasLibrary({ type, boards, items, theme, busy, error, retry, create, open, action, importPack }: {
  type: CanvasType; boards: CanvasEntry[]; items: Record<string, Item>; theme: string; busy: boolean; error: string;
  retry(): void; create(): void; open(entry: CanvasEntry): void; action(action: Action, entry: CanvasEntry): void; importPack(): void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [list, setList] = useState(false);
  const [trash, setTrash] = useState(false);
  const typeBoards = boards.filter(board => board.type === type);
  const filtered = typeBoards.filter(board => Boolean(board.deletedAt) === trash && board.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  filtered.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "zh-CN") : sort === "createdAt" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt));
  const recent = useMemo(() => typeBoards.filter(board => board.openedAt && !board.deletedAt).sort((a, b) => b.openedAt!.localeCompare(a.openedAt!))[0], [boards, type]);
  return <section id="workspace" className="canvas-library" aria-label={canvasLabel[type] + "库"}>
    <header className="canvas-library-header">
      <div><h2>{trash ? "回收站" : canvasLabel[type] + "库"}</h2><p>{trash ? "恢复画布，或永久移除其布局。" : type === "workspace" ? "按项目整理便签、附件和手绘。" : "按主题组织节点和它们之间的连接。"}</p></div>
      <div className="canvas-library-actions">
        <Button title="导入画布包" aria-label="导入画布包" iconOnly onClick={importPack} disabled={busy || !!error}><Upload size={17}/></Button>
        <Button title={trash ? "返回画布库" : "回收站"} aria-label={trash ? "返回画布库" : "回收站"} aria-pressed={trash} iconOnly onClick={() => { setTrash(!trash); setQuery(""); }}><Trash2 size={17}/></Button>
        <Button className="canvas-library-primary" onClick={create} disabled={busy || !!error}><Plus size={17}/>新建画布</Button>
      </div>
    </header>
    <div className="canvas-library-filters">
      <label className="canvas-library-search"><Search size={16} aria-hidden="true"/><input placeholder="搜索画布" aria-label="搜索画布" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <AppSelect label="排序方式" value={sort} onValueChange={setSort} options={[{ value: "updatedAt", label: "最近编辑" }, { value: "createdAt", label: "创建时间" }, { value: "name", label: "名称" }]}/>
      <div className="canvas-library-views" role="group" aria-label="画布视图">
        <Button iconOnly aria-label="网格" aria-pressed={!list} onClick={() => setList(false)}><Grid2X2 size={16}/></Button>
        <Button iconOnly aria-label="列表" aria-pressed={list} onClick={() => setList(true)}><List size={17}/></Button>
      </div>
      {!trash && recent && <Button className="canvas-library-recent" disabled={busy} onClick={() => open(recent)}>继续编辑 {recent.name}</Button>}
    </div>
    {error ? <div className="canvas-library-empty" role="alert"><p>{error}</p><Button onClick={retry} disabled={busy}>重试加载</Button></div> : <>
      <div className="canvas-library-grid" data-list={list}>
        {filtered.map(board => {
          const values = canvasItems(items, board.id).map(([, item]) => item.value);
          const count = (type: string) => values.filter(value => value?.type === type && (value.type !== "canvas-node" || !value.layout.hidden)).length;
          const detail = type === "workspace" ? count("free-note") + " 张便签 · " + count("free-file") + " 个附件 · " + count("stroke") + " 个绘画对象" : count("canvas-node") + " 个节点 · " + count("canvas-edge") + " 条连线";
          return <article className="canvas-library-card" key={board.id}>
            <button type="button" className="canvas-library-open" disabled={busy || trash} onClick={() => open(board)} aria-label={"打开 " + board.name}>
              <Preview board={board} items={items} theme={theme}/>
              <div className="canvas-library-meta"><strong title={board.name}>{board.name}</strong><span>{detail}</span><time dateTime={board.updatedAt}>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(board.updatedAt))}</time>{!!board.missingReferences && <span>{board.missingReferences} 个引用暂不可用</span>}</div>
            </button>
            <Menu.Root>
              <Menu.Trigger render={<Button iconOnly className="canvas-library-more" />} aria-label={board.name + "的更多操作"} disabled={busy}><Ellipsis size={18}/></Menu.Trigger>
              <Menu.Portal><Menu.Positioner className="canvas-library-position" sideOffset={5} align="end"><Menu.Popup className="canvas-library-menu">
                {(trash ? ["restore", "purge"] as const : ["rename", "duplicate", "share", "export", "trash"] as const).map(key => <Menu.Item className="canvas-library-option" key={key} onClick={() => action(key, board)}>{labels[key]}</Menu.Item>)}
              </Menu.Popup></Menu.Positioner></Menu.Portal>
            </Menu.Root>
          </article>;
        })}
      </div>
      {!filtered.length && <p className="canvas-library-empty" role="status">{busy ? "正在载入画布…" : query ? "没有匹配的画布。" : trash ? "回收站为空。" : "还没有画布。新建一张开始工作。"}</p>}
    </>}
  </section>;
}

export function CanvasSwitcher({ current, boards, open, library, create, share, rename }: {
  current: CanvasEntry; boards: CanvasEntry[]; open(board: CanvasEntry): void; library(): void; create(): void; share(): void; rename(): void;
}) {
  const recent = boards.filter(board => board.id !== current.id && board.type === current.type && !board.deletedAt && board.openedAt).sort((a, b) => b.openedAt!.localeCompare(a.openedAt!)).slice(0, 5);
  return <div className="canvas-switcher">
    <Menu.Root>
      <Menu.Trigger className="canvas-switcher-trigger" onDoubleClick={rename} title={current.name} aria-label={"切换画布，当前 " + current.name}><span>{current.name}</span><ChevronDown size={15}/></Menu.Trigger>
      <Menu.Portal><Menu.Positioner className="canvas-library-position" align="start" sideOffset={7}><Menu.Popup className="canvas-library-menu">
        <Menu.Item className="canvas-library-option" disabled>{current.name}（当前）</Menu.Item>
        {recent.map(board => <Menu.Item className="canvas-library-option" key={board.id} onClick={() => open(board)}>{board.name}</Menu.Item>)}
        <Menu.Separator className="canvas-library-separator"/>
        <Menu.Item className="canvas-library-option" onClick={rename}>重命名</Menu.Item>
        <Menu.Item className="canvas-library-option" onClick={create}>新建画布</Menu.Item>
        <Menu.Item className="canvas-library-option" onClick={library}>查看全部画布</Menu.Item>
      </Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>
    <Button iconOnly aria-label="分享当前画布" onClick={share}><Share2 size={16}/></Button>
  </div>;
}

export function CanvasLibraryDialog({ title, detail, label, name, busy, close, submit, children, submitDisabled }: {
  title: string; detail?: string; label: string; name?: string; busy: boolean; submitDisabled?: boolean; close(): void; submit(value: string): void; children?: React.ReactNode;
}) {
  const [value, setValue] = useState(name ?? "");
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close(); }}>
    <Dialog.Portal><Dialog.Backdrop className="canvas-library-backdrop"/><Dialog.Popup className="canvas-library-dialog">
      <Dialog.Title>{title}</Dialog.Title>
      {detail && <Dialog.Description>{detail}</Dialog.Description>}
      <form onSubmit={event => { event.preventDefault(); submit(value); }}>
        {name !== undefined && <label className="canvas-dialog-field">画布名称<input autoFocus aria-label="画布名称" maxLength={100} value={value} onChange={event => setValue(event.target.value)}/></label>}
        {children}
        <footer><Button type="button" onClick={close} disabled={busy}>关闭</Button><Button type="submit" className="canvas-library-primary" disabled={busy || submitDisabled}>{label}</Button></footer>
      </form>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}


export function CanvasShareDialog({ entry, networks, close, flush, exportPack, notify }: {
  entry: CanvasEntry;
  networks: { address: string; name: string }[];
  close(): void;
  flush(): Promise<void>;
  exportPack(): void;
  notify(message: string): void;
}) {
  const [status, setStatus] = useState<import("./canvas-library-model").CanvasShare | null>(null);
  const [host, setHost] = useState(networks[0]?.address ?? "");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const result = await window.desktop!.canvas.share("status");
        if (live) setStatus(result);
      } catch { /* Opening and stopping sharing report their own errors. */ }
    };
    void load();
    const timer = setInterval(load, 2500);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const active = status?.id === entry.id;
  async function change() {
    setBusy(true);
    setError("");
    try {
      if (!active) await flush();
      setStatus(await window.desktop!.canvas.share(active ? "stop" : "start", { id: entry.id, host, mode, includeNotes, includeFiles }));
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <CanvasLibraryDialog title="分享画布" detail={entry.name} label={active ? "停止分享" : "开启局域网分享"}
    close={close} busy={busy} submit={() => void change()} submitDisabled={!active && (!host || !!status)}>
    {active ? <>
      <p>{status.mode === "edit" ? "允许调整布局" : "仅查看"} · {status.viewers} 台设备最近在线</p>
      <label className="canvas-dialog-field">分享链接<input readOnly value={status.link} onFocus={event => event.target.select()}/></label>
      <Button onClick={() => void window.desktop!.copyText(status.link).then(() => notify("链接已复制"), () => setError("复制失败，请手动选中链接"))}>复制链接</Button>
    </> : <>
      <div className="canvas-dialog-field">局域网地址<AppSelect label="局域网地址" value={host} onValueChange={setHost} options={[{ value: "", label: "选择网卡" }, ...networks.map(network => ({ value: network.address, label: network.name + " · " + network.address }))]} variant="network"/></div>
      <div className="canvas-dialog-field">访问权限<AppSelect<"view" | "edit"> label="访问权限" value={mode} onValueChange={setMode} options={[{ value: "view", label: "仅查看" }, { value: "edit", label: "允许编辑布局" }]} variant="network"/></div>
      <label className="canvas-dialog-choice"><input type="checkbox" checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)}/> 允许查看引用便签的正文</label>
      <label className="canvas-dialog-choice"><input type="checkbox" checked={includeFiles} onChange={event => setIncludeFiles(event.target.checked)}/> 允许下载引用附件</label>
      {status && <p role="status">已有画布正在分享。停止该分享后可开启新链接。</p>}
      <p className="canvas-share-transport">请在信任的局域网内使用。此链接通过 HTTP 连接。</p>
    </>}
    {error && <p role="alert">{error}</p>}
    <Button onClick={exportPack} disabled={busy}>导出画布包</Button>
  </CanvasLibraryDialog>;
}
