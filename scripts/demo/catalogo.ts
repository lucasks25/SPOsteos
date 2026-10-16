/**
 * Dados fixos (cadastros) da carga de demonstração, alinhados ao catálogo público da SP OSTEOS (docs/ALINHAMENTO-SPOSTEOS.md §1 e §4):
 * coluna, biológicos, descartáveis (dor, endoscopia, vertebroplastia) e instrumentais. Marcas do catálogo; PREÇOS, fornecedores,
 * hospitais, subdistribuidores, médicos e pacientes são FICTÍCIOS. CNPJ/CPF/GTIN com dígitos válidos.
 */
import { cnpj } from "./util";

export type FornKey = "IMPL" | "BIOL" | "DESC" | "ENDO" | "MEDL";
export type FabKey = "BAVI" | "SEAS" | "BEST" | "SPGD" | "CURA" | "FZIO" | "SAES" | "EVER" | "CLEA" | "MDL" | "MEDI";

export const FABRICANTES: { key: FabKey; nome: string; pais: string | null }[] = [
  { key: "BAVI", nome: "BAVI Spine", pais: null },
  { key: "SEAS", nome: "SeaSpine", pais: "Estados Unidos" },
  { key: "BEST", nome: "Best Medical", pais: "Alemanha" },
  { key: "SPGD", nome: "SpineGuard", pais: "França" },
  { key: "CURA", nome: "Curasan", pais: "Alemanha" },
  { key: "FZIO", nome: "FzioMed", pais: "Estados Unidos" },
  { key: "SAES", nome: "Saeshin", pais: "Coreia do Sul" },
  { key: "EVER", nome: "Evereast Medical", pais: null },
  { key: "CLEA", nome: "Clear Surgical", pais: null },
  { key: "MDL", nome: "MDL", pais: null },
  { key: "MEDI", nome: "Medica", pais: null },
];

export const FORNECEDORES: { key: FornKey; razao: string; fantasia: string; base: string; cidade: string; uf: string; email: string; tel: string; afe: string; importacao?: boolean }[] = [
  { key: "IMPL", razao: "Spinelink Importação e Comércio de Implantes Ltda", fantasia: "Spinelink", base: "69012345", cidade: "São Paulo", uf: "SP", email: "importacao@spinelink.com.br", tel: "(11) 3045-6600", afe: "8.05731-2", importacao: true },
  { key: "BIOL", razao: "Biocore Distribuidora de Biomateriais Ltda", fantasia: "Biocore", base: "63456789", cidade: "Campinas", uf: "SP", email: "pedidos@biocore.com.br", tel: "(19) 3255-4100", afe: "8.01877-6" },
  { key: "DESC", razao: "Medintra Comércio de Descartáveis Médicos Ltda", fantasia: "Medintra", base: "61234567", cidade: "Barueri", uf: "SP", email: "comercial@medintra.com.br", tel: "(11) 4166-2900", afe: "8.04912-3" },
  { key: "ENDO", razao: "Endotec Importação de Endoscopia Ltda", fantasia: "Endotec", base: "65789012", cidade: "São Paulo", uf: "SP", email: "vendas@endotec.com.br", tel: "(11) 3667-5120", afe: "8.03355-1" },
  { key: "MEDL", razao: "Medlog Distribuição Hospitalar Ltda", fantasia: "Medlog", base: "67890123", cidade: "Guarulhos", uf: "SP", email: "atendimento@medlog.com.br", tel: "(11) 2412-7300", afe: "8.02260-9" },
];

export type ProdDef = { cod: string; desc: string; ref: string; fab: FabKey; forn: FornKey; custo: number; preco: number; classe: string; ncm: string };
const IMPLANTE = "9021.10.20";
const DESCARTAVEL = "9018.39.99";
const INSTRUMENTAL = "9018.90.99";
export const PRODUTOS: ProdDef[] = [
  // Implantáveis: coluna
  { cod: "COL-1001", desc: "Parafuso pedicular poliaxial de titânio 5,5 x 40mm", ref: "BV-PP5540", fab: "BAVI", forn: "IMPL", custo: 750, preco: 2200, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1002", desc: "Parafuso pedicular poliaxial de titânio 6,5 x 45mm", ref: "BV-PP6545", fab: "BAVI", forn: "IMPL", custo: 800, preco: 2350, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1003", desc: "Parafuso pedicular percutâneo cânulado 6,5 x 45mm", ref: "BV-PC6545", fab: "BAVI", forn: "IMPL", custo: 1150, preco: 3350, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1004", desc: "Haste de titânio 5,5mm x 400mm", ref: "BV-HT55400", fab: "BAVI", forn: "IMPL", custo: 520, preco: 1500, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1005", desc: "Haste pré-curvada para fixação percutânea 5,5mm", ref: "BV-HP55", fab: "BAVI", forn: "IMPL", custo: 620, preco: 1800, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1006", desc: "Conector transverso ajustável (cross-link)", ref: "BV-CT01", fab: "BAVI", forn: "IMPL", custo: 1050, preco: 3000, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1007", desc: "Cage lombar de PEEK para TLIF 10mm", ref: "BV-CL10", fab: "BAVI", forn: "IMPL", custo: 2350, preco: 6900, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1008", desc: "Cage cervical Dicom de PEEK 7mm", ref: "BV-CD07", fab: "BAVI", forn: "IMPL", custo: 2150, preco: 6300, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1009", desc: "Cage cervical autobloqueante 6mm", ref: "BV-CA06", fab: "BAVI", forn: "IMPL", custo: 2650, preco: 7700, classe: "IV", ncm: IMPLANTE },
  { cod: "COL-1010", desc: "Placa cervical anterior de 2 níveis com parafusos", ref: "BV-PCA2", fab: "BAVI", forn: "IMPL", custo: 2800, preco: 8200, classe: "IV", ncm: IMPLANTE },
  { cod: "COL-1011", desc: "Cage lombar anterior ALIF Osteo Fusion", ref: "BV-ALIF", fab: "BAVI", forn: "IMPL", custo: 3850, preco: 11300, classe: "IV", ncm: IMPLANTE },
  { cod: "COL-1012", desc: "Parafuso para deformidade de coluna Daytona 6,5mm", ref: "SS-DT65", fab: "SEAS", forn: "IMPL", custo: 1800, preco: 5200, classe: "III", ncm: IMPLANTE },
  { cod: "COL-1013", desc: "Parafuso de massa lateral cervical posterior 3,5 x 14mm", ref: "BV-ML3514", fab: "BAVI", forn: "IMPL", custo: 550, preco: 1600, classe: "III", ncm: IMPLANTE },
  // Biológicos
  { cod: "BIO-2001", desc: "Cimento ósseo acrílico para vertebroplastia (VERT-MAXX)", ref: "EV-VM", fab: "EVER", forn: "BIOL", custo: 380, preco: 1100, classe: "III", ncm: "3006.40.19" },
  { cod: "BIO-2002", desc: "Enxerto de sulfato de cálcio granulado 10cc", ref: "CU-SCG10", fab: "CURA", forn: "BIOL", custo: 520, preco: 1450, classe: "III", ncm: "3006.10.90" },
  { cod: "BIO-2003", desc: "Enxerto de sulfato de cálcio em pó 5cc", ref: "CU-SCP05", fab: "CURA", forn: "BIOL", custo: 340, preco: 980, classe: "III", ncm: "3006.10.90" },
  { cod: "BIO-2004", desc: "Enxerto de fosfato de cálcio Nanogel 5cc", ref: "CU-NG05", fab: "CURA", forn: "BIOL", custo: 780, preco: 2150, classe: "III", ncm: "3006.10.90" },
  { cod: "BIO-2005", desc: "Hemostático absorvível StarSil", ref: "ME-SS5", fab: "MEDI", forn: "BIOL", custo: 190, preco: 560, classe: "II", ncm: "3006.60.00" },
  { cod: "BIO-2006", desc: "Ácido hialurônico Curavisc 2ml (seringa)", ref: "ME-CV2", fab: "MEDI", forn: "BIOL", custo: 140, preco: 420, classe: "III", ncm: "3004.90.99" },
  { cod: "BIO-2007", desc: "Barreira antiaderente de carboximetilcelulose (Interpose)", ref: "FZ-IP1", fab: "FZIO", forn: "BIOL", custo: 460, preco: 1300, classe: "III", ncm: "3006.10.90" },
  // Descartáveis: dor
  { cod: "DOR-3001", desc: "Kit descartável Block Pain para bloqueio", ref: "CL-BP", fab: "CLEA", forn: "DESC", custo: 85, preco: 260, classe: "II", ncm: DESCARTAVEL },
  { cod: "DOR-3002", desc: "Kit descartável Plex Block para bloqueio de plexo", ref: "CL-PB", fab: "CLEA", forn: "DESC", custo: 110, preco: 330, classe: "II", ncm: DESCARTAVEL },
  { cod: "DOR-3003", desc: "Cânula de radiofrequência 100mm ponta ativa 10mm", ref: "EV-RF100", fab: "EVER", forn: "DESC", custo: 240, preco: 690, classe: "III", ncm: DESCARTAVEL },
  { cod: "DOR-3004", desc: "Cânula de radiofrequência refrigerada", ref: "EV-RFR", fab: "EVER", forn: "DESC", custo: 520, preco: 1450, classe: "III", ncm: DESCARTAVEL },
  { cod: "DOR-3005", desc: "Kit Pain Disc para discectomia percutânea", ref: "MD-PD", fab: "MDL", forn: "DESC", custo: 650, preco: 1800, classe: "III", ncm: DESCARTAVEL },
  // Descartáveis: endoscopia de coluna
  { cod: "END-4001", desc: "Kit Desc Disc para discectomia endoscópica", ref: "SA-DD", fab: "SAES", forn: "ENDO", custo: 980, preco: 2700, classe: "III", ncm: DESCARTAVEL },
  { cod: "END-4002", desc: "Kit Maxcut para endoscopia de coluna", ref: "SA-MX", fab: "SAES", forn: "ENDO", custo: 760, preco: 2100, classe: "III", ncm: DESCARTAVEL },
  { cod: "END-4003", desc: "Kit El Spine para endoscopia de coluna", ref: "SA-ES", fab: "SAES", forn: "ENDO", custo: 1150, preco: 3100, classe: "III", ncm: DESCARTAVEL },
  { cod: "END-4004", desc: "Equipo de irrigação para endoscopia de coluna", ref: "BM-EI", fab: "BEST", forn: "ENDO", custo: 45, preco: 140, classe: "II", ncm: DESCARTAVEL },
  { cod: "END-4005", desc: "Aspirador descartável Chicagotip", ref: "BM-CT", fab: "BEST", forn: "ENDO", custo: 95, preco: 290, classe: "II", ncm: DESCARTAVEL },
  // Descartáveis: vertebroplastia e cifoplastia, apoio
  { cod: "VTP-5001", desc: "Kit Vertfix para vertebroplastia e cifoplastia", ref: "MD-VF", fab: "MDL", forn: "DESC", custo: 1350, preco: 3700, classe: "III", ncm: DESCARTAVEL },
  { cod: "VTP-5002", desc: "Kit de cânula para injeção de cimento", ref: "MD-CI", fab: "MDL", forn: "DESC", custo: 420, preco: 1200, classe: "III", ncm: DESCARTAVEL },
  { cod: "VTP-5003", desc: "Agulha de biópsia óssea Sample Trap", ref: "MD-ST", fab: "MDL", forn: "DESC", custo: 260, preco: 760, classe: "II", ncm: DESCARTAVEL },
  { cod: "DAP-6001", desc: "Sonda PediGuard para guia de parafuso pedicular", ref: "SG-PG", fab: "SPGD", forn: "IMPL", custo: 1800, preco: 4950, classe: "II", ncm: INSTRUMENTAL },
  { cod: "DAP-6002", desc: "Sistema de drenagem Neurodrain", ref: "ME-ND", fab: "MEDI", forn: "DESC", custo: 60, preco: 190, classe: "II", ncm: DESCARTAVEL },
  // Instrumentais
  { cod: "INS-7001", desc: "Pinça Kerrison para coluna", ref: "BM-KR", fab: "BEST", forn: "IMPL", custo: 520, preco: 1350, classe: "I", ncm: INSTRUMENTAL },
  { cod: "INS-7002", desc: "Cureta para endoscopia de coluna", ref: "BM-CU", fab: "BEST", forn: "IMPL", custo: 360, preco: 980, classe: "I", ncm: INSTRUMENTAL },
  { cod: "INS-7003", desc: "Endoscópio rígido para coluna 6mm", ref: "BM-EN6", fab: "BEST", forn: "IMPL", custo: 9800, preco: 22500, classe: "II", ncm: INSTRUMENTAL },
];

// Margem de distribuição: o custo de aquisição sobe 12% sobre a tabela-base acima (preço de venda fica).
for (const p of PRODUTOS) p.custo = Math.round((p.custo * 1.12) / 5) * 5;

export type TabKey = "PREM" | "PAD" | "SUB";
export const TABELAS: { key: TabKey; nome: string; fator: number }[] = [
  { key: "PREM", nome: "Tabela Rede Premium 2026", fator: 1 },
  { key: "PAD", nome: "Tabela padrão 2026", fator: 0.93 }, // já existe (seed): recebe os produtos novos
  { key: "SUB", nome: "Tabela Subdistribuidores 2026", fator: 0.78 },
];

/** Perfil de pagamento: atraso (dias após o vencimento) entre a e b; `nunca` = chance de o título não ser pago. */
export type Perfil = { a: number; b: number; nunca: number };
export type HospDef = {
  key: string; razao: string; fantasia: string; base: string; cidade: string; uf: string; bairro: string; endereco: string; cep: string;
  prazo: number; tabela: TabKey; peso: number; rep: string; pag: Perfil; existente?: boolean; sub?: boolean;
};
export const HOSPITAIS: HospDef[] = [
  { key: "VAUR", razao: "Hospital Vila Aurora S.A.", fantasia: "Hospital Vila Aurora", base: "45123789", cidade: "São Paulo", uf: "SP", bairro: "Moema", endereco: "Av. Ibirapuera, 2300", cep: "04029200", prazo: 30, tabela: "PREM", peso: 17, rep: "RODR", pag: { a: -2, b: 3, nunca: 0 } },
  { key: "SGAB", razao: "Hospital São Gabriel de Pinheiros Ltda", fantasia: "Hospital São Gabriel", base: "47890123", cidade: "São Paulo", uf: "SP", bairro: "Pinheiros", endereco: "Rua Fradique Coutinho, 640", cep: "05416010", prazo: 45, tabela: "PREM", peso: 15, rep: "PATR", pag: { a: 0, b: 6, nunca: 0 } },
  { key: "SLUC", razao: "Hospital São Lucas S.A.", fantasia: "Hosp. São Lucas", base: "46210398", cidade: "São Paulo", uf: "SP", bairro: "Bela Vista", endereco: "Av. Paulista, 1000", cep: "01310100", prazo: 30, tabela: "PAD", peso: 15, rep: "JOAO", pag: { a: 0, b: 8, nunca: 0 }, existente: true },
  { key: "SCEC", razao: "Hospital Santa Cecília do Tatuapé Ltda", fantasia: "Hospital Santa Cecília", base: "50321456", cidade: "São Paulo", uf: "SP", bairro: "Tatuapé", endereco: "Rua Serra de Botucatu, 410", cep: "03317000", prazo: 45, tabela: "PAD", peso: 12, rep: "JOAO", pag: { a: 3, b: 12, nunca: 0 } },
  { key: "SAND", razao: "Hospital Parque das Nações de Santo André Ltda", fantasia: "Hospital Parque das Nações", base: "52678901", cidade: "Santo André", uf: "SP", bairro: "Jardim", endereco: "Av. Portugal, 1120", cep: "09040001", prazo: 45, tabela: "PAD", peso: 12, rep: "MARI", pag: { a: 5, b: 20, nunca: 0 } },
  { key: "OSAS", razao: "Hospital Santa Luzia de Osasco S.A.", fantasia: "Hospital Santa Luzia", base: "54987210", cidade: "Osasco", uf: "SP", bairro: "Centro", endereco: "Av. dos Autonomistas, 905", cep: "06090010", prazo: 60, tabela: "PAD", peso: 9, rep: "MARI", pag: { a: 10, b: 35, nunca: 0.3 } },
  { key: "GUAR", razao: "Hospital São Vicente de Guarulhos Ltda", fantasia: "Hospital São Vicente", base: "56102347", cidade: "Guarulhos", uf: "SP", bairro: "Vila Augusta", endereco: "Rua Dom Pedro II, 330", cep: "07012020", prazo: 45, tabela: "PAD", peso: 8, rep: "JOAO", pag: { a: 5, b: 18, nunca: 0 } },
  { key: "SCAS", razao: "Irmandade Nossa Senhora do Monte - Santa Casa", fantasia: "Santa Casa", base: "43795120", cidade: "Santos", uf: "SP", bairro: "Vila Nova", endereco: "Rua Brás Cubas, 85", cep: "11013150", prazo: 60, tabela: "PAD", peso: 12, rep: "MARI", pag: { a: 15, b: 45, nunca: 0.3 }, existente: true },
  // Subdistribuidores (interior de SP, PR, MG, RJ, RS, BA e DF): venda direta, sem cirurgia
  { key: "SPIR", razao: "Ortoplan Distribuidora de Produtos Hospitalares Ltda", fantasia: "Ortoplan (Piracicaba)", base: "58341267", cidade: "Piracicaba", uf: "SP", bairro: "Centro", endereco: "Rua Governador Pedro de Toledo, 880", cep: "13400200", prazo: 30, tabela: "SUB", peso: 0, rep: "RODR", pag: { a: -1, b: 5, nunca: 0 }, sub: true },
  { key: "SCWB", razao: "Sulmed Subdistribuição de Implantes Ltda", fantasia: "Sulmed (Curitiba)", base: "59870312", cidade: "Curitiba", uf: "PR", bairro: "Batel", endereco: "Av. do Batel, 1650", cep: "80420090", prazo: 45, tabela: "SUB", peso: 0, rep: "PATR", pag: { a: 0, b: 10, nunca: 0 }, sub: true },
  { key: "SBHZ", razao: "Minas Spine Distribuição Ltda", fantasia: "Minas Spine (Belo Horizonte)", base: "60418725", cidade: "Belo Horizonte", uf: "MG", bairro: "Funcionários", endereco: "Av. Brasil, 2100", cep: "30140002", prazo: 45, tabela: "SUB", peso: 0, rep: "PATR", pag: { a: 3, b: 18, nunca: 0 }, sub: true },
  { key: "SRIO", razao: "Carioca Cirúrgica Distribuidora Ltda", fantasia: "Carioca Cirúrgica (Rio de Janeiro)", base: "62954018", cidade: "Rio de Janeiro", uf: "RJ", bairro: "Botafogo", endereco: "Rua Voluntários da Pátria, 190", cep: "22270010", prazo: 45, tabela: "SUB", peso: 0, rep: "RODR", pag: { a: 5, b: 25, nunca: 0.2 }, sub: true },
  { key: "SPOA", razao: "Gaúcha Implantes e Descartáveis Ltda", fantasia: "Gaúcha Implantes (Porto Alegre)", base: "64187530", cidade: "Porto Alegre", uf: "RS", bairro: "Moinhos de Vento", endereco: "Rua 24 de Outubro, 745", cep: "90510001", prazo: 60, tabela: "SUB", peso: 0, rep: "RODR", pag: { a: 0, b: 15, nunca: 0 }, sub: true },
  { key: "SSAL", razao: "Bahia Coluna Distribuidora Médica Ltda", fantasia: "Bahia Coluna (Salvador)", base: "66320741", cidade: "Salvador", uf: "BA", bairro: "Pituba", endereco: "Av. Manoel Dias da Silva, 1200", cep: "41830000", prazo: 60, tabela: "SUB", peso: 0, rep: "PATR", pag: { a: 10, b: 40, nunca: 0.3 }, sub: true },
  { key: "SBSB", razao: "Planalto Medical Distribuidora Ltda", fantasia: "Planalto Medical (Brasília)", base: "68453296", cidade: "Brasília", uf: "DF", bairro: "Asa Sul", endereco: "SGAS 915, Bloco B, sala 120", cep: "70390150", prazo: 45, tabela: "SUB", peso: 0, rep: "PATR", pag: { a: 2, b: 14, nunca: 0 }, sub: true },
];

export type Area = "COL" | "END" | "VTP" | "DOR";
export type MedDef = { key: string; nome: string; crm: string; esp: string; areas: Area[] };
export const MEDICOS: MedDef[] = [
  { key: "BARR", nome: "Dr. André Luiz Barreto", crm: "112358", esp: "Ortopedia - Coluna", areas: ["COL", "VTP"] },
  { key: "CORD", nome: "Dra. Helena Cordeiro", crm: "134279", esp: "Neurocirurgia", areas: ["COL", "VTP"] },
  { key: "TAVA", nome: "Dr. Henrique Tavares", crm: "98412", esp: "Ortopedia - Coluna", areas: ["COL", "END"] },
  { key: "FONS", nome: "Dr. Leonardo Fonseca", crm: "121870", esp: "Neurocirurgia", areas: ["COL"] },
  { key: "PACH", nome: "Dra. Mariana Pacheco", crm: "131562", esp: "Neurocirurgia", areas: ["COL", "END"] },
  { key: "ALME", nome: "Dr. Gustavo Almeida", crm: "126041", esp: "Ortopedia - Coluna (endoscopia)", areas: ["END", "COL"] },
  { key: "MEND", nome: "Dr. Eduardo Mendonça", crm: "95634", esp: "Ortopedia - Coluna (endoscopia)", areas: ["END"] },
  { key: "ABRI", nome: "Dr. Alexandre Brito", crm: "117733", esp: "Radiologia intervencionista", areas: ["VTP", "DOR"] },
  { key: "LPRA", nome: "Dra. Luciana Prado", crm: "109845", esp: "Anestesiologia - Dor", areas: ["DOR"] },
  { key: "MVID", nome: "Dr. Marcelo Vidal", crm: "140287", esp: "Anestesiologia - Dor", areas: ["DOR"] },
  { key: "RSOA", nome: "Dra. Renata Soares", crm: "104526", esp: "Anestesiologia - Dor", areas: ["DOR"] },
];

export const CONVENIOS_NOVOS = [
  { nome: "Vida Plena Saúde", registroAns: "301234" },
  { nome: "Mediplan Assistência Médica", registroAns: "312456" },
  { nome: "Previmed Seguros Saúde", registroAns: "345890" },
  { nome: "Bem Estar Planos de Saúde", registroAns: "356712" },
];
/** Nomes que substituem os "Exemplo" do seed. */
export const RENOMEAR_CONVENIOS: [string, string][] = [
  ["Convênio Exemplo Saúde", "Paulista Saúde Integral"],
  ["Plano Exemplo Total", "Total Care Planos de Saúde"],
];

export const REPRESENTANTES_NOVOS = [
  { key: "RODR", nome: "Rodrigo Albuquerque", base: "284615379", email: "rodrigo.albuquerque@repcomercial.com.br", tel: "(11) 98812-4410", pct: 5 },
  { key: "PATR", nome: "Patrícia Menezes", base: "391728564", email: "patricia.menezes@repcomercial.com.br", tel: "(11) 97733-2085", pct: 4.5 },
];

export type CentroKey = "COL" | "DOR" | "BIO" | "INS" | "SUB" | "EVT";
export type ProcDef = { key: string; tuss: string; desc: string; esp: string; area: Area; peso: number; centro: CentroKey; itens: [string, number][] };
export const PROCEDIMENTOS: ProcDef[] = [
  { key: "TLIF", tuss: "30715075", desc: "Artrodese lombar posterior com fixação pedicular e cage (TLIF)", esp: "Coluna", area: "COL", peso: 20, centro: "COL", itens: [["COL-1002", 4], ["COL-1004", 2], ["COL-1007", 1], ["BIO-2002", 1]] },
  { key: "PERC", tuss: "30715083", desc: "Fixação pedicular percutânea da coluna", esp: "Coluna", area: "COL", peso: 9, centro: "COL", itens: [["COL-1003", 4], ["COL-1005", 2]] },
  { key: "ACDF", tuss: "30715091", desc: "Artrodese cervical anterior com cage e placa (ACDF)", esp: "Coluna", area: "COL", peso: 10, centro: "COL", itens: [["COL-1008", 1], ["COL-1010", 1], ["BIO-2004", 1]] },
  { key: "ALIF", tuss: "30715105", desc: "Artrodese lombar anterior com cage (ALIF)", esp: "Coluna", area: "COL", peso: 7, centro: "COL", itens: [["COL-1011", 1], ["BIO-2002", 1], ["BIO-2005", 1]] },
  { key: "VTP", tuss: "30713030", desc: "Vertebroplastia percutânea", esp: "Coluna", area: "VTP", peso: 7, centro: "DOR", itens: [["VTP-5001", 1], ["VTP-5002", 1], ["BIO-2001", 2]] },
  { key: "CIFO", tuss: "30713049", desc: "Cifoplastia com balão", esp: "Coluna", area: "VTP", peso: 3, centro: "DOR", itens: [["VTP-5001", 2], ["VTP-5002", 1], ["BIO-2001", 2]] },
  { key: "ENDO", tuss: "30715148", desc: "Discectomia endoscópica de coluna", esp: "Coluna", area: "END", peso: 12, centro: "DOR", itens: [["END-4001", 1], ["END-4004", 1], ["END-4005", 1]] },
  { key: "BLOQ", tuss: "31403034", desc: "Bloqueio facetário ou peridural guiado para dor", esp: "Dor", area: "DOR", peso: 17, centro: "DOR", itens: [["DOR-3001", 1]] },
  { key: "RF", tuss: "31403085", desc: "Radiofrequência para dor facetária", esp: "Dor", area: "DOR", peso: 15, centro: "DOR", itens: [["DOR-3003", 2], ["DOR-3001", 1]] },
];

export const KITS: { codigo: string; desc: string; itens: [string, number][] }[] = [
  { codigo: "KIT-TLIF", desc: "Caixa de implantes TLIF 1 nível", itens: [["COL-1002", 6], ["COL-1004", 2], ["COL-1007", 2]] },
  { codigo: "KIT-ENDO", desc: "Caixa de endoscopia de coluna", itens: [["END-4001", 1], ["END-4004", 2], ["END-4005", 2]] },
  { codigo: "KIT-DOR-RF", desc: "Caixa de radiofrequência para dor", itens: [["DOR-3003", 4], ["DOR-3001", 2]] },
];

export const CENTROS: { codigo: CentroKey; nome: string }[] = [
  { codigo: "COL", nome: "Coluna - implantes" },
  { codigo: "DOR", nome: "Dor e endoscopia" },
  { codigo: "BIO", nome: "Biológicos" },
  { codigo: "INS", nome: "Instrumentais e locação" },
  { codigo: "SUB", nome: "Subdistribuidores" },
  { codigo: "EVT", nome: "Eventos e educação continuada" },
];

export const NOMES = ["Marcos", "Ana", "Carlos", "Beatriz", "Roberto", "Luciana", "Paulo", "Sandra", "José", "Teresa", "Antônio", "Márcia", "Francisco", "Vera", "João", "Cláudia", "Sérgio", "Regina", "Renato", "Denise", "Eduardo", "Silvia", "Alberto", "Rosana", "Wagner", "Elaine", "Cássio", "Fátima", "Otávio", "Neusa", "Gilberto", "Marta", "Lauro", "Irene", "Valter", "Nair", "Heitor", "Dulce", "Ivan", "Selma"];
export const SOBRENOMES = ["Albuquerque", "Barros", "Cavalcanti", "Duarte", "Esteves", "Ferraz", "Gouveia", "Holanda", "Ibrahim", "Junqueira", "Klein", "Lacerda", "Machado", "Nascimento", "Oliveira", "Prado", "Queiroz", "Ribeiro", "Siqueira", "Teixeira", "Uchoa", "Vasconcelos", "Werneck", "Xavier", "Yamamoto", "Zanetti", "Amaral", "Braga", "Camargo", "Dantas", "Egídio", "Fontes", "Guedes", "Honorato", "Ishii", "Jardim", "Leite", "Moraes", "Nogueira", "Pimentel"];
