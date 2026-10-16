"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const DESTRUTIVO = /excluir|cancelar|estornar|remover/i;

function ConfirmDialog({ message, onDone }: { message: string; onDone: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const destrutivo = DESTRUTIVO.test(message);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal(); // modal nativo: foco preso, Esc fecha
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-msg"
      onClose={(e) => onDone(e.currentTarget.returnValue === "ok")}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close("cancel");
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      <form method="dialog" className="p-5">
        <div className="flex items-start gap-3">
          <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full " + (destrutivo ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700")} aria-hidden="true">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              {destrutivo ? <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /> : <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />}
            </svg>
          </span>
          <p id="confirm-msg" className="whitespace-pre-line pt-2 text-sm text-slate-800">
            {message}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="submit"
            value="cancel"
            autoFocus
            className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Voltar
          </button>
          <button
            type="submit"
            value="ok"
            className={
              "inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold " +
              (destrutivo ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-primary text-on-primary hover:bg-primary-hover")
            }
          >
            Confirmar
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Substitui window.confirm: devolve true se o usuário confirmou. */
export function confirmar(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    root.render(
      <ConfirmDialog
        message={message}
        onDone={(ok) => {
          resolve(ok);
          setTimeout(() => {
            root.unmount();
            el.remove();
          }, 0);
        }}
      />,
    );
  });
}
