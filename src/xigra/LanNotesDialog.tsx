import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "../LagoonIcons";
import { NetworkPicker, type NetworkInterface } from './NetworkPicker';
import { AppSelect } from './AppSelect';
import "./lan-notes.css";

type Peer = { fingerprint: string; host: string; port: number; name: string };
type Task = { id: string; title: string; name: string; status: "waiting" | "sending" | "saved" | "rejected" | "failed"; error?: string };
type Offer = { id: string; key: string; name: string; title: string; bytes: number; status: "waiting" | "accepted" | "saved" | "rejected" };
type LanView = {
  addresses: string[];
  interfaces: NetworkInterface[];
  addressAvailable: boolean;
  active: boolean;
  host: string | null;
  peers: Peer[];
  candidates: Omit<Peer, "name">[];
  incoming: Offer[];
  received: Offer[];
  outgoing: Task[];
};
type Invitation = { code: string; fingerprint: string };
export type LanBridge = {
  view(): Promise<LanView>;
  start(host: string): Promise<LanView>;
  stop(): Promise<LanView>;
  invite(): Promise<Invitation>;
  pair(code: string, fingerprint: string): Promise<LanView>;
  revoke(fingerprint: string): Promise<LanView>;
  send(id: string, fingerprint: string): Promise<Task>;
  respond(id: string, accept: boolean): Promise<LanView>;
  retry(id: string): Promise<Task>;
  onChanged(callback: () => void): () => void;
  onOpen(callback: () => void): () => void;
};
export type LanRequest = { note?: { id: string; title: string } };

const statusLabel: Record<Task["status"], string> = {
  waiting: "等待对方确认", sending: "正在传送", saved: "对方已保存", rejected: "对方已拒绝", failed: "发送失败",
};

export function LanNotesDialog({ lan, request, close, onIncoming }: {
  lan: LanBridge;
  request: LanRequest | null;
  close(): void;
  onIncoming(count: number): void;
}) {
  const [view, setView] = useState<LanView>();
  const [address, setAddress] = useState("");
  const [peer, setPeer] = useState("");
  const [code, setCode] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [invitation, setInvitation] = useState<Invitation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void lan.view().then(next => {
        if (!mounted) return;
        setView(next);
        onIncoming(next.incoming.length);
      }).catch(reason => { if (mounted) setError(reason.message); });
    };
    const unsubscribe = lan.onChanged(refresh);
    refresh();
    return () => { mounted = false; unsubscribe(); };
  }, [lan, onIncoming, Boolean(request)]);

  async function act(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
      const next = await lan.view();
      setView(next);
      onIncoming(next.incoming.length);
    } catch (reason) {
      setError((reason as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ""));
    } finally {
      setBusy(false);
    }
  }

  const network = view?.active ? view.host || '' : view?.addresses.includes(address) ? address : view?.addresses[0] || "";
  const receiver = view?.peers.some(device => device.fingerprint === peer) ? peer : view?.peers[0]?.fingerprint || "";

  return <Dialog.Root open={Boolean(request)} onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="desk-backdrop" />
      <Dialog.Popup className="modal xigra-lan-dialog">
        <Dialog.Close className="icon-button modal-close" aria-label="关闭便签互传"><X size={18} /></Dialog.Close>
        <Dialog.Title>便签互传</Dialog.Title>
        <Dialog.Description>向已配对的设备发送文字便签。对方确认后才会收到正文。</Dialog.Description>
        {error && <p className="xigra-notice" data-tone="error" role="alert">{error}</p>}
        {view && <div className="xigra-lan-sections">
          <section aria-label="局域网状态" className="xigra-lan-row">
            <NetworkPicker interfaces={view.interfaces} value={network} onChange={setAddress} disabled={busy || view.active} />
            <div className="network-actions">
              <button className="button" disabled={busy} onClick={() => void act(async () => {})}>刷新网络</button>
              {view.active
                ? <button className="button" disabled={busy} onClick={() => void act(async () => { await lan.stop(); setInvitation(undefined); })}>关闭局域网</button>
                : <button className="button primary" disabled={busy || !network} onClick={() => void act(() => lan.start(network))}>开启局域网</button>}
            </div>
            <p className="network-status" role="status">{view.active ? `正在监听 ${view.host}，仅已配对设备可请求发送。切换网卡需先关闭局域网。` : '选择与对方处于同一局域网的网卡。'}</p>
            {!view.addressAvailable && <p className="xigra-notice" data-tone="warning" role="alert">监听地址已不可用，请关闭局域网，刷新后重新选择。</p>}
          </section>

          {request?.note && <section aria-label="发送便签">
            <h3>发送便签</h3>
            <p className="xigra-lan-title">{request.note.title}</p>
            <form className="xigra-lan-row" onSubmit={event => {
              event.preventDefault();
              const id = request.note?.id;
              if (id && receiver) void act(() => lan.send(id, receiver));
            }}>
              <div className="network-picker"><span className="field-label">接收设备</span><AppSelect label="接收设备" value={receiver} disabled={!receiver || busy} onValueChange={setPeer}
                options={view.peers.length ? view.peers.map(device => ({ value: device.fingerprint, label: `${device.name} · ${device.host}` })) : [{ value: '', label: '请先配对设备' }]} /></div>
              <button className="button primary" disabled={!view.active || !receiver || busy}>发送便签</button>
            </form>
          </section>}

          {view.incoming.length > 0 && <section aria-label="待接收便签">
            <h3>待接收</h3>
            <ul>{view.incoming.map(offer => <li key={offer.key}>
              <strong>{offer.title}</strong>
              <small>{offer.name} · {offer.bytes} B</small>
              <div className="xigra-lan-row xigra-lan-decisions">
                <button className="button" disabled={busy} onClick={() => void act(() => lan.respond(offer.key, false))}>拒绝</button>
                <button className="button primary" disabled={busy} onClick={() => void act(() => lan.respond(offer.key, true))}>接收便签</button>
              </div>
            </li>)}</ul>
          </section>}

          {view.received.length > 0 && <section aria-label="接收记录">
            <h3>最近接收</h3>
            <ul>{view.received.map(offer => <li key={offer.key}>
              <strong>{offer.title}</strong>
              <span role="status">{offer.status === "saved" ? "已保存到便签" : offer.status === "accepted" ? "已同意，等待正文" : "已拒绝"}</span>
            </li>)}</ul>
          </section>}

          <details>
            <summary>设备配对与撤销</summary>
            <p>两台电脑都开启局域网，各自生成并交换配对信息，再通过独立渠道核对完整 SHA-256 指纹。配对信息有效期 2 分钟。</p>
            {view.active && <>
              <button className="button" disabled={busy} onClick={() => void act(async () => { setInvitation(await lan.invite()); setCopied(false); })}>生成本机配对信息</button>
              {invitation && <div className="xigra-lan-invite">
                <label>本机 SHA-256 指纹 <output>{invitation.fingerprint}</output></label>
                <button className="button" disabled={busy} onClick={() => void act(async () => { await window.desktop?.copyText(invitation.code); setCopied(true); })}>{copied ? "已复制本机配对信息" : "复制本机配对信息"}</button>
              </div>}
              <form className="xigra-lan-fields" onSubmit={event => {
                event.preventDefault();
                void act(async () => { await lan.pair(code, fingerprint); setCode(""); setFingerprint(""); });
              }}>
                <label>对方的配对信息<textarea value={code} onChange={event => setCode(event.target.value)} maxLength={8192} rows={2} required /></label>
                <label>已核对的对方 SHA-256 指纹<input value={fingerprint} onChange={event => setFingerprint(event.target.value)} maxLength={120} required /></label>
                <button className="button primary" disabled={busy || !code.trim() || !fingerprint.trim()}>保存配对</button>
              </form>
              {view.candidates.length > 0 && <div>
                <p>发现的设备。交换配对信息后可发送。</p>
                <ul>{view.candidates.map(candidate => <li key={`${candidate.fingerprint}:${candidate.host}:${candidate.port}`}>
                  {candidate.host}:{candidate.port} · {view.peers.find(device => device.fingerprint === candidate.fingerprint)?.name || "待配对"}
                </li>)}</ul>
              </div>}
            </>}
            <ul>{view.peers.map(device => <li key={device.fingerprint} className="xigra-lan-row">
              <span>{device.name} <small>{device.host}:{device.port}</small></span>
              <button className="button" disabled={busy} onClick={() => void act(() => lan.revoke(device.fingerprint))}>撤销配对</button>
            </li>)}</ul>
          </details>

          {view.outgoing.length > 0 && <section aria-label="发送记录">
            <h3>本次运行的发送记录</h3>
            <ul>{view.outgoing.map(task => <li key={task.id}>
              <strong>{task.title}</strong>
              <span role="status">{task.name} · {statusLabel[task.status]}</span>
              {task.error && <small>{task.error}</small>}
              {task.status === "failed" && <button className="button" disabled={busy || !view.active} onClick={() => void act(() => lan.retry(task.id))}>重试发送</button>}
            </li>)}</ul>
          </section>}
        </div>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
