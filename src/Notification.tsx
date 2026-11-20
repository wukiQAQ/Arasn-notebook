import { IconButton } from "./Button";
import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert } from 'lucide-react';
import './Notification.css';

type Notice = { message: string; tone: 'neutral' | 'success' | 'error' | 'warning'; duration: number | null; retry?: () => Promise<void>; detail?: string; actions?: { label: string; run(): void }[]; placement?: 'corner'; source?: 'save' };

function useNotificationState() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismiss = useCallback(() => setNotice(null), []);
  // A new object also restarts the timer when the same message is sent again.
  const notify = useCallback((message: string, options: Partial<Omit<Notice, 'message'>> = {}) => setNotice(message ? { message, tone: 'neutral', duration: options.tone === 'error' ? null : 2000, ...options } : null), []);
  const settingsNotice = useCallback((message: string, retry?: () => Promise<void>) => {
    setNotice({ message, tone: retry ? 'error' : 'success', duration: retry ? null : 2000, retry });
  }, []);
  return { notice, notify, dismiss, settingsNotice };
}

const NotificationContext = createContext<ReturnType<typeof useNotificationState> | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useNotificationState();
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
export function useNotification() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('NotificationProvider is required');
  return value;
}

export function Notification({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  const [closing, setClosing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [retryError, setRetryError] = useState('');
  const remaining = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setClosing(false);
    setRetrying(false);
    setRetryError('');
    remaining.current = notice?.duration ?? 0;
    setPaused(Boolean(container.current?.matches(':hover') || container.current?.contains(document.activeElement)));
  }, [notice]);
  useEffect(() => {
    if (!notice || notice.duration === null || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => setClosing(true), remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [notice, paused]);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onDismiss, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
    return () => clearTimeout(timer);
  }, [closing, notice, onDismiss]);
  if (!notice) return null;
  return createPortal(<div ref={container} className="app-notification" data-tone={notice.tone} data-closing={closing || undefined} data-placement={notice.placement} data-rich={Boolean(notice.detail || notice.actions || notice.retry) || undefined}
    onPointerEnter={() => { setPaused(true); setClosing(false); }} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setPaused(false); }}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) setPaused(false); }}>
    {notice.tone === 'success' ? <Check className="notification-symbol" size={16} aria-hidden="true"/> : (notice.tone === 'error' || notice.tone === 'warning') ? <CircleAlert className="notification-symbol" size={16} aria-hidden="true"/> : null}
    <div className="app-notification-copy"><span className="app-notification-message" role={notice.tone === 'error' ? 'alert' : 'status'} aria-atomic="true">{notice.message}</span>
      {notice.detail && <small>{notice.detail}</small>}
      {retryError && <small role="alert">{retryError}</small>}
      {notice.actions && <div className="app-notification-actions">{notice.actions.map(action => <button key={action.label} type="button" onClick={() => { onDismiss(); action.run(); }}>{action.label}</button>)}</div>}
    </div>
    {notice.retry && <button type="button" className="app-notification-retry" disabled={retrying} onClick={async () => {
      setRetrying(true);
      try { await notice.retry?.(); setClosing(true); } catch (error) { setRetryError(error instanceof Error ? error.message : String(error)); } finally { setRetrying(false); }
    }}>{retrying ? '重试中…' : '重试'}</button>}
    <IconButton hitArea="compact" className="app-notification-close" aria-label="关闭通知" onClick={() => setClosing(true)}>×</IconButton>
  </div>, document.body);
}
