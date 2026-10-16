# Arquitetura — Sistema de Gestão OPME

> Estado em 16/10/2026. Complementa `docs/HANDOFF.md` (convenções de código, como rodar) e `docs/REVISAO.md` (segurança).
> Verificação automática: `npm run arquitetura` (também roda dentro de `npm test`).
> Público: quem for criar tela, mover código ou executar um item do backlog no fim deste arquivo.

## 1. Princípios

1. **Monólito modular.** Um app Next, um banco, um schema Prisma. Os módulos são pastas de `src/app/(app)/<modulo>/`, não pacotes nem serviços. Não há motivo para mais que isso num MVP com 6 perfis e um só cliente.
2. **Cada módulo é dono dos seus dados e das suas telas.** Criar ou editar algo só acontece numa página do módulo dono. Outro módulo pode **mostrar** (só leitura, com link para o dono), nunca oferecer "criar".
3. **Escrita só pelo dono; leitura é livre.** Um módulo pode ler tabelas de outro com Prisma (relatórios, painéis, filtros). Gravar em tabela alheia só pela API pública do dono, porque é lá que moram as regras (mês fechado, plano de contas, status, quarentena).
4. **Código compartilhado sem dono de negócio mora no kernel** (`src/lib`, `src/components`). Regra de dois: um utilitário vira kernel quando o segundo módulo precisa dele, não antes.
5. **Proporcionalidade.** Nada de repositórios, DI, eventos ou camadas sem ganho. As exceções aceitas estão nos ADRs (seção 8).

## 2. Mapa de módulos

Fonte: rotas em `src/app/(app)`, modelos em `prisma/schema.prisma`, perfis em `src/components/nav.ts`.

| Módulo | Pasta | Dono dos modelos (escreve) | Telas principais | API pública (alvo, `_lib/publico.ts`) |
|---|---|---|---|---|
| **cadastros** | `cadastros/` | Fabricante, Fornecedor (menos as colunas bancárias, ver UI-05), Hospital, Medico, Convenio, Procedimento(+Item), Representante, Produto (menos `custoMedio`, ver ARQ-09) | 8 cadastros (lista, novo, `[id]`) | opções de selects (`opcoesHospitais`, `opcoesMedicos`…, `nomeHospital`), ARQ-10 |
| **qualidade** | `qualidade/` | Lote, Inspecao, Documento(+Arquivo), Recolhimento(+Lote, Alvo, Paciente, Acao) | quarentena, lotes, rastreabilidade, registros, documentos, recolhimentos | `registrarLoteRecebidoTx` (ARQ-08), contadores para o painel (ARQ-05) |
| **estoque** | `estoque/` | Kit(+Item), Remessa(+Item), InventarioConsignacao(+Item) | saldos, kardex, remessas, kits, ajustes, inventário | contadores para o painel (ARQ-05) |
| **núcleo de estoque (kernel)** | `src/lib/estoque.ts` | LocalEstoque, Saldo, Movimento | — | `movimentar`, `localDoHospital`, `LOCAIS`; e (alvo) `atualizarCustoMedio`, `removerLocalDoHospital` (ARQ-09) |
| **comercial** | `comercial/` | TabelaPreco(+Item), Cirurgia, CirurgiaConsumo, AutorizacaoConvenio(+Item), Anexo, Orcamento(+Item), PedidoVenda(+Item) | cirurgias, agenda, orçamentos, pedidos, tabelas de preço, comissões | `registrarConsumoCirurgiaTx` (ARQ-07), indicadores do painel (ARQ-05) |
| **compras** | `compras/` | PedidoCompra(+Item, Despesa) | pedidos (nacional e importação), sugestão | nenhuma por enquanto |
| **financeiro** | `financeiro/` | ContaReceber, ContaPagar, ContaBancaria, Lancamento, Transferencia, ExtratoLinha, RemessaPagamento(+Item), PlanoConta, CentroCusto, Glosa, FechamentoMes, RemessaCobranca(+Item), CobrancaEvento | 16 telas (títulos, contas, conciliação, SISPAG, cobrança, DRE, fluxo, fechamento…) | `gerarContaPagarTx`, `alterar/cancelarContaPagarGeradaTx`, `gerarContaReceberTx`, rótulos de glosa, `faixasAbertas` (ARQ-06) |
| **gestão** | `gestao/` | nenhum (só leitura) | ABC, giro, margem, vencimentos, vendas, glosas (CSV) | — |
| **admin** | `admin/` | Usuario | usuários, auditoria | — |
| **painel** | `page.tsx` + `_painel/` (alvo) | nenhum (só leitura) | painel por perfil; alimenta o sino (`/api/pendencias`) | — |
| **shell** | `layout.tsx`, `login/`, `api/busca` | TentativaLogin, Usuario (login) | login, layout, busca global | — |

`LogAuditoria` é gravado só por `audit()` em `src/lib/forms.ts`.

## 3. Regras de dependência

O verificador (`scripts/verificar-arquitetura.ts`) lê todas as importações de `src/` com `ts.preProcessFile` (inclui `import type`, `export … from` e `import()`), resolve `@/` e caminhos relativos, e classifica cada arquivo por módulo.

| # | Regra | Falha quando | Certo | Errado |
|---|---|---|---|---|
| R1 | `kernel-importa-app` | `src/lib` ou `src/components` importa de `src/app` | `components/app-shell.tsx` → `@/lib/tema-actions` | `components/app-shell.tsx` → `@/app/tema-actions` |
| R2 | `lib-importa-ui` | `src/lib` importa de `src/components` | `lib/x.ts` define o tipo de que precisa | `lib/pendencias.ts` → `components/icons` |
| R3 | `modulo-cruzado` | módulo A importa um arquivo do módulo B que não é `B/_lib/publico.ts` | `compras/_lib/recebimento.ts` → `financeiro/_lib/publico` (`gerarContaPagarTx`) | `compras/_lib/recebimento.ts` → `financeiro/_lib/plano` |
| R4 | `ui-cruzada` | idem, com os dois lados `.tsx` (tela usando componente de outro módulo) | `estoque/saldos/page.tsx` → `@/components/filtros` | `estoque/saldos/page.tsx` → `comercial/_components/filtros` |
| R5 | `ciclo` | módulos que dependem uns dos outros (mesmo via `publico.ts`) | comercial → financeiro, sem volta | cadastros → financeiro → cadastros |
| R6 | `escrita-alheia` | `create/update/upsert/delete` do Prisma em modelo de outro dono (tabela `DONO` do script) | `estoque/_lib/remessas.ts` chama `registrarConsumoCirurgiaTx` do comercial | `estoque/_lib/remessas.ts` faz `tx.cirurgia.update` |

Permitido sem restrição: qualquer módulo → kernel; leitura Prisma de qualquer tabela; links (`href`) para telas de outro módulo; `revalidatePath` de rota de outro módulo (é só cache).

`publico.ts` é **`.ts`, nunca `.tsx`**: a API pública expõe dados e serviços, nunca componente. Se dois módulos precisam do mesmo componente, ele é kernel (`src/components`), ou a tela fica só no dono e o outro módulo põe um link.

**Exceções temporárias** ficam em `scripts/arquitetura-excecoes.ts`, cada uma com o item do backlog. A lista é uma catraca: violação nova falha, e exceção que não acontece mais também falha (apague a linha ao terminar o item). Não acrescente exceção para passar código novo.

**ESLint:** não adicionei regra equivalente. `no-restricted-imports` precisaria de um bloco por módulo, não pega caminhos relativos (`../../financeiro/_lib/x`) sem padrões frágeis e duplicaria a lista de exceções. O verificador já roda no `npm test`; uma fonte só.

### 3.1 Grafo atual (16/10/2026, `npm run arquitetura -- --grafo`)

| Origem → destino | Importações | Natureza |
|---|---|---|
| gestão → financeiro | 16 | datas (kernel), `Celula/VerTudo` (kernel), `csv` (kernel), rótulos de glosa (público) |
| gestão → comercial | 11 | `Filtros` (kernel), `opcoes.ts` (público de **cadastros**, mal localizado) |
| qualidade → financeiro | 7 | só datas (kernel) |
| comercial → financeiro | 4 | datas (kernel), `planoPorChave` (vira público) |
| compras → financeiro | 4 | datas, `planoPorChave`, `garantirMesAberto` (viram público) |
| estoque → comercial | 4 | `Filtros` (kernel) |
| qualidade → comercial | 3 | `Filtros` (kernel) |
| cadastros → qualidade | 3 | `DocumentosCard` (violação de UI) |
| cadastros ↔ financeiro | 1 + 1 | `tipoChavePix` / `checarCnpj` (kernel de documentos brasileiros) |
| `src/lib/pendencias.ts` → financeiro, comercial, qualidade, components | 5 | kernel dependendo de módulo (composição mal localizada) |
| `src/components/app-shell.tsx` → `src/app/tema-actions.ts` | 1 | kernel dependendo do app |
| escritas cruzadas | 12 | compras → ContaPagar (5), Lote (2), Produto (1); comercial → ContaReceber; estoque → Cirurgia/CirurgiaConsumo; cadastros → LocalEstoque |

**Ciclo:** {cadastros, comercial, financeiro, qualidade}. Cai quando saem datas, `Filtros`, documentos brasileiros e o `DocumentosCard` (ARQ-01, ARQ-02, ARQ-03, UI-03).

Conclusão: das 68 violações, **~45 são kernel mal localizado** (datas, filtros, `Celula`, CSV, CNPJ). Só 12 são escrita cruzada de verdade, e são elas que importam para a regra de negócio.

## 4. Kernel compartilhado

| Onde | O que mora lá hoje | O que entra (backlog) |
|---|---|---|
| `src/lib/db.ts`, `auth.ts`, `forms.ts`, `erros.ts`, `format.ts` | Prisma, sessão/`requireUser`, `parseForm`/`audit`/`errorMessage`, `ErroNegocio`, formatação | — |
| `src/lib/estoque.ts` | `movimentar`, `LOCAIS`, `localDoHospital` | `atualizarCustoMedio` (com trava da linha do produto), `removerLocalDoHospital` (ARQ-09) |
| `src/lib/upload-seguro.ts`, `busca-util.ts` | upload validado, limitador da busca | — |
| `src/lib/datas.ts` (novo) | — | todo `financeiro/_lib/datas.ts` + `comercial/_lib/datas.ts` + `hojeSP` de `pendencias.ts` (ARQ-01) |
| `src/lib/csv.ts` (novo) | — | `csv()` de `financeiro/_lib/aging.ts` + `respostaCsv` de `gestao/_lib/csv.ts` (ARQ-02) |
| `src/lib/documentos-br.ts` (novo) | — | `cadastros/_lib/documentos.ts` (CNPJ/CPF/UF) + `tipoChavePix` de `financeiro/_lib/sispag.ts` (ARQ-03) |
| `src/lib/tema-actions.ts` | — | `src/app/tema-actions.ts` (ARQ-04) |
| `src/components/ui.tsx`, `form.tsx`, `combobox.tsx`, `masks.ts`, `toast.tsx`, `confirm-dialog.tsx`, `print-button.tsx`, `item-adder.tsx`, `icons.tsx` | design system | — |
| `src/components/filtros.tsx` (novo) | — | `comercial/_components/filtros.tsx` (ARQ-02) |
| `src/components/lista.tsx` (novo) | — | `Celula`, `VerTudo`, `SemRecuo` de `financeiro/_lib/visual.tsx` (ARQ-02) |
| `src/components/nav.ts`, `app-shell.tsx`, `topbar-menus.tsx`, `busca-global.tsx`, `sidebar` | shell | sai o "+ Novo" (UI-01) |

`src/lib/pendencias.ts` **não é kernel**: agrega números de quatro módulos. Vai para `src/app/(app)/_painel/` (ARQ-05). Pasta com `_` fica fora do roteamento (Next 16, `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`, seção "Private folders"; a mesma página descreve a organização "Split project files by feature or route" que este projeto usa).

`ThOrdenavel`/`ordem.ts` (`gestao/_lib/`) é genérico mas só a gestão usa: fica onde está até o segundo uso.

## 5. Padrão de camadas por módulo

```
<modulo>/<rota>/page.tsx      Server Component fino: requireUser, lê searchParams, chama consultas, renderiza.
<modulo>/<rota>/actions.ts    "use server": requireUser → parseForm (zod) → db.$transaction(tx => servico(tx, …)) → audit → revalidatePath.
   ou <modulo>/_lib/*-actions.ts quando a action serve a várias rotas do módulo (ex.: financeiro receber/pagar).
<modulo>/_lib/*-servico.ts    import "server-only"; funções (tx: Tx, …) transacionais com a regra de negócio. Testáveis sem login (tests/*-db).
<modulo>/_lib/*.ts            regras puras (sem Prisma), testadas em tests/<modulo>/.
<modulo>/_lib/consultas|queries|dados.ts   leituras reutilizadas pelas telas do módulo.
<modulo>/_lib/publico.ts      única porta de entrada para outros módulos (re-exporta ou define funções).
<modulo>/_lib/*.tsx           UI interna reutilizada por mais de uma rota do módulo (permitido; não precisa de _components/).
```

Decisões de convenção (para acabar com as variações sem renomear meio sistema):
- Action fica em arquivo cujo nome termina em `actions.ts`. Corrigir só o desvio `comercial/cirurgias/anexos.ts` (ARQ-12).
- `_components/` não é obrigatório; `_lib/*.tsx` vale igual. A única pasta `_components` (comercial) some no ARQ-02.
- Tudo em português (nomes de funções, arquivos e UI); termos técnicos em inglês só quando são do framework (`page`, `layout`, `route`).
- Erro para o usuário: só `ErroNegocio` (já uniforme; `errorMessage()` esconde o resto). Manter.
- Data: sempre pelos helpers de `src/lib/datas.ts`. Proibido `3 * 60 * 60 * 1000` solto (aparece em `src/app/(app)/page.tsx:47,74,79` e em `pendencias.ts:15`).
- `"use client"`: só 14 arquivos, todos com motivo (formulários, combobox, menus, toasts). Está bom; não há bundle cliente desnecessário relevante. O `topbar-menus.tsx` (276 linhas, cliente) encolhe com o UI-01.

## 6. Desvios encontrados (o que o verificador não pega)

| # | Onde | Problema | Ação |
|---|---|---|---|
| D1 | `compras/_lib/recebimento.ts:122-135` | cria `ContaPagar` direto, **sem `garantirMesAberto`** (regra do HANDOFF §9 "toda mutação financeira com data"). Hoje não quebra porque a competência é sempre hoje e só se fecha mês passado, mas a regra está fora do dono. | ARQ-06 |
| D2 | `comercial/_lib/nf.ts:16-27` | mesmo caso para `ContaReceber`. | ARQ-06 |
| D3 | `compras/_lib/importacao-servico.ts:147-224` | `exigirContaAlteravel` (status, baixa, SISPAG ativa, mês fechado) é regra do financeiro escrita dentro de compras. | ARQ-06 |
| D4 | `compras/_lib/recebimento.ts:96-99` | custo médio: lê `produto.custoMedio` e grava sem trava. Dois recebimentos simultâneos do mesmo produto em pedidos diferentes (`travarPedido` só trava o pedido) perdem uma atualização. | ARQ-09 (`SELECT … FOR UPDATE` no produto) |
| D5 | `estoque/_lib/remessas.ts:212-223` e `comercial/cirurgias/actions.ts:110-135` | duas implementações de "registrar consumo na cirurgia" com condições de status diferentes (`AGENDADA/CONFIRMADA → REALIZADA` vs `!== REALIZADA`). | ARQ-07 |
| D6 | transações inline em actions (não testáveis sem login): `comercial/cirurgias/actions.ts:110,~150`, `comercial/pedidos/actions.ts:43`, `qualidade/quarentena/actions.ts:39`, `estoque/ajustes/actions.ts`, `financeiro/_lib/conciliacao-actions.ts:97,127,157`, `financeiro/_lib/sispag-actions.ts:43,69,106`, `financeiro/_lib/aprovacao-actions.ts:20` | regra de estoque/dinheiro fora de `*-servico.ts` | ARQ-11 |
| D7 | `src/app/(app)/page.tsx:47-62` | o painel consulta Cirurgia/PedidoVenda direto e calcula vendas de 6 meses inline | ARQ-05 |
| D8 | `hojeUTC` reexportado em `compras/_lib/perfis.ts`, `qualidade/_lib/datas.ts`, `comercial/_lib/datas.ts`; `hojeSP` em `lib/pendencias.ts` | quatro portas para a mesma data | ARQ-01 |
| D9 | `qualidade/_lib/print-button.tsx` | cópia idêntica de `components/print-button.tsx` | ARQ-12 |
| D10 | `db.hospital.findMany({ where: { ativo: true } … })` repetido em `estoque/remessas/page.tsx:43`, `estoque/remessas/nova/page.tsx:15`, `estoque/inventario/page.tsx:27`, `estoque/inventario/novo/page.tsx:10`; produtos ativos em 8 telas | consulta duplicada | ARQ-10 (opcional) |
| D11 | N+1 em laços dentro de transação: `financeiro/_lib/sispag-servico.ts:73`, `cobranca-servico.ts:137`, `estoque/_lib/remessas.ts:94` | aceitável no volume atual (retornos de dezenas de linhas); rever se um retorno passar de ~500 linhas | nenhuma agora |
| D12 | arquivos perto do limite de 500 linhas: `financeiro/_lib/cobranca.ts` (478), `sispag.ts` (346) | nenhum passa de 500 | dividir se crescer |
| D13 | índices ausentes para filtros frequentes (Postgres não indexa FK sozinho): `ContaReceber(status, vencimento)`, `ContaReceber(hospitalId)`, `ContaPagar(status, vencimento)`, `ContaPagar(fornecedorId)`, `ContaPagar(pedidoId)`, `Cirurgia(dataHora)`, `Cirurgia(status)`, `CirurgiaConsumo(loteId)` (recall), `CirurgiaConsumo(cirurgiaId)`, `PedidoVenda(status, faturadoEm)`, `Lote(status)`, `Lote(validade)`, `Saldo(localId)`, `Movimento(origemId)`, `Movimento(destinoId)`, `RemessaItem(remessaId)`, `LogAuditoria(criadoEm)` | irrelevante com centenas de linhas; vira problema com dezenas de milhares | ARQ-13 **feito**: 10 criados, os demais rejeitados com medição (ver §9.1 ARQ-13) |

Pontos positivos verificados: toda Server Action exportada chama `requireUser`, menos as duas legítimas (`login/actions.ts` e `tema-actions.ts`, que só grava o cookie de tema); nenhum arquivo acima de 500 linhas; erro ao usuário uniforme; `server-only` nos serviços; client components enxutos; serviços transacionais já existem e são testados em financeiro, compras, qualidade e estoque.

## 7. Elementos cruzados de UI (pedido do dono do produto)

| # | Onde | O que faz hoje | Decisão |
|---|---|---|---|
| C1 | `components/topbar-menus.tsx:64-95` (`MenuNovo`), `:106` (atalho N), `:243-267`; `components/novo-atalhos.ts`; `components/app-shell.tsx:154` | botão global "+ Novo" com 8 atalhos de criação de 5 módulos | **Remover** (UI-01). Toda lista do módulo já tem seu botão "Novo" (conferido: cirurgias, orçamentos, pedidos de compra, títulos, remessas, cadastros). |
| C2 | `src/app/(app)/page.tsx:115` ("Nova cirurgia") e `:152` ("Agendar cirurgia") | criar cirurgia pelo painel | **Remover** (UI-02) |
| C3 | `src/app/(app)/page.tsx:28-39` e `lib/pendencias.ts` (`acao`: "Cobrar", "Comprar", "Faturar", "Aprovar", "Regularizar") | botões de pendência que levam à lista do módulo | **Manter só leitura**, com rótulo neutro "Abrir" (UI-07). São navegação, não criação. |
| C4 | sino (`topbar-menus.tsx` `Sino`, `/api/pendencias`) | lista de pendências com links | **Manter** como navegação só leitura. Sem botões de ação. |
| C5 | `cadastros/fornecedores/[id]/page.tsx:41`, `produtos/[id]/page.tsx:23`, `fabricantes/[id]/page.tsx:31` → `qualidade/documentos/documentos-card.tsx` | cartão "Documentos" com botão "Incluir" dentro do cadastro | **Mover para a qualidade** (UI-03): tirar o cartão; a lista `/qualidade/documentos` ganha filtro por fornecedor/fabricante/produto; no cadastro fica no máximo um link "Documentos e licenças" para essa lista filtrada. |
| C6 | `cadastros/hospitais/[id]/page.tsx:24-25,54` e `[id]/paineis.tsx` | stats "A receber (aberto)/vencido", estoque consignado e últimas cirurgias dentro do cadastro | **Tirar os painéis** (UI-04); deixar links só leitura: `/comercial/cirurgias?hospital=`, `/estoque/saldos?local=`, `/financeiro/receber?hospital=` (só para quem enxerga cada módulo). Se o dono quiser uma "visão 360 do cliente", ela é um relatório da gestão, não parte do cadastro. Atualizar a especificação HANDOFF §9.1.3. |
| C7 | `cadastros/fornecedores/fornecedor-form.tsx:27-31`, `actions.ts:12,49`, `cadastros/_lib/permissoes.ts` | dados bancários/Pix (só FINANCEIRO) editados no cadastro | **Mover para o financeiro** (UI-05): tela "Favorecidos" em `/financeiro/favorecidos`. As colunas continuam em `Fornecedor` (ADR-5). |
| C8 | `comercial/cirurgias/[id]/page.tsx:109` ("Gerar remessa/vale" → `/estoque/remessas/nova?cirurgiaId=`) | o comercial dispara a criação de documento do estoque | **Mover para o estoque** (UI-06): `/estoque/remessas` ganha "Cirurgias aguardando vale" com o botão "Gerar vale"; a cirurgia mostra as remessas só leitura e "vale pendente". |
| C9 | `qualidade/documentos/actions.ts:34-36` | revalida rotas de cadastros por causa do cartão | sai junto com UI-03 |
| C10 | links só leitura entre módulos (ex.: pedido de venda → título, pedido de compra → conta a pagar, kardex → lote, rastreabilidade → pedido de compra) | navegação | **Manter.** Estão de acordo com a regra. |

**O que sobra no Painel** (`/`): página só leitura, sem nenhum botão de criar.
- Indicadores por perfil, cada um com link para o módulo dono: comercial (cirurgias hoje/7 dias, vendas e margem do mês, a faturar), financeiro (a receber vencido, a pagar em 7 dias, só FINANCEIRO/ADMIN), estoque/qualidade (quarentena, vencendo).
- "Próximas cirurgias" (tabela com links) e "Vendas faturadas — 6 meses" (gráfico com link para comissões).
- "Pendências": a mesma lista do sino, só navegação.
- Os números vêm das funções públicas de cada módulo (ARQ-05). O painel não faz `db.*` direto.

## 8. Decisões (ADRs curtos)

**ADR-1 Monólito modular por pastas, verificado por script.**
Contexto: 8 módulos num app Next; importações cruzadas cresciam sem critério (68 violações). Decisão: módulo = pasta de `src/app/(app)`; regras R1-R6 checadas por `scripts/verificar-arquitetura.ts` dentro do `npm test`, com exceções em catraca. Consequências: zero dependência nova; o custo é manter a tabela `DONO` do script quando nascer modelo novo.

**ADR-2 Leitura livre, escrita só pelo dono.**
Contexto: isolar leitura obrigaria a gestão e o painel a passarem por dezenas de funções de consulta sem regra nenhuma. Decisão: `findMany/count/aggregate` em tabela alheia são permitidos; `create/update/upsert/delete` não. Consequências: relatórios continuam simples; as regras de gravação (mês fechado, plano, quarentena, status da cirurgia) ficam num lugar só. Risco aceito: uma tela pode ler uma coluna cujo significado o dono muda; mitigado porque o schema é um só e o `tsc` acusa campos removidos.

**ADR-3 API pública = um arquivo `_lib/publico.ts` por módulo.**
Contexto: não há pacotes; precisamos de uma fronteira barata. Decisão: só `publico.ts` pode ser importado por outro módulo; nele, funções `(tx: Tx, …)` de serviço e constantes/rótulos. Nada de `.tsx`. Consequências: ao mudar algo exposto, o dono sabe quem depende (grep em `publico`).

**ADR-4 Integração entre módulos por chamada síncrona dentro da mesma transação.**
Contexto: recebimento precisa criar lote, movimento, custo e conta a pagar atomicamente. Decisão: o chamador abre `db.$transaction` e passa `tx` à função pública do dono. Sem eventos, filas ou outbox. Consequências: consistência forte e simples; o preço é o acoplamento temporal, aceitável num monólito.

**ADR-5 Dados bancários do fornecedor continuam na tabela Fornecedor.**
Contexto: o dono pediu que o financeiro seja dono das suas telas; separar o modelo exige migration e reescrever SISPAG. Decisão: as colunas `bancoCodigo, agencia, conta, contaDigito, chavePix` ficam em `Fornecedor`, mas só a tela do financeiro as grava (UI-05). No verificador, `fornecedor` passa a ter donos `["cadastros", "financeiro"]` com comentário de que o financeiro só grava essas colunas. Consequências: zero migration agora; se aparecer mais dado de pagamento (vários favorecidos por fornecedor), aí sim criar `DadosPagamento` do financeiro.

**ADR-6 Núcleo de estoque é kernel, não módulo.**
Contexto: comercial, compras, qualidade e estoque movimentam saldo. Decisão: `src/lib/estoque.ts` é o único que grava `Saldo`, `Movimento` e `LocalEstoque` (já era convenção do HANDOFF §5.2) e passa a concentrar `custoMedio` (é avaliação de estoque, depende do saldo total). Consequências: `produto` ganha o kernel como segundo dono só para `custoMedio`.

**ADR-7 Painel e sino são composição só leitura.**
Contexto: `src/lib/pendencias.ts` importava serviços de 3 módulos (kernel dependendo do app). Decisão: o agregador vai para `src/app/(app)/_painel/`; cada módulo expõe seus contadores no `publico.ts`; o painel e o sino só navegam. Consequências: o painel não oferece criação (pedido do dono) e não conhece tabelas.

**ADR-8 Fluxo entre módulos começa no módulo que cria o documento.**
Contexto: "Gerar remessa" na cirurgia, "Incluir documento" no cadastro, "+ Novo" global. Decisão: cada módulo mostra a sua fila de trabalho (ex.: estoque lista cirurgias sem vale) e o botão de criar fica lá. O módulo de origem mostra só o estado (só leitura) com link. Consequências: um clique a mais em alguns fluxos; em troca, cada perfil acha suas tarefas no seu módulo.

## 9. Backlog de refatoração

Cada item: **arquivos**, **mudança**, **validação**, **risco**, **onda**. Validação comum a todos: `npx tsc --noEmit`, `npm test` (inclui o verificador), `npm run test:db` quando tocar serviço, e **apagar as exceções do item** em `scripts/arquitetura-excecoes.ts`.

**Antes de começar:** esperar o agente que está editando comercial/glosa/gestão fazer commit. Os itens da onda 1 mexem em importações dessas pastas.

### 9.1 Arquitetura

**ARQ-01 Kernel de datas** — onda 1, executor único. `[MÉDIA | Sonnet | low]`, mecânico.
- Criar `src/lib/datas.ts` com tudo de `financeiro/_lib/datas.ts`, as funções de `comercial/_lib/datas.ts` (`parseDataHoraSP`, `diaSP`, `inicioDiaSP`, `somaDias`, `segundaDaSemana`, `periodo`) e `hojeSP` de `lib/pendencias.ts:14`.
- Apagar `financeiro/_lib/datas.ts`, `comercial/_lib/datas.ts`, `qualidade/_lib/datas.ts` (mover `somarDias`/`PERFIS_QUALIDADE` para um `qualidade/_lib/perfis.ts`) e a reexportação em `compras/_lib/perfis.ts`.
- Trocar as importações em financeiro, comercial, compras, qualidade, gestão, `lib/pendencias.ts` e tests (`grep -rn "_lib/datas\|hojeUTC" src tests`).
- Validação: os testes de datas em tests/financeiro e tests/gestao/periodo continuam passando; 17 exceções ARQ-01 saem.
- Risco: baixo (só caminho de import). Conflito alto com qualquer trabalho em paralelo: fazer sozinho.

**ARQ-02 Kernel de UI de listagem e CSV** — onda 1, após ARQ-01, mesmo executor. `[MÉDIA | Sonnet | low]`
- `comercial/_components/filtros.tsx` → `src/components/filtros.tsx` (apagar a pasta `_components`).
- `Celula`, `VerTudo`, `SemRecuo` de `financeiro/_lib/visual.tsx` → `src/components/lista.tsx`; apagar `visual.tsx`.
- `csv()` de `financeiro/_lib/aging.ts:41` + `respostaCsv`/`pct` de `gestao/_lib/csv.ts` → `src/lib/csv.ts`; `aging.ts` e `financeiro/relatorios/exportar/route.ts` passam a importar de lá; apagar `gestao/_lib/csv.ts`.
- Validação: `tests/financeiro/aging.test.ts:3` importa `csv` de `aging.ts`: passar a importar de `src/lib/csv.ts`; abrir `/gestao/abc` e `/estoque/saldos`. 18 exceções saem.
- Risco: baixo.

**ARQ-03 Kernel de documentos brasileiros** — onda 1. `[FÁCIL | Haiku | medium]`
- `cadastros/_lib/documentos.ts` → `src/lib/documentos-br.ts`; mover `tipoChavePix` de `financeiro/_lib/sispag.ts` para o mesmo arquivo (o `sispag.ts` importa de lá).
- Importadores: `cadastros/*/actions.ts`, `cadastros/*-form.tsx`, `financeiro/_lib/contas-actions.ts:10`, testes de sispag.
- Validação: `tests/financeiro/sispag.test.ts`; 2 exceções saem; com ARQ-01/02 e UI-03 o ciclo some (trocar a linha `ciclo` pela nova, se ainda houver).
- Risco: baixo.

**ARQ-04 Tema fora de src/app** — onda 2, junto com UI-01 (mesmo arquivo `app-shell.tsx`). `[FÁCIL | Haiku | low]`
- `src/app/tema-actions.ts` → `src/lib/tema-actions.ts`; atualizar `components/app-shell.tsx:10` e quem mais importar.

**ARQ-05 Painel e pendências como composição** — onda 3 (depois de ARQ-06/07/08). `[MÉDIA | Sonnet | high]`, mexe em números que os usuários veem.
- Mover `src/lib/pendencias.ts` → `src/app/(app)/_painel/pendencias.ts`; `IconName` vira tipo local ou string.
- Criar/estender `publico.ts`: financeiro (`faixasAbertas`, `contarAprovacoesPendentes`), comercial (`contarCirurgiasSemAutorizacao`, `contarAFaturar`, `indicadoresComerciais(hoje)` com o que hoje está em `page.tsx:47-62,72-85`), qualidade (`contarAlertasDocumentos`, `contarRecolhimentos`, `contarLotesQuarentena`, `contarLotesVencendo`, `contarRegistrosVencendo`), estoque (`contarRemessasAConferir`, `contarAbaixoDoMinimo`).
- `src/app/(app)/page.tsx` e `src/app/api/pendencias/route.ts` passam a usar só `_painel/` e os `publico.ts`; o painel fica sem `db.*`.
- Validação: `tests/negocio-db/pendencias.test.ts` (atualizar import) com os mesmos números; painel aberto com os 6 perfis mostra os mesmos valores de antes. 4 exceções saem.
- Risco: médio (contagens por perfil). Comparar antes/depois.

**ARQ-06 API pública do financeiro para títulos gerados por outros módulos** — onda 2, executor "compras+financeiro". `[DIFÍCIL | Opus | medium]` desenho já está aqui; implementação pode ir para Sonnet `high`.
- Criar `financeiro/_lib/publico.ts` com:
  - `gerarContaPagarTx(tx, { descricao, fornecedorId, pedidoId, categoria, valor, vencimento, competencia, chavePlano })` → `garantirMesAberto` + `planoPorChave` + `aprovadoEm: null`; devolve o id.
  - `alterarContaPagarGeradaTx(tx, id, dados)` e `cancelarContaPagarGeradaTx(tx, id)` com a regra `exigirContaAlteravel` que hoje está em `compras/_lib/importacao-servico.ts:147-157` (trava FOR UPDATE, sem baixa, fora de SISPAG ativa, mês aberto).
  - `gerarContaReceberTx(tx, { descricao, hospitalId, pedidoId, valor, vencimento, competencia, centroCustoId })` com `garantirMesAberto`.
  - reexportar `CATEGORIAS_GLOSA`, `ROTULO_CATEGORIA_GLOSA`, `RECURSOS_GLOSA`, `ROTULO_RECURSO_GLOSA` e tipos (para a gestão).
- Usar em `compras/_lib/recebimento.ts:122-135`, `compras/_lib/importacao-servico.ts:119-224`, `comercial/_lib/nf.ts:16-27`; gestão (`_lib/consultas.ts`, `dados.ts`, `glosas.ts`, `glosas/page.tsx`, `glosas/exportar/route.ts`) passa a importar rótulos de `publico`.
- Validação: `npm run test:db` (recebimento, importacao, faturamento, glosa); **teste novo** em `tests/negocio-db/`: recebimento e registrar NF recusam competência em mês fechado (`garantirMesAberto`). 12 exceções saem.
- Risco: médio (dinheiro). Não mudar valores nem descrições dos títulos; só o lugar da regra.

**ARQ-07 API pública do comercial: consumo em cirurgia** — onda 2, executor "estoque+comercial/cirurgias". `[MÉDIA | Sonnet | high]`
- Criar `comercial/_lib/publico.ts` com `registrarConsumoCirurgiaTx(tx, cirurgiaId, itens)`: cria `CirurgiaConsumo` e muda a cirurgia para REALIZADA. Decidir uma regra de status (sugestão: só a partir de AGENDADA/CONFIRMADA/REALIZADA; recusa FATURADA e CANCELADA com `ErroNegocio`) e documentar.
- Usar em `estoque/_lib/remessas.ts:212-223` e em `comercial/cirurgias/actions.ts:133-134`; extrair o resto da transação de consumo direto e de "remover consumo" para `comercial/_lib/consumo-servico.ts` (parte do ARQ-11).
- Validação: `tests/negocio-db/remessas.test.ts`, `estoque.test.ts`, `faturamento.test.ts`; teste novo do consumo direto. 2 exceções saem.
- Risco: médio (unifica duas regras de status que hoje divergem: D5).

**ARQ-08 API pública da qualidade: lote recebido** — onda 2, mesmo executor do ARQ-06 (mesmo arquivo `recebimento.ts`), depois dele. `[MÉDIA | Sonnet | medium]`
- `qualidade/_lib/publico.ts`: `registrarLoteRecebidoTx(tx, { produtoId, numero, validade, fabricacao, serie })` com o código de `compras/_lib/recebimento.ts:55-79` (lote novo em QUARENTENA; existente com validade diferente → erro; completa série/fabricação).
- Validação: `tests/negocio-db/recebimento.test.ts`. 1 exceção sai.
- Risco: baixo.

**ARQ-09 Custo médio e local do hospital no kernel de estoque** — onda 2, mesmo executor (ARQ-06 → 08 → 09). `[MÉDIA | Sonnet | high]`
- `src/lib/estoque.ts`: `atualizarCustoMedio(tx, produtoId, quantidadeEntrada, valorEntrada)` com `SELECT … FROM "Produto" WHERE id = $1 FOR UPDATE` antes de ler `custoMedio` (corrige D4); usar em `recebimento.ts:96-99`.
- `src/lib/estoque.ts`: `removerLocalDoHospital(tx, hospitalId)` (confere que não há saldo/movimento/remessa e apaga); usar em `cadastros/hospitais/actions.ts:79-88`.
- No verificador, `DONO.produto = ["cadastros", "lib"]` (comentário: lib só `custoMedio`).
- Validação: `tests/negocio-db/recebimento.test.ts` (custo médio igual ao de antes); teste novo com dois recebimentos concorrentes do mesmo produto. 2 exceções saem.
- Risco: médio (trava nova; testar que não dá deadlock com `travarPedido`: sempre travar pedido antes do produto).

**ARQ-10 API pública de cadastros: opções** — onda 3. `[FÁCIL | Haiku | medium]`
- `comercial/_lib/opcoes.ts` → `cadastros/_lib/publico.ts` (é leitura de tabelas de cadastros). Atualizar comercial e gestão (`_lib/dados.ts`, `abc`, `glosas`, `margem`, `vendas`).
- Opcional: trocar os `db.hospital.findMany({ where: { ativo: true } … })` e "produtos ativos" duplicados (D10) por essas funções.
- Validação: telas de filtro da gestão e formulário de cirurgia. 5 exceções saem.

**ARQ-11 Transações das actions para serviços testáveis** — onda 4, um executor por pasta (sem conflito entre eles). `[MÉDIA | Sonnet | medium]`
- comercial: `cirurgias/actions.ts` (consumo, remover consumo) → `_lib/consumo-servico.ts`; `pedidos/actions.ts:43` (cancelar) → `_lib/nf.ts` ou `_lib/pedido-servico.ts`.
- qualidade: `quarentena/actions.ts:39` → `_lib/inspecao-servico.ts`.
- estoque: `ajustes/actions.ts` → `_lib/ajustes-servico.ts`.
- financeiro: `_lib/conciliacao-actions.ts:97,127,157` → `_lib/conciliacao-servico.ts`; `_lib/sispag-actions.ts:43,69,106` → `_lib/sispag-servico.ts`; `_lib/aprovacao-actions.ts:20` → `_lib/titulos.ts` ou `aprovacao-servico.ts`.
- Validação: cada serviço ganha teste em `tests/negocio-db` ou `tests/financeiro-db`; a action fica com auth+parse+audit+revalidate.
- Risco: baixo por item (refactor sem mudar comportamento).

**ARQ-12 Higiene** — qualquer onda, itens pequenos. `[FÁCIL | Haiku | low]`
- Apagar `qualidade/_lib/print-button.tsx` e usar `@/components/print-button` (3 telas de qualidade).
- `comercial/cirurgias/anexos.ts` → `anexos-actions.ts`.
- `um()` duplicado (`qualidade/documentos/page.tsx:16`, `gestao/_lib/consultas.ts:14`) → `src/lib/forms.ts` ou `format.ts`.
- `3 * 60 * 60 * 1000` soltos em `src/app/(app)/page.tsx` → helpers de `src/lib/datas.ts` (fazer no ARQ-05).

**ARQ-13 Índices** — onda 4, revisão do arquiteto + migration. `[DIFÍCIL | Opus | medium]`
- Os índices de D13, numa migration só (`CREATE INDEX CONCURRENTLY` não roda dentro da transação do `migrate`; em produção com tabela grande, aplicar à mão). Medir com `EXPLAIN ANALYZE` nas telas de títulos, kardex e painel antes de decidir a lista final.
- **Feito (16/10/2026)**, migration `20261016180000_indices_consultas_frequentes`. Medição: Postgres 17, volume sintético de ~5 anos (LogAuditoria 1M, Movimento 600k, CirurgiaConsumo e RemessaItem 200k, Lancamento 120k, títulos 110k, Cirurgia/Remessa/PedidoVenda 25k) num schema descartável, tempos de `EXPLAIN ANALYZE` com cache quente. Critério: só entra índice com ganho claro em consulta que roda a cada abertura de tela (lista padrão, painel, detalhe) ou em rastreabilidade; o resto fica anotado com o gatilho para rever.

  | Índice criado | Consulta (onde) | Antes → depois | Tamanho a 5 anos |
  |---|---|---|---|
  | `ContaReceber(status, vencimento)`, `ContaPagar(status, vencimento)` | lista padrão ABERTO por vencimento, totais "vencido", painel (a pagar 15 dias), fluxo, aging, conciliação, aprovações, SISPAG | 4,4 → 0,09 ms (lista); 5,1 → 0,02 ms (painel); 2,0 → 0,4 ms (totais) | 1,5–1,9 MB cada |
  | `Lancamento(data)` | painel (entradas/saídas do mês), fluxo, "pago no período" das listas: intervalo de datas sem `contaId`, que o `(contaId, data)` não atende | 18,6 → 0,2 ms | 2,7 MB |
  | `Cirurgia(dataHora)` | lista (dataHora desc, take 300), agenda, painel, comissões | 2,8 → 0,05 ms | 0,6 MB |
  | `CirurgiaConsumo(cirurgiaId)`, `Remessa(cirurgiaId)` | detalhe da cirurgia, `_count` da lista de cirurgias, cirurgias aguardando vale; FK com cascata | 6,1 → 0,02 ms (detalhe); `_count` 16,7 → 0,7 ms | 1,9 / 0,6 MB |
  | `CirurgiaConsumo(loteId)` | rastreabilidade lote → paciente e recall (`qualidade/_lib/rastreio.ts`, `recolhimento-servico.ts`) | 5,1 → 0,03 ms | 1,9 MB |
  | `RemessaItem(remessaId)` | detalhe da remessa; FK com cascata | 7,9 → 0,02 ms | 1,9 MB |
  | `PedidoVenda(status, faturadoEm)` | painel (vendas do mês e 6 meses), comissões, DRE, gestão | 3,7 → 0,2 ms | 0,8 MB |
  | `LogAuditoria(criadoEm)` | `admin/auditoria` (página por data desc, com ou sem filtro de entidade) | 57 → 0,02 ms | 21 MB (custo de escrita medido: ~0,5 µs por linha) |

  Rejeitados (com o porquê):
  - `Movimento(origemId, criadoEm)` + `Movimento(destinoId, criadoEm)`: kardex filtrado só por local foi de 15,5 para 12,5 ms; custaria 40 MB na tabela de maior escrita. O kardex por produto já usa `(produtoId, criadoEm)`.
  - `Movimento(tipo, criadoEm)`: relatórios de gestão e sugestão de compra, 15 → 2 ms, mas são telas ocasionais e o índice teria 18 MB na tabela mais escrita. Primeiro candidato quando Movimento passar de ~1M linhas.
  - `Saldo(localId)`: lotes disponíveis no depósito 4,9 → 3,8 ms (o custo está no JOIN com Lote, não no filtro).
  - `Lote(status)`, `Lote(validade)`: Lote tem ~20k linhas a 5 anos; os contadores do painel custam ~4 ms e pioraram com o índice (o custo é o `EXISTS` em Saldo).
  - `ContaReceber(hospitalId)`, `ContaPagar(fornecedorId)`: na lista com parceiro o `(status, vencimento)` já resolve (0,4 ms); com status PAGO são 2 ms. `ContaPagar(pedidoId)` / `ContaReceber(pedidoId)`: 6 / 3 ms no detalhe do pedido, tela de baixa frequência. Rever se o detalhe do pedido de compra ficar lento.
  - `ExtratoLinha` não conciliado: o índice único de `lancamentoId` já atende `lancamentoId IS NULL` (0,15 ms). Índice parcial dispensado.
  - Busca global (`contains` insensitive → `ILIKE '%q%'`): nenhum btree serve. `pg_trgm` + GIN resolveria, mas exige extensão, índice GIN em cada coluna buscada (descrição, paciente, lote, NF), escrita mais cara e o `migrate diff` não o declara. Hoje são 11 ms (110k títulos) e 5 ms (cirurgias) com `take 5`: não compensa no MVP. Rever se a busca passar de ~100 ms.
  - Não resolvidos por índice: a página de auditoria ainda faz `count(*)` e `DISTINCT entidade` na tabela inteira (~50 ms cada a 1M linhas). Correção é de aplicação (lista fixa de entidades, contagem estimada), não de índice.

  Para medir de novo (base real ou sintética): `scripts/explain-indices.sql` (só `EXPLAIN` de SELECTs; `-v esquema=public`) e `scripts/explain-indices-seed.sql` (cria o schema descartável `bench_idx` com o volume acima; instruções no cabeçalho). Nenhum índice novo é parcial, então o `migrate diff` não tenta removê-los.

### 9.2 Remoção de elementos cruzados de UI

**UI-01 Remover o "+ Novo" global** — onda 2, executor "components". `[FÁCIL | Haiku | medium]`
- `components/topbar-menus.tsx`: apagar `MenuNovo` (`:64-95`), o atalho N (`:106`, `:267`) e o texto da ajuda; `components/app-shell.tsx:8,154`; apagar `components/novo-atalhos.ts`; tirar o teste `atalhosDoPerfil` de `tests/busca/busca-util.test.ts:4,33-40`; tirar `"novo"` de `MenuId`.
- Validação: `npm test`; barra superior com os 6 perfis.

**UI-02 Painel só leitura** — onda 3, junto com ARQ-05. `[FÁCIL | Haiku | low]`
- `src/app/(app)/page.tsx`: tirar `actions` do `PageHeader` (`:115`) e o `emptyAction` (`:152`).

**UI-03 Documentos fora dos cadastros** — onda 2, executor "cadastros+qualidade/documentos". `[MÉDIA | Sonnet | medium]`
- `qualidade/documentos/page.tsx`: filtro por `fornecedorId|fabricanteId|produtoId` (e o "Novo documento" já pré-preenche o escopo via querystring, como faz o cartão hoje).
- Tirar `<DocumentosCard>` de `cadastros/fornecedores/[id]/page.tsx:5,41`, `produtos/[id]/page.tsx:5,23`, `fabricantes/[id]/page.tsx:4,31`; no lugar, opcionalmente um link de texto para `/qualidade/documentos?escopo=…&<campo>=<id>` visível só para `podeVerDocumentos`.
- Apagar `qualidade/documentos/documentos-card.tsx`, `documentosDoCadastro` (se ficar sem uso) e as revalidações `qualidade/documentos/actions.ts:34-36`.
- Validação: `tests/qualidade/documentos.test.ts`, `tests/negocio-db/documentos.test.ts`. 3 exceções saem.

**UI-04 Detalhe do hospital sem painéis de outros módulos** — onda 2, mesmo executor do UI-03. `[FÁCIL | Haiku | medium]`
- `cadastros/hospitais/[id]/page.tsx`: tirar as consultas `:14-25` de saldo/contas a receber, os `Stat` financeiros (`:54…`) e os painéis; apagar `[id]/paineis.tsx`; pôr links só leitura (cirurgias, saldos do local consignado, títulos a receber) conforme o perfil.
- Atualizar `docs/HANDOFF.md` §9.1 item 3.
- Validação: abrir o hospital com COMERCIAL, FINANCEIRO e ESTOQUE.

**UI-05 Dados bancários do fornecedor no financeiro** — onda 3. `[MÉDIA | Sonnet | medium]`
- Criar `/financeiro/favorecidos` (lista de fornecedores com situação dos dados de pagamento) e `/financeiro/favorecidos/[id]` (form com `bancoCodigo, agencia, conta, contaDigito, chavePix`), actions em `financeiro/_lib/favorecidos-actions.ts` com `requireUser(["FINANCEIRO"])`, validação Pix de `src/lib/documentos-br.ts` e audit mascarado (como hoje em `cadastros/fornecedores/actions.ts:49`).
- Tirar esses campos de `cadastros/fornecedores/fornecedor-form.tsx:27-31` e de `cadastros/fornecedores/actions.ts`; apagar `podeDadosBancarios`/`mascarar` de `cadastros/_lib/permissoes.ts` se ficarem sem uso; item novo no menu do financeiro (`components/nav.ts`).
- Verificador: `DONO.fornecedor = ["cadastros", "financeiro"]` (ADR-5).
- Validação: `tests/financeiro-db/sispag-e2e.test.ts` continua passando; COMPRAS não vê nem grava dados bancários.
- Risco: médio (segurança: quem muda o destino do pagamento). Revisão do arquiteto antes do commit.

**UI-06 Gerar vale a partir do estoque** — onda 3, depois do ARQ-07. `[MÉDIA | Sonnet | medium]`
- `estoque/remessas/page.tsx`: bloco "Cirurgias aguardando vale" (AGENDADA/CONFIRMADA nos próximos dias, sem remessa não cancelada) com o botão "Gerar vale" → `/estoque/remessas/nova?cirurgiaId=` (só `podeEditar`).
- `comercial/cirurgias/[id]/page.tsx:109`: tirar o `LinkButton`; manter a lista de remessas com links e o texto "vale pendente (estoque)".
- Validação: fluxo cirurgia → vale → conferência com ESTOQUE e COMERCIAL.

**UI-07 Pendências com rótulo neutro** — onda 3, junto com ARQ-05. `[FÁCIL | Haiku | low]`
- `acao` de cada pendência vira "Abrir" (ou o campo sai e o painel usa um rótulo fixo).

### 9.3 Ordem e paralelismo

| Onda | Itens | Executores (pastas sem sobreposição) |
|---|---|---|
| 0 | esperar o commit do trabalho atual em comercial/glosa/gestão | — |
| 1 | ARQ-01 → ARQ-02 → ARQ-03 | **um** executor (mexe em imports de todas as pastas) |
| 2 | (A) ARQ-06 → ARQ-08 → ARQ-09 · (B) ARQ-07 · (C) UI-03 + UI-04 · (D) UI-01 + ARQ-04 | A: `financeiro/_lib/publico.ts`, `compras/_lib`, `comercial/_lib/nf.ts`, `gestao` (só imports de glosa), `src/lib/estoque.ts`, `cadastros/hospitais/actions.ts`. B: `comercial/_lib/publico.ts`, `comercial/cirurgias/actions.ts`, `estoque/_lib/remessas.ts`. C: `cadastros/*/[id]`, `qualidade/documentos`. D: `src/components`, `src/app/tema-actions.ts`, `tests/busca` |
| 3 | (E) ARQ-05 + UI-02 + UI-07 · (F) UI-05 · (G) UI-06 · (H) ARQ-10 | E: `_painel`, `page.tsx`, `api/pendencias`, acréscimos nos `publico.ts` (já criados na onda 2). F: `financeiro/favorecidos`, `cadastros/fornecedores`, `nav.ts`. G: `estoque/remessas/page.tsx`, `comercial/cirurgias/[id]/page.tsx`. H: `cadastros/_lib/publico.ts`, imports em comercial e gestão |
| 4 | ARQ-11 (um executor por módulo), ARQ-12, ARQ-13 | por pasta |

Ao fim da onda 3, `scripts/arquitetura-excecoes.ts` deve estar vazio. A partir daí, qualquer importação cruzada nova quebra o `npm test`.
