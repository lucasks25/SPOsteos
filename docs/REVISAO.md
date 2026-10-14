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

**1.6 Concorrência em baixas e recebimentos**
- Onde: `financeiro/_lib/titulos.ts` (`registrarBaixa`), `compras/_lib/recebimento.ts`.
- Risco: duas baixas simultâneas do mesmo título podem somar mais que o valor, porque não há trava de linha. No recebimento, a checagem `recebido > quantidade` depois do incremento atômico protege a quantidade, mas não a conta a pagar duplicada em corrida.
- Correção: `SELECT ... FOR UPDATE` no título ou item dentro da transação, ou `isolationLevel: "Serializable"` com nova tentativa.

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
| 3.1 | Testes automatizados só para os leitores e geradores puros (16 testes) | `tests/financeiro/` (`npm test`) | Adicionar testes com banco para `titulos.ts`, `recebimento.ts`, `faturamento.ts`, `estoque.ts` (`movimentar`) e `remessas.ts`. Usar um banco de teste separado |
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
