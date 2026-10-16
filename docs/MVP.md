# Sistema de Gestão OPME — MVP (15/10/2026)

Sistema para distribuidoras/importadoras de OPME (órteses, próteses e materiais especiais): do cadastro à cirurgia, remessa em consignação, faturamento, recebimento de compra, qualidade e financeiro completo com integração bancária por arquivo (Itaú).

## O que o MVP entrega

| Módulo | Perfil | Funciona |
|---|---|---|
| **Cadastros** | todos leem; cada perfil edita o seu | produtos, fabricantes, fornecedores (dados bancários só do financeiro), hospitais, médicos, convênios, procedimentos (materiais padrão), representantes |
| **Comercial** | COMERCIAL | cirurgias com anexos, agenda semanal, orçamentos (preço da tabela do hospital), tabelas de preço com vigência, pedidos de venda, registrar NF, comissões e margem |
| **Estoque** | ESTOQUE | saldos por local, kardex, remessas/vales em consignação com FEFO (enviar, conferir retorno, consumo, cancelar), kits, ajustes e perdas |
| **Qualidade** | QUALIDADE | quarentena/inspeção, lotes e validades, rastreabilidade, registros ANVISA |
| **Compras** | COMPRAS | sugestão de compra, pedidos, recebimento por item (lote, validade, quarentena, custo médio, gera conta a pagar) |
| **Financeiro** | FINANCEIRO | cobrança dos hospitais (boleto Itaú CNAB 400), aprovação de contas a pagar, contas a receber/pagar (baixa parcial, juros, multa, desconto, glosa, estorno), contas bancárias e caixa, transferências, fluxo de caixa, conciliação (OFX e CNAB 240 Itaú), pagamentos SISPAG (TED, crédito Itaú, boleto, Pix por chave), plano de contas e centros de custo, DRE gerencial por competência, relatórios de aging com CSV, classificar pendentes, fechamento de mês |
| **Gestão** | COMERCIAL, ESTOQUE, COMPRAS, FINANCEIRO | curva ABC, giro e cobertura de estoque, margem por produto/hospital/representante, vencimentos, vendas por mês (CSV) |
| **Importação** | COMPRAS | pedido de importação com moeda, câmbio, despesas aduaneiras rateadas e custo nacionalizado no recebimento |
| **Administração** | ADMIN | usuários, perfis, redefinir senha, log de auditoria |
| **Painel** | todos | indicadores por perfil |

Fluxo ponta a ponta já testado: cirurgia → remessa de consignado → conferência → faturar → NF → conta a receber → conciliação do extrato → DRE.

## Como instalar do zero (produção)

1. Postgres 17 acessível. Crie `.env` a partir de `.env.example`: `DATABASE_URL` e `AUTH_SECRET` (`openssl rand -hex 32`; o sistema recusa segredo curto ou de exemplo).
2. `npm ci && npx prisma migrate deploy` (cria as tabelas e o plano de contas padrão).
3. `ADMIN_EMAIL=... ADMIN_NOME="..." ADMIN_SENHA='12+ caracteres' npm run admin:criar` (cria os locais de estoque e o primeiro administrador). **Não use `db:seed` em produção**: ele cria usuários de demonstração e se recusa a rodar com `NODE_ENV=production`.
4. `npm run build && npm start` atrás de HTTPS (proxy que sobrescreve `x-forwarded-for`). Anexos de cirurgia ficam em `storage/uploads/` (volume persistente com backup; fora de `public/`).
5. Entre como administrador e crie os usuários dos perfis em Administração > Usuários.

Demonstração local: `docker compose up -d`, `npx prisma migrate deploy`, `npm run db:seed` (senha padrão dos usuários demo no seed; só para desenvolvimento), `npm run dev -- -p 3100`.

## Primeiros passos no financeiro (para o cliente)
1. Contas bancárias: cadastrar a conta Itaú com agência, conta com dígito, CNPJ e razão social do titular.
2. Fornecedores: banco/agência/conta ou chave Pix (só o FINANCEIRO vê e edita).
3. Plano de contas: revisar o plano padrão e criar os centros de custo.
3b. Para cobrar hospitais: na conta do Itaú selecione a carteira 109 e complete o endereço/CEP dos hospitais; depois Cobrança dos hospitais → gerar remessa → enviar → importar retorno → imprimir boleto.
4. Pagar: Pagamentos SISPAG → marcar títulos → gerar arquivo → enviar no Itaú Empresas → importar o retorno.
5. Receber: importar o extrato (OFX ou CNAB 240) em Conciliação → "Baixar e conciliar".
6. Mês a mês: Classificar pendentes → conferir o DRE → Fechamento de mês.

## O que NÃO está no MVP (conhecido)
- **Banco é por arquivo, não automático:** enviar remessa e subir retorno/extrato é manual. Automatizar exige API ou troca de arquivos contratada com o Itaú.
- **Nada foi validado com arquivo real do Itaú.** Posições de campo conferidas contra os manuais públicos, fluxo testado com arquivos simulados. Antes do uso com valores reais: Validador de Layout do Itaú Empresas e teste com R$ 1,00 (roteiro em `docs/REVISAO.md` seção 2).
- **Cobrança para hospitais:** boleto registrado CNAB 400 (carteira 109) com baixa automática no retorno está implementado, **mas nunca validado com arquivo real** e exige convênio de cobrança no Itaú; Pix de cobrança (QR) não existe.
- **NF-e/NFS-e**: a NF é registrada pelo número digitado, não emitida pelo sistema. Integrar um emissor é a próxima fase.
- Faturamento TISS/SUS, etiquetas UDI/GS1, SPED, app do representante: fases futuras (`docs/HANDOFF.md` seção 10).
- **Segurança:** pendentes a decidir com o cliente (separação de funções em compras, quem registra NF) e a CSP; ver `docs/REVISAO.md` seção 13.
- Anexos com dado de paciente: definir política de retenção/LGPD e armazenamento privado (Supabase Storage em bucket privado na hospedagem).

## Qualidade
- 141 testes unitários (`npm test`) e 167 testes de integração contra o banco (`npm run test:db`), todos passando; `tsc` e `next build` limpos; lint sem erros.
- Revisões e correções documentadas: `docs/REVISAO.md` (segurança, bancário, financeiro, bugs de estoque).
- Varredura de todas as telas do menu com os 6 perfis: sem erros.

## Dados de demonstração no banco de desenvolvimento
Existem `CIR-2` (paciente de teste), `PV-2` e a conta a receber do PV-2 de um teste anterior. Para começar limpo, use um banco novo (passos acima).

## Interface (Vionex Design System V2 · Corporativo)
O visual segue `Vionex_Design_Systems.html` (versão 2): azul institucional `#0B5CAB`, cinza neutro, fonte do sistema, texto de 13 px, cantos de 4 px, controles de 32 px, linhas de tabela de 36 px. Navegação em barra superior de três faixas (logo, busca de telas com Ctrl+K e usuário; módulos; telas do módulo). Modo claro, escuro ou do sistema (menu do usuário; cookie `opme_tema`).

Como funciona: `src/app/globals.css` remapeia as escalas do Tailwind (`teal` = marca, `slate` = neutros, `emerald/rose/amber/sky` = ok/crítico/atenção/info, `white` = superfície) para os tokens do Vionex, claro e escuro. Os componentes e as páginas usam só essas escalas (nunca hex). Blocos padrão em `src/components/ui.tsx`: `PageHeader`, `Card`, `Table/Td`, `Stat/KpiGrid`, `FilterBar`, `SectionTitle`, `Badge/StatusBadge`, `EmptyState`, `Dl`, `btn.*`. Regra: número em célula `text-right` (um script alinha o cabeçalho da coluna).

## Organização do código e regras de módulo
Cada módulo (comercial, estoque, qualidade, compras, financeiro, gestão, cadastros, admin) é dono dos seus dados e das suas telas, e as ações de criar ficam na página do próprio módulo: o painel principal e o sino são só leitura e navegação, e não existe menu global de criação. Detalhes, regras e decisões em `docs/ARQUITETURA.md`. O verificador `npm run arquitetura` roda no `npm test` e falha se alguém criar dependência cruzada indevida.

Qualidade hoje: 141 testes unitários e 167 testes de integração contra o banco, `tsc` limpo, lint sem erros, build de produção compilando e todas as telas abrindo sem erro nos 6 perfis.
