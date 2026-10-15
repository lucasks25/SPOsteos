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
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <form method="dialog" className="space-y-4 p-4">
        <p id="confirm-msg" className="text-[13px]">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            value="cancel"
            autoFocus
            className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-[13px] text-slate-700 hover:bg-slate-50"
          >
            Voltar
          </button>
          <button
            type="submit"
            value="ok"
            className={
              "inline-flex h-8 items-center rounded border px-3 text-[13px] font-medium text-white " +
              (destrutivo ? "border-rose-700 bg-rose-600 hover:bg-rose-700" : "border-teal-700 bg-teal-700 hover:bg-teal-800")
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
