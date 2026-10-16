/**
 * 2º fator (src/lib/auth-mfa.ts) contra o banco: cadastro em duas etapas, login em duas etapas, código repetido
 * recusado (anti-replay), código de recuperação gasto uma vez só (também em pedidos simultâneos), bloqueio no 6º
 * código errado e admin zerando o 2º fator de outra pessoa (derruba as sessões). Usuários próprios "testedb-mfa-".
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apagarAuditoriaTeste } from "./_auditoria";
import { autenticar, MAX_FALHAS, MSG_BLOQUEADO } from "@/lib/auth-login";
import { cadastroPendente, confirmarCadastroMfa, iniciarCadastroMfa, regenerarCodigos, verificarSegundoFator, zerarMfaDeOutro } from "@/lib/auth-mfa";
import { deBase32, hotp, passoDe } from "@/lib/auth-totp";

const SENHA = "cavalo-correto-bateria";
const email = (n: string) => `testedb-mfa-${n}@opme.local`;
let hash: string;

async function limpar() {
  const ids = (await db.usuario.findMany({ where: { email: { startsWith: "testedb-mfa-" } }, select: { id: true } })).map((u) => u.id);
  await db.tentativaLogin.deleteMany({ where: { OR: [{ chave: { contains: "testedb-mfa-" } }, { chave: { in: ids.flatMap((id) => [`mfa:${id}`, `senha:${id}`]) } }] } });
  await apagarAuditoriaTeste({ usuarioId: { in: ids } }, { email: { startsWith: "testedb-mfa-" } });
}
const mkUsuario = (n: string) => db.usuario.create({ data: { nome: `TESTEDB ${n}`, email: email(n), perfil: "FINANCEIRO", senhaHash: hash } });

/** Cadastra e ativa o 2º fator; devolve a semente, o passo usado na ativação e os códigos de recuperação. */
async function ativar(userId: string) {
  assert.equal((await iniciarCadastroMfa(userId)).ok, true);
  const pend = await cadastroPendente(userId);
  assert.ok(pend, "chave pendente para mostrar na tela");
  const seg = deBase32(pend.chave);
  const passo = passoDe(Date.now());
  const r = await confirmarCadastroMfa(userId, hotp(seg, passo));
  assert.ok(r.ok, r.ok ? "" : r.erro);
  return { seg, passo, codigos: r.codigos, sessaoVersao: r.sessaoVersao };
}

before(async () => {
  await limpar();
  hash = await bcrypt.hash(SENHA, 4); // custo baixo só no teste
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

test("cadastro: chave pendente não vale até confirmar; código errado não ativa; confirmar ativa, gera 10 códigos e derruba as outras sessões", async () => {
  const u = await mkUsuario("cadastro");
  assert.equal((await iniciarCadastroMfa(u.id)).ok, true);
  const salvo = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
  assert.equal(salvo.mfaAtivadoEm, null, "pendente até confirmar");
  const pend = (await cadastroPendente(u.id))!;
  if (process.env.DATA_KEY) {
    assert.ok(salvo.mfaSegredo?.startsWith("enc:"), "semente cifrada com a DATA_KEY");
    assert.ok(!salvo.mfaSegredo?.includes(pend.chave.replace(/ /g, "")), "semente não fica em claro");
  }
  const errado = await confirmarCadastroMfa(u.id, "000000");
  assert.equal(errado.ok, false);
  const antes = await autenticar(email("cadastro"), SENHA, null);
  assert.ok(antes.ok && !antes.user.mfa, "cadastro pendente não pede código no login");
  const r = await confirmarCadastroMfa(u.id, hotp(deBase32(pend.chave), passoDe(Date.now())));
  assert.ok(r.ok);
  assert.equal(r.codigos.length, 10);
  assert.equal(r.sessaoVersao, u.sessaoVersao + 1, "sessões abertas sem 2º fator caem");
  const depois = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
  assert.ok(depois.mfaAtivadoEm);
  assert.equal(depois.mfaRecuperacao.length, 10);
  assert.ok(r.codigos.every((c) => !depois.mfaRecuperacao.includes(c)), "o banco guarda o resumo, não o código");
  assert.equal((await iniciarCadastroMfa(u.id)).ok, false, "não se gera chave nova por cima de um 2º fator ativo");
});

test("login em duas etapas: senha certa só avisa que falta o código; o código da ativação não vale de novo; o seguinte vale uma vez", async () => {
  const u = await mkUsuario("login");
  const { seg, passo } = await ativar(u.id);
  const l = await autenticar(email("login"), SENHA, null);
  assert.ok(l.ok && l.user.mfa, "autenticar sinaliza que falta o 2º fator");
  assert.equal((await verificarSegundoFator(u.id, hotp(seg, passo), "login")).ok, false, "código já usado na ativação (anti-replay)");
  assert.equal((await verificarSegundoFator(u.id, hotp(seg, passo + 1), "login")).ok, true);
  assert.equal((await verificarSegundoFator(u.id, hotp(seg, passo + 1), "login")).ok, false, "o mesmo código não vale duas vezes");
  assert.equal((await verificarSegundoFator(u.id, hotp(seg, passo - 5), "login")).ok, false, "código velho fora da janela");
  const falhas = await db.logAuditoria.count({ where: { usuarioId: u.id, acao: "2º fator falhou" } });
  assert.equal(falhas, 3, "cada código errado vai para a auditoria");
});

test("código de recuperação vale uma vez só, inclusive com dois pedidos simultâneos; regenerar invalida os antigos", async () => {
  const u = await mkUsuario("recuperacao");
  const { seg, passo, codigos } = await ativar(u.id);
  const r = await verificarSegundoFator(u.id, codigos[0].toLowerCase(), "login");
  assert.ok(r.ok && r.recuperacao && r.restantes === 9);
  assert.equal((await verificarSegundoFator(u.id, codigos[0], "login")).ok, false, "código gasto");
  const simultaneos = await Promise.all([verificarSegundoFator(u.id, codigos[1], "login"), verificarSegundoFator(u.id, codigos[1], "login")]);
  assert.equal(simultaneos.filter((x) => x.ok).length, 1, "dois pedidos ao mesmo tempo: só um gasta o código");
  const novos = await regenerarCodigos(u.id, hotp(seg, passo + 1));
  assert.ok(novos.ok && novos.codigos.length === 10);
  assert.equal((await verificarSegundoFator(u.id, codigos[2], "login")).ok, false, "código antigo deixa de valer");
  assert.equal((await verificarSegundoFator(u.id, novos.codigos[0], "login")).ok, true);
});

test(`${MAX_FALHAS} códigos errados em 15 min bloqueiam: o ${MAX_FALHAS + 1}º não é nem conferido, mesmo certo`, async () => {
  const u = await mkUsuario("bloqueio");
  const { codigos } = await ativar(u.id);
  for (let i = 0; i < MAX_FALHAS; i++) assert.deepEqual(await verificarSegundoFator(u.id, "999999", "login"), { ok: false, erro: "Código incorreto." });
  assert.deepEqual(await verificarSegundoFator(u.id, codigos[0], "login"), { ok: false, erro: MSG_BLOQUEADO });
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).mfaRecuperacao.length, 10, "bloqueado não gasta o código");
});

test("admin zera o 2º fator de outra pessoa (derruba as sessões dela); a própria conta não", async () => {
  const admin = await mkUsuario("admin");
  const u = await mkUsuario("zerar");
  const { sessaoVersao } = await ativar(u.id);
  assert.equal((await zerarMfaDeOutro(admin.id, admin.id)).ok, false);
  const r = await zerarMfaDeOutro(admin.id, u.id);
  assert.ok(r.ok && r.email === email("zerar"));
  const depois = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
  assert.deepEqual([depois.mfaSegredo, depois.mfaAtivadoEm, depois.mfaUltimoPasso, depois.mfaRecuperacao], [null, null, null, []]);
  assert.equal(depois.sessaoVersao, sessaoVersao + 1, "cookie antigo deixa de valer");
  const l = await autenticar(email("zerar"), SENHA, null);
  assert.ok(l.ok && !l.user.mfa, "no próximo acesso entra só com a senha e é levada ao cadastro (perfil FINANCEIRO)");
});
