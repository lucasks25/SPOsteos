import { requireUser } from "@/lib/auth";
import { FAIXAS_AGING } from "../../_lib/aging";
import { csv } from "@/lib/csv";
import { carregarAging } from "../../_lib/aging-dados";
import { hojeUTC, ymd } from "@/lib/datas";

/** CSV do aging por hospital (tipo=receber) ou fornecedor (tipo=pagar). */
export async function GET(req: Request) {
  await requireUser(["FINANCEIRO"]);
  const tipo = new URL(req.url).searchParams.get("tipo") === "pagar" ? "pagar" : "receber";
  const hoje = hojeUTC();
  const d = await carregarAging(tipo, hoje);
  const corpo = csv([
    [tipo === "receber" ? "Hospital" : "Fornecedor", "Títulos", ...FAIXAS_AGING, "Total", "Maior atraso (dias)"],
    ...d.linhas.map((l) => [l.parceiro, String(l.qtd), ...l.faixas, l.total, String(l.maiorAtrasoDias)]),
    ["Total", "", ...d.totais, d.total, ""],
  ]);
  return new Response(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aging_${tipo}_${ymd(hoje)}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
