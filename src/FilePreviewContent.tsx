export type FilePreviewData = {
  kind: "image" | "video" | "audio" | "document" | "text" | "table" | "unsupported";
  extension: string;
  image?: string;
  url?: string;
  width?: number;
  height?: number;
  duration?: number;
  peaks?: number[];
  text?: string;
  title?: string;
  table?: string[][];
  count?: number;
  approximate?: boolean;
  truncated?: boolean;
};

export const unsupportedPreview = "此文件暂不支持预览";

export function durationLabel(seconds: number) {
  const total = Math.floor(seconds);
  const min = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return min >= 60 ? Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0") + ":" + rest : min + ":" + rest;
}

export function previewFacts(preview: FilePreviewData | null | undefined, name: string, showDuration = true) {
  const extension = preview?.extension || /\.([^./]+)$/.exec(name)?.[1];
  const count = preview?.count;
  const description = count ? count + (preview.kind === "table" ? " 张工作表" :
    preview.extension === "pptx" ? " 张幻灯片" : " 页") : undefined;
  return [extension?.toUpperCase(), showDuration && preview?.duration !== undefined ? durationLabel(preview.duration) : description,
    preview?.approximate ? "内容摘要" : undefined].filter(Boolean).join(" · ");
}

export function Waveform({ peaks }: { peaks: number[] }) {
  return <span className="preview-waveform" role="img" aria-label="音频波形">
    {peaks.map((peak, i) => <span key={i} style={{ height: Math.max(3, peak * 100) + "%" }} />)}
  </span>;
}

export function PreviewContents({ preview, compact = false }: { preview: FilePreviewData; compact?: boolean }) {
  if (preview.table) {
    const rows = compact ? preview.table.slice(0, 5) : preview.table;
    return <div className="preview-table-wrap">
      {preview.title && <strong>{preview.title}</strong>}
      <table aria-label="表格内容预览"><tbody>
        {rows.map((row, i) => <tr key={i}>
          {(compact ? row.slice(0, 5) : row).map((cell, j) => <td key={j}>{cell}</td>)}
        </tr>)}
      </tbody></table>
    </div>;
  }
  if (preview.text) return <div className="preview-text-content">
    {preview.title && <strong>{preview.title}</strong>}
    <pre>{compact ? preview.text.slice(0, 650) : preview.text}{preview.truncated && "\n…"}</pre>
  </div>;
  if (preview.peaks?.length) return <Waveform peaks={preview.peaks} />;
  return null;
}
