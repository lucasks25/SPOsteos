/**
 * Dados FICTÍCIOS para os arquivos de homologação SISPAG (scripts/gerar-arquivos-homologacao.ts e
 * tests/financeiro/cnab-validador.test.ts). Nada aqui é dado real: CNPJs 99.999.999/xxxx-xx com DV válido,
 * favorecidos "FORNECEDOR TESTE n", valores de centavos, boletos montados com DV correto mas inexistentes.
 * A empresa debitada pode ser trocada pela conta real do titular (variáveis HOMOLOG_* no script).
 */
import type { Empresa, Favorecido, Pagamento } from "./sispag";
import { dvCodigoBarras } from "./cnab-validador-regras";

export const EMPRESA_FICTICIA: Empresa = { cnpj: "99999999000191", nome: "EMPRESA TESTE HOMOLOGACAO", agencia: "0001", conta: "12345", dac: "6" };

export const FORNECEDORES_TESTE = {
  itau: { nome: "FORNECEDOR TESTE 1", documento: "99999999000272", banco: "341", agencia: "0002", conta: "54321", digito: "0" },
  ted: { nome: "FORNECEDOR TESTE 2", documento: "99999999000353", banco: "033", agencia: "1234", conta: "1234567", digito: "8" },
  pixEmail: { nome: "FORNECEDOR TESTE 3", documento: "99999999000434", chavePix: "fornecedor.teste3@exemplo.com.br" },
  pixCnpj: { nome: "FORNECEDOR TESTE 4", documento: "99999999000515", chavePix: "99999999000515" },
  pixCpf: { nome: "FORNECEDOR TESTE 5 PESSOA FISICA", documento: "52998224725", chavePix: "+5511999990001" },
  pixAleatoria: { nome: "FORNECEDOR TESTE 6", documento: "99999999000191", chavePix: "123e4567-e89b-12d3-a456-426614174000" },
  boletoItau: { nome: "FORNECEDOR TESTE 7 BOLETO ITAU", documento: "99999999000272" },
  boletoOutro: { nome: "FORNECEDOR TESTE 8 BOLETO OUTRO BANCO", documento: "99999999000353" },
} satisfies Record<string, Favorecido>;

const DIA = 86_400_000;

/** Fator de vencimento FEBRABAN (reinicia em 1000 em 22/02/2025). */
export function fatorFicticio(venc: Date): number {
  const reinicio = Date.UTC(2025, 1, 22);
  const t = Date.UTC(venc.getUTCFullYear(), venc.getUTCMonth(), venc.getUTCDate());
  return t >= reinicio ? 1000 + Math.round((t - reinicio) / DIA) : Math.round((t - Date.UTC(1997, 9, 7)) / DIA);
}

/** Código de barras de 44 posições com DV geral correto (Anexo A); campo livre fictício. */
export function boletoFicticio(banco: string, venc: Date, valorCentavos: number, campoLivre = "9".repeat(25)): string {
  const semDv = banco + "9" + "0" + String(fatorFicticio(venc)).padStart(4, "0") + String(valorCentavos).padStart(10, "0") + campoLivre;
  return semDv.slice(0, 4) + dvCodigoBarras(semDv) + semDv.slice(5);
}

export type CenarioHomologacao = { arquivo: string; descricao: string; pagamentos: Pagamento[] };

/** Um cenário por forma de pagamento (Pix sempre em arquivo próprio, item 2.2 do manual). */
export function cenariosHomologacao(dataPagamento: Date): CenarioHomologacao[] {
  const F = FORNECEDORES_TESTE;
  const p = (seu: string, valor: number) => ({ seuNumero: `HOMOLOG-${seu}`, data: dataPagamento, valor });
  const venc = dataPagamento;
  const boleto = (banco: string, centavos: number, fav: Favorecido, seu: string, forma: "30" | "31"): Pagamento => ({
    forma, ...p(seu, centavos / 100), codigoBarras: boletoFicticio(banco, venc, centavos), vencimento: venc, valorTitulo: centavos / 100, favorecido: fav,
  });
  return [
    { arquivo: "01-credito-conta-itau.rem", descricao: "Forma 01 — crédito em conta corrente no Itaú (segmentos A + B)", pagamentos: [{ forma: "01", ...p("01", 0.01), favorecido: F.itau }] },
    { arquivo: "02-ted-outro-banco.rem", descricao: "Forma 41 — TED outro titular, banco 033 (segmentos A + B), finalidade 00005", pagamentos: [{ forma: "41", ...p("02", 0.02), favorecido: F.ted }] },
    { arquivo: "03-boleto-itau.rem", descricao: "Forma 30 — boleto do Itaú (segmentos J + J-52)", pagamentos: [boleto("341", 3, F.boletoItau, "03", "30")] },
    { arquivo: "04-boleto-outro-banco.rem", descricao: "Forma 31 — boleto de outro banco, 033 (segmentos J + J-52)", pagamentos: [boleto("033", 4, F.boletoOutro, "04", "31")] },
    {
      arquivo: "05-pix-chave.rem",
      descricao: "Forma 45 — Pix por chave (segmentos A + B Pix): e-mail, CNPJ, telefone e aleatória, em arquivo separado",
      pagamentos: [
        { forma: "45", ...p("05A", 0.05), favorecido: F.pixEmail },
        { forma: "45", ...p("05B", 0.06), favorecido: F.pixCnpj },
        { forma: "45", ...p("05C", 0.07), favorecido: F.pixCpf },
        { forma: "45", ...p("05D", 0.08), favorecido: F.pixAleatoria },
      ],
    },
    {
      arquivo: "06-misto-ted-credito-boletos.rem",
      descricao: "Arquivo com 4 lotes (01, 41, 30, 31): como o sistema gera a remessa TED/boleto do dia",
      pagamentos: [
        { forma: "41", ...p("06A", 0.11), favorecido: F.ted },
        { forma: "01", ...p("06B", 0.12), favorecido: F.itau },
        boleto("341", 13, F.boletoItau, "06C", "30"),
        boleto("033", 14, F.boletoOutro, "06D", "31"),
      ],
    },
  ];
}

const poe = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);

/**
 * Simula o retorno que o Itaú devolveria para uma remessa (nota 8 / nota 12): header com código 2,
 * nosso número, data e valor efetivos e ocorrência por pagamento (padrão "00" = efetuado).
 * `ocorrencias` mapeia o seu número → código(s) (ex.: { "HOMOLOG-02": "BD" }).
 */
export function simularRetornoSispag(remessa: string, ocorrencias: Record<string, string> = {}): string {
  let nosso = 0;
  const linhas = remessa.split("\r\n").filter(Boolean).map((l, i) => {
    if (i === 0) return poe(l, 143, "2");
    if (l[7] !== "3") return l;
    const seg = l[13];
    if (seg === "A") {
      const cod = (ocorrencias[l.slice(73, 93).trim()] ?? "00").padEnd(10, " ");
      let r = poe(l, 135, `NN${String(++nosso).padStart(13, "0")}`);
      if (cod.startsWith("00")) r = poe(poe(r, 155, l.slice(93, 101)), 163, l.slice(119, 134));
      r = poe(r, 198, String(nosso).padStart(6, "0")); // nº do DOC/TED atribuído pelo banco (nota 14)
      return poe(r, 231, cod);
    }
    if (seg === "J" && l.slice(17, 19) !== "52") {
      const cod = (ocorrencias[l.slice(182, 202).trim()] ?? "00").padEnd(10, " ");
      return poe(poe(l, 216, `NN${String(++nosso).padStart(13, "0")}`), 231, cod);
    }
    return l;
  });
  return linhas.join("\r\n") + "\r\n";
}
