import { Abas } from "@/components/ui";
import { NAV } from "@/components/nav";

/**
 * Barra de abas de um item do menu (docs/MENU-REFERENCIA.md). As abas saem de src/components/nav.ts: o item pai e os
 * itens com `abaDe` apontando para ele. `atual` é o href da própria tela (um item do nav.ts); mesmo menu e mesmas
 * abas, numa fonte só. Sem irmãos, não mostra nada. Coloque logo abaixo do PageHeader.
 */
export function AbasNav({ atual }: { atual: string }) {
  const itens = NAV.flatMap((g) => g.items);
  const pai = itens.find((i) => i.href === atual)?.abaDe ?? atual;
  const abas = itens.filter((i) => i.href === pai || i.abaDe === pai);
  if (abas.length < 2) return null;
  return <Abas itens={abas.map((i) => ({ href: i.href, label: i.aba ?? i.label, ativo: i.href === atual }))} />;
}
