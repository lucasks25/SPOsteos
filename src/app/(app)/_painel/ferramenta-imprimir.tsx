"use client";

import { Icon } from "@/components/icons";

/** Botão "Imprimir" da barra de ferramentas do Painel clássico. */
export function FerramentaImprimir() {
  return (
    <button type="button" className="ferramenta" onClick={() => window.print()}>
      <Icon name="impressora" size={18} aria-hidden="true" />
      Imprimir
    </button>
  );
}
