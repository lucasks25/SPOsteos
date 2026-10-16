import { exigirUsuarioRota } from "@/lib/auth";
import { exportarCsv } from "@/lib/auth-exportacao";
import { limitarRota } from "@/lib/limite-rota";
import { FAIXAS_AGING } from "../../_lib/aging";
import { carregarAging } from "../../_lib/aging-dados";
import { hojeUTC, ymd } from "@/lib/datas";

/** CSV do aging por hospital (tipo=receber) ou fornecedor (tipo=pagar). */
export async function GET(req: Request) {
  const sessao = await exigirUsuarioRota(["FINANCEIRO"]);
  if (sessao instanceof Response) return sessao;
  const excesso = limitarRota("exportacao", sessao.id);
  if (excesso) return excesso;
  const tipo = new URL(req.url).searchParams.get("tipo") === "pagar" ? "pagar" : "receber";
  const hoje = hojeUTC();
  const d = await carregarAging(tipo, hoje);
  return exportarCsv(sessao, req, `aging_${tipo}_${ymd(hoje)}.csv`, [
    [tipo === "receber" ? "Hospital" : "Fornecedor", "Títulos", ...FAIXAS_AGING, "Total", "Maior atraso (dias)"],
    ...d.linhas.map((l) => [l.parceiro, String(l.qtd), ...l.faixas, l.total, String(l.maiorAtrasoDias)]),
    ["Total", "", ...d.totais, d.total, ""],
  ]);
}
