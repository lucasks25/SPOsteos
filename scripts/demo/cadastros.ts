/** Higienização dos dados antigos e criação dos cadastros da demonstração. */
import { localDoHospital } from "@/lib/estoque";
import { isCnpj } from "@/lib/documentos-br";
import {
  CENTROS, CONVENIOS_NOVOS, FABRICANTES, FORNECEDORES, HOSPITAIS, KITS, MEDICOS, PRODUTOS, PROCEDIMENTOS, REPRESENTANTES_NOVOS, RENOMEAR_CONVENIOS, TABELAS,
} from "./catalogo";
import { conta, type Ctx } from "./ctx";
import { addD, cnpj, cpf, dia, ean13, r2 } from "./util";

/** Tira a cara de teste dos dados que já existiam no banco (nunca mexe em LogAuditoria). Idempotente. */
export async function higienizar(c: Ctx) {
  const { tx } = c;
  for (const h of HOSPITAIS.filter((x) => x.existente)) {
    const atual = await tx.hospital.findFirst({ where: { nomeFantasia: h.fantasia } });
    if (!atual) continue;
    await tx.hospital.update({
      where: { id: atual.id },
      data: { razaoSocial: h.razao, cnpj: cnpj(h.base), endereco: h.endereco, bairro: h.bairro, cep: h.cep, cidade: h.cidade, uf: h.uf, email: atual.email ?? `faturamento@${h.key.toLowerCase()}.com.br`, telefone: atual.telefone ?? "(11) 3300-4000", prazoPagamentoDias: h.prazo },
    });
  }
  const forns: [string, string, string][] = [
    ["Distribuidora Exemplo de Materiais Médicos Ltda", "Distribuidora MedSul de Materiais Médicos Ltda", cnpj("58341267")],
    ["Importadora Exemplo Health S.A.", "Importadora Atlântica Health S.A.", cnpj("59870312")],
  ];
  for (const [de, para, doc] of forns) await tx.fornecedor.updateMany({ where: { razaoSocial: de }, data: { razaoSocial: para, cnpj: doc } });
  for (const [de, para] of RENOMEAR_CONVENIOS) await tx.convenio.updateMany({ where: { nome: de }, data: { nome: para } });
  await tx.convenio.updateMany({ where: { nome: "SUS" }, data: { exigeAutorizacao: false } });
  const meds: [string, string][] = [
    ["Dr. Ricardo Ortopedista", "Dr. Ricardo Valente"],
    ["Dra. Paula Cardiologista", "Dra. Paula Siqueira"],
    ["Dr. Marcos Neurocirurgião", "Dr. Marcos Andrade"],
  ];
  for (const [de, para] of meds) await tx.medico.updateMany({ where: { nome: de }, data: { nome: para } });
  await tx.representante.updateMany({ where: { nome: "João Representante" }, data: { nome: "João Batista Pereira", email: "joao.pereira@repcomercial.com.br" } });
  await tx.representante.updateMany({ where: { nome: "Marina Representante" }, data: { nome: "Marina Duarte Lopes", email: "marina.lopes@repcomercial.com.br" } });

  // "DEMO " no começo de descrições e nomes (títulos, lançamentos, contas, plano, centro de custo)
  await tx.$executeRaw`UPDATE "ContaPagar" SET "descricao" = regexp_replace("descricao", '^DEMO[[:space:]]+', '') WHERE "descricao" LIKE 'DEMO %'`;
  await tx.$executeRaw`UPDATE "ContaReceber" SET "descricao" = regexp_replace("descricao", '^DEMO[[:space:]]+', '') WHERE "descricao" LIKE 'DEMO %'`;
  await tx.$executeRaw`UPDATE "Lancamento" SET "descricao" = regexp_replace("descricao", '^DEMO[[:space:]]+', '') WHERE "descricao" LIKE 'DEMO %'`;
  await tx.$executeRaw`UPDATE "PlanoConta" SET "nome" = regexp_replace("nome", '^DEMO[[:space:]]+', '') WHERE "nome" LIKE 'DEMO %'`;
  await tx.$executeRaw`UPDATE "ContaBancaria" SET "nome" = regexp_replace("nome", '^DEMO[[:space:]]+', '') WHERE "nome" LIKE 'DEMO %'`;
  // titular = dados reais da empresa (src/lib/empresa.ts)
  await tx.$executeRaw`UPDATE "ContaBancaria" SET "titularNome" = 'SP OSTEOS DISTRIBUIDORA DE PRODUTOS PARA A SAUDE LTDA', "titularCnpj" = '19.966.249/0001-84' WHERE "tipo" = 'BANCO' AND "titularNome" IS NOT NULL`;
  // fora da linha da SP OSTEOS (cardiologia e ortopedia/trauma do seed): inativos, não usados em cirurgias novas. NEU-* (coluna) continua ativo.
  await tx.produto.updateMany({ where: { OR: [{ codigo: { startsWith: "CAR-" } }, { codigo: { startsWith: "ORT-" } }] }, data: { ativo: false } });
  await tx.$executeRaw`UPDATE "ContaBancaria" SET "nome" = 'Itaú c/c 72192-0 (operacional)' WHERE "nome" = 'Itaú c/c 72192-0'`;

  // paciente da CIR-2 (só esse campo)
  await tx.cirurgia.updateMany({ where: { paciente: "Paciente Teste E2E" }, data: { paciente: "Cláudio Roberto Fontes" } });
}

async function acharOuCriar<T extends { id: string }>(achar: () => Promise<T | null>, criar: () => Promise<T>): Promise<T> {
  return (await achar()) ?? criar();
}

/** Linha de produto (docs/ALINHAMENTO-SPOSTEOS.md §4) pelo código do produto. */
function linhaDo(cod: string): string {
  const n = Number(cod.slice(4));
  if (cod.startsWith("COL-")) return n === 1012 ? "COL-DEF" : n >= 1007 && n <= 1011 ? "COL-CAGE" : "COL-FIX";
  if (cod.startsWith("BIO-")) return n === 2001 ? "BIO-CIM" : n <= 2004 ? "BIO-ENX" : n === 2006 ? "BIO-VIS" : "BIO-HEM";
  if (cod.startsWith("DAP-")) return "COL-DESC";
  return cod.slice(0, cod.indexOf("-")); // DOR, END, VTP, INS
}

export async function criarCadastros(c: Ctx) {
  const { tx } = c;
  const linhas = new Map((await tx.linhaProduto.findMany({ select: { id: true, codigo: true } })).map((l) => [l.codigo, l.id]));
  // os 3 produtos NEU-* do seed são de coluna: entram na linha de fixação/cages
  for (const [cod, linha] of [["NEU-001", "COL-FIX"], ["NEU-002", "COL-FIX"], ["NEU-003", "COL-CAGE"]] as const) {
    if (linhas.has(linha)) await tx.produto.updateMany({ where: { codigo: cod, linhaId: null }, data: { linhaId: linhas.get(linha) } });
  }

  // usuários do seed
  const emails: Record<keyof Ctx["u"], string> = { admin: "admin@opme.local", comercial: "comercial@opme.local", estoque: "estoque@opme.local", qualidade: "qualidade@opme.local", compras: "compras@opme.local", financeiro: "financeiro@opme.local" };
  for (const k of Object.keys(emails) as (keyof Ctx["u"])[]) {
    const u = await tx.usuario.findUniqueOrThrow({ where: { email: emails[k] }, select: { id: true, nome: true } });
    c.u[k] = u;
  }

  // fabricantes e fornecedores
  const fabId = new Map<string, string>();
  for (const f of FABRICANTES) {
    const x = await acharOuCriar(() => tx.fabricante.findFirst({ where: { nome: f.nome } }), () => tx.fabricante.create({ data: { nome: f.nome, pais: f.pais } }));
    fabId.set(f.key, x.id);
    conta(c, "Fabricante", 1);
  }
  for (const f of FORNECEDORES) {
    const doc = cnpj(f.base);
    const x = await acharOuCriar(
      () => tx.fornecedor.findUnique({ where: { cnpj: doc } }),
      () => tx.fornecedor.create({ data: { razaoSocial: f.razao, nomeFantasia: f.fantasia, cnpj: doc, email: f.email, telefone: f.tel, cidade: f.cidade, uf: f.uf, afe: f.afe } }),
    );
    c.forn.set(f.key, x.id);
    conta(c, "Fornecedor", 1);
  }

  // tabelas de preço
  const tabId = new Map<string, string>();
  for (const t of TABELAS) {
    const x = await acharOuCriar(() => tx.tabelaPreco.findFirst({ where: { nome: t.nome } }), () => tx.tabelaPreco.create({ data: { nome: t.nome } }));
    tabId.set(t.key, x.id);
  }

  // hospitais
  for (const h of HOSPITAIS) {
    let x = await tx.hospital.findFirst({ where: { nomeFantasia: h.fantasia } });
    if (!x) {
      x = await tx.hospital.create({
        data: {
          razaoSocial: h.razao, nomeFantasia: h.fantasia, cnpj: cnpj(h.base), cidade: h.cidade, uf: h.uf, bairro: h.bairro, endereco: h.endereco, cep: h.cep,
          prazoPagamentoDias: h.prazo, tabelaPrecoId: tabId.get(h.tabela), email: `faturamento@${h.key.toLowerCase()}.com.br`, telefone: h.sub ? "(19) 3400-5000" : "(11) 3300-4000",
        },
      });
      conta(c, h.sub ? "Subdistribuidor (cadastro)" : "Hospital", 1);
    }
    if (!h.sub) await localDoHospital(tx, x.id);
    c.hosp.set(h.key, { id: x.id, def: h });
  }

  // médicos, convênios, representantes
  for (const m of MEDICOS) {
    const x = await acharOuCriar(
      () => tx.medico.findUnique({ where: { crm_ufCrm: { crm: m.crm, ufCrm: "SP" } } }),
      () => tx.medico.create({ data: { nome: m.nome, crm: m.crm, ufCrm: "SP", especialidade: m.esp } }),
    );
    c.med.set(m.key, x.id);
    conta(c, "Médico", 1);
  }
  for (const v of CONVENIOS_NOVOS) {
    const x = await acharOuCriar(() => tx.convenio.findFirst({ where: { nome: v.nome } }), () => tx.convenio.create({ data: v }));
    c.conv.set(v.nome, x.id);
    conta(c, "Convênio", 1);
  }
  for (const nome of ["Paulista Saúde Integral", "Total Care Planos de Saúde", "SUS"]) {
    const x = await tx.convenio.findFirst({ where: { nome } });
    if (x) c.conv.set(nome, x.id);
  }
  for (const r of REPRESENTANTES_NOVOS) {
    const x = await acharOuCriar(
      () => tx.representante.findFirst({ where: { nome: r.nome } }),
      () => tx.representante.create({ data: { nome: r.nome, cpfCnpj: cpf(r.base), email: r.email, telefone: r.tel, comissaoPercent: r.pct } }),
    );
    c.rep.set(r.key, x.id);
    conta(c, "Representante", 1);
  }
  const joao = await tx.representante.findFirst({ where: { nome: "João Batista Pereira" } });
  const mari = await tx.representante.findFirst({ where: { nome: "Marina Duarte Lopes" } });
  if (joao) c.rep.set("JOAO", joao.id);
  if (mari) c.rep.set("MARI", mari.id);

  // centros de custo (o "DEMO Centro Coluna" antigo vira Coluna)
  for (const ct of CENTROS) {
    let x = await tx.centroCusto.findUnique({ where: { codigo: ct.codigo } });
    if (!x && ct.codigo === "COL") x = await tx.centroCusto.findUnique({ where: { codigo: "DEMO" } });
    if (x) x = await tx.centroCusto.update({ where: { id: x.id }, data: { codigo: ct.codigo, nome: ct.nome } });
    else x = await tx.centroCusto.create({ data: ct });
    c.centro.set(ct.codigo, x.id);
  }
  for (const p of await tx.planoConta.findMany({ select: { id: true, codigo: true } })) c.plano.set(p.codigo, p.id);

  // produtos e preços nas tabelas
  const hoje = c.hoje;
  const tabFator = new Map(TABELAS.map((t) => [t.key, t.fator]));
  for (const [i, p] of PRODUTOS.entries()) {
    const x = await tx.produto.create({
      data: {
        codigo: p.cod, descricao: p.desc, referencia: p.ref, fabricanteId: fabId.get(p.fab), linhaId: linhas.get(linhaDo(p.cod)) ?? null, origem: p.forn === "IMPL" ? 2 : 0, unidadeTributavel: "UN", classeRisco: p.classe, ncm: p.ncm,
        registroAnvisa: `80${String(102510000 + i * 37171).slice(0, 9)}`,
        validadeRegistro: p.cod === "VTP-5003" ? addD(hoje, 40) : addD(dia("2031-03-15"), i * 41),
        gtin: ean13(`789${String(100000000 + i * 1234567 + 55555).slice(0, 9)}`),
        custoMedio: 0, precoBase: p.preco, estoqueMinimo: 0,
      },
    });
    c.prod.set(p.cod, { id: x.id, cod: p.cod, desc: p.desc, custo: p.custo, preco: p.preco, forn: p.forn });
    for (const [k, fator] of tabFator) await tx.tabelaPrecoItem.create({ data: { tabelaId: tabId.get(k)!, produtoId: x.id, preco: r2(p.preco * fator) } });
    conta(c, "Produto", 1);
  }

  // procedimentos (materiais padrão) e kits
  for (const pr of PROCEDIMENTOS) {
    const x = await tx.procedimento.create({
      data: { codigoTuss: pr.tuss, descricao: pr.desc, especialidade: pr.esp, itens: { create: pr.itens.map(([cod, q]) => ({ produtoId: c.prod.get(cod)!.id, quantidade: q })) } },
    });
    c.proc.set(pr.key, { id: x.id, def: pr });
    conta(c, "Procedimento", 1);
  }
  for (const k of KITS) {
    await tx.kit.create({ data: { codigo: k.codigo, descricao: k.desc, itens: { create: k.itens.map(([cod, q]) => ({ produtoId: c.prod.get(cod)!.id, quantidade: q })) } } });
    conta(c, "Kit", 1);
  }
  void isCnpj;
}
