# Manuais técnicos Itaú (CNAB)

Baixados em 16/10/2026 para a homologação bancária (SISPAG, extrato CNAB 240 e cobrança). Cada PDF tem um `.txt` ao lado, extraído com pypdf (modo layout), para grep. As páginas aparecem como `===== página N =====`. Nada foi executado de dentro dos arquivos. Título e versão de cada PDF foram conferidos na primeira página.

"Oficial" quer dizer baixado de `download.itau.com.br`. A data "servidor" é o `Last-Modified` do HTTP.

## Arquivos

| Arquivo | Título e versão (capa) | Data (rodapé) | Origem | Tipo |
|---|---|---|---|---|
| `itau-sispag-cnab240.pdf` | SISPAG – Layout de Arquivos CNAB – **Versão 085** (78 p.) | out/2020 (servidor 15/10/2020) | https://download.itau.com.br/bankline/SISPAG_CNAB.pdf | **Oficial, o mais novo encontrado** |
| `itau-sispag-cnab240-v080-2012.pdf` | SISPAG CNAB240 Versão 80 (67 p.) | abr/2012 | https://download.itau.com.br/bankline/SISPAG-CNAB_201001_empresa.pdf | Oficial, antigo (só para comparar) |
| `espelho-quarta-sispag-v083-2018.pdf` | SISPAG Frotas + CNAB240 Versão 83 | nov/2018 | https://suporte.quarta.com.br/LayOuts/Bancos/26-ITAU-LayoutSISPAG_CNAB2018[ArtClean].pdf | Espelho de terceiro (versão intermediária) |
| `itau-extrato-cnab240-v5.0.pdf` | Extrato de Conta Corrente – CNAB240 – **Versão 5.0** (16 p.) | fev/2011 | https://download.itau.com.br/bankline/conciliacao_bancaria_%20240.pdf | Oficial (base do parser atual) |
| `itau-extrato-cnab240-itaubba-v085.pdf` | Extrato de Conta Corrente (Conta Corrente e Aplic Aut Mais – CBD) – **Versão CNAB 08.5** (26 p.) | set/2018 (servidor 26/10/2020) | https://download.itau.com.br/bankline/ItauBBA/Conciliacao_Bancaria_240_ItauBBA.pdf | **Oficial**. Na pasta ItauBBA; capa marcada "Corporativo \| Interno" |
| `itau-cobranca-cnab240.pdf` | Cobrança Bancária – Layout de Arquivos FEBRABAN 240 (53 p.) | jan/2017 (servidor 06/02/2017) | https://download.itau.com.br/bankline/cobranca_cnab240.pdf | **Oficial, o mais novo de cobrança 240 encontrado** |
| `itau-cobranca-cnab240-itaubba-v7.0-2015.pdf` | Cobrança 240 bytes – Versão 7.0 (62 p.) | set/2015 | https://download.itau.com.br/bankline/ItauBBA/Cobranca_240_ItauBBA.pdf | Oficial (Itaú BBA, mais antigo) |
| `itau-cobranca-cnab400.pdf` | Cobrança Bancária – Layout de Arquivos CNAB 400 (65 p.) | jan/2017 (servidor 06/02/2017) | https://download.itau.com.br/bankline/layout_cobranca_400bytes_cnab_itau.pdf | **Oficial, o mais novo de cobrança 400 encontrado** |
| `itau-cobranca-cnab400-mensagem.pdf` | Cobrança Bancária com Mensagem – CNAB400 (65 p.) | jan/2017 | https://download.itau.com.br/bankline/cobranca_cnab400_mensagem.pdf | Oficial (variante com mensagem no boleto) |
| `itau-cobranca-cnab400-itaubba.pdf` | Cobrança Bancária CNAB 400 – Itaú BBA (78 p.) | set/2015 | https://download.itau.com.br/bankline/itaubba/cobranca_400_itaubba.pdf | Oficial (Itaú BBA, mais antigo) |
| `itau-dda-varredura.pdf` | DDA Débito Direto Autorizado – varredura (16 p.) | jan/2012 | https://download.itau.com.br/bankline/varredura_dda_itau.pdf | Oficial (referência; fora do escopo atual) |

### Recortes das tabelas de ocorrência (texto, gerados a partir dos .txt acima)

| Arquivo | Conteúdo |
|---|---|
| `ocorrencias-sispag-nota8.txt` | SISPAG v085, **Nota 8**: códigos de ocorrência do retorno (00 pagamento efetuado, AE, AG… até as de Pix/QR Code), com as observações (A)/(B) |
| `ocorrencias-cobranca-cnab240.txt` | Cobrança 240 (jan/2017): nota 4 (ocorrência da remessa), nota 22 (ocorrência do retorno), nota 23 (erros, alegações do pagador) e Tabelas 1 a 10 (ex.: 7 protesto sustado, 9/10 negativação) |
| `ocorrencias-cobranca-cnab400.txt` | Cobrança 400 (jan/2017): nota 6 (ocorrência da remessa), nota 17 (ocorrência do retorno), nota 20 (erros) e tabelas |

Os recortes são por número de linha; na dúvida sobre os limites de uma nota, confira no `.txt` completo.

## O que o Itaú diz sobre validação e homologação (com a fonte)

- **Validador on-line**: "Itaú Empresas na Internet > Transmissão de arquivos > Validação > Enviar arquivo para validação de layout". O resultado sai na hora. Fonte: SISPAG v085, p. 3 (linhas 75-81 do .txt). A cobrança usa "Transmissão de Arquivo > Validação > Layout de Arquivo" (Cobrança 240, cap. 6, p. 36; Cobrança 400, cap. 6).
- **SISPAG, cap. 5 "Implantação" (p. 63)**: enviar arquivos de teste no layout. Se houver erro de formatação, o banco entra em contato. O teste termina quando não restam dúvidas nem irregularidades. Para ir à produção pelo Itaú Empresas, basta escolher o ambiente "Produção" ao transferir. Por outro meio de transmissão, é preciso pedir ao gerente o "tombamento para produção". Dá para mandar teste já em produção, se o meio for o 30 Horas (Itaú Empresas).
- **Cobrança (jan/2017, cap. 6)**: arquivo de teste com dados simulados e **no máximo 10 registros**. O Itaú devolve um retorno de teste com as entradas confirmadas ou rejeitadas. Os boletos de teste ficam em "Transmissão de Arquivos > Transmissão (Ambiente Teste) > Recepcionar". A decisão de passar à produção é do cliente. Para validar o modelo de boleto impresso pelo próprio cliente, a "célula especializada" é acionada pelo gerente. Na versão Itaú BBA 2015 o limite era de 30 registros.
- **Extrato**: os manuais não descrevem homologação. O arquivo é só de retorno (o banco gera e o cliente lê); o que se contrata é o serviço e a periodicidade.
- **Contatos impressos nos manuais**: SISPAG v085 (2020): Itaú Empresas, **4090 1685**. Extrato v08.5 (2018): "Atendimento Exclusivo", **0300 100 75 75**. Cobrança 240 BBA (2015): "Cash Management – Suporte Técnico", **0300 100 75 75**. Não confirmamos se esses números ainda valem em 2026. Nenhum manual traz e-mail de suporte de implantação.

## O que NÃO foi obtido e por quê

- **SISPAG versão 086 (mai/2022) ou posterior**: a busca citou um "Manual Técnico SISPAG v086" num site de terceiro (acesso.geweb.com.br/documentos_anexos/61fd45de74a5e38bd080054a8e13eccd.pdf), mas o link retornou **404**. No download.itau.com.br só existe a v085; testamos nomes prováveis (`SISPAG_CNAB_086.pdf` etc.), todos 404. Se existir versão mais nova, ela não está pública: pedir ao gerente ou ao suporte do Itaú Empresas.
- **Cobrança com Pix (boleto híbrido / "bolecode") em CNAB**: nenhum manual público do Itaú posterior a jan/2017. O PDF de 2017 não trata QR Code Pix na cobrança. Se o cliente quiser boleto com QR Code, isso provavelmente exige o manual atual sob contrato, ou a API de cobrança, que é outro produto.
- **Páginas institucionais do Itaú (www.itau.com.br/empresas/...)**: respondem **403** para acesso automatizado (bloqueio de robô), tanto pelo WebFetch quanto pelo curl com user-agent de navegador. Não foi possível ler as condições comerciais, as tarifas nem os contatos atuais por ali.
- **Custos/tarifas** do SISPAG, da cobrança e da conciliação CNAB, e **prazos** de implantação: não são públicos nos manuais. Dependem do pacote do cliente; perguntar ao gerente. Os manuais não citam cobrança pelo uso do validador ou do ambiente de teste. A cobrança 2017 diz que o validador é "sem limites de utilização".
- **Observação sobre o extrato v08.5**: a `REVISAO.md` §2 registrava 403 ao baixar esse arquivo. Hoje (16/10/2026) ele baixou normalmente (HTTP 200) do mesmo domínio oficial. O header de lote continua com "versão do layout" **050**, igual à v5.0 (linha 427 do .txt); as diferenças entre as duas versões ainda precisam ser comparadas campo a campo.

## Integridade (SHA-256, primeiros 16 hex)

```
a51e91be9aca32b8  itau-sispag-cnab240.pdf
56ecfedbecab7968  itau-sispag-cnab240-v080-2012.pdf
3d156ea33e9b1a3e  espelho-quarta-sispag-v083-2018.pdf
49480e45892a7f5e  itau-extrato-cnab240-v5.0.pdf
28537536cd0ec097  itau-extrato-cnab240-itaubba-v085.pdf
283e89d372f86d79  itau-cobranca-cnab240.pdf
d9446ef11a906e3b  itau-cobranca-cnab240-itaubba-v7.0-2015.pdf
0e0fd3456e58f18d  itau-cobranca-cnab400.pdf
2c8cce24d3080302  itau-cobranca-cnab400-mensagem.pdf
a5db483a7b003c95  itau-cobranca-cnab400-itaubba.pdf
c39f786ae760d133  itau-dda-varredura.pdf
```
