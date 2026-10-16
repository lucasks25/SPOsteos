/**
 * Auditoria posição a posição da remessa SISPAG contra o manual "SISPAG — Layout de Arquivos — CNAB v085" (out/2020),
 * docs/manuais/itau-sispag-cnab240.pdf. Cada registro é conferido de 1 a 240: campo com conteúdo e todo o restante
 * em brancos (picture X) ou zeros (picture 9).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dvBarras, lerBoleto } from "@/app/(app)/financeiro/_lib/boleto";
import { descreverOcorrencias, foiDevolvido, gerarRemessaSispag, lerRetornoSispag, OCORRENCIAS, situacaoRetorno, type Empresa, type Pagamento } from "@/app/(app)/financeiro/_lib/sispag";

const BARRAS = "34196166700000123451101234567880057123457000"; // Anexo A
const emp: Empresa = { cnpj: "99999999000191", nome: "Distribuidora OPME Ltda", agencia: "0123", conta: "12345", dac: "6" };
const d = new Date("2026-10-20T00:00:00Z");
const fav = (nome: string, extra = {}) => ({ nome, documento: "99999999000272", banco: "033", agencia: "1234", conta: "556677", digito: "8", ...extra });
const B = (n: number) => " ".repeat(n);
const Z = (n: number) => "0".repeat(n);

/** Confere o registro inteiro: a soma dos campos tem de cobrir 1-240 sem buraco. */
function conferir(linha: string, campos: [number, number, string][], nome: string) {
  assert.equal(linha.length, 240, `${nome}: tamanho`);
  let pos = 1;
  for (const [ini, fim, v] of campos) {
    assert.equal(ini, pos, `${nome}: campo começa em ${ini}, esperado ${pos}`);
    assert.equal(v.length, fim - ini + 1, `${nome}: tamanho do campo ${ini}-${fim} no teste`);
    assert.equal(linha.slice(ini - 1, fim), v, `${nome}: posições ${ini}-${fim}`);
    pos = fim + 1;
  }
  assert.equal(pos, 241, `${nome}: campos não cobrem até 240`);
}

const headerLoteEsperado = (lote: string, forma: string, layout: string): [number, number, string][] => [
  [1, 3, "341"], [4, 7, lote], [8, 8, "1"], [9, 9, "C"], [10, 11, "20"], [12, 13, forma], [14, 16, layout], [17, 17, B(1)],
  [18, 18, "2"], [19, 32, "99999999000191"], [33, 36, B(4)], [37, 52, B(16)], [53, 57, "00123"], [58, 58, B(1)], [59, 70, "000000012345"],
  [71, 71, B(1)], [72, 72, "6"], [73, 102, "DISTRIBUIDORA OPME LTDA".padEnd(30)], [103, 132, B(30)], [133, 142, B(10)],
  [143, 172, B(30)], [173, 177, Z(5)], [178, 192, B(15)], [193, 212, B(20)], [213, 220, Z(8)], [221, 222, B(2)], [223, 230, B(8)], [231, 240, B(10)],
];

function remessaMista() {
  const pg: Pagamento[] = [
    { forma: "41", seuNumero: "SP1", data: d, valor: 19200, favorecido: fav("Fornecedor Ação Ltda") },
    { forma: "01", seuNumero: "SP2", data: d, valor: 50.5, favorecido: fav("Forn Itaú", { banco: "341", agencia: "1234", conta: "55667", digito: "8" }) },
    { forma: "30", seuNumero: "SP3", data: d, valor: 123.45, codigoBarras: BARRAS, vencimento: d, valorTitulo: 123.45, favorecido: fav("Forn Boleto") },
  ];
  return gerarRemessaSispag(emp, pg, new Date("2026-10-16T13:05:09Z"));
}

test("layout v085: header de arquivo, lotes 01/41/30, segmentos A, B, J, J-52 e trailers, posição a posição", () => {
  const txt = remessaMista();
  assert.ok(txt.endsWith("\r\n") && !/[^\r]\n/.test(txt), "linhas separadas por CRLF");
  const L = txt.split("\r\n").filter(Boolean);
  assert.equal(L.length, 14);
  conferir(L[0], [
    [1, 3, "341"], [4, 7, "0000"], [8, 8, "0"], [9, 14, B(6)], [15, 17, "080"], [18, 18, "2"], [19, 32, "99999999000191"], [33, 52, B(20)],
    [53, 57, "00123"], [58, 58, B(1)], [59, 70, "000000012345"], [71, 71, B(1)], [72, 72, "6"], [73, 102, "DISTRIBUIDORA OPME LTDA".padEnd(30)],
    [103, 132, "BANCO ITAU SA".padEnd(30)], [133, 142, B(10)], [143, 143, "1"], [144, 151, "16102026"], [152, 157, "100509"], [158, 166, Z(9)],
    [167, 171, Z(5)], [172, 240, B(69)],
  ], "header de arquivo");

  // lote 1: 01 crédito em conta Itaú (nota 11a)
  conferir(L[1], headerLoteEsperado("0001", "01", "040"), "header lote 01");
  const segA = (lote: string, camara: string, banco: string, conta: string, nome: string, sn: string, valor: string, extra113: string, finTed: string): [number, number, string][] => [
    [1, 3, "341"], [4, 7, lote], [8, 8, "3"], [9, 13, "00001"], [14, 14, "A"], [15, 17, "000"], [18, 20, camara], [21, 23, banco], [24, 43, conta],
    [44, 73, nome.padEnd(30)], [74, 93, sn.padEnd(20)], [94, 101, "20102026"], [102, 104, "REA"], [105, 112, B(8)], [113, 114, extra113],
    [115, 119, Z(5)], [120, 134, valor], [135, 149, B(15)], [150, 154, B(5)], [155, 162, Z(8)], [163, 177, Z(15)], [178, 197, B(20)],
    [198, 203, Z(6)], [204, 217, "99999999000272"], [218, 219, B(2)], [220, 224, finTed], [225, 229, B(5)], [230, 230, "0"], [231, 240, B(10)],
  ];
  conferir(L[2], segA("0001", "000", "341", "01234 000000055667 8", "FORN ITAU", "SP2", "000000000005050", B(2), B(5)), "segmento A 01");
  const segB = (lote: string): [number, number, string][] => [
    [1, 3, "341"], [4, 7, lote], [8, 8, "3"], [9, 13, "00001"], [14, 14, "B"], [15, 17, B(3)], [18, 18, "2"], [19, 32, "99999999000272"],
    [33, 62, B(30)], [63, 67, Z(5)], [68, 82, B(15)], [83, 97, B(15)], [98, 117, B(20)], [118, 125, Z(8)], [126, 127, B(2)], [128, 227, B(100)],
    [228, 230, B(3)], [231, 240, B(10)],
  ];
  conferir(L[3], segB("0001"), "segmento B 01 (nota 9: mesmo número do A)");
  const trailerLote = (lote: string, qtd: string, total: string): [number, number, string][] => [
    [1, 3, "341"], [4, 7, lote], [8, 8, "5"], [9, 17, B(9)], [18, 23, qtd], [24, 41, total], [42, 59, Z(18)], [60, 230, B(171)], [231, 240, B(10)],
  ];
  conferir(L[4], trailerLote("0001", "000004", "000000000000005050"), "trailer lote 01 (nota 17)");

  // lote 2: 41 TED outro titular (nota 11b, câmara zeros pela nota 35, finalidade 00005 pela nota 26)
  conferir(L[5], headerLoteEsperado("0002", "41", "040"), "header lote 41");
  conferir(L[6], segA("0002", "000", "033", "01234 000000556677 8", "FORNECEDOR ACAO LTDA", "SP1", "000000001920000", B(2), "00005"), "segmento A 41");
  conferir(L[7], segB("0002"), "segmento B 41");
  conferir(L[8], trailerLote("0002", "000004", "000000000001920000"), "trailer lote 41");

  // lote 3: 30 boleto Itaú (layout 030, segmentos J + J-52)
  conferir(L[9], headerLoteEsperado("0003", "30", "030"), "header lote 30"); // 033-052 X(20) em branco = 033-036 + 037-052
  conferir(L[10], [
    [1, 3, "341"], [4, 7, "0003"], [8, 8, "3"], [9, 13, "00001"], [14, 14, "J"], [15, 17, "000"], [18, 20, "341"], [21, 21, "9"], [22, 22, "6"],
    [23, 26, "1667"], [27, 36, "0000012345"], [37, 61, "1101234567880057123457000"], [62, 91, "FORN BOLETO".padEnd(30)], [92, 99, "20102026"],
    [100, 114, "000000000012345"], [115, 129, Z(15)], [130, 144, Z(15)], [145, 152, "20102026"], [153, 167, "000000000012345"], [168, 182, Z(15)],
    [183, 202, "SP3".padEnd(20)], [203, 215, B(13)], [216, 230, B(15)], [231, 240, B(10)],
  ], "segmento J");
  conferir(L[11], [
    [1, 3, "341"], [4, 7, "0003"], [8, 8, "3"], [9, 13, "00001"], [14, 14, "J"], [15, 17, "000"], [18, 19, "52"], [20, 20, "2"], [21, 35, "099999999000191"],
    [36, 75, "DISTRIBUIDORA OPME LTDA".padEnd(40)], [76, 76, "2"], [77, 91, "099999999000272"], [92, 131, "FORN BOLETO".padEnd(40)],
    [132, 132, "0"], [133, 147, Z(15)], [148, 187, B(40)], [188, 240, B(53)],
  ], "segmento J-52");
  conferir(L[12], trailerLote("0003", "000004", "000000000000012345"), "trailer lote 30");
  conferir(L[13], [[1, 3, "341"], [4, 7, "9999"], [8, 8, "9"], [9, 17, B(9)], [18, 23, "000003"], [24, 29, "000014"], [30, 240, B(211)]], "trailer de arquivo");
});

test("layout v085: lote Pix (forma 45) com segmento A câmara 009 / tipo 04 e segmento B Pix", () => {
  const L = gerarRemessaSispag(emp, [{ forma: "45", seuNumero: "SP9", data: d, valor: 10, favorecido: fav("Forn Pix", { chavePix: "99999999000191" }) }], new Date("2026-10-16T13:05:09Z"))
    .split("\r\n")
    .filter(Boolean);
  assert.equal(L.length, 6);
  conferir(L[1], headerLoteEsperado("0001", "45", "040"), "header lote 45");
  assert.equal(L[2].slice(17, 43), "009000" + B(20), "câmara 009 (nota 35); banco e conta opcionais na chave (nota 11)");
  assert.equal(L[2].slice(112, 114), "04", "nota 36: 04 = chave Pix");
  conferir(L[3], [
    [1, 3, "341"], [4, 7, "0001"], [8, 8, "3"], [9, 13, "00001"], [14, 14, "B"], [15, 16, "03"], [17, 17, B(1)], [18, 18, "2"], [19, 32, "99999999000272"],
    [33, 62, B(30)], [63, 127, Z(65)], [128, 227, "99999999000191".padEnd(100)], [228, 230, B(3)], [231, 240, B(10)],
  ], "segmento B Pix");
  assert.equal(L[4].slice(17, 23), "000004");
});

test("remessa recusa o que o banco rejeitaria: DV do boleto, forma x banco, TED para 341, DAC Itaú não numérico, chave com espaço", () => {
  const gerar = (p: Pagamento) => () => gerarRemessaSispag(emp, [p], d);
  const bol = (codigoBarras: string, forma: "30" | "31"): Pagamento => ({ forma, seuNumero: "S", data: d, valor: 1, codigoBarras, vencimento: d, valorTitulo: 1, favorecido: fav("F") });
  assert.throws(gerar(bol(BARRAS.slice(0, 4) + "7" + BARRAS.slice(5), "30")), /dígito verificador/);
  assert.throws(gerar(bol(BARRAS, "31")), /forma 31 não corresponde/);
  assert.throws(gerar({ forma: "41", seuNumero: "S", data: d, valor: 1, favorecido: fav("F", { banco: "341" }) }), /banco favorecido/);
  assert.throws(gerar({ forma: "41", seuNumero: "S", data: d, valor: 1, favorecido: fav("F", { banco: null }) }), /banco favorecido/);
  assert.throws(gerar({ forma: "01", seuNumero: "S", data: d, valor: 1, favorecido: fav("F", { banco: "341", conta: "12345", digito: "X" }) }), /dígito deve ser 1 número/);
  assert.throws(gerar({ forma: "45", seuNumero: "S", data: d, valor: 1, favorecido: fav("F", { chavePix: "fulano de tal@x.com" }) }), /espaço/);
  assert.throws(gerar({ forma: "01", seuNumero: "S", data: d, valor: 1, favorecido: fav("&&&", { banco: "341", conta: "12345" }) }), /sem nome/);
});

test("Anexo A: moeda diferente de 9 é recusada; fator abaixo de 1000 faz parte do valor", () => {
  const sem = (b43: string) => b43.slice(0, 4) + dvBarras(b43) + b43.slice(4);
  const moeda0 = sem("3410" + BARRAS.slice(5));
  assert.throws(() => lerBoleto(moeda0), /moeda/);
  const valorLongo = sem("3419" + "00012345678901" + BARRAS.slice(19)); // fator 0001 < 1000: posições 6-19 = valor
  assert.deepEqual([lerBoleto(valorLongo).valor, lerBoleto(valorLongo).fator], [123456789.01, 0]);
});

const put = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);
const comoRetorno = (rem: string, f: (l: string, i: number) => string) => rem.split("\r\n").map((l, i) => f(i === 0 ? put(l, 143, "2") : l, i)).join("\r\n");

test("retorno: ocorrência do trailer de lote (TA) vale para os pagamentos do lote sem ocorrência própria", () => {
  const ret = comoRetorno(remessaMista(), (l, i) => (i === 8 ? put(l, 231, "TA") : i === 2 ? put(l, 231, "BD") : l));
  const res = Object.fromEntries(lerRetornoSispag(ret).map((r) => [r.seuNumero, r.ocorrencias]));
  assert.deepEqual(res.SP1, ["TA"]);
  assert.equal(situacaoRetorno(res.SP1), "REJEITADO");
  assert.deepEqual(res.SP2, ["BD"]); // outro lote: não herda
});

test("retorno: B, Z e J-52 são ignorados; um resultado por pagamento", () => {
  const z = "34100013" + "00001Z" + " ".repeat(226);
  const L = comoRetorno(remessaMista(), (l) => l).split("\r\n");
  L.splice(4, 0, z); // segmento Z depois do B no lote 1
  const res = lerRetornoSispag(L.join("\r\n"));
  assert.deepEqual(res.map((r) => [r.seuNumero, r.segmento]), [["SP2", "A"], ["SP1", "A"], ["SP3", "J"]]);
});

test("nota 8: tabela completa, devolução prevalece sobre 00 e códigos que não dão baixa", () => {
  const nota8 = "00 AE AG AH AI AJ AL AM AN AO AP AQ AR BC BD BE BI BL CD CE CF CG CH CI CJ CK CL CM CN CO CP CQ CR CS DA DB DC DD DE DF DG DH DI DJ DK DL DM DV D0 D1 D2 D3 D4 D5 D6 D7 D8 D9 EM EX E0 E1 E2 E3 E4 FC FD HA HM IB IC ID IE IF IG IH II IJ IK IL IM IN IO IP IQ IR IS IT IU IV IX LA LC NA NB NC ND NE NF NG NH NI NR PD RJ RS SS TA TI X1 X2 X3 X4";
  for (const c of nota8.split(" ")) assert.ok(OCORRENCIAS[c], `código ${c} sem descrição`);
  assert.equal(situacaoRetorno(["00", "DV"]), "REJEITADO");
  assert.ok(foiDevolvido(["DV"]) && foiDevolvido(["EX"]) && !foiDevolvido(["00"]));
  assert.equal(situacaoRetorno(["00", "AE"]), "PAGO");
  for (const c of ["BD", "BE", "AE", "IR", "LA", "EM", "CP", "FC", "FD"]) assert.equal(situacaoRetorno([c]), "AGENDADO", c);
  assert.equal(situacaoRetorno(["BD", "AN"]), "REJEITADO");
  assert.equal(situacaoRetorno([]), "AGENDADO");
  assert.match(descreverOcorrencias(["ZZ"]), /não previsto na nota 8/);
});
