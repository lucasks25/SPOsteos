/**
 * Guarda estática de acesso a dados em massa e de primeiro acesso:
 * - toda rota que devolve CSV passa por exportarCsv (auditoria: quem, qual relatório, quantas linhas, filtros);
 * - nenhum CSV leva nome de paciente (dado pessoal + de saúde: só nas telas, com perfil COMERCIAL/ADMIN);
 * - o download de anexo de cirurgia é auditado;
 * - requireUserPendente (sessão sem troca de senha / sem 2º fator) só existe nas telas de primeiro acesso.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
const todos = arquivos(RAIZ);
const rel = (f: string) => path.relative(RAIZ, f);
const rotas = todos.filter((f) => /[/\\]route\.ts$/.test(f));
const ehCsv = (txt: string) => /respostaCsv|text\/csv|\bcsv\(|exportarCsv/.test(txt);

test("existem rotas de CSV para verificar (o filtro funciona)", () => {
  assert.ok(rotas.filter((f) => ehCsv(readFileSync(f, "utf8"))).length >= 7);
});

test("toda rota que devolve CSV usa exportarCsv (auditada) e não monta CSV por fora", () => {
  const falhas = rotas
    .filter((f) => ehCsv(readFileSync(f, "utf8")))
    .filter((f) => {
      const t = readFileSync(f, "utf8");
      return !/exportarCsv\(/.test(t) || /respostaCsv|text\/csv|\bcsv\(/.test(t);
    })
    .map(rel);
  assert.deepEqual(falhas, [], `CSV sem auditoria:\n${falhas.join("\n")}`);
});

test("nenhum CSV exporta paciente", () => {
  const falhas = rotas.filter((f) => ehCsv(readFileSync(f, "utf8")) && /paciente/i.test(readFileSync(f, "utf8"))).map(rel);
  assert.deepEqual(falhas, []);
});

test("download de anexo de cirurgia (pode ter dado de saúde) é auditado", () => {
  const anexo = rotas.find((f) => /cirurgias[/\\]\[id\][/\\]anexos/.test(f));
  assert.ok(anexo, "rota de anexo não encontrada");
  assert.match(readFileSync(anexo, "utf8"), /audit\([^)]*"baixar anexo"/);
});

test("requireUserPendente só nas telas e actions de primeiro acesso (src/app/login)", () => {
  const usos = todos.filter((f) => /requireUserPendente\(/.test(readFileSync(f, "utf8"))).map(rel);
  const fora = usos.filter((f) => !f.startsWith(`app${path.sep}login${path.sep}`) && f !== path.join("lib", "auth.ts"));
  assert.deepEqual(fora, []);
});
