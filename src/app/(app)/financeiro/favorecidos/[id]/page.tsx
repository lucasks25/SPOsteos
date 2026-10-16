import { notFound } from "next/navigation";
import { Field, Form, Grid } from "@/components/form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { salvarDadosPagamento } from "../../_lib/favorecidos-actions";

export default async function FavorecidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  const f = await db.fornecedor.findUnique({
    where: { id },
    select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, ativo: true, bancoCodigo: true, agencia: true, conta: true, contaDigito: true, chavePix: true },
  });
  if (!f) notFound();
  return (
    <>
      <PageHeader title={f.nomeFantasia ?? f.razaoSocial} subtitle={`CNPJ ${f.cnpj} · dados de pagamento`} actions={!f.ativo ? <Badge>inativo</Badge> : undefined} />
      <Card title="Dados para pagamento (SISPAG)">
        <Form action={salvarDadosPagamento.bind(null, id)} redirectTo="/financeiro/favorecidos">
          <Grid cols={4}>
            <Field label="Banco (código)" name="bancoCodigo" defaultValue={f.bancoCodigo ?? ""} maxLength={3} placeholder="341" />
            <Field label="Agência" name="agencia" defaultValue={f.agencia ?? ""} maxLength={5} hint="Sem dígito" />
            <Field label="Conta" name="conta" defaultValue={f.conta ?? ""} maxLength={12} hint="Sem dígito" />
            <Field label="Dígito" name="contaDigito" defaultValue={f.contaDigito ?? ""} maxLength={2} />
            <Field label="Chave Pix" name="chavePix" defaultValue={f.chavePix ?? ""} maxLength={77} className="sm:col-span-2" hint="E-mail, +55DDDNÚMERO, CPF/CNPJ só números ou chave aleatória" />
          </Grid>
          <p className="text-xs text-slate-500">Confira com o fornecedor antes de alterar: trocar a conta muda para onde o dinheiro vai. A alteração fica na auditoria (valores mascarados). A razão social, o CNPJ e o contato se editam em Cadastros.</p>
        </Form>
      </Card>
    </>
  );
}
