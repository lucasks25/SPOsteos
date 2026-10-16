/**
 * Política única de senha (criar usuário, redefinir pelo admin, trocar a própria). Sem "server-only": as telas usam
 * os limites nos campos. Segue o NIST SP 800-63B §5.1.1.2: tamanho mínimo, sem regras de composição forçada, mas
 * recusando senha comum, repetitiva/sequencial ou ligada ao próprio usuário ou à empresa.
 */
export const SENHA_MIN = 10;
/** O bcrypt só usa os primeiros 72 BYTES (não caracteres): "á" ocupa 2. O resto seria ignorado em silêncio. */
export const SENHA_MAX_BYTES = 72;
export const SENHA_MAX = SENHA_MAX_BYTES; // limite do campo (caracteres ASCII); o servidor confere os bytes

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Senhas de 10+ caracteres mais vistas em vazamentos (e variações locais). Comparadas sem acento e minúsculas. */
const COMUNS = new Set([
  "1234567890", "0123456789", "12345678910", "123456789a", "1234567890a", "0987654321", "1111111111", "123123123123",
  "qwertyuiop", "qwerty1234", "qwerty123456", "1q2w3e4r5t", "1q2w3e4r5t6y", "q1w2e3r4t5", "asdfghjkl1", "zaq12wsxcde",
  "abcdefghij", "abc1234567", "abcd123456", "a123456789", "password12", "password123", "password1234", "passw0rd123",
  "iloveyou12", "senha12345", "senha123456", "senhasenha", "minhasenha", "minhasenha1", "mudarsenha", "trocarsenha",
  "administrador", "admin12345", "admin123456", "administrator", "bemvindo123", "brasil2025", "brasil2026",
  "flamengo123", "corinthians", "palmeiras10", "saopaulo123", "deusefiel1", "jesuscristo", "estrela123",
]);

/** Palavras que, com só números e símbolos em volta, dão senha óbvia ("Senha@2026!", "Opme12345678"). */
const RAIZES = ["senha", "password", "passw0rd", "admin", "administrador", "opme", "sposteos", "osteos", "qwerty", "brasil", "mudar", "trocar", "teste", "usuario", "bemvindo", "welcome"];

const SEQUENCIAS = ["01234567890123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "1qaz2wsx3edc4rfv5tgb"];

export type ContextoSenha = { email?: string | null; nome?: string | null };

/** Mensagem do problema (para mostrar no campo), ou null se a senha serve. */
export function problemaSenha(senha: string, ctx: ContextoSenha = {}): string | null {
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (Buffer.byteLength(senha, "utf8") > SENHA_MAX_BYTES) return `A senha passou do limite de ${SENHA_MAX_BYTES} bytes (letras acentuadas contam 2). Use uma mais curta.`;
  const n = semAcento(senha);
  const soLetras = n.replace(/[^a-z]/g, "");
  if (COMUNS.has(n) || RAIZES.includes(soLetras)) return "Senha muito comum. Use uma frase ou combinação que não seja óbvia.";
  if (new Set(n).size < 4) return "Senha repetitiva demais. Use mais caracteres diferentes.";
  if (SEQUENCIAS.some((s) => s.includes(n) || [...s].reverse().join("").includes(n))) return "Senha sequencial (como 1234... ou qwerty...). Escolha outra.";
  const email = semAcento(ctx.email ?? "");
  const local = email.split("@")[0] ?? "";
  const partes = [local, ...local.split(/[._+-]/), ...semAcento(ctx.nome ?? "").split(/\s+/)].filter((p) => p.length >= 4);
  if (email && n.includes(email)) return "A senha não pode conter o seu e-mail.";
  if (partes.some((p) => n.includes(p))) return "A senha não pode conter o seu nome ou o seu e-mail.";
  return null;
}
