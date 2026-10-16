import "server-only";
import { money } from "@/lib/format";
import type { Perfil } from "@/generated/prisma/client";
import type { IconName } from "@/components/icons";
import { hojeSP, hojeUTC } from "@/lib/datas";
import { faixasAbertas, contarAprovacoesPendentes, type Faixas } from "@/app/(app)/financeiro/_lib/publico";
import { contarCirurgiasSemAutorizacao, contarAFaturar, contarPedidosSemNf } from "@/app/(app)/comercial/_lib/publico";
import { contarAlertasDocumentos, contarRecolhimentos, contarLotesQuarentena, contarLotesVencendo, contarRegistrosVencendo } from "@/app/(app)/qualidade/_lib/publico";
import { contarRemessasAConferir, contarAbaixoDoMinimo, contarCirurgiasAguardandoVale } from "@/app/(app)/estoque/_lib/publico";

const ve = (perfil: Perfil, ...perfis: Perfil[]) => perfil === "ADMIN" || perfis.includes(perfil);

/** Quais áreas o perfil enxerga (mesma regra do painel). */
export function areasDoPerfil(p: Perfil) {
  return {
    comercial: ve(p, "COMERCIAL", "FINANCEIRO"),
    financeiro: ve(p, "FINANCEIRO"),
    estoque: ve(p, "ESTOQUE", "QUALIDADE", "COMPRAS", "COMERCIAL"),
    documentos: ve(p, "QUALIDADE", "COMPRAS"),
    recolhimentos: ve(p, "QUALIDADE", "ESTOQUE"),
    autorizacoes: ve(p, "COMERCIAL"),
    /** fila de vales: quem gera o vale (estoque) e quem agenda a cirurgia (comercial) */
    vales: ve(p, "ESTOQUE", "COMERCIAL"),
  };
}

export type DadosPendencias = {
  recVencido: { qtd: number; valor: number };
  pagar7: { qtd: number; valor: number };
  pagarFaixas: Faixas | null;
  recFaixas: Faixas | null;
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
  /** cirurgias nos próximos 7 dias, em convênio que exige autorização, sem guia AUTORIZADA/PARCIAL válida (COMERCIAL e ADMIN) */
  semAutorizacao: number;
  /** cirurgias AGENDADA/CONFIRMADA até 7 dias (e atrasadas) sem vale ativo (ESTOQUE, COMERCIAL e ADMIN) */
  semVale: number;
  /** pedidos de venda gerados sem NF registrada: sem conta a receber nem receita ainda (COMERCIAL, FINANCEIRO e ADMIN) */
  pedidosSemNf: number;
};

export type Pendencia = { key: string; href: string; icon: IconName; tom: "warn" | "danger"; titulo: string; nota: string; qtd: number };

const vazia = { qtd: 0, valor: 0 };
const semDocumentos = { vencidos: 0, vencendo30: 0, total: 0 };
const semRecolhimentos = { abertos: 0, vencidos: 0 };

/**
 * Números que alimentam o painel e o sino de pendências. Só consulta o que o perfil enxerga
 * (o resto volta zerado). Única fonte: o painel e GET /api/pendencias usam esta função.
 */
export async function carregarPendencias(perfil: Perfil): Promise<DadosPendencias> {
  const { comercial, financeiro, estoque, documentos, recolhimentos, autorizacoes, vales } = areasDoPerfil(perfil);
  const hoje = hojeSP();
  const hojeFin = hojeUTC();
  const zero = Promise.resolve(0);

  const [recFaixas, pagarFaixas, aFaturar, quarentena, lotesVencendo, abaixoMin, registros, remessas, aprovacoes, docs, recolh, semAutorizacao, semVale, pedidosSemNf] = await Promise.all([
    financeiro ? faixasAbertas("receber", hojeFin) : Promise.resolve(null),
    financeiro ? faixasAbertas("pagar", hojeFin) : Promise.resolve(null),
    comercial ? contarAFaturar() : zero,
    estoque ? contarLotesQuarentena() : zero,
    estoque ? contarLotesVencendo(hoje) : zero,
    estoque ? contarAbaixoDoMinimo(hoje) : zero,
    estoque ? contarRegistrosVencendo(hoje) : zero,
    estoque ? contarRemessasAConferir() : zero,
    financeiro ? contarAprovacoesPendentes() : zero,
    documentos ? contarAlertasDocumentos(hojeFin) : Promise.resolve(semDocumentos),
    recolhimentos ? contarRecolhimentos(hojeFin) : Promise.resolve(semRecolhimentos),
    autorizacoes ? contarCirurgiasSemAutorizacao(new Date()) : zero,
    vales ? contarCirurgiasAguardandoVale(hoje) : zero,
    comercial ? contarPedidosSemNf() : zero,
  ]);

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
    semAutorizacao,
    semVale,
    pedidosSemNf,
  };
}

/** Lista de pendências (só as com quantidade > 0), em ordem de gravidade. */
export function listarPendencias(d: DadosPendencias): Pendencia[] {
  const itens: Pendencia[] = [];
  const add = (key: string, qtd: number, p: Omit<Pendencia, "key" | "qtd">) => {
    if (qtd > 0) itens.push({ key, qtd, ...p });
  };
  const rc = d.recolhimentos;
  add("recol", rc.abertos, { href: "/qualidade/recolhimentos", icon: "alerta", tom: rc.vencidos > 0 ? "danger" : "warn", titulo: `${rc.abertos} recolhimento(s) de lote em aberto`, nota: rc.vencidos > 0 ? `${rc.vencidos} com prazo vencido` : "ação de campo em andamento" });
  add("aut", d.semAutorizacao, { href: "/comercial/agenda", icon: "escudo", tom: "danger", titulo: `${d.semAutorizacao} cirurgia(s) nos próximos 7 dias sem autorização do convênio`, nota: "sem guia autorizada: risco de glosa" });
  add("rec", d.recVencido.qtd, { href: "/financeiro/receber?vencidos=1", icon: "receber", tom: "danger", titulo: `${d.recVencido.qtd} título(s) a receber vencido(s)`, nota: `${money(d.recVencido.valor)} em atraso` });
  add("venc", d.lotesVencendo, { href: "/qualidade/lotes", icon: "alerta", tom: "danger", titulo: `${d.lotesVencendo} lote(s) vencido(s) ou vencendo`, nota: "validade em até 30 dias, com saldo" });
  add("min", d.abaixoMin, { href: "/compras/sugestao", icon: "tendencia", tom: "danger", titulo: `${d.abaixoMin} produto(s) abaixo do mínimo`, nota: "disponível liberado insuficiente" });
  add("pag", d.pagar7.qtd, { href: "/financeiro/pagar", icon: "pagar", tom: "warn", titulo: `${d.pagar7.qtd} título(s) a pagar em 7 dias`, nota: `${money(d.pagar7.valor)}, incluindo atrasados` });
  add("apr", d.aprovacoes, { href: "/financeiro/aprovacoes", icon: "escudo", tom: "warn", titulo: `${d.aprovacoes} conta(s) a pagar para aprovar`, nota: "aguardando aprovação do financeiro" });
  add("vale", d.semVale, { href: "/estoque/remessas", icon: "caminhao", tom: "danger", titulo: `${d.semVale} cirurgia(s) sem vale`, nota: "agendadas até 7 dias (ou atrasadas) sem remessa no estoque" });
  add("nf", d.pedidosSemNf, { href: "/comercial/pedidos?status=ABERTO", icon: "documento", tom: "warn", titulo: `${d.pedidosSemNf} pedido(s) de venda sem NF`, nota: "faturamento pendente: sem conta a receber ainda" });
  add("fat", d.aFaturar, { href: "/comercial/cirurgias?status=REALIZADA", icon: "documento", tom: "warn", titulo: `${d.aFaturar} cirurgia(s) a faturar`, nota: "realizadas sem pedido de venda" });
  add("rem", d.remessas, { href: "/estoque/remessas?status=ENVIADA", icon: "caminhao", tom: "warn", titulo: `${d.remessas} remessa(s) a conferir`, nota: "vales enviados aos hospitais" });
  add("qua", d.quarentena, { href: "/qualidade/quarentena", icon: "frasco", tom: "warn", titulo: `${d.quarentena} lote(s) em quarentena`, nota: "aguardando inspeção" });
  const dv = d.documentos;
  add("doc", dv.total, { href: `/qualidade/documentos?situacao=ATENCAO`, icon: "documento", tom: dv.vencidos > 0 ? "danger" : "warn", titulo: `${dv.total} documento(s) vencido(s) ou a vencer em 30 dias`, nota: dv.vencidos > 0 ? `${dv.vencidos} já vencido(s)` : "licenças e certificados a renovar" });
  add("reg", d.registros, { href: "/qualidade/registros", icon: "livro", tom: "warn", titulo: `${d.registros} registro(s) ANVISA a vencer`, nota: "vencidos ou vencendo em 90 dias" });
  return itens;
}
