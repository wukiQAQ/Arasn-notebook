
import { IconButton } from "./Button";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { PreviewContents, previewFacts, unsupportedPreview, type FilePreviewData } from "./FilePreviewContent";
import "./image-preview.css";

export function FilePreviewDialog({ id, name, trigger, closeLabel, initial, refreshed }: {
  id: string; name: string; trigger: ReactElement; closeLabel: string;
  initial?: FilePreviewData; refreshed(): void;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger render={trigger} />
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop file-preview-backdrop" />
      <Dialog.Popup className="file-preview original-preview" onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
        <header><Dialog.Title title={name}>{name}</Dialog.Title>
          <Dialog.Close render={<IconButton />} aria-label={closeLabel}><X size={18} /></Dialog.Close>
        </header>
        <Dialog.Description className="preview-description">{previewFacts(initial, name) || "本机文件预览"}</Dialog.Description>
        {open && <ExpandedPreview key={id} id={id} name={name} initial={initial} refreshed={refreshed} />}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

function ExpandedPreview({ id, name, initial, refreshed }: {
  id: string; name: string; initial?: FilePreviewData; refreshed(): void;
}) {
  const [preview, setPreview] = useState<FilePreviewData | null>();
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [zoom, setZoom] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setError("");
    setZoom(null);
    setSize({ width: 0, height: 0 });
    setPreview(undefined);
    void window.desktop?.files.preview(id, "detail", page).then(result => {
      if (alive) setPreview(result);
    }).catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [id, page, retry]);

  async function fileAction(action: string) {
    setFileError("");
    try { await window.desktop?.files.action(action, { id, name }); }
    catch (reason) { setFileError(reason instanceof Error ? reason.message : String(reason)); }
  }

  function scale(factor: number) {
    const rect = area.current?.getBoundingClientRect();
    const fitted = rect && size.width ? Math.min(1, (rect.width - 24) / size.width, (rect.height - 24) / size.height) : 1;
    setZoom(Math.max(.25, Math.min(4, (zoom ?? fitted) * factor)));
  }

  const data = preview === undefined && page === 1 ? initial : preview;
  const image = data?.kind === "image" ? data.url || data.image : data?.kind === "document" ? data.image : undefined;
  const pdf = data?.extension === "pdf" || initial?.extension === "pdf";
  const pages = data?.count || initial?.count || 1;
  const raster = image && data?.kind === "image";
  const zoomable = Boolean(raster && size.width && !error);
  const playable = data?.url && (data.kind === "video" || data.kind === "audio");

  async function retryPreview() {
    await window.desktop?.files.action("invalidatePreview", { id }).catch(() => {});
    setRetry(value => value + 1);
    refreshed();
  }

  return <>
    <div className="image-preview-tools">
      <div className="preview-file-actions" role="group" aria-label="原文件操作">
        <button onClick={() => void fileAction("openOriginal")}>打开原文件</button>
        <button onClick={() => void fileAction("locateOriginal")}>定位文件</button>
        <button onClick={() => void fileAction("export")}>导出原文件</button>
      </div>
      {raster && <div className="preview-scale-actions" role="group" aria-label="图片缩放">
        <button disabled={!zoomable} aria-pressed={zoom === null} onClick={() => setZoom(null)}>适应窗口</button>
        <button disabled={!zoomable} aria-pressed={zoom === 1} onClick={() => setZoom(1)}>100%</button>
        <button aria-label="缩小图片" disabled={!zoomable || zoom === .25} onClick={() => scale(1 / 1.25)}><Minus size={16} /></button>
        <output aria-label="图片显示比例">{zoom === null ? "适应" : Math.round(zoom * 100) + "%"}</output>
        <button aria-label="放大图片" disabled={!zoomable || zoom === 4} onClick={() => scale(1.25)}><Plus size={16} /></button>
      </div>}
      {pdf && <div className="preview-scale-actions" role="group" aria-label="PDF 翻页">
        <button aria-label="上一页" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
        <output aria-label="PDF 页码">{page} / {pages}</output>
        <button aria-label="下一页" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
      </div>}
    </div>
    {fileError && <p role="alert">{fileError}</p>}
    <div ref={area} className="image-preview-area file-detail-stage" tabIndex={0} role="region" aria-label="文件内容预览区域"
      data-fit={Boolean(image) && zoom === null || Boolean(playable) || Boolean(error) || !data} data-asset={data?.kind}>
      {error || preview === null || data?.kind === "unsupported" ?
        <div className="image-preview-message" role="status"><p>{error || unsupportedPreview}</p>
          <button onClick={() => void retryPreview()}>重试预览</button>
        </div>
        : playable && data.kind === "video" ? <video src={data.url} poster={data.image} controls preload="metadata"
          onError={() => setError("当前编码无法播放，可导出原文件查看。")} />
        : playable && data.kind === "audio" ? <div className="preview-audio-detail"><PreviewContents preview={data} />
          <audio src={data.url} controls preload="metadata" onError={() => setError("当前编码无法播放，可导出原文件查看。")} /></div>
        : image ? <img key={image} src={image} alt={name} draggable={false}
          onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setError("图片解码失败，可导出原文件查看。")}
          style={zoom === null ? undefined : { width: size.width * zoom, height: size.height * zoom }} />
        : data && (data.text || data.table) ? <PreviewContents preview={data} />
        : <p role="status">正在读取预览…</p>}
    </div>
    {raster && data?.width && data.height &&
      <p className="preview-detail-facts">{data.width} × {data.height} 像素</p>}
  </>;
}
