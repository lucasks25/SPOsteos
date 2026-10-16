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

/** Exibe um toast no canto inferior direito (centralizado no celular). Pode ser chamado de qualquer componente cliente. */
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
    <div className={`pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-center gap-2.5 rounded-lg border border-l-[3px] border-slate-200 bg-white py-2 pl-3 pr-1.5 text-sm text-slate-900 shadow-xl ${erro ? "border-l-rose-600" : "border-l-emerald-600"}`}>
      <Icon name={erro ? "alerta" : "ok"} size={16} className={erro ? "shrink-0 text-rose-700" : "shrink-0 text-emerald-700"} aria-hidden="true" />
      <span className="flex-1 font-medium">{item.msg}</span>
      <button type="button" onClick={() => dismissToast(item.id)} aria-label="Fechar aviso" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900">
        <Icon name="fechar" size={14} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:translate-x-0 sm:items-end">
      {list.map((i) => (
        <ToastItem key={i.id} item={i} />
      ))}
    </div>
  );
}
