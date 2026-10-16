/** Utilidades dos scripts LGPD (scripts/lgpd-*.ts, scripts/derrubar-sessoes.ts): argumentos e auditoria do operador. */
import { userInfo } from "node:os";
import { db } from "@/lib/db";

/** `--nome=Maria` → { nome: "Maria" }; `--aplicar` → { aplicar: "1" }. */
export function argumentos(argv = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`Argumento não reconhecido: ${a}`);
    out[m[1]] = m[2] ?? "1";
  }
  return out;
}

/** Quem rodou o script: OPERADOR (nome/e-mail de quem atendeu) ou o usuário do sistema operacional. */
export const operador = () => (process.env.OPERADOR || (() => { try { return userInfo().username; } catch { return "?"; } })()).slice(0, 120);

/** Script não tem usuário logado: a auditoria vai sem usuarioId e com o operador no detalhe. */
export async function auditarScript(acao: string, entidade: string, entidadeId: string | null, detalhes: string) {
  await db.logAuditoria.create({ data: { usuarioId: null, acao, entidade, entidadeId, detalhes: `[script ${operador()}] ${detalhes}`.slice(0, 5000) } });
}
