export type Direction = 'A' | 'B' | 'C';
export type Note = { id: string; title: string; text: string; x: number; y: number; tag: string };
export type Asset = { id: string; name: string; kind: 'image' | 'audio' | 'pdf' | 'document'; size: number; url: string; demo?: boolean };
export const directions = {
  A: { name: 'Precision Workspace', short: '精确与秩序', detail: '窄工具轨 · 命令驱动 · 固定文件检查区', accent: '#a7cbb5', surface: '#252b2d', duration: .14 },
  B: { name: 'Fluid Desktop', short: '轻盈的空间', detail: '浮动导航 · 上下文工具坞 · 可展开文件舱', accent: '#557ba0', surface: '#ffffff', duration: .18 },
  C: { name: 'Experimental Minimal', short: '留白与捕捉', detail: '横向导航 · 靠近显现 · 底部文件投递槽', accent: '#a55c3e', surface: '#ffffff', duration: .16 },
};
export const initialNotes = (): Note[] => [
  { id: 'capture', title: '下一个想法', text: '先把事情记下来。\n不必现在就把它整理好。', x: 64, y: 96, tag: '随手记录' },
  { id: 'meeting', title: '把工作留在这一页', text: '周一例会\n\n确认方案与交付范围\n整理反馈，留给下一次讨论\n\n想法、草图和文件，放在一起。', x: 392, y: 226, tag: '会议笔记' },
];
export function fileKind(file: File): Asset['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'document';
}
export function bytesLabel(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
export function demoAssets(): Asset[] {
  const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><rect width="480" height="300" fill="#e7ece6"/><rect x="48" y="44" width="172" height="212" rx="6" fill="#fff"/><rect x="244" y="44" width="188" height="96" rx="6" fill="#a1b7a5"/><rect x="244" y="160" width="188" height="96" rx="6" fill="#cad4c8"/><path d="M72 80h112M72 104h84M72 180h100M72 204h68" stroke="#889789" stroke-width="5"/><text x="267" y="99" fill="#fff" font-family="sans-serif" font-size="20">Arasn</text></svg>`;
  const image = new Blob([drawing], { type: 'image/svg+xml' });
  const document = new Blob(['Arasn 视觉探索示例\n\n这些文件只存在于原型的浏览器会话中。\n实际产品文件管理仍使用原有本地存储引擎。'], { type: 'text/plain' });
  return [
    { id: 'image-demo', name: '布局草图.svg', kind: 'image', size: image.size, url: URL.createObjectURL(image), demo: true },
    { id: 'document-demo', name: '方案说明.txt', kind: 'document', size: document.size, url: URL.createObjectURL(document), demo: true },
  ];
}
