/**
 * Edição de usuário (docs/REVISAO.md §19, S7/S8) com um "tx" falso em memória (sem banco, para não mexer no ADMIN
 * de demonstração): nunca zera os ADMIN ativos; mudar perfil/desativar derruba as sessões; a trava de linha é pedida.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { editarUsuarioTx } from "@/app/(app)/admin/_lib/usuarios-servico";

type U = { id: string; email: string; nome: string; perfil: string; ativo: boolean; sessaoVersao: number };

function fakeTx(usuarios: U[]) {
  const travas: string[] = [];
  const tx = {
    $queryRaw: async (partes: TemplateStringsArray) => {
      travas.push(partes.join("?"));
      return [];
    },
    usuario: {
      findUnique: async ({ where }: { where: { id: string } }) => { const u = usuarios.find((x) => x.id === where.id); return u ? { ...u } : null; },
      count: async ({ where }: { where: { perfil: string; ativo: boolean; id: { not: string } } }) =>
        usuarios.filter((u) => u.perfil === where.perfil && u.ativo === where.ativo && u.id !== where.id.not).length,
      update: async ({ where, data }: { where: { id: string }; data: Partial<U> & { sessaoVersao?: { increment: number } } }) => {
        const u = usuarios.find((x) => x.id === where.id)!;
        const { sessaoVersao, ...resto } = data;
        Object.assign(u, resto);
        if (sessaoVersao) u.sessaoVersao += sessaoVersao.increment;
        return { ...u };
      },
    },
  };
  return { tx: tx as never, travas };
}

const mk = (id: string, perfil: string, ativo = true): U => ({ id, email: `${id}@x`, nome: id, perfil, ativo, sessaoVersao: 0 });

test("não deixa rebaixar nem desativar o último ADMIN ativo", async () => {
  const us = [mk("a", "ADMIN"), mk("b", "ADMIN", false), mk("c", "FINANCEIRO")];
  const { tx, travas } = fakeTx(us);
  await assert.rejects(editarUsuarioTx(tx, "outro-admin", "a", { nome: "a", perfil: "FINANCEIRO", ativo: true }), /último administrador/);
  await assert.rejects(editarUsuarioTx(tx, "outro-admin", "a", { nome: "a", perfil: "ADMIN", ativo: false }), /último administrador/);
  assert.match(travas[0], /FOR UPDATE/);
  assert.match(travas[0], /perfil = 'ADMIN' AND ativo/);
});

test("com outro ADMIN ativo, rebaixar passa e derruba as sessões do rebaixado", async () => {
  const us = [mk("a", "ADMIN"), mk("b", "ADMIN")];
  const { tx } = fakeTx(us);
  const r = await editarUsuarioTx(tx, "b", "a", { nome: "a", perfil: "COMERCIAL", ativo: true });
  assert.equal(r.mudou, "perfil: ADMIN → COMERCIAL");
  assert.equal(us[0].sessaoVersao, 1);
});

test("desativar derruba as sessões; só renomear não", async () => {
  const us = [mk("adm", "ADMIN"), mk("u", "ESTOQUE")];
  const { tx } = fakeTx(us);
  await editarUsuarioTx(tx, "adm", "u", { nome: "U novo", perfil: "ESTOQUE", ativo: true });
  assert.equal(us[1].sessaoVersao, 0);
  await editarUsuarioTx(tx, "adm", "u", { nome: "U novo", perfil: "ESTOQUE", ativo: false });
  assert.equal(us[1].sessaoVersao, 1, "sem isso, reativar no mesmo dia faria o cookie antigo voltar a valer");
});

test("admin não tira o próprio perfil nem se desativa", async () => {
  const { tx } = fakeTx([mk("a", "ADMIN"), mk("b", "ADMIN")]);
  await assert.rejects(editarUsuarioTx(tx, "a", "a", { nome: "a", perfil: "FINANCEIRO", ativo: true }), /própria conta/);
});
