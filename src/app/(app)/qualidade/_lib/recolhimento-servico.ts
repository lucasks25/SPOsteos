import "server-only";
import type { OrigemRecolhimento, ClasseRecolhimento } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import {
  aRecolher,
  docRecolhimento,
  encerrado,
  pendenciasParaConcluir,
  planoBloqueio,
  resumirRecolhimento,
  saldoMudou,
  statusAposRecolher,
  tipoMovimentoRecolhimento,
  validarRecolhimento,
} from "./recolhimento";

/**
 * Recolhimento de lote: tudo que mexe no banco. Fora de "use server" para ser testado sem login.
 * Toda mutação trava a linha do recolhimento (FOR UPDATE). O saldo só muda por movimentar() (documento "REC-<n>").
 * Concluído e cancelado são imutáveis.
 */

const ATIVOS = ["ABERTO", "EM_ANDAMENTO"] as const;
const LOCAIS_ALVO = ["DEPOSITO", "HOSPITAL", "QUARENTENA"] as const;

async function travar(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM "Recolhimento" WHERE id = ${id} FOR UPDATE`;
  const rec = await tx.recolhimento.findUnique({ where: { id } });
  if (!rec) throw new ErroNegocio("Recolhimento não encontrado.");
  return rec;
}

function exigirAtivo(status: string) {
  if (status === "CONCLUIDO") throw new ErroNegocio("Recolhimento já concluído: não pode mais ser alterado.");
  if (status === "CANCELADO") throw new ErroNegocio("Recolhimento cancelado.");
}

const log = (tx: Tx, recolhimentoId: number, usuario: string, tipo: string, descricao: string) =>
  tx.recolhimentoAcao.create({ data: { recolhimentoId, usuario, tipo, descricao } });

async function iniciar(tx: Tx, id: number, status: string) {
  if (status === "ABERTO") await tx.recolhimento.update({ where: { id }, data: { status: "EM_ANDAMENTO" } });
}

/** Locais com saldo e cirurgias que usaram o lote e ainda não estão no recolhimento (lotes sem foto = adiciona). */
export async function sincronizar(tx: Tx, id: number) {
  const lotes = await tx.recolhimentoLote.findMany({ where: { recolhimentoId: id }, select: { loteId: true } });
  const loteIds = lotes.map((l) => l.loteId);
  const [saldos, alvos, consumos, pacientes] = await Promise.all([
    tx.saldo.findMany({ where: { loteId: { in: loteIds }, quantidade: { gt: 0 }, local: { tipo: { in: [...LOCAIS_ALVO] } } } }),
    tx.recolhimentoAlvo.findMany({ where: { recolhimentoId: id }, select: { loteId: true, localId: true } }),
    tx.cirurgiaConsumo.findMany({ where: { loteId: { in: loteIds } } }),
    tx.recolhimentoPaciente.findMany({ where: { recolhimentoId: id }, select: { consumoId: true } }),
  ]);
  const temAlvo = new Set(alvos.map((a) => `${a.loteId}|${a.localId}`));
  const novosAlvos = saldos.filter((s) => !temAlvo.has(`${s.loteId}|${s.localId}`));
  if (novosAlvos.length) {
    await tx.recolhimentoAlvo.createMany({ data: novosAlvos.map((s) => ({ recolhimentoId: id, loteId: s.loteId, localId: s.localId, saldoAbertura: s.quantidade })), skipDuplicates: true });
  }
  const temPac = new Set(pacientes.map((p) => p.consumoId));
  const novosPac = consumos.filter((c) => !temPac.has(c.id));
  if (novosPac.length) {
    await tx.recolhimentoPaciente.createMany({
      data: novosPac.map((c) => ({ recolhimentoId: id, consumoId: c.id, cirurgiaId: c.cirurgiaId, loteId: c.loteId, quantidade: c.quantidade })),
      skipDuplicates: true,
    });
  }
  return { alvos: novosAlvos.length, pacientes: novosPac.length };
}

export type AbrirInput = {
  loteIds: string[];
  origem: OrigemRecolhimento;
  classe: ClasseRecolhimento;
  motivo: string;
  referencia?: string | null;
  prazo?: Date | null;
  observacao?: string | null;
  usuario: string;
};

/** Abre o recolhimento: bloqueia os lotes e tira a foto dos locais com saldo e das cirurgias que usaram o lote. */
export async function abrirRecolhimento(tx: Tx, o: AbrirInput) {
  const ids = [...new Set(o.loteIds)];
  if (ids.length === 0) throw new ErroNegocio("Selecione ao menos um lote.");
  if (!o.motivo.trim()) throw new ErroNegocio("Informe o motivo do recolhimento.");
  await tx.$queryRaw`SELECT id FROM "Lote" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
  const lotes = await tx.lote.findMany({ where: { id: { in: ids } }, include: { produto: true } });
  if (lotes.length !== ids.length) throw new ErroNegocio("Lote não encontrado.");

  const rec = await tx.recolhimento.create({
    data: { origem: o.origem, classe: o.classe, motivo: o.motivo.trim(), referencia: o.referencia?.trim() || null, prazo: o.prazo ?? null, observacao: o.observacao?.trim() || null, abertoPor: o.usuario },
  });
  const bloqueados: string[] = [];
  for (const l of lotes) {
    const plano = planoBloqueio(l.status);
    await tx.recolhimentoLote.create({ data: { recolhimentoId: rec.id, loteId: l.id, statusAnterior: l.status, bloqueadoPorEste: plano.bloqueadoPorEste } });
    if (plano.bloquear) {
      await tx.lote.update({ where: { id: l.id }, data: { status: "BLOQUEADO" } });
      bloqueados.push(l.numero);
    }
  }
  const foto = await sincronizar(tx, rec.id);
  await log(tx, rec.id, o.usuario, "ABERTURA", `Aberto com ${lotes.length} lote(s) (${lotes.map((l) => l.numero).join(", ")}); ${foto.alvos} local(is) com saldo e ${foto.pacientes} uso(s) em cirurgia na foto.`);
  if (bloqueados.length) await log(tx, rec.id, o.usuario, "BLOQUEIO", `Lote(s) bloqueado(s): ${bloqueados.join(", ")}.`);
  return { recolhimento: rec, foto };
}

/** Inclui na foto o que apareceu depois da abertura (saldo em local novo, uso em cirurgia). */
export async function atualizarFoto(tx: Tx, id: number, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  const r = await sincronizar(tx, id);
  await log(tx, id, usuario, "ATUALIZACAO", `Foto atualizada: +${r.alvos} local(is), +${r.pacientes} uso(s) em cirurgia.`);
  return r;
}

/** Marca como COMUNICADO os alvos pendentes do local (a impressão do comunicado não marca nada sozinha). */
export async function registrarComunicado(tx: Tx, id: number, localId: string, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  const local = await tx.localEstoque.findUnique({ where: { id: localId }, include: { hospital: true } });
  if (!local) throw new ErroNegocio("Local não encontrado.");
  const total = await tx.recolhimentoAlvo.count({ where: { recolhimentoId: id, localId } });
  if (total === 0) throw new ErroNegocio("Este local não faz parte do recolhimento.");
  const r = await tx.recolhimentoAlvo.updateMany({ where: { recolhimentoId: id, localId, status: "PENDENTE" }, data: { status: "COMUNICADO", comunicadoEm: new Date() } });
  if (r.count === 0) throw new ErroNegocio("Todos os itens deste local já constam como comunicados ou recolhidos.");
  await iniciar(tx, id, rec.status);
  await log(tx, id, usuario, "COMUNICADO", `Comunicado de recolhimento emitido para ${local.hospital?.nomeFantasia ?? local.hospital?.razaoSocial ?? local.nome} (${r.count} item(ns)).`);
  return r.count;
}

/** Marca pacientes/cirurgias como comunicados. */
export async function comunicarPacientes(tx: Tx, id: number, pacienteIds: string[], usuario: string, observacao?: string | null) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  if (pacienteIds.length === 0) throw new ErroNegocio("Selecione ao menos um paciente/cirurgia.");
  const r = await tx.recolhimentoPaciente.updateMany({
    where: { recolhimentoId: id, id: { in: pacienteIds }, comunicadoEm: null },
    data: { comunicadoEm: new Date(), ...(observacao?.trim() ? { observacao: observacao.trim() } : {}) },
  });
  if (r.count === 0) throw new ErroNegocio("Nenhum dos selecionados está pendente de comunicação.");
  await iniciar(tx, id, rec.status);
  await log(tx, id, usuario, "PACIENTE", `${r.count} paciente(s)/cirurgia(s) marcado(s) como comunicado(s).`);
  return r.count;
}

/** Recolhimento físico: move do local do alvo para o NÃO CONFORME (documento REC-n). */
export async function recolherFisico(tx: Tx, id: number, o: { alvoId: string; quantidade: number }, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  const alvo = await tx.recolhimentoAlvo.findFirst({ where: { id: o.alvoId, recolhimentoId: id }, include: { local: { include: { hospital: true } }, lote: { include: { produto: true } } } });
  if (!alvo) throw new ErroNegocio("Item não pertence a este recolhimento.");
  // trava a linha de saldo: dois recolhimentos do mesmo alvo se enfileiram e o segundo enxerga o saldo já reduzido
  await tx.$queryRaw`SELECT id FROM "Saldo" WHERE "loteId" = ${alvo.loteId} AND "localId" = ${alvo.localId} FOR UPDATE`;
  const saldo = await tx.saldo.findUnique({ where: { loteId_localId: { loteId: alvo.loteId, localId: alvo.localId } } });
  const saldoAtual = saldo?.quantidade ?? 0;
  const erro = validarRecolhimento(o.quantidade, saldoAtual);
  if (erro) throw new ErroNegocio(erro);
  await movimentar(tx, {
    tipo: tipoMovimentoRecolhimento(alvo.local.tipo),
    produtoId: alvo.lote.produtoId,
    loteId: alvo.loteId,
    quantidade: o.quantidade,
    origemId: alvo.localId,
    destinoId: LOCAIS.NAO_CONFORME,
    custoUnit: toNumber(alvo.lote.produto.custoMedio),
    documento: docRecolhimento(id),
    observacao: `Recolhimento ${docRecolhimento(id)}: ${rec.motivo}`.slice(0, 200),
    usuario,
  });
  const restante = saldoAtual - o.quantidade;
  await tx.recolhimentoAlvo.update({
    where: { id: alvo.id },
    data: { quantidadeRecolhida: { increment: o.quantidade }, recolhidoEm: new Date(), status: statusAposRecolher(restante, alvo.status) },
  });
  await iniciar(tx, id, rec.status);
  const onde = alvo.local.hospital ? (alvo.local.hospital.nomeFantasia ?? alvo.local.hospital.razaoSocial) : alvo.local.nome;
  await log(tx, id, usuario, "RECOLHIMENTO", `${o.quantidade} un. do lote ${alvo.lote.numero} recolhida(s) de ${onde} para o estoque não conforme (restam ${restante} no local).`);
  return { restante };
}

/** Justificativa para concluir com saldo que não foi recolhido (ex.: material já devolvido ao fabricante). Vazio remove. */
export async function justificarAlvo(tx: Tx, id: number, alvoId: string, texto: string | null, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  const t = texto?.trim() || null;
  if (t && t.length < 5) throw new ErroNegocio("Descreva a justificativa com mais detalhe.");
  const n = await tx.recolhimentoAlvo.updateMany({ where: { id: alvoId, recolhimentoId: id }, data: { justificativa: t } });
  if (n.count === 0) throw new ErroNegocio("Item não pertence a este recolhimento.");
  await iniciar(tx, id, rec.status);
  await log(tx, id, usuario, "JUSTIFICATIVA", t ? `Justificativa registrada: ${t}` : "Justificativa removida.");
}

export async function registrarNota(tx: Tx, id: number, texto: string, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  if (!texto.trim()) throw new ErroNegocio("Escreva a ação realizada.");
  await iniciar(tx, id, rec.status);
  await log(tx, id, usuario, "NOTA", texto.trim());
}

type Cliente = Pick<Tx, "recolhimento" | "saldo" | "recolhimentoAlvo" | "cirurgiaConsumo" | "recolhimentoPaciente" | "recolhimentoLote">;

/** Alvos com saldo ATUAL (ou o saldo congelado, se concluído) e o que impede concluir. */
export async function situacaoAlvos(c: Cliente, id: number) {
  const rec = await c.recolhimento.findUnique({ where: { id } });
  if (!rec) throw new ErroNegocio("Recolhimento não encontrado.");
  const alvos = await c.recolhimentoAlvo.findMany({
    where: { recolhimentoId: id },
    include: { lote: { include: { produto: true } }, local: { include: { hospital: true } } },
    orderBy: [{ local: { tipo: "asc" } }, { local: { nome: "asc" } }, { lote: { numero: "asc" } }],
  });
  const saldos = await c.saldo.findMany({ where: { loteId: { in: [...new Set(alvos.map((a) => a.loteId))] } } });
  const atual = new Map(saldos.map((s) => [`${s.loteId}|${s.localId}`, s.quantidade]));
  const itens = alvos.map((a) => {
    const saldoAtual = encerrado(rec.status) ? (a.saldoFinal ?? 0) : (atual.get(`${a.loteId}|${a.localId}`) ?? 0);
    const calc = { status: a.status, saldoAbertura: a.saldoAbertura, quantidadeRecolhida: a.quantidadeRecolhida, saldoAtual, justificativa: a.justificativa };
    return { ...a, saldoAtual, falta: aRecolher(calc), mudou: saldoMudou(calc), calc, rotulo: `${a.local.hospital ? (a.local.hospital.nomeFantasia ?? a.local.hospital.razaoSocial) : a.local.nome}, lote ${a.lote.numero}` };
  });
  return { rec, itens };
}

/** O que impede concluir: alvos pendentes, saldo em local fora da foto e usos em cirurgia fora da foto. */
export async function pendenciasDoRecolhimento(c: Cliente, id: number) {
  const { itens } = await situacaoAlvos(c, id);
  const out = pendenciasParaConcluir(itens.map((i) => ({ ...i.calc, rotulo: i.rotulo })));
  const loteIds = (await c.recolhimentoLote.findMany({ where: { recolhimentoId: id }, select: { loteId: true } })).map((l) => l.loteId);
  const [saldos, consumos, pacientes] = await Promise.all([
    c.saldo.findMany({ where: { loteId: { in: loteIds }, quantidade: { gt: 0 }, local: { tipo: { in: [...LOCAIS_ALVO] } } }, select: { loteId: true, localId: true } }),
    c.cirurgiaConsumo.findMany({ where: { loteId: { in: loteIds } }, select: { id: true } }),
    c.recolhimentoPaciente.findMany({ where: { recolhimentoId: id }, select: { consumoId: true } }),
  ]);
  const temAlvo = new Set(itens.map((i) => `${i.loteId}|${i.localId}`));
  const foraAlvo = saldos.filter((s) => !temAlvo.has(`${s.loteId}|${s.localId}`)).length;
  if (foraAlvo) out.push(`${foraAlvo} local(is) com saldo do lote fora da lista: use "Atualizar locais e pacientes".`);
  const temPac = new Set(pacientes.map((p) => p.consumoId));
  const foraPac = consumos.filter((x) => !temPac.has(x.id)).length;
  if (foraPac) out.push(`${foraPac} uso(s) em cirurgia fora da lista: use "Atualizar locais e pacientes".`);
  return out;
}

export async function concluirRecolhimento(tx: Tx, id: number, conclusao: string, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  if (!conclusao.trim()) throw new ErroNegocio("Escreva o parecer final do recolhimento.");
  // trava os saldos dos lotes: nada se move entre a checagem e o congelamento
  const loteIds = (await tx.recolhimentoLote.findMany({ where: { recolhimentoId: id }, select: { loteId: true } })).map((l) => l.loteId);
  await tx.$queryRaw`SELECT id FROM "Saldo" WHERE "loteId" = ANY(${loteIds}::text[]) ORDER BY id FOR UPDATE`;
  const pend = await pendenciasDoRecolhimento(tx, id);
  if (pend.length > 0) throw new ErroNegocio(`Não é possível concluir. ${pend.slice(0, 4).join(" ")}${pend.length > 4 ? ` (+${pend.length - 4} pendência(s))` : ""}`);
  const { itens } = await situacaoAlvos(tx, id);
  for (const i of itens) {
    const sem = i.saldoAtual === 0 && i.quantidadeRecolhida === 0;
    await tx.recolhimentoAlvo.update({ where: { id: i.id }, data: { saldoFinal: i.saldoAtual, ...(sem ? { status: "SEM_SALDO" } : {}) } });
  }
  await tx.recolhimento.update({ where: { id }, data: { status: "CONCLUIDO", concluidoEm: new Date(), concluidoPor: usuario, conclusao: conclusao.trim() } });
  const r = resumirRecolhimento(itens.map((i) => i.calc), []);
  await log(tx, id, usuario, "CONCLUSAO", `Recolhimento concluído: ${r.recolhido} un. recolhida(s) de ${r.encontrado} encontrada(s) na abertura.`);
}

/** Cancela (só sem recolhimento físico) e desbloqueia somente os lotes que ESTE recolhimento bloqueou. */
export async function cancelarRecolhimento(tx: Tx, id: number, motivo: string, usuario: string) {
  const rec = await travar(tx, id);
  exigirAtivo(rec.status);
  if (!motivo.trim()) throw new ErroNegocio("Informe o motivo do cancelamento.");
  const recolhido = await tx.recolhimentoAlvo.aggregate({ where: { recolhimentoId: id }, _sum: { quantidadeRecolhida: true } });
  if ((recolhido._sum.quantidadeRecolhida ?? 0) > 0) throw new ErroNegocio("Já houve recolhimento físico: o recolhimento não pode ser cancelado. Conclua-o.");
  const rls = await tx.recolhimentoLote.findMany({ where: { recolhimentoId: id }, include: { lote: true } });
  await tx.$queryRaw`SELECT id FROM "Lote" WHERE id = ANY(${rls.map((r) => r.loteId)}::text[]) ORDER BY id FOR UPDATE`;
  const desbloqueados: string[] = [];
  for (const rl of rls) {
    if (!rl.bloqueadoPorEste) continue;
    const outro = await tx.recolhimentoLote.findFirst({ where: { loteId: rl.loteId, recolhimentoId: { not: id }, recolhimento: { status: { in: [...ATIVOS] } } } });
    if (outro) {
      // outro recolhimento ativo ainda precisa do bloqueio: ele passa a ser o dono (e o cancelamento dele restaura o status original)
      if (!outro.bloqueadoPorEste) await tx.recolhimentoLote.update({ where: { id: outro.id }, data: { bloqueadoPorEste: true, statusAnterior: rl.statusAnterior } });
      continue;
    }
    const atual = await tx.lote.findUnique({ where: { id: rl.loteId }, select: { status: true } });
    if (atual?.status === "BLOQUEADO") {
      await tx.lote.update({ where: { id: rl.loteId }, data: { status: rl.statusAnterior } });
      desbloqueados.push(rl.lote.numero);
    }
  }
  await tx.recolhimento.update({ where: { id }, data: { status: "CANCELADO", canceladoEm: new Date(), canceladoPor: usuario, motivoCancelamento: motivo.trim() } });
  await log(tx, id, usuario, "CANCELAMENTO", `Cancelado: ${motivo.trim()}. Lote(s) desbloqueado(s): ${desbloqueados.length ? desbloqueados.join(", ") : "nenhum"}.`);
  return desbloqueados;
}

/** Lote ligado a algum recolhimento em andamento (não pode ser liberado por inspeção). */
export async function recolhimentoAtivoDoLote(c: Pick<Tx, "recolhimentoLote">, loteId: string) {
  const rl = await c.recolhimentoLote.findFirst({ where: { loteId, recolhimento: { status: { in: [...ATIVOS] } } }, select: { recolhimentoId: true } });
  return rl ? rl.recolhimentoId : null;
}
