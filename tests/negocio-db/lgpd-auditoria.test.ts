/**
 * LGPD no banco (docs/LGPD.md): LogAuditoria imutável (trigger), autor do log protegido (FK Restrict), auditoria de
 * leitura, carteirinha cifrada com índice cego, retenção de orçamentos e kardex sem nome de paciente.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { auditLeitura } from "@/lib/forms";
import { CTX_CARTEIRINHA, decifrar, estaCifrado, indicesBusca } from "@/lib/cripto";
import { salvarCirurgiaTx } from "@/app/(app)/comercial/_lib/cirurgia-servico";
import { registrarConsumoDiretoTx } from "@/app/(app)/comercial/_lib/consumo-servico";
import { localDoHospital, movimentar } from "@/lib/estoque";
import { anonimizarOrcamentos, limparPacienteDoKardex, mesesAntes } from "@/lib/lgpd-retencao";
import { dia, limparTudo, mkHospital, mkLote, mkProduto, P, uid } from "./_util";
import { apagarAuditoriaTeste } from "./_auditoria";

const K = "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1";
const env = process.env as Record<string, string | undefined>;
const chaveAntes = env.DATA_KEY;
let hospitalId: string;
let medicoId: string;
const orcIds: number[] = [];

async function limpar() {
  await db.orcamento.deleteMany({ where: { OR: [{ id: { in: orcIds } }, { observacao: { startsWith: P } }] } });
  await apagarAuditoriaTeste({ detalhes: { startsWith: P } }, { email: { startsWith: "testedb-lgpd-" } });
  await limparTudo();
}

before(async () => {
  await limpar();
  hospitalId = (await mkHospital()).id;
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
});
after(async () => {
  if (chaveAntes === undefined) delete env.DATA_KEY;
  else env.DATA_KEY = chaveAntes;
  await limpar();
  await db.$disconnect();
});

const novoLog = () => db.logAuditoria.create({ data: { acao: "teste", entidade: "Teste", detalhes: `${P} imutavel ${uid()}` } });

test("LogAuditoria: UPDATE, DELETE e TRUNCATE são recusados pelo banco", async () => {
  const log = await novoLog();
  await assert.rejects(db.logAuditoria.update({ where: { id: log.id }, data: { acao: "adulterado" } }), /imutável|UPDATE/);
  await assert.rejects(db.logAuditoria.updateMany({ where: { id: log.id }, data: { detalhes: "x" } }), /imutável|UPDATE/);
  await assert.rejects(db.logAuditoria.delete({ where: { id: log.id } }), /imutável|DELETE/);
  await assert.rejects(db.logAuditoria.deleteMany({ where: { id: log.id } }), /imutável|DELETE/);
  await assert.rejects(db.$executeRawUnsafe(`TRUNCATE "LogAuditoria"`), /imutável|TRUNCATE/);
  const relido = await db.logAuditoria.findUnique({ where: { id: log.id } });
  assert.equal(relido?.acao, "teste", "a linha ficou intacta");
});

test("exceção de manutenção vale só na transação que a liga (e só para o dono da tabela)", async () => {
  const log = await novoLog();
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('opme.manutencao_auditoria', 'off', true)`;
      await tx.logAuditoria.delete({ where: { id: log.id } });
    }),
    /imutável|DELETE/,
  );
  await apagarAuditoriaTeste({ id: log.id });
  assert.equal(await db.logAuditoria.count({ where: { id: log.id } }), 0);
  const outro = await novoLog();
  await assert.rejects(db.logAuditoria.delete({ where: { id: outro.id } }), /imutável|DELETE/, "fora da transação de manutenção volta a recusar");
});

test("usuário com histórico de auditoria não pode ser apagado (FK Restrict): o log nunca perde o autor", async () => {
  const u = await db.usuario.create({ data: { nome: "TESTEDB lgpd", email: `testedb-lgpd-${uid()}@opme.local`, senhaHash: "x", perfil: "COMERCIAL" } });
  await db.logAuditoria.create({ data: { usuarioId: u.id, acao: "teste", entidade: "Teste", detalhes: `${P} autor` } });
  await assert.rejects(db.usuario.delete({ where: { id: u.id } }));
  assert.ok(await db.usuario.findUnique({ where: { id: u.id } }));
});

test("auditLeitura grava 'visualizar' com a entidade (fora de requisição, sem marca de pré-carregamento)", async () => {
  const u = await db.usuario.create({ data: { nome: "TESTEDB lgpd", email: `testedb-lgpd-${uid()}@opme.local`, senhaHash: "x", perfil: "COMERCIAL" } });
  await auditLeitura(u.id, "Cirurgia", "cir-x", `${P} CIR-0`);
  const l = await db.logAuditoria.findFirst({ where: { usuarioId: u.id, acao: "visualizar" } });
  assert.equal(l?.entidade, "Cirurgia");
  assert.equal(l?.entidadeId, "cir-x");
  assert.equal(l?.detalhes, `${P} CIR-0`);
});

const base = () => ({ dataHora: dia(3), hospitalId, medicoId, paciente: `${P} Maria da Silva ${uid()}`, sus: false });

test("carteirinha: gravada cifrada com índice cego; a busca pelo índice acha; edição recifra; vazio limpa os dois", async () => {
  env.DATA_KEY = K;
  const { cirurgia: c } = await db.$transaction((tx) => salvarCirurgiaTx(tx, null, { ...base(), carteirinha: "0123.4567-89" }));
  const lida = await db.cirurgia.findUniqueOrThrow({ where: { id: c.id } });
  assert.ok(estaCifrado(lida.carteirinha) && !lida.carteirinha!.includes("4567"));
  assert.equal(decifrar(lida.carteirinha!, CTX_CARTEIRINHA), "0123.4567-89");
  const achadas = await db.cirurgia.findMany({ where: { carteirinhaHash: { in: indicesBusca("012345678 9", CTX_CARTEIRINHA) } }, select: { id: true } });
  assert.deepEqual(achadas.map((x) => x.id), [c.id], "busca normalizada (pontos/espaços) pelo índice");
  const { cirurgia: ed } = await db.$transaction((tx) => salvarCirurgiaTx(tx, c.id, { ...base(), paciente: lida.paciente, carteirinha: "0123.4567-89" }));
  assert.notEqual(ed.carteirinha, lida.carteirinha, "IV novo a cada gravação");
  assert.equal(ed.carteirinhaHash, lida.carteirinhaHash);
  const { cirurgia: vazia } = await db.$transaction((tx) => salvarCirurgiaTx(tx, c.id, { ...base(), paciente: lida.paciente, carteirinha: null }));
  assert.equal(vazia.carteirinha, null);
  assert.equal(vazia.carteirinhaHash, null);
});

test("sem DATA_KEY (fora de produção) a carteirinha é gravada em claro, sem índice: o script de migração cifra depois", async () => {
  delete env.DATA_KEY;
  const { cirurgia: c } = await db.$transaction((tx) => salvarCirurgiaTx(tx, null, { ...base(), carteirinha: "998877" }));
  assert.equal(c.carteirinha, "998877");
  assert.equal(c.carteirinhaHash, null);
});

test("retenção: só orçamento NÃO aprovado e vencido há mais de 6 meses perde o paciente", async () => {
  const agora = new Date();
  const velho = mesesAntes(agora, 7);
  const novo = mesesAntes(agora, 2);
  const mk = async (status: "RASCUNHO" | "ENVIADO" | "APROVADO" | "RECUSADO", criadoEm: Date, validade: Date | null) => {
    const o = await db.orcamento.create({ data: { hospitalId, status, criadoEm, validade, paciente: `${P} paciente ${status}`, observacao: `${P} retencao` } });
    orcIds.push(o.id);
    return o.id;
  };
  const recusadoVelho = await mk("RECUSADO", velho, null);
  const enviadoVencido = await mk("ENVIADO", velho, velho);
  const rascunhoSemValidade = await mk("RASCUNHO", velho, null);
  const aprovadoVelho = await mk("APROVADO", velho, velho);
  const recusadoNovo = await mk("RECUSADO", novo, null);
  const enviadoValido = await mk("ENVIADO", velho, novo);
  const escopo = { observacao: { startsWith: `${P} retencao` } };
  const r = await anonimizarOrcamentos(db, agora, 6, escopo);
  const anon = new Set((await db.orcamento.findMany({ where: { id: { in: orcIds }, paciente: null }, select: { id: true } })).map((o) => o.id));
  for (const id of [recusadoVelho, enviadoVencido, rascunhoSemValidade]) assert.ok(anon.has(id), `orçamento ${id} deveria ser anonimizado`);
  for (const id of [aprovadoVelho, recusadoNovo, enviadoValido]) assert.ok(!anon.has(id), `orçamento ${id} não deveria ser anonimizado`);
  assert.equal(r.count, 3);
  assert.equal((await anonimizarOrcamentos(db, agora, 6, escopo)).count, 0, "idempotente");
});

test("kardex: consumo direto não grava mais o nome do paciente; observação antiga é limpa pelo script", async () => {
  env.DATA_KEY = K;
  const prod = await mkProduto();
  const lote = await mkLote(prod.id);
  const { cirurgia: c } = await db.$transaction((tx) => salvarCirurgiaTx(tx, null, base()));
  await db.$transaction(async (tx) => {
    const local = await localDoHospital(tx, hospitalId);
    await movimentar(tx, { tipo: "ENTRADA", produtoId: prod.id, loteId: lote.id, quantidade: 2, origemId: null, destinoId: local, custoUnit: 0, documento: `${P}-ENT`, usuario: "teste" });
  });
  await db.$transaction((tx) => registrarConsumoDiretoTx(tx, { cirurgiaId: c.id, loteId: lote.id, quantidade: 1, usuario: "teste" }));
  const consumo = await db.movimento.findFirstOrThrow({ where: { loteId: lote.id, tipo: "CONSUMO" } });
  assert.equal(consumo.observacao, `Consumo direto na cirurgia CIR-${c.numero}`);
  assert.ok(!consumo.observacao!.includes(c.paciente));
  const antigo = await db.movimento.create({ data: { tipo: "AJUSTE", produtoId: prod.id, loteId: lote.id, quantidade: 0, documento: `CIR-${c.numero}`, observacao: `Consumo direto — paciente ${c.paciente}` } });
  assert.equal(await limparPacienteDoKardex(db, lote.id), 1);
  assert.equal((await db.movimento.findUniqueOrThrow({ where: { id: antigo.id } })).observacao, `Consumo direto na cirurgia CIR-${c.numero}`);
});
