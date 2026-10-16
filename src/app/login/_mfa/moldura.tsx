import type { ReactNode } from "react";
import { Marca } from "@/components/marca";

/** Moldura das telas de entrada (login, 2º fator, primeiro acesso): fundo neutro com o isotipo em marca d'água. */
export function MolduraLogin({ titulo, largura = "max-w-sm", children }: { titulo: string; largura?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="absolute -bottom-24 -right-16 w-[34rem] max-w-[80vw] opacity-[0.08] saturate-50 sm:-right-24 lg:w-[44rem]" />
      </div>
      <main className={`relative w-full ${largura}`}>
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-6 flex justify-center">
            <Marca variante="login" />
          </div>
          <h1 className="mb-5 text-center text-lg font-semibold text-slate-900">{titulo}</h1>
          {children}
        </div>
        <p className="mt-5 text-center text-xs text-slate-500">Sistema de gestão da SP OSTEOS · acesso restrito a usuários autorizados.</p>
      </main>
    </div>
  );
}
