import assert from "node:assert/strict";
import { test } from "node:test";
import { decodificarOfx, lerOfx, parseDataOfx, parseValorOfx } from "@/app/(app)/financeiro/_lib/ofx";

const V1 = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005120000[-3:BRT]
<TRNAMT>1500.50
<FITID>2026100501
<MEMO>PIX RECEBIDO HOSPITAL SAO LUCAS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261006
<TRNAMT>-89,90
<FITID>2026100602
<NAME>TARIFA   MANUTENCAO
</STMTTRN>
<STMTTRN>
<DTPOSTED>20261006
<TRNAMT>-10.00
<FITID>REPETIDO
<MEMO>A
</STMTTRN>
<STMTTRN>
<DTPOSTED>20261006
<TRNAMT>-10.00
<FITID>REPETIDO
<MEMO>B
</STMTTRN>
<STMTTRN>
<DTPOSTED>20261345
<TRNAMT>-1.00
<FITID>X
</STMTTRN>
<STMTTRN>
<DTPOSTED>20261007
<TRNAMT>0.00
<FITID>ZERO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("OFX v1 (SGML): valores, datas, descrição e FITID repetido", () => {
  const r = lerOfx(V1);
  assert.equal(r.linhas.length, 4);
  assert.equal(r.ignoradas, 2); // data inválida e valor zero
  assert.deepEqual(r.linhas.map((l) => l.valor), [1500.5, -89.9, -10, -10]);
  assert.equal(r.linhas[0].data.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(r.linhas[1].descricao, "TARIFA MANUTENCAO");
  assert.deepEqual(r.linhas.map((l) => l.fitid), ["2026100501", "2026100602", "REPETIDO", "REPETIDO#1"]);
});

test("OFX v2 (XML) e linha sem FITID", () => {
  const r = lerOfx(`<?xml version="1.0"?><OFX><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>200.00</TRNAMT><FITID>A1</FITID><MEMO>TED</MEMO></STMTTRN></OFX>`);
  assert.equal(r.linhas[0].valor, 200);
  assert.equal(lerOfx(`<STMTTRN><DTPOSTED>20261010<TRNAMT>-5.00<MEMO>X</STMTTRN>`).linhas[0].fitid, "2026-10-10|-5.00|X");
  assert.equal(lerOfx("lixo qualquer").linhas.length, 0);
});

test("decodificação UTF-8 com fallback windows-1252", () => {
  assert.equal(decodificarOfx(new Uint8Array([...Buffer.from("<MEMO>"), 0xe7, 0xe3, ...Buffer.from("o")])), "<MEMO>ção");
  assert.equal(decodificarOfx(Buffer.from("<MEMO>ção")), "<MEMO>ção");
});

test("datas e valores", () => {
  assert.equal(parseDataOfx("20260230"), null);
  assert.equal(parseValorOfx("1.234,56"), 1234.56);
  assert.equal(parseValorOfx("abc"), null);
});

test("OFX: entidades em NAME/MEMO e contas do arquivo (BANKACCTFROM)", () => {
  const um = `<OFX><STMTRS><BANKACCTFROM><BANKID>0341<BRANCHID>0123<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><DTPOSTED>20261005<TRNAMT>-5.00<FITID>A1<MEMO>JOHNSON &amp; JOHNSON &#199;</STMTTRN></BANKTRANLIST></STMTRS></OFX>`;
  const r = lerOfx(um);
  assert.equal(r.linhas[0].descricao, "JOHNSON & JOHNSON Ç");
  assert.deepEqual(r.contas, ["123456"]);
  const dois = um + um.replace("12345-6", "99999-1");
  assert.deepEqual(lerOfx(dois).contas, ["123456", "999991"]);
  assert.deepEqual(lerOfx("<STMTTRN><DTPOSTED>20261005<TRNAMT>1<FITID>X</STMTTRN>").contas, []);
});
