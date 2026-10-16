/** Entradas de borda da varredura funcional (REVISAO §20): ids e números que antes derrubavam a tela com erro 500. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { idInt, INT4_MAX } from "@/lib/ids";
import { zf, VALOR_MAX, QTD_MAX } from "@/lib/forms";
import { parseDia } from "@/lib/datas";

test("idInt: só inteiros de 1 a INT4_MAX; o resto vira null (a página responde 404)", () => {
  assert.equal(idInt("1"), 1);
  assert.equal(idInt("2147483647"), INT4_MAX);
  for (const v of ["2147483648", "99999999999999999999", "abc", "-1", "0", "1.5", "1e3", " 7", "", null, undefined, {}]) assert.equal(idInt(v), null, String(v));
  assert.equal(idInt(42), 42);
  assert.equal(idInt(1e20), null);
  assert.equal(idInt(NaN), null);
});

test("zf.int recusa quantidade acima do limite com mensagem clara (antes: estouro do int4 = Erro inesperado)", () => {
  const s = z.object({ q: zf.int(1) });
  assert.equal(s.safeParse({ q: "5" }).success, true);
  const r = s.safeParse({ q: String(QTD_MAX + 1) });
  assert.equal(r.success, false);
  assert.match(r.error!.issues[0].message, /Máximo 1\.000\.000/);
  assert.equal(s.safeParse({ q: "99999999999" }).success, false);
  assert.match(s.safeParse({ q: "0" }).error!.issues[0].message, /Mínimo 1/);
});

test("zf.money/optMoney recusam negativo e valor acima de Decimal(14,2)", () => {
  const s = z.object({ v: zf.money(), o: zf.optMoney() });
  assert.equal(s.safeParse({ v: "10.5" }).success, true);
  assert.equal(s.safeParse({ v: String(VALOR_MAX) }).success, true);
  assert.equal(s.safeParse({ v: "1e15" }).success, false);
  assert.equal(s.safeParse({ v: "-1" }).success, false);
  assert.equal(s.safeParse({ v: "1", o: "1e15" }).success, false);
  assert.equal(s.parse({ v: "1" }).o, null);
});

test("parseForm: erro num item da lista JSON diz qual item corrigir (antes: 'Verifique os campos destacados' sem nada destacado)", async () => {
  const { parseForm } = await import("@/lib/forms");
  const { itensJson } = await import("@/app/(app)/compras/_lib/itens");
  const fd = new FormData();
  fd.set("itens", JSON.stringify([{ produtoId: "p1", quantidade: 2, custoUnit: 1 }, { produtoId: "p2", quantidade: 10_000_000_000, custoUnit: 1 }]));
  const r = parseForm(z.object({ itens: itensJson() }), fd);
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.state?.error, "Item 2: Quantidade máxima 1.000.000");
  fd.set("itens", JSON.stringify([{ produtoId: "p1", quantidade: 1, custoUnit: -3 }]));
  const r2 = parseForm(z.object({ itens: itensJson() }), fd);
  if (!r2.success) assert.equal(r2.state?.error, "Item 1: Custo inválido");
  else assert.fail("custo negativo aceito");
});

test("errorMessage: P2025 (já removido) e P2003 (vínculo) viram mensagem com caminho de recuperação, não 'Erro inesperado'", async () => {
  const { errorMessage } = await import("@/lib/forms");
  assert.match(errorMessage({ code: "P2025" }), /Atualize a página/);
  assert.match(errorMessage({ code: "P2003" }), /não existe mais/);
  const orig = console.error;
  console.error = () => {};
  try { assert.match(errorMessage(new Error("x")), /Erro inesperado/); } finally { console.error = orig; }
});

test("FEFO: 'hoje' é o dia de Brasília (às 23h30 de Brasília o lote que vence hoje ainda vale)", async () => {
  const { inicioDoDiaUTC } = await import("@/app/(app)/estoque/_lib/fefo");
  assert.equal(inicioDoDiaUTC(new Date("2026-10-16T23:30:00-03:00")).toISOString(), "2026-10-16T00:00:00.000Z");
  assert.equal(inicioDoDiaUTC(new Date("2026-10-17T00:30:00-03:00")).toISOString(), "2026-10-17T00:00:00.000Z");
});

test("parseDia: data inválida da URL vira null (kardex deixava a tela em erro)", () => {
  assert.equal(parseDia("2026-99-99"), null);
  assert.equal(parseDia("abc"), null);
  assert.equal(parseDia(undefined), null);
  assert.equal(parseDia("2026-10-16")?.toISOString(), "2026-10-16T00:00:00.000Z");
});

test("zf.text/optText têm teto de tamanho; zf.date/optDate recusam ano absurdo", () => {
  const s = z.object({ t: zf.text(), o: zf.optText(), d: zf.date(), od: zf.optDate() });
  const base = { t: "ok", d: "2026-10-16" };
  assert.equal(s.safeParse(base).success, true);
  assert.equal(s.safeParse({ ...base, t: "x".repeat(5001) }).success, false);
  assert.equal(s.safeParse({ ...base, o: "x".repeat(5001) }).success, false);
  assert.match(s.safeParse({ ...base, d: "0001-01-01" }).error!.issues[0].message, /1900 a 2100/);
  assert.equal(s.safeParse({ ...base, od: "9999-12-31" }).success, false);
  assert.equal(s.safeParse({ ...base, od: "abc" }).success, false);
  assert.equal(s.parse(base).od, null);
});

test("conferência de vale: tudo em branco é recusado; zeros digitados valem (tudo fica consignado)", async () => {
  const { conferenciaEmBranco } = await import("@/app/(app)/estoque/_lib/remessas");
  assert.equal(conferenciaEmBranco([[null, null], ["", " "]]), true);
  assert.equal(conferenciaEmBranco([["0", "0"], ["", ""]]), false);
  assert.equal(conferenciaEmBranco([["", "2"]]), false);
  assert.equal(conferenciaEmBranco([]), false);
});
