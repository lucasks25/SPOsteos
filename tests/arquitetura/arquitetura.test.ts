import test from "node:test";
import assert from "node:assert/strict";
import { analisar, moduloDe, verificar } from "../../scripts/verificar-arquitetura";

const P = "src/app/(app)";

test("repositório: nenhuma violação nova de arquitetura e nenhuma exceção obsoleta", () => {
  const { novas, obsoletas } = verificar();
  const fmt = (x: { regra: string; de: string; para: string }) => `[${x.regra}] ${x.de} -> ${x.para}`;
  assert.deepEqual(novas.map(fmt), [], "violação nova: corrija o código (ver docs/ARQUITETURA.md), não acrescente exceção");
  assert.deepEqual(obsoletas.map(fmt), [], "exceção que não acontece mais: apague-a de scripts/arquitetura-excecoes.ts");
});

test("moduloDe: módulos, painel, kernel e shell", () => {
  assert.equal(moduloDe(`${P}/financeiro/_lib/titulos.ts`), "financeiro");
  assert.equal(moduloDe(`${P}/page.tsx`), "painel");
  assert.equal(moduloDe(`${P}/_painel/pendencias.ts`), "painel");
  assert.equal(moduloDe(`${P}/layout.tsx`), "shell");
  assert.equal(moduloDe("src/app/api/busca/route.ts"), "api");
  assert.equal(moduloDe("src/lib/datas.ts"), "lib");
  assert.equal(moduloDe("src/components/ui.tsx"), "components");
});

test("regras: público permitido; resto do módulo, UI cruzada, kernel→app, escrita alheia e ciclo são violações", () => {
  const v = analisar({
    arestas: [
      { de: `${P}/compras/_lib/recebimento.ts`, para: `${P}/financeiro/_lib/publico.ts` }, // ok
      { de: `${P}/compras/_lib/recebimento.ts`, para: "src/lib/estoque.ts" }, // ok (kernel)
      { de: `${P}/compras/_lib/recebimento.ts`, para: `${P}/financeiro/_lib/plano.ts` },
      { de: `${P}/gestao/abc/page.tsx`, para: `${P}/comercial/_components/filtros.tsx` },
      { de: "src/lib/pendencias.ts", para: `${P}/financeiro/_lib/painel.ts` },
      { de: "src/lib/x.ts", para: "src/components/icons.tsx" },
      { de: `${P}/financeiro/_lib/x.ts`, para: `${P}/compras/_lib/publico.ts` }, // fecha ciclo compras<->financeiro
    ],
    escritas: [
      { de: `${P}/financeiro/_lib/titulos.ts`, modelo: "contaPagar" }, // ok (dono)
      { de: `${P}/compras/_lib/recebimento.ts`, modelo: "contaPagar" },
    ],
  });
  const r = v.map((x) => `${x.regra}|${x.de}|${x.para}`).sort();
  assert.deepEqual(r, [
    "ciclo|compras, financeiro|*",
    `escrita-alheia|${P}/compras/_lib/recebimento.ts|contaPagar`,
    `kernel-importa-app|src/lib/pendencias.ts|${P}/financeiro/_lib/painel.ts`,
    "lib-importa-ui|src/lib/x.ts|src/components/icons.tsx",
    `modulo-cruzado|${P}/compras/_lib/recebimento.ts|${P}/financeiro/_lib/plano.ts`,
    `ui-cruzada|${P}/gestao/abc/page.tsx|${P}/comercial/_components/filtros.tsx`,
  ]);
});
