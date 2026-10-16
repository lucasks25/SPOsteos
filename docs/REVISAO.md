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

## 13. Correções da revisão de segurança do MVP (15/10/2026)

Revisão feita pelo `arquiteto` sobre o sistema inteiro (autenticação, as 29 Server Actions e 3 rotas, uploads, injeção, cabeçalhos, dependências). Confirmado OK: toda action/rota tem `requireUser` dentro da função, `$queryRaw` parametrizado, sem `dangerouslySetInnerHTML`, upload de anexo seguro, cookie httpOnly, CSRF por Origin do Next, nenhum segredo no git.

**Corrigido nesta rodada**
- **A1** Dados bancários e Pix de fornecedor: só FINANCEIRO/ADMIN veem e alteram (servidor ignora o campo vindo de outro perfil; a página nem envia o dado ao navegador). Troca de dado bancário vai para a auditoria com antes e depois mascarados.
- **A1 (atualização UI-05, 16/10/2026):** a edição dos dados bancários/Pix saiu do cadastro de fornecedores e foi para `/financeiro/favorecidos` (`requireUser(["FINANCEIRO"])`, serviço que reconfere o perfil, validação de formato, auditoria antes/depois mascarados; lista mostra só o final da conta e da chave). O cadastro não lê nem grava mais essas colunas. Testes: `tests/financeiro/favorecidos.test.ts`, `tests/negocio-db/favorecidos.test.ts`.
- **A2** `AUTH_SECRET` exige 32+ caracteres e recusa o valor de exemplo. `.env.example` agora vem vazio com instrução (`openssl rand -hex 32`).
- **A3** Limite de login: 5 falhas em 15 min por e-mail (e por IP quando há proxy com `x-forwarded-for`); falhas auditadas; comparação de hash mesmo com e-mail inexistente. Testado no navegador (6ª tentativa bloqueada).
- **A4** O seed não roda em produção. Novo `npm run admin:criar` cria os locais de estoque e o primeiro administrador (senha 12 a 72 caracteres, via variáveis de ambiente).
- **M1** Sessão: coluna `Usuario.sessaoVersao` dentro do JWT; troca de senha e logout invalidam todas as sessões; validade caiu de 7 para 1 dia. Testado (sessão derrubada pelo banco volta ao login).
- **M2** Cabeçalhos: X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS; `X-Powered-By` removido.
- **M3** Páginas de fornecedor não levam banco/Pix a quem não é FINANCEIRO/ADMIN.
- **M6** Preço base de produto só o COMERCIAL/ADMIN altera.
- **B2** Telas de usuário não carregam `senhaHash`. **B4** Senha limitada a 72 caracteres (limite real do bcrypt), mínimo 10.

**Não corrigido (decisão de negócio ou melhoria posterior)**
- **M4** Separação de funções em compras: ESTOQUE pode criar/receber pedido com custo inflado e gerar conta a pagar sem aprovação do financeiro. Ideal: conta a pagar nasce "pendente de aprovação". Decidir com o cliente.
- **M5** COMERCIAL registra NF e gera conta a receber. Parece intencional; se o faturamento for só do financeiro, trocar `PERFIS` de `registrarNf`.
- **CSP** (Content-Security-Policy) completa: exige nonce no Next; seguir `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
- **B1** `npm audit`: 4 HIGH só no CLI do Prisma (deepmerge-ts, mysql2); o runtime usa Postgres/adapter-pg. Não rodar `npm audit fix --force` (sobe o Prisma para 8.x).
- **B3** IDs de item sem amarrar ao registro pai (efeito limitado ao que o perfil já pode fazer). **B5** Política de retenção/LGPD de anexos e remessas; anexos em disco local (em hospedagem serverless, usar bucket privado). **Atrás de proxy**: configurar o proxy para sobrescrever `x-forwarded-for` e, com mais de uma instância, definir `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.

## 14. Bugs achados pelos testes de negócio (15/10/2026)

22 testes de integração em `tests/negocio-db/` (estoque, remessa em consignação, recebimento de compra, faturamento e NF) acharam 2 bugs reais, corrigidos:
1. `ajustarSaldo` (estoque) lia o saldo e gravava o valor absoluto: saídas simultâneas perdiam atualização e podiam vender estoque inexistente. Agora é um `UPDATE` atômico que recusa saldo negativo.
2. `hojeUTC` de compras, qualidade e comercial usava a data UTC; entre 21h e 23h59 (Brasília) a competência caía no dia seguinte. Os três agora usam o dia de Brasília.
Também: regra de registrar NF extraída para `comercial/_lib/nf.ts` e testada.

## 15. Fechamento dos pendentes do MVP (16/10/2026)

- **M4 (separação de funções em compras):** `ContaPagar.aprovadoEm/aprovadoPor` (migration `20261016100000`). Conta que nasce do recebimento de compra fica **aguardando aprovação** e é recusada na geração da remessa SISPAG até o FINANCEIRO aprovar em `/financeiro/aprovacoes` (em lote, com auditoria). Contas lançadas à mão pelo financeiro já nascem aprovadas; as existentes foram aprovadas na migration. Quem recebe a compra (COMPRAS/ESTOQUE) não aprova.
- **CSP:** `proxy.ts` gera nonce por requisição e envia `Content-Security-Policy` (scripts só com nonce + strict-dynamic, `object-src 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` em produção). A página de login passou a ser dinâmica (`connection()`) porque página estática não recebe nonce. Testado em build de produção no navegador: login e navegação sem violações. `style-src` aceita inline (atributos `style` do React).
- **M5:** mantido COMERCIAL registrando NF (faturamento do comercial); é decisão de negócio, trocar `PERFIS` em `registrarNf` se o cliente quiser só o financeiro.
- **B3** (amarrar ID de item ao registro pai) e **B1** (`npm audit` só no CLI do Prisma) não foram alterados: efeito limitado / risco de subir o Prisma para 8.x.

## 16. Cobrança dos hospitais — CNAB 400 Itaú, carteira 109 (16/10/2026)

**Fonte:** manual oficial "Cobrança CNAB 400" (jan/2017) em download.itau.com.br/bankline/layout_cobranca_400bytes_cnab_itau.pdf (não há versão mais nova nesse endereço). É o layout que o Itaú publica; boleto **registrado**, carteira **109** (o Itaú registra, você imprime e escolhe o nosso número).

**Módulo puro** (`_lib/cobranca.ts` + `cobranca-tabelas.ts`, 9 testes): remessa (header, entrada 01 com multa/juros, pedido de baixa 02, alteração de vencimento 06, trailer), retorno (confirmação, rejeição com motivos, liquidação, baixa, alteração), nosso número com DAC (módulo 10, exemplo da nota 23), fator de vencimento com o reinício de 22/02/2025, código de barras de 44 dígitos e linha digitável (ida e volta, conferidos por dois caminhos).

**Integração** (`cobranca-servico.ts`, `cobranca-actions.ts`, 6 testes de banco): `/financeiro/cobranca` gera a remessa dos títulos a receber (hospital precisa de endereço, bairro, CEP, cidade e UF; vencimento não pode ter passado), numera o nosso número por conta (sequência travada), pede baixa de boleto de título pago por fora, e importa o retorno. Liquidação → baixa automática do recebimento (valor creditado; excesso vira juros, abatimento vira desconto); duplicidade (título já quitado) é marcada `DUP` e alertada, sem segunda baixa; reprocessar o mesmo retorno não duplica (tabela `CobrancaEvento`); retorno de outra conta é recusado; cancelar remessa libera os títulos. Boleto imprimível em `/financeiro/receber/[id]/boleto` (código de barras ITF), só com registro confirmado e título em aberto. Conta ganha carteira, multa e juros padrão (cadastro da conta). Hospital ganhou bairro e CEP.

**O manual não esclarece (confirmar com retorno real/Validador do Itaú):** se o valor principal do retorno (254-266) já vem sem a tarifa e se inclui juros; se baixa 10 vem junto com liquidação 06; conferência estrita do total do trailer do retorno (se divergir do real, o arquivo é recusado); CNPJ preenchido ou zerado em baixa/alteração; data padrão da multa (usamos o dia seguinte ao vencimento). **Nunca validado com arquivo real.** Antes de usar: convênio de cobrança contratado no Itaú, Validador de Layout, teste com um boleto pequeno.

**Fora do escopo:** carteiras escriturais (impressas pelo Itaú) e as com outro código de barras, protesto/negativação, desconto por antecipação pela tela, alteração de vencimento pela tela (o gerador suporta 06), tarifa de cobrança (aparece como lançamento avulso no extrato), múltiplas contas num mesmo retorno.

## 17. Custo de importação (landed cost) e melhorias de UX (16/10/2026)

**Importação** (`compras/_lib/custo-importacao.ts` puro + `importacao-servico.ts`, migration `20261016130000_custo_importacao`, 8 testes unitários e 5 de banco):
- `PedidoCompraItem.custoUnit` passa a ser **sempre em reais**; na importação o preço na moeda fica em `precoMoeda` (fecha a pendência do custo em moeda da invoice da seção 7). Câmbio por pedido.
- Despesas (frete, seguro, II, IPI, PIS/COFINS, ICMS, AFRMM, despachante, armazenagem, capatazia, transporte nacional, outras) rateadas por valor, quantidade ou peso (ou específicas de um item), com o centavo de sobra no último item. Custo nacionalizado alimenta o kardex e o custo médio no recebimento. Despesa que integra o custo vai para ESTOQUE (fora do resultado) para não contar duas vezes no CMV; tributo recuperável vai para 8.04.
- Depois do primeiro recebimento moeda, câmbio, preços e despesas ficam travados (não recalcula custo já vendido). O recebimento passou a travar o pedido (`FOR UPDATE`), fechando a pendência de concorrência do recebimento.
- **A confirmar com contador e despachante:** regime tributário (Lucro Real: PIS/COFINS/ICMS recuperáveis fora do custo; Presumido: integram), variação cambial entre a DI e o pagamento (não tratada), despesas só em reais, despesas que chegam depois da mercadoria (hoje lançadas à mão no financeiro; "ajuste complementar de custo" é melhoria futura). O sistema não calcula tributos: o usuário digita os valores da DI.

**UX:** máscaras (CNPJ/CPF/CEP/telefone), campo de seleção com busca (mais de 12 opções), diálogo de confirmação próprio, avisos (toast), alerta de alterações não salvas; busca global de dados, "+ Novo" por perfil, sino de pendências (`lib/pendencias.ts`) e atalhos de teclado (Ctrl+K, G+letra, N, ?); módulo Gestão (curva ABC, giro/cobertura, margem, vencimentos, vendas por mês, com CSV e ordenação por coluna).
Limitações conhecidas: agência e conta bancária aceitam só dígitos (hífen é removido ao digitar); aviso de alterações não salvas só vale ao fechar a aba; faltou conferir no navegador o modo escuro do sino e o atalho G+letra.

## 18. Correção dos defeitos da revisão de consistência financeira (16/10/2026)

Os 10 testes "BUG" de `tests/negocio-db/financeiro-invariantes.test.ts` agora passam e foram renomeados para a regra que provam. Regras novas em `tests/negocio-db/financeiro-correcoes.test.ts` (6) e `tests/financeiro/boleto-titulo.test.ts` (3).

**Altos**
- **A1 conciliação concorrente:** `linhaPendente` trava a `ExtratoLinha` (`FOR UPDATE`, sempre antes do título) e `ligar` só grava se `lancamentoId` ainda for nulo ("A linha já foi conciliada.").
- **A2 retorno SISPAG em paralelo:** trava o `RemessaPagamentoItem` antes de ler; o segundo processamento vê PAGO e pula; a atualização do item é condicional (`status <> PAGO`).
- **A3 aprovação:** `alterarContaPagarGeradaTx` zera `aprovadoEm/aprovadoPor` quando muda valor, fornecedor ou vencimento (a conta volta para `/financeiro/aprovacoes`; a remessa já recusa conta sem aprovação). Descrição e conta do plano não derrubam.
- **A4 DRE do estorno de consumo:** `removerConsumoTx` grava RETORNO (antes AJUSTE só com destino = "ganho" no DRE).

**Médios**
- **M1 glosa:** recurso e estorno travam o título, relêem a glosa sob a trava e gravam condicionado ao `recurso` esperado.
- **M2/M3:** conta a pagar em remessa SISPAG ENVIADO/AGENDADO não é editada nem cancelada; título a receber com boleto ENVIADO/REGISTRADO/BAIXA_ENVIADA não muda valor, vencimento nem hospital (cancelar continua permitido). As duas travam a linha do título.
- **M4 retorno de cobrança:** recusa se mais de uma conta ativa casar com agência/conta; índice único parcial normalizado (só dígitos, sem zeros à esquerda) em `ContaBancaria` ativa tipo BANCO. Cadastro e reativação de conta dão mensagem clara. A fixture de `cobranca.test.ts` usava a mesma agência/conta da conta DEMO (0057/72192-0): passou a 0099/99001-2.
- **M5 fluxo:** previsto conta vencimentos a partir de `max(de, hoje)`; o que venceu antes de hoje fica só em "atrasados".
- **M6 (decisão: a mais segura) inventário "cobrar do hospital":** não gera conta a receber (depende de NF/negociação). O AJUSTE de saída leva a marca `COBRAR_HOSPITAL — ` no início da observação (documento `INV-n`) e o DRE não o conta como perda (`MARCA_COBRAR_HOSPITAL` em `lib/estoque.ts`). A lista de inventários ganhou a coluna/filtro "A cobrar" (só leitura) e o FINANCEIRO passou a ver a lista e o detalhe do inventário (`/estoque/inventario?cobrar=1`), sem editar.
- **M7 (decisão):** aprovar conta a pagar não confere mês fechado (não muda DRE nem caixa; a baixa é que respeita o fechamento).

**Baixos:** saldo inicial travado em conta com lançamentos e auditoria "campo: antes → depois" (`salvarContaTx`); retorno SISPAG "pago" com valor efetivo zero vira DIV (não assume o valor da remessa); trocar centro de custo de título com baixa/glosa em mês fechado é recusado.

**Tela:** B1 boleto do fornecedor tem de ter valor e vencimento (fator) iguais aos do título (`divergenciaBoleto`, na criação/edição e de novo na geração da remessa SISPAG; boleto sem valor impresso não é conferido); o detalhe da conta a pagar mostra linha digitável e código de barras. B2 o formulário de baixa limpa após salvar (o valor volta ao saldo novo). B3 conciliação avisa (diálogo) ao lançar avulso com título aberto de mesmo valor e ao baixar título quando já há lançamento igual pendente.

**Migrations:** `20261016190000_estornos_fora_do_dre` (só dados: AJUSTE `CIR-%`/"estorno" → RETORNO; marca nas faltas cobradas de inventário) — **altera o DRE ("Perdas e ajustes de estoque") dos meses afetados, inclusive fechados**; na base de desenvolvimento, 0 linhas. `20261016190100_conta_bancaria_agencia_numero_unica` (índice único parcial por expressão, fora do schema.prisma; o `migrate diff` saiu vazio depois de aplicado; se a migration falhar por duplicata, inative a conta repetida). Sem mudança no schema, `prisma generate` não foi necessário.

## 19. Auditoria de segurança e governança (16/10/2026)

Feita pelo `arquiteto` sobre todas as 37 arquivos `"use server"` (≈120 actions), 13 rotas, login/sessão, CSP e auditoria. Cada achado tem prova (teste que falhava ou reprodução) antes da correção. Itens da seção 13 não foram repetidos.

| # | Sev. | Achado | Prova | Correção | Arquivos |
|---|---|---|---|---|---|
| S1 | **Alta** | **Objeto-operador do Prisma nos argumentos de Server Action.** Os argumentos ligados com `.bind(null, id)` (e qualquer argumento de action) vêm do cliente sem validação de tipo em tempo de execução (o guia `node_modules/next/dist/docs/01-app/02-guides/data-security.md`, seção "Auditing", manda validar). O Prisma aceita `{ not: "" }`/`{ gt: 0 }` em filtro não único: `desfazerConciliacao({not:""})` desfazia **todas** as conciliações, `excluirLinhaExtrato` apagava todas as linhas não conciliadas, `cancelarPedidoCompra({gt:0})` cancelava todos os pedidos abertos, com auditoria `[object Object]`. Exige usuário logado do perfil (risco interno), mas é destruição em massa sem rastro. | Reprodução em transação desfeita: `desfazerConciliacaoTx(tx, {not:""})` levou as linhas conciliadas de 3 a 0 (base DEMO intacta depois do rollback). `tests/seguranca/actions-guarda.test.ts` falhava com 90 argumentos sem validação. | `src/lib/auth-args.ts` (`argId`, `argInt` até int4, `argIdOuNulo`, `argBool`, `argEnum`); uma linha `id = argId(id)` logo depois do `requireUser` em todas as actions. Guarda permanente (análise estática com o compilador TS, roda no `npm test`): toda action exportada chama `requireUser` no 1º comando (exceções nomeadas: login, logout, tema), todo argumento solto passa por validador antes do 1º uso, arquivo `"use server"` só exporta função async, toda page autenticada e todo `route.ts` exige usuário. | `src/lib/auth-args.ts`, 30 `actions.ts`, `tests/seguranca/actions-guarda.test.ts`, `tests/seguranca/auth-args.test.ts` |
| S2 | **Alta** | **Troca de dados bancários do favorecido entrava direto no SISPAG.** Quem alterava conta/Pix gerava a remessa em seguida: golpe clássico de desvio de pagamento, sem segunda pessoa. Edição e geração também não se travavam. | `tests/negocio-db/favorecidos-aprovacao.test.ts` contra o código antigo: 2 de 4 falhavam (remessa gerada com dado recém-alterado; CNPJ trocado passava). | Dupla checagem: `Fornecedor.pagamentoAprovadoHash` = sha256 de CNPJ+banco+agência+conta+dígito+Pix aprovados. O SISPAG recusa favorecido cujo hash atual difere do aprovado. Quem alterou não aprova (ADMIN ou outra pessoa do financeiro aprova); aprovar exige o hash que a tela mostrou (não se aprova dado alterado depois); voltar ao dado aprovado dispensa aprovação. `gerarRemessaTx` trava os favorecidos `FOR SHARE` e a edição `FOR UPDATE` (a edição espera a remessa em geração; testado). Tela: cartão "Aprovação dos dados de pagamento" em `/financeiro/favorecidos/[id]`, indicador e filtro na lista. Migration `20261016200000_aprovacao_dados_pagamento`: dados já existentes ficam aprovados "pela migração" (`pagamentoAprovadoPor` nulo) para não parar pagamentos em curso. | `financeiro/_lib/favorecidos-aprovacao.ts`, `favorecidos-servico.ts`, `favorecidos-actions.ts`, `sispag-servico.ts`, `financeiro/favorecidos/*`, `prisma/schema.prisma`, `tests/negocio-db/_util.ts` (`aprovarFavorecidosTeste` para as fixtures) |
| S3 | Média | **Limite de login furado por rajada.** O código contava as falhas e só gravava depois de conferir a senha: pedidos simultâneos passavam todos pela contagem. | `tests/negocio-db/login.test.ts`: 20 tentativas paralelas → **20 senhas conferidas** (limite 5). | Reserva a tentativa antes de conferir e conta incluindo a própria (a k-ésima reserva vê ≥ k linhas): no máximo 5 conferências por janela; tentativa bloqueada apaga a própria reserva (não prolonga o bloqueio); sucesso apaga as reservas. Lógica extraída para `src/lib/auth-login.ts` (testável); login action só faz cookie/redirect. | `src/lib/auth-login.ts`, `src/app/login/actions.ts` |
| S4 | Média | **Sem troca da própria senha** (só o admin redefinia; item 1.4 "exigir troca" sem caminho). | Inexistente (grep `senhaAtual`). | `/conta/senha` (`trocarSenha`): exige a senha atual com limite de 5 erros/15 min por usuário (sessão roubada não vira força bruta), 10–72 caracteres, diferente da atual, sobe `sessaoVersao` (derruba os outros aparelhos) e recria o cookie deste. Falta o link no menu do usuário (pedido ao design). | `src/lib/auth-login.ts`, `src/app/(app)/conta/*` |
| S5 | Média | **`AUTH_SECRET` só era conferido no primeiro login**: produção subia sem segredo e falhava depois. | `tests/seguranca/auth-config.test.ts`. Conferido no código do Next 16.4 (`esm/server/lib/router-utils/instrumentation-globals.external.js`): erro em `register()` é relançado e impede o servidor de atender. | `src/instrumentation.ts` derruba a subida em produção sem segredo forte (≥ 32, não exemplo, ≥ 8 caracteres distintos); em dev só avisa. Regra única em `src/lib/auth-config.ts`, usada também por `auth.ts`. | `src/instrumentation.ts`, `src/lib/auth-config.ts`, `src/lib/auth.ts` |
| S6 | Média | **Acesso negado em route handler virava 500** (downloads, CSVs, `/api/*`; achado do agente funcional). Sem sessão, `/api/*` redirecionava para HTML. | Varredura do agente funcional. | `exigirUsuarioRota(perfis)` em `auth.ts` devolve 401/403; os 13 `route.ts` usam. | `src/lib/auth.ts`, todos os `route.ts` |
| S7 | Média | **Desativar ou mudar perfil não derrubava a sessão**: reativada no mesmo dia, o cookie antigo voltava a valer (achado do agente funcional). | `tests/seguranca/usuarios.test.ts`. | `editarUsuarioTx` sobe `sessaoVersao` ao mudar perfil ou desativar. | `admin/_lib/usuarios-servico.ts`, `admin/usuarios/actions.ts` |
| S8 | Média | **Dois admins podiam rebaixar um ao outro ao mesmo tempo e zerar a administração** (a trava só protegia o próprio id). | idem (tx falso: não se mexe no ADMIN de demonstração). | Trava as linhas dos ADMIN ativos `FOR UPDATE` e recusa deixar zero ADMIN ativo. Auditoria agora com "perfil: X → Y". | idem |
| G1 | Média | **Edição de conta a pagar aprovada mantinha o aprovador original** (valor, vencimento, fornecedor ou boleto trocados por outra pessoa ficavam "aprovados por" quem não viu). Edição de título sem antes/depois na auditoria. | `tests/negocio-db/financeiro-servicos.test.ts` (regra antiga "editar não mexe na aprovação" substituída). | Mudou o que decide quanto/para quem/quando pagar: `aprovadoPor` passa a quem editou; conta ainda não aprovada continua na fila de aprovação; descrição não mexe. `diferencasTitulo` grava "campo: antes → depois" na auditoria de editar título (receber e pagar). | `financeiro/_lib/titulos-servico.ts`, `financeiro/_lib/actions.ts` |
| G2 | Baixa | **Sem rastro do arquivo que foi ao banco**: download de remessa SISPAG/cobrança não era auditado; importação de retorno/extrato sem identificar o arquivo. | Leitura do código. | Download audita com sha256 do conteúdo (responde a "o mesmo arquivo foi enviado duas vezes?" e "quem baixou"); retorno SISPAG, retorno de cobrança e extrato auditam o sha256 do arquivo. Reprocessar continua idempotente (item PAGO, `CobrancaEvento`, `fitid`); não bloqueei reimportação do mesmo arquivo porque ela é segura e serve para recuperar. Ids das rotas de arquivo por `idInt` (não estoura int4). | `financeiro/remessas/[id]/arquivo/route.ts`, `financeiro/cobranca/[id]/arquivo/route.ts`, `sispag-actions.ts`, `cobranca-actions.ts`, `conciliacao-actions.ts` |
| G3 | Baixa | Logout não era auditado. | Leitura. | Auditado. | `src/app/login/actions.ts` |

**Conferido e OK (sem mudança):** perfis de cada action batem com `docs/SETORES.md` (modo consulta não é só visual: a action recusa o perfil); `$queryRaw` sempre em template (parametrizado; objeto vira parâmetro, não SQL); ordenação de listas em memória ou por campo fixo; cookie `httpOnly`, `Secure` em produção, `SameSite=Lax`, 1 dia, `sessaoVersao` no JWT (logout e troca de senha derrubam tudo); usuário inativo cai na requisição seguinte; mesma mensagem e mesmo tempo (hash falso válido, custo 10, ~125 ms nos dois casos) para e-mail inexistente, senha errada e inativo; bcrypt custo 10 (mínimo do OWASP); CSP com nonce + `strict-dynamic`, sem `unsafe-inline` em script, `frame-ancestors 'none'`, `object-src 'none'`, `nosniff`, `Referrer-Policy`, HSTS; `dangerouslySetInnerHTML` só em ícones constantes; CSV neutraliza `= + - @ tab CR`; uploads com limite de 5/10 MB, magic bytes e nome gerado pelo servidor; parsers de CNAB/OFX lançam `ErroNegocio` e o resto vira "Erro inesperado" sem derrubar o servidor; `.env*` no `.gitignore` e fora do git; toda mutação audita (varredura: só login/logout/tema sem `audit`, e logout passou a ter). Aprovar conta e gerar remessa ao mesmo tempo: a aprovação é `UPDATE` e a remessa trava as mesmas linhas `FOR UPDATE`, então serializam.

**Aberto (e por quê):**
- `npm audit`: 4 HIGH só no CLI do Prisma (`deepmerge-ts` via `@prisma/config`, `mysql2`); o runtime usa `adapter-pg`. Mesmo diagnóstico da B1; não rodei `npm audit fix` para não arriscar subir o Prisma de 7.10.
- Limite de login por IP depende de proxy que sobrescreva `x-forwarded-for`; sem ele, só o limite por e-mail vale (espalhar senha por vários e-mails a partir de um IP não é contido). Na publicação, configurar o proxy.
- `audit()` grava depois da transação e engole falha (registra no log): uma mutação pode ficar sem linha de auditoria se o insert falhar. Mover para dentro das transações exige mexer em todas as actions; risco baixo.
- Favorecido com um único usuário FINANCEIRO: a aprovação precisa do ADMIN. Decisão consciente (dupla checagem); se o cliente não tiver duas pessoas, avaliar.
- O CNPJ trocado em Cadastros não registra quem trocou em `pagamentoAlteradoPor` (o cadastro não escreve colunas do financeiro); qualquer pessoa do financeiro aprova nesse caso.

**Testes novos:** `tests/seguranca/` (actions-guarda 5, auth-args 5, auth-config 2, usuarios 4; no `npm test`), `tests/negocio-db/favorecidos-aprovacao.test.ts` (4), `tests/negocio-db/login.test.ts` (5). Resultado: `npm test` 169/169, `npm run test:db` 211/211, `tsc` limpo, `lint` 0 erros, `arquitetura` 0 violações.
