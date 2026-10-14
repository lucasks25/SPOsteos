import assert from "node:assert/strict";
import { test } from "node:test";
import { CnabError, lerCnab240Extrato, loteDaConta, pareceCnab240 } from "@/app/(app)/financeiro/_lib/cnab240-extrato";

// Monta registros de 240 posições pelas posições do manual Itaú (extrato CNAB 240 v5.0)
function reg(campos: [number, number, string][]) {
  const a = Array(240).fill(" ");
  for (const [ini, fim, v] of campos) {
    assert.equal(v.length, fim - ini + 1, `campo ${ini}-${fim}`);
    for (let i = 0; i < v.length; i++) a[ini - 1 + i] = v[i];
  }
  return a.join("");
}
const num = (v: number, t: number) => String(Math.round(v)).padStart(t, "0");
const val = (reais: number) => num(Math.round(Math.abs(reais) * 100), 18);
const alfa = (s: string, t: number) => s.padEnd(t, " ").slice(0, t);
const conta = (ag = "0123"): [number, number, string][] => [[1, 3, "341"], [4, 7, "0001"], [18, 18, "2"], [19, 32, num(12345678000199, 14)], [48, 52, "ABCDE"], [53, 53, "0"], [54, 57, ag], [59, 65, "0000000"], [66, 70, "12345"], [72, 72, "6"]];
const header = reg([[1, 3, "341"], [4, 7, "0000"], [8, 8, "0"], [143, 143, "2"], [144, 151, "13102026"], [164, 166, "050"]]);
const hLote = reg([...conta(), [8, 8, "1"], [9, 9, "E"], [10, 11, "04"], [12, 13, "40"], [14, 16, "031"], [143, 150, "01102026"], [151, 168, val(1000)], [169, 169, "C"], [170, 170, "F"], [171, 173, "BRL"]]);
const det = (seq: number, tipo: string, data: string, v: number, dc: string, cod: string, hist: string, doc: string) =>
  reg([...conta(), [8, 8, "3"], [9, 13, num(seq, 5)], [14, 14, "E"], [15, 15, tipo], [109, 111, "DPV"], [135, 142, data], [143, 150, data], [151, 168, val(v)], [169, 169, dc], [170, 172, dc === "D" ? "105" : "209"], [173, 176, cod], [177, 201, alfa(hist, 25)], [235, 240, alfa(doc, 6)]]);
const tLote = (saldo: number, d: number, c: number) =>
  reg([...conta(), [8, 8, "5"], [143, 150, "13102026"], [151, 168, val(saldo)], [169, 169, saldo < 0 ? "D" : "C"], [170, 170, "F"], [171, 176, num(6, 6)], [177, 194, val(d)], [195, 212, val(c)], [213, 230, val(0)]]);
const trailer = reg([[1, 3, "341"], [4, 7, "9999"], [8, 8, "9"], [18, 23, num(1, 6)], [24, 29, num(8, 6)], [30, 35, num(1, 6)]]);
const LINHAS = [
  header,
  hLote,
  det(1, "1", "05102026", 1500.5, "C", "0007", "TED RECEBIDA HOSP SAO LUC", "000123"),
  det(2, "1", "06102026", 45.9, "D", "0074", "TARIFA MANUTENCAO", ""),
  det(3, "1", "06102026", 10, "D", "0074", "TARIFA AVULSA", ""),
  det(4, "1", "06102026", 10, "D", "0074", "TARIFA AVULSA", ""),
  det(5, "5", "20102026", 999, "D", "0069", "PAGTO FUTURO", ""),
  tLote(1000 + 1500.5 - 45.9 - 20, 65.9, 1500.5),
  trailer,
];

test("lê saldos e lançamentos, ignora futuros", () => {
  const arq = LINHAS.join("\r\n");
  assert.equal(pareceCnab240(arq), true);
  assert.equal(pareceCnab240("OFXHEADER:100\n<OFX>"), false);
  const [l] = lerCnab240Extrato(arq);
  assert.equal(l.agencia, "0123");
  assert.equal(l.saldoInicial.valor, 1000);
  assert.equal(l.saldoFinal?.valor, 2434.6);
  assert.equal(l.futuros, 1);
  assert.deepEqual(l.linhas.map((x) => x.valor), [1500.5, -45.9, -10, -10]);
  assert.equal(l.linhas[0].descricao, "TED RECEBIDA HOSP SAO LUC DOC 000123");
  assert.ok(l.linhas[3].fitid.endsWith("#1"));
});

test("mesmo lançamento em outro arquivo gera o mesmo fitid (dedup diário x mensal)", () => {
  const [a] = lerCnab240Extrato(LINHAS.join("\n"));
  const [b] = lerCnab240Extrato([header, hLote, det(9, "1", "05102026", 1500.5, "C", "0007", "TED RECEBIDA HOSP SAO LUC", "000123"), tLote(2500.5, 0, 1500.5), trailer].join("\n"));
  assert.equal(a.linhas[0].fitid, b.linhas[0].fitid);
});

test("aceita linhas com brancos finais cortados", () => {
  assert.equal(lerCnab240Extrato(LINHAS.map((l) => l.trimEnd()).join("\n"))[0].linhas.length, 4);
});

test("confere a conta cadastrada", () => {
  const [l] = lerCnab240Extrato(LINHAS.join("\n"));
  assert.equal(loteDaConta(l, { agencia: "0123", numero: "12345-6" }), true);
  assert.equal(loteDaConta(l, { agencia: "123", numero: "12345" }), true);
  assert.equal(loteDaConta(l, { agencia: "0124", numero: "12345-6" }), false);
  assert.equal(loteDaConta(l, { agencia: null, numero: null }), null);
});

test("rejeita totais divergentes, arquivo incompleto e outro banco", () => {
  assert.throws(() => lerCnab240Extrato([header, hLote, det(1, "1", "05102026", 100, "C", "0007", "X", ""), tLote(1100, 0, 99), trailer].join("\n")), /não conferem/);
  assert.throws(() => lerCnab240Extrato([header, hLote, det(1, "1", "05102026", 100, "C", "0007", "X", "")].join("\n")), /incompleto/);
  assert.throws(() => lerCnab240Extrato(LINHAS.map((l) => "237" + l.slice(3)).join("\n")), /Itaú/);
  assert.throws(() => lerCnab240Extrato(header + "\n" + hLote + "X".repeat(5)), CnabError);
});
