/** Correções da revisão estática: datas inexistentes, parâmetros repetidos, estorno no consumo, vale sem cirurgia, tabela fora de vigência. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { zf, diaIsoValido } from "@/lib/forms";
import { soStrings } from "@/lib/search-params";
import { descontarEstornos } from "@/lib/estoque";
import { tabelaForaDeVigencia } from "@/app/(app)/comercial/_lib/precos";
import { conferirRemessa } from "@/app/(app)/estoque/_lib/remessas";
import type { Tx } from "@/lib/db";

test("zf.date/optDate: dia inexistente (2026-02-31) é recusado em vez de virar 03/03", () => {
  const s = z.object({ d: zf.date(), od: zf.optDate() });
  const r = s.safeParse({ d: "2026-02-31" });
  assert.equal(r.success, false);
  assert.equal(r.error!.issues[0].message, "Data inválida");
  assert.equal(s.safeParse({ d: "2026-10-16", od: "2026-04-31" }).success, false);
  assert.equal(s.safeParse({ d: "2026-13-01" }).success, false);
  assert.equal(s.safeParse({ d: "16/10/2026" }).success, false);
  assert.equal(s.parse({ d: "2028-02-29" }).d.toISOString(), "2028-02-29T00:00:00.000Z"); // bissexto
  assert.equal(s.safeParse({ d: "2027-02-29" }).success, false);
  assert.equal(s.parse({ d: "2026-10-16" }).od, null);
  assert.equal(s.safeParse({}).error!.issues[0].message, "Data obrigatória");
  assert.equal(diaIsoValido("2026-02-28"), true);
});

test("soStrings: parâmetro repetido na URL (array) vira undefined; string passa", () => {
  const sp = soStrings({ q: ["a", "b"], local: "x", status: undefined } as unknown as { q?: string; local?: string; status?: string });
  assert.equal(sp.q, undefined);
  assert.equal(sp.local, "x");
  assert.equal(sp.status, undefined);
});

test("descontarEstornos: consumo líquido = consumo - estorno, nunca negativo", () => {
  const r = descontarEstornos(new Map([["a", 10], ["b", 3], ["c", 5]]), new Map([["a", 4], ["b", 9]]));
  assert.equal(r.get("a"), 6);
  assert.equal(r.get("b"), 0);
  assert.equal(r.get("c"), 5);
});

test("tabelaForaDeVigencia: avisa só quando há tabela e ela não vale na data", async () => {
  const cli = (tabelaPreco: unknown) => ({ hospital: { findUnique: async () => ({ tabelaPreco }) } }) as unknown as Tx;
  const ref = new Date("2026-10-16T15:00:00Z");
  const vencida = { nome: "T 2025", vigenciaInicio: new Date("2025-01-01T00:00:00Z"), vigenciaFim: new Date("2025-12-31T00:00:00Z") };
  const vigente = { nome: "T 2026", vigenciaInicio: new Date("2026-01-01T00:00:00Z"), vigenciaFim: null };
  assert.equal(await tabelaForaDeVigencia(cli(vencida), "h1", ref), "T 2025");
  assert.equal(await tabelaForaDeVigencia(cli(vigente), "h1", ref), null);
  assert.equal(await tabelaForaDeVigencia(cli(null), "h1", ref), null);
  assert.equal(await tabelaForaDeVigencia(cli(vencida), null, ref), null);
});

test("conferirRemessa: vale sem cirurgia recusa consumido > 0 (nunca seria faturado)", async () => {
  const item = { id: "i1", produtoId: "p1", loteId: "l1", quantidade: 5, produto: { descricao: "Parafuso", custoMedio: 10 } };
  const remessa = { id: 7, cirurgiaId: null, cirurgia: null, localId: "loc", itens: [item] };
  const tx = {
    remessa: { findUnique: async () => ({ cirurgiaId: null }), updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => remessa },
    $queryRaw: async () => [],
    inventarioConsignacao: { findFirst: async () => null },
  } as unknown as Tx;
  await assert.rejects(
    conferirRemessa(tx, 7, [{ itemId: "i1", devolvido: 0, consumido: 2 }], "teste"),
    (e: Error) => /sem cirurgia não registra consumido/.test(e.message) && /consumo direto na cirurgia/.test(e.message),
  );
});
