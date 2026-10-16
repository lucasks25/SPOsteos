/**
 * Carga de dados de demonstração (histórico mai–out/2026, agenda futura, financeiro). Idempotente: se o produto SPN-1001
 * já existe, só repete a higienização de nomes. Tudo numa transação e pelos serviços reais (estoque, remessas, faturamento, títulos).
 *
 * Uso:  npx tsx scripts/demo-dados.ts     (ou npm run db:demo)
 * Os serviços importam "server-only"; por isso o script se reexecuta com a condição "react-server" (como os testes fazem).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

async function main() {
  if (!process.env.DEMO_REEXEC) {
    const r = spawnSync(process.execPath, [...process.execArgv, "--conditions=react-server", ...process.argv.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, DEMO_REEXEC: "1" },
    });
    process.exit(r.status ?? 1);
  }
  const { carregarDemo } = await import("./demo/carga");
  await carregarDemo();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
