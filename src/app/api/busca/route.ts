import { NextResponse } from "next/server";
import { exigirUsuarioRota } from "@/lib/auth";
import { db } from "@/lib/db";
import { NAV } from "@/components/nav";
import { criarLimitador, numeroDoDocumento, validarConsulta } from "@/lib/busca-util";
import type { Perfil } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const permitir = criarLimitador(30, 10_000); // 30 requisições a cada 10 s por usuário
const LIMITE = 4; // por tipo; o total devolvido fica em ~10

type Tipo = "produto" | "hospital" | "fornecedor" | "medico" | "cirurgia" | "pedido-venda" | "pedido-compra" | "lote" | "receber" | "pagar";
type Resultado = { tipo: Tipo; titulo: string; subtitulo: string; href: string };

/** Telas que o perfil enxerga no menu (mesma regra do layout). */
function telasDoPerfil(perfil: Perfil) {
  const hrefs = new Set<string>();
  for (const g of NAV) if (perfil === "ADMIN" || !g.perfis || g.perfis.includes(perfil)) for (const i of g.items) hrefs.add(i.href);
  return hrefs;
}

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const nome = (h: { razaoSocial: string; nomeFantasia: string | null }) => h.nomeFantasia || h.razaoSocial;

export async function GET(req: Request) {
  const user = await exigirUsuarioRota();
  if (user instanceof Response) return user;
  if (!permitir(user.id)) return NextResponse.json({ erro: "Muitas buscas seguidas. Aguarde alguns segundos." }, { status: 429 });
  const q = validarConsulta(new URL(req.url).searchParams.get("q"));
  if (!q) return NextResponse.json({ resultados: [] });

  const pode = telasDoPerfil(user.perfil);
  const tarefas: Promise<Resultado[]>[] = [];
  const quando = (href: string, fn: () => Promise<Resultado[]>) => {
    if (pode.has(href)) tarefas.push(fn().catch(() => []));
  };
  const nPV = numeroDoDocumento(q, "PV");
  const nPC = numeroDoDocumento(q, "PC");
  const nCIR = numeroDoDocumento(q, "CIR");

  quando("/cadastros/produtos", async () =>
    (await db.produto.findMany({ where: { OR: [{ codigo: ci(q) }, { descricao: ci(q) }, { registroAnvisa: ci(q) }, { gtin: ci(q) }] }, orderBy: { codigo: "asc" }, take: LIMITE, select: { id: true, codigo: true, descricao: true, registroAnvisa: true } })).map((p) => ({
      tipo: "produto", titulo: `${p.codigo} · ${p.descricao}`, subtitulo: p.registroAnvisa ? `ANVISA ${p.registroAnvisa}` : "Produto", href: `/cadastros/produtos/${p.id}`,
    })),
  );
  quando("/cadastros/hospitais", async () =>
    (await db.hospital.findMany({ where: { OR: [{ razaoSocial: ci(q) }, { nomeFantasia: ci(q) }, { cnpj: ci(q) }] }, orderBy: { razaoSocial: "asc" }, take: LIMITE, select: { id: true, razaoSocial: true, nomeFantasia: true, cidade: true, uf: true } })).map((h) => ({
      tipo: "hospital", titulo: nome(h), subtitulo: [h.cidade, h.uf].filter(Boolean).join("/") || "Hospital", href: `/cadastros/hospitais/${h.id}`,
    })),
  );
  quando("/cadastros/fornecedores", async () =>
    (await db.fornecedor.findMany({ where: { OR: [{ razaoSocial: ci(q) }, { nomeFantasia: ci(q) }, { cnpj: ci(q) }] }, orderBy: { razaoSocial: "asc" }, take: LIMITE, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } })).map((f) => ({
      tipo: "fornecedor", titulo: nome(f), subtitulo: `Fornecedor · ${f.cnpj}`, href: `/cadastros/fornecedores/${f.id}`,
    })),
  );
  quando("/cadastros/medicos", async () =>
    (await db.medico.findMany({ where: { OR: [{ nome: ci(q) }, { crm: ci(q) }] }, orderBy: { nome: "asc" }, take: LIMITE, select: { id: true, nome: true, crm: true, ufCrm: true, especialidade: true } })).map((m) => ({
      tipo: "medico", titulo: m.nome, subtitulo: `CRM ${m.crm}/${m.ufCrm}${m.especialidade ? ` · ${m.especialidade}` : ""}`, href: `/cadastros/medicos/${m.id}`,
    })),
  );
  quando("/comercial/cirurgias", async () =>
    (await db.cirurgia.findMany({ where: { OR: [{ paciente: ci(q) }, ...(nCIR !== null ? [{ numero: nCIR }] : [])] }, orderBy: { dataHora: "desc" }, take: LIMITE, select: { id: true, numero: true, paciente: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } } } })).map((c) => ({
      tipo: "cirurgia", titulo: `CIR-${c.numero} · ${c.paciente}`, subtitulo: nome(c.hospital), href: `/comercial/cirurgias/${c.id}`,
    })),
  );
  quando("/comercial/pedidos", async () =>
    (await db.pedidoVenda.findMany({ where: { OR: [{ numeroNf: ci(q) }, ...(nPV !== null ? [{ id: nPV }] : [])] }, orderBy: { id: "desc" }, take: LIMITE, select: { id: true, numeroNf: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } } } })).map((v) => ({
      tipo: "pedido-venda", titulo: `PV-${v.id}${v.numeroNf ? ` · NF ${v.numeroNf}` : ""}`, subtitulo: nome(v.hospital), href: `/comercial/pedidos/${v.id}`,
    })),
  );
  quando("/compras/pedidos", async () =>
    (await db.pedidoCompra.findMany({ where: { OR: [{ invoice: ci(q) }, ...(nPC !== null ? [{ id: nPC }] : [])] }, orderBy: { id: "desc" }, take: LIMITE, select: { id: true, invoice: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } })).map((c) => ({
      tipo: "pedido-compra", titulo: `PC-${c.id}${c.invoice ? ` · invoice ${c.invoice}` : ""}`, subtitulo: nome(c.fornecedor), href: `/compras/pedidos/${c.id}`,
    })),
  );
  quando("/qualidade/lotes", async () =>
    (await db.lote.findMany({ where: { OR: [{ numero: ci(q) }, { serie: ci(q) }] }, orderBy: { criadoEm: "desc" }, take: LIMITE, select: { id: true, numero: true, status: true, produto: { select: { codigo: true, descricao: true } } } })).map((l) => ({
      tipo: "lote", titulo: `Lote ${l.numero}`, subtitulo: `${l.produto.codigo} · ${l.produto.descricao} · ${l.status.toLowerCase().replace("_", " ")}`, href: `/qualidade/lotes/${l.id}`,
    })),
  );
  quando("/financeiro/receber", async () =>
    (await db.contaReceber.findMany({ where: { descricao: ci(q) }, orderBy: { vencimento: "desc" }, take: LIMITE, select: { id: true, descricao: true, status: true } })).map((c) => ({
      tipo: "receber", titulo: c.descricao, subtitulo: `A receber · ${c.status.toLowerCase()}`, href: `/financeiro/receber/${c.id}`,
    })),
  );
  quando("/financeiro/pagar", async () =>
    (await db.contaPagar.findMany({ where: { descricao: ci(q) }, orderBy: { vencimento: "desc" }, take: LIMITE, select: { id: true, descricao: true, status: true } })).map((c) => ({
      tipo: "pagar", titulo: c.descricao, subtitulo: `A pagar · ${c.status.toLowerCase()}`, href: `/financeiro/pagar/${c.id}`,
    })),
  );

  const grupos = await Promise.all(tarefas);
  // intercala os grupos para o topo mostrar variedade, e corta em 10
  const resultados: Resultado[] = [];
  for (let i = 0; i < LIMITE && resultados.length < 10; i++) for (const g of grupos) if (g[i] && resultados.length < 10) resultados.push(g[i]);
  return NextResponse.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
}
