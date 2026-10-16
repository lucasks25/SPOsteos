/**
 * EXCEÇÕES TEMPORÁRIAS do verificador de arquitetura (scripts/verificar-arquitetura.ts).
 *
 * É a dívida existente em 16/10/2026, congelada para o repositório seguir verde enquanto o backlog de
 * docs/ARQUITETURA.md é executado. Regras:
 *  - NÃO acrescente linhas para fazer uma violação nova passar. Corrija o código (kernel, publico.ts ou mover a tela).
 *  - Ao executar um item do backlog, apague as linhas dele; exceção que deixou de acontecer FALHA o verificador.
 *  - Ciclo: a linha descreve o conjunto de módulos do ciclo. Quando ele encolher, troque pela linha nova que o
 *    verificador imprimir (nunca por um conjunto maior).
 */
export type Excecao = { regra: string; de: string; para: string; item: string };

export const EXCECOES: readonly Excecao[] = [
  { regra: "ui-cruzada", de: "src/app/(app)/cadastros/fabricantes/[id]/page.tsx", para: "src/app/(app)/qualidade/documentos/documentos-card.tsx", item: "UI-03" },
  { regra: "ui-cruzada", de: "src/app/(app)/cadastros/fornecedores/[id]/page.tsx", para: "src/app/(app)/qualidade/documentos/documentos-card.tsx", item: "UI-03" },
  { regra: "ui-cruzada", de: "src/app/(app)/cadastros/produtos/[id]/page.tsx", para: "src/app/(app)/qualidade/documentos/documentos-card.tsx", item: "UI-03" },
  { regra: "modulo-cruzado", de: "src/app/(app)/comercial/_lib/nf.ts", para: "src/app/(app)/financeiro/_lib/plano.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/compras/_lib/importacao-servico.ts", para: "src/app/(app)/financeiro/_lib/fechamento.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/compras/_lib/importacao-servico.ts", para: "src/app/(app)/financeiro/_lib/plano.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/compras/_lib/recebimento.ts", para: "src/app/(app)/financeiro/_lib/plano.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/_lib/consultas.ts", para: "src/app/(app)/financeiro/_lib/glosa-categorias.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/_lib/dados.ts", para: "src/app/(app)/comercial/_lib/opcoes.ts", item: "ARQ-10" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/_lib/dados.ts", para: "src/app/(app)/financeiro/_lib/glosa-categorias.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/_lib/glosas.ts", para: "src/app/(app)/financeiro/_lib/glosa-categorias.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/abc/page.tsx", para: "src/app/(app)/comercial/_lib/opcoes.ts", item: "ARQ-10" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/glosas/exportar/route.ts", para: "src/app/(app)/financeiro/_lib/glosa-categorias.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/glosas/page.tsx", para: "src/app/(app)/comercial/_lib/opcoes.ts", item: "ARQ-10" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/glosas/page.tsx", para: "src/app/(app)/financeiro/_lib/glosa-categorias.ts", item: "ARQ-06" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/margem/page.tsx", para: "src/app/(app)/comercial/_lib/opcoes.ts", item: "ARQ-10" },
  { regra: "modulo-cruzado", de: "src/app/(app)/gestao/vendas/page.tsx", para: "src/app/(app)/comercial/_lib/opcoes.ts", item: "ARQ-10" },
  { regra: "lib-importa-ui", de: "src/lib/pendencias.ts", para: "src/components/icons.tsx", item: "ARQ-05" },
  { regra: "kernel-importa-app", de: "src/lib/pendencias.ts", para: "src/app/(app)/financeiro/_lib/painel.ts", item: "ARQ-05" },
  { regra: "kernel-importa-app", de: "src/lib/pendencias.ts", para: "src/app/(app)/comercial/_lib/autorizacao-servico.ts", item: "ARQ-05" },
  { regra: "kernel-importa-app", de: "src/lib/pendencias.ts", para: "src/app/(app)/qualidade/_lib/documentos-servico.ts", item: "ARQ-05" },
  { regra: "escrita-alheia", de: "src/app/(app)/cadastros/hospitais/actions.ts", para: "localEstoque", item: "ARQ-09" },
  { regra: "escrita-alheia", de: "src/app/(app)/comercial/_lib/nf.ts", para: "contaReceber", item: "ARQ-06" },
  { regra: "escrita-alheia", de: "src/app/(app)/compras/_lib/importacao-servico.ts", para: "contaPagar", item: "ARQ-06" },
  { regra: "escrita-alheia", de: "src/app/(app)/compras/_lib/recebimento.ts", para: "lote", item: "ARQ-08" },
  { regra: "escrita-alheia", de: "src/app/(app)/compras/_lib/recebimento.ts", para: "produto", item: "ARQ-09" },
  { regra: "escrita-alheia", de: "src/app/(app)/compras/_lib/recebimento.ts", para: "contaPagar", item: "ARQ-06" },
];
