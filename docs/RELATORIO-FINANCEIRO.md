# Relatório do Financeiro — o que faz e como funciona

Escrito para o dono do projeto (SP OSTEOS). Estado em 16/10/2026. Detalhes técnicos de cada item estão em `docs/REVISAO.md` (seções 6 a 18) e `docs/INTEGRACAO-SETORES.md`.

## 1. Em uma frase

O Financeiro recebe automaticamente tudo o que os outros setores geram (vendas viram contas a receber, compras viram contas a pagar, estoque mexe no custo), controla o dinheiro em cada conta bancária, fala com o Itaú por arquivo (SISPAG para pagar, cobrança CNAB 400 para receber, extrato CNAB 240/OFX para conciliar) e fecha o mês com DRE, fluxo de caixa e aging.

## 2. Telas e o que cada uma faz

| Tela | Para quê | Como funciona |
|---|---|---|
| **Visão geral** `/financeiro` | Números do dia: a receber vencido, a pagar em 7 dias, saldo das contas, inventários a cobrar do hospital, pendências | Cada número é um link para a lista filtrada |
| **Contas a receber** `/financeiro/receber` | Títulos de hospitais e convênios | Nascem sozinhos ao faturar um pedido (NF). Podem ser criados à mão. Baixa (total ou parcial, com juros/multa/desconto), estorno, cancelamento, glosa e recurso de glosa |
| **Cobrança dos hospitais** `/financeiro/cobranca` | Gerar boletos e remessa de cobrança Itaú (CNAB 400, carteira 109) | Escolhe títulos, gera o arquivo de remessa (entrada, baixa, alteração de vencimento), lê o retorno do banco e dá a baixa automaticamente no título certo (nosso número) |
| **Contas a pagar** `/financeiro/pagar` | Fornecedores, impostos, folha, aluguel, logística, serviços | Nascem do pedido de compra (quando o Estoque confere a remessa) ou à mão. Linha digitável do boleto gravada no título; baixa, estorno, cancelamento |
| **Aprovar contas a pagar** `/financeiro/aprovacoes` | Ninguém paga o que não foi aprovado | Toda conta a pagar nasce "aguardando aprovação" (não há limite por valor); só entra em remessa SISPAG depois de aprovada. Fica gravado quem aprovou e quando |
| **Pagamentos SISPAG** `/financeiro/remessas` | Pagar pelo Itaú em lote | Seleciona contas aprovadas → gera arquivo CNAB 240 SISPAG → envia no Itaú Bankline → importa o retorno → baixas automáticas, com tratamento de rejeitado, duplicado, valor divergente e remessa cancelada |
| **Favorecidos** `/financeiro/favorecidos` | Dados bancários/Pix dos fornecedores | Validação de agência/conta/DAC, chave Pix (CPF/CNPJ, e-mail, telefone +55, aleatória). É o que o SISPAG usa para decidir TED, crédito Itaú ou Pix |
| **Contas bancárias** `/financeiro/contas` | Saldo por conta e transferências | Saldo inicial + lançamentos; transferência entre contas não entra no DRE nem no fluxo |
| **Conciliação** `/financeiro/conciliacao` | Bater extrato do banco com o sistema | Importa extrato CNAB 240 ou OFX do Itaú, sugere o par (valor + data), liga/desliga linha a lançamento, avisa duplicidade, permite criar lançamento a partir da linha |
| **Classificar** `/financeiro/classificar` | Lançamentos sem conta do plano | Lote: escolhe a conta do plano e o centro de custo para vários de uma vez |
| **Fluxo de caixa** `/financeiro/fluxo` | Próximos 90 dias por semana ou mês | Previsto (títulos abertos) × realizado (baixas), saldo acumulado, atrasados em faixa própria |
| **DRE** `/financeiro/dre` | Resultado gerencial de 6 meses | Receita, custo da mercadoria (custo médio dos lotes), despesas por conta do plano, filtro por centro de custo. Perdas de inventário aparecem; o que foi marcado "cobrar do hospital" não conta como perda |
| **Plano de contas** `/financeiro/plano-contas` | Árvore de contas e centros de custo | Todo título novo exige conta e competência |
| **Relatórios** `/financeiro/relatorios` | Aging (a vencer, 1-30, 31-60, 61-90, +90) por hospital e por fornecedor | Exporta CSV para Excel (`;`, vírgula decimal) |
| **Fechamento** `/financeiro/fechamento` | Congela meses encerrados | Nada com data em mês fechado pode ser criado, baixado ou estornado; só reabrindo com auditoria |

## 3. Como o dinheiro entra e sai (automático × manual)

**Automático (não precisa de ninguém do Financeiro):**
- Comercial fatura um pedido → nasce a conta a receber, com vencimento pelo prazo do hospital e conta do plano "Receita de vendas".
- Comercial cancela/altera o pedido → a conta a receber é alterada ou cancelada junto (se ainda não tiver baixa).
- Estoque confere uma remessa de compra → nasce a conta a pagar do fornecedor, no valor conferido (com custo de importação rateado nos lotes).
- Estoque ajusta inventário com perda → vira perda no DRE; se marcado "cobrar do hospital", aparece em `/financeiro` como "inventários a cobrar" para o Financeiro decidir.
- Arquivo de retorno do SISPAG importado → baixas das contas pagas, data e valor efetivos do banco.
- Arquivo de retorno da cobrança importado → baixas das contas recebidas, com juros/desconto que o banco informou.

**Manual (alguém do Financeiro clica):**
- Gerar e enviar os arquivos SISPAG e de cobrança no Bankline, e baixar os retornos de lá para importar aqui. **O Itaú não oferece esse envio por API sem contrato de Open Finance pago, que foi descartado**; por isso é arquivo.
- Importar o extrato (CNAB 240 ou OFX) e conciliar.
- Baixas que não passam pelo banco (dinheiro, cartão, compensação), estornos, glosas, aprovações, fechamento.

## 4. Como o SISPAG decide a forma de pagamento

| Situação da conta a pagar | Forma no arquivo |
|---|---|
| Tem código de barras/linha digitável | Boleto (30 Itaú / 31 outros bancos) |
| Sem boleto, favorecido tem chave Pix e a remessa é "Pix" | Pix (lote 45) |
| Sem boleto, favorecido tem conta no Itaú | Crédito em conta Itaú (01) |
| Sem boleto, favorecido em outro banco | TED (41) |

A remessa trava os títulos (duas pessoas não geram a mesma conta duas vezes), pode ser cancelada com motivo (libera as contas) e o arquivo de remessa cancelada não pode mais ser baixado.

## 5. Regras que o sistema garante (invariantes testados)

- Só um lugar do código grava "valor pago/baixado/pago em/situação" de um título; saldo é sempre `valor − valorBaixado`.
- `valor = principal + juros + multa`; desconto reduz o que falta pagar.
- Glosa não revertida conta como baixado; recurso de glosa reabre.
- Transferências entre contas nunca entram no DRE, fluxo ou aging.
- Nenhuma mutação com data em mês fechado.
- Locks de linha no banco em título, item de remessa, linha de extrato e saldo inicial da conta (testes de concorrência com dois pedidos simultâneos).
- Mesma remessa de cobrança não pode ter o mesmo título duas vezes (índice único parcial).

## 6. O que foi testado

- 145 testes unitários (`npm test`): regras puras (baixa, boleto, DVs do SISPAG, CNAB 400, aging, DRE, fluxo, OFX, CNAB 240).
- 198 testes de integração no Postgres (`npm run test:db`): remessa SISPAG ponta a ponta (remessa mista 01+41 e Pix → retorno simulado → baixas, caixa, reprocesso, rejeitado volta), cobrança CNAB 400 (entrada → retorno → baixa), conciliação, fechamento, glosa, aprovação, transferência, invariantes globais sobre os dados reais do banco, e 9 cadeias de integração entre setores (importação → estoque e conta a pagar; cirurgia → vale → NF → receber → baixa → DRE; glosa; transferência; inventário; recolhimento; ajuste/perda; fechamento recusando 26 mutações).
- Teste ponta a ponta no navegador por tela do Financeiro: 13/13 passos, com os números das telas batendo entre si (receber, pagar, contas, fluxo, DRE).
- Revisão de consistência financeira: 10 defeitos encontrados por testes que falhavam, todos corrigidos (`docs/REVISAO.md` seção 18).

## 7. Limites honestos (o que só o banco real confirma)

- Layouts do SISPAG (v085) e do extrato CNAB 240 (v5.0) foram conferidos campo a campo contra os manuais públicos do Itaú; **nenhuma posição divergiu**. Mas o manual não permite confirmar: se o segmento J do retorno traz data/valor efetivos; em que linha vêm as ocorrências TA/BI; como lançamentos "a compensar" entram no saldo do extrato. Isso só se confirma com o **Validador de Layout do Itaú** ou com o primeiro arquivo real — é o primeiro passo quando a SP OSTEOS liberar a conta.
- Cobrança CNAB 400 carteira 109: idem, falta validar com arquivo real e cadastrar o convênio de cobrança no Itaú.
- Ocorrências FC/FD (COMPROR) são tratadas como rejeitado; o extrato não distingue conta investimento.
- Não há envio automático de arquivos ao banco (sem Open Finance pago). Se quiserem automatizar, o caminho é o Itaú Developer Portal com contrato — custo a avaliar.

## 8. Dados de demonstração

O banco local tem dados com prefixo `DEMO` (hospitais, fornecedores, produtos, lotes, pedidos, títulos e remessas) para navegar nas telas. Os testes usam o prefixo `TESTEDB` e limpam só o que criaram.

Logins: `admin@opme.local`, `financeiro@opme.local`, `comercial@opme.local`, `estoque@opme.local`, `qualidade@opme.local`, `compras@opme.local` — senha `opme1234`.
