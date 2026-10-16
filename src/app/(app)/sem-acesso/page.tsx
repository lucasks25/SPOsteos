import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";

/** Destino do requireUser quando o perfil não tem acesso a uma tela (qualquer usuário logado pode ver esta página). */
export default async function SemAcessoPage() {
  await requireUser();
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center">
      <Icon name="cadeado" size={22} className="mx-auto text-amber-700" />
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Você não tem acesso a esta tela</h2>
      <p className="mt-1 text-sm text-slate-500">Seu perfil não inclui esta área. Se precisar dela, peça ao administrador.</p>
      <div className="mt-5 flex justify-center">
        <Link href="/" className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
