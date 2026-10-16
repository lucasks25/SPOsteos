import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Tamanho do pool do pg (o default do pg é 10, pouco para ~60 usuários). Inválido ou ausente = 20. */
export function tamanhoDoPool(valor = process.env.DATABASE_POOL_MAX) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 20;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: tamanhoDoPool(),
    // sem isto o pg espera para sempre por uma conexão livre; com o pool cheio a requisição falha com erro tratável
    connectionTimeoutMillis: 10_000,
  });
  // default do Prisma: maxWait 2 s e timeout 5 s, curtos sob carga (P2028); as travas FOR UPDATE esperam a vez
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 5_000, timeout: 10_000 } });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
