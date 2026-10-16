import { exigirUsuarioRota } from "@/lib/auth";
import { exportarCsv } from "@/lib/auth-exportacao";
import { limitarRota } from "@/lib/limite-rota";
import { vendasDados } from "../../_lib/consultas";
import { pct } from "@/lib/csv";
import { PERFIS_GESTAO } from "../../_lib/visual";

export async function GET(req: Request) {
  const sessao = await exigirUsuarioRota([...PERFIS_GESTAO]);
  if (sessao instanceof Response) return sessao;
  const excesso = limitarRota("exportacao", sessao.id);
  if (excesso) return excesso;
  const d = await vendasDados(Object.fromEntries(new URL(req.url).searchParams));
  return exportarCsv(sessao, req, "vendas_por_mes.csv", [
    ["Mês", "Pedidos", "Vendas", "Mesmo mês do ano anterior", "Pedidos (ano anterior)", "Variação %"],
    ...d.meses.map((m) => [m.chave, String(m.pedidos), m.valor, m.anterior, String(m.pedidosAnterior), pct(m.variacaoPct)]),
    ["Total", String(d.pedidos), d.total, d.anterior, "", pct(d.variacaoPct)],
  ]);
}
