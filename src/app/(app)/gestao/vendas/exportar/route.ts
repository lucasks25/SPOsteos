import { exigirUsuarioRota } from "@/lib/auth";
import { vendasDados } from "../../_lib/consultas";
import { respostaCsv, pct } from "@/lib/csv";
import { PERFIS_GESTAO } from "../../_lib/visual";

export async function GET(req: Request) {
  const sessao = await exigirUsuarioRota([...PERFIS_GESTAO]);
  if (sessao instanceof Response) return sessao;
  const d = await vendasDados(Object.fromEntries(new URL(req.url).searchParams));
  return respostaCsv("vendas_por_mes.csv", [
    ["Mês", "Pedidos", "Vendas", "Mesmo mês do ano anterior", "Pedidos (ano anterior)", "Variação %"],
    ...d.meses.map((m) => [m.chave, String(m.pedidos), m.valor, m.anterior, String(m.pedidosAnterior), pct(m.variacaoPct)]),
    ["Total", String(d.pedidos), d.total, d.anterior, "", pct(d.variacaoPct)],
  ]);
}
