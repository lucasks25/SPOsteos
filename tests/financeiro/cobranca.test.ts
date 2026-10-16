import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoriaOcorrencia, CobrancaError, codigoBarras44, dacNossoNumero, dataDoFator, fatorVencimento, gerarRemessaCobranca,
  lerBoletoCobranca, lerRetornoCobranca, linhaDigitavel, nossoNumeroComDac, type Beneficiario, type EntradaTitulo,
} from "@/app/(app)/financeiro/_lib/cobranca";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const c = (l: string, i: number, f: number) => l.slice(i - 1, f);
const put = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);

// conta do exemplo da nota 23 (0057/72192); DAC = mod10("005772192") = 0
const ben: Beneficiario = { agencia: "0057", conta: "72192", dac: "0", nome: "Distribuidora OPME Ltda", cnpj: "12.345.678/0001-99", carteira: "109" };

const pagador = { nome: "Hospital São Lucas", documento: "11.222.333/0001-81", logradouro: "Av. Brasil, 1000 - Bloco B", bairro: "Jardim Paulistano", cep: "01430-001", cidade: "São José dos Campos", uf: "SP" };

const entrada = (extra: Partial<EntradaTitulo> = {}): EntradaTitulo => ({
  ocorrencia: "01", nossoNumero: "98712345", seuNumero: "NF12345", usoEmpresa: "cl9ab3xyz0001abcd", emissao: D("2026-10-10"),
  vencimento: D("2026-11-09"), valorCentavos: 1_234_567, jurosDiaCentavos: 412, pagador, ...extra,
});

test("DAC do nosso número: exemplos da nota 23 e do anexo 4", () => {
  assert.equal(dacNossoNumero({ agencia: "0057", conta: "72192", carteira: "109" }, "98712345"), 8); // "109/98712345-8"
  assert.equal(nossoNumeroComDac({ agencia: "57", conta: "72192", carteira: "109" }, "98712345"), "109/98712345-8");
  assert.equal(nossoNumeroComDac(ben, "1"), `109/00000001-${dacNossoNumero(ben, "00000001")}`);
  assert.throws(() => dacNossoNumero(ben, "123456789"), CobrancaError);
  assert.throws(() => dacNossoNumero(ben, "0"), /zero/);
});

test("fator de vencimento (anexo 6): exemplos do manual e reinício em 22/02/2025", () => {
  assert.equal(fatorVencimento(D("2000-07-03")), 1000);
  assert.equal(fatorVencimento(D("2002-05-01")), 1667);
  assert.equal(fatorVencimento(D("2010-11-17")), 4789);
  assert.equal(fatorVencimento(D("2014-03-13")), 6001);
  assert.equal(fatorVencimento(D("2025-02-21")), 9999);
  assert.equal(fatorVencimento(D("2025-02-22")), 1000);
  assert.equal(fatorVencimento(D("2025-02-23")), 1001);
  assert.equal(fatorVencimento(D("2025-02-26")), 1004);
  assert.equal(fatorVencimento(D("2029-04-03")), 2501); // limite "a vencer" do exemplo de 13/03/2014
  assert.throws(() => fatorVencimento(D("2000-07-02")), CobrancaError);
  // inverso pelo ciclo dentro da janela (-3000/+5500 dias)
  assert.equal(dataDoFator(1000, D("2026-10-15")).toISOString().slice(0, 10), "2025-02-22");
  assert.equal(dataDoFator(9999, D("2025-02-01")).toISOString().slice(0, 10), "2025-02-21");
  assert.equal(dataDoFator(1667, D("2002-04-01")).toISOString().slice(0, 10), "2002-05-01");
  assert.equal(dataDoFator(6001, D("2014-03-13")).toISOString().slice(0, 10), "2014-03-13");
});

/** Segundo caminho, independente do código: módulo 11 do anexo 2 escrito de novo. */
function mod11Manual(s43: string) {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  [...s43].reverse().forEach((d, i) => (soma += Number(d) * pesos[i % 8]));
  const r = 11 - (soma % 11);
  return [0, 1, 10, 11].includes(r) ? 1 : r;
}

test("código de barras 44 da carteira 109 e linha digitável (ida e volta)", () => {
  assert.equal(mod11Manual("3419166700000123451101234567880057123457000"), 6); // exemplo do anexo 2
  const barras = codigoBarras44(ben, { nossoNumero: "98712345", vencimento: D("2026-10-30"), valorCentavos: 1_234_567 });
  // montado à mão: 341 9 [DV] 1615 0001234567 109 98712345 8 0057 72192 0 000
  const semDv = "3419" + "1615" + "0001234567" + "109" + "98712345" + "8" + "0057" + "72192" + "0" + "000";
  assert.equal(barras, semDv.slice(0, 4) + mod11Manual(semDv) + semDv.slice(4));
  assert.equal(barras, "34196161500012345671099871234580057721920000");
  const linha = linhaDigitavel(barras);
  assert.equal(linha, "34191.09982 71234.580059 77219.200001 6 16150001234567");
  const lido = lerBoletoCobranca(linha, D("2026-10-15"));
  assert.equal(lido.codigoBarras, barras);
  assert.equal(lido.nossoNumero, "98712345");
  assert.equal(lido.valorCentavos, 1_234_567);
  assert.equal(lido.vencimento.toISOString().slice(0, 10), "2026-10-30");
  // vencimento antes do reinício do fator
  const antigo = codigoBarras44(ben, { nossoNumero: "1", vencimento: D("2025-02-21"), valorCentavos: 100 });
  assert.equal(c(antigo, 6, 9), "9999");
  assert.equal(lerBoletoCobranca(antigo, D("2025-02-01")).vencimento.toISOString().slice(0, 10), "2025-02-21");
});

test("boleto: recusa DAC de conta errado, valor zero e linha adulterada", () => {
  assert.throws(() => codigoBarras44({ ...ben, dac: "5" }, { nossoNumero: "1", vencimento: D("2026-11-01"), valorCentavos: 100 }), /DAC 5 não confere/);
  assert.throws(() => codigoBarras44(ben, { nossoNumero: "1", vencimento: D("2026-11-01"), valorCentavos: 0 }), /nota 8/);
  assert.throws(() => codigoBarras44(ben, { nossoNumero: "1", vencimento: D("2026-11-01"), valorCentavos: 10_000_000_000 }), /99.999.999,99/);
  assert.throws(() => lerBoletoCobranca("34191.09982 71234.580059 77219.200001 6 16150001234568", D("2026-10-15")), /dígito verificador/);
  assert.throws(() => lerBoletoCobranca("34191.09982 71234.580058 77219.200001 6 16150001234567", D("2026-10-15")), /campo 2/);
});

function remessa() {
  return gerarRemessaCobranca(
    ben,
    [
      entrada({ desconto: { ate: D("2026-11-01"), valorCentavos: 10_000 }, multa: { percentualCentesimos: 200 } }),
      entrada({ nossoNumero: "2", seuNumero: "NF2", usoEmpresa: undefined, valorCentavos: 50_000, pagador: { ...pagador, documento: "123.456.789-09" } }),
      { ocorrencia: "02", nossoNumero: "3", valorCentavos: 70_000 },
      { ocorrencia: "06", nossoNumero: "4", valorCentavos: 80_000, vencimento: D("2026-12-15") },
    ],
    new Date("2026-10-16T02:30:00Z"), // 15/10 23:30 em Brasília
  );
}

test("remessa: header, detalhe, multa, instruções e trailer campo a campo", () => {
  const txt = remessa();
  assert.ok(txt.endsWith("\r\n"));
  const L = txt.split("\r\n").filter(Boolean);
  assert.equal(L.length, 7);
  for (const [i, l] of L.entries()) {
    assert.equal(l.length, 400);
    assert.equal(c(l, 395, 400), String(i + 1).padStart(6, "0"));
  }
  const h = L[0];
  assert.equal(c(h, 1, 26), "01REMESSA01COBRANCA       ");
  assert.equal(c(h, 27, 38), "005700721920");
  assert.equal(c(h, 47, 76), "DISTRIBUIDORA OPME LTDA       ");
  assert.equal(c(h, 77, 94), "341BANCO ITAU SA  ");
  assert.equal(c(h, 95, 100), "151026");
  assert.equal(c(h, 101, 394).trim(), "");

  const d = L[1];
  assert.equal(c(d, 1, 17), "102" + "12345678000199");
  assert.equal(c(d, 18, 29), "005700721920");
  assert.equal(c(d, 30, 37), "    0000");
  assert.equal(c(d, 38, 62), "CL9AB3XYZ0001ABCD        ");
  assert.equal(c(d, 63, 70), "98712345");
  assert.equal(c(d, 71, 83), "0".repeat(13));
  assert.equal(c(d, 84, 86), "109");
  assert.equal(c(d, 87, 107), " ".repeat(21));
  assert.equal(c(d, 108, 110), "I01");
  assert.equal(c(d, 111, 120), "NF12345   ");
  assert.equal(c(d, 121, 126), "091126");
  assert.equal(c(d, 127, 139), "0000001234567");
  assert.equal(c(d, 140, 147), "34100000");
  assert.equal(c(d, 148, 156), "01N101026");
  assert.equal(c(d, 157, 160), "    ");
  assert.equal(c(d, 161, 173), "0000000000412");
  assert.equal(c(d, 174, 192), "011126" + "0000000010000");
  assert.equal(c(d, 193, 218), "0".repeat(26));
  assert.equal(c(d, 219, 234), "02" + "11222333000181");
  assert.equal(c(d, 235, 274), "HOSPITAL SAO LUCAS".padEnd(40));
  assert.equal(c(d, 275, 314), "AV. BRASIL, 1000 - BLOCO B".padEnd(40));
  assert.equal(c(d, 315, 326), "JARDIM PAULI"); // bairro truncado em 12
  assert.equal(c(d, 327, 334), "01430001");
  assert.equal(c(d, 335, 351), "SAO JOSE DOS CASP"); // cidade truncada em 15 + UF
  assert.equal(c(d, 352, 394), " ".repeat(34) + "00000000 ");

  const m = L[2]; // registro 2 — multa 2,00% a partir do dia seguinte ao vencimento
  assert.equal(c(m, 1, 23), "2" + "2" + "10112026" + "0000000000200");
  assert.equal(c(m, 24, 394).trim(), "");

  assert.equal(c(L[3], 2, 3), "02"); // pagador CPF não muda o tipo da empresa
  assert.equal(c(L[3], 219, 234), "01" + "00012345678909");

  const b = L[4]; // pedido de baixa: só obrigatórios da nota 6 (A)
  assert.equal(c(b, 1, 37), "1" + "0".repeat(16) + "005700721920" + "    0000");
  assert.equal(c(b, 63, 70), "00000003");
  assert.equal(c(b, 84, 110), "109" + " ".repeat(21) + "I02");
  assert.equal(c(b, 121, 139), "000000" + "0000000070000");
  const v = L[5]; // alteração de vencimento
  assert.equal(c(v, 108, 126), "I06" + " ".repeat(10) + "151226");

  assert.equal(c(L[6], 1, 1), "9");
  assert.equal(c(L[6], 2, 394).trim(), "");
});

test("remessa: recusa campo que não cabe e dados inválidos (não trunca identificadores)", () => {
  const gera = (t: EntradaTitulo) => gerarRemessaCobranca(ben, [t], new Date());
  assert.throws(() => gera(entrada({ seuNumero: "NF-123456789" })), /Nº do documento.*10 caracteres/);
  assert.throws(() => gera(entrada({ usoEmpresa: "x".repeat(26) })), /Uso da empresa/);
  assert.throws(() => gera(entrada({ pagador: { ...pagador, nome: "SOCIEDADE BENEFICENTE ISRAELITA BRASILEIRA ALBERT EINSTEIN" } })), /Nome do pagador.*40/);
  assert.throws(() => gera(entrada({ pagador: { ...pagador, logradouro: "R".repeat(41) } })), /Endereço/);
  assert.throws(() => gera(entrada({ nossoNumero: "123456789" })), /8 dígitos/);
  assert.throws(() => gera(entrada({ valorCentavos: 12.5 })), CobrancaError);
  assert.throws(() => gera(entrada({ valorCentavos: 100_000_000_000_000 })), /não cabe em 13/);
  assert.throws(() => gera(entrada({ jurosDiaCentavos: -1 })), /Juros/);
  assert.throws(() => gera(entrada({ pagador: { ...pagador, uf: "XX" } })), /UF/);
  assert.throws(() => gera(entrada({ pagador: { ...pagador, cep: "1430-001" } })), /CEP/);
  assert.throws(() => gera(entrada({ pagador: { ...pagador, documento: "123" } })), /CPF\/CNPJ/);
  assert.throws(() => gera(entrada({ especie: "18" })), /Espécie/);
  assert.throws(() => gera(entrada({ vencimento: D("2026-10-01") })), /vencimento antes da emissão/);
  assert.throws(() => gera(entrada({ desconto: { ate: D("2026-11-01"), valorCentavos: 1_200_000 } })), /90%/);
  assert.throws(() => gera(entrada({ multa: { percentualCentesimos: 10_000 } })), /100%/);
  assert.throws(() => gera(entrada({ multa: { valorCentavos: 100, data: D("2026-11-08") } })), /antes do vencimento/);
  assert.throws(() => gerarRemessaCobranca(ben, [entrada(), entrada({ seuNumero: "X" })], new Date()), /repetido/);
  assert.throws(() => gerarRemessaCobranca({ ...ben, dac: "1" }, [entrada()], new Date()), /DAC/);
  assert.throws(() => gerarRemessaCobranca(ben, [], new Date()), /Nenhum/);
});

/** Monta um retorno a partir da remessa: copia identificação do registro 1 e grava os campos do retorno. */
function retorno(eventos: { base: number; campos: [number, string][] }[], trailer?: { qtd?: number; total?: number }) {
  const R = remessa().split("\r\n").filter(Boolean);
  const header = put(put(R[0], 2, "2RETORNO"), 109, "00042" + "161026");
  const linhas = [header];
  let total = 0;
  for (const e of eventos) {
    const rem = R[e.base];
    let l = put(rem.slice(0, 62) + " ".repeat(338), 30, " ".repeat(8)); // identificação até o uso da empresa
    l = put(l, 83, "109" + c(rem, 63, 70) + String(dacNossoNumero(ben, c(rem, 63, 70))));
    l = put(l, 108, "I");
    l = put(l, 117, c(rem, 111, 120));
    l = put(l, 127, c(rem, 63, 70));
    l = put(l, 147, c(rem, 121, 126) + c(rem, 127, 139) + "341");
    for (const [ini, v] of e.campos) l = put(l, ini, v);
    total += Number(c(l, 153, 165));
    linhas.push(l);
  }
  let t = put(" ".repeat(400), 1, "9201341");
  t = put(t, 213, String(trailer?.qtd ?? eventos.length).padStart(8, "0") + String(trailer?.total ?? total).padStart(14, "0"));
  linhas.push(t);
  return linhas.map((l, i) => put(l, 395, String(i + 1).padStart(6, "0"))).join("\r\n") + "\r\n";
}

const v13 = (n: number) => String(n).padStart(13, "0");

test("retorno: entrada confirmada, rejeitada com motivos, liquidação, baixa e alteração", () => {
  const txt = retorno([
    { base: 1, campos: [[109, "02101026"], [378, "01      "]] },
    { base: 3, campos: [[109, "03101026"], [378, "0811    "]] },
    { base: 1, campos: [[109, "06051126"], [176, v13(350)], [241, v13(10_000)], [254, v13(1_224_567)], [267, v13(0)], [296, "061126"], [325, "HOSPITAL SAO LUCAS"], [393, "B1"]] },
    { base: 4, campos: [[109, "09201026"], [169, "7744"]] },
    { base: 5, campos: [[109, "14201026"]] },
    { base: 5, campos: [[109, "17201026"], [378, "05"]] },
  ]);
  const r = lerRetornoCobranca(txt);
  assert.deepEqual([r.agencia, r.conta, r.dac, r.sequencialArquivo], ["0057", "72192", "0", 42]);
  assert.equal(r.dataCredito?.toISOString().slice(0, 10), "2026-10-16");
  const [conf, rej, liq, baixa, alt, altRej] = r.eventos;

  assert.equal(conf.ocorrencia.categoria, "ENTRADA_CONFIRMADA");
  assert.equal(conf.nossoNumero, "98712345");
  assert.equal(conf.dacNossoNumero, "8");
  assert.equal(conf.seuNumero, "NF12345");
  assert.equal(conf.usoEmpresa, "CL9AB3XYZ0001ABCD");
  assert.equal(conf.mensagens[0].codigo, "01");
  assert.deepEqual(conf.motivosRejeicao, []);

  assert.equal(rej.ocorrencia.categoria, "ENTRADA_REJEITADA");
  assert.deepEqual(rej.motivosRejeicao.map((m) => m.codigo), ["08", "11"]);
  assert.match(rej.motivosRejeicao[1].descricao, /CEP/);

  assert.equal(liq.ocorrencia.codigo, "06");
  assert.equal(liq.ocorrencia.categoria, "LIQUIDACAO");
  assert.equal(liq.dataOcorrencia?.toISOString().slice(0, 10), "2026-11-05");
  assert.equal(liq.vencimento?.toISOString().slice(0, 10), "2026-11-09");
  assert.equal(liq.dataCredito?.toISOString().slice(0, 10), "2026-11-06");
  assert.deepEqual(liq.centavos, { titulo: 1_234_567, pago: 1_224_567, jurosMulta: 0, desconto: 10_000, abatimento: 0, tarifa: 350, iof: 0, outrosCreditos: 0 });
  assert.equal(liq.codigoLiquidacao?.descricao, "Outros bancos - código de barras");
  assert.equal(liq.nomePagador, "HOSPITAL SAO LUCAS");

  assert.equal(baixa.ocorrencia.categoria, "BAIXA");
  assert.equal(baixa.agenciaCobradora, "7744");
  assert.equal(alt.ocorrencia.categoria, "ALTERACAO");
  assert.equal(altRej.ocorrencia.categoria, "REJEICAO_INSTRUCAO");
  assert.match(altRej.motivosRejeicao[0].descricao, /vencimento/i);
  assert.equal(r.trailer.quantidade, 6);
});

test("retorno: categorias de liquidação e baixa", () => {
  for (const cod of ["06", "07", "08"]) assert.equal(categoriaOcorrencia(cod), "LIQUIDACAO");
  for (const cod of ["09", "10", "32", "59"]) assert.equal(categoriaOcorrencia(cod), "BAIXA");
  assert.equal(categoriaOcorrencia("28"), "TARIFA");
  assert.equal(categoriaOcorrencia("25"), "OUTRA");
});

test("retorno: recusa remessa, linha fora de 400, sequência e totais do trailer", () => {
  assert.throws(() => lerRetornoCobranca(remessa()), /remessa/);
  const ok = retorno([{ base: 1, campos: [[109, "02101026"]] }]);
  assert.equal(lerRetornoCobranca(ok).eventos.length, 1);
  const L = ok.split("\r\n");
  assert.throws(() => lerRetornoCobranca([L[0], L[1].slice(0, 399), L[2]].join("\r\n")), /399 caracteres/);
  assert.throws(() => lerRetornoCobranca([L[0], put(L[1], 395, "000005"), L[2]].join("\r\n")), /sequencial/);
  assert.throws(() => lerRetornoCobranca(retorno([{ base: 1, campos: [[109, "02101026"]] }], { qtd: 2 })), /Trailer informa 2/);
  assert.throws(() => lerRetornoCobranca(retorno([{ base: 1, campos: [[109, "02101026"]] }], { total: 1 })), /total/);
  assert.throws(() => lerRetornoCobranca([L[0], L[1]].join("\r\n")), /trailer/);
  assert.throws(() => lerRetornoCobranca(put(ok, 77, "237")), /header inválido/);
});

test("fator: próximo reinício (9999 em 13/10/2049, 1000 em 14/10/2049)", () => {
  assert.equal(fatorVencimento(D("2049-10-13")), 9999);
  assert.equal(fatorVencimento(D("2049-10-14")), 1000);
});

test("item 2.2: '&' e acentos não vão ao arquivo", () => {
  const txt = gerarRemessaCobranca(ben, [entrada({ pagador: { ...pagador, nome: "Johnson & Johnson Saúde" } })], new Date("2026-10-16T12:00:00Z"));
  const det = txt.split("\r\n")[1];
  assert.equal(c(det, 235, 274).trimEnd(), "JOHNSON E JOHNSON SAUDE");
  assert.ok(/^[\x20-\x7E\r\n]*$/.test(txt), "só ASCII imprimível");
});

/**
 * Retorno de exemplo montado só pelo manual (seção 3.2 e notas 17, 20 e 28), sem partir da remessa: header, seis
 * detalhes (02 com mensagem da tabela 10, 03 com dois motivos da tabela 1, 06 liquidação com tarifa e juros, 10 baixa
 * por ter sido liquidado, 57 com instrução cancelada 1156 e 69 cheque devolvido motivo 11 da tabela 9) e trailer.
 */
test("retorno CNAB 400 de exemplo montado posição a posição pelo manual", () => {
  const branco = " ".repeat(400);
  const hdr = [[1, "0"], [2, "2"], [3, "RETORNO"], [10, "01"], [12, "COBRANCA".padEnd(15)], [27, "0057"], [31, "00"], [33, "72192"], [38, "0"], [47, "DISTRIBUIDORA OPME LTDA".padEnd(30)], [77, "341"], [80, "BANCO ITAU SA".padEnd(15)], [95, "161026"], [101, "01600"], [106, "BPI"], [109, "00007"], [114, "161026"]] as const;
  const det = (nn: string, cod: string, valor: number, extra: [number, string][] = []) => {
    const campos: [number, string][] = [[1, "1"], [2, "02"], [4, "12345678000199"], [18, "0057"], [22, "00"], [24, "72192"], [29, "0"], [38, "TITULO-" + nn], [63, nn], [83, "109"], [86, nn], [94, String(dacNossoNumero(ben, nn))], [108, "I"], [109, cod], [111, "151026"], [117, "NF" + nn.slice(-4) + "    "], [127, nn], [147, "091126"], [153, v13(valor)], [166, "341"], [169, "0000"], [173, "0"], [174, "01"], ...extra];
    return campos.reduce((l, [i, v]) => put(l, i, v), branco);
  };
  const L = [
    hdr.reduce((l, [i, v]) => put(l, i, v), branco),
    det("00000001", "02", 100_000, [[378, "01"]]),
    det("00000002", "03", 50_000, [[378, "0811"]]),
    det("00000003", "06", 120_000, [[176, v13(250)], [254, v13(120_500)], [267, v13(500)], [296, "171026"], [325, "HOSPITAL SAO LUCAS".padEnd(30)], [393, "CP"]]),
    det("00000003", "10", 120_000),
    det("00000004", "57", 80_000, [[302, "1156"]]),
    det("00000005", "69", 70_000, [[254, v13(70_000)], [378, "11"]]),
  ];
  const total = 100_000 + 50_000 + 120_000 * 2 + 80_000 + 70_000;
  L.push([[1, "9"], [2, "2"], [3, "01"], [5, "341"], [208, "00007"], [213, String(6).padStart(8, "0")], [221, String(total).padStart(14, "0")]].reduce((l, [i, v]) => put(l, i as number, v as string), branco));
  const txt = L.map((l, i) => put(l, 395, String(i + 1).padStart(6, "0"))).join("\r\n") + "\r\n";
  for (const l of txt.split("\r\n").filter(Boolean)) assert.equal(l.length, 400);

  const r = lerRetornoCobranca(txt);
  assert.deepEqual([r.sequencialArquivo, r.dataGeracao?.toISOString().slice(0, 10)], [7, "2026-10-16"]);
  const [conf, rej, liq, baixa, cancel, cheque] = r.eventos;
  assert.equal(conf.mensagens[0].descricao, "CEP sem atendimento de protesto no momento");
  assert.deepEqual(rej.motivosRejeicao.map((m) => m.codigo), ["08", "11"]);
  assert.deepEqual([liq.ocorrencia.categoria, liq.centavos.pago, liq.centavos.tarifa, liq.centavos.jurosMulta], ["LIQUIDACAO", 120_500, 250, 500]);
  assert.equal(liq.codigoLiquidacao?.codigo, "CP");
  assert.equal(liq.dataCredito?.toISOString().slice(0, 10), "2026-10-17");
  assert.equal(baixa.ocorrencia.categoria, "BAIXA");
  assert.equal(cancel.complemento?.descricao, "Não protestar");
  assert.equal(cheque.ocorrencia.categoria, "CHEQUE_DEVOLVIDO");
  assert.match(cheque.motivosRejeicao[0].descricao, /Sem fundos - 1ª apresentação/);
  assert.equal(conf.dacNossoNumero, String(dacNossoNumero(ben, "00000001")));
});

test("anexos 2 e 3: código de barras e linha digitável do exemplo oficial (0057/12345-7, 110/12345678-8, R$ 123,45, 01/05/2002)", () => {
  const barras = "34196166700000123451101234567880057123457000";
  assert.equal(mod11Manual(barras.slice(0, 4) + barras.slice(5)), 6);
  assert.equal(linhaDigitavel(barras), "34191.10121 34567.880058 71234.570001 6 16670000012345");
});
