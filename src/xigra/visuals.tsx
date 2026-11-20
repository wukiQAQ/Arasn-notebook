import type { ReactNode } from "react";
import type { BoardClient } from "../board";
import { Button } from "../Button";

export function XigraBrand({ markOnly = false }: { markOnly?: boolean }) {
  return (
    <strong className="xigra-brand">
      <img className="xigra-brand-mark" src="/assets/arasn-icon.svg" width="36" height="36" alt="" />
      <span className={markOnly ? "sr-only" : "xigra-wordmark"}>Arasn</span>
    </strong>
  );
}

type Tone = "neutral" | "saved" | "pending" | "warning" | "error";

export function StatusPill({ children, tone, className = "", live = false }: {
  children: ReactNode;
  tone: Tone;
  className?: string;
  live?: boolean;
}) {
  return (
    <span className={`xigra-status ${className}`} data-tone={tone} role={live ? "status" : undefined}>
      <i className="dot" aria-hidden="true" />{children}
    </span>
  );
}

export function SaveStatus({ client, recordId, empty = false, volatile = false }: { client: BoardClient; recordId?: string; empty?: boolean; volatile?: boolean }) {
  const { tone, label } = volatile ? { tone: "pending" as const, label: "尚未落盘" } : client.saveState(recordId, empty);
  return <StatusPill className="save-state xigra-save-state" tone={tone} live>{label}</StatusPill>;
}

export function SaveRecoveryActions({ client, copy, text }: { client: BoardClient; copy(value: string): void; text?: string }) {
  const conflicts = client.conflicts.length;
  return <>
    {client.canRetry && <button onClick={() => client.retry()}>重试保存</button>}
    {conflicts > 0 && <button onClick={() => client.recover()}>恢复 {conflicts} 条本机改动为新内容</button>}
    {client.hasFailedDeletions && <button onClick={() => client.keepFailedDeletes()}>清除删除失败提示</button>}
    {text && <button onClick={() => copy(text)}>复制正文</button>}
    {client.detachedRecovery && <button onClick={() => copy(client.detachedRecovery)}>复制旧恢复副本</button>}
  </>;
}
