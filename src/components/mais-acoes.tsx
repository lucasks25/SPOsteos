"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";

/**
 * Menu "Mais ações" (botão pílula com seta) para as ações secundárias de um cabeçalho ou barra de tabela.
 * Os filhos podem ser LinkButton, ActionButton, PrintButton ou <a>: dentro do menu eles viram itens de lista.
 * Fecha com Esc (devolvendo o foco ao botão), ao clicar fora e depois de escolher um item.
 */
export function MaisAcoes({ children, rotulo = "Mais ações", alinhar = "direita" }: { children: ReactNode; rotulo?: string; alinhar?: "direita" | "esquerda" }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    // foco no primeiro item ao abrir
    raiz.current?.querySelector<HTMLElement>(`[id="${id}"] :is(a,button)`)?.focus();
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, id]);

  const setas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const itens = Array.from(raiz.current?.querySelectorAll<HTMLElement>(`[id="${id}"] :is(a,button):not(:disabled)`) ?? []);
    if (!itens.length) return;
    e.preventDefault();
    const i = itens.indexOf(document.activeElement as HTMLElement);
    itens[(i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length].focus();
  };

  return (
    <div ref={raiz} className="relative print:hidden" onKeyDown={setas}>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls={id}
        className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-300 bg-white pl-4 pr-3 text-sm font-semibold text-slate-800 transition-colors hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
      >
        {rotulo}
        <Icon name="seta" size={16} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      <div
        id={id}
        hidden={!aberto}
        onClick={(e) => {
          // fecha depois de um clique num link; botões de formulário fecham ao enviar (o diálogo de confirmação abre por cima)
          if ((e.target as HTMLElement).closest("a")) setAberto(false);
        }}
        className={[
          "absolute top-12 z-50 min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl",
          alinhar === "direita" ? "right-0" : "left-0",
          // os botões de dentro viram itens de menu (o seletor descendente vence a classe do botão)
          "flex flex-col [&_form]:w-full [&_form]:flex",
          "[&_:is(a,button)]:h-9 [&_:is(a,button)]:w-full [&_:is(a,button)]:justify-start [&_:is(a,button)]:rounded-lg [&_:is(a,button)]:border-0 [&_:is(a,button)]:bg-transparent [&_:is(a,button)]:px-3 [&_:is(a,button)]:font-medium [&_:is(a,button)]:shadow-none [&_:is(a,button)]:after:hidden",
          "[&_:is(a,button):hover]:bg-slate-100 [&_:is(a,button):focus-visible]:bg-slate-100",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
