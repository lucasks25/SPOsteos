"use client";

import { useActionState } from "react";
import Link from "next/link";
import { btn, campo } from "@/components/ui";

type Estado = { ok?: boolean; error?: string; codigos?: string[] } | undefined;

/**
 * Formulário de um código (6 dígitos do aplicativo) cuja action devolve códigos de recuperação. Os códigos só existem
 * nesta resposta (o banco guarda o resumo): a tela pede para guardá-los antes de seguir.
 */
export function FormCodigoComRecuperacao({
  action,
  rotulo,
  botao,
  continuarHref,
}: {
  action: (s: Estado, fd: FormData) => Promise<Estado>;
  rotulo: string;
  botao: string;
  continuarHref: string;
}) {
  const [estado, enviar, pendente] = useActionState(action, undefined);
  if (estado?.codigos) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-800">
          Guarde estes <strong>códigos de recuperação</strong> em lugar seguro (impressos ou no gerenciador de senhas). Cada um vale <strong>uma vez</strong>, para entrar se você perder o celular. Eles não serão mostrados de novo.
        </p>
        <ol className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900">
          {estado.codigos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <Link href={continuarHref} className={btn.primary}>
          Já guardei, continuar
        </Link>
      </div>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      {estado?.error && (
        <p role="alert" className="text-sm font-medium text-rose-700">
          {estado.error}
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-[0.8125rem] font-medium text-slate-700">{rotulo}</span>
        <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={campo} />
      </label>
      <button type="submit" disabled={pendente} className={btn.primary}>
        {pendente ? "Conferindo..." : botao}
      </button>
    </form>
  );
}
