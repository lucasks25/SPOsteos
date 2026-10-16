/**
 * Guarda permanente de autorização (docs/REVISAO.md §19). Análise estática, sem banco:
 * 1. Toda função exportada de arquivo "use server" chama requireUser/requirePerfil no primeiro comando.
 * 2. Todo parâmetro que não é o estado anterior (ActionState) nem o FormData passa por argId/argInt/... (src/lib/auth-args.ts)
 *    ANTES de qualquer outro uso: o tipo TypeScript não vale em tempo de execução e um objeto-operador do Prisma
 *    ({ not: "" }) no lugar do id atinge todas as linhas num updateMany/deleteMany.
 * 3. Toda page.tsx autenticada e todo route.ts exige usuário.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const RAIZ = path.resolve(import.meta.dirname, "../../src");

function arquivos(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "generated") arquivos(p, out);
    } else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const rel = (f: string) => path.relative(RAIZ, f);
const todos = arquivos(RAIZ);
const useServer = todos.filter((f) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(readFileSync(f, "utf8")));

/** Ações públicas por natureza, com o motivo. Não acrescente sem revisão de segurança. */
const SEM_LOGIN: Record<string, string> = {
  "app/login/actions.ts#login": "é o próprio login",
  "app/login/actions.ts#logout": "usa getUser(); sem sessão só apaga o cookie",
  "lib/tema-actions.ts#definirTema": "grava só a preferência de tema num cookie; não lê nem grava dados",
  "app/login/actions.ts#confirmarCodigoLogin": "2ª etapa do login: exige o cookie assinado de senha conferida (lerMfaPendente) e o código",
  "app/login/actions.ts#cancelarCodigoLogin": "só apaga o cookie da 2ª etapa do login",
};

const VALIDADORES = new Set(["argId", "argIdOuNulo", "argInt", "argIntOuNulo", "argBool", "argEnum", "checkTipo"]);
// requireUserPendente: só nas telas de primeiro acesso (troca de senha provisória, cadastro do 2º fator obrigatório)
const EXIGE = /\b(requireUser|requireUserPendente|requirePerfil)\(/;

type Funcao = { arquivo: string; nome: string; no: ts.FunctionDeclaration; sf: ts.SourceFile };

function funcoesExportadas(lista = useServer): Funcao[] {
  const out: Funcao[] = [];
  for (const f of lista) {
    const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
    for (const n of sf.statements) {
      // `export default async function (id) {}` (sem nome) também vira action: antes escapava das checagens
      if (ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        out.push({ arquivo: rel(f), nome: n.name?.text ?? "default", no: n, sf });
      }
    }
  }
  return out;
}

/** Parâmetro "padrão" das actions: estado anterior do useActionState ou o FormData. */
function padrao(p: ts.ParameterDeclaration, sf: ts.SourceFile) {
  const tipo = p.type?.getText(sf) ?? "";
  return tipo === "ActionState" || tipo === "FormData";
}

/** Primeiro uso do identificador no corpo: tem de ser argumento de um validador. */
function primeiroUsoValidado(corpo: ts.Block, nome: string): boolean {
  let primeiro: ts.Identifier | null = null;
  const visita = (n: ts.Node) => {
    if (primeiro) return;
    // `id = argId(id)`: o primeiro identificador é o lado esquerdo; o que vale é a chamada à direita
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === nome) {
      visita(n.right);
      return;
    }
    if (ts.isIdentifier(n) && n.text === nome && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
      primeiro = n;
      return;
    }
    ts.forEachChild(n, visita);
  };
  visita(corpo);
  const id = primeiro as ts.Identifier | null;
  if (!id) return true; // parâmetro não usado
  const chamada = id.parent;
  return ts.isCallExpression(chamada) && ts.isIdentifier(chamada.expression) && VALIDADORES.has(chamada.expression.text) && chamada.arguments[0] === id;
}

test("existem Server Actions para verificar (o filtro de arquivos funciona)", () => {
  assert.ok(useServer.length >= 30, `só ${useServer.length} arquivos "use server"`);
});

test("toda Server Action exige usuário no primeiro comando", () => {
  const falhas: string[] = [];
  for (const { arquivo, nome, no, sf } of funcoesExportadas()) {
    if (SEM_LOGIN[`${arquivo}#${nome}`]) continue;
    const primeiro = no.body?.statements[0]?.getText(sf) ?? "";
    if (!EXIGE.test(primeiro)) falhas.push(`${arquivo}#${nome}`);
  }
  assert.deepEqual(falhas, [], `actions sem requireUser no primeiro comando:\n${falhas.join("\n")}`);
});

function falhasArgumentos(funcs: Funcao[]): string[] {
  const falhas: string[] = [];
  for (const { arquivo, nome, no, sf } of funcs) {
    for (const p of no.parameters) {
      if (!no.body) continue;
      const desc = `${arquivo}#${nome}(${p.name.getText(sf)}: ${p.type?.getText(sf) ?? "?"})`;
      // parâmetro desestruturado ({ id }) não tem como passar por argId antes do uso: antes era pulado em silêncio
      if (!ts.isIdentifier(p.name)) falhas.push(desc);
      // o "estado anterior" também vem do cliente sem validação: só pode existir se não for usado
      else if (p.type?.getText(sf) === "ActionState") {
        if (!primeiroUsoValidado(no.body, p.name.text)) falhas.push(desc);
      } else if (!padrao(p, sf) && !primeiroUsoValidado(no.body, p.name.text)) falhas.push(desc);
    }
  }
  return falhas;
}

function falhasExports(lista = useServer): string[] {
  const falhas: string[] = [];
  for (const f of lista) {
    const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
    for (const n of sf.statements) {
      // `export { x }`, `export { x } from "./y"`, `export *` e `export default x` publicam actions que as checagens acima não veem
      if ((ts.isExportDeclaration(n) && !n.isTypeOnly) || ts.isExportAssignment(n)) {
        falhas.push(`${rel(f)}: ${n.getText(sf).slice(0, 60)}`);
        continue;
      }
      const exportado = ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exportado || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) continue;
      const asyncFn = ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
      if (!asyncFn) falhas.push(`${rel(f)}: ${n.getText(sf).slice(0, 60)}`);
    }
  }
  return falhas;
}

test("todo argumento solto de Server Action é validado antes do primeiro uso", () => {
  const falhas = falhasArgumentos(funcoesExportadas());
  assert.deepEqual(falhas, [], `argumentos sem argId/argInt/... antes do uso:\n${falhas.join("\n")}`);
});

test("arquivos 'use server' só exportam funções async (nada de constante ou objeto exposto)", () => {
  assert.deepEqual(falhasExports(), []);
});

test("revisão independente: o guarda pega re-export, parâmetro desestruturado, estado anterior usado e default sem nome", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "guarda-"));
  try {
    const cab = `"use server";\nimport { requireUser } from "@/lib/auth";\nimport { db } from "@/lib/db";\n`;
    const reexp = path.join(dir, "reexport.ts");
    writeFileSync(reexp, `${cab}async function apagar(id: string) {\n  await requireUser();\n  await db.x.deleteMany({ where: { id } });\n}\nexport { apagar };\nexport { outra } from "./outra";\n`);
    const params = path.join(dir, "params.ts");
    writeFileSync(params, `${cab}export async function a({ id }: { id: string }) {\n  await requireUser();\n  await db.x.deleteMany({ where: { id } });\n}\nexport async function b(estado: ActionState, fd: FormData) {\n  await requireUser();\n  await db.x.deleteMany({ where: { id: estado.id } });\n}\nexport default async function (id: string) {\n  await db.x.deleteMany({ where: { id } });\n}\n`);
    assert.equal(falhasExports([reexp]).length, 2, "re-export não detectado");
    const funcs = funcoesExportadas([params]);
    assert.deepEqual(funcs.map((f) => f.nome), ["a", "b", "default"]);
    assert.equal(falhasArgumentos(funcs).length, 3, "argumento sem validação não detectado");
    const semLogin = funcs.filter(({ no, sf }) => !EXIGE.test(no.body?.statements[0]?.getText(sf) ?? "")).map((f) => f.nome);
    assert.deepEqual(semLogin, ["default"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("toda page.tsx autenticada e todo route.ts exige usuário", () => {
  const falhas = todos
    .filter((f) => (/\(app\)/.test(f) && /[/\\](page|layout)\.tsx$/.test(f)) || /[/\\]route\.ts$/.test(f))
    .filter((f) => !/\b(requireUser|requireUserPendente|exigirUsuarioRota)\(/.test(readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(falhas, []);
});
