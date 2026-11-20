
import { useEffect, useRef, useState } from "react";
import { File, FileText, Film, Image, Music, Play } from "lucide-react";
import { FilePreviewDialog } from "./ImagePreview";

import { durationLabel, previewFacts, PreviewContents, unsupportedPreview, type FilePreviewData } from "./FilePreviewContent";

const icons = { 图片: Image, 视频: Film, 音频: Music, 文档: FileText };

export function FilePreviewCard({ id, name, category, disabled, unavailable, canvas = false, small = false }: {
  id: string; name: string; category: string; disabled?: boolean; unavailable?: boolean; canvas?: boolean; small?: boolean;
}) {
  const node = useRef<HTMLButtonElement>(null);
  const preferredMode = useRef<"small" | "card">("card");
  preferredMode.current = small ? "small" : "card";
  const requestedMode = useRef<"small" | "card" | undefined>(undefined);
  const refreshPreview = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<FilePreviewData | null>();
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const api = window.desktop?.files;
    if (!api || !node.current || unavailable) return;
    const target = node.current;
    let alive = true, visible = false, last = 0;
    const load = (force = false) => {
      if (!visible || (!force && Date.now() - last < 5000)) return;
      last = Date.now();
      const mode = requestedMode.current === "card" ? "card" : preferredMode.current;
      requestedMode.current = mode;
      void api.preview(id, mode).then(value => {
        if (alive && mode === requestedMode.current) {
          setPreview(value);
          setBroken(false);
        }
      }).catch(() => { if (alive && mode === requestedMode.current) setPreview(null); });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      load();
    });
    observer.observe(target);
    const focus = () => load();
    const refresh = () => load(true);
    window.addEventListener("focus", focus);
    window.addEventListener("arasn-preview-refresh", refresh);
    refreshPreview.current = refresh;
    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener("focus", focus);
      window.removeEventListener("arasn-preview-refresh", refresh);
      refreshPreview.current = null;
    };
  }, [id, name, attempt, unavailable]);
  useEffect(() => {
    if (!small && requestedMode.current === "small") refreshPreview.current?.();
  }, [small]);
  const Icon = icons[category as keyof typeof icons] ?? File;
  const ready = preview && preview.kind !== "unsupported" && !broken;
  const video = ready && preview.kind === "video";
  const audio = ready && preview.kind === "audio";
  const facts = previewFacts(preview, name, !video);
  const hasContent = ready && (preview.image || preview.table || preview.text || preview.peaks?.length);
  return <>
    <FilePreviewDialog id={id} name={name} initial={ready ? preview : undefined}
      closeLabel={canvas ? "关闭文件预览" : "返回文件列表"}
      refreshed={() => setAttempt(value => value + 1)}
      trigger={<button type="button" ref={node}
        className={canvas ? "free-image-preview file-content-preview" : "file-media file-content-preview"}
        data-preview-kind={ready ? preview.kind : unavailable || preview !== undefined ? "unsupported" : "loading"}
        aria-label={"预览 " + name} title={!ready && preview !== undefined ? unsupportedPreview : undefined}
        disabled={disabled || unavailable} onPointerDown={canvas ? event => event.stopPropagation() : undefined}>
        <span className="file-content-stage" aria-hidden="true">
          {ready && preview.image ? <img src={preview.image} alt="" draggable={false} onError={() => setBroken(true)} />
            : hasContent ? <PreviewContents preview={preview} compact />
            : <span className="file-content-placeholder">
              <Icon size={canvas ? 24 : 18} aria-hidden="true" />
              {canvas && <span>{preview === undefined ? "正在加载预览…" : ready ? "播放音频" : unsupportedPreview}</span>}
            </span>}
          {video && <><span className="file-preview-play"><Play size={13} fill="currentColor" /></span>
            {preview.duration !== undefined && <span className="file-preview-duration">{durationLabel(preview.duration)}</span>}</>}
          {audio && preview.peaks?.length ? <span className="file-audio-play"><Play size={13} fill="currentColor" /></span> : null}
        </span>
        {!canvas && facts && <span className="file-content-facts">{facts}</span>}
      </button>} />
    {canvas && facts && <span className="free-image-caption">{facts}</span>}
  </>;
}
