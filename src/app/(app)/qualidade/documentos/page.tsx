import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { Badge, btn, campo, FilterBar, KpiGrid, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import {
  ESCOPOS, FILTRO_ATENCAO, PERFIS_VER_DOCUMENTOS, podeEditarDocumentos, ROTULO_ESCOPO, ROTULO_SITUACAO, ROTULO_TIPO, SITUACOES, TIPOS,
  type EscopoDoc, type SituacaoDoc,
} from "../_lib/documentos";
import { contarPorSituacao, whereLista, type FiltroLista } from "../_lib/documentos-servico";
import { SituacaoBadge } from "../_lib/situacao-badge";

const inputCls = campo;
type SP = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(PERFIS_VER_DOCUMENTOS);
  const sp = await searchParams;
  const hoje = hojeUTC();
  const f: FiltroLista = {
    escopo: ESCOPOS.includes(um(sp.escopo) as EscopoDoc) ? (um(sp.escopo) as EscopoDoc) : undefined,
    tipo: TIPOS.includes(um(sp.tipo) as (typeof TIPOS)[number]) ? (um(sp.tipo) as (typeof TIPOS)[number]) : undefined,
    situacao: um(sp.situacao) === FILTRO_ATENCAO ? FILTRO_ATENCAO : SITUACOES.includes(um(sp.situacao) as SituacaoDoc) ? (um(sp.situacao) as SituacaoDoc) : undefined,
    q: um(sp.q)?.trim().slice(0, 80) || undefined,
    inativos: um(sp.inativos) === "1",
  };
  // Vínculo (vindo dos cadastros por querystring): fornecedor, fabricante ou produto.
  const vinculo = (["fornecedorId", "fabricanteId", "produtoId"] as const)
    .map((campo) => ({ campo, id: um(sp[campo])?.slice(0, 40) }))
    .find((v) => v.id);
  const filtrado = !!(f.escopo || f.tipo || f.situacao || f.q || f.inativos || vinculo);
  const [docs, cont] = await Promise.all([
    db.documento.findMany({
      where: { ...whereLista(f, hoje), ...(vinculo ? { [vinculo.campo]: vinculo.id } : {}) },
      orderBy: [{ validade: { sort: "asc", nulls: "last" } }, { titulo: "asc" }],
      take: 300,
      include: {
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        fabricante: { select: { nome: true } },
        produto: { select: { codigo: true, descricao: true } },
        _count: { select: { arquivos: true } },
      },
    }),
    contarPorSituacao(hoje),
  ]);
  const pode = podeEditarDocumentos(user.perfil);
  const novoHref = vinculo
    ? `/qualidade/documentos/novo?escopo=${{ fornecedorId: "FORNECEDOR", fabricanteId: "FABRICANTE", produtoId: "PRODUTO" }[vinculo.campo]}&${vinculo.campo}=${encodeURIComponent(vinculo.id!)}`
    : "/qualidade/documentos/novo";
  const alvo = (d: (typeof docs)[number]) => d.fornecedor ? (d.fornecedor.nomeFantasia ?? d.fornecedor.razaoSocial) : d.fabricante ? d.fabricante.nome : d.produto ? `${d.produto.codigo} · ${d.produto.descricao}` : "Empresa";

  return (
    <>
      <PageHeader
        title="Documentos e licenças"
        subtitle="AFE, licenças, certificados e registros da empresa, dos fornecedores, dos fabricantes e dos produtos, com alerta de vencimento."
        actions={pode && <LinkButton href={novoHref} icon="mais">Novo documento</LinkButton>}
      />
      <KpiGrid cols={4}>
        <Stat label="Vencidos" value={cont.VENCIDO} tone={cont.VENCIDO ? "danger" : "default"} hint="exigem renovação" />
        <Stat label="Vencem em 30 dias" value={cont.VENCE_EM_30} tone={cont.VENCE_EM_30 ? "warn" : "default"} hint="inclui os que vencem hoje" />
        <Stat label="Vigentes" value={cont.VIGENTE + cont.VENCE_EM_90} hint={`${cont.VENCE_EM_90} vencem em 31 a 90 dias`} />
        <Stat label="Sem vencimento" value={cont.SEM_VENCIMENTO} />
      </KpiGrid>
      <FilterBar>
        {vinculo && <input type="hidden" name={vinculo.campo} value={vinculo.id} />}
        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Busca</span>
          <input name="q" defaultValue={f.q} placeholder="Título, número, órgão ou vínculo" className={`${inputCls} w-64`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Escopo</span>
          <select name="escopo" defaultValue={f.escopo ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {ESCOPOS.map((e) => <option key={e} value={e}>{ROTULO_ESCOPO[e]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Tipo</span>
          <select name="tipo" defaultValue={f.tipo ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Situação</span>
          <select name="situacao" defaultValue={f.situacao ?? ""} className={inputCls}>
            <option value="">Todas</option>
            <option value={FILTRO_ATENCAO}>Vencidos ou a vencer em 30 dias</option>
            {SITUACOES.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
          </select>
        </label>
        <label className="flex h-8 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="inativos" value="1" defaultChecked={f.inativos} className="h-4 w-4 rounded-sm border-slate-300" />
          Incluir inativos e substituídos
        </label>
        <button className={btn.secondary}>Filtrar</button>
        <Link href="/qualidade/documentos" className={btn.ghost}>Limpar</Link>
      </FilterBar>
      <Table
        titulo="Documentos"

        contagem={docs.length}
        head={["Documento", "Tipo", "Vale para", "Emissão", "Validade", "Situação", "Arquivos", ""]}
        empty={docs.length === 0}
        emptyText={filtrado ? "Nenhum documento encontrado com esses filtros." : "Nenhum documento cadastrado ainda."}
        emptyAction={pode && !filtrado ? <LinkButton href="/qualidade/documentos/novo" variant="secondary" icon="mais">Cadastrar o primeiro documento</LinkButton> : undefined}
      >
        {docs.map((d) => (
          <tr key={d.id} className={d.ativo && !d.substituidoPorId ? undefined : "opacity-70"}>
            <Td className="max-w-[22rem]">
              <Link href={`/qualidade/documentos/${d.id}`} className="block truncate font-semibold text-teal-700 hover:underline">{d.titulo}</Link>
              <div className="truncate text-xs text-slate-500">{[d.numero && `nº ${d.numero}`, d.orgaoEmissor].filter(Boolean).join(" · ") || "sem número"}</div>
            </Td>
            <Td>{ROTULO_TIPO[d.tipo]}</Td>
            <Td className="max-w-[16rem]">
              <div className="truncate">{alvo(d)}</div>
              <div className="text-xs text-slate-500">{ROTULO_ESCOPO[d.escopo]}</div>
            </Td>
            <Td>{date(d.emissao)}</Td>
            <Td>{d.validade ? date(d.validade) : "—"}</Td>
            <Td>
              {d.substituidoPorId ? <Badge>substituído</Badge> : !d.ativo ? <Badge>inativo</Badge> : <SituacaoBadge validade={d.validade} hoje={hoje} />}
            </Td>
            <Td className="text-right tnum">{d._count.arquivos}</Td>
            <Td><Link href={`/qualidade/documentos/${d.id}`} className={btn.small}>Abrir</Link></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
