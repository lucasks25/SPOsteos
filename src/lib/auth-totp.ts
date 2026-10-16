import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Segundo fator por aplicativo autenticador (TOTP, RFC 6238 sobre HOTP, RFC 4226), sem dependência externa.
 * Parâmetros que todo app aceita (Google/Microsoft Authenticator, 1Password, Authy): SHA-1, 6 dígitos, passo de 30 s.
 * Funções puras (sem banco): o estado (segredo cifrado, último passo usado, códigos de recuperação) fica em
 * src/lib/auth-mfa.ts. Testes com os vetores do apêndice B da RFC 6238 em tests/seguranca/auth-totp.test.ts.
 */
export const PASSO_S = 30;
export const DIGITOS = 6;
/** Aceita o código do passo anterior e do seguinte (relógio do celular adiantado/atrasado até 30 s). */
export const JANELA = 1;
export const EMISSOR = "SP OSTEOS OPME";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let out = "";
  for (const b of buf) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const c of limpo) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("base32 inválido");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226 §5.3): HMAC-SHA1 do contador de 8 bytes, truncamento dinâmico. */
export function hotp(segredo: Buffer, contador: number, digitos = DIGITOS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = createHmac("sha1", segredo).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digitos).padStart(digitos, "0");
}

export const passoDe = (ms: number) => Math.floor(ms / 1000 / PASSO_S);

/**
 * Confere o código e devolve o passo que ele representa (para o chamador gravar e recusar o mesmo código de novo),
 * ou null. Comparação em tempo constante em cada passo da janela.
 */
export function conferirTotp(segredo: Buffer, codigo: string, agoraMs = Date.now()): number | null {
  const c = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const atual = passoDe(agoraMs);
  let achado: number | null = null;
  for (let d = -JANELA; d <= JANELA; d++) {
    const esperado = Buffer.from(hotp(segredo, atual + d));
    if (timingSafeEqual(esperado, Buffer.from(c)) && achado === null) achado = atual + d;
  }
  return achado;
}

/** Segredo novo de 160 bits (tamanho recomendado pela RFC 4226 §4 para HMAC-SHA1). */
export const novoSegredo = () => randomBytes(20);

/** Endereço otpauth:// que os aplicativos entendem (link no celular ou cópia manual). */
export function uriOtpauth(segredo: Buffer, conta: string): string {
  const rotulo = encodeURIComponent(`${EMISSOR}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${base32(segredo)}&issuer=${encodeURIComponent(EMISSOR)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_S}`;
}

/** Chave para digitar no aplicativo, em blocos de 4 letras. */
export const chaveLegivel = (segredo: Buffer) => base32(segredo).replace(/(.{4})/g, "$1 ").trim();

// ───────── cifra do segredo no banco e códigos de recuperação ─────────

/**
 * Chave do resumo dos códigos de recuperação: HKDF-SHA256 do AUTH_SECRET. Os códigos têm 50 bits; com sha256 puro,
 * quem copiasse só o banco os quebraria por força bruta, com HMAC precisa também da chave do servidor. Trocar o
 * AUTH_SECRET invalida os códigos (cada um gera novos em Minha conta → Segurança). A semente do TOTP é cifrada à
 * parte com a DATA_KEY (src/lib/cripto.ts), por src/lib/auth-mfa.ts.
 */
function chave(segredoApp: string, finalidade: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(segredoApp), Buffer.from("opme-mfa"), Buffer.from(finalidade), 32));
}

export const QTD_RECUPERACAO = 10;

/** Códigos de recuperação de uso único: 10 letras/dígitos base32 (50 bits) no formato XXXXX-XXXXX. */
export function novosCodigosRecuperacao(qtd = QTD_RECUPERACAO): string[] {
  return Array.from({ length: qtd }, () => base32(randomBytes(7)).slice(0, 10).replace(/^(.{5})/, "$1-"));
}

export const normalizarRecuperacao = (codigo: string) => codigo.toUpperCase().replace(/[^A-Z2-7]/g, "");

/** Resumo guardado no banco (HMAC com chave do servidor; o código em claro nunca é gravado). */
export function resumoRecuperacao(codigo: string, segredoApp: string): string {
  return createHmac("sha256", chave(segredoApp, "recuperacao-v1")).update(normalizarRecuperacao(codigo)).digest("hex");
}

/** Texto com cara de código de recuperação (para decidir se a entrada é TOTP ou recuperação). */
export const pareceRecuperacao = (codigo: string) => normalizarRecuperacao(codigo).length === 10;
