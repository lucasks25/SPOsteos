/** Curva ABC. Puro, testado em tests/gestao/abc.test.ts. */
export type ItemAbc = { id: string; codigo: string; nome: string; valor: number; quantidade: number };
export type Classe = "A" | "B" | "C";
export type LinhaAbc = ItemAbc & { participacao: number; acumulado: number; classe: Classe };

const cent = (n: number) => Math.round(n * 100);

export const LIMITE_A = 80;
export const LIMITE_B = 95;

/**
 * Ordena por valor (maior primeiro; empate por código) e classifica pelo acumulado ANTES do item:
 * A enquanto o acumulado anterior for menor que 80%, B enquanto menor que 95%, C no resto. Assim o item
 * que cruza o limite fica na classe de cima, e o primeiro item é sempre A.
 * Itens com o mesmo valor ficam na mesma classe (a do primeiro do empate).
 * Valores em centavos inteiros; participacao e acumulado em %, com 2 casas. Valor <= 0 não entra na curva.
 */
export function curvaAbc(itens: ItemAbc[]): { linhas: LinhaAbc[]; total: number; contagem: Record<Classe, number>; valor: Record<Classe, number> } {
  const validos = itens.filter((i) => cent(i.valor) > 0).sort((a, b) => cent(b.valor) - cent(a.valor) || a.codigo.localeCompare(b.codigo, "pt-BR"));
  const totalC = validos.reduce((s, i) => s + cent(i.valor), 0);
  const linhas: LinhaAbc[] = [];
  const contagem = { A: 0, B: 0, C: 0 };
  const valorC = { A: 0, B: 0, C: 0 };
  let acumC = 0;
  let classeDoEmpate: Classe = "A";
  validos.forEach((it, idx) => {
    const v = cent(it.valor);
    const empate = idx > 0 && v === cent(validos[idx - 1].valor);
    if (!empate) classeDoEmpate = acumC * 100 < LIMITE_A * totalC ? "A" : acumC * 100 < LIMITE_B * totalC ? "B" : "C";
    acumC += v;
    contagem[classeDoEmpate]++;
    valorC[classeDoEmpate] += v;
    linhas.push({
      ...it,
      valor: v / 100,
      participacao: Math.round((v / totalC) * 10000) / 100,
      acumulado: Math.round((acumC / totalC) * 10000) / 100,
      classe: classeDoEmpate,
    });
  });
  return { linhas, total: totalC / 100, contagem, valor: { A: valorC.A / 100, B: valorC.B / 100, C: valorC.C / 100 } };
}
