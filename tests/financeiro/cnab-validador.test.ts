import assert from "node:assert/strict";
import { test } from "node:test";
import { relatorioValidacao, validarSispag } from "@/app/(app)/financeiro/_lib/cnab-validador";
import {
  conferirCobertura, HEADER_ARQUIVO, HEADER_LOTE_030, HEADER_LOTE_040, type Layout, LAYOUTS_SISPAG, SEGMENTO_A, SEGMENTO_B, SEGMENTO_B_PIX,
  SEGMENTO_J, SEGMENTO_J52, TRAILER_ARQUIVO, TRAILER_LOTE,
} from "@/app/(app)/financeiro/_lib/cnab-layout-sispag";
import { cnpjValido, conferirChavePix, cpfValido, dvCodigoBarras } from "@/app/(app)/financeiro/_lib/cnab-validador-regras";
import { cenariosHomologacao, EMPRESA_FICTICIA, simularRetornoSispag } from "@/app/(app)/financeiro/_lib/cnab-homologacao";
import { gerarRemessaSispag, lerRetornoSispag, situacaoRetorno } from "@/app/(app)/financeiro/_lib/sispag";

const PAGTO = new Date("2026-10-26T00:00:00Z");
const GERADO = new Date("2026-10-16T13:00:00Z");
const cenarios = cenariosHomologacao(PAGTO);
const gerar = (arquivo: string) => gerarRemessaSispag(EMPRESA_FICTICIA, cenarios.find((c) => c.arquivo === arquivo)!.pagamentos, GERADO);
const linhas = (s: string) => s.split("\r\n").filter(Boolean);
const juntar = (ls: string[]) => ls.join("\r\n") + "\r\n";
const poe = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);
/** Troca o conteúdo de uma posição de uma linha (1-based). */
const mutar = (arq: string, linha: number, ini: number, v: string) => {
  const ls = linhas(arq);
  ls[linha - 1] = poe(ls[linha - 1], ini, v);
  return juntar(ls);
};
const erros = (arq: string) => validarSispag(arq).erros;
const temErro = (arq: string, filtro: (e: ReturnType<typeof erros>[number]) => boolean, msg: string) => {
  const es = erros(arq);
  assert.ok(es.some(filtro), `${msg}\n${es.map((e) => `${e.linha}:${e.ini}-${e.fim} ${e.campo} | ${e.esperado}`).join("\n")}`);
};

test("layouts transcritos do manual cobrem 001-240 sem buraco nem sobreposição", () => {
  for (const l of LAYOUTS_SISPAG) assert.equal(conferirCobertura(l), null);
});

test("regras independentes: DV do Anexo A, CPF/CNPJ e chave Pix (nota 40)", () => {
  assert.equal(dvCodigoBarras("34196166700000123451101234567880057123457000"), 6); // exemplo do Anexo A
  assert.ok(cnpjValido("11222333000181") && !cnpjValido("12345678000199"));
  assert.ok(cpfValido("52998224725") && !cpfValido("11111111111"));
  assert.equal(conferirChavePix("02", "a@b.com.br"), null);
  assert.equal(conferirChavePix("04", "123e4567-e89b-12d3-a456-426614174000"), null);
  assert.match(conferirChavePix("01", "+551199999000") ?? "", /9 dígitos/);
  assert.match(conferirChavePix("02", `${"a".repeat(75)}@x.com`) ?? "", /77/);
});

for (const c of cenarios) {
  test(`remessa gerada pelo sistema passa sem erro nem aviso: ${c.arquivo}`, () => {
    const r = validarSispag(gerarRemessaSispag(EMPRESA_FICTICIA, c.pagamentos, GERADO));
    assert.deepEqual(r.erros, [], relatorioValidacao(r));
    assert.deepEqual(r.avisos, [], relatorioValidacao(r));
    assert.equal(r.tipo, "remessa");
  });
}

test("retorno simulado: válido no validador e lido pelo leitor do sistema", () => {
  const rem = gerar("06-misto-ted-credito-boletos.rem");
  const ret = simularRetornoSispag(rem, { "HOMOLOG-06A": "BD", "HOMOLOG-06D": "IP" });
  const r = validarSispag(ret);
  assert.equal(r.tipo, "retorno");
  assert.deepEqual(r.erros, [], relatorioValidacao(r));
  const res = Object.fromEntries(lerRetornoSispag(ret).map((x) => [x.seuNumero, situacaoRetorno(x.ocorrencias)]));
  assert.deepEqual(res, { "HOMOLOG-06A": "AGENDADO", "HOMOLOG-06B": "PAGO", "HOMOLOG-06C": "PAGO", "HOMOLOG-06D": "REJEITADO" });
  // o retorno não pode ser confundido com remessa: campos (*) preenchidos reprovam se o código do header for 1
  temErro(mutar(ret, 1, 143, "1"), (e) => e.campo === "NOSSO NÚMERO" || /só do retorno/.test(e.esperado), "retorno com código 1 deveria reprovar");
});

test("forma física: 240 bytes, CRLF, caracteres", () => {
  const rem = gerar("01-credito-conta-itau.rem");
  const ls = linhas(rem);
  temErro(juntar([ls[0].slice(0, 239), ...ls.slice(1)]), (e) => e.campo === "TAMANHO DO REGISTRO" && e.linha === 1, "linha de 239");
  temErro(juntar([ls[0] + " ", ...ls.slice(1)]), (e) => e.campo === "TAMANHO DO REGISTRO", "linha de 241");
  temErro(mutar(rem, 3, 44, "É"), (e) => e.campo === "CARACTERE" && e.ini === 44, "acento");
  temErro(mutar(rem, 3, 44, "\t"), (e) => e.campo === "CARACTERE", "tabulação");
  const lf = validarSispag(ls.join("\n") + "\n");
  assert.ok(lf.avisos.some((a) => a.campo === "FIM DE LINHA"));
  assert.ok(validarSispag(Buffer.from(rem, "latin1")).erros.length === 0, "aceita Buffer");
});

test("picture, conteúdo fixo e domínio", () => {
  const rem = gerar("02-ted-outro-banco.rem");
  temErro(mutar(rem, 3, 125, "A"), (e) => e.campo === "VALOR DO PAGTO" && /picture 9/.test(e.esperado), "letra em campo 9");
  temErro(mutar(rem, 1, 15, "081"), (e) => e.campo === "LAYOUT DE ARQUIVO" && e.ocorrencia === "HM", "versão do layout");
  temErro(mutar(rem, 2, 14, "030"), (e) => e.campo === "LAYOUT DO LOTE", "layout do lote");
  temErro(mutar(rem, 2, 12, "99"), (e) => e.campo === "FORMA DE PAGAMENTO", "forma fora da nota 5");
  temErro(mutar(rem, 3, 15, "123"), (e) => e.campo === "TIPO DE MOVIMENTO" && e.ocorrencia === "AJ", "movimento");
  temErro(mutar(rem, 3, 230, "7"), (e) => e.campo === "AVISO AO FAVORECIDO", "aviso");
  temErro(mutar(rem, 3, 94, "31022026"), (e) => e.campo === "DATA DE PAGTO" && e.ocorrencia === "AP", "data inexistente");
  temErro(mutar(rem, 3, 135, "123"), (e) => e.campo === "NOSSO NÚMERO", "nosso número na inclusão");
  temErro(mutar(rem, 3, 21, "341"), (e) => e.campo === "BANCO FAVORECIDO" && e.ocorrencia === "AL", "TED para o Itaú");
});

test("sequência, numeração de lote e de registro", () => {
  const rem = gerar("06-misto-ted-credito-boletos.rem");
  temErro(mutar(rem, 3, 4, "0002"), (e) => e.campo === "CÓDIGO DO LOTE" && e.ocorrencia === "AG", "lote do detalhe");
  temErro(mutar(rem, 6, 4, "0003"), (e) => e.campo === "CÓDIGO DO LOTE" && /0001/.test(e.esperado) === false, "lote fora de ordem");
  temErro(mutar(rem, 3, 9, "00002"), (e) => e.campo === "NÚMERO DO REGISTRO" && e.ocorrencia === "AH", "nº do registro");
  temErro(mutar(rem, 4, 9, "00002"), (e) => e.campo === "NÚMERO DO REGISTRO", "B com número diferente do A");
  const ls = linhas(rem);
  temErro(juntar(ls.slice(0, -1)), (e) => e.campo === "TRAILER DE ARQUIVO", "sem trailer de arquivo");
  temErro(juntar(ls.filter((_, i) => i !== 4)), (e) => e.campo === "TRAILER DE LOTE" || /trailer do lote/.test(e.esperado), "sem trailer de lote");
  temErro(juntar([ls[0], ls[2], ...ls.slice(1)]), (e) => /depois do header de lote|dentro de um lote/.test(e.esperado), "detalhe fora do lote");
});

test("contadores e somatórios dos trailers (nota 17)", () => {
  const rem = gerar("06-misto-ted-credito-boletos.rem");
  const ls = linhas(rem);
  const tl = ls.findIndex((l) => l[7] === "5") + 1;
  temErro(mutar(rem, tl, 23, "9"), (e) => e.campo === "TOTAL QTDE REGISTROS" && e.ocorrencia === "TA", "qtde do lote");
  temErro(mutar(rem, tl, 41, "3"), (e) => e.campo === "TOTAL VALOR PAGTOS" && e.ocorrencia === "TA", "valor do lote");
  temErro(mutar(rem, ls.length, 23, "5"), (e) => e.campo === "TOTAL QTDE DE LOTES", "qtde de lotes");
  temErro(mutar(rem, ls.length, 29, "9"), (e) => e.campo === "TOTAL QTDE REGISTROS" && e.registro === "Trailer de arquivo", "qtde de registros");
  // mexer no valor de um pagamento sem acertar o trailer
  temErro(mutar(rem, 3, 134, "9"), (e) => e.campo === "TOTAL VALOR PAGTOS", "valor do A sem trailer");
});

test("boletos: DV do código de barras, forma × banco e J-52 obrigatório", () => {
  const rem = gerar("04-boleto-outro-banco.rem");
  const dv = linhas(rem)[2][21];
  temErro(mutar(rem, 3, 22, dv === "1" ? "2" : "1"), (e) => e.campo === "CÓD. BARRAS – DV" && e.ocorrencia === "IP", "DV");
  temErro(mutar(rem, 3, 50, "1"), (e) => e.ocorrencia === "IP", "campo livre alterado quebra o DV");
  temErro(mutar(rem, 2, 12, "30"), (e) => e.ocorrencia === "IM", "forma 30 com boleto 033");
  temErro(mutar(rem, 3, 18, "846"), (e) => /concessionária/.test(e.esperado), "concessionária em segmento J");
  const ls = linhas(rem);
  temErro(juntar(ls.filter((_, i) => i !== 3)), (e) => e.campo === "SEGMENTO J-52" && e.ocorrencia === "BI", "sem J-52");
  temErro(mutar(rem, 4, 77, "000000000000001"), (e) => e.campo === "CEDENTE (beneficiário)" && e.ocorrencia === "BI", "CNPJ do cedente");
  temErro(mutar(rem, 4, 76, "1"), (e) => e.campo === "CEDENTE (beneficiário)", "tipo 1 com CNPJ");
});

test("Pix: arquivo separado, câmara 009, segmento B e chave", () => {
  const pix = gerar("05-pix-chave.rem");
  temErro(mutar(pix, 3, 18, "000"), (e) => e.campo === "CÂMARA CENTRALIZADORA", "câmara");
  temErro(mutar(pix, 3, 113, "  "), (e) => e.campo === "IDENTIFICAÇÃO TRANSFERÊNCIA", "113-114");
  temErro(mutar(pix, 4, 15, "01"), (e) => e.campo === "CHAVE PIX", "tipo 01 com e-mail");
  const ls = linhas(pix);
  temErro(juntar(ls.filter((_, i) => i !== 3)), (e) => /chave Pix/.test(e.esperado), "sem segmento B");
  const mista = gerar("06-misto-ted-credito-boletos.rem");
  temErro(mutar(mista, 2, 12, "45"), (e) => /separado/.test(e.regra), "Pix junto com outras formas");
});

test("CPF/CNPJ do favorecido e da empresa (nota 1 e 15)", () => {
  const rem = gerar("02-ted-outro-banco.rem");
  temErro(mutar(rem, 1, 32, "0"), (e) => e.campo === "EMPRESA – INSCRIÇÃO", "CNPJ da empresa");
  temErro(mutar(mutar(rem, 3, 217, "0"), 4, 32, "0"), (e) => e.campo === "Nº DE INSCRIÇÃO DO FAVORECIDO" && e.ocorrencia === "BI", "CNPJ do favorecido");
});

/** Layout que o manual dá para cada linha da remessa mista (para a varredura abaixo). */
function layoutDa(l: string): Layout | null {
  const tipo = l[7];
  if (tipo === "0") return HEADER_ARQUIVO;
  if (tipo === "1") return l.slice(13, 16) === "030" ? HEADER_LOTE_030 : HEADER_LOTE_040;
  if (tipo === "5") return TRAILER_LOTE;
  if (tipo === "9") return TRAILER_ARQUIVO;
  if (l[13] === "A") return SEGMENTO_A;
  if (l[13] === "B") return l.slice(14, 16).trim() ? SEGMENTO_B_PIX : SEGMENTO_B;
  if (l[13] === "J") return l.slice(17, 19) === "52" ? SEGMENTO_J52 : SEGMENTO_J;
  return null;
}

test("varredura: qualquer byte trocado em campo fixo, de domínio ou numérico de controle é acusado", () => {
  for (const arquivo of ["06-misto-ted-credito-boletos.rem", "05-pix-chave.rem"]) {
    const rem = gerar(arquivo);
    const ls = linhas(rem);
    let mutacoes = 0;
    ls.forEach((l, i) => {
      const L = layoutDa(l)!;
      for (const c of L.campos) {
        const controle = c.fixo !== undefined || c.dominio || /CÓD. BARRAS|TOTAL|VALOR DO PAGTO|VALOR PAGAMENTO|NÚMERO DO REGISTRO|CÓDIGO DO LOTE/.test(c.nome);
        if (!controle) continue;
        for (let p = c.ini; p <= c.fim; p++) {
          const atual = l[p - 1];
          const troca = c.pic === "9" ? (atual === "9" ? "8" : String((Number(atual) + 1) % 10)) : atual === " " ? "Q" : " ";
          const novo = /\d/.test(atual) || c.pic === "X" ? troca : "1";
          // trocar por outro valor do mesmo domínio é legítimo (ex.: tipo 20 → 30 salários)
          if (c.dominio?.includes(poe(l, p, novo).slice(c.ini - 1, c.fim))) continue;
          // o módulo 11 do Anexo A tem colisões (0, 1, 10 e 11 viram DV 1): o banco também não as detecta
          const mutada = poe(l, p, novo);
          if (/CÓD. BARRAS/.test(c.nome) && p !== 22 && String(dvCodigoBarras(mutada.slice(17, 61))) === mutada[21]) continue;
          const r = validarSispag(mutar(rem, i + 1, p, novo));
          assert.ok(r.erros.length > 0 || r.avisos.length > 0, `${arquivo} linha ${i + 1} pos ${p} (${L.nome} / ${c.nome}) trocada sem ser acusada`);
          mutacoes++;
        }
      }
    });
    assert.ok(mutacoes > 500, `poucas mutações (${mutacoes})`);
  }
});
