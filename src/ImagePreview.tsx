import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Minus, Plus, X } from 'lucide-react';
import './image-preview.css';

export function ImagePreview({ id, name, trigger, closeLabel = '关闭图片预览' }: {
  id: string; name: string; trigger: ReactElement; closeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger render={trigger} />
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop file-preview-backdrop" />
      <Dialog.Popup className="file-preview original-preview" onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
        <header><Dialog.Title>{name}</Dialog.Title><Dialog.Close aria-label={closeLabel}><X size={18} /></Dialog.Close></header>
        <Dialog.Description>原图预览，可适应窗口或按实际像素查看。</Dialog.Description>
        {open && <OriginalImage key={id} id={id} name={name} />}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

function OriginalImage({ id, name }: { id: string; name: string }) {
  const [source, setSource] = useState(''), [error, setError] = useState(''), [attempt, retry] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 }), [zoom, setZoom] = useState<number | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setSource(''); setError(''); setSize({ width: 0, height: 0 });
    void window.desktop!.files.originalImage(id).then(url => { if (active) setSource(url); })
      .catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [id, attempt]);
  function scale(factor: number) {
    const rect = area.current?.getBoundingClientRect();
    const fitted = rect && size.width ? Math.min(1, (rect.width - 24) / size.width, (rect.height - 24) / size.height) : 1;
    setZoom(Math.max(.25, Math.min(4, Math.round((zoom ?? fitted) * factor * 100) / 100)));
  }
  const ready = !!size.width && !error;
  return <>
    <div className="image-preview-tools" role="group" aria-label="图片缩放">
      <button disabled={!ready} aria-pressed={zoom === null} onClick={() => setZoom(null)}>适应窗口</button>
      <button disabled={!ready} aria-pressed={zoom === 1} onClick={() => setZoom(1)}>100%</button>
      <button aria-label="缩小图片" title={!ready ? '原图加载后可缩放' : '缩小图片，最低25%'} disabled={!ready || zoom === .25} onClick={() => scale(1 / 1.25)}><Minus size={16} /></button>
      <output aria-label="图片显示比例">{zoom === null ? '适应' : `${Math.round(zoom * 100)}%`}</output>
      <button aria-label="放大图片" title={!ready ? '原图加载后可缩放' : '放大图片，最高400%'} disabled={!ready || zoom === 4} onClick={() => scale(1.25)}><Plus size={16} /></button>
    </div>
    <div ref={area} className="image-preview-area" tabIndex={0} role="region" aria-label="原图查看区域" data-fit={zoom === null}>
      {error ? <div className="image-preview-message" role="alert"><p>原图读取失败</p><p>{error}</p><button onClick={() => retry(attempt + 1)}>重试读取原图</button></div>
        : source ? <img src={source} alt={name} draggable={false} onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('图片解码失败，可导出原文件查看。')} style={zoom === null ? undefined : { width: size.width * zoom, height: size.height * zoom }} />
        : <p role="status">正在读取原图…</p>}
    </div>
    <p role="status">{ready ? `${size.width} × ${size.height} 像素` : '支持有效本机 PNG/JPEG 原图（≤20MB、≤3200万像素），其他文件可导出后查看。'}</p>
  </>;
}
