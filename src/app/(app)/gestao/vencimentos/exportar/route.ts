import { requireUser } from "@/lib/auth";
import { ymd } from "@/lib/datas";
import { vencimentosDados } from "../../_lib/consultas";
import { respostaCsv } from "@/lib/csv";
import { FAIXAS_VENCIMENTO } from "../../_lib/vencimentos";
import { PERFIS_GESTAO } from "../../_lib/visual";

export async function GET() {
  await requireUser([...PERFIS_GESTAO]);
  const d = await vencimentosDados();
  return respostaCsv(`vencimentos_${ymd(d.hoje)}.csv`, [
    ["Faixa", "Validade", "Dias", "Código", "Produto", "Lote", "Local", "Hospital", "Quantidade", "Valor em risco"],
    ...d.linhas.map((l) => [FAIXAS_VENCIMENTO[l.faixa], ymd(l.validade), l.dias, l.codigo, l.produto, l.lote, l.localTipo, l.hospital ?? "", String(l.quantidade), l.valor]),
    ["Total", "", "", "", "", "", "", "", String(d.linhas.reduce((s, l) => s + l.quantidade, 0)), d.totais.total],
  ]);
}
