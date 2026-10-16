import "server-only";
import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/**
 * Idempotência de formulário (REVISAO §22). A página gera um token na renderização (`<TokenFormulario />`, campo oculto);
 * a action grava o token em `FormularioEnviado` NA MESMA TRANSAÇÃO da mutação. O segundo envio do mesmo formulário
 * (outra aba com a mesma página, voltar e reenviar, repetição depois de erro de rede) encontra o token e é recusado.
 * Se a mutação falha, a transação desfaz a gravação do token e o usuário pode corrigir e reenviar.
 *
 * Limite: duas abas abertas separadamente renderizam tokens diferentes; nesse caso valem as travas de estado de cada
 * serviço (ex.: o recebimento recusa quantidade acima do pendente).
 */
export const CAMPO_TOKEN = "_formToken";
export const MSG_JA_ENVIADO = "Este formulário já foi enviado; recarregue a página.";
const IDADE_MAXIMA_DIAS = 7;
const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const novoTokenFormulario = () => randomUUID();

/**
 * Registra o envio do formulário dentro da transação `tx`. Recusa token ausente/inválido e token já usado.
 * Dois envios simultâneos: o segundo INSERT espera o primeiro (índice único) e, se ele confirmar, não insere nada.
 */
export async function registrarEnvioTx(tx: Tx, token: FormDataEntryValue | null, usuarioId: string | null): Promise<void> {
  if (typeof token !== "string" || !FORMATO.test(token)) throw new ErroNegocio("Formulário desatualizado ou incompleto; recarregue a página.");
  await tx.$executeRaw`DELETE FROM "FormularioEnviado" WHERE "criadoEm" < now() - make_interval(days => ${IDADE_MAXIMA_DIAS})`;
  const n = await tx.$executeRaw`INSERT INTO "FormularioEnviado" ("token", "usuarioId", "criadoEm") VALUES (${token.toLowerCase()}, ${usuarioId}, now()) ON CONFLICT ("token") DO NOTHING`;
  if (n !== 1) throw new ErroNegocio(MSG_JA_ENVIADO);
}
