import { ArrowLeft, Copy, Network, RefreshCw } from 'lucide-react';
import type { DesktopInfo } from '../board';
import { NetworkPicker } from './NetworkPicker';
import { HelpPopover } from './HelpPopover';

export type ShareOperation = 'start' | 'stop' | 'refresh';

export function WhiteboardShare({ info, desktop, address, working, operation, error, retry,
  onAddress, onShare, onRefresh, onCopy, onBack }: {
  info: DesktopInfo | null; desktop: boolean; address: string; working: boolean;
  operation: ShareOperation | null; error: string; retry?: () => void;
  onAddress(value: string): void; onShare(enabled: boolean): void; onRefresh(): void;
  onCopy(value: string): void; onBack(): void;
}) {
  const unavailable = Boolean(info?.sharing && !info.shareAddressAvailable);
  const failed = Boolean(error) || unavailable;
  const state = operation === 'start' ? 'starting' : operation === 'stop' ? 'stopping'
    : failed ? 'failed' : info?.sharing ? 'active' : !info && desktop ? 'loading' : 'off';
  const label = { starting: '启动中', stopping: '停止中', failed: '失败', active: '共享中', loading: '读取中', off: '未开启' }[state];
  return <div className="whiteboard-share">
    {desktop && <button className="button share-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />返回设备互传</button>}
    <header className="share-heading">
      <span className="share-device-icon"><Network size={24} strokeWidth={1.65} aria-hidden="true" /></span>
      <div className="network-help-heading"><h2>局域网白板共享</h2><HelpPopover topic="share" /></div>
    </header>
    {desktop ? <>
      <section className="share-status" data-share-state={state} aria-label="白板共享状态">
        <div className="share-status-line" role="status" aria-live="polite" aria-atomic="true">
          <span className="share-status-dot" aria-hidden="true" /><strong>{label}</strong>
          {operation === 'refresh' && <span>正在刷新网络…</span>}
        </div>
        {info?.sharing && <p>正在监听 {info.shareHost}。{failed && '共享服务仍在运行。'}</p>}
        {!info?.sharing && failed && <p>共享尚未开启，处理下方问题后可重试。</p>}
        {error && <div className="share-error" role="alert"><span>{error.replace(/^Error invoking remote method '[^']+': Error: /, '')}</span>
          {retry && <button className="button" disabled={working} onClick={retry}>重试</button>}</div>}
        {unavailable && !error && <p className="share-error" role="alert">监听地址已不可用，请停止共享，检查 Wi-Fi 或网线后刷新。</p>}
      </section>
      <section className="share-setup" aria-label="共享网络与操作" aria-busy={working}>
        <NetworkPicker label="共享网卡" interfaces={info?.networks || []} value={address} onChange={onAddress} disabled={working || Boolean(info?.sharing)} />
        {info?.sharing && <p className="network-status">切换网卡需先停止共享；外部是否能连接尚未验证。</p>}
        <div className="share-actions">
          <button className="button" disabled={working} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" />{operation === 'refresh' ? '正在刷新…' : '刷新网络'}</button>
          <button className={info?.sharing ? 'button share-stop' : 'button primary'} disabled={working || (!info?.sharing && !address)} onClick={() => onShare(!info?.sharing)}>
            {operation === 'start' ? '正在开启…' : operation === 'stop' ? '正在停止…' : info?.sharing ? '停止共享' : '开启共享'}
          </button>
        </div>
      </section>
      {!!info?.links.length && <section className="share-addresses" aria-label="共享地址">
        <h3>共享地址</h3>
        {info.links.map(link => <div className="share-link" key={link}>
          <input aria-label="共享链接" value={link} readOnly onFocus={event => event.target.select()} />
          <button className="button" aria-label="复制共享链接" onClick={() => onCopy(link)}><Copy size={15} aria-hidden="true" />复制地址</button>
        </div>)}
      </section>}
    </> : <p className="modal-tip">你正在访问共享页面。共享开关和邀请链接由主机上的桌面应用管理。</p>}
    <aside className="share-privacy"><h3>访问范围</h3><p className="share-scope">本机文件、附件和关系画布不共享。</p><p>持有链接的人都能查看和编辑共享文字与笔迹，无需设备配对或批准。HTTP 传输未加密，仅在可信局域网使用。</p></aside>
  </div>;
}
