/**
 * Login (docs/REVISAO.md §19, achado S3): limite de tentativas resiste a rajada simultânea, mensagem única para
 * e-mail inexistente/senha errada/usuário inativo, sucesso limpa as falhas do e-mail.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apagarAuditoriaTeste } from "./_auditoria";
import { autenticar, MAX_FALHAS, MAX_FALHAS_IP, MSG_BLOQUEADO, MSG_INVALIDO, trocarSenha } from "@/lib/auth-login";

const SENHA = "senha-correta-123";
const email = (n: string) => `testedb-login-${n}@opme.local`;
let hash: string;

async function limpar() {
  await db.tentativaLogin.deleteMany({ where: { chave: { contains: "testedb-login-" } } });
  await db.tentativaLogin.deleteMany({ where: { chave: { startsWith: "ip:198.51.100." } } });
  const ids = (await db.usuario.findMany({ where: { email: { startsWith: "testedb-login-" } }, select: { id: true } })).map((u) => `senha:${u.id}`);
  await db.tentativaLogin.deleteMany({ where: { chave: { in: ids } } });
  // LogAuditoria é imutável (trigger) e a FK do autor é Restrict: apaga log e usuários de teste numa transação de manutenção
  await apagarAuditoriaTeste({ detalhes: { startsWith: "testedb-login-" } }, { email: { startsWith: "testedb-login-" } });
}
const mkUsuario = (n: string, ativo = true) => db.usuario.create({ data: { nome: `TESTEDB ${n}`, email: email(n), perfil: "COMERCIAL", senhaHash: hash, ativo } });

before(async () => {
  await limpar();
  hash = await bcrypt.hash(SENHA, 4); // custo baixo só no teste
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

test("rajada de 20 tentativas simultâneas: no máximo 5 chegam a conferir a senha", async () => {
  await mkUsuario("rajada");
  const r = await Promise.all(Array.from({ length: 20 }, (_, i) => autenticar(email("rajada"), `errada-${i}`, null)));
  const avaliadas = r.filter((x) => !x.ok && x.erro === MSG_INVALIDO).length;
  assert.ok(avaliadas <= MAX_FALHAS, `${avaliadas} senhas conferidas numa rajada (limite ${MAX_FALHAS})`);
  assert.equal(await db.tentativaLogin.count({ where: { chave: `email:${email("rajada")}` } }), avaliadas, "só as conferidas ficam como falha");
  for (let i = avaliadas; i < MAX_FALHAS; i++) await autenticar(email("rajada"), "errada", null);
  const certa = await autenticar(email("rajada"), SENHA, null);
  assert.deepEqual(certa, { ok: false, erro: MSG_BLOQUEADO }, "depois do limite nem a senha certa entra na janela");
});

test("limite por IP também segura senha espalhada por vários e-mails", async () => {
  const r = [];
  for (let i = 0; i < MAX_FALHAS_IP + 3; i++) r.push(await autenticar(email(`spray${i}`), "x", "198.51.100.7"));
  assert.equal(r.filter((x) => !x.ok && x.erro === MSG_INVALIDO).length, MAX_FALHAS_IP);
  assert.ok(r.slice(MAX_FALHAS_IP).every((x) => !x.ok && x.erro === MSG_BLOQUEADO));
});

test("revisão independente: IP compartilhado (escritório atrás de NAT) — erros de outros não bloqueiam quem acerta a senha", async () => {
  await mkUsuario("nat");
  for (let i = 0; i < MAX_FALHAS + 1; i++) await autenticar(email(`colega${i}`), "errada", "198.51.100.9");
  assert.equal((await autenticar(email("nat"), SENHA, "198.51.100.9")).ok, true);
});

test("mesma mensagem para e-mail inexistente, senha errada e usuário inativo; sucesso limpa as falhas", async () => {
  await mkUsuario("ok");
  await mkUsuario("inativo", false);
  assert.deepEqual(await autenticar(email("nao-existe"), SENHA, null), { ok: false, erro: MSG_INVALIDO });
  assert.deepEqual(await autenticar(email("ok"), "errada", null), { ok: false, erro: MSG_INVALIDO });
  assert.deepEqual(await autenticar(email("inativo"), SENHA, null), { ok: false, erro: MSG_INVALIDO });
  const ok = await autenticar(` ${email("ok").toUpperCase()} `, SENHA, null);
  assert.equal(ok.ok, true);
  assert.equal(await db.tentativaLogin.count({ where: { chave: `email:${email("ok")}` } }), 0);
});

test("tentativa bloqueada não prolonga o bloqueio (não grava falha nova)", async () => {
  await mkUsuario("prolonga");
  for (let i = 0; i < MAX_FALHAS; i++) await autenticar(email("prolonga"), "errada", null);
  const antes = await db.tentativaLogin.count({ where: { chave: `email:${email("prolonga")}` } });
  await autenticar(email("prolonga"), "errada", null);
  assert.equal(await db.tentativaLogin.count({ where: { chave: `email:${email("prolonga")}` } }), antes);
});

test("trocar a própria senha: exige a atual, limita tentativas, derruba as outras sessões e a nova vale no login", async () => {
  const u = await mkUsuario("troca");
  assert.deepEqual(await trocarSenha(u.id, SENHA, "curta"), { ok: false, erro: "A senha precisa ter pelo menos 10 caracteres.", campo: "nova" });
  assert.equal((await trocarSenha(u.id, SENHA, SENHA)).ok, false);
  assert.deepEqual(await trocarSenha(u.id, "errada", "nova-senha-forte-1"), { ok: false, erro: "Senha atual incorreta.", campo: "atual" });
  const r = await trocarSenha(u.id, SENHA, "nova-senha-forte-1");
  assert.ok(r.ok && r.sessaoVersao === u.sessaoVersao + 1, "sessaoVersao sobe: os cookies antigos deixam de valer");
  assert.equal((await autenticar(email("troca"), SENHA, null)).ok, false);
  assert.equal((await autenticar(email("troca"), "nova-senha-forte-1", null)).ok, true);
  for (let i = 0; i < MAX_FALHAS; i++) await trocarSenha(u.id, "errada", "outra-senha-forte-2");
  assert.deepEqual(await trocarSenha(u.id, "nova-senha-forte-1", "outra-senha-forte-2"), { ok: false, erro: MSG_BLOQUEADO });
});
