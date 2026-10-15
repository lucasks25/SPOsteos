import assert from "node:assert/strict";
import { test } from "node:test";
import { barrasITF } from "../../src/app/(app)/financeiro/_lib/barras";

test("ITF 2 de 5: largura fixa (44 dígitos = 405 módulos), início e fim padrão, rejeita ímpar e não numérico", () => {
  const b = barrasITF("34196161500012345671099871234580057721920000");
  assert.equal(b.largura, 4 + 22 * 18 + 5);
  assert.deepEqual(b.barras.slice(0, 2), [{ x: 0, w: 1 }, { x: 2, w: 1 }]); // início: barra fina, espaço, barra fina
  const ultima = b.barras[b.barras.length - 1];
  assert.equal(ultima.x + ultima.w, b.largura); // fim: barra larga, espaço fino, barra fina
  assert.throws(() => barrasITF("123"));
  assert.throws(() => barrasITF("12a4"));
  // dígito 0 = nnwwn: no par "00" as barras são n,n,w,w,n com espaços iguais
  const z = barrasITF("00");
  assert.deepEqual(z.barras.slice(2).map((x) => x.w), [1, 1, 3, 3, 1, 3, 1]); // 5 barras do par + fim (larga e fina)
});
