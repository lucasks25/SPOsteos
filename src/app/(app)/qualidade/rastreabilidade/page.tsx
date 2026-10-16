import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Badge, btn, Card, Dl, EmptyState, PageHeader, SearchBar, SectionTitle, StatusBadge, Table, Td } from "@/components/ui";
import { date, dateTime, money, num } from "@/lib/format";
import { PERFIS_QUALIDADE } from "../_lib/perfis";
import { PrintButton } from "../_lib/print-button";
import { buscarLotes, type Rastreio } from "../_lib/rastreio";

const PRINT_CSS = `@media print {
  aside, header { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: white !important; }
  .rastreio-lote { break-inside: auto; }
  .rastreio-lote + .rastreio-lote { break-before: page; }
}`;

export default async function RastreabilidadePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser(PERFIS_QUALIDADE);
  const { q } = await searchParams;
  const { lotes, truncado } = q ? await buscarLotes(q) : { lotes: [], truncado: false };

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="print:hidden">
        <PageHeader
          title="Rastreabilidade"
          subtitle="Busque um lote para ver origem, consumo e destino, para recall e tecnovigilância."
          actions={lotes.length > 0 ? <PrintButton /> : undefined}
        />
        <SearchBar placeholder="Número do lote, série, GTIN ou código do produto" defaultValue={q} />
      </div>
      <div className="mb-4 hidden print:block">
        <h1 className="text-lg font-bold">Relatório de rastreabilidade</h1>
        <p className="text-xs text-slate-600">
          Busca: “{q}” · Emitido em {dateTime(new Date())} por {user.nome}
        </p>
      </div>
      {q && lotes.length === 0 && <div className="rounded border border-slate-200 bg-white px-4 py-12 shadow-sm"><EmptyState text={`Nenhum lote encontrado para “${q}”. Confira o número do lote, a série, o GTIN ou o código.`} icon="busca" /></div>}
      {truncado && <p className="mb-4 text-[13px] text-amber-700">Muitos lotes encontrados — exibindo os 30 primeiros. Refine a busca.</p>}
      {lotes.length > 1 && (
        <p className="mb-4 text-[13px] text-slate-600 print:hidden">{lotes.length} lotes encontrados.</p>
      )}
      <div className="space-y-10">
        {lotes.map((r) => (
          <LoteRastreio key={r.lote.id} r={r} />
        ))}
      </div>
    </>
  );
}

function LoteRastreio({ r }: { r: Rastreio }) {
  const { lote, entradas } = r;
  const totalEntrada = entradas.reduce((s, e) => s + e.movimento.quantidade, 0);
  const totalConsumido = lote.consumos.reduce((s, c) => s + c.quantidade, 0);
  const saldo = lote.saldos.reduce((s, x) => s + x.quantidade, 0);
  return (
    <section className="rastreio-lote">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4 border-b-2 border-teal-700 pb-2">
        <h2 className="text-lg font-bold text-slate-900">
          Lote {lote.numero}
          {lote.serie && <span className="text-slate-500"> · Série {lote.serie}</span>} — {lote.produto.descricao}
        </h2>
        <Link href={`/qualidade/lotes/${lote.id}`} className={`${btn.small} print:hidden`}>
          Abrir lote
        </Link>
      </div>
      <Card title="Identificação">
        <Dl
          items={[
            ["Produto", `${lote.produto.codigo} — ${lote.produto.descricao}`],
            ["Fabricante", lote.produto.fabricante?.nome ?? "—"],
            ["Referência", lote.produto.referencia ?? "—"],
            ["Registro ANVISA", `${lote.produto.registroAnvisa ?? "—"} (val. ${date(lote.produto.validadeRegistro)})`],
            ["GTIN", lote.produto.gtin ?? "—"],
            ["Classe de risco", lote.produto.classeRisco ?? "—"],
            ["Fabricação / validade", `${date(lote.fabricacao)} / ${date(lote.validade)}`],
            ["Status", <StatusBadge key="s" status={lote.status} />],
            ["Resumo", `Entrada ${num(totalEntrada)} · Consumido ${num(totalConsumido)} · Em estoque ${num(saldo)}`],
          ]}
        />
      </Card>

      <div>
        <SectionTitle>Entrada (origem)</SectionTitle>
        <Table head={["Data", "Documento", "Fornecedor", "CNPJ / AFE", "Invoice / DI", "Qtd.", "Custo unit."]} empty={entradas.length === 0}>
          {entradas.map(({ movimento: m, pedido: p }) => (
            <tr key={m.id}>
              <Td>{dateTime(m.criadoEm)}</Td>
              <Td>
                {p ? (
                  <Link href={`/compras/pedidos/${p.id}`} className="text-teal-700 hover:underline print:text-slate-800 print:no-underline">{m.documento}</Link>
                ) : (
                  m.documento ?? "—"
                )}
              </Td>
              <Td>{p?.fornecedor.razaoSocial ?? "—"}</Td>
              <Td className="text-xs">{p ? `${p.fornecedor.cnpj}${p.fornecedor.afe ? ` / AFE ${p.fornecedor.afe}` : ""}` : "—"}</Td>
              <Td className="text-xs">{p?.importacao ? `${p.invoice ?? "—"} / ${p.numeroDi ?? "—"}` : "—"}</Td>
              <Td className="text-right">{num(m.quantidade)}</Td>
              <Td className="text-right">{money(m.custoUnit)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      {lote.inspecoes.length > 0 && (
        <div>
          <SectionTitle>Inspeções de qualidade</SectionTitle>
          <Table head={["Data", "Resultado", "Checklist", "Inspetor", "Observação"]}>
            {lote.inspecoes.map((i) => (
              <tr key={i.id}>
                <Td>{dateTime(i.criadoEm)}</Td>
                <Td><StatusBadge status={i.resultado} /></Td>
                <Td className="text-xs">
                  Emb. {i.embalagemOk ? "OK" : "NOK"} · Rót. {i.rotulagemOk ? "OK" : "NOK"} · Doc. {i.documentacaoOk ? "OK" : "NOK"}
                </Td>
                <Td>{i.inspetor}</Td>
                <Td className="whitespace-normal">{i.observacao ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <div>
        <SectionTitle>Cirurgias / pacientes (consumo)</SectionTitle>
        <Table head={["Cirurgia", "Data", "Hospital", "Médico", "Paciente", "Convênio", "Qtd."]} empty={lote.consumos.length === 0}>
          {lote.consumos.map((c) => (
            <tr key={c.id}>
              <Td>#{c.cirurgia.numero}</Td>
              <Td>{dateTime(c.cirurgia.dataHora)}</Td>
              <Td>{c.cirurgia.hospital.nomeFantasia ?? c.cirurgia.hospital.razaoSocial}</Td>
              <Td>
                {c.cirurgia.medico.nome} <span className="text-xs text-slate-500">CRM {c.cirurgia.medico.crm}/{c.cirurgia.medico.ufCrm}</span>
              </Td>
              <Td>{c.cirurgia.paciente}</Td>
              <Td>{c.cirurgia.sus ? "SUS" : c.cirurgia.convenio?.nome ?? "—"}</Td>
              <Td className="text-right">{num(c.quantidade)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      <div>
        <SectionTitle>Remessas de consignação</SectionTitle>
        <Table head={["Remessa", "Status", "Local / hospital", "Enviada em", "Cirurgia", "Qtd.", "Devolvido", "Consumido"]} empty={lote.remessaItens.length === 0}>
          {lote.remessaItens.map((ri) => (
            <tr key={ri.id}>
              <Td>REM-{ri.remessaId}</Td>
              <Td><StatusBadge status={ri.remessa.status} /></Td>
              <Td>
                {ri.remessa.local.hospital ? (ri.remessa.local.hospital.nomeFantasia ?? ri.remessa.local.hospital.razaoSocial) : ri.remessa.local.nome}
              </Td>
              <Td>{date(ri.remessa.enviadaEm)}</Td>
              <Td>{ri.remessa.cirurgia ? `#${ri.remessa.cirurgia.numero}` : "—"}</Td>
              <Td className="text-right">{num(ri.quantidade)}</Td>
              <Td className="text-right">{num(ri.devolvido)}</Td>
              <Td className="text-right">{num(ri.consumido)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      <div>
        <SectionTitle>Saldo atual por local</SectionTitle>
        <Table head={["Local", "Tipo", "Quantidade"]} empty={lote.saldos.length === 0}>
          {lote.saldos.map((s) => (
            <tr key={s.id}>
              <Td>{s.local.nome}</Td>
              <Td>{s.local.tipo.replaceAll("_", " ").toLowerCase()}</Td>
              <Td className="text-right">{num(s.quantidade)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      <div>
        <SectionTitle>Movimentações (kardex)</SectionTitle>
        <Table head={["Data", "Tipo", "Documento", "Origem", "Destino", "Qtd.", "Usuário", "Obs."]} empty={lote.movimentos.length === 0}>
          {lote.movimentos.map((m) => (
            <tr key={m.id}>
              <Td>{dateTime(m.criadoEm)}</Td>
              <Td><Badge color={m.tipo === "ENTRADA" ? "green" : m.tipo === "CONSUMO" ? "purple" : m.tipo === "PERDA" ? "red" : "gray"}>{m.tipo.toLowerCase()}</Badge></Td>
              <Td>{m.documento ?? "—"}</Td>
              <Td>{m.origem?.nome ?? "—"}</Td>
              <Td>{m.destino?.nome ?? "—"}</Td>
              <Td className="text-right">{num(m.quantidade)}</Td>
              <Td>{m.usuario ?? "—"}</Td>
              <Td className="whitespace-normal text-xs">{m.observacao ?? ""}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </section>
  );
}
