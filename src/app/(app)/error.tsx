"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const negado = /acesso negado/i.test(error.message);
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
      <p className="mb-4 text-sm font-bold text-slate-500">SP OSTEOS</p>
      <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${negado ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-600"}`}>
        <Icon name={negado ? "cadeado" : "alerta"} size={22} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{negado ? "Você não tem acesso a esta tela" : "Não foi possível carregar esta tela"}</h2>
      <p className="mt-1 text-sm text-slate-500">{negado ? "Seu perfil não inclui esta área. Se precisar dela, peça ao administrador." : error.message}</p>
      <div className="mt-5 flex justify-center gap-2">
        {!negado && (
          <button onClick={reset} className="inline-flex h-9 items-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
            Tentar novamente
          </button>
        )}
        <Link href="/" className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
