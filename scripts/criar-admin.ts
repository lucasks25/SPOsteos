/**
 * Prepara um banco novo (inclusive produção): cria os locais de estoque que o sistema exige e o primeiro administrador.
 * Uso:  ADMIN_EMAIL=voce@empresa.com ADMIN_NOME="Seu Nome" ADMIN_SENHA='uma-senha-longa' npm run admin:criar
 * A senha vem do ambiente para não ficar no histórico do shell se você a definir num arquivo; use 12+ caracteres.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const nome = (process.env.ADMIN_NOME ?? "").trim();
  const senha = process.env.ADMIN_SENHA ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Defina ADMIN_EMAIL com um e-mail válido.");
  if (nome.length < 3) throw new Error("Defina ADMIN_NOME.");
  if (senha.length < 12 || senha.length > 72) throw new Error("ADMIN_SENHA precisa ter de 12 a 72 caracteres.");

  const locais = [
    { id: "local-deposito", nome: "Depósito central", tipo: "DEPOSITO" as const },
    { id: "local-quarentena", nome: "Quarentena", tipo: "QUARENTENA" as const },
    { id: "local-nao-conforme", nome: "Estoque não conforme", tipo: "NAO_CONFORME" as const },
  ];
  for (const l of locais) await db.localEstoque.upsert({ where: { id: l.id }, update: {}, create: l });

  if (await db.usuario.findUnique({ where: { email } })) throw new Error(`Já existe um usuário com o e-mail ${email}.`);
  await db.usuario.create({ data: { nome, email, perfil: "ADMIN", senhaHash: await bcrypt.hash(senha, 12) } });
  console.log(`Administrador ${email} criado e locais de estoque garantidos. Crie os demais usuários em Administração > Usuários.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
