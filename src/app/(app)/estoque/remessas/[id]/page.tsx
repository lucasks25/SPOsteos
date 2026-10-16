import Link from "next/link";
import { auditLeitura } from "@/lib/forms";
import { CabecalhoImpresso } from "@/components/marca";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, Dl, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionButton, Field, Form } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { date, dateTime, diasAte } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../../_lib/perfis";
import { cancelarRemessaAction, conferirRemessaAction, enviarRemessaAction } from "../actions";
import { idInt } from "@/lib/ids";

export default async function RemessaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(PERFIS_VER);
  const id = idInt((await params).id);
  if (!id) notFound();
  const r = await db.remessa.findUnique({
    where: { id },
    include: {
      local: { include: { hospital: true } },
      kit: true,
      cirurgia: { include: { medico: true, procedimento: true, convenio: true } },
      itens: { include: { produto: { include: { fabricante: true } }, lote: true }, orderBy: { produto: { descricao: "asc" } } },
    },
  });
  if (!r) notFound();
  // a remessa mostra (e o vale impresso leva) o paciente da cirurgia: abertura auditada (docs/LGPD.md §5)
  if (r.cirurgia) await auditLeitura(user.id, "Cirurgia", r.cirurgia.id, `CIR-${r.cirurgia.numero} via REM-${r.id}`);
  const h = r.local.hospital;
  const edita = podeEditar(user.perfil);
  const total = r.itens.reduce((s, i) => s + i.quantidade, 0);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Remessa REM-${r.id}`}
          meta={[`${h?.nomeFantasia ?? h?.razaoSocial ?? r.local.nome} · criada em ${dateTime(r.criadoEm)}${r.enviadaEm ? ` · enviada em ${dateTime(r.enviadaEm)}` : ""}`]}
          voltar={{ href: "/estoque/remessas", label: "Remessas" }}
          status={<StatusBadge status={r.status} />}
          maisAcoes={
            edita && r.status === "ABERTA" && (
              <ActionButton action={cancelarRemessaAction} hidden={{ id: r.id }} variant="secondary" confirm="Cancelar esta remessa?">
                Cancelar
              </ActionButton>
            )
          }
          actions={
            <>
              <PrintButton label="Imprimir vale" />
              {edita && r.status === "ABERTA" && (
                <ActionButton action={enviarRemessaAction} hidden={{ id: r.id }} variant="primary" confirm="Confirmar o envio? O estoque sai do depósito para o consignado do hospital.">
                  Enviar ao hospital
                </ActionButton>
              )}
            </>
          }
        />
      </div>

      {/* Cabeçalho do vale impresso */}
      <div className="mb-4 hidden print:block">
        <CabecalhoImpresso />
        <h1 className="text-xl font-bold">Vale de remessa em consignação — REM-{r.id}</h1>
        <p className="text-sm">Emitido em {dateTime(new Date())}</p>
      </div>

      <div className="space-y-3">
        <Card title="Destino e cirurgia" className="print:border-black">
          <Dl
            items={[
              ["Hospital", h ? `${h.razaoSocial} (CNPJ ${h.cnpj})` : r.local.nome],
              ["Endereço", h ? [h.endereco, h.cidade, h.uf].filter(Boolean).join(" — ") || "—" : "—"],
              ["Kit / caixa", r.kit ? `${r.kit.codigo} — ${r.kit.descricao}` : "—"],
              [
                "Cirurgia",
                r.cirurgia && user.perfil === "QUALIDADE" ? `CIR-${r.cirurgia.numero} · ${dateTime(r.cirurgia.dataHora)}` : r.cirurgia ? (
                  <Link href={`/comercial/cirurgias/${r.cirurgia.id}`} className="text-teal-700 hover:underline print:text-black print:no-underline">
                    CIR-{r.cirurgia.numero} · {dateTime(r.cirurgia.dataHora)}
                  </Link>
                ) : "—",
              ],
              ["Paciente", r.cirurgia?.paciente ?? "—"],
              ["Médico", r.cirurgia ? `${r.cirurgia.medico.nome} (CRM ${r.cirurgia.medico.crm}/${r.cirurgia.medico.ufCrm})` : "—"],
              ["Procedimento", r.cirurgia?.procedimento?.descricao ?? "—"],
              ["Convênio", r.cirurgia?.convenio?.nome ?? (r.cirurgia?.sus ? "SUS" : "—")],
              ["Enviada em", dateTime(r.enviadaEm)],
              ["Conferida em", dateTime(r.conferidaEm)],
              ["Observação", r.observacao ?? "—"],
            ]}
          />
        </Card>

        <Table
          titulo="Itens do vale"
          contagem={r.itens.length}
          head={["Produto", { label: "Fabricante", hideOnMobile: true }, { label: "Reg. ANVISA", hideOnMobile: true }, { label: "GTIN", hideOnMobile: true }, "Lote", "Validade", "Qtd.", ...(r.status === "CONFERIDA" ? ["Devolvido", "Consumido", "Fica no hospital"] : [])]}
          empty={r.itens.length === 0}
          emptyText="Esta remessa não tem itens."
          rodape={
            <tr>
              <Td colSpan={6} className="text-right">Total</Td>
              <Td className="tnum text-right">{total}</Td>
              {r.status === "CONFERIDA" && <Td colSpan={3}>{null}</Td>}
            </tr>
          }
        >
          {r.itens.map((i) => {
            const dias = diasAte(i.lote.validade);
            return (
              <tr key={i.id}>
                <Td className="whitespace-normal">
                  <div className="font-medium text-teal-700 print:text-black">{i.produto.descricao}</div>
                  <div className="font-mono text-xs text-slate-500">{i.produto.codigo}</div>
                </Td>
                <Td>{i.produto.fabricante?.nome ?? "—"}</Td>
                <Td>{i.produto.registroAnvisa ?? "—"}</Td>
                <Td className="font-mono text-xs">{i.produto.gtin ?? "—"}</Td>
                <Td className="font-mono">{i.lote.numero}</Td>
                <Td className={dias < 0 ? "text-rose-600 print:text-black" : dias <= 30 ? "text-amber-600 print:text-black" : undefined}>{date(i.lote.validade)}</Td>
                <Td className="tnum text-right font-semibold">{i.quantidade}</Td>
                {r.status === "CONFERIDA" && (
                  <>
                    <Td className="tnum text-right">{i.devolvido}</Td>
                    <Td className="tnum text-right">{i.consumido}</Td>
                    <Td className="tnum text-right">{i.quantidade - i.devolvido - i.consumido}</Td>
                  </>
                )}
              </tr>
            );
          })}
        </Table>

        {edita && r.status === "ENVIADA" && (
          <Card title="Conferir retorno" className="print:hidden">
            <p className="mb-4 text-sm text-slate-600">
              {r.cirurgia
                ? `Informe por item o que voltou ao depósito e o que foi consumido na cirurgia CIR-${r.cirurgia.numero}.`
                : "Informe por item o que voltou ao depósito. Vale sem cirurgia não registra consumo: lance o consumo direto na cirurgia."}{" "}
              O que não for informado continua consignado no hospital.
            </p>
            <Form action={conferirRemessaAction.bind(null, r.id)} submitLabel="Concluir conferência">
              <div className="space-y-3">
                {r.itens.map((i) => (
                  <div key={i.id} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_8rem_8rem]">
                    <div className="text-sm">
                      <div className="font-medium text-slate-800">{i.produto.descricao}</div>
                      <div className="text-xs text-slate-600">
                        Lote {i.lote.numero} · enviado {i.quantidade}
                      </div>
                    </div>
                    <Field label="Devolvido" name={`dev_${i.id}`} type="number" min="0" max={i.quantidade} defaultValue={0} />
                    {r.cirurgia ? (
                      <Field label="Consumido" name={`con_${i.id}`} type="number" min="0" max={i.quantidade} defaultValue={0} />
                    ) : (
                      <div />
                    )}
                  </div>
                ))}
              </div>
            </Form>
          </Card>
        )}

        <div className="hidden grid-cols-2 gap-12 pt-16 text-center text-sm print:grid">
          <div className="border-t border-black pt-1">Expedição (distribuidor)</div>
          <div className="border-t border-black pt-1">Recebimento (hospital) — nome, data e carimbo</div>
        </div>
      </div>
    </>
  );
}
