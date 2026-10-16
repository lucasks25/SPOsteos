/**
 * Verificador de arquitetura (docs/ARQUITETURA.md, seção "Regras de dependência").
 *
 *   npm run arquitetura            → falha (exit 1) se houver violação nova ou exceção obsoleta
 *   npm run arquitetura -- --grafo → lista todas as importações entre módulos e as escritas cruzadas
 *
 * Regras:
 *   kernel-importa-app   src/lib ou src/components importando de src/app
 *   lib-importa-ui       src/lib importando de src/components
 *   modulo-cruzado       arquivo do módulo A importando arquivo do módulo B que não é o público de B
 *                        (B/_lib/publico.ts). Se os dois lados são .tsx, a regra vira "ui-cruzada".
 *   ciclo                ciclo entre módulos (inclusive via publico.ts); reportado como o conjunto de módulos do ciclo
 *   escrita-alheia       create/update/upsert/delete do Prisma em modelo cujo dono é outro módulo
 *
 * Exceções temporárias: ./arquitetura-excecoes.ts. Cada linha aponta um item do backlog. Uma exceção que
 * não acontece mais também FALHA (catraca): ao executar o item do backlog, apague a linha.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import ts from "typescript";
import { EXCECOES, type Excecao } from "./arquitetura-excecoes";

export type Regra = "kernel-importa-app" | "lib-importa-ui" | "modulo-cruzado" | "ui-cruzada" | "ciclo" | "escrita-alheia";
export type Violacao = { regra: Regra; de: string; para: string };

const RAIZ = resolve(__dirname, "..");
const SRC = join(RAIZ, "src");

/** Módulos de negócio (pastas de src/app/(app)) + pseudo-módulos. */
const MODULOS_NEGOCIO = ["admin", "cadastros", "comercial", "compras", "estoque", "financeiro", "gestao", "qualidade"];
const KERNEL = new Set(["lib", "components"]);
/** Arquivo público que cada módulo pode expor a outros módulos. */
const PUBLICO = "_lib/publico.ts";

/** Dono de cada modelo Prisma (quem pode escrever). Modelo ausente daqui = sem checagem. */
const DONO: Record<string, string[]> = {
  usuario: ["admin", "shell"], tentativaLogin: ["shell"], logAuditoria: ["lib"],
  fabricante: ["cadastros"], fornecedor: ["cadastros"], hospital: ["cadastros"], medico: ["cadastros"],
  convenio: ["cadastros"], procedimento: ["cadastros"], procedimentoItem: ["cadastros"],
  representante: ["cadastros"], produto: ["cadastros"],
  lote: ["qualidade"], inspecao: ["qualidade"], documento: ["qualidade"], documentoArquivo: ["qualidade"],
  recolhimento: ["qualidade"], recolhimentoLote: ["qualidade"], recolhimentoAlvo: ["qualidade"],
  recolhimentoPaciente: ["qualidade"], recolhimentoAcao: ["qualidade"],
  // Núcleo de estoque: saldo e kardex só por movimentar() (src/lib/estoque.ts).
  localEstoque: ["lib"], saldo: ["lib"], movimento: ["lib"],
  kit: ["estoque"], kitItem: ["estoque"], remessa: ["estoque"], remessaItem: ["estoque"],
  inventarioConsignacao: ["estoque"], inventarioConsignacaoItem: ["estoque"],
  tabelaPreco: ["comercial"], tabelaPrecoItem: ["comercial"], cirurgia: ["comercial"], cirurgiaConsumo: ["comercial"],
  autorizacaoConvenio: ["comercial"], autorizacaoItem: ["comercial"], anexo: ["comercial"],
  orcamento: ["comercial"], orcamentoItem: ["comercial"], pedidoVenda: ["comercial"], pedidoVendaItem: ["comercial"],
  pedidoCompra: ["compras"], pedidoCompraItem: ["compras"], pedidoCompraDespesa: ["compras"],
  contaReceber: ["financeiro"], contaPagar: ["financeiro"], contaBancaria: ["financeiro"], lancamento: ["financeiro"],
  transferencia: ["financeiro"], extratoLinha: ["financeiro"], remessaPagamento: ["financeiro"],
  remessaPagamentoItem: ["financeiro"], planoConta: ["financeiro"], centroCusto: ["financeiro"], glosa: ["financeiro"],
  fechamentoMes: ["financeiro"], remessaCobranca: ["financeiro"], remessaCobrancaItem: ["financeiro"],
  cobrancaEvento: ["financeiro"],
};

const posix = (p: string) => p.split(sep).join("/");

export function moduloDe(rel: string): string {
  if (rel.startsWith("src/generated/")) return "generated";
  if (rel.startsWith("src/lib/") || rel === "src/proxy.ts") return "lib";
  if (rel.startsWith("src/components/")) return "components";
  const m = rel.match(/^src\/app\/\(app\)\/([^/]+)\//);
  if (m) return m[1] === "_painel" ? "painel" : m[1];
  if (/^src\/app\/\(app\)\/page\.tsx$/.test(rel)) return "painel";
  if (rel.startsWith("src/app/api/")) return "api";
  if (rel.startsWith("src/app/")) return "shell";
  return "outro";
}

function listar(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome.startsWith(".") || nome === "generated" || nome === "node_modules") continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) listar(p, out);
    else if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function resolver(origem: string, espec: string): string | null {
  let base: string;
  if (espec.startsWith("@/")) base = join(SRC, espec.slice(2));
  else if (espec.startsWith(".")) base = resolve(dirname(origem), espec);
  else return null; // pacote externo
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

export type Grafo = { arestas: { de: string; para: string }[]; escritas: { de: string; modelo: string }[] };

export function lerGrafo(): Grafo {
  const arestas: Grafo["arestas"] = [];
  const escritas: Grafo["escritas"] = [];
  const reEscrita = /\b(?:tx|db|prisma|t)\.([a-z][A-Za-z]+)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g;
  for (const arq of listar(SRC)) {
    const texto = readFileSync(arq, "utf8");
    const de = posix(relative(RAIZ, arq));
    for (const imp of ts.preProcessFile(texto, true, true).importedFiles) {
      const alvo = resolver(arq, imp.fileName);
      if (alvo) arestas.push({ de, para: posix(relative(RAIZ, alvo)) });
    }
    for (const m of texto.matchAll(reEscrita)) escritas.push({ de, modelo: m[1] });
  }
  return { arestas, escritas };
}

const ehUi = (rel: string) => rel.endsWith(".tsx");
const ehApp = (mod: string) => !KERNEL.has(mod) && mod !== "generated" && mod !== "outro";

export function analisar(g: Grafo): Violacao[] {
  const v: Violacao[] = [];
  const grafoMod = new Map<string, Set<string>>();
  for (const { de, para } of g.arestas) {
    const a = moduloDe(de), b = moduloDe(para);
    if (a === b || b === "generated") continue;
    if (KERNEL.has(a) && ehApp(b)) { v.push({ regra: "kernel-importa-app", de, para }); continue; }
    if (a === "lib" && b === "components") { v.push({ regra: "lib-importa-ui", de, para }); continue; }
    if (KERNEL.has(b)) continue;
    if (MODULOS_NEGOCIO.includes(b)) {
      if (!grafoMod.has(a)) grafoMod.set(a, new Set());
      grafoMod.get(a)!.add(b);
      if (para !== `src/app/(app)/${b}/${PUBLICO}`) {
        v.push({ regra: ehUi(de) && ehUi(para) ? "ui-cruzada" : "modulo-cruzado", de, para });
      }
    }
  }
  // Um componente fortemente conexo: os módulos listados dependem uns dos outros (direta ou indiretamente).
  for (const comp of ciclos(grafoMod)) v.push({ regra: "ciclo", de: comp.join(", "), para: "*" });
  for (const { de, modelo } of g.escritas) {
    const donos = DONO[modelo];
    if (donos && !donos.includes(moduloDe(de))) v.push({ regra: "escrita-alheia", de, para: modelo });
  }
  // dedup
  const vistos = new Set<string>();
  return v.filter((x) => { const k = chave(x); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/** Componentes fortemente conexos (Tarjan) com mais de um módulo, normalizados (começam pelo menor nome). */
function ciclos(g: Map<string, Set<string>>): string[][] {
  let i = 0; const idx = new Map<string, number>(), low = new Map<string, number>(), pilha: string[] = [], na = new Set<string>();
  const out: string[][] = [];
  const visitar = (n: string) => {
    idx.set(n, i); low.set(n, i); i++; pilha.push(n); na.add(n);
    for (const w of g.get(n) ?? []) {
      if (!idx.has(w)) { visitar(w); low.set(n, Math.min(low.get(n)!, low.get(w)!)); }
      else if (na.has(w)) low.set(n, Math.min(low.get(n)!, idx.get(w)!));
    }
    if (low.get(n) === idx.get(n)) {
      const comp: string[] = []; let w: string;
      do { w = pilha.pop()!; na.delete(w); comp.push(w); } while (w !== n);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const n of g.keys()) if (!idx.has(n)) visitar(n);
  return out;
}

const chave = (x: { regra: string; de: string; para: string }) => `${x.regra}|${x.de}|${x.para}`;

export function verificar(g = lerGrafo(), excecoes: readonly Excecao[] = EXCECOES) {
  const violacoes = analisar(g);
  const permitidas = new Set(excecoes.map(chave));
  const novas = violacoes.filter((x) => !permitidas.has(chave(x)));
  const atuais = new Set(violacoes.map(chave));
  const obsoletas = excecoes.filter((e) => !atuais.has(chave(e)));
  return { violacoes, novas, obsoletas };
}

function main() {
  const g = lerGrafo();
  if (process.argv.includes("--grafo")) {
    for (const { de, para } of g.arestas) {
      const a = moduloDe(de), b = moduloDe(para);
      const relevante = !KERNEL.has(b) || (a === "lib" && b === "components");
      if (a !== b && b !== "generated" && relevante) console.log(`${a} -> ${b}\t${de} -> ${para}`);
    }
    for (const { de, modelo } of g.escritas) {
      const donos = DONO[modelo];
      if (donos && !donos.includes(moduloDe(de))) console.log(`ESCRITA ${moduloDe(de)} -> ${modelo}\t${de}`);
    }
    return;
  }
  const { violacoes, novas, obsoletas } = verificar(g);
  if (process.argv.includes("--excecoes")) {
    // Gera o corpo da lista de exceções a partir do estado atual (uso: congelar a dívida existente).
    for (const x of violacoes) console.log(`  { regra: "${x.regra}", de: "${x.de}", para: "${x.para}", item: "ARQ-?" },`);
    return;
  }
  for (const x of novas) console.error(`VIOLAÇÃO [${x.regra}] ${x.de} -> ${x.para}`);
  for (const x of obsoletas) console.error(`EXCEÇÃO OBSOLETA [${x.regra}] ${x.de} -> ${x.para} (item ${x.item}): apague-a de scripts/arquitetura-excecoes.ts`);
  const ok = novas.length === 0 && obsoletas.length === 0;
  console.log(`${ok ? "OK" : "FALHOU"}: ${violacoes.length} violações conhecidas (exceções temporárias), ${novas.length} novas, ${obsoletas.length} exceções obsoletas.`);
  if (!ok) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) main();
