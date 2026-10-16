import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { problemasDatabaseUrl, problemasInfra, saltosProxyConfiavel } from "@/lib/infra-config";
import { ipDoCliente } from "@/lib/ip";
import { resumoErroParaLog } from "@/lib/log-seguro";
import { criarLimitador } from "@/lib/busca-util";
import { register } from "@/instrumentation";
import nextConfig from "../../next.config";

const OK_DB = "postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db.interno:5432/opme?schema=public&sslmode=require";

test("TRUST_PROXY: vazio/0 = nenhum proxy; 1 a 5 = saltos; o resto é inválido", () => {
  assert.equal(saltosProxyConfiavel(undefined), 0);
  assert.equal(saltosProxyConfiavel(""), 0);
  assert.equal(saltosProxyConfiavel("0"), 0);
  assert.equal(saltosProxyConfiavel("1"), 1);
  assert.equal(saltosProxyConfiavel(" 2 "), 2);
  for (const ruim of ["true", "-1", "6", "1.5", "abc", "99", "1,2"]) assert.equal(saltosProxyConfiavel(ruim), null, ruim);
});

test("DATABASE_URL: recusa opme:opme, senha igual ao usuário/fraca, falta de senha e falta de TLS", () => {
  assert.deepEqual(problemasDatabaseUrl(OK_DB), []);
  assert.deepEqual(problemasDatabaseUrl(undefined), [], "ausente: o cliente do banco já reclama");
  assert.match(problemasDatabaseUrl("postgresql://opme:opme@db.interno:5432/opme?sslmode=require").join(), /senha de exemplo/);
  assert.match(problemasDatabaseUrl("postgresql://app:postgres@db.interno/opme?sslmode=require").join(), /fraca/);
  assert.match(problemasDatabaseUrl("postgresql://app@db.interno/opme?sslmode=require").join(), /sem senha/);
  assert.match(problemasDatabaseUrl("postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db.interno/opme").join(), /sem TLS/);
  assert.match(problemasDatabaseUrl("postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db.interno/opme?sslmode=disable").join(), /sem TLS/);
  assert.match(problemasDatabaseUrl("postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db.interno/opme?sslmode=prefer").join(), /sem TLS/);
  assert.deepEqual(problemasDatabaseUrl("postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db.interno/opme?sslmode=verify-full"), []);
  assert.match(problemasDatabaseUrl("isto não é url").join(), /não é uma URL/);
  // banco no próprio host dispensa TLS; a válvula explícita também (rede privada)
  assert.deepEqual(problemasDatabaseUrl("postgresql://opme_app:Zk3-9fQ2mXv7LpA1@localhost:5432/opme"), []);
  assert.deepEqual(problemasDatabaseUrl("postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db:5432/opme", true), []);
  // a mensagem nunca vaza a senha
  assert.ok(!problemasDatabaseUrl("postgresql://opme:Zk3-9fQ2mXv7LpA1x@db/opme").join().includes("Zk3-9fQ2mXv7LpA1x"));
});

test("problemasInfra junta banco e TRUST_PROXY; ALLOW_INSECURE_DB=1 libera só o TLS", () => {
  assert.deepEqual(problemasInfra({ DATABASE_URL: OK_DB, TRUST_PROXY: "1" }), []);
  assert.equal(problemasInfra({ DATABASE_URL: OK_DB, TRUST_PROXY: "talvez" }).length, 1);
  assert.equal(problemasInfra({ DATABASE_URL: "postgresql://opme:opme@db/opme", TRUST_PROXY: "x" }).length, 3);
  assert.deepEqual(problemasInfra({ DATABASE_URL: "postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db/opme", ALLOW_INSECURE_DB: "1" }), []);
  assert.equal(problemasInfra({ DATABASE_URL: "postgresql://opme:opme@db/opme", ALLOW_INSECURE_DB: "1" }).length, 1, "opme:opme continua proibido");
});

test("IP do cliente: sem TRUST_PROXY o x-forwarded-for é ignorado; com N proxies vale a N-ésima entrada do fim", () => {
  assert.equal(ipDoCliente("203.0.113.9", undefined), null);
  assert.equal(ipDoCliente("203.0.113.9", "0"), null);
  assert.equal(ipDoCliente("203.0.113.9", "lixo"), null);
  assert.equal(ipDoCliente("203.0.113.9", "1"), "203.0.113.9");
  // cliente forjou 1.1.1.1; o proxy acrescentou o IP verdadeiro ao fim
  assert.equal(ipDoCliente("1.1.1.1, 203.0.113.9", "1"), "203.0.113.9");
  assert.equal(ipDoCliente("1.1.1.1, 203.0.113.9, 10.0.0.2", "2"), "203.0.113.9");
  assert.equal(ipDoCliente("2001:db8::1", "1"), "2001:db8::1");
  assert.equal(ipDoCliente("203.0.113.9", "2"), null, "menos entradas que proxies confiáveis");
  assert.equal(ipDoCliente("não-é-ip", "1"), null);
  assert.equal(ipDoCliente("203.0.113.9; DROP TABLE", "1"), null);
  assert.equal(ipDoCliente(null, "1"), null);
});

test("produção: DATABASE_URL insegura ou TRUST_PROXY inválido impede a subida (register lança)", () => {
  const env = process.env as Record<string, string | undefined>;
  const chaves = ["NEXT_RUNTIME", "NODE_ENV", "AUTH_SECRET", "DATABASE_URL", "TRUST_PROXY", "ALLOW_INSECURE_DB", "DATA_KEY"];
  const antes = Object.fromEntries(chaves.map((k) => [k, env[k]]));
  try {
    env.NEXT_RUNTIME = "nodejs";
    env.NODE_ENV = "production";
    env.AUTH_SECRET = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    env.DATA_KEY = "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1"; // exigida pelo register (cripto-config)
    delete env.ALLOW_INSECURE_DB;
    delete env.TRUST_PROXY;
    env.DATABASE_URL = OK_DB;
    assert.doesNotThrow(() => register());
    env.DATABASE_URL = "postgresql://opme:opme@db:5432/opme?sslmode=require";
    assert.throws(() => register(), /senha de exemplo/);
    env.DATABASE_URL = "postgresql://opme_app:Zk3-9fQ2mXv7LpA1@db:5432/opme";
    assert.throws(() => register(), /sem TLS/);
    env.DATABASE_URL = OK_DB;
    env.TRUST_PROXY = "sim";
    assert.throws(() => register(), /TRUST_PROXY inválido/);
    env.TRUST_PROXY = "1";
    assert.doesNotThrow(() => register());
    env.NODE_ENV = "development"; // fora de produção só avisa
    env.DATABASE_URL = "postgresql://opme:opme@localhost:5440/opme";
    const aviso = console.warn;
    console.warn = () => {};
    try { assert.doesNotThrow(() => register()); } finally { console.warn = aviso; }
  } finally {
    for (const k of chaves) { if (antes[k] === undefined) delete env[k]; else env[k] = antes[k]; }
  }
});

test("cabeçalhos de segurança do next.config: presentes, e sem CSP duplicada (a CSP com nonce é do proxy)", async () => {
  const regras = await nextConfig.headers!();
  const todos = regras.find((r) => r.source === "/:path*")!.headers;
  const mapa = new Map(todos.map((h) => [h.key, h.value]));
  assert.equal(mapa.get("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(mapa.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(mapa.get("X-DNS-Prefetch-Control"), "off");
  assert.equal(mapa.get("X-Frame-Options"), "DENY");
  assert.equal(mapa.get("X-Content-Type-Options"), "nosniff");
  assert.match(mapa.get("Strict-Transport-Security")!, /max-age=\d{8,}/);
  assert.ok(!mapa.get("Strict-Transport-Security")!.includes("preload"), "preload só com decisão explícita (docs/PRODUCAO-SEGURA.md)");
  for (const recurso of ["camera", "microphone", "geolocation", "payment", "usb"]) assert.match(mapa.get("Permissions-Policy")!, new RegExp(`${recurso}=\\(\\)`));
  assert.ok(!mapa.has("Content-Security-Policy"));
  assert.equal(nextConfig.poweredByHeader, false);
});

test("limitador em memória: estoura na janela e libera depois", () => {
  const permitir = criarLimitador(3, 1000);
  assert.deepEqual([1, 2, 3, 4].map(() => permitir("u", 0)), [true, true, true, false]);
  assert.equal(permitir("outro", 0), true, "chave independente");
  assert.equal(permitir("u", 1001), true);
});

test("git não versiona bancos de agentes, .env nem chaves", () => {
  const raiz = fileURLToPath(new URL("../..", import.meta.url));
  const arquivos = execFileSync("git", ["ls-files"], { cwd: raiz, encoding: "utf8" }).split("\n").filter(Boolean);
  const proibidos = arquivos.filter((f) => /(^|\/)(ruvector\.db|\.swarm\/|agentdb[^/]*|\.claude-flow\/)|\.rvf(\.|$)|\.pem$|\.key$|(^|\/)\.env(\.(?!example$).*)?$/.test(f));
  assert.deepEqual(proibidos, []);
});

test("log de erro: nome do paciente e valores da consulta do Prisma não vão para o log; código e pilha vão", () => {
  class PrismaClientKnownRequestError extends Error { code = "P2002"; meta = { target: ["cpf"] }; }
  const e = new PrismaClientKnownRequestError('Invalid `prisma.cirurgia.create()` invocation:\n data: { paciente: "Maria da Silva", carteirinha: "123456789" }');
  const r = resumoErroParaLog(e);
  assert.match(r, /P2002/);
  assert.match(r, /alvo=cpf/);
  assert.ok(!r.includes("Maria") && !r.includes("123456789"), r);
  const comum = resumoErroParaLog(new Error('falha ao gravar "Maria da Silva" no arquivo'));
  assert.ok(!comum.includes("Maria"), comum);
  assert.match(comum, /at /, "mantém a pilha para diagnóstico");
  assert.equal(resumoErroParaLog("texto solto com dados"), "valor lançado do tipo string");
});
