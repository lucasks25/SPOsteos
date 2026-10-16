import type { ReactNode } from "react";
import type { Perfil } from "@/generated/prisma/client";

/** ADMIN sempre edita; os demais só se o perfil estiver na lista do setor dono do cadastro (ver acoes.ts). */
export const podeEditarCadastro = (perfil: Perfil, donos: Perfil[]) => perfil === "ADMIN" || donos.includes(perfil);

/** Mostra o formulário só para leitura (campos travados, sem botão de salvar) para quem não é do setor dono. */
export function SomenteLeitura({ edita, dono, children }: { edita: boolean; dono: string; children: ReactNode }) {
  if (edita) return <>{children}</>;
  return (
    <>
      <p className="mb-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">Somente consulta: este cadastro é mantido pelo setor {dono}.</p>
      <fieldset disabled className="[&_button[type=submit]]:hidden">
        {children}
      </fieldset>
    </>
  );
}
