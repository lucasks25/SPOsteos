# Sistema de Gestão OPME — Documento de passagem (handoff)

> Escrito em 13/10/2026 para continuar o desenvolvimento em outra conta do Claude.
> **Para o próximo Claude:** leia este arquivo inteiro antes de mexer no código. Ele explica o objetivo, a arquitetura, as convenções obrigatórias, o que está pronto e as especificações completas do que falta.

---

## 1. Objetivo

Construir um **sistema web próprio de gestão para distribuidores de OPME** (órteses, próteses e materiais especiais), com funcionalidade equivalente ao software de mercado **VS|OPME da Viman Sistemas** (https://www.vimansistemas.com.br/segmentos/software-gestao-opme/).

**Limite legal (importante):** a "engenharia reversa" é só da **funcionalidade pública** (módulos e fluxos descritos no site, em demos e em materiais comerciais). **Não** copiar código, telas, textos nem a marca da Viman, e **não** descompilar o software deles (o EULA e a Lei 9.609/98 protegem isso). O sistema tem marca própria.

Sobre o repositório REA (https://github.com/morluto/rea), pedido no início: é um servidor MCP/CLI para analisar binários, apps Electron/JS, .NET e sites **locais**. Ele não foi usado. O produto da Viman é um aplicativo desktop Windows proprietário, e analisar o binário dele fere o ponto acima. O mapeamento de funcionalidades veio do site público.

### Módulos do VS|OPME (referência funcional, segundo o site público)
- **Qualidade:** rastreabilidade do lote da origem ao uso, validade, registros ANVISA, inspeção técnica, quarentena, estoque não conforme, rotulagem, controle de perdas.
- **Comercial:** agendamento de cirurgias, tabelas de preço, orçamentos, pós-cirúrgico, faturamento SUS, pedidos de venda, relatórios, comissão de representantes, margem de contribuição, anexos.
- **Compras:** entradas, importação (invoice, LI, DI), pedidos de compra, sugestão de compra.
- **Estoque:** vales/remessas para hospitais, caixas de materiais, conferência, separação e retorno, kardex, consignação, logística.
- **Faturamento:** NF-e (remessa, retorno, cobrança, importação, complemento), NFS-e, CC-e, MDF-e, NFC-e.
- **Financeiro:** caixa, contas a pagar e a receber, boletos, fluxo de caixa, câmbio, custo gerencial.
- **Fiscal/Contábil:** EFD ICMS/IPI, EFD Contribuições, GIA, livros, inventário.
- **Transversais:** logs, etiquetas UDI-GS1, perfis de hospitais, médicos e procedimentos.
- **Integrações:** mais de 20 bancos (CNAB), mais de 10 sistemas contábeis, coletores de dados, RFID.

### Escopo escolhido pelo usuário para a Fase 1 (MVP)
1. Cadastros + Qualidade
2. Estoque / Consignação
3. Comercial / Cirurgias
4. Compras + Financeiro

Ficam **fora da Fase 1:** emissão real de NF-e/NFS-e (SEFAZ), SPED/fiscal, boletos/CNAB, integrações bancárias e contábeis, RFID e etiquetas.

---

## 2. Como rodar

Pasta do projeto: `~/Desktop/IA Brazil/OPME`

Pré-requisitos: Node 24+, Docker.

```bash
cd ~/Desktop/IA\ Brazil/OPME
docker compose up -d          # Postgres 17 na porta 5440 (container opme-db)
npm install                   # roda prisma generate no postinstall
npx prisma migrate dev        # aplica as migrations
npm run db:seed               # dados de demonstração (idempotente)
npm run dev -- -p 3100        # http://localhost:3100
```

- `.env` (não versionado) contém `DATABASE_URL=postgresql://opme:opme@localhost:5440/opme?schema=public` e `AUTH_SECRET` (hex aleatório). Modelo em `.env.example`.
- **Usuários de demonstração:** os e-mails estão em `prisma/seed.ts` (admin, comercial, estoque, qualidade, compras e financeiro `@opme.local`) e a senha padrão vem de `SEED_PASSWORD` ou do valor default no seed. Trocar antes de qualquer uso real.
- As portas 5433 e 3000 já estavam ocupadas nesta máquina; por isso foram usadas 5440 (banco) e 3100 (app).
- Scripts: `npm run dev | build | lint | typecheck | db:migrate | db:seed`.
- **Depois de qualquer migration, reinicie o `npm run dev`.** O cliente Prisma fica em cache em `globalThis` no modo dev; sem reiniciar, as telas falham com "Unknown argument" nos campos novos.
- `prisma migrate dev` recusa rodar em terminal não interativo (ex.: dentro de agentes). Nesse caso: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<AAAAMMDDHHMMSS UTC>_<nome>/migration.sql` e `npx prisma migrate deploy`. **O prefixo da pasta tem de ser em UTC** (`date -u +%Y%m%d%H%M%S`), senão a ordem das migrations quebra num banco novo.

---

## 3. Stack e decisões técnicas

| Item | Escolha | Observação |
|---|---|---|
| Framework | **Next.js 16.4** (App Router), React 19.3 | **Leia `AGENTS.md`**: o Next 16 tem mudanças incompatíveis. A documentação da versão instalada está em `node_modules/next/dist/docs/`. |
| Linguagem | TypeScript | |
| CSS | Tailwind v4 | Classes utilitárias; cor primária `teal-700/900`. |
| Banco | PostgreSQL 17 (Docker) | |
| ORM | **Prisma 7.10** (fixado; a tag `latest` aponta para o 8.0 RC, não usar) | Gerador `prisma-client` com saída em `src/generated/prisma` (no gitignore). Driver adapter `@prisma/adapter-pg`. Configuração em `prisma.config.ts`. Importar de `@/generated/prisma/client`. |
| Validação | zod 4 | |
| Auth | Própria: bcryptjs + JWT (jose) em cookie httpOnly `opme_session` | Sessão de 7 dias. |

Diferenças do Next 16 que importam aqui:
- `params` e `searchParams` são **Promises** (`const { id } = await params`).
- O antigo middleware agora se chama **`src/proxy.ts`**, que exporta `function proxy()`.
- **`cacheComponents` foi DESLIGADO** de propósito no `next.config.ts`. Num ERP interno quase tudo é dinâmico, então vale a renderização dinâmica clássica. Não religar sem rever todas as páginas.

---

## 4. Estrutura de pastas

```
docker-compose.yml          Postgres (porta 5440)
prisma.config.ts            config do Prisma 7 (datasource + seed)
prisma/schema.prisma        MODELO DE DADOS COMPLETO (ver seção 6)
prisma/migrations/          migration "init"
prisma/seed.ts              usuários, locais fixos e dados demo
src/proxy.ts                sem cookie de sessão → redireciona para /login
src/lib/db.ts               cliente Prisma singleton + tipo Tx (transação)
src/lib/auth.ts             createSession, destroySession, getUser, requireUser(perfis?)
src/lib/estoque.ts          movimentar(tx, …) ← ÚNICO jeito de mexer em saldo; LOCAIS; localDoHospital
src/lib/forms.ts            parseForm (zod), zf (helpers), audit(), errorMessage(), ActionState
src/lib/format.ts           money, num, date, dateTime, inputDate, inputDateTime, diasAte, toNumber
src/components/ui.tsx       PageHeader, Card, Table, Td, Badge, StatusBadge, Stat, SearchBar, LinkButton, Dl, btn, cx
src/components/form.tsx     (client) Form, Field, Select, TextArea, Grid, SubmitButton, ActionButton
src/components/nav.ts       menu lateral, com TODAS as rotas e os perfis que veem cada grupo
src/components/sidebar.tsx  (client) menu com destaque da rota ativa
src/app/login/              tela de login + actions (login/logout)
src/app/(app)/layout.tsx    layout autenticado (sidebar + header)
src/app/(app)/page.tsx      Painel (dashboard)
src/app/(app)/<modulo>/...  telas de cada módulo
```

---

## 5. Convenções obrigatórias

1. **Toda page e toda Server Action** começa com `await requireUser([...perfis])`. ADMIN sempre passa. `requireUser([])` significa "só ADMIN".
2. **Estoque:** nunca alterar `Saldo` diretamente. Sempre usar `movimentar(tx, {...})` dentro de `db.$transaction(async (tx) => …)`. Ele valida o saldo (lança `EstoqueError` se ficar negativo), faz o upsert do `Saldo` e grava o `Movimento` (kardex).
   - Com `origemId` e sem destino, é saída (consumo/perda). Com `destinoId` e sem origem, é entrada. Com os dois, é transferência.
   - `documento` segue o padrão: `PC-<id>` (pedido de compra), `REM-<id>` (remessa), `CIR-<numero>` (cirurgia), `PV-<id>` (pedido de venda).
3. **Locais fixos** (criados pelo seed): `local-deposito`, `local-quarentena`, `local-nao-conforme` (constante `LOCAIS`). Cada hospital tem um `LocalEstoque` tipo HOSPITAL (consignado), obtido ou criado por `localDoHospital(tx, hospitalId)`.
4. **Server Actions de formulário** têm a assinatura `(id | null, prevState: ActionState, formData) => Promise<ActionState>`, são ligadas com `.bind(null, id)` e usadas com o componente `<Form action=… redirectTo=…>`. A validação é feita assim:
   ```ts
   const parsed = parseForm(schema, fd);
   if (!parsed.success) return parsed.state;
   const data = parsed.data;
   ```
   Os helpers `zf.optText()`, `zf.optDate()` e `zf.optMoney()` convertem vazio em `null` (assim um campo limpo na edição é salvo como vazio).
5. **Erros para o usuário:** só `ErroNegocio` (de `@/lib/erros`) ou subclasses têm a mensagem exibida por `errorMessage()`. Qualquer outro erro vira "Erro inesperado" com código, e o detalhe vai só para o log.
5.1. **Auditoria:** chamar `audit(user.id, "criar|editar|…", "Entidade", id, detalhe)` em toda mutação.
6. Depois de mutar, chamar `revalidatePath(...)`.
7. **Decimal do Prisma** não pode ir direto para Client Components: converter com `.toString()` ou `toNumber()`.
8. Editores de itens (várias linhas) são um pequeno componente `"use client"` que guarda as linhas em estado e serializa tudo como JSON num `<input type="hidden">`. O servidor valida esse JSON com zod.
9. Arquivos com menos de 500 linhas. UI em português do Brasil. Não criar arquivos na raiz.
10. **Modelo de referência** para novas telas: `src/app/(app)/cadastros/produtos/` (lista com busca, novo, `[id]` editar, form compartilhado, actions).
11. Helpers específicos de um módulo ficam em `src/app/(app)/<modulo>/_lib/`.

---

## 6. Modelo de dados (resumo de `prisma/schema.prisma`)

- **Acesso:** `Usuario` (perfil: ADMIN, COMERCIAL, ESTOQUE, QUALIDADE, COMPRAS, FINANCEIRO), `LogAuditoria`.
- **Cadastros:** `Fabricante`, `Fornecedor` (CNPJ único, AFE), `Hospital` (CNPJ, prazoPagamentoDias, tabelaPreco, 1:1 com LocalEstoque), `Medico` (CRM+UF único), `Convenio` (registro ANS), `Procedimento` (TUSS) com `ProcedimentoItem` (materiais padrão), `Representante` (comissaoPercent), `Produto` (código, registroAnvisa, validadeRegistro, classeRisco, GTIN, NCM, custoMedio, precoBase, estoqueMinimo).
- **Qualidade:** `Lote` (produto+número único, validade, status QUARENTENA, LIBERADO, NAO_CONFORME, BLOQUEADO ou VENCIDO), `Inspecao`.
- **Estoque:** `LocalEstoque` (DEPOSITO, HOSPITAL, QUARENTENA ou NAO_CONFORME), `Saldo` (lote+local único), `Movimento` (kardex: ENTRADA, REMESSA, RETORNO, CONSUMO, TRANSFERENCIA, AJUSTE ou PERDA), `Kit`/`KitItem`, `Remessa` (id inteiro, mostrado como REM-n; status ABERTA, ENVIADA, CONFERIDA ou CANCELADA) com `RemessaItem` (quantidade, devolvido, consumido).
- **Comercial:** `TabelaPreco`/`TabelaPrecoItem`, `Cirurgia` (numero autoincrement; status AGENDADA, CONFIRMADA, REALIZADA, FATURADA ou CANCELADA; flag SUS), `CirurgiaConsumo` (produto+lote+qtd), `Anexo`, `Orcamento`/`OrcamentoItem`, `PedidoVenda` (1:1 opcional com cirurgia; total, custoTotal, comissao, numeroNf)/`PedidoVendaItem`.
- **Compras:** `PedidoCompra` (importação: invoice e DI) com `PedidoCompraItem` (quantidade, recebido, custoUnit).
- **Financeiro:** `ContaReceber` e `ContaPagar` (status ABERTO, PAGO ou CANCELADO; `valorPago` = dinheiro movimentado nas baixas (inclui juros e multa, exclui desconto), `valorBaixado` = Σ(principal + desconto) = quanto do título foi extinto, `pagoEm` = última baixa. **Saldo do título = `valor − valorBaixado`**, sempre via `saldoTitulo()`; `ContaPagar.codigoBarras` = boleto do fornecedor, 44 dígitos).
  - `ContaBancaria` (BANCO ou CAIXA; agência, número com dígito, saldo inicial, titular CNPJ/razão social para o SISPAG).
  - `Lancamento`: dinheiro que entrou/saiu de uma conta (baixa de título, avulso ou perna de transferência). `valor` sempre positivo + `sentido` ENTRADA/SAIDA. Em baixa de título: `valor = principal + juros + multa` (o `desconto` extingue título sem dinheiro). Travas CHECK no banco garantem isso (ficam só no SQL das migrations; o Prisma as ignora).
  - `Transferencia`: liga as duas pernas (SAIDA na origem, ENTRADA no destino). Muda o saldo de cada conta, mas **não é entrada/saída do mês no painel nem realizado do fluxo** (filtro `transferenciaId: null`).
  - `ExtratoLinha`: linha do extrato do banco (OFX ou CNAB 240), valor assinado; conciliada quando aponta para um `Lancamento`. Única por (conta, `fitid`), o que impede importar duas vezes.
  - `RemessaPagamento` / `RemessaPagamentoItem`: arquivos SISPAG gerados e a situação de cada pagamento no banco (ENVIADO, AGENDADO, PAGO, REJEITADO). O id do item vira o "seu número" `SP<id>` que volta no retorno.
- **Fornecedor** ganhou dados para pagamento: `bancoCodigo`, `agencia`, `conta`, `contaDigito`, `chavePix`.

Para mudar o esquema: editar o schema, rodar `npx prisma migrate dev --name <nome>` e reiniciar o dev server.

---

## 7. Fluxo de negócio ponta a ponta (como as peças se encaixam)

```
Pedido de compra (PC-n)
  └─ Recebimento: cria/atualiza Lote (QUARENTENA) + ENTRADA → local-quarentena
       + recalcula custo médio + gera ContaPagar
Quarentena / Inspeção
  └─ LIBERADO → TRANSFERENCIA quarentena → depósito
  └─ NAO_CONFORME/BLOQUEADO → TRANSFERENCIA → local-nao-conforme
Cirurgia agendada (CIR-n) — hospital, médico, convênio, procedimento, representante
  └─ "Gerar remessa" → /estoque/remessas/nova?cirurgiaId=…  (itens do procedimento, lotes por FEFO)
Remessa / vale (REM-n): ABERTA → Enviar (REMESSA depósito → consignado do hospital)
  └─ Conferir retorno: devolvido → RETORNO para o depósito; consumido → CONSUMO (+ CirurgiaConsumo, cirurgia = REALIZADA)
       o restante fica consignado no hospital
  (alternativa: "consumo direto" do estoque já consignado no hospital, na tela da cirurgia)
Faturar cirurgia → PedidoVenda (preço da tabela do hospital, custo médio, comissão) → cirurgia FATURADA
Pedido de venda → registrar NF (manual por enquanto) → FATURADO + ContaReceber (vencimento = prazo do hospital)
Financeiro:
  baixa (total, PARCIAL, com juros/multa/desconto) = Lancamento numa conta → recalcularTitulo() atualiza valorPago/valorBaixado/pagoEm/status
  (a linha do título é travada com SELECT … FOR UPDATE: duas baixas simultâneas não passam do saldo)
  extrato (OFX ou CNAB 240 Itaú) → ExtratoLinha → conciliar com lançamento, baixar título ou lançar avulso
  contas a pagar → remessa SISPAG (TED/crédito Itaú/boleto ou Pix em arquivo separado) → envio manual no Itaú Empresas
       → retorno SISPAG → ocorrência 00 baixa a conta a pagar automaticamente
  fluxo de caixa = previsto (saldo dos títulos em aberto) + realizado (lançamentos)
Rastreabilidade: do lote → entrada/fornecedor → remessas → cirurgias/pacientes (recall).
```

---

## 8. Status atual (13/10/2026, 21h30, todas as telas da Fase 1 prontas)

Revisão de código e segurança, achados e o que foi ou não testado: **`docs/REVISAO.md`**.

### ✅ Pronto e testado
| Área | O que existe | Como foi testado |
|---|---|---|
| Infra | Docker/Postgres, Prisma, 5 migrations, seed, build de produção | `tsc`, `next build` |
| Login, layout, menu por perfil | — | navegador |
| Cadastros | produtos, fabricantes, fornecedores (com dados bancários/Pix), hospitais, médicos, convênios, **procedimentos** (materiais padrão), **representantes** | navegador (parcial) |
| Administração | **usuários** (criar, perfil, ativar, redefinir senha; o admin não se desativa) e **log de auditoria** (filtros, 50 por página) | renderização |
| Qualidade | quarentena/inspeção, lotes, rastreabilidade, registros ANVISA | já existia; não retestado |
| Comercial | cirurgias (anexos, faturamento), pedidos de venda (registrar NF → conta a receber, cancelar), **agenda semanal**, **orçamentos** (itens com preço da tabela, status, impressão), **tabelas de preço** (itens, vigência, incluir todos, margem), **comissões e margem** (por representante, hospital e médico) | ponta a ponta no navegador + banco (ver abaixo) |
| Estoque | remessas/vales (FEFO) + **detalhe da remessa** `estoque/remessas/[id]` (vale imprimível, enviar, conferir retorno, cancelar), **saldos por local**, **kardex** (saldo corrente com produto+local), **kits**, **ajustes e perdas** | ponta a ponta no navegador + banco |
| Compras | **sugestão de compra** (gera pedido pré-preenchido), **pedidos de compra** (novo, recebimento por item com lote/validade → quarentena + kardex + custo médio + conta a pagar, cancelar) | navegador + banco |
| Financeiro | **contas a receber/pagar** (baixa parcial, estorno, cancelamento), **contas bancárias/caixa** (saldo, lançamento avulso), **fluxo de caixa**, **conciliação** (OFX e CNAB 240 Itaú), **SISPAG** (remessa e retorno) | navegador + banco + testes de parser |

| Painel | indicadores por perfil (cirurgias, a faturar, vendas e margem do mês, recebíveis vencidos, a pagar, quarentena, validade, mínimo, ANVISA, remessas a conferir), próximas cirurgias, gráfico de vendas de 6 meses | navegador |

**Verificação de 13/10 à noite:**
- `tsc` sem erros, `eslint` sem erros (só avisos antigos de variável `_` não usada) e `next build` passando com todas as rotas.
- As **34 telas do menu** foram abertas no navegador e renderizaram sem erro.
- **Fluxo de ponta a ponta testado:** cirurgia CIR-2 → "Gerar remessa" (itens do procedimento, lotes por FEFO) → REM-1 enviada → conferência (parafuso: 6 enviados, 2 devolvidos, 4 consumidos; placa: 1 consumida) → cirurgia REALIZADA com consumo → faturar → PV-2 (preço da tabela, margem 46,6%, comissão 5%) → NF 998877 → conta a receber com vencimento pelo prazo do hospital. Kardex e saldos conferidos no banco (REMESSA, RETORNO e CONSUMO corretos; depósito 20 → 16).
- Orçamento ORC-1 testado (preço vindo da tabela do hospital).
- **Não testados com escrita:** procedimentos, representantes, usuários, kits, tabelas de preço, ajustes/perdas e o status do orçamento. Só foi testada a renderização dessas telas.

### Componentes compartilhados criados nesta etapa
- `src/components/item-adder.tsx`: formulário em linha "produto + qtd [+ preço]" para adicionar itens em telas de detalhe (procedimentos, kits, tabelas, orçamentos).
- `src/components/print-button.tsx`: botão de impressão. O layout esconde menu e cabeçalho na impressão (`print:hidden`).
- `src/lib/format.ts`: `diasAtras(n)`, e `date()` agora mostra instantes no horário de Brasília (antes mostrava em UTC, e depois das 21h aparecia o dia seguinte).

### Pendências conhecidas
- Itens de `docs/REVISAO.md` (limite de tentativas de login, revogação de sessão, trava de concorrência em baixas/recebimentos).
- `dateTime()` já usa o horário de Brasília. `inputDateTime()` usa UTC−3 fixo, o que só vale enquanto não houver horário de verão.
- Nas telas de detalhe, a inclusão de itens recarrega a página (padrão ItemAdder). Se precisar, dá para trocar por um editor client-side como o do pedido de compra.

### Integração bancária: decisão tomada
- Avaliado **Open Finance via Pluggy**: dados a partir de R$ 2.500/mês e pagamentos a partir de R$ 500/mês (página de preços da Pluggy, out/2026). O "Meu Pluggy" gratuito é só para uso pessoal (dados das próprias contas, sem Pix). **Descartado por custo** a pedido do usuário.
- Adotado o que a própria Viman descreve no site: **arquivos CNAB** do banco do cliente (**Itaú**), sem mensalidade de API.
  - Extrato: **CNAB 240 Itaú** (manual "Extrato de Conta Corrente CNAB240 v5.0", fev/2011) e **OFX**.
  - Pagamentos: **SISPAG** (manual "SISPAG Layout de Arquivos CNAB v085", out/2020): crédito em conta Itaú, TED, boletos e **Pix por chave** (o SISPAG aceita Pix por arquivo).
  - **Falta:** cobrança/emissão de boletos para hospitais (CNAB de cobrança). Só achamos o manual de 2017, hospedado em terceiro. Precisa do manual atual do Itaú.
- Nenhum arquivo foi validado com o Itaú ainda. Ver `docs/REVISAO.md`, seção "Integração bancária".

### Dados de teste no banco local
Em 14/10 foram apagados os dados de teste do financeiro (conta bancária, lançamentos, extratos, remessas SISPAG, PC-1, PV-1, CIR-1, lote `LT-TESTE-01`) e os dados bancários dos fornecedores. **Restaram** `CIR-2` ("Paciente Teste E2E"), `PV-2` (NF 998877) e a conta a receber do PV-2, criados por outro teste de faturamento ponta a ponta que não é desta sessão.

### Git
Primeiro commit do trabalho: `2c83ff6` (14/10/2026). Ficam fora do git, por `.gitignore`: `.env*`, `storage/` (anexos), arquivos de ferramentas de agentes (`.claude-flow`, `.swarm`, `.agents`, bancos do ruflo) e `.claude/*` exceto `.claude/agents/`.

---

## 9. Especificação dos módulos (o que cada tela deve fazer)

As rotas já estão no menu (`src/components/nav.ts`). Uma rota sem arquivo dá 404.

### 9.1 Cadastros — `src/app/(app)/cadastros/*` e `src/app/(app)/admin/*`
Para cada cadastro: lista com busca, novo, editar, e ativar/inativar quando houver o campo `ativo`. Preferir inativar a excluir. Só excluir quando não houver relações; erros de FK devem virar mensagem amigável.
1. **fabricantes**: nome, CNPJ, país.
2. **fornecedores**: razão social, fantasia, CNPJ (validar dígitos; validador em `cadastros/_lib/documentos.ts`), IE, contato, cidade/UF, AFE ANVISA.
3. **hospitais**: todos os campos + prazoPagamentoDias + tabela de preço. Ao criar, também cria o local consignado (`localDoHospital` dentro de uma transação). O detalhe mostra o estoque consignado (agrupado por produto, com lotes e validade), as últimas 10 cirurgias e o total em aberto a receber.
4. **medicos**: nome, CRM+UF (único), especialidade, contato.
5. **convenios**: nome, registro ANS, CNPJ.
6. **procedimentos**: TUSS, descrição, especialidade + lista editável de materiais padrão (ProcedimentoItem).
7. **representantes**: nome, CPF/CNPJ, contato, % de comissão.
8. **admin/usuarios** (só ADMIN): listar, criar (bcrypt, senha com 8 caracteres ou mais), editar nome/perfil/ativo, resetar senha. O admin não pode se desativar.
9. **admin/auditoria** (só ADMIN): LogAuditoria paginado (50 por página, `?page=`), com filtro por entidade e usuário.

### 9.2 Qualidade — `src/app/(app)/qualidade/*` (perfis QUALIDADE e ESTOQUE)
1. **quarentena**: lotes em QUARENTENA com o saldo no local de quarentena. Inspeção (embalagem, rotulagem e documentação OK; observação; resultado) cria a `Inspecao`, atualiza o status do lote e transfere o saldo inteiro (LIBERADO vai para o depósito; os outros vão para não conforme). Bloquear a liberação se o lote estiver vencido ou se o registro ANVISA do produto estiver vencido.
2. **lotes**: filtros por status, produto, "vence em X dias" e vencidos; saldo total e por local; ação em massa "marcar vencidos". Detalhe `lotes/[id]`.
3. **rastreabilidade**: busca por lote, série, GTIN ou código e mostra entrada (PC/fornecedor), kardex, remessas/hospitais e cirurgias/pacientes. Layout próprio para impressão (relatório de recall).
4. **registros**: registros ANVISA vencidos ou vencendo em 90 e 180 dias, e produtos sem registro.

### 9.3 Compras — `src/app/(app)/compras/*` (perfis COMPRAS e ESTOQUE)
1. **pedidos**: lista por status; novo pedido com fornecedor, previsão, importação (invoice/DI), observação e itens (produto, quantidade, custo; custo padrão = custo médio); detalhe com histórico de recebimento. Cancelar pedido ABERTO.
2. **Recebimento** (no detalhe do pedido), por item: quantidade, lote, validade, fabricação e série. Tudo numa transação: upsert do Lote (novo lote entra em QUARENTENA), ENTRADA no local de quarentena com documento `PC-<id>`, atualização de `recebido`, recálculo do custo médio ponderado, status PARCIAL ou RECEBIDO e criação de ContaPagar (vencimento em hoje + 30 dias). Não permitir receber mais do que o pedido.
3. **sugestao**: por produto, mostrar disponível (lotes LIBERADO no depósito e nos hospitais), quarentena, pendente em pedidos, consumo dos últimos 90 dias e mínimo. Sugestão = max(0, mínimo + consumo médio mensal − disponível − pendente). Botão para gerar um pedido rascunho para um fornecedor.

### 9.4 Estoque — `src/app/(app)/estoque/*` (ESTOQUE muta; COMERCIAL e QUALIDADE veem)
1. **saldos**: por local, agrupado por produto com os lotes; destaque para vencidos, vencendo em 30 dias e lotes não liberados; totais e valor (qtd × custo médio).
2. **kardex**: filtros por produto, lote, local, tipo e período; saldo corrente quando filtrado por produto+local; 100 por página.
3. **kits**: CRUD de caixas/kits com itens.
4. **remessas** (vale de consignação). Lógica em `estoque/_lib/remessas.ts`:
   - nova: hospital, cirurgia opcional (`?cirurgiaId=` preenche hospital e itens do procedimento), kit opcional (preenche os itens), lotes LIBERADO e não vencidos com saldo no depósito, escolhidos por **FEFO** (vence primeiro, sai primeiro) e divididos entre lotes se preciso. Começa ABERTA, sem movimento.
   - detalhe `[id]`: vale imprimível (hospital, cirurgia/paciente/médico, itens com lote, validade, GTIN e registro ANVISA, linhas de assinatura).
   - Enviar: REMESSA do depósito para o consignado do hospital (revalida status e validade).
   - Conferir retorno: por item, devolvido + consumido ≤ quantidade. Devolvido gera RETORNO; consumido gera CONSUMO e, se houver cirurgia, CirurgiaConsumo + cirurgia REALIZADA. O restante fica consignado.
   - Cancelar remessa ABERTA.
5. **ajustes**: AJUSTE (entrada ou saída num local) e PERDA (saída com motivo obrigatório); mostra os últimos 50.

### 9.5 Comercial — `src/app/(app)/comercial/*` (COMERCIAL; FINANCEIRO no faturamento)
1. **cirurgias**: lista com filtros; nova/editar; confirmar; cancelar (só sem consumo); detalhe com remessas (botão "Gerar remessa/vale"), consumo, anexos e pedido.
   - Consumo direto do estoque consignado do hospital (CONSUMO + CirurgiaConsumo, cirurgia REALIZADA). Remover consumo enquanto não FATURADA (estorno com AJUSTE de volta ao consignado).
   - Anexos: pdf/jpg/png de até 10 MB, salvos em `public/uploads/cirurgias/<id>/<nome-aleatório>`, com tipo e tamanho validados.
   - Faturar (`comercial/_lib/faturamento.ts`): PedidoVenda a partir do consumo; preço da tabela do hospital (ou precoBase); custo médio; comissão do representante; cirurgia FATURADA.
2. **agenda**: visão semanal (`?semana=yyyy-mm-dd`), 7 colunas, cartões coloridos por status, filtros por hospital e representante.
3. **orcamentos**: CRUD com itens, status (ENVIADO, APROVADO, RECUSADO) e versão para impressão.
4. **pedidos**: lista e detalhe; "Registrar NF" (número manual) muda para FATURADO e cria ContaReceber (vencimento = prazo do hospital); cancelar pedido ABERTO (a cirurgia volta para REALIZADA).
5. **tabelas-preco**: CRUD + itens + vigência; botão "adicionar todos os produtos pelo preço base".
6. **comissoes**: por período e representante: vendido, custo, margem (R$ e %) e comissão. Também vendas por hospital e cirurgias por médico.

### 9.6 Financeiro — `src/app/(app)/financeiro/*` (FINANCEIRO) + Painel
> **Implementado** (exceto o Painel). Código em `financeiro/_lib/`:
> - `titulos.ts`: `calcularBaixa`/`saldoTitulo`/`situacaoTitulo` (regras puras), `registrarBaixa`, `estornarBaixa`, `recalcularTitulo` (único lugar que grava valorPago/valorBaixado/pagoEm/status), `transferir`, `estornarTransferencia`.
> - `painel.ts`: números de `/financeiro` e do painel principal (`faixasAbertas`).
> - Regra de ouro: **nunca calcule saldo de título com `valorPago`**; use `valor − valorBaixado` (`saldoTitulo`).
> - `ofx.ts`, `cnab240-extrato.ts`: leitores de extrato (puros).
> - `boleto.ts`: linha digitável ↔ código de barras, DVs do Anexo A do SISPAG.
> - `sispag.ts`: gera remessa e lê retorno (puro); `sispag-regras.ts`: escolhe a forma de pagamento.
> - `*-actions.ts`: Server Actions; `conciliacao.ts`, `contas.ts`, `fluxo.ts`, `queries.ts`: consultas.
> Telas extras além da especificação abaixo: `/financeiro` (visão geral), `/financeiro/contas` (com transferência entre contas), `/financeiro/conciliacao`, `/financeiro/remessas`.
1. **receber**: filtros (status, hospital, período, vencidos), totais, lançamento manual, baixa (valor e data), estorno, cancelamento, link para o pedido.
2. **pagar**: o mesmo, com fornecedor e categoria (Fornecedores, Impostos, Folha, Aluguel, Logística, Serviços, Outros) e link para o PC.
3. **fluxo**: período (padrão: próximos 90 dias) e granularidade semana/mês. Entradas e saídas previstas, realizado, saldo do período e acumulado, faixa de atrasados, barras em CSS.
4. **Painel** (`src/app/(app)/page.tsx`): indicadores com links — cirurgias hoje e nos próximos 7 dias, a faturar, vendas e margem do mês, recebíveis vencidos, contas a pagar em 7 dias, lotes em quarentena, lotes vencidos ou vencendo, produtos abaixo do mínimo, registros ANVISA vencendo, remessas pendentes de conferência. Abaixo, as próximas 10 cirurgias e um gráfico de vendas de 6 meses.

---

**Plano de contas e DRE (14/10/2026):** `/financeiro/plano-contas` (árvore + centros de custo) e `/financeiro/dre` (6 meses + total, filtro por centro). Todo título e lançamento avulso novo exige conta do plano e competência. Detalhes, regras e pendências em `docs/REVISAO.md` seção 7.

## 10. Próximas fases (depois do MVP)

1. **NF-e/NFS-e reais**: integrar uma API emissora (Focus NFe, PlugNotas, NFe.io etc.) para NF de remessa em consignação (CFOP 5917/6917), retorno (5918/6918), venda de consignado (5114/6114) e faturamento; CC-e; DANFE.
2. **Faturamento de convênios**: guias TISS (XML) e controle de glosas; faturamento SUS (OPM/SIGTAP).
3. **Etiquetas UDI-GS1**: geração (GS1-128/DataMatrix) e leitura por coletor/câmera no recebimento e na conferência.
4. **Cobrança CNAB Itaú** (emitir boletos para hospitais + retorno). Conciliação OFX/CNAB 240 e pagamentos SISPAG já estão prontos.
5. **Fiscal**: SPED EFD ICMS/IPI e Contribuições, e exportação para a contabilidade.
6. **App mobile ou PWA** para representantes: agenda, consumo em sala e foto da folha de consumo.
7. **Deploy**: o usuário pretende usar **Supabase** (Postgres + Storage) depois da validação local. Anexos hoje ficam em `storage/uploads/` (fora de `public/`, servidos por rota autenticada). No Supabase, usar bucket **privado**.
8. Testes automatizados, principalmente de `src/lib/estoque.ts`, de `estoque/_lib/remessas.ts` e do faturamento.

---

## 11. Prompt sugerido para começar na outra conta

> Estou continuando o projeto em `~/Desktop/IA Brazil/OPME`. Leia `docs/HANDOFF.md`, `docs/REVISAO.md` e `AGENTS.md` primeiro. Todas as telas da Fase 1 existem e o fluxo principal foi testado (seção 8). Próximos passos: (1) suba o banco e o servidor (seção 2) e rode `npx tsc --noEmit` e `npm run build`; (2) teste com escrita as telas listadas como "não testadas com escrita" na seção 8; (3) corrija os itens P2 de `docs/REVISAO.md`; (4) faça o commit; (5) escolha com o usuário a próxima fase da seção 10 (sugestão: NF-e via API emissora).
