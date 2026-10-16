/**
 * REVISAO §23: as 6 transações em lote do financeiro (SISPAG gerar/retorno, cobrança gerar/retorno, classificar em lote,
 * aprovar em lote) passam `{ timeout: 60_000, maxWait: 10_000 }` — o padrão de 5 s do Prisma recusava retornos de
 * 100–200 itens com banco remoto. A opção local vale por cima de qualquer padrão global de src/lib/db.ts.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const lib = path.resolve(import.meta.dirname, "../../src/app/(app)/financeiro/_lib");
const CHAMADAS: [string, string[]][] = [
  ["sispag-actions.ts", ["gerarRemessaDaContaTx", "aplicarRetornoTx"]],
  ["cobranca-actions.ts", ["gerarRemessaCobrancaTx", "aplicarRetornoCobrancaTx"]],
  ["classificar-actions.ts", ["classificarEmLote"]],
  ["aprovacao-actions.ts", ["aprovarContasPagarTx"]],
];

test("as 6 transações em lote do financeiro passam timeout de 60 s e maxWait de 10 s", async () => {
  for (const [arquivo, servicos] of CHAMADAS) {
    const src = await readFile(path.join(lib, arquivo), "utf8");
    assert.match(src, /const TX_OPTS = \{ timeout: 60_000, maxWait: 10_000 \};/, arquivo);
    for (const s of servicos) assert.match(src, new RegExp(`db\\.\\$transaction\\([^\\n]*\\b${s}\\([^\\n]*TX_OPTS\\)`), `${arquivo}: ${s}`);
  }
});
