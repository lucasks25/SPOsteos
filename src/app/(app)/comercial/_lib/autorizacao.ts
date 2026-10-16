/**
 * Verificação de risco de glosa: compara o material consumido na cirurgia com o que o convênio autorizou.
 * Função pura (sem banco); testada em tests/comercial/autorizacao.test.ts.
 *
 * Regras:
 * - Só se aplica quando a cirurgia tem convênio que exige autorização (`aplicavel`); senão devolve vazio.
 * - Autorização AUTORIZADA/PARCIAL cuja validade terminou ANTES do dia da cirurgia (Brasília) conta como expirada.
 * - Várias guias da mesma cirurgia somam as quantidades autorizadas (só as válidas).
 * - Gravidade: "grave" quando já há consumo (o risco de glosa é real); "atencao" quando ainda não há consumo
 *   (cirurgia por acontecer: dá tempo de regularizar); "info" para o autorizado e não utilizado.
 */
export type StatusAutorizacao = "SOLICITADA" | "AUTORIZADA" | "PARCIAL" | "NEGADA" | "EXPIRADA";
export type Severidade = "grave" | "atencao" | "info";

export type AutorizacaoEntrada = {
  status: StatusAutorizacao;
  validade: Date | null;
  itens: { produtoId: string; quantidadeAutorizada: number }[];
};
export type ConsumoEntrada = { produtoId: string; descricao: string; quantidade: number };
/** Descrição dos produtos que só aparecem como autorizados (não consumidos). */
export type NomesProdutos = Record<string, string>;

export type CodigoAchado =
  | "SEM_AUTORIZACAO"
  | "AUTORIZACAO_PENDENTE"
  | "AUTORIZACAO_NEGADA"
  | "AUTORIZACAO_EXPIRADA"
  | "NAO_AUTORIZADO"
  | "QUANTIDADE_EXCEDIDA"
  | "AUTORIZADO_NAO_UTILIZADO";

export type Achado = {
  codigo: CodigoAchado;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  produtoId?: string;
  consumido?: number;
  autorizado?: number;
};

export type ResultadoRisco = { aplicavel: boolean; achados: Achado[]; grave: boolean };

const BRT = 3 * 60 * 60 * 1000;
/** yyyy-mm-dd do instante em Brasília. */
const diaBrasilia = (d: Date) => new Date(d.getTime() - BRT).toISOString().slice(0, 10);
/** yyyy-mm-dd de uma data guardada à meia-noite UTC (validade). */
const diaUTC = (d: Date) => d.toISOString().slice(0, 10);

/** Status efetivo: validade vencida antes do dia da cirurgia derruba AUTORIZADA/PARCIAL para EXPIRADA. */
export function statusEfetivo(a: Pick<AutorizacaoEntrada, "status" | "validade">, dataCirurgia: Date): StatusAutorizacao {
  if ((a.status === "AUTORIZADA" || a.status === "PARCIAL") && a.validade && diaUTC(a.validade) < diaBrasilia(dataCirurgia)) return "EXPIRADA";
  return a.status;
}

const ORDEM: Record<Severidade, number> = { grave: 0, atencao: 1, info: 2 };

export function verificarRiscoGlosa(input: {
  aplicavel: boolean;
  dataCirurgia: Date;
  autorizacoes: AutorizacaoEntrada[];
  consumos: ConsumoEntrada[];
  nomes?: NomesProdutos;
}): ResultadoRisco {
  if (!input.aplicavel) return { aplicavel: false, achados: [], grave: false };

  // consumo agrupado por produto
  const consumido = new Map<string, { descricao: string; quantidade: number }>();
  for (const c of input.consumos) {
    if (c.quantidade <= 0) continue;
    const a = consumido.get(c.produtoId);
    if (a) a.quantidade += c.quantidade;
    else consumido.set(c.produtoId, { descricao: c.descricao, quantidade: c.quantidade });
  }
  const temConsumo = consumido.size > 0;
  const sevRisco: Severidade = temConsumo ? "grave" : "atencao";
  const achados: Achado[] = [];

  const efetivas = input.autorizacoes.map((a) => ({ ...a, efetivo: statusEfetivo(a, input.dataCirurgia) }));
  const validas = efetivas.filter((a) => a.efetivo === "AUTORIZADA" || a.efetivo === "PARCIAL");

  if (efetivas.length === 0) {
    achados.push({ codigo: "SEM_AUTORIZACAO", severidade: sevRisco, titulo: "Sem autorização prévia registrada", detalhe: "O convênio exige autorização. Sem a guia autorizada, o faturamento tende a ser glosado." });
  } else if (validas.length === 0) {
    const tem = (s: StatusAutorizacao) => efetivas.some((a) => a.efetivo === s);
    if (tem("NEGADA")) achados.push({ codigo: "AUTORIZACAO_NEGADA", severidade: sevRisco, titulo: "Autorização negada pelo convênio", detalhe: "Nenhuma guia autorizada. Recorra ao convênio ou solicite nova autorização." });
    if (tem("EXPIRADA")) achados.push({ codigo: "AUTORIZACAO_EXPIRADA", severidade: sevRisco, titulo: "Autorização expirada", detalhe: "A validade da guia terminou antes da data da cirurgia. Solicite renovação." });
    if (tem("SOLICITADA")) achados.push({ codigo: "AUTORIZACAO_PENDENTE", severidade: sevRisco, titulo: "Autorização solicitada, ainda sem resposta", detalhe: "A guia foi pedida e o convênio não autorizou até agora." });
  } else {
    const autorizado = new Map<string, number>();
    for (const a of validas) for (const i of a.itens) autorizado.set(i.produtoId, (autorizado.get(i.produtoId) ?? 0) + i.quantidadeAutorizada);

    for (const [produtoId, c] of consumido) {
      const aut = autorizado.get(produtoId) ?? 0;
      if (aut <= 0) {
        achados.push({ codigo: "NAO_AUTORIZADO", severidade: "grave", produtoId, consumido: c.quantidade, autorizado: 0, titulo: `Material não autorizado: ${c.descricao}`, detalhe: `Consumido ${c.quantidade}, nada autorizado na guia.` });
      } else if (c.quantidade > aut) {
        achados.push({ codigo: "QUANTIDADE_EXCEDIDA", severidade: "grave", produtoId, consumido: c.quantidade, autorizado: aut, titulo: `Quantidade acima da autorizada: ${c.descricao}`, detalhe: `Consumido ${c.quantidade}, autorizado ${aut} (excesso de ${c.quantidade - aut}).` });
      }
    }
    if (temConsumo) {
      for (const [produtoId, aut] of autorizado) {
        const usado = consumido.get(produtoId)?.quantidade ?? 0;
        if (aut > usado) {
          const nome = consumido.get(produtoId)?.descricao ?? input.nomes?.[produtoId] ?? "produto";
          achados.push({ codigo: "AUTORIZADO_NAO_UTILIZADO", severidade: "info", produtoId, consumido: usado, autorizado: aut, titulo: `Autorizado e não utilizado: ${nome}`, detalhe: `Autorizado ${aut}, utilizado ${usado}.` });
        }
      }
    }
  }

  achados.sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade] || a.titulo.localeCompare(b.titulo, "pt-BR"));
  return { aplicavel: true, achados, grave: achados.some((a) => a.severidade === "grave") };
}
