import { z } from "zod";
import type { Perfil } from "@/generated/prisma/client";
import { tipoChavePix } from "@/lib/documentos-br";

/** Dados bancários/Pix decidem para onde o SISPAG paga: só quem paga (e o admin) vê e altera. */
export const podeVerDadosPagamento = (p: Perfil) => p === "FINANCEIRO" || p === "ADMIN";

export const CAMPOS_PAGAMENTO = ["bancoCodigo", "agencia", "conta", "contaDigito", "chavePix"] as const;
export type CampoPagamento = (typeof CAMPOS_PAGAMENTO)[number];
export type DadosPagamento = Record<CampoPagamento, string | null>;

/** "…1234": mostra só o final de dado sensível na auditoria. */
export const mascarar = (v: string | null | undefined) => (v ? `…${v.slice(-4)}` : "vazio");

/** "22222-3" no campo conta, com o dígito vazio: separa o dígito automaticamente. */
export function separarDigitoConta(entrada: unknown): unknown {
  if (!entrada || typeof entrada !== "object") return entrada;
  const d = entrada as Record<string, unknown>;
  const m = typeof d.conta === "string" ? /^\s*(\d{1,12})\s*-\s*([0-9Xx]{1,2})\s*$/.exec(d.conta) : null;
  if (!m || d.contaDigito) return entrada;
  return { ...d, conta: m[1], contaDigito: m[2] };
}

/** Validação de formato (campos vazios viram null e limpam o valor). Conta bancária é tudo-ou-nada. */
export const schemaDadosPagamento = z.preprocess(
  separarDigitoConta,
  z
  .object({
    bancoCodigo: z.string().regex(/^\d{3}$/, "Código do banco com 3 dígitos (ex.: 341)").optional().transform((v) => v ?? null),
    agencia: z.string().regex(/^\d{1,5}$/, "Campo Agência: só números, sem dígito").optional().transform((v) => v ?? null),
    conta: z.string().regex(/^\d{1,12}$/, "Campo Conta: só números. O dígito vai no campo Dígito (ou digite 22222-3 e o sistema separa)").optional().transform((v) => v ?? null),
    contaDigito: z.string().regex(/^[0-9Xx]{1,2}$/, "Campo Dígito: use 1 ou 2 caracteres (número ou X)").optional().transform((v) => v?.toUpperCase() ?? null),
    chavePix: z
      .string()
      .max(77, "Chave Pix muito longa")
      .optional()
      .superRefine((v, ctx) => {
        if (!v) return;
        try {
          tipoChavePix(v);
        } catch (e) {
          ctx.addIssue({ code: "custom", message: (e as Error).message });
        }
      })
      .transform((v) => v?.trim() ?? null),
  })
  .superRefine((d, ctx) => {
    const banco = [d.bancoCodigo, d.agencia, d.conta, d.contaDigito];
    if (banco.some(Boolean) && !banco.every(Boolean)) {
      const msg = "Informe banco, agência, conta e dígito juntos (ou deixe os quatro vazios).";
      for (const k of ["bancoCodigo", "agencia", "conta", "contaDigito"] as const) if (!d[k]) ctx.addIssue({ code: "custom", path: [k], message: msg });
    }
  }),
);

export type SituacaoPagamento = "COMPLETO" | "SO_CONTA" | "SO_PIX" | "SEM_DADOS";

/** Conta = banco+agência+conta+dígito (TED/crédito); Pix = chave. Sem nenhum dos dois, o SISPAG bloqueia. */
export function situacaoPagamento(f: DadosPagamento): SituacaoPagamento {
  const conta = !!(f.bancoCodigo && f.agencia && f.conta && f.contaDigito);
  const pix = !!f.chavePix;
  if (conta && pix) return "COMPLETO";
  if (conta) return "SO_CONTA";
  if (pix) return "SO_PIX";
  return "SEM_DADOS";
}

/** Texto de auditoria: só o que mudou, antes → depois mascarados. "" se nada mudou. */
export function descreverMudancas(antes: DadosPagamento, depois: DadosPagamento): string {
  const mudou = CAMPOS_PAGAMENTO.filter((k) => (antes[k] ?? null) !== (depois[k] ?? null));
  return mudou.map((k) => `${k} ${mascarar(antes[k])} → ${mascarar(depois[k])}`).join("; ");
}
