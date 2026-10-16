import { requireUser } from "@/lib/auth";
import { abcDados } from "../../_lib/consultas";
import { respostaCsv } from "@/lib/csv";
import { PERFIS_GESTAO } from "../../_lib/visual";

export async function GET(req: Request) {
  await requireUser([...PERFIS_GESTAO]);
  const d = await abcDados(Object.fromEntries(new URL(req.url).searchParams));
  const n = (v: number) => String(v);
  return respostaCsv(`curva_abc_${d.periodo.de}_${d.periodo.ate}.csv`, [
    ["Posição", "Código", "Produto", "Quantidade", "Receita", "Participação %", "Acumulado %", "Classe"],
    ...d.abc.linhas.map((l, i) => [n(i + 1), l.codigo, l.nome, n(l.quantidade), l.valor, l.participacao, l.acumulado, l.classe]),
    ["", "", "Total", "", d.abc.total, 100, "", ""],
  ]);
}
