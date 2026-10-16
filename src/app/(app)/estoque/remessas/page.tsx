import Link from "next/link";
import { mascararNome } from "@/lib/privacidade";
import type { Prisma, StatusRemessa } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { Celula } from "@/components/lista";
import { Totais } from "../../_componentes/totais";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
import { date, dateTime, num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../_lib/perfis";
import { cirurgiasAguardandoVale } from "../_lib/cirurgias-aguardando";
import { idInt } from "@/lib/ids";
import { soStrings } from "@/lib/search-params";

const STATUS: StatusRemessa[] = ["ABERTA", "ENVIADA", "CONFERIDA", "CANCELADA"];

export default async function RemessasPage({ searchParams }: { searchParams: Promise<{ status?: string; hospitalId?: string; q?: string; de?: string; ate?: string }> }) {
  const user = await requireUser(PERFIS_VER);
  const sp = soStrings(await searchParams);
  const verCirurgia = user.perfil !== "QUALIDADE"; // a cirurgia (dados de paciente) é do Comercial
  const status = STATUS.includes(sp.status as StatusRemessa) ? (sp.status as StatusRemessa) : undefined;
  const numero = sp.q ? Number(sp.q.replace(/\D/g, "")) : NaN;

  const where: Prisma.RemessaWhereInput = {
    ...(status ? { status } : {}),
    ...(sp.hospitalId ? { local: { hospitalId: sp.hospitalId } } : {}),
    ...(sp.q
      ? {
          OR: [
            ...(idInt(numero) ? [{ id: numero }] : []),
            { cirurgia: { paciente: { contains: sp.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [remessas, hospitais, aguardando] = await Promise.all([
    db.remessa.findMany({
      where,
      include: {
        local: { include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } },
        cirurgia: { select: { numero: true, paciente: true, dataHora: true } },
        kit: { select: { codigo: true } },
        itens: { select: { quantidade: true } },
      },
      orderBy: { id: "desc" },
      take: 200,
    }),
    db.hospital.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
    cirurgiasAguardandoVale(db, { hospitalId: sp.hospitalId, de: sp.de, ate: sp.ate }),
  ]);

  const qtd = (st: string) => remessas.filter((r) => r.status === st).length;
  const unid = (l: typeof remessas) => l.reduce((n, r) => n + r.itens.reduce((x, i) => x + i.quantidade, 0), 0);

  return (
    <>
      <PageHeader
        title="Remessas / vales de consignação"
        subtitle="Material enviado aos hospitais e conferência do retorno."
        actions={podeEditar(user.perfil) && <LinkButton href="/estoque/remessas/nova" icon="mais">Nova remessa</LinkButton>}
      />
      <Totais
        itens={[
          { label: "Na lista", valor: `${num(remessas.length)} (${num(unid(remessas))} un.)` },
          { label: "Abertas, a enviar", valor: num(qtd("ABERTA")), tom: qtd("ABERTA") ? "warn" : "default" },
          { label: "Enviadas, a conferir", valor: `${num(qtd("ENVIADA"))} (${num(unid(remessas.filter((r) => r.status === "ENVIADA")))} un. nos hospitais)` },
          { label: "Conferidas", valor: num(qtd("CONFERIDA")) },
        ]}
      />
      <Filtros limparHref="/estoque/remessas">
        <FiltroInput label="Busca" name="q" defaultValue={sp.q} placeholder="Remessa ou paciente" className="w-full sm:w-60" />
        <FiltroSelect label="Status" name="status" defaultValue={status} todos="Todos os status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FiltroSelect label="Hospital" name="hospitalId" defaultValue={sp.hospitalId} todos="Todos os hospitais" options={hospitais.map((h) => ({ value: h.id, label: h.nomeFantasia ?? h.razaoSocial }))} />
        <FiltroInput label="Cirurgia de" name="de" type="date" defaultValue={sp.de} />
        <FiltroInput label="Cirurgia até" name="ate" type="date" defaultValue={sp.ate} />
      </Filtros>
      <Table
        titulo="Cirurgias aguardando vale"
        contagem={aguardando.length}
        head={["Cirurgia", "Data/hora", { label: "Hospital", hideOnMobile: true }, { label: "Médico", hideOnMobile: true }, { label: "Procedimento", hideOnMobile: true }, "Situação", ""]}
        empty={aguardando.length === 0}
        emptyText="Nenhuma cirurgia agendada ou confirmada está sem vale para os filtros informados."
      >
        {aguardando.map((c) => (
          <tr key={c.id}>
            <Td><Celula href={verCirurgia ? `/comercial/cirurgias/${c.id}` : undefined} principal={`CIR-${c.numero}`} sub={mascararNome(c.paciente)} /></Td>
            <Td>{dateTime(c.dataHora)}</Td>
            <Td className="max-w-[16rem] truncate">{c.hospital.nomeFantasia ?? c.hospital.razaoSocial}</Td>
            <Td>{c.medico.nome}</Td>
            <Td className="max-w-56 truncate" title={c.procedimento?.descricao}>{c.procedimento?.descricao ?? "—"}</Td>
            <Td><StatusBadge status={c.status} /></Td>
            <Td>
              {podeEditar(user.perfil) ? (
                <LinkButton href={`/estoque/remessas/nova?cirurgiaId=${c.id}`} variant="small">Gerar vale</LinkButton>
              ) : (
                <span className="text-xs text-slate-500">—</span>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <Table
        titulo="Remessas / vales"
        contagem={remessas.length}
        head={["Remessa", { label: "Hospital", hideOnMobile: true }, { label: "Cirurgia", hideOnMobile: true }, { label: "Kit", hideOnMobile: true }, "Itens", "Situação", { label: "Enviada", hideOnMobile: true }]}
        empty={remessas.length === 0}
        emptyText="Nenhuma remessa encontrada para os filtros informados."
        emptyAction={podeEditar(user.perfil) ? <LinkButton href="/estoque/remessas/nova" variant="secondary">Nova remessa</LinkButton> : undefined}
      >
        {remessas.map((r) => (
          <tr key={r.id}>
            <Td><Celula href={`/estoque/remessas/${r.id}`} principal={<span className="font-mono text-xs font-semibold">REM-{r.id}</span>} sub={date(r.criadoEm)} /></Td>
            <Td className="max-w-[16rem] truncate font-medium">{r.local.hospital?.nomeFantasia ?? r.local.hospital?.razaoSocial ?? r.local.nome}</Td>
            <Td>
              {r.cirurgia ? (
                <>
                  <div className="font-medium">CIR-{r.cirurgia.numero} · {mascararNome(r.cirurgia.paciente)}</div>
                  <div className="text-xs text-slate-500">{dateTime(r.cirurgia.dataHora)}</div>
                </>
              ) : (
                <span className="text-slate-500">sem cirurgia</span>
              )}
            </Td>
            <Td>{r.kit?.codigo ?? "—"}</Td>
            <Td className="tnum text-right">{num(r.itens.reduce((s, i) => s + i.quantidade, 0))}</Td>
            <Td><StatusBadge status={r.status} /></Td>
            <Td>{r.enviadaEm ? dateTime(r.enviadaEm) : "—"}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
