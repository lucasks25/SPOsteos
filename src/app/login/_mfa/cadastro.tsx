import { Form } from "@/components/form";
import { cadastroPendente } from "@/lib/auth-mfa";
import { confirmarMfa, gerarChaveMfa } from "../actions";
import { FormCodigoComRecuperacao } from "./codigos";

/** Cadastro do aplicativo autenticador (usado no primeiro acesso e em Minha conta → Segurança). */
export async function CadastroMfa({ userId, continuarHref }: { userId: string; continuarHref: string }) {
  const pendente = await cadastroPendente(userId);
  if (!pendente) {
    return (
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Instale no celular um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou o do seu gerenciador de senhas). Depois gere a chave
          e cadastre no aplicativo.
        </p>
        <Form action={gerarChaveMfa} submitLabel="Gerar chave" compacto>
          <span />
        </Form>
      </div>
    );
  }
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          No aplicativo, escolha <strong>adicionar conta</strong> → <strong>inserir chave de configuração</strong> (tipo: baseada em tempo) e digite:
          <span className="mt-1 block select-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-base tracking-wider text-slate-900">{pendente.chave}</span>
          <span className="mt-1 block text-xs text-slate-500">
            No próprio celular, você pode tocar em <a href={pendente.uri} className="font-medium text-teal-700 underline">abrir no aplicativo</a>. Não compartilhe esta chave.
          </span>
        </li>
        <li>Digite o código de 6 dígitos que o aplicativo mostra.</li>
      </ol>
      <FormCodigoComRecuperacao action={confirmarMfa} rotulo="Código do aplicativo" botao="Ativar" continuarHref={continuarHref} />
    </div>
  );
}
