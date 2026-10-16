"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "@/components/icons";

type Kind = "ok" | "erro" | "info";
type Item = { id: number; msg: string; kind: Kind };

const DURACAO_MS = 4000;
let items: Item[] = [];
let seq = 0;
let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getSnapshot = () => items;
const getServerSnapshot = () => [] as Item[];

/** Cria, na primeira chamada, o contêiner no <body> que recebe o <ToastHost/>. */
function ensureHost() {
  if (host || typeof document === "undefined") return;
  host = document.createElement("div");
  host.setAttribute("data-toast-host", "");
  document.body.appendChild(host);
  createRoot(host).render(<ToastHost />);
}

export function dismissToast(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

/** Exibe um toast (MessageToast do Fiori) centralizado no rodapé da tela. Pode ser chamado de qualquer componente cliente. */
export function toast(msg: string, kind: Kind = "ok") {
  if (typeof document === "undefined") return;
  ensureHost();
  items = [...items, { id: ++seq, msg, kind }].slice(-5);
  emit();
}

export function useToast() {
  return toast;
}

function ToastItem({ item }: { item: Item }) {
  useEffect(() => {
    const t = setTimeout(() => dismissToast(item.id), DURACAO_MS);
    return () => clearTimeout(t);
  }, [item.id]);
  const erro = item.kind === "erro";
  return (
    <div className="pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[var(--shadow-overlay)]">
      <Icon name={erro ? "alerta" : "ok"} size={16} className={erro ? "mt-0.5 shrink-0 text-rose-600" : "mt-0.5 shrink-0 text-emerald-600"} />
      <span className="flex-1">{item.msg}</span>
      <button type="button" onClick={() => dismissToast(item.id)} aria-label="Fechar aviso" className="-mr-1 rounded px-1 text-base leading-none text-slate-500 hover:text-slate-900">
        ×
      </button>
    </div>
  );
}

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((i) => (
        <ToastItem key={i.id} item={i} />
      ))}
    </div>
  );
}
