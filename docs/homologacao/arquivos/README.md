# Arquivos de homologação SISPAG (dados FICTÍCIOS)

Gerados por `npx tsx scripts/gerar-arquivos-homologacao.ts`, sem banco de dados. O script também passa cada arquivo
pelo validador independente (`src/app/(app)/financeiro/_lib/cnab-validador.ts`) e grava o resultado em `validacao.txt`.

**Nada aqui é dado real.** Empresa debitada `EMPRESA TESTE HOMOLOGACAO`, CNPJ 99.999.999/0001-91 (DV válido,
fictício), agência 0001, conta 12345-6. Favorecidos `FORNECEDOR TESTE 1` a `8`, CNPJs 99.999.999/xxxx-xx e o CPF de
exemplo 529.982.247-25. Valores de R$ 0,01 a R$ 0,14. Boletos montados com DV correto, mas que não existem.

| Arquivo | O que testa | Registros |
|---|---|---|
| `01-credito-conta-itau.rem` | Forma 01, crédito em conta no Itaú (nota 11 a) | 0, 1, A, B, 5, 9 |
| `02-ted-outro-banco.rem` | Forma 41, TED para o banco 033, finalidade 00005 (nota 26) | 0, 1, A, B, 5, 9 |
| `03-boleto-itau.rem` | Forma 30, boleto do Itaú | 0, 1, J, J-52, 5, 9 |
| `04-boleto-outro-banco.rem` | Forma 31, boleto de outro banco (033) | 0, 1, J, J-52, 5, 9 |
| `05-pix-chave.rem` | Forma 45, Pix por chave, em arquivo próprio (item 2.2): e-mail, CNPJ, telefone e chave aleatória | 0, 1, 4 × (A, B Pix), 5, 9 |
| `06-misto-ted-credito-boletos.rem` | Arquivo com 4 lotes (01, 41, 30, 31), como o sistema monta a remessa "TED/boleto" do dia | 0, 4 lotes, 9 |
| `90-retorno-simulado-do-06.ret` | Retorno **simulado** do arquivo 06 (código 2 no header, nosso número, data/valor efetivos): crédito `00` pago, TED `BD` agendada, boleto Itaú `00` pago, boleto outro banco `IP` rejeitado | igual ao 06 |
| `validacao.txt` | Relatório do validador local para cada arquivo | — |

Não há arquivo de tributos (segmentos N/O): o sistema não gera essa forma.

## Como o titular da conta usa

1. **Validação de layout (sem movimentar dinheiro):** Itaú Empresas > Transmissão de arquivos > Validação >
   Enviar arquivo para validação de layout. Mandar os arquivos `01` a `06`, um por vez. O resultado sai na hora.
   O `.ret` não se envia: é só para testar a leitura de retorno do sistema.
2. Se o validador do Itaú exigir a conta do próprio cliente no header, gere de novo com a conta real
   (o resto continua fictício):
   ```bash
   HOMOLOG_CNPJ=00000000000000 HOMOLOG_NOME="RAZAO SOCIAL" HOMOLOG_AGENCIA=0000 HOMOLOG_CONTA=00000 HOMOLOG_DAC=0 \
     npx tsx scripts/gerar-arquivos-homologacao.ts
   ```
   `HOMOLOG_DATA=AAAA-MM-DD` troca a data de pagamento (padrão: 10 dias úteis à frente).
3. **Não envie estes arquivos ao ambiente de PRODUÇÃO.** No ambiente de teste, os boletos fictícios e os
   favorecidos inventados devem voltar rejeitados (ex.: `IP`, `AN`, `BI`), o que é esperado. O que interessa
   na homologação é não haver erro de **layout** (`HM`, `HA`, `AG`, `AH`, `TA`).
4. Trazer o resultado do validador e, depois do teste, o arquivo de retorno real, para comparar com o `.ret` simulado.

## O que o validador local confere (e o que não)

Confere, a partir do manual SISPAG v085 (out/2020): 240 bytes por linha, CRLF, só ASCII imprimível, picture 9/X,
conteúdo fixo e domínios das notas 4, 5, 10, 16, 26, 35, 36 e 37, datas e horas, sequência dos registros, numeração
de lote (nota 3) e de registro (nota 9), ordem J → J-52 → B, contadores e somatórios dos trailers (nota 17), Pix em
arquivo separado (item 2.2), DV do código de barras (Anexo A), CPF/CNPJ com DV, formato da chave Pix (nota 40).

Não confere (só o banco sabe): se a conta, a agência e o DAC existem; se a chave Pix está no DICT; se o boleto está
registrado; prazos e horários de envio; contratação de serviços (finalidade de lote, histórico, aviso ao favorecido).
