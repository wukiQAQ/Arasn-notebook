import { Button } from "./Button";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Select } from "@base-ui/react/select";
import {
  Archive, Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Download,
  Ellipsis, File, FileText, Film, Image, Music, PanelTop, Pencil, Plus, Search,
  Trash2, Upload, X, LayoutGrid, List,
} from "lucide-react";
import { ImagePreview } from "./ImagePreview";
import { BoardClient, uid } from "./board";
import type { ManagedFile, ImportResult } from "./board";
import { fileOriginLabel } from './record-attachments';
import { useNotification } from './Notification';

const fileKinds = { "": "所有类型", 图片: "图片", 音频: "音频", 视频: "视频", 文档: "文档", 其他: "其他" };
const fileIcons = { 图片: Image, 音频: Music, 视频: Film, 文档: FileText };

export function FileMedia({ file, disabled }: { file: ManagedFile; disabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (file.category === "图片")
      void window
        .desktop!.files.thumbnail(file.id)
        .then((u) => { if (active) setUrl(u); })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [file.id, file.category]);
  const Icon = fileIcons[file.category as keyof typeof fileIcons] ?? File;
  if (file.category !== '图片') return <span className="file-media"><Icon size={19} aria-hidden="true" /></span>;
  return <ImagePreview id={file.id} name={file.name} closeLabel="返回文件列表" trigger={
    <button className="file-media" aria-label={`预览 ${file.name}`} disabled={disabled}>
      {url ? <img src={url} alt="" /> : <Icon size={19} aria-hidden="true" />}
    </button>
  } />;
}
const sizeLabel = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
export function FileStation({ client, onAttach, onRecord, onDevices }: { client: BoardClient; onAttach(files: ManagedFile[]): Promise<void>; onRecord?(files: ManagedFile[]): Promise<void>; onDevices(): void }) {
  const api = window.desktop!.files;
  const [selection, setSelection] = useState<string[]>([]);
  const [layout, setLayout] = useState("list");
  const [revision, refresh] = useState(0);
  const [rows, setRows] = useState<ManagedFile[]>([]),
    [loaded, setLoaded] = useState(""),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(0),
    [view, setView] = useState("library");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [messageTone, setMessageTone] = useState<"neutral" | "saved" | "error">("neutral"),
    [confirm, setConfirm] = useState(""),
    [progress, setProgress] = useState(""),
    [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [clearScope, setClearScope] = useState<{ count: number; refs: string[]; canUndo: boolean }>();
  const [canUndoClear, setCanUndoClear] = useState(false);
  const { notify } = useNotification();
  useEffect(() => { if (message) notify(message, { tone: messageTone === 'error' ? 'error' : messageTone === 'saved' ? 'success' : 'neutral', duration: messageTone === 'error' ? null : 2000, placement: 'corner' }); }, [message, messageTone, notify]);
  useEffect(() => { let alive = true; void api.action("fileAreaPreview").then(value => { if (alive) setCanUndoClear((value as { canUndo: boolean }).canUndo); }).catch(() => {}); return () => { alive = false; }; }, [revision]);
  const inlineTrigger = useRef<HTMLButtonElement | null>(null);
  const inlineCancel = useRef<HTMLButtonElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const listKey = JSON.stringify([query, kind, page, view, revision]);
  const loading = loaded !== listKey;
  useEffect(() => {
    if (confirm) inlineCancel.current?.focus();
    else if (rename) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [confirm, rename?.id]);
  function openConfirmation(action: string, trigger: HTMLButtonElement) {
    inlineTrigger.current = trigger;
    setRename(null);
    setConfirm(action);
  }
  function dismissInline() {
    setConfirm("");
    setRename(null);
    inlineTrigger.current?.focus();
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api
          .list({
            query,
            kind,
            page,
            trash: view === "trash",
            panel: view === "panel",
          })
          .then((data) => {
            if (active) {
              const lastPage = Math.max(0, Math.ceil(data.total / 25) - 1);
              if (page > lastPage) setPage(lastPage);
              setRows(data.rows);
              setTotal(data.total);
              setLoaded(listKey);
            }
          })
          .catch((e) => {
            if (active) {
              setRows([]);
              setTotal(0);
              setLoaded(listKey);
              setMessage(e.message);
              setMessageTone("error");
            }
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
    }, [listKey]);
  useEffect(
    () =>
      api.progress((p) =>
        setProgress(
          `${p.name} ${p.total ? Math.min(100, Math.round((p.bytes / p.total) * 100)) : 0}%`,
        ),
      ),
    [],
  );
  async function run(task: () => Promise<unknown>, success = "操作完成") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setMessageTone("saved");
    try {
      const result = await task();
      if (result === false) setMessageTone("neutral");
      setMessage(
        result === false
          ? "已取消"
          : typeof result === "string"
            ? result
            : success,
      );
    } catch (e) {
      setMessage((e as Error).message);
      setMessageTone("error");
    } finally {
      setSelection([]);
      refresh(value => value + 1);
      setBusy(false);
      setProgress("");
    }
  }
  function imported(results: ImportResult[]) {
    const failures = results.filter((r) => !r.ok);
    if (failures.length) setMessageTone("error");
    else if (!results.length) setMessageTone("neutral");
    return `成功 ${results.length - failures.length} 个${failures.length ? "；失败：" + failures.map((f) => `${f.name}：${f.error}`).join("；") : ""}`;
  }
  async function paste() {
    await run(async () => {
      const data = await api.paste();
      if (data.kind === "text" && data.text) {
        client.edit(uid(), {
          type: "text",
          text: data.text,
          color: "#263449",
          x: 100,
          y: 100,
        });
        return "文字已添加到面板";
      }
      return imported(data.results || []);
    });
  }
  return (
    <section
      className="file-station"
      aria-label="文件中转站"
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== "Escape" || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229 || (!confirm && !rename)) return;
        event.preventDefault();
        event.stopPropagation();
        dismissInline();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy)
          void run(async () =>
            imported(await api.drop(Array.from(e.dataTransfer.files))),
          );
      }}
      onPaste={(e) => {
        if (e.defaultPrevented) return;
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        if (!busy) void paste();
      }}
      tabIndex={0}
    >
      <div className="file-actions">
        <Button
          className="file-primary"
          disabled={busy}
          onClick={() => run(async () => imported(await api.choose()))}
        >
          <Upload size={16} />导入文件
        </Button>
        <Button className="file-secondary-action" disabled={busy} onClick={paste}>
          <Clipboard size={16} />粘贴
        </Button>
        <Button className="file-secondary-action" disabled={busy} title="当前支持便签互传；文件发送尚未接入" onClick={onDevices}>设备互传</Button>


      </div>
      <div className="file-organize">
      <nav className="file-views" aria-label="文件视图">
        {[
          { id: "library", label: "中转站", Icon: Archive },
          { id: "panel", label: "面板文件", Icon: PanelTop },
          { id: "trash", label: "回收站", Icon: Trash2 },
        ].map(({ id, label, Icon }) => (
          <Button
            key={id}
            aria-pressed={view === id}
            onClick={() => {
              setView(id);
              setPage(0);
              setSelection([]);
            }}
          >
            <Icon size={15} />{label}
          </Button>
        ))}
      </nav>
        <span className="file-layout" role="group" aria-label="显示方式"><Button iconOnly aria-label="列表视图" aria-pressed={layout === "list"} onClick={() => setLayout("list")}><List size={18}/></Button><Button iconOnly aria-label="网格视图" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}><LayoutGrid size={18}/></Button></span>
      </div>
      <div className="file-search">
        <label className="file-query">
          <Search size={16} aria-hidden="true" />
          <input
          aria-label="搜索文件"
          placeholder="搜索文件名"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
            setSelection([]);
          }}
          />
        </label>
        <Select.Root value={kind} items={fileKinds} modal={false}
          onValueChange={(value) => {
            setKind(value ?? "");
            setPage(0);
            setSelection([]);
          }}
        >
          <Select.Trigger render={<Button />} className="file-kind" aria-label="文件分类">
            <Select.Value /><Select.Icon><ChevronDown size={15} /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="file-popover-position file-kind-position" align="end" sideOffset={5}
              collisionPadding={12} alignItemWithTrigger={false}>
              <Select.Popup className="file-popover">
                <Select.List>
                  {Object.entries(fileKinds).map(([value, label]) => (
                    <Select.Item className="file-option" key={value} value={value}>
                      <Select.ItemText>{label}</Select.ItemText>
                      <Select.ItemIndicator><Check size={15} /></Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
      {view !== "trash" && <div className="file-batch" role="group" aria-label="批量操作"><label className="file-select"><input type="checkbox" aria-label="选择本页文件" disabled={busy || loading || !rows.length} checked={rows.length > 0 && rows.every(file => selection.includes(file.id))} onChange={event => setSelection(event.target.checked ? rows.map(file => file.id) : [])}/>选择本页</label><span>已选 {selection.length} 项</span>
        {selection.length > 0 && <><Button disabled={busy || loading} onClick={() => run(() => onAttach(rows.filter(file => selection.includes(file.id))), "已加入工作页，应用副本保持不变")}>加入工作页</Button>
        <Button disabled={busy || loading || !onRecord} title={onRecord ? "关联到最近编辑的便签，不复制文件" : "请先在便签页选择一张便签"} onClick={() => run(() => onRecord!(rows.filter(file => selection.includes(file.id))), "已关联到当前便签")}>加入当前便签</Button></>}
      </div>}
      {view !== "trash" && selection.length > 0 && (
        <Button
          disabled={busy || loading}
          onClick={() =>
            run(async () => {
              for (let i = 0; i < selection.length; i++) {
                setProgress(`移入回收站 ${i + 1}/${selection.length}`);
                await api.action("trash", { id: selection[i] });
              }
              return `已将${selection.length}个文件移入回收站`;
            })
          }
        >
          移入回收站（{selection.length}）
        </Button>
      )}
      <p className="file-safety-note">移出面板仅解除引用；回收站不影响用户原文件。</p>
      {busy && <span className="file-operation-progress" role="status">{progress || "正在处理…"}</span>}
      {confirm && (
        <div role="alertdialog" aria-label="确认操作" className="file-confirm xigra-notice" data-tone="warning">
          <p>
            {confirm === "clear"
              ? `即将清空文件区中的 ${clearScope?.count ?? 0} 个条目。此操作不会删除关系画布中的节点和连接。应用副本仍保留在中转站。`
              : confirm === "purge"
                ? "仅清理回收站中的应用副本。应用会先生成并校验可恢复备份，导入来源文件仍然保留。"
                : "恢复备份会替换当前面板；当前数据会先备份，中转站文件合并保留。"}
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              const action = confirm;
            dismissInline();
              void run(async () => {
                if (action === "clear") {
                  if (!clearScope) throw new Error("请重新预览清空范围");
                  await api.action("clearFileArea", { refs: clearScope.refs });
                  setView("panel"); setPage(0); setCanUndoClear(true);
                  return "文件区已清空，可撤销；中转站副本及关系画布保持不变";
                }
                await client.flush();
                if (action === "restore") return api.action("restoreBackup");
                const result = await api.action("purge") as { backup: string };
                return `回收站已清空。可在「恢复备份」选择 ${result.backup}`;
              });
            }}
          >
            {confirm === "clear" ? "确认清空" : "确认操作"}
          </Button>
          <Button ref={inlineCancel} onClick={dismissInline}>取消</Button>
        </div>
      )}
      {rename && (
        <form
          className="file-rename"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.action("rename", rename));
            dismissInline();
          }}
        >
          <input
            ref={renameInput}
            aria-label="新文件名"
            value={rename.name}
            onChange={(e) => setRename({ ...rename, name: e.target.value })}
          />
          <Button>保存</Button>
          <Button type="button" onClick={dismissInline}>
            取消
          </Button>
        </form>
      )}
      <div className={`file-list file-list-${layout}`} aria-busy={loading}>
        {rows.map((file) => (
          <article className="file-row" key={file.id}>
            {view !== "trash" && (
              <label className="file-select">
                <input
                  type="checkbox"
                  disabled={busy || loading}
                  aria-label={`选择 ${file.name}`}
                  checked={selection.includes(file.id)}
                  onChange={(e) =>
                    setSelection(
                      e.target.checked
                        ? [...selection, file.id]
                        : selection.filter((id) => id !== file.id),
                    )
                  }
                />
              </label>
            )}
            <FileMedia file={file} disabled={busy || loading} />
            <div className="file-meta">
              <strong title={file.name}>{file.name}</strong>
              <small>{file.category} · {sizeLabel(file.size)} <span className="file-source">· {fileOriginLabel(file)}{view === 'panel' ? ' · 面板引用' : ''}</span></small>
            </div>
            <div className="file-row-actions">
              {view !== "trash" && <Button disabled={busy || loading} aria-label={`加入工作页 ${file.name}`} onClick={() => run(() => onAttach([file]), "已加入工作页")}>加入工作页</Button>}
              {view === "trash" ? (
                <Button
                  disabled={busy || loading}
                  onClick={() =>
                    run(
                      () => api.action("trash", { id: file.id, restore: true }),
                      "已恢复",
                    )
                  }
                >
                  恢复
                </Button>
              ) : (
                <Button className="file-row-secondary"
                  disabled={busy || loading}
                  onClick={() => run(
                    () => api.action(view === "panel" ? "unreference" : "reference", { id: file.id }),
                    view === "panel" ? "已移出面板，应用副本仍在中转站" : "已引用到面板",
                  )}
                >
                  {view === "panel" ? "移出面板" : <><Plus size={15} />放入面板</>}
                </Button>
              )}
              <Menu.Root modal={false}>
                <Menu.Trigger className="file-more" id={`file-menu-${file.id}`} disabled={busy || loading}
                  aria-label={`${file.name}的更多操作`}>
                  <Ellipsis size={18} aria-hidden="true" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="file-popover-position" align="end" sideOffset={5} collisionPadding={12}>
                    <Menu.Popup className="file-popover">
                      {view !== "trash" && <Menu.Item className="file-option file-row-compact-action" onClick={() => run(
                        () => api.action(view === "panel" ? "unreference" : "reference", { id: file.id }),
                        view === "panel" ? "已移出面板，应用副本仍在中转站" : "已引用到面板",
                      )}>{view === "panel" ? "移出面板" : "放入面板"}</Menu.Item>}
                      <Menu.Item className="file-option" onClick={() => run(
                        () => api.action("export", { id: file.id, name: file.name }), "导出完成",
                      )}><Download size={15} />导出副本</Menu.Item>
                      {view !== "trash" && <>
                        <Menu.Item className="file-option" onClick={() => {
                          inlineTrigger.current = document.getElementById(`file-menu-${file.id}`) as HTMLButtonElement | null;
                          setConfirm("");
                          setRename({ id: file.id, name: file.name });
                        }}><Pencil size={15} />重命名副本</Menu.Item>
                        <Menu.Item className="file-option file-danger" onClick={() => run(
                          () => api.action("trash", { id: file.id }), "应用副本已移入回收站，可随时恢复",
                        )}><Trash2 size={15} />移入回收站</Menu.Item>
                      </>}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          </article>
        ))}
        {!loading && !rows.length && <p className="xigra-empty">{query || kind ? "没有符合筛选条件的文件。" : view === "trash" ? "回收站为空。" : view === "panel" ? "当前工作页没有引用文件。" : "拖入文件或使用「导入文件」开始。"}</p>}
      </div>
      <div className="file-pagination">
        <Button disabled={busy || loading || page === 0} onClick={() => { setSelection([]); setPage(page - 1); }}>
          <ChevronLeft size={15} />上一页
        </Button>
        <span>
          {page + 1} 页 · {total} 个文件
        </span>
        <Button
          disabled={busy || loading || (page + 1) * 25 >= total}
          onClick={() => { setSelection([]); setPage(page + 1); }}
        >
          下一页<ChevronRight size={15} />
        </Button>
      </div>
      <details>
        <summary>恢复与数据检查</summary>
        <div className="file-actions">
          <Button className="file-clear" disabled={busy} onClick={event => {
            const trigger = event.currentTarget;
            void run(async () => {
              const scope = await api.action("fileAreaPreview") as { count: number; refs: string[]; canUndo: boolean };
              setClearScope(scope);
              if (!scope.count) return "文件区为空；中转站副本不受影响";
              openConfirmation("clear", trigger); return "请确认清空范围";
            });
          }}><Trash2 size={16}/>清空文件区</Button>
          <Button disabled={busy || !canUndoClear} onClick={() => void run(async () => { await api.action("undoFileAreaClear"); setView("panel"); setPage(0); return "已恢复文件区条目"; })}>撤销清空文件区</Button>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => JSON.stringify(await api.action("audit")))
            }
          >
            完整性检查
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await client.flush();
                return api.action("backup");
              }, "备份完成")
            }
          >
            备份导出
          </Button>
          <Button disabled={busy} onClick={(event) => openConfirmation("restore", event.currentTarget)}>
            恢复备份
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => JSON.stringify(await api.action("retryFailed")))
            }
          >
            重试失败导入
          </Button>
          <Button disabled={busy} onClick={(event) => openConfirmation("purge", event.currentTarget)}>
            清空回收站
          </Button>
        </div>
        <p className="file-hint">
          默认不自动清理。只在你确认后清理回收站，清理前保留可恢复备份。
        </p>
      </details>
    </section>
  );
}
