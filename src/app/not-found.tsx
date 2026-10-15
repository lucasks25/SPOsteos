import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-teal-700">Erro 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">O endereço não existe ou o registro foi removido.</p>
        <Link href="/" className="mt-6 inline-flex h-9 items-center rounded-md bg-teal-700 px-3.5 text-sm font-medium text-white hover:bg-teal-800">
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
