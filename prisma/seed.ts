import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Perfil } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Usuários de demonstração com senha fixa: nunca em produção.
if (process.env.NODE_ENV === "production") throw new Error("O seed cria usuários de demonstração e não pode rodar em produção. Crie o primeiro admin com: npm run admin:criar");
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "opme1234";
const addDays = (n: number) => new Date(Date.now() + n * 86400000);

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const usuarios: [string, string, Perfil][] = [
    ["Administrador", "admin@opme.local", "ADMIN"],
    ["Carla Comercial", "comercial@opme.local", "COMERCIAL"],
    ["Eduardo Estoque", "estoque@opme.local", "ESTOQUE"],
    ["Quésia Qualidade", "qualidade@opme.local", "QUALIDADE"],
    ["Caio Compras", "compras@opme.local", "COMPRAS"],
    ["Fernanda Financeiro", "financeiro@opme.local", "FINANCEIRO"],
  ];
  for (const [nome, email, perfil] of usuarios) {
    await db.usuario.upsert({ where: { email }, update: {}, create: { nome, email, perfil, senhaHash: hash } });
  }

  const locais = [
    { id: "local-deposito", nome: "Depósito central", tipo: "DEPOSITO" as const },
    { id: "local-quarentena", nome: "Quarentena", tipo: "QUARENTENA" as const },
    { id: "local-nao-conforme", nome: "Estoque não conforme", tipo: "NAO_CONFORME" as const },
  ];
  for (const l of locais) await db.localEstoque.upsert({ where: { id: l.id }, update: {}, create: l });

  if ((await db.produto.count()) > 0) {
    console.log("Dados de demonstração já existem — apenas usuários/locais garantidos.");
    return;
  }

  const [fabOrto, fabCardio, fabNeuro] = await Promise.all(
    ["OrtoMed Implantes", "CardioTech Dispositivos", "NeuroSpine Systems"].map((nome) => db.fabricante.create({ data: { nome, pais: "Brasil" } })),
  );

  const fornecedor = await db.fornecedor.create({
    data: { razaoSocial: "Distribuidora Exemplo de Materiais Médicos Ltda", nomeFantasia: "DistriMed", cnpj: "11.111.111/0001-11", cidade: "São Paulo", uf: "SP", afe: "1.00000-0" },
  });
  await db.fornecedor.create({
    data: { razaoSocial: "Importadora Exemplo Health S.A.", nomeFantasia: "ImpHealth", cnpj: "22.222.222/0001-22", cidade: "Campinas", uf: "SP" },
  });

  const tabela = await db.tabelaPreco.create({ data: { nome: "Tabela padrão 2026" } });

  const [h1, h2] = await Promise.all([
    db.hospital.create({ data: { razaoSocial: "Hospital Exemplo São Lucas S.A.", nomeFantasia: "Hosp. São Lucas", cnpj: "33.333.333/0001-33", cidade: "São Paulo", uf: "SP", tabelaPrecoId: tabela.id } }),
    db.hospital.create({ data: { razaoSocial: "Santa Casa Exemplo", nomeFantasia: "Santa Casa", cnpj: "44.444.444/0001-44", cidade: "Santos", uf: "SP", prazoPagamentoDias: 60, tabelaPrecoId: tabela.id } }),
  ]);
  for (const h of [h1, h2]) {
    await db.localEstoque.create({ data: { nome: `Consignado — ${h.nomeFantasia}`, tipo: "HOSPITAL", hospitalId: h.id } });
  }

  await db.medico.createMany({
    data: [
      { nome: "Dr. Ricardo Ortopedista", crm: "123456", ufCrm: "SP", especialidade: "Ortopedia" },
      { nome: "Dra. Paula Cardiologista", crm: "234567", ufCrm: "SP", especialidade: "Hemodinâmica" },
      { nome: "Dr. Marcos Neurocirurgião", crm: "345678", ufCrm: "SP", especialidade: "Neurocirurgia" },
    ],
  });
  await db.convenio.createMany({
    data: [{ nome: "Convênio Exemplo Saúde", registroAns: "000001" }, { nome: "Plano Exemplo Total", registroAns: "000002" }, { nome: "SUS" }],
  });
  await db.representante.createMany({
    data: [
      { nome: "João Representante", email: "joao@exemplo.com", comissaoPercent: 5 },
      { nome: "Marina Representante", email: "marina@exemplo.com", comissaoPercent: 4 },
    ],
  });

  const produtosData = [
    ["ORT-001", "Placa bloqueada rádio distal 2,4mm", fabOrto.id, 850, 1450, "III"],
    ["ORT-002", "Parafuso cortical 3,5mm x 20mm", fabOrto.id, 45, 120, "III"],
    ["ORT-003", "Haste intramedular femoral 11mm", fabOrto.id, 2300, 4200, "III"],
    ["ORT-004", "Prótese total de quadril não cimentada", fabOrto.id, 9800, 16500, "III"],
    ["ORT-005", "Âncora de sutura 5,0mm", fabOrto.id, 620, 1180, "III"],
    ["CAR-001", "Stent coronário farmacológico 3,0 x 18mm", fabCardio.id, 3200, 6900, "IV"],
    ["CAR-002", "Cateter balão PTCA 2,5 x 15mm", fabCardio.id, 780, 1650, "III"],
    ["CAR-003", "Introdutor arterial 6F", fabCardio.id, 95, 240, "II"],
    ["NEU-001", "Parafuso pedicular poliaxial 6,5 x 45mm", fabNeuro.id, 690, 1500, "III"],
    ["NEU-002", "Haste de titânio 5,5mm x 500mm", fabNeuro.id, 410, 980, "III"],
    ["NEU-003", "Cage intersomático PEEK lombar", fabNeuro.id, 2100, 4800, "III"],
  ] as const;

  const produtos = [];
  for (const [i, [codigo, descricao, fabricanteId, custo, preco, classe]] of produtosData.entries()) {
    const p = await db.produto.create({
      data: {
        codigo, descricao, fabricanteId, classeRisco: classe, custoMedio: custo, precoBase: preco,
        registroAnvisa: `80${String(100000000 + i * 7919).slice(0, 9)}`,
        validadeRegistro: addDays(i === 2 ? 45 : 365 * 3),
        gtin: `789${String(1000000000 + i * 1234567).slice(0, 10)}`,
        ncm: "9021.10.10", estoqueMinimo: 5,
      },
    });
    produtos.push(p);
    await db.tabelaPrecoItem.create({ data: { tabelaId: tabela.id, produtoId: p.id, preco } });
  }

  // Lotes liberados com saldo no depósito (entrada inicial)
  for (const [i, p] of produtos.entries()) {
    const validade = addDays(i === 1 ? 20 : i === 7 ? -5 : 400 + i * 30);
    const lote = await db.lote.create({
      data: { produtoId: p.id, numero: `L${2026}${String(i + 1).padStart(3, "0")}`, validade, fabricacao: addDays(-120), status: i === 7 ? "VENCIDO" : "LIBERADO" },
    });
    const qtd = i === 3 ? 3 : 20;
    await db.saldo.create({ data: { produtoId: p.id, loteId: lote.id, localId: "local-deposito", quantidade: qtd } });
    await db.movimento.create({
      data: { tipo: "ENTRADA", produtoId: p.id, loteId: lote.id, destinoId: "local-deposito", quantidade: qtd, custoUnit: p.custoMedio, documento: "SALDO-INICIAL", usuario: "seed" },
    });
  }

  // Um lote em quarentena aguardando inspeção
  const loteQ = await db.lote.create({ data: { produtoId: produtos[5].id, numero: "L2026Q01", validade: addDays(700), status: "QUARENTENA" } });
  await db.saldo.create({ data: { produtoId: produtos[5].id, loteId: loteQ.id, localId: "local-quarentena", quantidade: 10 } });
  await db.movimento.create({
    data: { tipo: "ENTRADA", produtoId: produtos[5].id, loteId: loteQ.id, destinoId: "local-quarentena", quantidade: 10, custoUnit: 3200, documento: "SALDO-INICIAL", usuario: "seed" },
  });

  const proc = await db.procedimento.create({
    data: {
      codigoTuss: "30725100", descricao: "Osteossíntese de fratura de rádio distal", especialidade: "Ortopedia",
      itens: { create: [{ produtoId: produtos[0].id, quantidade: 1 }, { produtoId: produtos[1].id, quantidade: 6 }] },
    },
  });
  await db.procedimento.create({
    data: { codigoTuss: "30912032", descricao: "Angioplastia coronária com implante de stent", especialidade: "Hemodinâmica", itens: { create: [{ produtoId: produtos[5].id, quantidade: 1 }, { produtoId: produtos[6].id, quantidade: 1 }, { produtoId: produtos[7].id, quantidade: 1 }] } },
  });
  await db.kit.create({
    data: { codigo: "KIT-RADIO", descricao: "Caixa rádio distal 2,4mm", itens: { create: [{ produtoId: produtos[0].id, quantidade: 2 }, { produtoId: produtos[1].id, quantidade: 10 }] } },
  });

  void proc;
  void fornecedor;
  console.log(`Seed concluído. Usuários de demonstração com senha "${DEMO_PASSWORD}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
