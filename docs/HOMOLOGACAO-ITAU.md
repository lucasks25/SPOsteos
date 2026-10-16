# Homologação bancária Itaú: SISPAG, extrato e cobrança

Situação em 16/10/2026. Público: Lucas (dono do projeto) e o analista de implantação do Itaú.
Estratégia: troca de **arquivos CNAB pelo Itaú Empresas**, sem API e sem Open Finance pago (decisão em `docs/HANDOFF.md` §8).

Fontes: manuais oficiais baixados de `download.itau.com.br` em 16/10/2026, com índice e hashes em `docs/manuais/README.md`.
Tudo que não está nesses manuais aparece como **"a confirmar com o Itaú"**. Nenhum arquivo deste sistema passou ainda pelo validador do Itaú nem pelo ambiente de teste do banco.

| Produto | Manual usado (o mais novo público) |
|---|---|
| SISPAG (pagamentos) | SISPAG CNAB 240, **v085, out/2020** (`docs/manuais/itau-sispag-cnab240.pdf`) |
| Extrato (conciliação) | Extrato CNAB 240 **v5.0, fev/2011**, conferido com a **v08.5, set/2018** (Itaú BBA) |
| Cobrança (boletos aos hospitais) | Cobrança **CNAB 400, jan/2017**, carteira 109 |
| OFX | Padrão OFX 1.x/2.x (não é manual do Itaú) |

---

## 1. Situação por módulo

| Módulo | Situação | Por quê |
|---|---|---|
| **SISPAG remessa** (crédito Itaú, TED, boletos, Pix por chave) | **FUNCIONAL COM RESSALVAS** | Posições conferidas de 1 a 240 contra a v085 e aprovadas por um validador independente (0 erro nos 6 arquivos de teste). Ressalvas: (a) nunca passou pelo validador do Itaú; (b) 3 preenchimentos que o manual deixa ambíguos (dúvidas 1 a 3 da §5); (c) o DV do CPF/CNPJ do favorecido está sendo incluído na validação agora (sem ele, um CNPJ digitado errado sai no arquivo e volta rejeitado); (d) pode haver versão v086 ou mais nova, não pública. |
| **SISPAG retorno** (baixa automática das contas pagas) | **FUNCIONAL COM RESSALVAS** | Lê e baixa corretamente um retorno **simulado**, com tabela de ocorrências completa (nota 8). Ressalvas: o manual não diz em que registro vêm algumas ocorrências (TA, HA, LC, BI), se o segmento J traz data e valor efetivos, nem como chega uma devolução de TED (dúvidas 4 a 7). Só um retorno real do ambiente de teste fecha isso. |
| **Extrato CNAB 240** | **FUNCIONAL COM RESSALVAS** | Lê a v5.0 e trata as diferenças da v08.5 (lote de aplicação automática ignorado, totais e contadores conferidos, arquivo cortado é recusado). Ressalva: nunca lido com arquivo real; não se sabe como o Itaú trata lançamentos "a compensar" (tipo 2) no saldo do trailer; o sistema só avisa se o saldo não bater. Não há homologação de extrato no banco (é só arquivo de retorno): basta contratar e baixar. |
| **OFX** | **FUNCIONAL COM RESSALVAS** | Testado com amostras sintéticas (encoding, vírgula decimal, FITID ausente, entidades `&amp;`). Recusa arquivo com mais de uma conta. Ressalva: o formato do número da conta (ACCTID) no OFX do Itaú não foi confirmado; se diferir do cadastro, o sistema só avisa. |
| **Cobrança CNAB 400** (boleto registrado, carteira 109) | **FUNCIONAL COM RESSALVAS** (código) / **BLOQUEADO** (operação) | Remessa, retorno, nosso número, código de barras e boleto impresso implementados e testados com os exemplos do manual. Bloqueado porque depende de **convênio de cobrança contratado**, da carteira e dos dados da conta. O manual de 2017 não cobre boleto com QR Code Pix. Não há validador local de cobrança (o validador independente cobre só SISPAG). |

Auditoria de extrato e cobrança desta rodada: ver o fim da §2 (o relatório final do auditor estava pendente quando este documento foi escrito).

---

## 2. O que foi corrigido nesta rodada e o que segue aberto

Linhas conferidas no momento da auditoria (16/10/2026); podem mudar com edições posteriores. Nada foi commitado.

### 2.1 SISPAG (auditoria `arquiteto-sispag`, base v085)

Nenhuma **posição** de campo divergia do manual. As correções são de validação e de leitura do retorno. Arquivos em `src/app/(app)/financeiro/_lib/`.

| # | Onde | O que estava errado | Correção (fonte no manual) |
|---|---|---|---|
| a | `boleto.ts:40-41` | Boleto com moeda diferente de 9 era aceito | Recusado (Anexo A, item 1) |
| b | `boleto.ts:74-78`, `sispag-servico.ts:73` | Com fator de vencimento < 1000 o valor ocupa as posições 6-19, mas só 10-19 eram lidas | Lê a faixa certa; o serviço usa `lerBoleto().valor` (Anexo A, obs. b) |
| c | `sispag.ts:177-179` (segmento J) | Não reconferia o DV do código de barras e aceitava forma 31 para boleto do Itaú | Confere DV, moeda e "não começa com 8"; forma 30 se começa com 341, 31 nos demais (nota 5) |
| d | `sispag.ts:100-101` (forma 01) | DAC "X" virava "0" sem aviso | Exige 1 dígito numérico (nota 11a) |
| e | `sispag.ts:135-138` (forma 41) | Banco vazio virava "000"; 341 era aceito em TED | Exige 3 dígitos, diferente de 000 e 341 (nota 11b) |
| f | `sispag.ts:160-161` (B Pix) | Chave e-mail ou aleatória sem limpeza | Só ASCII visível, sem espaço nem acento (nota 40) |
| g | `sispag.ts:216` | Favorecido sem nome passava (voltaria com AO) | Recusado |
| h | `sispag.ts:293-298` (retorno) | Ocorrência do trailer de lote (ex.: TA) era ignorada e os pagamentos ficavam como AGENDADO | Aplicada aos pagamentos do lote sem ocorrência própria |
| i | `sispag-ocorrencias.ts` (novo), reexportado em `sispag.ts:329` | Tabela com ~40 códigos; "00" + DV era tratado como pago; EM, CP, FC, FD, PD, RS viravam REJEITADO e liberavam o título para nova remessa (**risco de pagar duas vezes**) | Nota 8 completa; DV/EX têm precedência (REJEITADO); EM/CP/FC/FD/PD/RS ficam AGENDADO, sem baixa |
| j | `sispag-servico.ts:119-128`, `sispag-actions.ts`, `remessas/[id]/page.tsx` | TED devolvida depois de paga (DV em retorno posterior) era ignorada | Item marcado `DEV`, contador "devolvidos", faixa vermelha. Estorno **manual** de propósito |
| k | `sispag-servico.ts:130` | Registro sem ocorrência fazia item REJEITADO voltar a AGENDADO e travava o título | Só altera item ENVIADO |
| l | `sispag.ts` (gerador) | CPF/CNPJ do favorecido conferido só pelo tamanho, não pelo DV (achado do `eng-validador`) | **Em correção** pelo `arquiteto-sispag`. Os testes antigos de `tests/financeiro/sispag.test.ts` usam CNPJs com DV inválido e precisam ser trocados |

Confirmados como corretos (dúvidas antigas da `REVISAO.md` §2 encerradas pelo manual): DAC de 2 caracteres em 042-043 na TED (nota 11b); finalidade TED 00005 "Pagamento de Fornecedores" (nota 26); aviso ao favorecido = 0 (nota 16); câmara 000 em 01/41 e 009 no Pix (nota 35); Pix em arquivo separado (item 2.2); numeração A+B e J+J-52 com o mesmo número (nota 9); totais dos trailers (nota 17).

Testes: `tests/financeiro/sispag-layout.test.ts` (novo, confere cada registro de 1 a 240, as recusas acima e a nota 8); `tests/financeiro-db/sispag-e2e.test.ts` (novo caso: DV depois do pago). Resultado relatado: `npm test` 212/213 (a falha é de outro trabalho, `tests/seguranca` × `src/app/login/actions.ts`), `tsc` limpo, test:db do SISPAG 11/11.

### 2.2 Validador independente e arquivos de teste (`eng-validador`)

Um segundo programa, escrito sem importar nada do gerador, lê o manual v085 campo a campo e reprova o arquivo com linha, posição, campo, esperado, encontrado e nota do manual.

- Motor: `src/app/(app)/financeiro/_lib/cnab-validador.ts`; regras em `cnab-validador-campos.ts`, `cnab-validador-segmentos.ts`, `cnab-validador-regras.ts`; layout transcrito com página e nota de cada campo em `cnab-layout-sispag.ts`; dados fictícios e simulador de retorno em `cnab-homologacao.ts`.
- Testes: `tests/financeiro/cnab-validador.test.ts` (17, passando), com mais de 500 mutações de byte, todas acusadas.
- Gerador dos arquivos: `scripts/gerar-arquivos-homologacao.ts` (`npx tsx scripts/gerar-arquivos-homologacao.ts`, sem banco; variáveis `HOMOLOG_*` põem a conta real no header).
- Arquivos em `docs/homologacao/arquivos/` (ver §6) e relatório `validacao.txt`: **os 7 arquivos APROVADOS, nenhum erro**.
- Não cobre: tributos (N, O, W, que o sistema não gera), holerite, extrato e cobrança. Não sabe se conta, chave Pix ou boleto existem.

### 2.3 Extrato CNAB 240, OFX e cobrança (`eng-extrato-cobranca`)

> Relatório final do auditor **pendente** no fechamento deste documento. O que segue é o que está no diff dos arquivos, conferido por leitura; falta a confirmação dos testes por ele.

| Onde | Mudança |
|---|---|
| `cnab240-extrato.ts:44`, `conciliacao-servico.ts:30` | Lote "Aplic Aut Mais - CDB" da v08.5 (tipo de conta 0202), que tem a mesma agência/conta, deixa de entrar como movimento da conta corrente |
| `cnab240-extrato.ts:101,109,183,200` | Recusa registro depois do trailer, segundo header (arquivos concatenados) e contadores de lote/arquivo que não batem (nota 10: arquivo cortado) |
| `cnab240-extrato.ts:188`, `conciliacao-servico.ts:46` | Confere saldo inicial + lançamentos = saldo final; se não bater, avisa na importação (não recusa) |
| `cnab240-extrato.ts` (leitura) | Guarda categoria (170-172), código de fluxo (173-176) e "a compensar" (tipo 2); aceita BOM e fim de arquivo DOS |
| `ofx.ts:21,80`, `conciliacao-servico.ts:55,59` | Decodifica entidades (`&amp;`); lê o ACCTID; recusa OFX com várias contas; avisa se a conta do arquivo difere da cadastrada |
| `cobranca-servico.ts:114` | Data de emissão do documento passa a ser a da NF (competência), não a da remessa (nota 31) |
| `cobranca-servico.ts:234` | Baixa com pagamento sem liquidação 06 (ex.: 59) não baixa o título sozinha: marca e manda conferir na conciliação |
| `cobranca-servico.ts:243`, `cobranca-tabelas.ts:171,202` | Ocorrência 69 (cheque devolvido) com a tabela 9 de motivos; estorno manual |
| `cobranca.ts:64` | "&" vira "E" nos nomes (item 2.2 desaconselha caractere especial) |
| `cobranca.ts:144` e seguintes | Comentário corrigido: o reinício do fator de vencimento em 22/02/2025 é regra FEBRABAN posterior ao manual de 2017, não está no PDF do Itaú |

### 2.4 Em aberto

1. Correção do DV de CPF/CNPJ no gerador SISPAG (item l): em andamento.
2. Relatório final da auditoria de extrato e cobrança: pendente.
3. Itens antigos da `REVISAO.md` §8 ainda válidos: OFX e CNAB do mesmo período podem duplicar o extrato; boleto de fornecedor vencido sai pelo valor original (dúvida 8 da §5); o mesmo arquivo de remessa pode ser enviado duas vezes ao banco (o download é auditado com sha256, mas não bloqueado).
4. Validador local para cobrança CNAB 400 e extrato: não existe.
5. Tudo o que depende do banco: §4.

---

## 3. Processo oficial de homologação, passo a passo

O que os manuais dizem (com a fonte):
- **Validador de Layout**: "Itaú Empresas na Internet > Transmissão de arquivos > Validação > Enviar arquivo para validação de layout". Resultado na hora, relatório de erros de estrutura (SISPAG v085, p. 3). Na cobrança: "Transmissão de Arquivo > Validação > Layout de Arquivo", "sem limites de utilização" (Cobrança 400, cap. 6, p. 43).
- **SISPAG, cap. 5 "Implantação" (p. 63)**: transmitir arquivos de teste; se houver erro de formatação, **o Itaú entra em contato**; o teste termina quando não restam dúvidas. Para ir à produção pelo Itaú Empresas, basta escolher o ambiente "Produção" ao transferir; por outro meio, pedir ao gerente o "tombamento". Pode-se mandar teste mesmo já em produção.
- **Cobrança 400, cap. 6 (p. 43)**: arquivo de teste com dados simulados e **no máximo 30 registros**; o Itaú devolve retorno com entradas confirmadas ou rejeitadas; os retornos de teste ficam em "Transmissão de Arquivos > Transmissão (ambiente de teste) > Recepcionar" (Cobrança 400 com mensagem, linha 3101 do .txt). A passagem à produção é **decisão do cliente**. (O limite de 10 registros que aparece no `README` dos manuais é da cobrança **240**, não usada aqui.)
- **Extrato**: os manuais não descrevem homologação; é arquivo só de retorno.

| # | Passo | Quem faz | Pré-requisito | Custo | Prazo típico | Canal |
|---|---|---|---|---|---|---|
| 1 | Contratar **SISPAG** na conta PJ (formas: crédito Itaú, TED, boleto, Pix) | **Titular** | Conta PJ Itaú, acesso master ao Itaú Empresas | A confirmar com o Itaú. Estimativa: tarifa por pagamento (TED/Pix/boleto) conforme o pacote; os manuais não citam preços | A confirmar | Gerente da conta ou Itaú Empresas (manual cita 4090 1685; não confirmado para 2026) |
| 2 | Contratar **conciliação/extrato CNAB 240** e escolher a periodicidade | **Titular** | Passo 1 não é necessário | A confirmar com o Itaú | A confirmar | Idem (manual do extrato cita 0300 100 75 75; não confirmado) |
| 3 | Contratar **convênio de cobrança**, carteira 109, boleto emitido pelo cliente | **Titular** | Conta PJ | A confirmar. Estimativa: tarifa por boleto registrado e/ou liquidado | A confirmar | Gerente da conta |
| 4 | Liberar o usuário do Itaú Empresas que vai transmitir (perfil de transmissão de arquivos) | **Titular** (usuário master) | Passos 1-3 | Sem custo conhecido | Imediato, se o titular tiver acesso master | Itaú Empresas |
| 5 | Cadastrar no sistema a conta (agência, conta, DAC), carteira, multa e juros | Sistema (Financeiro, com os dados do Lucas) | Dados da §4 | — | Minutos | `/financeiro/contas/[id]` |
| 6 | Rodar os arquivos de teste no **Validador de Layout** | **Titular** (login do banco) | Passo 4; arquivos da §6 | Sem custo conhecido; o manual de cobrança diz "sem limites de utilização" | Na hora | Itaú Empresas > Transmissão de arquivos > Validação |
| 7 | Corrigir o que o validador apontar | Sistema (desenvolvimento) | Relatório do passo 6 (print ou PDF) | — | 1-2 dias por rodada (estimativa) | — |
| 8 | Transmitir remessa SISPAG no **ambiente de teste** | **Titular** | Passos 1, 4 e 6 sem erro | A confirmar se o teste debita ou tarifa (o manual não diz) | A confirmar | Itaú Empresas > Transmissão de arquivos |
| 9 | Baixar o **retorno** de teste e importar no sistema | Titular baixa; sistema importa | Passo 8 | — | Retorno no mesmo dia ou D+1 (a confirmar) | `/financeiro/remessas` > Importar retorno |
| 10 | Cobrança: remessa de teste (até 30 boletos), retorno e conferência do boleto impresso | Titular transmite; sistema gera e importa | Passo 3 | A confirmar | A confirmar | Itaú Empresas; modelo de boleto próprio é validado pela "célula especializada", acionada pelo gerente |
| 11 | Baixar extrato CNAB 240 e OFX reais e importar | Titular baixa; sistema importa | Passo 2 (CNAB); OFX não exige contrato conhecido (a confirmar) | — | Após a 1ª periodicidade | `/financeiro/conciliacao` |
| 12 | Esclarecer dúvidas com a implantação (§5) | **Titular** (ou quem ele autorizar) | Contato do analista | — | A confirmar | Gerente ou suporte do Itaú Empresas |
| 13 | Passar à produção: escolher ambiente "Produção" ao transmitir | **Titular** | Teste concluído e critério da §7 | Tarifas normais | Imediato pelo Itaú Empresas (manual, p. 63) | Itaú Empresas |

---

## 4. Precisa de você, Lucas

Fatos confirmados pelos manuais ou pela situação do projeto:

- **Só o titular da conta (ou um usuário que ele cadastrar no Itaú Empresas) transmite arquivos.** O sistema gera e lê os arquivos; não tem e não deve ter acesso ao banco.
- **SISPAG, extrato CNAB 240 e convênio de cobrança precisam ser contratados na conta.** Sem isso, o Itaú Empresas não aceita o arquivo de produção.
- **Tarifas, prazos e a versão vigente do layout (v085 × possível v086) só o gerente da conta confirma.** Não são públicos; as páginas do Itaú bloqueiam acesso automatizado.
- **Cobrança com Pix (QR Code) no boleto não tem manual público.** Se a SP OSTEOS quiser, é preciso o manual atual sob contrato ou outro produto do Itaú.

O que você precisa fazer ou autorizar:

| # | Item | Por que bloqueia | Tipo |
|---|---|---|---|
| 1 | Decidir quem fala com o Itaú (você, o sócio titular ou o financeiro da SP OSTEOS) e conseguir um contato de gerente ou de implantação | Todos os passos 1-4, 8, 10 e 12 da §3 | Acesso |
| 2 | Contratar **SISPAG** (formas: crédito em conta, TED, boleto, Pix) | Sem contrato não há ambiente de teste nem produção | Contrato e custo |
| 3 | Contratar **extrato CNAB 240** e escolher a periodicidade (diária recomendada) | Conciliação automática pelo CNAB | Contrato e custo |
| 4 | Decidir se haverá **cobrança registrada** aos hospitais e contratar o convênio (carteira 109) | Módulo de cobrança inteiro | Contrato e custo |
| 5 | Aprovar as **tarifas** de cada serviço depois de ouvir o gerente | Decisão de custo | Autorização |
| 6 | Fornecer: **agência, conta e DAC** de cada conta que vai pagar ou receber; **CNPJ e razão social do titular** como o Itaú cadastrou; **carteira** e código da cobrança; **chaves Pix** da empresa, se houver | Header dos arquivos e cadastro da conta no sistema | Dados da empresa |
| 7 | Liberar no Itaú Empresas um usuário com **permissão de transmissão de arquivos** | Passos 6, 8 e 9 | Acesso |
| 8 | Rodar os 6 arquivos no **Validador de Layout** e mandar o resultado (print/PDF) | Primeira prova com o banco | Acesso |
| 9 | Confirmar com o Itaú se o **ambiente de teste movimenta dinheiro ou cobra tarifa** antes de mandar remessa com favorecidos reais | Risco de pagamento real | Confirmação |
| 10 | Enviar 1 remessa de teste, baixar o **retorno** e mandar o arquivo `.ret` | Fecha as dúvidas 4-7 | Acesso |
| 11 | Baixar 1 **extrato CNAB 240** e 1 **OFX** reais da conta | Prova do parser de extrato | Acesso |
| 12 | Encaminhar ao analista o e-mail da §5 | Dúvidas que o manual não resolve | Contato |

---

## 5. Dúvidas para o analista de implantação do Itaú

Pronto para colar:

> Assunto: Implantação SISPAG CNAB 240 (v085), extrato CNAB 240 e cobrança CNAB 400 — dúvidas de layout
>
> Prezados, estamos implantando a troca de arquivos com o Itaú Empresas para a conta [agência/conta], CNPJ [CNPJ]. Usamos os manuais públicos SISPAG CNAB v085 (out/2020), Extrato CNAB 240 v5.0 (fev/2011) e v08.5 (set/2018) e Cobrança CNAB 400 (jan/2017). Pedimos, por favor:
>
> **Geral**
> 1. Qual é a versão vigente do layout SISPAG (há v086 ou posterior)? Podem enviar o manual atual de SISPAG, de extrato e de cobrança?
> 2. O ambiente de teste do SISPAG movimenta dinheiro ou gera tarifa? Há limite de arquivos ou de registros no teste?
> 3. Quais tarifas se aplicam a SISPAG (por forma de pagamento), extrato CNAB e cobrança registrada no nosso pacote?
>
> **SISPAG remessa**
> 4. Segmento B Pix, posições 063-127 (picture 9(65), conteúdo de mensagem pela nota 39): enviar zeros ou brancos?
> 5. Pix por chave: posições 021-023 (banco do favorecido) = 000 e 024-043 em branco são aceitos?
> 6. Endereço da empresa no header de lote (143-222) em branco é aceito?
> 7. Nome do banco no header de arquivo: o texto "BANCO ITAU SA" é obrigatório ou livre?
> 8. Boleto vencido: o valor do pagamento com mora (J, 130-144) precisa vir calculado ou o banco calcula?
>
> **SISPAG retorno**
> 9. No segmento J do retorno, as posições 145-152 e 153-167 trazem data e valor **efetivos** do pagamento?
> 10. Em que registro vêm as ocorrências TA, HA, LC e BI: no detalhe, no header de lote ou no trailer de lote?
> 11. Devolução de TED (DV): chega no mesmo segmento A em retorno posterior? Vem junto com "00" ou sozinha?
> 12. Pagamento recusado sempre traz ocorrência no detalhe, ou o campo pode vir em branco?
> 13. As ocorrências EM, CP, FC, FD, PD e RS só aparecem com produtos contratados (OP, COMPROR, risco sacado)?
>
> **Extrato CNAB 240**
> 14. Qual versão do extrato será gerada para a nossa conta (v5.0 ou v08.5)? Virá o lote "Aplic Aut Mais - CDB" (tipo 0202)?
> 15. Lançamentos "a compensar" (tipo 2) entram no saldo final e nos totais do trailer de lote?
> 16. No OFX do Itaú, como vem o ACCTID (com ou sem DAC, com ou sem agência)?
>
> **Cobrança CNAB 400, carteira 109**
> 17. O valor principal do retorno (254-266) já vem líquido da tarifa? Inclui juros e multa?
> 18. A baixa 10 ("por ter sido liquidado") vem junto com a liquidação 06 no mesmo retorno?
> 19. Em baixa e alteração, o CNPJ do pagador deve vir preenchido ou zerado?
> 20. Data de início da multa: o padrão é o dia seguinte ao vencimento?
> 21. O fator de vencimento já segue o reinício de 22/02/2025 (fator 1000)?
> 22. Há layout CNAB para boleto com QR Code Pix (bolecode)? Qual manual?
> 23. O nosso modelo de boleto impresso precisa ser aprovado pela célula especializada antes de produção?
>
> Obrigado.

---

## 6. Roteiro de teste da rodada de homologação

### 6.1 Validação de layout (sem dinheiro)

Arquivos em `docs/homologacao/arquivos/`, todos com dados **fictícios** (empresa `EMPRESA TESTE HOMOLOGACAO`, CNPJ 99.999.999/0001-91, valores de R$ 0,01 a R$ 0,14; detalhes no `README.md` da pasta). Data de pagamento gravada: 30/10/2026. **Se essa data já tiver passado, gere de novo** com `npx tsx scripts/gerar-arquivos-homologacao.ts` (e `HOMOLOG_DATA=AAAA-MM-DD` se quiser).

| Ordem | Arquivo | Testa | Esperado no validador |
|---|---|---|---|
| 1 | `01-credito-conta-itau.rem` | Forma 01, crédito em conta Itaú | Sem erro de layout |
| 2 | `02-ted-outro-banco.rem` | Forma 41, TED, finalidade 00005 | Sem erro de layout |
| 3 | `03-boleto-itau.rem` | Forma 30, segmento J + J-52 | Sem erro de layout |
| 4 | `04-boleto-outro-banco.rem` | Forma 31 | Sem erro de layout |
| 5 | `05-pix-chave.rem` | Forma 45, Pix por chave (e-mail, CNPJ, telefone, aleatória), em arquivo próprio | Sem erro; aqui aparecem as dúvidas 4 e 5 |
| 6 | `06-misto-ted-credito-boletos.rem` | 4 lotes num arquivo, como o sistema monta no dia a dia | Sem erro de layout |
| — | `90-retorno-simulado-do-06.ret` | **Não enviar.** Serve para testar a leitura de retorno no sistema | — |

Se o validador exigir a conta real no header, gere de novo com a conta da empresa:
`HOMOLOG_CNPJ=... HOMOLOG_NOME="..." HOMOLOG_AGENCIA=... HOMOLOG_CONTA=... HOMOLOG_DAC=... npx tsx scripts/gerar-arquivos-homologacao.ts`.
O que importa é **não haver erro de layout** (ocorrências como HM, HA, AG, AH, TA). Rejeições por conta, boleto ou chave inexistente são esperadas com dados fictícios. Guarde o relatório do validador (print ou PDF) e mande para o desenvolvimento.

**Não envie estes arquivos ao ambiente de PRODUÇÃO.**

### 6.2 Ambiente de teste com o sistema (fecha o ciclo remessa → retorno → baixa)

Os arquivos fictícios não ligam a títulos do sistema. Para conferir a baixa:
1. Confirmar com o Itaú que o teste não debita (item 9 da §4).
2. Num banco de homologação do sistema (não o de produção), cadastrar a conta real e 2 ou 3 favorecidos de confiança (ex.: uma conta da própria empresa), aprovar os dados de pagamento (dupla checagem em `/financeiro/favorecidos/[id]`) e lançar contas a pagar de centavos.
3. Em `/financeiro/remessas`, gerar a remessa (uma TED/crédito e, em arquivo separado, um Pix) e baixar o arquivo.
4. Passar no Validador; depois transmitir no **ambiente de teste**.
5. Baixar o retorno e importar em `/financeiro/remessas` > "Importar retorno do Itaú".
6. Conferir: ocorrência `00` → conta a pagar baixada com data e valor do retorno, lançamento na conta bancária; `BD` → agendado, sem baixa; rejeitado → título volta a ficar disponível para nova remessa; reimportar o mesmo arquivo não duplica baixa. Comparar a estrutura com `90-retorno-simulado-do-06.ret` e registrar as respostas das dúvidas 9-12.

### 6.3 Extrato e OFX

Baixar no Itaú Empresas o extrato CNAB 240 (após contratado) e o OFX do mesmo período, importar cada um em `/financeiro/conciliacao` (de preferência em contas de homologação separadas, porque importar os dois na mesma conta duplica o extrato, item aberto 3). Conferir: total de lançamentos, saldo final igual ao do Itaú Empresas, nenhum aviso de "saldo não bate" e de "conta diferente da cadastrada".

### 6.4 Cobrança (depois do convênio)

1. Cadastrar a carteira, multa e juros na conta; hospital de teste com endereço completo (bairro, CEP, cidade, UF).
2. Gerar em `/financeiro/cobranca` uma remessa com 1 a 3 títulos (o manual permite até 30 no teste), validar e transmitir no ambiente de teste.
3. Baixar o retorno em "Transmissão (ambiente de teste) > Recepcionar" e importar na tela da cobrança.
4. Conferir: entrada confirmada → boleto liberado em `/financeiro/receber/[id]/boleto`; rejeição → motivos exibidos. Imprimir um boleto e conferir a linha digitável no app do banco (sem pagar).
5. Em produção, testar com 1 boleto real de valor baixo pago pela própria empresa: retorno com liquidação deve baixar o título (respostas das dúvidas 17 e 18).

---

## 7. Riscos e critério de "pronto para produção"

### Riscos

| Risco | Impacto | Mitigação existente | Falta |
|---|---|---|---|
| Layout com interpretação diferente do Itaú (dúvidas 4-7) | Arquivo inteiro rejeitado | Validador independente, testes campo a campo | Validador do Itaú |
| Versão v086+ com mudança não pública | Rejeição ou campo novo ignorado | — | Manual atual do gerente |
| Pagar duas vezes | Perda financeira | Trava de títulos, índice único, idempotência do retorno, EM/CP etc. não liberam o título, DUP/DEV/CAN | Bloquear reenvio do mesmo arquivo (hoje só auditado) |
| Desvio de pagamento por troca de dados bancários | Fraude | Dupla aprovação por hash dos dados do favorecido (`REVISAO.md` §19) | — |
| TED devolvida depois de paga | Saldo do sistema errado | Marca DEV e alerta | Estorno é manual: rotina operacional |
| Ambiente de teste movimentar dinheiro | Pagamento real a favorecido de teste | Valores de centavos | Confirmação do Itaú |
| Extrato duplicado (OFX + CNAB do mesmo período) | Conciliação errada | — | Usar um só formato por conta (regra operacional) ou trava no código |
| Retorno de cobrança com valor líquido de tarifa | Juros/desconto lançados errado | Excesso vira juros, falta vira desconto | Resposta da dúvida 17 |

### Critério de "pronto para produção" (por módulo)

Um módulo só vai para produção quando **todos** os itens forem verdadeiros:
1. Contrato do serviço ativo na conta e usuário de transmissão liberado.
2. Arquivo gerado pelo sistema, com a conta real, **aprovado no Validador de Layout do Itaú** sem erro.
3. Pelo menos um ciclo completo no ambiente de teste: remessa → retorno real importado → resultado conferido no sistema (baixa, agendamento, rejeição).
4. Dúvidas da §5 do módulo respondidas por escrito pelo Itaú, e o código ajustado se preciso.
5. `npm test`, test:db e `tsc` passando; teste com o retorno real adicionado aos testes automáticos (sem dados sensíveis).
6. Primeiro uso em produção com **um único** pagamento ou boleto de valor baixo, conferido no extrato antes de liberar lotes maiores.
7. Para extrato/OFX: um arquivo real importado com saldo final igual ao do banco.
