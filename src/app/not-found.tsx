import Link from "next/link";
import { Marca } from "@/components/marca";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <Marca variante="topo" />
        </div>
        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded bg-teal-700 text-white" aria-hidden="true">
          <Icon name="busca" size={18} />
        </span>
        <p className="mt-3 text-xs font-semibold text-slate-600">Erro 404</p>
        <h1 className="mt-1 text-lg font-bold text-slate-900">Página não encontrada</h1>
        <p className="mt-1 text-[13px] text-slate-600">O endereço não existe ou o registro foi removido.</p>
        <Link href="/" className="mt-5 inline-flex h-8 items-center rounded bg-teal-700 px-3 text-[13px] font-semibold text-white hover:bg-teal-800">
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
