/**
 * Cifra em repouso das carteirinhas (docs/LGPD.md §4). Cifra as que ainda estão em claro e recifra as que estão numa
 * versão antiga da chave (rotação); recalcula o índice cego. Idempotente. Por padrão só MOSTRA quantas faria.
 *   DATA_KEY=... npx tsx scripts/lgpd-cifrar.ts              # simulação
 *   DATA_KEY=... OPERADOR="Nome" npx tsx scripts/lgpd-cifrar.ts --aplicar
 * Rotação: DATA_KEY="v2:<nova>,v1:<antiga>", rodar com --aplicar, conferir "restantes: 0" e só então tirar a v1.
 * ANTES de aplicar pela primeira vez: guarde a DATA_KEY fora do servidor (cofre). Sem ela os dados cifrados se perdem.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { CTX_CARTEIRINHA, cifrar, decifrar, indiceBusca, precisaRecifrar, versaoChaveAtual } from "@/lib/cripto";
import { problemaDataKey } from "@/lib/cripto-config";
import { argumentos, auditarScript } from "./_lgpd-comum";

const LOTE = 200;

async function pendentes() {
  const todas = await db.cirurgia.findMany({ where: { carteirinha: { not: null } }, select: { id: true, carteirinha: true, carteirinhaHash: true } });
  const v = `v${versaoChaveAtual()}:`;
  return todas.filter((c) => precisaRecifrar(c.carteirinha) || !c.carteirinhaHash?.startsWith(v));
}

async function main() {
  const problema = problemaDataKey(process.env.DATA_KEY);
  if (problema) throw new Error(`${problema} Defina a DATA_KEY (a mesma do servidor) antes de rodar.`);
  const a = argumentos();
  const lista = await pendentes();
  if (!a.aplicar) {
    console.log(`SIMULAÇÃO: ${lista.length} carteirinha(s) a cifrar/recifrar. Para aplicar: --aplicar`);
    return;
  }
  let feitas = 0;
  for (let i = 0; i < lista.length; i += LOTE) {
    await db.$transaction(async (tx) => {
      for (const c of lista.slice(i, i + LOTE)) {
        // relê sob trava: a tela pode ter regravado a carteirinha depois da leitura acima
        await tx.$queryRaw`SELECT id FROM "Cirurgia" WHERE id = ${c.id} FOR UPDATE`;
        const atual = await tx.cirurgia.findUnique({ where: { id: c.id }, select: { carteirinha: true } });
        if (!atual?.carteirinha) continue;
        const claro = decifrar(atual.carteirinha, CTX_CARTEIRINHA); // lança se a chave antiga não estiver na DATA_KEY
        await tx.cirurgia.update({ where: { id: c.id }, data: { carteirinha: cifrar(claro, CTX_CARTEIRINHA), carteirinhaHash: indiceBusca(claro, CTX_CARTEIRINHA) } });
        feitas++;
      }
    });
  }
  // restantes = ainda em claro ou em chave antiga (carteirinha só com símbolos não tem índice e não conta)
  const restantes = (await db.cirurgia.findMany({ where: { carteirinha: { not: null } }, select: { carteirinha: true } })).filter((c) => precisaRecifrar(c.carteirinha)).length;
  await auditarScript("cifrar carteirinhas", "Cirurgia", null, `${feitas} carteirinha(s) cifrada(s)/recifrada(s); restantes: ${restantes}`);
  console.log(`Feito: ${feitas} carteirinha(s). Restantes: ${restantes}. Auditoria gravada.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
