/**
 * Cifra em repouso de campos sensíveis (LGPD art. 46 e art. 48 §3: dado ininteligível para quem não tem a chave).
 * AES-256-GCM com IV aleatório de 12 bytes e o "contexto" (ex.: "Cirurgia.carteirinha") como dado autenticado:
 * um valor copiado para outra coluna não decifra. Chaves de cifra e de índice derivadas da DATA_KEY por HKDF-SHA256.
 *
 * Formato gravado: "enc:v<versao>:<iv>:<tag>:<cifrado>" (base64url). A versão permite rotação: a chave atual cifra,
 * as anteriores (DATA_KEY="v2:...,v1:...") só decifram; scripts/lgpd-cifrar.ts recifra o que estiver em versão antiga.
 * Valor sem o prefixo "enc:" é legado em claro e volta como está (a migração de dados cifra depois).
 *
 * Sem "server-only" porque os scripts (tsx) também usam; nunca importar em Client Component (usa node:crypto e a chave).
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { DICA_DATA_KEY, lerChavesDados, type ChaveDados } from "@/lib/cripto-config";

export class ErroCripto extends Error {}

/** Contextos (AAD) usados: o mesmo ao gravar, ler e no script de migração (scripts/lgpd-cifrar.ts). */
export const CTX_CARTEIRINHA = "Cirurgia.carteirinha";

const PREFIXO = "enc:";
type Derivadas = { versao: number; cifra: Buffer; indice: Buffer };
let cache: { fonte: string; chaves: Derivadas[] } | null = null;
let avisouSemChave = false;

const derivar = (c: ChaveDados, uso: string) => Buffer.from(hkdfSync("sha256", c.chave, Buffer.alloc(0), `opme:${uso}:v${c.versao}`, 32));

/** Chaves derivadas da DATA_KEY atual (relida a cada chamada; o cache só evita refazer o HKDF). null = sem chave. */
function chaves(): Derivadas[] | null {
  const fonte = (process.env.DATA_KEY ?? "").trim();
  if (!fonte) return null;
  if (cache?.fonte === fonte) return cache.chaves;
  let lidas: ChaveDados[];
  try {
    lidas = lerChavesDados(fonte);
  } catch (e) {
    throw new ErroCripto(`${(e as Error).message} ${DICA_DATA_KEY}`);
  }
  cache = { fonte, chaves: lidas.map((c) => ({ versao: c.versao, cifra: derivar(c, "cifra"), indice: derivar(c, "indice") })) };
  return cache.chaves;
}

/** Sem chave: em produção é erro (a subida já recusa, ver src/instrumentation.ts); fora dela grava em claro com aviso. */
function semChave(): null {
  if (process.env.NODE_ENV === "production") throw new ErroCripto(`DATA_KEY ausente: não é possível cifrar dado sensível. ${DICA_DATA_KEY}`);
  if (!avisouSemChave) {
    avisouSemChave = true;
    console.warn(`[segurança] DATA_KEY ausente: dados sensíveis gravados SEM cifra (só aceito fora de produção). ${DICA_DATA_KEY}`);
  }
  return null;
}

/** Versão da chave que cifra hoje (a primeira da DATA_KEY); null sem chave. */
export const versaoChaveAtual = (): number | null => chaves()?.[0].versao ?? null;

export const estaCifrado = (valor: string | null | undefined) => typeof valor === "string" && valor.startsWith(PREFIXO);

/** Cifra `texto`. Sem DATA_KEY fora de produção devolve o texto (legado em claro). */
export function cifrar(texto: string, contexto: string): string {
  const ks = chaves() ?? semChave();
  if (!ks) return texto;
  const k = ks[0];
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k.cifra, iv);
  c.setAAD(Buffer.from(contexto, "utf8"));
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `${PREFIXO}v${k.versao}:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${corpo.toString("base64url")}`;
}

/** Decifra. Valor sem prefixo (legado em claro) volta como está. Chave errada, versão desconhecida ou adulteração: ErroCripto. */
export function decifrar(valor: string, contexto: string): string {
  if (!estaCifrado(valor)) return valor;
  const m = /^enc:v(\d+):([\w-]+):([\w-]+):([\w-]*)$/.exec(valor);
  if (!m) throw new ErroCripto("Valor cifrado em formato inválido.");
  const ks = chaves();
  if (!ks) throw new ErroCripto(`DATA_KEY ausente: não é possível decifrar. ${DICA_DATA_KEY}`);
  const k = ks.find((x) => x.versao === Number(m[1]));
  if (!k) throw new ErroCripto(`Chave v${m[1]} não está na DATA_KEY (rotação incompleta?).`);
  try {
    const d = createDecipheriv("aes-256-gcm", k.cifra, Buffer.from(m[2], "base64url"));
    d.setAAD(Buffer.from(contexto, "utf8"));
    d.setAuthTag(Buffer.from(m[3], "base64url"));
    return Buffer.concat([d.update(Buffer.from(m[4], "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new ErroCripto("Não foi possível decifrar (chave errada ou dado adulterado).");
  }
}

/** Para exibir em tela: nunca derruba a página; falha vira um aviso e vai para o log. */
export function decifrarParaExibir(valor: string | null | undefined, contexto: string): string | null {
  if (valor == null) return null;
  try {
    return decifrar(valor, contexto);
  } catch (e) {
    console.error(`[cripto] ${contexto}: ${(e as Error).message}`);
    return "(dado cifrado ilegível: avise o administrador)";
  }
}

/** Cifrado com versão diferente da atual (precisa recifrar na rotação) ou ainda em claro. */
export function precisaRecifrar(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const ks = chaves();
  if (!ks) return false;
  if (!estaCifrado(valor)) return true;
  return !valor.startsWith(`${PREFIXO}v${ks[0].versao}:`);
}

/** Normalização do índice: sem acento, maiúsculas, só letras e dígitos ("123.456-7" = "1234567"; "José" = "JOSE"). */
export const normalizarParaIndice = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const hmac = (k: Derivadas, valor: string, contexto: string) =>
  `v${k.versao}:${createHmac("sha256", k.indice).update(`${contexto}\u0000${normalizarParaIndice(valor)}`).digest("hex")}`;

/** Índice cego (HMAC) com a chave atual, para busca por igualdade sem guardar o valor em claro. null = sem chave/vazio. */
export function indiceBusca(valor: string | null | undefined, contexto: string): string | null {
  if (!valor || !normalizarParaIndice(valor)) return null;
  const ks = chaves();
  return ks ? hmac(ks[0], valor, contexto) : null;
}

/** Índices com todas as chaves conhecidas (busca durante a rotação: `where: { campoHash: { in: indicesBusca(...) } }`). */
export function indicesBusca(valor: string, contexto: string): string[] {
  const ks = chaves();
  if (!ks || !normalizarParaIndice(valor)) return [];
  return ks.map((k) => hmac(k, valor, contexto));
}
