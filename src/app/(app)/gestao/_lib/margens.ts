/** Margem por produto, hospital e representante a partir de pedidos de venda faturados. Puro, testado em tests/gestao/margens.test.ts. */
export type ItemPedido = { produtoId: string; codigo: string; descricao: string; quantidade: number; precoUnit: number; custoUnit: number };
export type PedidoMargem = {
  id: number;
  hospitalId: string;
  hospital: string;
  representanteId: string | null;
  representante: string;
  comissao: number;
  itens: ItemPedido[];
};
export type LinhaMargem = { id: string; nome: string; sub: string; pedidos: number; quantidade: number; receita: number; custo: number; margem: number; margemPct: number | null; comissao: number };

const cent = (n: number) => Math.round(n * 100);

/** Divide `totalC` (centavos) entre os pesos, proporcionalmente; o resto vai para o último, então a soma fecha exata. */
export function ratear(totalC: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (soma <= 0) return pesos.map((_, i) => (i === pesos.length - 1 ? totalC : 0));
  let acum = 0;
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return totalC - acum;
    const parte = Math.round((totalC * p) / soma);
    acum += parte;
    return parte;
  });
}

type Acc = { id: string; nome: string; sub: string; pedidos: Set<number>; quantidade: number; receitaC: number; custoC: number; comissaoC: number };

function fechar(m: Map<string, Acc>): LinhaMargem[] {
  return [...m.values()].map((a) => {
    const margemC = a.receitaC - a.custoC;
    return {
      id: a.id,
      nome: a.nome,
      sub: a.sub,
      pedidos: a.pedidos.size,
      quantidade: a.quantidade,
      receita: a.receitaC / 100,
      custo: a.custoC / 100,
      margem: margemC / 100,
      margemPct: a.receitaC > 0 ? Math.round((margemC / a.receitaC) * 10000) / 100 : null,
      comissao: a.comissaoC / 100,
    };
  });
}

/**
 * Receita = Σ quantidade × preço; custo = Σ quantidade × custo congelado no item. A comissão é do pedido:
 * para hospital e representante entra inteira; para produto é rateada pela receita de cada item (soma fecha com a do pedido).
 * Ordem do retorno: maior receita primeiro (a tela reordena).
 */
export function margens(pedidos: PedidoMargem[]): { produtos: LinhaMargem[]; hospitais: LinhaMargem[]; representantes: LinhaMargem[]; total: LinhaMargem } {
  const prod = new Map<string, Acc>();
  const hosp = new Map<string, Acc>();
  const rep = new Map<string, Acc>();
  const tot: Acc = { id: "total", nome: "Total", sub: "", pedidos: new Set(), quantidade: 0, receitaC: 0, custoC: 0, comissaoC: 0 };
  const get = (m: Map<string, Acc>, id: string, nome: string, sub: string) => {
    let a = m.get(id);
    if (!a) m.set(id, (a = { id, nome, sub, pedidos: new Set(), quantidade: 0, receitaC: 0, custoC: 0, comissaoC: 0 }));
    return a;
  };
  for (const p of pedidos) {
    const receitas = p.itens.map((i) => cent(i.quantidade * i.precoUnit));
    const custos = p.itens.map((i) => cent(i.quantidade * i.custoUnit));
    const partes = ratear(cent(p.comissao), receitas);
    const h = get(hosp, p.hospitalId, p.hospital, "");
    const r = get(rep, p.representanteId ?? "sem", p.representante, "");
    p.itens.forEach((i, k) => {
      const pr = get(prod, i.produtoId, i.descricao, i.codigo);
      for (const a of [pr, h, r, tot]) {
        a.pedidos.add(p.id);
        a.quantidade += i.quantidade;
        a.receitaC += receitas[k];
        a.custoC += custos[k];
      }
      pr.comissaoC += partes[k];
    });
    // pedido sem itens: a comissão ainda conta no hospital/representante
    const comissaoC = cent(p.comissao);
    h.comissaoC += comissaoC;
    r.comissaoC += comissaoC;
    tot.comissaoC += comissaoC;
    if (p.itens.length === 0) for (const a of [h, r, tot]) a.pedidos.add(p.id);
  }
  const porReceita = (l: LinhaMargem[]) => l.sort((a, b) => cent(b.receita) - cent(a.receita) || a.nome.localeCompare(b.nome, "pt-BR"));
  return { produtos: porReceita(fechar(prod)), hospitais: porReceita(fechar(hosp)), representantes: porReceita(fechar(rep)), total: fechar(new Map([["t", tot]]))[0] };
}
