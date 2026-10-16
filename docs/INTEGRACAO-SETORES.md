# Integração entre setores — matriz de eventos

> Estado em 16/10/2026. Pedido do dono: "todas as funcionalidades batem uma com a outra: adicionar estoque muda caixa,
> vender mexe no financeiro; cada setor liga com os outros". Este documento diz, para cada evento de negócio, **quem
> dispara**, **o que tem de refletir em cada setor** e **onde isso está no código**. A prova é executável, uma cadeia
> por teste, só com serviços públicos/transacionais e números conferidos à mão:
> `tests/negocio-db/integracao-setores.test.ts` (i importação, ii cirurgia → NF → baixa, ii-b G4/G5, iii glosa,
> vii transferência), `integracao-estoque.test.ts` (iv inventário, v recolhimento, vi ajuste/perda) e
> `integracao-fechamento.test.ts` (viii varredura do mês fechado). Toda cadeia termina em `conferirTudo()` de
> `tests/negocio-db/_invariantes.ts` (títulos × lançamentos/glosas, contas, transferências, conciliação e
> Saldo == Σ kardex no banco inteiro). Apoio das fotos (DRE, caixa, fluxo, painel): `tests/negocio-db/_integracao.ts`.
> Os arquivos foram divididos para respeitar o limite de 500 linhas.
>
> Complementa `docs/HANDOFF.md` §7 (fluxo), `docs/ARQUITETURA.md` (escrita alheia só por `_lib/publico.ts`, ADR-4:
> integração síncrona na mesma transação) e `docs/REVISAO.md` §7, §10, §11, §18 (DRE, glosa, fechamento, correções).

## 1. Como os setores se ligam

- **Uma transação por evento** (ADR-4). O módulo que dispara abre `db.$transaction` e chama a API pública do dono de cada
  dado que precisa mudar. Não há eventos assíncronos: ou tudo reflete, ou nada.
- **Estoque**: só `movimentar()` (`src/lib/estoque.ts`) mexe em `Saldo` e grava `Movimento` (kardex). Custo médio só
  por `atualizarCustoMedio()`.
- **Financeiro**: títulos gerados por outros módulos só por `financeiro/_lib/publico.ts` (`gerarContaPagarTx`,
  `alterar/cancelarContaPagarGeradaTx`, `gerarContaReceberTx`), que aplicam mês fechado, plano de contas e aprovação.
  Dinheiro só por `registrarBaixa`/`transferir`/avulso. O DRE não tem tabela própria: `dre-dados.ts` **lê** as fontes
  (títulos por competência, glosas, baixas, `PedidoVenda.custoTotal` e movimentos PERDA/AJUSTE).
- **Painel e sino** (`_painel/`): só leitura, pelos contadores que cada módulo expõe no seu `publico.ts`.

## 2. Matriz (evento × setor)

Legenda: **E** estoque (saldo, kardex, custo médio, status do lote) · **F** financeiro (título, lançamento/caixa, DRE,
fluxo) · **C** comercial (cirurgia, pedido) · **Q** qualidade (lote) · **P** painel/sino/gestão.

| # | Evento (quem dispara) | E | F | C | Q | P | Código |
|---|---|---|---|---|---|---|---|
| 1 | **Recebimento de compra nacional** (COMPRAS/ESTOQUE) | ENTRADA na quarentena `PC-n`; custo médio ponderado pelo `custoUnit` | conta a pagar = qtd × custo, plano **ESTOQUE** (fora do resultado), competência hoje, venc. +30, **aguardando aprovação** | — | lote novo QUARENTENA | quarentena +1 (Q/E); aprovações +1 (F) | `compras/_lib/recebimento.ts` → `qualidade/publico.registrarLoteRecebidoTx`, `lib/estoque.atualizarCustoMedio/movimentar`, `financeiro/publico.gerarContaPagarTx` |
| 2 | **Recebimento de importação** (COMPRAS) | ENTRADA pelo custo **nacionalizado** (mercadoria × câmbio + rateio das despesas que integram) | conta do fornecedor só pela mercadoria (ESTOQUE); despesas com conta própria: integra → ESTOQUE, tributo recuperável → TRIBUTOS_RECUPERAR, resto → CUSTO_IMPORTACAO; todas aguardando aprovação | — | idem 1 | idem 1 | `recebimento.ts` + `compras/_lib/importacao-servico.ts` (`salvarDespesaTx`) |
| 3 | **Inspeção aprovada** (QUALIDADE) | TRANSFERENCIA quarentena → depósito `INSP-n` (sem efeito no DRE) | — | lote entra no FEFO | LIBERADO | quarentena −1 | `qualidade/_lib/inspecao-servico.ts` |
| 4 | **Inspeção reprovada** (QUALIDADE) | TRANSFERENCIA → não conforme | conta a pagar continua (ver G7) | lote fora do FEFO | NAO_CONFORME/BLOQUEADO | quarentena −1 | idem |
| 5 | **Vale criado** (ESTOQUE) | nada move; reserva no disponível (FEFO desconta ABERTA) | — | cirurgia sai de "aguardando vale" | só lote LIBERADO e não vencido | sino "cirurgias sem vale" −1 (novo, G3) | `estoque/_lib/remessas.ts` `criarRemessa`, `lotesDisponiveis`, `fefo.ts` |
| 6 | **Vale enviado** (ESTOQUE) | REMESSA depósito → consignado do hospital (custo médio) | — | recusa cirurgia cancelada/faturada (G5) | revalida status/validade | remessas a conferir +1 | `enviarRemessa` |
| 7 | **Vale conferido** (consumo + devolução) (ESTOQUE) | devolvido: RETORNO → depósito; consumido: CONSUMO (sai do hospital); resto fica consignado | nada no DRE ainda (custo vai pelo CMV no faturamento) | `CirurgiaConsumo` + cirurgia REALIZADA (via `comercial/publico.registrarConsumoCirurgiaTx`) | — | remessas a conferir −1; a faturar +1 | `conferirRemessa` |
| 8 | **Consumo direto** (COMERCIAL) | CONSUMO do consignado `CIR-n` | — | consumo + REALIZADA | recusa lote não LIBERADO/vencido | a faturar +1 | `comercial/_lib/consumo-servico.ts` |
| 9 | **Estorno de consumo** (COMERCIAL) | RETORNO de volta ao consignado (fora do DRE, REVISAO A4) | — | sem consumo restante → CONFIRMADA | — | a faturar −1 | `removerConsumoTx` |
| 10 | **Faturar cirurgia** (COMERCIAL/FINANCEIRO) | — | ainda nada (CMV entra com a NF) | `PedidoVenda` ABERTO (preço da tabela/preço base, custo médio, comissão); cirurgia FATURADA; recusa vale aberto/enviado (G4) | — | a faturar −1; "pedidos sem NF" +1 (novo, G2) | `comercial/_lib/faturamento.ts` |
| 11 | **Registrar NF** (COMERCIAL) | — | conta a receber (RECEITA_VENDA, competência = dia da NF, venc. pelo prazo); DRE: receita na competência e **CMV = custoTotal** na data da NF | pedido FATURADO | — | vendas e margem do mês; "pedidos sem NF" −1 | `comercial/_lib/nf.ts` → `gerarContaReceberTx`; `dre-dados.ts` |
| 12 | **Cancelar pedido de venda** (COMERCIAL) | — | só sem NF: nenhum título; com NF é recusado (precisa cancelamento de NF/devolução, G8) | pedido CANCELADO, cirurgia volta a REALIZADA | — | a faturar +1 | `comercial/_lib/pedido-servico.ts`; trava em `titulos-servico.cancelarTituloTx` |
| 13 | **Baixa** (FINANCEIRO) | — | lançamento na conta (principal + juros + multa); título recalculado; juros/multa/desconto no resultado financeiro na data da baixa; realizado do fluxo e entradas/saídas do mês | — | — | vencidos/a pagar diminuem | `financeiro/_lib/titulos.ts` `registrarBaixa`, `recalcularTitulo` |
| 14 | **Glosa / recurso / estorno** (FINANCEIRO) | — | abate o título sem caixa; DRE: dedução GLOSA na data da glosa; REVERTER (recurso ganho) reabre o saldo e tira a dedução | — | — | gestão › glosas | `registrarGlosa`, `registrarRecurso`, `estornarGlosa` |
| 15 | **Conciliação** (FINANCEIRO) | — | liga extrato ↔ lançamento; "baixar e conciliar" = evento 13 com valor/data do extrato; "avulso" = lançamento com plano (DRE) | — | — | extrato a conciliar −1 | `conciliacao-servico.ts` |
| 16 | **Retorno SISPAG** (FINANCEIRO) | — | ocorrência 00 = evento 13 na conta da remessa (excedente = juros; DIV/DUP/CAN sinalizados) | — | — | pagamentos sem retorno −1 | `sispag-servico.ts` `aplicarRetornoTx` |
| 17 | **Retorno de cobrança** (FINANCEIRO) | — | liquidação = evento 13 (excedente juros, abatimento desconto); duplicidade DUP | — | — | — | `cobranca-servico.ts` `aplicarRetornoCobrancaTx` |
| 18 | **Transferência** (FINANCEIRO) | — | muda o saldo de cada conta; **fora** do DRE, do realizado do fluxo e de entradas/saídas do painel (`transferenciaId`) | — | — | — | `transferir`, `estornarTransferencia` |
| 19 | **Inventário fechado** (ESTOQUE) | AJUSTE no consignado `INV-n` (falta sai, sobra entra) | falta "ajustar" = perda no DRE; falta "cobrar do hospital" **não** é perda (marca `COBRAR_HOSPITAL`) e o valor fica em `valorCobrar`; não gera título sozinho (REVISAO M6) | — | — | financeiro › visão geral "Inventários com valor a cobrar" (novo, G1) | `estoque/_lib/inventario-servico.ts`; `financeiro/_lib/leitura-painel.ts` |
| 20 | **Recolhimento** (QUALIDADE) | abrir: lote BLOQUEADO; físico: RETORNO/TRANSFERENCIA → não conforme `REC-n` (fora do DRE) | nada até a perda ser registrada (evento 21) | lote some do FEFO, recusado em vale, envio e consumo | BLOQUEADO (fica assim após concluir) | recolhimentos +1/−1 | `qualidade/_lib/recolhimento-servico.ts` |
| 21 | **Ajuste e perda** (ESTOQUE) | AJUSTE ±, PERDA (saída com motivo) | DRE "Perdas e ajustes de estoque" = qtd × custo (entrada = ganho) | — | — | — | `estoque/_lib/ajustes-servico.ts`; `dre-dados.ts` |
| 22 | **Aprovação de conta a pagar** (FINANCEIRO) | — | libera para o SISPAG; não muda DRE nem caixa (não confere mês fechado, REVISAO M7) | — | — | aprovações −1 | `aprovacao-servico.ts` |
| 23 | **Fechamento de mês** (FINANCEIRO) | movimentos são sempre de hoje e só se fecha mês terminado: não se cruzam | recusa toda mutação financeira com data/competência no mês (lista em §4) | — | — | DRE marca o mês | `fechamento.ts` `garantirMesAberto`, `fechamento-servico.ts` |

**Fechamento contábil das cadeias** (o que os testes conferem): compra entra em ESTOQUE (fora do resultado) e o valor do
estoque recebido = contas a pagar em ESTOQUE; o resultado da venda é receita − CMV (margem bruta), mais juros/multa da
baixa; glosa é dedução até o recurso revertê-la; perda e ajuste vão a "Perdas e ajustes"; RETORNO, TRANSFERENCIA,
REMESSA e CONSUMO não mexem no DRE; transferência não é entrada nem saída.

## 3. Gaps encontrados (documentados antes da correção)

| # | Gap | Gravidade | Decisão / status |
|---|---|---|---|
| G1 | O valor "a cobrar" do inventário (`InventarioConsignacaoItem.valorCobrar`) não aparece em lugar nenhum do financeiro: a decisão M6 deixou o título para o financeiro lançar, mas ninguém do financeiro é avisado. | Média (dinheiro esquecido) | **Implementado**: bloco só leitura "Inventários com valor a cobrar" na visão geral do financeiro, com link para `/estoque/inventario/[id]` e `/estoque/inventario?cobrar=1`. A leitura fica em `financeiro/_lib/leitura-painel.ts` lendo a tabela do estoque direto (ADR-2, leitura livre) e **não** via `estoque/_lib/publico.ts`: financeiro → estoque fecharia o ciclo estoque → comercial → financeiro → estoque (regra R5 do verificador). Fica fora do sino de propósito: não existe a marca "título já lançado", então o item nunca sairia da lista (ver G6). |
| G2 | "Faturamento pendente": pedido de venda gerado (ABERTO) sem NF registrada não aparece em lugar nenhum. A cirurgia já está FATURADA, então some de "a faturar", mas não há conta a receber nem receita. | Média | **Implementado**: `contarPedidosSemNf()` no comercial (`publico.ts`) e pendência "pedidos de venda sem NF" no painel/sino para COMERCIAL e FINANCEIRO. |
| G3 | "Cirurgias sem vale": a fila existe só na tela de remessas (UI-06); não aparece no painel/sino. E a coluna "Vale" das próximas cirurgias contava remessa **cancelada** como vale. | Média | **Implementado**: `contarCirurgiasAguardandoVale()` no estoque (`publico.ts`, mesma regra de `cirurgiasAguardandoVale`, próximos 7 dias e atrasadas) e pendência para ESTOQUE e COMERCIAL; `proximasCirurgias` passa a ignorar remessa CANCELADA. |
| G4 | Faturar uma cirurgia com vale ABERTO ou ENVIADO (não conferido): o consumo do vale fica fora do pedido, e a conferência depois é recusada (cirurgia FATURADA não aceita consumo). | Alta (venda a menor, estoque preso no hospital) | **Implementado**: `faturarCirurgia` recusa com o número do vale. |
| G5 | Enviar um vale de cirurgia CANCELADA ou FATURADA: `criarRemessa` já recusava, mas `enviarRemessa` não; material sairia para uma cirurgia que não vai acontecer (ou já foi faturada). | Média | **Implementado**: `enviarRemessa` recusa (mesma regra da criação). |
| G6 | O inventário não guarda se a falta cobrada já virou título (não há vínculo `InventarioConsignacao` → `ContaReceber`). | Baixa | **Documentado, não feito**: exige migration e regra de quem lança (financeiro, com NF). Proposta: `InventarioConsignacaoItem.contaReceberId` gravado por uma função do financeiro; aí o item entra no sino e sai quando lançado. |
| G7 | Inspeção reprovada: o lote vai para não conforme, mas a conta a pagar do fornecedor continua integral e não há fluxo de devolução/crédito ao fornecedor. | Média | **Documentado**: decisão de negócio (devolução com NF, crédito, abatimento). Hoje o financeiro vê o título normal; a qualidade vê o lote não conforme. |
| G8 | Venda com NF não pode ser desfeita (cancelar o título é recusado para não deixar CMV sem receita); não há cancelamento de NF nem devolução. | Média | **Documentado**: depende da emissão de NF-e (fase futura, HANDOFF §10). |
| G9 | Comissão do representante é calculada no pedido (`PedidoVenda.comissao`) mas não vira conta a pagar nem despesa no DRE. | Média (resultado superestimado) | **Documentado**: decisão de negócio pendente (comissão na NF ou no recebimento; representante como favorecido com dados bancários). |
| G10 | Recebimento nacional (`importacao=false`) — suspeita de seguir caminho diferente do da importação. | — | **Não é gap**: os dois passam por `gerarContaPagarTx` (aguardando aprovação, plano ESTOQUE, mês aberto). Provado na cadeia (ii). |
| G11 | CMV usa o custo médio do produto **no faturamento**, não o `custoUnit` do movimento de CONSUMO. Se houver nova entrada entre o consumo e o faturamento, o CMV muda. | Baixa | **Documentado**: aceito (custo médio vigente). |

## 4. Fechamento de mês: o que é recusado

`garantirMesAberto` (por data da operação ou competência do título) em: baixa e estorno de baixa; glosa, estorno de
glosa e REVERTER do recurso; transferência e estorno; lançamento avulso (criar, excluir, pela conciliação); baixa pela
conciliação; título a receber e a pagar (criar, editar, cancelar, reclassificar); `gerarContaPagarTx`,
`alterar/cancelarContaPagarGeradaTx`, `gerarContaReceberTx`; registrar NF; retorno SISPAG e retorno de cobrança com
pagamento no mês (recusados inteiros). **Permitidos por decisão:** aprovar conta a pagar (M7), RECORRER/MANTER glosa
(não mudam saldo nem DRE), gerar remessa SISPAG/cobrança (não move dinheiro). **Estoque não tem data retroativa**:
movimentos são sempre do dia, e só se fecha mês terminado. A varredura está em `tests/negocio-db/integracao-fechamento.test.ts`.

## 5. Sino e painel por setor (conferido)

Visibilidade de `_painel/pendencias.ts` (`areasDoPerfil`; ADMIN vê tudo). Em negrito, o que entrou nesta rodada.

| Perfil | Pendências no sino e no painel |
|---|---|
| COMERCIAL | a faturar; **pedidos sem NF** (G2); sem autorização do convênio; **cirurgias sem vale** (G3); remessas a conferir; quarentena; vencidos/vencendo; abaixo do mínimo; registros ANVISA |
| ESTOQUE | remessas a conferir; **cirurgias sem vale** (G3); recolhimentos; quarentena; vencidos/vencendo; abaixo do mínimo; registros ANVISA |
| QUALIDADE | quarentena; vencidos/vencendo; recolhimentos; documentos; abaixo do mínimo; registros ANVISA; remessas a conferir |
| COMPRAS | abaixo do mínimo; documentos; quarentena; vencidos/vencendo; registros ANVISA; remessas a conferir |
| FINANCEIRO | a receber vencido; a pagar em 7 dias; aprovações; a faturar; **pedidos sem NF** (G2). Na visão geral do financeiro também: extrato a conciliar, pagamentos em remessa sem retorno/rejeitados e **inventários com valor a cobrar** (G1) |

A coluna "Vale" das próximas cirurgias no painel passou a ignorar remessa cancelada (G3).

Candidatos não feitos (proporcionalidade): pedido de compra com previsão vencida (COMPRAS), pagamentos SISPAG rejeitados
no sino (hoje só na visão geral do financeiro), inventário em contagem há muitos dias (ESTOQUE).
