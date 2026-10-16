/**
 * Validação e leitura da DATA_KEY (chave da cifra em repouso dos dados sensíveis, docs/LGPD.md §4). Sem "server-only"
 * para ser usada pelo src/instrumentation.ts (derruba a subida em produção sem chave válida), pelos scripts e pelos testes.
 *
 * Formato:  DATA_KEY=<64 hex>                      → versão 1
 *           DATA_KEY=v2:<64 hex>,v1:<64 hex>        → rotação: a PRIMEIRA cifra; todas decifram.
 * Gere com: openssl rand -hex 32
 */

export type ChaveDados = { versao: number; chave: Buffer };

export const DICA_DATA_KEY = 'Gere com: openssl rand -hex 32 (rotação: DATA_KEY="v2:<nova>,v1:<antiga>").';

/** Lê as chaves (a primeira é a atual). Lança Error com mensagem sem expor a chave. */
export function lerChavesDados(valor: string | undefined): ChaveDados[] {
  const v = (valor ?? "").trim();
  if (!v) throw new Error("DATA_KEY ausente.");
  const partes = v.split(",").map((p) => p.trim()).filter(Boolean);
  const chaves: ChaveDados[] = [];
  for (const p of partes) {
    const m = /^(?:v(\d{1,3}):)?([0-9a-fA-F]+)$/.exec(p);
    if (!m) throw new Error("DATA_KEY em formato inválido (esperado 64 hex ou v<n>:<64 hex>, separados por vírgula).");
    if (!m[1] && partes.length > 1) throw new Error("DATA_KEY com mais de uma chave: informe a versão de cada uma (v2:...,v1:...).");
    const versao = m[1] ? Number(m[1]) : 1;
    if (versao < 1) throw new Error("DATA_KEY: versão deve ser 1 ou maior.");
    if (m[2].length !== 64) throw new Error(`DATA_KEY v${versao}: a chave precisa ter 64 caracteres hexadecimais (32 bytes).`);
    if (new Set(m[2].toLowerCase()).size < 8) throw new Error(`DATA_KEY v${versao}: chave sem variedade (use um valor aleatório).`);
    if (chaves.some((c) => c.versao === versao)) throw new Error(`DATA_KEY: versão v${versao} repetida.`);
    chaves.push({ versao, chave: Buffer.from(m[2], "hex") });
  }
  return chaves;
}

/** Mensagem do problema da DATA_KEY, ou null se serve. */
export function problemaDataKey(valor: string | undefined): string | null {
  try {
    lerChavesDados(valor);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
