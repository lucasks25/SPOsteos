"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

/** Abas de pasta do Painel clássico (padrão "tabs" do WAI-ARIA: setas, Home e End trocam de aba). */
export function AbasJanela({ abas }: { abas: { rotulo: string; conteudo: ReactNode }[] }) {
  const [atual, setAtual] = useState(0);
  const id = useId();
  const teclado = (e: KeyboardEvent) => {
    const n = abas.length;
    const prox = { ArrowRight: (atual + 1) % n, ArrowLeft: (atual - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    setAtual(prox);
    document.getElementById(`${id}-aba-${prox}`)?.focus();
  };
  return (
    <div className="min-w-0">
      <div role="tablist" aria-label="Seções do painel" className="abas-pasta" onKeyDown={teclado}>
        {abas.map((a, i) => (
          <button
            key={a.rotulo}
            id={`${id}-aba-${i}`}
            type="button"
            role="tab"
            aria-selected={i === atual}
            aria-controls={`${id}-painel-${i}`}
            tabIndex={i === atual ? 0 : -1}
            onClick={() => setAtual(i)}
            className="aba-pasta"
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a, i) => (
        <div key={a.rotulo} id={`${id}-painel-${i}`} role="tabpanel" aria-labelledby={`${id}-aba-${i}`} hidden={i !== atual} className="aba-painel">
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
