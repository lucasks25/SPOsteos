import "server-only";
import { db } from "@/lib/db";

export type Opcao = { value: string; label: string };

export const nomeHospital = (h: { nomeFantasia: string | null; razaoSocial: string }) => h.nomeFantasia ?? h.razaoSocial;

export async function opcoesHospitais(apenasAtivos = true): Promise<Opcao[]> {
  const rows = await db.hospital.findMany({
    where: apenasAtivos ? { ativo: true } : undefined,
    select: { id: true, nomeFantasia: true, razaoSocial: true },
    orderBy: { razaoSocial: "asc" },
  });
  return rows.map((h) => ({ value: h.id, label: nomeHospital(h) }));
}

export async function opcoesMedicos(apenasAtivos = true): Promise<Opcao[]> {
  const rows = await db.medico.findMany({ where: apenasAtivos ? { ativo: true } : undefined, orderBy: { nome: "asc" } });
  return rows.map((m) => ({ value: m.id, label: `${m.nome} — CRM ${m.crm}/${m.ufCrm}` }));
}

export async function opcoesConvenios(): Promise<Opcao[]> {
  const rows = await db.convenio.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });
  return rows.map((c) => ({ value: c.id, label: c.nome }));
}

export async function opcoesProcedimentos(): Promise<Opcao[]> {
  const rows = await db.procedimento.findMany({ orderBy: { descricao: "asc" } });
  return rows.map((p) => ({ value: p.id, label: p.codigoTuss ? `${p.codigoTuss} — ${p.descricao}` : p.descricao }));
}

export async function opcoesRepresentantes(apenasAtivos = true): Promise<Opcao[]> {
  const rows = await db.representante.findMany({ where: apenasAtivos ? { ativo: true } : undefined, orderBy: { nome: "asc" } });
  return rows.map((r) => ({ value: r.id, label: r.nome }));
}

/** Produtos ativos com preço base (números, prontos para componentes cliente). */
export async function produtosParaVenda() {
  const rows = await db.produto.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, descricao: true, precoBase: true },
    orderBy: { descricao: "asc" },
  });
  return rows.map((p) => ({ id: p.id, codigo: p.codigo, descricao: p.descricao, precoBase: Number(p.precoBase.toString()) }));
}

/** Todas as listas usadas no formulário de cirurgia. */
export async function opcoesCirurgia(apenasAtivos = true) {
  const [hospitais, medicos, convenios, procedimentos, representantes] = await Promise.all([
    opcoesHospitais(apenasAtivos),
    opcoesMedicos(apenasAtivos),
    opcoesConvenios(),
    opcoesProcedimentos(),
    opcoesRepresentantes(apenasAtivos),
  ]);
  return { hospitais, medicos, convenios, procedimentos, representantes };
}
