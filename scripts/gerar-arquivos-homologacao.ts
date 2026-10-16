/**
 * Gera os arquivos de HOMOLOGAÇÃO do SISPAG (dados fictícios) em docs/homologacao/arquivos/ e passa
 * cada um pelo validador independente (src/app/(app)/financeiro/_lib/cnab-validador.ts). Não usa o banco.
 *
 *   npx tsx scripts/gerar-arquivos-homologacao.ts
 *
 * Para gerar com a conta real do titular no header (o resto continua fictício), defina:
 *   HOMOLOG_CNPJ=...  HOMOLOG_NOME="RAZAO SOCIAL"  HOMOLOG_AGENCIA=0000  HOMOLOG_CONTA=00000  HOMOLOG_DAC=0
 * e, opcionalmente, HOMOLOG_DATA=AAAA-MM-DD (data de pagamento; padrão: 10 dias úteis à frente).
 * Sai com código 1 se algum arquivo tiver erro.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gerarRemessaSispag, type Empresa } from "../src/app/(app)/financeiro/_lib/sispag";
import { relatorioValidacao, validarSispag } from "../src/app/(app)/financeiro/_lib/cnab-validador";
import { cenariosHomologacao, EMPRESA_FICTICIA, simularRetornoSispag } from "../src/app/(app)/financeiro/_lib/cnab-homologacao";

const DESTINO = resolve(__dirname, "..", "docs", "homologacao", "arquivos");

function dataPagamento(): Date {
  const env = process.env.HOMOLOG_DATA;
  if (env) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(env)) throw new Error("HOMOLOG_DATA deve ser AAAA-MM-DD.");
    return new Date(`${env}T00:00:00Z`);
  }
  const d = new Date();
  let uteis = 0;
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  while (uteis < 10) {
    t += 86_400_000;
    const dia = new Date(t).getUTCDay();
    if (dia !== 0 && dia !== 6) uteis++;
  }
  return new Date(t);
}

function empresa(): Empresa {
  const e = process.env;
  if (!e.HOMOLOG_CNPJ) return EMPRESA_FICTICIA;
  for (const k of ["HOMOLOG_NOME", "HOMOLOG_AGENCIA", "HOMOLOG_CONTA", "HOMOLOG_DAC"]) if (!e[k]) throw new Error(`Defina ${k} junto com HOMOLOG_CNPJ.`);
  return { cnpj: e.HOMOLOG_CNPJ.replace(/\D/g, ""), nome: e.HOMOLOG_NOME!, agencia: e.HOMOLOG_AGENCIA!, conta: e.HOMOLOG_CONTA!, dac: e.HOMOLOG_DAC! };
}

function main() {
  mkdirSync(DESTINO, { recursive: true });
  const emp = empresa();
  const data = dataPagamento();
  const agora = new Date();
  const relatorios: string[] = [];
  let comErro = 0;
  const gravar = (nome: string, conteudo: string) => {
    writeFileSync(join(DESTINO, nome), conteudo, { encoding: "latin1" });
    const r = validarSispag(Buffer.from(conteudo, "latin1"));
    if (r.erros.length) comErro++;
    relatorios.push(relatorioValidacao(r, nome));
    console.log(`${r.erros.length ? "ERRO " : "ok   "} ${nome} — ${r.erros.length} erro(s), ${r.avisos.length} aviso(s)`);
  };

  for (const c of cenariosHomologacao(data)) {
    const remessa = gerarRemessaSispag(emp, c.pagamentos, agora);
    gravar(c.arquivo, remessa);
    if (c.arquivo.startsWith("06-")) {
      // retorno simulado: crédito pago, TED agendada, boleto Itaú pago, boleto outro banco rejeitado (IP)
      gravar("90-retorno-simulado-do-06.ret", simularRetornoSispag(remessa, { "HOMOLOG-06A": "BD", "HOMOLOG-06D": "IP" }));
    }
  }
  const cab = `Gerado em ${agora.toISOString()} | data de pagamento ${data.toISOString().slice(0, 10)} | empresa ${emp === EMPRESA_FICTICIA ? "FICTÍCIA" : "informada por HOMOLOG_*"}\n\n`;
  writeFileSync(join(DESTINO, "validacao.txt"), cab + relatorios.join("\n"), "utf8");
  console.log(`\nArquivos em ${DESTINO} (relatório: validacao.txt)`);
  if (comErro) process.exit(1);
}

main();
