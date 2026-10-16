import { requireUser } from "@/lib/auth";
import { ymd, hojeUTC } from "@/lib/datas";
import { giroDados } from "../../_lib/consultas";
import { respostaCsv } from "../../_lib/csv";
import { ROTULO_SITUACAO } from "../../_lib/giro";
import { PERFIS_GESTAO } from "../../_lib/visual";

const dec = (v: number | null): string | number => (v === null ? "" : v);

export async function GET(req: Request) {
  await requireUser([...PERFIS_GESTAO]);
  const d = await giroDados(Object.fromEntries(new URL(req.url).searchParams));
  return respostaCsv(`giro_cobertura_${ymd(hojeUTC())}.csv`, [
    ["Código", "Produto", "Depósito", "Consignado", "Quarentena", "Não conforme", "Mínimo", "Consumo 90 dias", "Consumo por dia", "Cobertura (dias)", "Giro anual", "Dias sem consumo", "Valor em estoque", "Situação"],
    ...d.linhas.map((l) => [l.codigo, l.nome, String(l.deposito), String(l.consignado), String(l.quarentena), String(l.naoConforme), String(l.estoqueMinimo), String(l.consumo), dec(l.consumoDia), dec(l.cobertura), dec(l.giro), l.diasSemMovimento === null ? "nunca" : String(l.diasSemMovimento), l.valor, ROTULO_SITUACAO[l.situacao]]),
  ]);
}
