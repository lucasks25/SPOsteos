/**
 * Descarte programado (LGPD art. 15/16; política em docs/LGPD.md §7). Por padrão só MOSTRA o que faria.
 *   npx tsx scripts/lgpd-retencao.ts                 # simulação
 *   OPERADOR="Nome" npx tsx scripts/lgpd-retencao.ts --aplicar [--meses=6]
 * Faz: (1) apaga o nome do paciente de orçamentos não aprovados vencidos há mais de N meses; (2) tira o nome do paciente
 * das observações antigas do kardex. Grava uma linha de auditoria por execução aplicada. Rodar 1x por mês (cron).
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { anonimizarOrcamentos, limparPacienteDoKardex, MESES_ORCAMENTO_NAO_APROVADO, orcamentosParaAnonimizar } from "@/lib/lgpd-retencao";
import { argumentos, auditarScript } from "./_lgpd-comum";

async function main() {
  const a = argumentos();
  const meses = a.meses ? Number(a.meses) : MESES_ORCAMENTO_NAO_APROVADO;
  if (!Number.isInteger(meses) || meses < 1 || meses > 120) throw new Error("--meses deve ser um inteiro de 1 a 120.");
  if (!a.aplicar) {
    const alvo = await orcamentosParaAnonimizar(db, new Date(), meses);
    const kardex = await db.movimento.count({ where: { observacao: { startsWith: "Consumo direto — paciente " } } });
    console.log(`SIMULAÇÃO (nada foi alterado). Orçamentos não aprovados há mais de ${meses} meses com paciente: ${alvo.length}${alvo.length ? ` (ids ${alvo.map((o) => o.id).join(", ")})` : ""}.`);
    console.log(`Observações do kardex com nome de paciente: ${kardex}. Para aplicar: --aplicar`);
    return;
  }
  const { ids, count } = await db.$transaction(async (tx) => anonimizarOrcamentos(tx, new Date(), meses));
  const kardex = await limparPacienteDoKardex(db);
  await auditarScript("anonimizar (retenção)", "Orcamento", null, `${count} orçamento(s) sem o nome do paciente (não aprovados há mais de ${meses} meses)${ids.length ? `: ${ids.join(", ")}` : ""}; ${kardex} observação(ões) do kardex sem nome`);
  console.log(`Feito: ${count} orçamento(s) anonimizado(s); ${kardex} observação(ões) do kardex limpas. Auditoria gravada.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
