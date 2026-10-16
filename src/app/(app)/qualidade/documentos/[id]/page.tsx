import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date, dateTime } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { ActionButton, Field, Form } from "@/components/form";
import { Badge, Card, Dl, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { MAX_BYTES } from "@/lib/upload-seguro";
import { PERFIS_VER_DOCUMENTOS, podeEditarDocumentos, ROTULO_ESCOPO, ROTULO_TIPO } from "../../_lib/documentos";
import { SituacaoBadge } from "../../_lib/situacao-badge";
import { alternarAtivoDocumentoAction, enviarArquivoDocumentoAction } from "../actions";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(PERFIS_VER_DOCUMENTOS);
  const { id } = await params;
  const d = await db.documento.findUnique({
    where: { id },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      fabricante: { select: { id: true, nome: true } },
      produto: { select: { id: true, codigo: true, descricao: true } },
      arquivos: { orderBy: { criadoEm: "desc" } },
      substituidoPor: { select: { id: true, titulo: true, numero: true, validade: true } },
    },
  });
  if (!d) notFound();
  // histórico da cadeia de renovações: quem este substituiu, e assim por diante para trás
  const anteriores = [];
  let atual: string = d.id;
  for (let i = 0; i < 25; i++) {
    const ant = await db.documento.findUnique({ where: { substituidoPorId: atual }, select: { id: true, titulo: true, numero: true, validade: true, substituidoEm: true, _count: { select: { arquivos: true } } } });
    if (!ant) break;
    anteriores.push(ant);
    atual = ant.id;
  }

  const hoje = hojeUTC();
  const pode = podeEditarDocumentos(user.perfil);
  const vinculo = d.fornecedor
    ? <Link href={`/cadastros/fornecedores/${d.fornecedor.id}`} className="text-teal-700 hover:underline">{d.fornecedor.nomeFantasia ?? d.fornecedor.razaoSocial}</Link>
    : d.fabricante
      ? <Link href={`/cadastros/fabricantes/${d.fabricante.id}`} className="text-teal-700 hover:underline">{d.fabricante.nome}</Link>
      : d.produto
        ? <Link href={`/cadastros/produtos/${d.produto.id}`} className="text-teal-700 hover:underline">{d.produto.codigo} · {d.produto.descricao}</Link>
        : "Empresa";
  const vigenteNoCadastro = d.ativo && !d.substituidoPorId;

  return (
    <>
      <PageHeader
        title={d.titulo}
        subtitle={`${ROTULO_TIPO[d.tipo]} · ${ROTULO_ESCOPO[d.escopo]}`}
        actions={
          <>
            {d.substituidoPorId ? <Badge>substituído</Badge> : !d.ativo ? <Badge>inativo</Badge> : <SituacaoBadge validade={d.validade} hoje={hoje} />}
            {pode && vigenteNoCadastro && <LinkButton href={`/qualidade/documentos/novo?renovar=${d.id}`} icon="mais">Renovar</LinkButton>}
            {pode && <LinkButton href={`/qualidade/documentos/${d.id}/editar`} variant="secondary">Editar</LinkButton>}
            {pode && !d.substituidoPorId && (
              <ActionButton action={alternarAtivoDocumentoAction.bind(null, d.id, !d.ativo)} confirm={d.ativo ? "Inativar este documento? Ele deixa de gerar alertas, mas o histórico fica guardado." : undefined}>
                {d.ativo ? "Inativar" : "Reativar"}
              </ActionButton>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <Card title="Dados" icon="escudo">
          <Dl items={[
            ["Vale para", vinculo],
            ["Número", d.numero],
            ["Órgão emissor", d.orgaoEmissor],
            ["Emissão", date(d.emissao)],
            ["Validade", d.validade ? date(d.validade) : "Sem vencimento"],
            ["Cadastrado em", dateTime(d.criadoEm)],
            ["Observação", d.observacao],
          ]} />
          {d.substituidoPor && (
            <p className="mt-3 text-[13px] text-slate-700">
              Substituído em {date(d.substituidoEm)} por <Link href={`/qualidade/documentos/${d.substituidoPor.id}`} className="text-teal-700 hover:underline">{d.substituidoPor.titulo}{d.substituidoPor.numero ? ` (nº ${d.substituidoPor.numero})` : ""}</Link>.
            </p>
          )}
        </Card>

        <Card title="Arquivos" icon="documento" actions={<span className="text-xs text-slate-600">PDF, JPG ou PNG até {MAX_BYTES / 1024 / 1024} MB. O mais recente é o vigente.</span>}>
          {d.arquivos.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhum arquivo enviado.</p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm">
              {d.arquivos.map((a, i) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <a href={`/qualidade/documentos/${d.id}/arquivos/${a.id}`} target="_blank" rel="noopener noreferrer" className="truncate text-teal-700 hover:underline">{a.nome}</a>
                    <Badge color={i === 0 ? "green" : "gray"}>{i === 0 ? "vigente" : `versão ${d.arquivos.length - i}`}</Badge>
                  </span>
                  <span className="text-xs text-slate-600">{kb(a.tamanho)} · {dateTime(a.criadoEm)} · sha256 {a.hash.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
          {pode && d.ativo && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <Form action={enviarArquivoDocumentoAction.bind(null, d.id)} submitLabel="Enviar nova versão" resetOnSuccess>
                <Field label="Arquivo" name="arquivo" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
              </Form>
            </div>
          )}
        </Card>

        <Card title="Histórico de versões" icon="lista">
          {anteriores.length === 0 && !d.substituidoPor ? (
            <p className="text-sm text-slate-600">Este documento ainda não foi renovado.</p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm">
              {d.substituidoPor && (
                <li className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <Link href={`/qualidade/documentos/${d.substituidoPor.id}`} className="text-teal-700 hover:underline">Renovação: {d.substituidoPor.titulo}{d.substituidoPor.numero ? ` (nº ${d.substituidoPor.numero})` : ""}</Link>
                  <span className="text-xs text-slate-600">validade {d.substituidoPor.validade ? date(d.substituidoPor.validade) : "sem vencimento"}</span>
                </li>
              )}
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium">Este documento{d.numero ? ` (nº ${d.numero})` : ""}</span>
                <StatusBadge status={d.substituidoPorId ? "SUBSTITUIDO" : d.ativo ? "ATIVO" : "INATIVO"} />
              </li>
              {anteriores.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <Link href={`/qualidade/documentos/${a.id}`} className="text-teal-700 hover:underline">Anterior: {a.titulo}{a.numero ? ` (nº ${a.numero})` : ""}</Link>
                  <span className="text-xs text-slate-600">validade {a.validade ? date(a.validade) : "sem vencimento"} · substituído em {date(a.substituidoEm)} · {a._count.arquivos} arquivo(s)</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
