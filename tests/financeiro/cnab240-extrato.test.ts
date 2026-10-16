import assert from "node:assert/strict";
import { test } from "node:test";
import { CnabError, lerCnab240Extrato, loteDaConta, loteDeAplicacao, pareceCnab240 } from "@/app/(app)/financeiro/_lib/cnab240-extrato";

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
// qtd = registros 1 + 3 + 5 do lote (nota 10)
const tLote = (saldo: number, d: number, c: number, qtd: number) =>
  reg([...conta(), [8, 8, "5"], [143, 150, "13102026"], [151, 168, val(saldo)], [169, 169, saldo < 0 ? "D" : "C"], [170, 170, "F"], [171, 176, num(qtd, 6)], [177, 194, val(d)], [195, 212, val(c)], [213, 230, val(0)]]);
// lotes = registros tipo 1; registros = 0 + 1 + 3 + 5 + 9 (nota 10)
const trailerDe = (lotes: number, registros: number) => reg([[1, 3, "341"], [4, 7, "9999"], [8, 8, "9"], [18, 23, num(lotes, 6)], [24, 29, num(registros, 6)], [30, 35, num(lotes, 6)]]);
/** Arquivo de um lote: header, header de lote, detalhes, trailer de lote (contagem certa) e trailer de arquivo. */
const arquivo = (dets: string[], saldo: number, d: number, c: number) => [header, hLote, ...dets, tLote(saldo, d, c, dets.length + 2), trailerDe(1, dets.length + 4)];
const LINHAS = arquivo(
  [
    det(1, "1", "05102026", 1500.5, "C", "0007", "TED RECEBIDA HOSP SAO LUC", "000123"),
    det(2, "1", "06102026", 45.9, "D", "0074", "TARIFA MANUTENCAO", ""),
    det(3, "1", "06102026", 10, "D", "0074", "TARIFA AVULSA", ""),
    det(4, "1", "06102026", 10, "D", "0074", "TARIFA AVULSA", ""),
    det(5, "5", "20102026", 999, "D", "0069", "PAGTO FUTURO", ""),
  ],
  1000 + 1500.5 - 45.9 - 20,
  65.9,
  1500.5,
);

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
  assert.equal(l.saldoConfere, true);
  assert.equal(l.tipoConta, "");
  assert.deepEqual([l.linhas[0].categoria, l.linhas[0].codigo, l.linhas[0].aCompensar], ["209", "0007", false]);
});

test("mesmo lançamento em outro arquivo gera o mesmo fitid (dedup diário x mensal)", () => {
  const [a] = lerCnab240Extrato(LINHAS.join("\n"));
  const [b] = lerCnab240Extrato([header, hLote, det(9, "1", "05102026", 1500.5, "C", "0007", "TED RECEBIDA HOSP SAO LUC", "000123"), tLote(2500.5, 0, 1500.5, 3), trailerDe(1, 5)].join("\n"));
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
  assert.throws(() => lerCnab240Extrato([header, hLote, det(1, "1", "05102026", 100, "C", "0007", "X", ""), tLote(1100, 0, 99, 3), trailerDe(1, 5)].join("\n")), /não conferem/);
  assert.throws(() => lerCnab240Extrato([header, hLote, det(1, "1", "05102026", 100, "C", "0007", "X", "")].join("\n")), /incompleto/);
  assert.throws(() => lerCnab240Extrato(LINHAS.map((l) => "237" + l.slice(3)).join("\n")), /Itaú/);
  assert.throws(() => lerCnab240Extrato(header + "\n" + hLote + "X".repeat(5)), CnabError);
});

test("nota 10: recusa contagem errada no trailer de lote e de arquivo (arquivo cortado)", () => {
  const ok = arquivo([det(1, "1", "05102026", 100, "C", "0007", "X", "")], 1100, 0, 100);
  assert.equal(lerCnab240Extrato(ok.join("\n")).length, 1);
  const semDet = [...ok];
  semDet[3] = tLote(1100, 0, 100, 2); // diz 2 registros no lote, mas há 3
  assert.throws(() => lerCnab240Extrato(semDet.join("\n")), /informa 000002 registros, mas o lote tem 3/);
  const tr = [...ok];
  tr[4] = trailerDe(1, 4);
  assert.throws(() => lerCnab240Extrato(tr.join("\n")), /Trailer do arquivo informa/);
  tr[4] = trailerDe(2, 5);
  assert.throws(() => lerCnab240Extrato(tr.join("\n")), /2 lote/);
  assert.throws(() => lerCnab240Extrato([...ok, ok[0]].join("\n")), /depois do trailer/);
  // registro de outro lote dentro do lote
  const outro = [...ok];
  outro[2] = "341" + "0002" + ok[2].slice(7);
  assert.throws(() => lerCnab240Extrato(outro.join("\n")), /lote 0002 dentro do lote 0001/);
  // EOF DOS (0x1A) e BOM
  assert.equal(lerCnab240Extrato("\uFEFF" + ok.join("\r\n") + "\r\n\x1A").length, 1);
});

test("saldo que não fecha é sinalizado (saldoConfere = false), sem recusar o arquivo", () => {
  const [l] = lerCnab240Extrato(arquivo([det(1, "1", "05102026", 100, "C", "0007", "X", "")], 1150, 0, 100).join("\n"));
  assert.equal(l.saldoConfere, false);
});

/**
 * Arquivo de exemplo montado pelo manual v08.5 (set/2018), posição a posição: um lote de conta corrente e o lote
 * OPCIONAL "Aplic Aut Mais - CDB" (tipo de conta 0202, natureza APL), com o trailer de lote do CDB dividido em
 * 213-226 / 227-240. Também usa os campos novos do segmento E (033-038 histórico, 202-213 origem, 214-228 emitente).
 */
test("v08.5: arquivo de exemplo com lote de conta corrente e lote Aplic Aut Mais - CDB", () => {
  const base = (lote: string): [number, number, string][] => [[1, 3, "341"], [4, 7, lote], [18, 18, "2"], [19, 32, "12345678000199"], [48, 52, "ABCDE"], [53, 53, "0"], [54, 57, "0123"], [59, 65, "0000000"], [66, 70, "12345"], [72, 72, "6"]];
  const hArq = reg([[1, 3, "341"], [4, 7, "0000"], [8, 8, "0"], [18, 18, "2"], [19, 32, "12345678000199"], [48, 52, "ABCDE"], [53, 53, "0"], [54, 57, "0123"], [59, 65, "0000000"], [66, 70, "12345"], [72, 72, "6"], [73, 102, alfa("DISTRIBUIDORA OPME LTDA", 30)], [103, 132, alfa("BANCO ITAU", 30)], [143, 143, "2"], [144, 151, "16102026"], [152, 157, "063000"], [158, 163, "000042"], [164, 166, "050"], [167, 171, "00000"]]);
  const hL = (lote: string, tipoConta: string, saldo: number) =>
    reg([...base(lote), [8, 8, "1"], [9, 9, "E"], [10, 11, "04"], [12, 13, "40"], [14, 16, "050"], [33, 36, alfa(tipoConta, 4)], [73, 102, alfa("DISTRIBUIDORA OPME LTDA", 30)], [143, 150, "15102026"], [151, 168, val(saldo)], [169, 169, "C"], [170, 170, "F"], [171, 173, "BRL"], [174, 178, "00007"]]);
  const segE = (lote: string, seq: number, v: number, dc: string, cat: string, cod: string, hist: string, extra: [number, number, string][] = []) =>
    reg([...base(lote), [8, 8, "3"], [9, 13, num(seq, 5)], [14, 14, "E"], [15, 15, "1"], [73, 102, alfa("DISTRIBUIDORA OPME LTDA", 30)], [109, 111, lote === "0001" ? "DPV" : "APL"], [135, 142, "15102026"], [143, 150, "15102026"], [151, 168, val(v)], [169, 169, dc], [170, 172, cat], [173, 176, cod], [177, 201, alfa(hist, 25)], ...extra]);
  const ted = segE("0001", 1, 2500, "C", "209", "0007", "TED 341.0001.HOSP SAO LU", [[33, 38, "TEDREC"], [202, 205, "0001"], [206, 207, "00"], [208, 212, "98765"], [213, 213, "4"], [214, 214, "2"], [215, 228, "11222333000181"], [235, 240, "000777"]]);
  const pix = segE("0001", 2, 300, "D", "120", "0008", "PIX ENVIADO FORNEC");
  const tL1 = reg([...base("0001"), [8, 8, "5"], [89, 142, "0".repeat(54)], [143, 150, "15102026"], [151, 168, val(5000 + 2500 - 300)], [169, 169, "C"], [170, 170, "F"], [171, 176, num(4, 6)], [177, 194, val(300)], [195, 212, val(2500)], [213, 230, val(0)]]);
  const apl = segE("0002", 1, 2000, "C", "206", "0048", "APLIC AUT MAIS RESGATE");
  const tL2 = reg([...base("0002"), [8, 8, "5"], [89, 142, "0".repeat(54)], [143, 150, "15102026"], [151, 168, val(8000)], [169, 169, "C"], [170, 170, "F"], [171, 176, num(3, 6)], [177, 194, val(0)], [195, 212, val(2000)], [213, 226, num(0, 14)], [227, 240, num(0, 14)]]);
  const tArq = reg([[1, 3, "341"], [4, 7, "9999"], [8, 8, "9"], [18, 23, num(2, 6)], [24, 29, num(9, 6)], [30, 35, num(2, 6)]]);
  const linhas = [hArq, hL("0001", "", 5000), ted, pix, tL1, hL("0002", "0202", 10000), apl, tL2, tArq];
  for (const l of linhas) assert.equal(l.length, 240);
  const lotes = lerCnab240Extrato(linhas.join("\r\n") + "\r\n");
  assert.equal(lotes.length, 2);
  const [cc, cdb] = lotes;
  assert.deepEqual([cc.tipoConta, loteDeAplicacao(cc), cdb.tipoConta, loteDeAplicacao(cdb)], ["", false, "0202", true]);
  assert.deepEqual(cc.linhas.map((x) => x.valor), [2500, -300]);
  assert.equal(cc.linhas[0].descricao, "TED 341.0001.HOSP SAO LU DOC 000777");
  assert.equal(cc.saldoFinal?.valor, 7200);
  assert.equal(cc.saldoConfere, true);
  // o CDB tem a mesma agência/conta: só o filtro por tipo de conta impede misturar com a conta corrente
  assert.equal(loteDaConta(cdb, { agencia: "0123", numero: "12345-6" }), true);
});
