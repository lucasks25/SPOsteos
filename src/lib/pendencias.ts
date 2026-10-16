import "server-only";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import type { Perfil } from "@/generated/prisma/client";
import type { IconName } from "@/components/icons";
import { hojeUTC } from "@/app/(app)/financeiro/_lib/datas";
import { faixasAbertas } from "@/app/(app)/financeiro/_lib/painel";
import { contarAlertas } from "@/app/(app)/qualidade/_lib/documentos-servico";

const DIA = 24 * 60 * 60 * 1000;

/** Meia-noite de hoje em Brasília (UTC−3). */
export function hojeSP() {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(`${agora.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

const ve = (perfil: Perfil, ...perfis: Perfil[]) => perfil === "ADMIN" || perfis.includes(perfil);

/** Quais áreas o perfil enxerga (mesma regra do painel). */
export function areasDoPerfil(p: Perfil) {
  return {
    comercial: ve(p, "COMERCIAL", "FINANCEIRO"),
    financeiro: ve(p, "FINANCEIRO"),
    estoque: ve(p, "ESTOQUE", "QUALIDADE", "COMPRAS", "COMERCIAL"),
    documentos: ve(p, "QUALIDADE", "COMPRAS"),
    recolhimentos: ve(p, "QUALIDADE", "ESTOQUE"),
  };
}

export type DadosPendencias = {
  recVencido: { qtd: number; valor: number };
  pagar7: { qtd: number; valor: number };
  pagarFaixas: Awaited<ReturnType<typeof faixasAbertas>> | null;
  recFaixas: Awaited<ReturnType<typeof faixasAbertas>> | null;
  lotesVencendo: number;
  abaixoMin: number;
  aFaturar: number;
  remessas: number;
  quarentena: number;
  registros: number;
  aprovacoes: number;
  /** documentos/licenças vencidos e a vencer em até 30 dias (QUALIDADE, COMPRAS e ADMIN) */
  documentos: { vencidos: number; vencendo30: number; total: number };
  /** recolhimentos de lote em aberto/andamento e os com prazo vencido (QUALIDADE, ESTOQUE e ADMIN) */
  recolhimentos: { abertos: number; vencidos: number };
};

export type Pendencia = { key: string; href: string; icon: IconName; tom: "warn" | "danger"; titulo: string; nota: string; acao: string; qtd: number };

const vazia = { qtd: 0, valor: 0 };
const semDocumentos = { vencidos: 0, vencendo30: 0, total: 0 };
const semRecolhimentos = { abertos: 0, vencidos: 0 };

async function contarRecolhimentos(hoje: Date) {
  const ativo = { status: { in: ["ABERTO", "EM_ANDAMENTO"] as ("ABERTO" | "EM_ANDAMENTO")[] } };
  const [abertos, vencidos] = await Promise.all([db.recolhimento.count({ where: ativo }), db.recolhimento.count({ where: { ...ativo, prazo: { lt: hoje } } })]);
  return { abertos, vencidos };
}

/**
 * Números que alimentam o painel e o sino de pendências. Só consulta o que o perfil enxerga
 * (o resto volta zerado). Única fonte: o painel e GET /api/pendencias usam esta função.
 */
export async function carregarPendencias(perfil: Perfil): Promise<DadosPendencias> {
  const { comercial, financeiro, estoque, documentos, recolhimentos } = areasDoPerfil(perfil);
  const hoje = hojeSP();
  const hojeFin = hojeUTC();
  const em30 = new Date(hoje.getTime() + 30 * DIA);
  const em90 = new Date(hoje.getTime() + 90 * DIA);
  const zero = Promise.resolve(0);

  const [recFaixas, pagarFaixas, aFaturar, quarentena, lotesVencendo, produtos, saldosLib, registros, remessas, aprovacoes, docs, recolh] = await Promise.all([
    financeiro ? faixasAbertas("receber", hojeFin) : Promise.resolve(null),
    financeiro ? faixasAbertas("pagar", hojeFin) : Promise.resolve(null),
    comercial ? db.cirurgia.count({ where: { status: "REALIZADA" } }) : zero,
    estoque ? db.lote.count({ where: { status: "QUARENTENA", saldos: { some: { quantidade: { gt: 0 } } } } }) : zero,
    estoque ? db.lote.count({ where: { validade: { lt: em30 }, saldos: { some: { quantidade: { gt: 0 } } } } }) : zero,
    estoque ? db.produto.findMany({ where: { ativo: true, estoqueMinimo: { gt: 0 } }, select: { id: true, estoqueMinimo: true } }) : Promise.resolve([]),
    estoque
      ? db.saldo.groupBy({ by: ["produtoId"], where: { quantidade: { gt: 0 }, local: { tipo: { in: ["DEPOSITO", "HOSPITAL"] } }, lote: { status: "LIBERADO", validade: { gte: hoje } } }, _sum: { quantidade: true } })
      : Promise.resolve([]),
    estoque ? db.produto.count({ where: { ativo: true, validadeRegistro: { lt: em90 } } }) : zero,
    estoque ? db.remessa.count({ where: { status: "ENVIADA" } }) : zero,
    financeiro ? db.contaPagar.count({ where: { aprovadoEm: null, status: "ABERTO" } }) : zero,
    documentos ? contarAlertas(hojeFin) : Promise.resolve(semDocumentos),
    recolhimentos ? contarRecolhimentos(hojeFin) : Promise.resolve(semRecolhimentos),
  ]);

  const saldoMap = new Map(saldosLib.map((s) => [s.produtoId, s._sum.quantidade ?? 0]));
  const abaixoMin = produtos.filter((x) => (saldoMap.get(x.id) ?? 0) < x.estoqueMinimo).length;
  const p = pagarFaixas;
  return {
    recVencido: recFaixas?.vencido ?? vazia,
    pagar7: p ? { qtd: p.vencido.qtd + p.hoje.qtd + p.ate7.qtd, valor: p.vencido.valor + p.hoje.valor + p.ate7.valor } : vazia,
    pagarFaixas,
    recFaixas,
    lotesVencendo,
    abaixoMin,
    aFaturar,
    remessas,
    quarentena,
    registros,
    aprovacoes,
    documentos: docs,
    recolhimentos: recolh,
  };
}

/** Lista de pendências (só as com quantidade > 0), em ordem de gravidade. */
export function listarPendencias(d: DadosPendencias): Pendencia[] {
  const itens: Pendencia[] = [];
  const add = (key: string, qtd: number, p: Omit<Pendencia, "key" | "qtd">) => {
    if (qtd > 0) itens.push({ key, qtd, ...p });
  };
  const rc = d.recolhimentos;
  add("recol", rc.abertos, { href: "/qualidade/recolhimentos", icon: "alerta", tom: rc.vencidos > 0 ? "danger" : "warn", titulo: `${rc.abertos} recolhimento(s) de lote em aberto`, nota: rc.vencidos > 0 ? `${rc.vencidos} com prazo vencido` : "ação de campo em andamento", acao: "Acompanhar" });
  add("rec", d.recVencido.qtd, { href: "/financeiro/receber?vencidos=1", icon: "receber", tom: "danger", titulo: `${d.recVencido.qtd} título(s) a receber vencido(s)`, nota: `${money(d.recVencido.valor)} em atraso`, acao: "Cobrar" });
  add("venc", d.lotesVencendo, { href: "/qualidade/lotes", icon: "alerta", tom: "danger", titulo: `${d.lotesVencendo} lote(s) vencido(s) ou vencendo`, nota: "validade em até 30 dias, com saldo", acao: "Abrir" });
  add("min", d.abaixoMin, { href: "/compras/sugestao", icon: "tendencia", tom: "danger", titulo: `${d.abaixoMin} produto(s) abaixo do mínimo`, nota: "disponível liberado insuficiente", acao: "Comprar" });
  add("pag", d.pagar7.qtd, { href: "/financeiro/pagar", icon: "pagar", tom: "warn", titulo: `${d.pagar7.qtd} título(s) a pagar em 7 dias`, nota: `${money(d.pagar7.valor)}, incluindo atrasados`, acao: "Ver" });
  add("apr", d.aprovacoes, { href: "/financeiro/aprovacoes", icon: "escudo", tom: "warn", titulo: `${d.aprovacoes} conta(s) a pagar para aprovar`, nota: "aguardando aprovação do financeiro", acao: "Aprovar" });
  add("fat", d.aFaturar, { href: "/comercial/cirurgias?status=REALIZADA", icon: "documento", tom: "warn", titulo: `${d.aFaturar} cirurgia(s) a faturar`, nota: "realizadas sem pedido de venda", acao: "Faturar" });
  add("rem", d.remessas, { href: "/estoque/remessas?status=ENVIADA", icon: "caminhao", tom: "warn", titulo: `${d.remessas} remessa(s) a conferir`, nota: "vales enviados aos hospitais", acao: "Conferir" });
  add("qua", d.quarentena, { href: "/qualidade/quarentena", icon: "frasco", tom: "warn", titulo: `${d.quarentena} lote(s) em quarentena`, nota: "aguardando inspeção", acao: "Inspecionar" });
  const dv = d.documentos;
  add("doc", dv.total, { href: `/qualidade/documentos?situacao=ATENCAO`, icon: "documento", tom: dv.vencidos > 0 ? "danger" : "warn", titulo: `${dv.total} documento(s) vencido(s) ou a vencer em 30 dias`, nota: dv.vencidos > 0 ? `${dv.vencidos} já vencido(s)` : "licenças e certificados a renovar", acao: "Renovar" });
  add("reg", d.registros, { href: "/qualidade/registros", icon: "livro", tom: "warn", titulo: `${d.registros} registro(s) ANVISA a vencer`, nota: "vencidos ou vencendo em 90 dias", acao: "Revisar" });
  return itens;
}
