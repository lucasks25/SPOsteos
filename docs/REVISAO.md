# Revisão de código e segurança — Sistema de Gestão OPME

> Estado em 13/10/2026. Complementa o `docs/HANDOFF.md` (arquitetura, convenções e status).
> Objetivo: servir de roteiro para revisão de código, endurecimento de segurança e validação antes de produção.
> Cada item tem **onde está**, **o risco** e **a correção sugerida**. Itens marcados *confirmado* foram reproduzidos.

---

## 1. Segurança — achados priorizados

### P1 — corrigir antes de qualquer uso com dados reais

**1.1 Anexos de cirurgia acessíveis sem login — ✅ CORRIGIDO em 13/10**
- Era: arquivos em `public/uploads/...` e o `matcher` do `src/proxy.ts` excluía `uploads` da checagem de sessão. Um arquivo de teste respondia HTTP 200 sem cookie.
- Agora: `comercial/_lib/anexos.ts` grava em `storage/uploads/cirurgias/<id>/` (no `.gitignore`), e o proxy não tem mais exceção para `uploads`. O acesso é só pela rota autenticada `comercial/cirurgias/[id]/anexos/[anexoId]`.
- Verificado: upload de PDF de 1,5 MB pela tela. Sem login, o caminho antigo e a rota respondem 307 para `/login`. Com login, a rota devolve o PDF íntegro (200, `application/pdf`).
- Para produção (Supabase, previsto para depois): usar bucket **privado** do Supabase Storage e manter a leitura pela mesma rota (ou URL assinada de curta duração gerada após `requireUser`).

**1.2 Mensagens internas de erro mostradas ao usuário — ✅ CORRIGIDO em 13/10**
- Era: `errorMessage()` devolvia `e.message` de qualquer erro, e a tela chegou a mostrar a consulta Prisma inteira.
- Agora: `src/lib/erros.ts` define `ErroNegocio`. As classes de domínio (`FinanceiroError`, `EstoqueError`, `FaturamentoError`, `RemessaError`, `CnabError`, `SispagError`, `BoletoError`) estendem `ErroNegocio`, e os 25 `throw new Error("mensagem amigável")` viraram `ErroNegocio`. `errorMessage()` mostra só esses textos. O resto vira "Erro inesperado… código XXXXXXXX", com o detalhe em `console.error` no servidor.
- Verificado: erro de negócio e subclasses mostram a mensagem; duplicidade (P2002) mostra a mensagem amigável; erro tipo Prisma e valor não-Error mostram só o código de referência.
- **Regra para código novo:** mensagem para o usuário = `throw new ErroNegocio("...")` (ou subclasse). `throw new Error` fica para erro de programação/configuração.

### P2 — importante

**1.3 Login sem limite de tentativas**
- Onde: `src/app/login/actions.ts`.
- Risco: força bruta de senha.
- Correção: limitar por IP e por e-mail (ex.: 5 tentativas a cada 15 min) e registrar falhas na auditoria.

**1.4 Senha padrão dos usuários de demonstração**
- Onde: `prisma/seed.ts` (`SEED_PASSWORD ?? "opme1234"`). O `.env` local não define `SEED_PASSWORD`.
- Correção: nunca rodar o seed em produção. Exigir troca de senha no primeiro acesso.

**1.5 Sessão sem revogação**
- Onde: `src/lib/auth.ts`. JWT de 7 dias. O logout só apaga o cookie, e o token continua válido até expirar.
- Atenuante: `getUser()` recusa usuário inativo a cada requisição.
- Correção: tabela de sessões (ou `tokenVersion` no usuário) para invalidar no logout e na troca de senha. Avaliar prazo menor.

**1.6 Concorrência em baixas e recebimentos — ✅ baixas CORRIGIDO em 14/10; recebimento de compra ainda aberto**
- Onde: `financeiro/_lib/titulos.ts` (`registrarBaixa`), `compras/_lib/recebimento.ts`.
- Risco: duas baixas simultâneas do mesmo título podem somar mais que o valor, porque não há trava de linha. No recebimento, a checagem `recebido > quantidade` depois do incremento atômico protege a quantidade, mas não a conta a pagar duplicada em corrida.
- Baixas: `registrarBaixa` e `estornarBaixa` travam a linha do título com `SELECT … FOR UPDATE`. Teste de banco: duas baixas simultâneas de 600 num título de 1000, só uma passa.
- Falta: aplicar a mesma trava em `compras/_lib/recebimento.ts` (item do pedido) e na geração de remessa SISPAG (item já em outra remessa).

### P3 — melhorias

- **1.7 Limite de upload global de 11 MB** (`next.config.ts`, `serverActions.bodySizeLimit`). Foi necessário para anexos (10 MB) e extratos (5 MB), mas vale para toda Server Action. Avaliar upload direto para armazenamento ou rota dedicada.
- **1.8 Acesso negado vira erro 500.** `requireUser()` lança `Error("Acesso negado...")`, e a página de erro genérica aparece. Melhor: `forbidden()`/403 com mensagem.
- **1.9 Remessas SISPAG guardadas no banco** (`RemessaPagamento.conteudo`), com dados bancários de fornecedores. O acesso é restrito ao perfil FINANCEIRO e o download passa pela rota autenticada com `no-store`. Definir política de retenção.

### Pontos positivos verificados
- Toda page, Server Action e rota chama `requireUser` (checado em 13/10).
- Toda mutação grava `LogAuditoria`.
- Entradas validadas com zod no servidor.
- Uploads de anexo conferem *magic bytes*, e o nome do arquivo é gerado pelo servidor.
- O download da remessa e dos anexos passa por rota autenticada com `Cache-Control: private, no-store`.
- Server Actions do Next têm checagem de origem (proteção contra CSRF).

---

## 2. Integração bancária — o que validar antes de produção

| Item | Base | Situação | Risco | Como validar |
|---|---|---|---|---|
| Extrato CNAB 240 Itaú (`cnab240-extrato.ts`) | Manual Itaú v5.0 (fev/2011) | Testado com arquivos montados pelo manual | Existe a v08.5 (2018), que não conseguimos baixar (403). Pode haver diferença | Pedir ao cliente um arquivo real. O parser confere os totais do trailer e recusa se não baterem, então diferença de layout vira erro, não dado errado |
| OFX (`ofx.ts`) | Padrão OFX 1.x/2.x | Testado com amostras sintéticas | Bancos variam (encoding, vírgula decimal, FITID ausente). Tudo isso é tratado | Importar um OFX real do Itaú do cliente |
| Remessa SISPAG (`sispag.ts`) | Manual SISPAG v085 (out/2020) | Testado campo a campo contra o manual. Nunca enviado ao Itaú | Pontos a confirmar: segmento B do Pix, posições 063–127 (picture 9) preenchidas com zeros; endereço da empresa em branco no header de lote; aviso ao favorecido = 0; finalidade TED 00005; DAC de 2 caracteres na TED | **Itaú Empresas > Transmissão de arquivos > Validação** (o manual recomenda) e depois envio em ambiente de teste |
| Retorno SISPAG | idem | Testado com retorno simulado a partir da remessa | O retorno real pode trazer segmentos Z/B (são ignorados) e ocorrências não mapeadas (viram REJEITADO com "ver nota 8") | Processar um retorno real do ambiente de teste |
| Boletos de fornecedor (`boleto.ts`) | Anexo A do SISPAG | Testado com o exemplo oficial do manual | Baixo | — |
| Cobrança para hospitais (emitir boleto) | — | **Não feito** | — | Precisa do manual atual de cobrança CNAB do Itaú |

**Checklist para o cliente (titular da conta Itaú):**
1. Contratar o SISPAG e a conciliação bancária CNAB 240 (escolher a periodicidade).
2. Validar um arquivo de remessa gerado pelo sistema no validador do Itaú Empresas.
3. Enviar em ambiente de teste e trazer o arquivo de retorno.
4. Fornecer um arquivo de extrato CNAB 240 real (e/ou OFX).
5. Para cobrança: contratar o convênio de cobrança e obter o manual atual.

Regras implementadas que um revisor deve conferir:
- O lote Pix sai sempre em arquivo separado (item 2.2 do manual). Ver `gerarRemessaSispag`.
- O "seu número" `SP<id>` liga o retorno ao item. Reprocessar o mesmo retorno **não** duplica baixa: item já PAGO é ignorado.
- Pagamento confirmado (ocorrência `00`) baixa a conta a pagar com a data e o valor efetivos do retorno, na conta da remessa.
- O título já baixado manualmente é marcado PAGO na remessa, mas não recebe segunda baixa.
- Na conta bancária, o último dígito de `numero` é tratado como DAC (`contaEDac`).

---

## 3. Qualidade de código

| # | Achado | Onde | Sugestão |
|---|---|---|---|
| 3.1 | Testes automatizados do financeiro: 24 unitários (`npm test`) e 7 de banco (`npm run test:db`, usa o `DATABASE_URL`, cria e apaga os próprios dados). Faltam testes de `recebimento.ts`, `faturamento.ts`, `estoque.ts` e das Server Actions | `tests/financeiro/`, `tests/financeiro-db/` | Adicionar testes com banco para `titulos.ts`, `recebimento.ts`, `faturamento.ts`, `estoque.ts` (`movimentar`) e `remessas.ts`. Usar um banco de teste separado |
| 3.2 | 1 erro de lint antigo: `Date.now()` durante o render | `estoque/remessas/nova/page.tsx:11` | Calcular a data fora do componente ou usar `hojeUTC()` |
| 3.3 | Dois `hojeUTC()` com semânticas diferentes | `compras/_lib/perfis.ts` (dia em UTC) vs `financeiro/_lib/datas.ts` (dia em Brasília) | Após as 21h de Brasília, o de compras já é o dia seguinte. Unificar num helper só em `src/lib/` |
| 3.4 | Listas sem paginação (até 200–500 linhas) | listas do financeiro, compras e pedidos | Paginação por `?page=` como especificado para auditoria |
| 3.5 | Painel ainda sem indicadores financeiros | `src/app/(app)/page.tsx` | Ver especificação 9.6 do HANDOFF |
| 3.6 | Formulário perdia os campos após erro de validação (React 19) — **corrigido** | `src/components/form.tsx` | O envio agora é por `onSubmit` + `startTransition`. Revisar se algum formulário dependia do reset automático (só os com `resetOnSuccess`, que agora usam `form.reset()`) |
| 3.7 | Seed com CNPJs inválidos (`11.111.111/0001-11`) | `prisma/seed.ts` | Funciona porque a edição aceita o CNPJ já gravado, mas confunde testes. Usar CNPJs válidos |
| 3.8 | 13 rotas do menu sem página (404) | ver HANDOFF seção 8 | — |

---

## 4. O que foi testado e como (13/10/2026)

| Fluxo | Método | Resultado |
|---|---|---|
| Baixa parcial, quitação, estorno, bloqueios (título pago, conta inativa, baixa conciliada) | Script contra o banco (descartado) e navegador | OK |
| Conciliação OFX: importar, sugerir, conciliar com lançamento, baixar título, lançamento avulso, dedup | Navegador | OK |
| Conciliação CNAB 240: conta errada recusada, dedup na reimportação, baixa de PV-1 e PC-1 pelo extrato | Navegador | OK |
| Fluxo de caixa: saldo inicial, entradas, saídas e acumulado conferidos à mão | Navegador | OK |
| Pedido de compra: criar, recebimento parcial → lote em quarentena, kardex, conta a pagar | Navegador e banco | OK |
| Pedido de venda: registrar NF → conta a receber com prazo do hospital | Navegador (pedido criado direto no banco) | OK |
| SISPAG: cadastro (CNPJ do titular, chave Pix, boleto inválido recusado), remessa TED+boleto, remessa Pix, download, retorno pago/agendado, reprocessamento sem duplicar | Navegador e banco | OK |
| Leitores e geradores (OFX, CNAB 240, boleto, SISPAG) | `npm test` (16 testes) | OK |
| `tsc --noEmit`, `next build` | — | OK |
| `npm run lint` | — | 1 erro antigo (item 3.2) e 7 avisos |

**Não testado:**
- Arquivos reais do Itaú.
- Faturamento a partir de uma cirurgia real (o PV-1 foi criado direto no banco).
- Cancelamentos de pedidos pela tela.
- Concorrência.
- Perfis sem permissão: os testes usaram ADMIN e FINANCEIRO.

---

## 5. Como reproduzir

```bash
docker compose up -d && npm run dev -- -p 3100   # reinicie o dev após migrations
npm test                                         # testes dos leitores/geradores
npx tsc --noEmit && npm run lint && npm run build
```
Usuários de demonstração: `prisma/seed.ts` (senha padrão no próprio seed).

---

## 6. Baixa com juros, multa e desconto; transferência entre contas (14/10/2026)

Desenho feito pelo agente `arquiteto` (Opus) e implementado depois. **Um erro do desenho foi pego pelos testes:** a fórmula escrita (`valor = principal + juros + multa − desconto`) contradizia a própria tabela de exemplos (título 1000 pago com 980 e 20 de desconto). Vale a tabela: o dinheiro abate `principal`, o desconto extingue o resto sem dinheiro, `valor = principal + juros + multa` e extinto = `principal + desconto`. A trava CHECK foi corrigida numa migration à parte (`..._corrige_check_valor_baixa`); a anterior ficou como está para não alterar migration já aplicada.

Pontos para revisão:
- ~15 lugares calculavam saldo com `valorPago`; todos passaram a `valor − valorBaixado`. Critério de aceite: `grep -rn valorPago src` só deve achar exibição de dinheiro movimentado.
- Retorno SISPAG (`sispag-actions.ts`): valor efetivo acima do saldo e título intocado desde a remessa vira **juros**; título mexido depois da remessa **não é baixado** (ocorrência `DIV`, aparece no log de auditoria) e deve ser conciliado pelo extrato. Não conferi no manual v085 se o segmento J do retorno traz desconto/acréscimo nas posições 115–144; hoje a diferença de valor é a única fonte.
- Glosa (redução do recebível sem caixa, comum em OPME) **não está coberta**: desconto exige dinheiro > 0 na baixa. Precisa de um modelo próprio de abatimento.
- Conta com saldo diferente de zero não pode ser inativada (senão painel e fluxo deixam de fechar).
- Não testado: a conciliação com juros/multa/desconto pela tela do extrato (testada só a lógica e a baixa pela tela do título).


## 7. Plano de contas, centros de custo e DRE gerencial (14/10/2026)

Desenho feito pelo agente `arquiteto` (Opus), implementado e conferido por testes. Migration `20261014160000_plano_contas_dre`.

**Modelo.** `PlanoConta` (árvore; só conta analítica e ativa recebe título/lançamento; `chaveSistema` marca as contas que o sistema usa sozinho: RECEITA_VENDA, ESTOQUE, CMV, PERDA_ESTOQUE, GLOSA, JUROS_RECEBIDOS/PAGOS, DESCONTO_OBTIDO/CONCEDIDO), `CentroCusto`, e em `ContaReceber`/`ContaPagar` os campos `planoContaId`, `centroCustoId` e `competencia` (obrigatória; o DRE usa essa data, não o vencimento). `Lancamento` avulso também leva plano e centro; baixa herda do título. CHECK no banco impede plano/centro em baixa ou transferência. O plano padrão é semeado na migration (editável na tela).

**Regras do DRE** (`financeiro/_lib/dre.ts`, parte pura; `dre-dados.ts` lê o banco):
- Título (não cancelado) entra pelo valor inteiro na competência; pagamento parcial não muda receita nem despesa.
- Juros/multa e desconto de cada baixa vão ao resultado financeiro na data da baixa (receber: juros +, desconto −; pagar: juros −, desconto +). Pagar 2.700 + 300 de desconto num título de 3.000 dá despesa −3.000, financeiro +300, efeito líquido −2.700 = caixa.
- CMV = `PedidoVenda.custoTotal` na data do faturamento (fronteira de Brasília). Compra de mercadoria vai para a conta ESTOQUE (fora do resultado).
- Perdas e ajustes de estoque: saída (só origem) = custo, entrada (só destino) = ganho, valor = quantidade × custoUnit.
- Transferências, contas "Fora do resultado" e títulos cancelados ficam de fora. Sem classificação aparece em "Não classificado" e soma no resultado.

**Travas novas:** cancelar a conta a receber de pedido FATURADO é recusado (tiraria a receita e deixaria o CMV). Contas do sistema não podem ser inativadas.

**Testes:** `tests/financeiro/dre.test.ts` (14: exemplo completo conferido à mão, sinais, reembolso, não classificado, meses, regras da árvore) e `tests/financeiro-db/dre.test.ts` (3: cenário real no banco isolado por centro de custo, CHECKs).

**Pendências / não verificado:**
- `custoUnit` da compra: não foi conferido se está em reais ou na moeda da invoice (importação). O CMV depende disso.
- Custos de importação (frete, II, IPI) entram como custo no mês em que ocorrem, não no custo médio.
- Centro de custo do pedido de venda (para filtrar o CMV) ainda não tem campo na tela de pedido; hoje o CMV só aparece sem filtro de centro.
- Glosa: feita em 15/10/2026 (seção 10).
- Fechamento de período: feito em 15/10/2026 (seção 11).
- Drill-down da linha do DRE até o documento: hoje só até a conta do plano.
- Classificação em lote: feita em 15/10/2026 (seção 12).

## 8. Correções da revisão do CNAB (14/10/2026)

Itens 1, 2 e 3 da revisão do `arquiteto` (migration `20261014190000_remessa_cancelar_e_trava`):

1. **Pagar duas vezes (alta):** a geração da remessa agora trava os títulos (`SELECT … FOR UPDATE`) e confere "já está em outra remessa" **dentro** da transação (`sispag-servico.ts`, `gerarRemessaTx`). Defesa extra no banco: índice único parcial `RemessaPagamentoItem_titulo_ativo_key` (um item ENVIADO/AGENDADO por título). O Prisma não declara índice parcial: ao gerar migrations com `migrate diff`, apagar o `DROP INDEX` dele.
2. **Cancelar remessa (alta):** ação "Cancelar remessa" na tela da remessa, com motivo obrigatório e auditoria. Libera os títulos (itens ficam CANCELADO). Recusa se houver item pago ou agendado. O download do arquivo de remessa cancelada é bloqueado (409).
3. **Pagamento em duplicidade (média):** o retorno marca no item `DUP` (banco pagou título já quitado, não baixa de novo), `CAN` (banco pagou item de remessa cancelada: a baixa é feita porque o dinheiro saiu) e `DIV` (valor diferente do saldo). Aparecem em faixa vermelha na remessa, e um aviso na tela do retorno.

Testes: `tests/financeiro-db/remessa.test.ts` (5: concorrência com dois pedidos simultâneos, índice único, cancelar/liberar, DUP, CAN).

**Ainda abertos da revisão (itens 4 a 10):** OFX e CNAB do mesmo período duplicam o extrato; boleto vencido sai pelo valor original; mesmo arquivo pode ser enviado duas vezes ao banco; numeração das linhas J/J-52 a confirmar com o validador do Itaú; retorno não confere agência/conta; dois envios simultâneos do mesmo retorno podem dar baixa parcial dupla. Limite conhecido da nova trava: se o banco agendar um item de remessa já cancelada enquanto o título está em outra remessa ativa, o retorno falha pelo índice único (aparece como erro, nada é gravado pela metade).

**Corrigido depois:** data e hora do header do arquivo SISPAG agora em Brasília (teste: 23h30 em Brasília continua no mesmo dia). Os manuais públicos em download.itau.com.br/bankline (`sispag_cnab.pdf` v085 out/2020 e `conciliacao_bancaria_ 240.pdf` v5.0 fev/2011) são os mesmos em que o código foi baseado; não há versão mais nova nesses endereços.

## 9. Conferência campo a campo contra os manuais (15/10/2026)

Feita pelo `arquiteto` com o texto dos manuais públicos (SISPAG v085 out/2020; Extrato CNAB 240 v5.0 fev/2011). **Nenhuma posição de campo divergiu.** Confirmado: numeração sequencial (A+B e J+J-52 levam o mesmo número, nota 9), totais do trailer (nota 17), forma de cada lote, posições do retorno. Corrigido: telefone Pix agora exige `+55`+11 dígitos e e-mail até 77 caracteres (nota 40).

**O manual não permite confirmar (só arquivo real ou Validador de Layout do Itaú):** se o segmento J do retorno traz data/valor efetivos; em que linha vêm as ocorrências TA e BI (o código ignora trailer, B e J-52); como lançamentos "a compensar" (tipo 2) entram no saldo e totais do extrato. **Conhecido e aceito:** ocorrências FC/FD (COMPROR) caem em REJEITADO; extrato não distingue conta investimento (tipo 0200).

Teste ponta a ponta: `tests/financeiro-db/sispag-e2e.test.ts` (remessa mista 01+41 e remessa Pix → retorno simulado → baixas, caixa, reprocesso, rejeitado volta para nova remessa).

## 10. Glosa (15/10/2026)

Tabela `Glosa` (migration `20261015200000_glosa`, CHECK valor > 0). Só em contas a receber. Regras:
- Extingue parte do título **sem dinheiro**: entra em `valorBaixado` (único escritor continua sendo `recalcularTitulo`), não em `valorPago`. Título 100% glosado fica PAGO com `valorPago` nulo.
- Não passa do saldo; exige motivo; trava de linha como as baixas. Depois da glosa, baixa com desconto também respeita o novo saldo.
- DRE: vai para Deduções (conta do sistema GLOSA), na **data da glosa**, sem reabrir o mês do faturamento. Não vai para o resultado financeiro (diferença para desconto).
- Título com glosa não pode ser editado nem cancelado (estorne a glosa antes); as travas agora usam `valorBaixado IS NULL`.
- Tela: cartão "Registrar glosa" e lista de glosas com estorno no detalhe da conta a receber. Testes: `tests/financeiro-db/glosa.test.ts` (4).
- Não feito: glosa por item do pedido, recurso/reapresentação ao hospital, relatório de glosas por hospital/motivo.

## 11. Fechamento de mês (15/10/2026)

Tabela `FechamentoMes` (migration `20261015210000_fechamento_mes`, CHECK no formato `yyyy-mm`). Tela `/financeiro/fechamento` (últimos 12 meses). Regras:
- Só fecha mês que já terminou e sem lançamento "Não classificado" no DRE. Reabrir exige motivo (auditoria).
- Mês fechado recusa (`garantirMesAberto`, `_lib/fechamento.ts`): baixa e estorno de baixa (pela data da baixa), glosa e estorno, transferência e estorno, lançamento avulso (criar, excluir, lançar pela conciliação), e título (criar, editar, cancelar, reclassificar) cuja **competência** caia no mês. Mudar a competência de um título para ou a partir de mês fechado também é recusado.
- O DRE marca os meses fechados.

**Limites conhecidos:** (1) retorno SISPAG ou conciliação cujo pagamento tenha data em mês fechado é recusado inteiro (a transação desfaz tudo) até reabrir o mês; (2) fechar e alterar ao mesmo tempo (corrida) não tem trava de linha: risco baixo, uma única pessoa fecha; (3) o custo da mercadoria e as perdas de estoque vêm do faturamento e dos movimentos do dia, que sempre caem no mês corrente, então não são congelados por este mecanismo; (4) fechar não guarda foto do DRE: se reabrir e alterar, o DRE muda.

Testes: `tests/financeiro-db/fechamento.test.ts` (3).

## 12. Classificar pendentes em lote (15/10/2026)

`/financeiro/classificar` lista títulos a receber, a pagar e lançamentos avulsos sem conta do plano (até 300 de cada, do mais antigo). Marca-se vários, escolhe-se conta (e centro de custo, opcional) e aplica-se de uma vez (`_lib/classificar.ts`). Tudo ou nada; não sobrescreve item já classificado (outra pessoa pode ter feito); recusa conta de grupo/inativa, baixa de título tratada como avulso e itens em mês fechado. A competência não muda. Testes: `tests/financeiro-db/classificar.test.ts` (4). A base de desenvolvimento hoje não tem nenhum item pendente, então a tela só foi vista no estado vazio; o fluxo com itens foi validado nos testes de banco, não pelo navegador.
