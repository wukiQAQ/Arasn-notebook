import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { Eye, File, FileText, Film, Image, Music } from "lucide-react";
import { IconButton } from "./Button";
import type { ManagedFile } from "./board";
import { previewFacts, PreviewContents, unsupportedPreview, type FilePreviewData } from "./FilePreviewContent";
import { sizeLabel } from "./FileStation";
import { FilePreviewDialog } from "./ImagePreview";

export type RequestFilePreview = (id: string, refresh?: boolean) => Promise<FilePreviewData | null>;
export type QuickPreviewAnchor = { file: ManagedFile; row: HTMLElement };
const icons = { 图片: Image, 视频: Film, 音频: Music, 文档: FileText };

function PreviewSurface({ preview, category, quick = false }: {
  preview?: FilePreviewData | null; category: string; quick?: boolean;
}) {
  const [brokenImage, setBrokenImage] = useState<string>();
  const Icon = icons[category as keyof typeof icons] ?? File;
  const image = preview?.image;
  return <div className="picker-preview-surface" aria-hidden={!quick}>
    {image && image !== brokenImage ? <img src={image} alt="" draggable={false} onError={() => setBrokenImage(image)} />
      : preview && (preview.text || preview.table || preview.peaks?.length) ? <PreviewContents preview={preview} compact />
      : <span className="picker-preview-placeholder"><Icon size={quick ? 26 : 19} aria-hidden="true"/>
        {quick && <span>{preview === undefined ? "正在加载预览…" : unsupportedPreview}</span>}
      </span>}
  </div>;
}

export function FilePickerRow({ file, request, checked, disabled, quickOpen, onChange, showQuick, hideQuick }: {
  file: ManagedFile; request: RequestFilePreview; checked: boolean; disabled: boolean; quickOpen: boolean;
  onChange(checked: boolean): void; showQuick(anchor: QuickPreviewAnchor, immediate?: boolean): void; hideQuick(): void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<FilePreviewData | null>();
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    let current = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void request(file.id).then(value => { if (current) setPreview(value); });
    }, { root: element.parentElement });
    observer.observe(element);
    return () => { current = false; observer.disconnect(); };
  }, [file.id, request]);
  function hover(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") showQuick({ file, row: event.currentTarget });
  }
  return <div ref={row} className="file-picker-row" data-selected={checked}
    onPointerEnter={hover} onPointerMove={hover} onPointerLeave={hideQuick}>
    <label className="file-picker-select">
      <input type="checkbox" aria-label={`选择附件 ${file.name}`} checked={checked} disabled={disabled}
        onChange={event => onChange(event.target.checked)}/>
      <PreviewSurface preview={preview} category={file.category}/>
      <span className="file-picker-file"><span title={file.name}>{file.name}</span>
        <small>{previewFacts(preview, file.name) || file.category} · {sizeLabel(file.size)}</small>
      </span>
    </label>
    <FilePreviewDialog id={file.id} name={file.name} closeLabel="返回附件选择" initial={preview ?? undefined}
      refreshed={() => { void request(file.id, true).then(setPreview); }}
      trigger={<IconButton className="file-picker-preview-action" aria-label={`预览 ${file.name}`} disabled={disabled}
        aria-describedby={quickOpen ? `attachment-preview-${file.id}` : undefined}
        onFocus={event => {
          if (row.current && event.currentTarget.matches(":focus-visible")) showQuick({ file, row: row.current }, true);
        }} onBlur={hideQuick} onClick={hideQuick}><Eye size={17}/></IconButton>}/>
  </div>;
}

export function QuickFilePreview({ anchor, request, popup, list }: {
  anchor: QuickPreviewAnchor & { keyboard: boolean }; request: RequestFilePreview;
  popup: RefObject<HTMLDivElement | null>; list: RefObject<HTMLDivElement | null>;
}) {
  const { file, row, keyboard } = anchor;
  const tip = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<FilePreviewData | null>();
  useEffect(() => {
    let current = true;
    void request(file.id).then(value => { if (current) setPreview(value); });
    return () => { current = false; };
  }, [file.id, request]);
  useLayoutEffect(() => {
    const element = tip.current, container = popup.current, scroll = list.current;
    if (!element || !container || !scroll) return;
    function position() {
      if (!element || !container || !scroll) return;
      const dialog = container.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      const target = row.getBoundingClientRect();
      const visible = target.bottom > viewport.top && target.top < viewport.bottom;
      element.style.visibility = visible && (keyboard || row.matches(":hover")) ? "visible" : "hidden";
      const margin = 10, gap = 8;
      const width = Math.min(240, viewport.width - 2 * gap);
      element.style.width = width + "px";
      element.style.maxHeight = Math.max(0, viewport.height - 2 * gap) + "px";
      const height = element.offsetHeight;
      const right = dialog.right + gap;
      const left = dialog.left - width - gap;
      let x = right, y = target.top;
      if (right + width > document.documentElement.clientWidth - margin) {
        if (left >= margin) x = left;
        else {
          x = viewport.right - width - gap;
          if (target.bottom + gap + height <= viewport.bottom) y = target.bottom + gap;
          else if (target.top - gap - height >= viewport.top) y = target.top - gap - height;
        }
      }
      y = Math.max(viewport.top + gap, Math.min(y, viewport.bottom - height - gap));
      element.style.left = x - dialog.left - container.clientLeft + "px";
      element.style.top = y - dialog.top - container.clientTop + "px";
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    observer.observe(scroll);
    scroll.addEventListener("scroll", position, { passive: true });
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); scroll.removeEventListener("scroll", position); window.removeEventListener("resize", position); };
  }, [row, keyboard, popup, list]);
  const dimensions = preview?.width && preview?.height ? ` · ${preview.width} × ${preview.height} px` : "";
  return <div className="file-picker-quick" role="tooltip" id={`attachment-preview-${file.id}`} ref={tip}>
    <PreviewSurface preview={preview} category={file.category} quick/>
    <strong>{file.name}</strong>
    <small>{previewFacts(preview, file.name) || file.category} · {sizeLabel(file.size)}{dimensions}</small>
  </div>;
}
