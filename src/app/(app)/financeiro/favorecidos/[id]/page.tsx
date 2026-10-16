import { notFound } from "next/navigation";
import { Field, Form, Grid } from "@/components/form";
import { Aviso, Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { aprovarDadosPagamentoAction, salvarDadosPagamento } from "../../_lib/favorecidos-actions";
import { hashDadosPagamento, situacaoAprovacao } from "../../_lib/favorecidos-aprovacao";

export default async function FavorecidoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  const f = await db.fornecedor.findUnique({
    where: { id },
    select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, ativo: true, bancoCodigo: true, agencia: true, conta: true, contaDigito: true, chavePix: true, pagamentoAprovadoHash: true, pagamentoAlteradoEm: true, pagamentoAlteradoPor: true, pagamentoAprovadoEm: true, pagamentoAprovadoPor: true },
  });
  if (!f) notFound();
  const situacao = situacaoAprovacao(f);
  const pessoas = await db.usuario.findMany({ where: { id: { in: [f.pagamentoAlteradoPor, f.pagamentoAprovadoPor].filter((x): x is string => !!x) } }, select: { id: true, nome: true } });
  const nome = (uid: string | null) => (uid ? (pessoas.find((p) => p.id === uid)?.nome ?? "usuário removido") : "migração/sistema");
  const fuiEu = f.pagamentoAlteradoPor === user.id;
  return (
    <>
      <PageHeader voltar={{ href: "/financeiro/favorecidos", label: "Favorecidos" }} title={f.nomeFantasia ?? f.razaoSocial} subtitle={`CNPJ ${f.cnpj} · dados de pagamento`} actions={!f.ativo ? <Badge>inativo</Badge> : undefined} />
      <div className="grid items-start gap-4 xl:grid-cols-3">
      <Card title="Dados para pagamento (SISPAG)" className="xl:col-span-2">
        <Form action={salvarDadosPagamento.bind(null, id)} redirectTo="/financeiro/favorecidos">
          <Grid cols={2}>
            <Field label="Banco (código)" name="bancoCodigo" defaultValue={f.bancoCodigo ?? ""} maxLength={3} placeholder="341" />
            <Field label="Agência" name="agencia" defaultValue={f.agencia ?? ""} maxLength={5} hint="Sem dígito" />
            <Field label="Conta" name="conta" defaultValue={f.conta ?? ""} maxLength={14} hint="Só o número; o dígito vai no campo ao lado (22222-3 também é aceito)" />
            <Field label="Dígito" name="contaDigito" defaultValue={f.contaDigito ?? ""} maxLength={2} />
            <Field label="Chave Pix" name="chavePix" defaultValue={f.chavePix ?? ""} maxLength={77} className="sm:col-span-2" hint="E-mail, +55DDDNÚMERO, CPF/CNPJ só números ou chave aleatória" />
          </Grid>
          <p className="text-xs text-slate-500">Confira com o fornecedor antes de alterar: trocar a conta muda para onde o dinheiro vai. A alteração fica na auditoria (valores mascarados). A razão social, o CNPJ e o contato se editam em Cadastros.</p>
        </Form>
      </Card>
      <Card title="Aprovação dos dados de pagamento">
        {situacao === "APROVADO" ? (
          <Aviso tom="ok">
            <Badge color="green">aprovado</Badge> {f.pagamentoAprovadoEm ? `em ${dateTime(f.pagamentoAprovadoEm)} por ${nome(f.pagamentoAprovadoPor)}` : ""}
          </Aviso>
        ) : (
          <Form action={aprovarDadosPagamentoAction.bind(null, id)} submitLabel={fuiEu ? null : "Aprovar dados de pagamento"} confirm="Conferiu banco, agência, conta e Pix com o fornecedor por um canal independente (telefone já conhecido, não o do e-mail que pediu a troca)?">
            <input type="hidden" name="hash" value={hashDadosPagamento(f)} />
            <Aviso tom="alerta">
              <Badge color="yellow">aguardando aprovação</Badge> Alterados {f.pagamentoAlteradoEm ? `em ${dateTime(f.pagamentoAlteradoEm)} por ${nome(f.pagamentoAlteradoPor)}` : "(CNPJ alterado em Cadastros ou dado novo)"}. O SISPAG não paga este favorecido até outra pessoa aprovar.
              {fuiEu ? " Você fez a alteração: peça a outra pessoa do financeiro ou ao administrador." : ""}
            </Aviso>
          </Form>
        )}
      </Card>
      </div>
    </>
  );
}
