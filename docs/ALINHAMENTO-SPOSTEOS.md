# Alinhamento negócio × sistema: SP OSTEOS

> Pedido do dono (16/10/2026): "me garanta que esse sistema esteja alinhado com a visão da SP OSTEOS e com o que eles
> fazem". Este documento diz quem é a empresa (só com fonte pública), o que o sistema já cobre de cada processo real,
> o que cobre em parte, o que falta e o que fazer, com esforço. Esforço: **P** até 2 dias, **M** 1 a 2 semanas,
> **G** mais de 2 semanas ou depende de terceiro (emissor de NF-e, banco, ANVISA).

## Resumo para o dono

- O núcleo do sistema bate com a operação: importação com custo nacionalizado, quarentena e inspeção, registros
  ANVISA, consignação em hospital com vale, conferência e consumo por lote, faturamento para o hospital, comissão de
  representante, glosa, recolhimento e financeiro com Itaú (cobrança, SISPAG, extrato).
- O sistema ainda pensa como "distribuidor genérico de OPME". Faltam cinco coisas que são a cara da SP OSTEOS:
  **linha de produto** (coluna, dor/endoscopia, biológicos, instrumentais), **cliente subdistribuidor** (hoje só
  hospital compra), **instrumentador e caixa de instrumental** (manutenção, afiação, esterilização, comodato),
  **kits montados pela empresa** e **educação continuada/eventos** como centro de custo e agenda.
- Corrigido agora: dados cadastrais reais da empresa nos impressos (razão social, CNPJ, endereço fiscal, CEP), doc da
  marca e a seção 1 do `docs/HANDOFF.md`. Não há enum de categoria de produto para corrigir: a linha de produto não
  existe no modelo e vira a recomendação 1.

## 1. Quem é a SP OSTEOS (fontes públicas, consultadas em 16/10/2026)

| Fato | Fonte |
|---|---|
| Razão social **SP OSTEOS Distribuidora de Produtos para a Saúde Ltda**, fantasia SP OSTEOS, CNPJ **19.966.249/0001-84**, ativa, início de atividade 23/03/2014, sociedade limitada, Lucro Presumido (2019 a 2024) | Receita Federal via BrasilAPI `brasilapi.com.br/api/cnpj/v1/19966249000184` |
| Endereço fiscal: Rua Alegre, 470, sala 1001, Santa Paula, São Caetano do Sul/SP, CEP 09550-250. O site diz "10º andar, Barcelona"; o LinkedIn diz "CJ 1301" | Receita; sp-osteos.com.br (rodapé); LinkedIn |
| CNAE principal 4645-1/01 (atacado de instrumentos e materiais médico-cirúrgicos). Secundários: 4614-1/00 (representação comercial), 4773-3/00 (varejo de artigos médicos e ortopédicos), 4930-2/02 (transporte rodoviário de carga), 7319-0/03 (marketing direto), 7739-0/02 (aluguel de equipamentos médicos sem operador) | Receita |
| Fundada em 2013 (LinkedIn), 11 a 50 funcionários, setor "Dispositivos médicos"; bordão "Seja inovador, mantenha-se simples!"; "Soluções para cirurgiões, hospitais e convênios" | linkedin.com/company/sp-osteos |
| "Importação & Distribuição", "Cirurgia - Coluna Vertebral"; "elo entre a inovação e cuidado para hospitais, convênios médicos e cirurgiões de coluna vertebral"; órteses, próteses e materiais especiais "de expressivos fabricantes internacionais e renomadas marcas nacionais" | LinkedIn; post "Bem-vindos!" (sp-osteos.com.br/bem-vindos/) |
| **Grupo SP Osteos**: "seis unidades de negócio" em fixação/implantes de coluna, **fábrica de kits cirúrgicos**, otorrino (ENT), private equity e distribuição farmacêutica (importação). Venda direta na Grande SP e **subdistribuidores** (alguns do próprio grupo) no interior de SP, PR, MG, RJ, RS, BA e DF | sp-osteos.com.br/english/ |
| Equipe: o texto fala em 50 funcionários, 35 representantes comerciais, seis em relacionamento, **instrumentadores treinados** que acompanham os procedimentos e logística que atende hospitais **24 horas**; os contadores da mesma página dizem 69+ funcionários, 22+ representantes, **2,8 mil cirurgias/ano** e 82 milhões+ de beneficiários de convênio atendidos indiretamente (números divergentes no próprio site) | sp-osteos.com.br/english/ |
| **Área regulatória própria** que conduz os registros na ANVISA, com consultoria para certificações internacionais; associada à **ABRAIDI**; apoio clínico de um cirurgião para treinar clientes, equipe e distribuidores | sp-osteos.com.br/english/ |
| Onze fornecedores internacionais. Logos no site: BAVI Spine, Best Medical (alemã, "marca exclusiva de instrumentais da SP Osteos"), Evereast Medical, MDL, SpineGuard (PediGuard), Clear Surgical, Curasan, FzioMed (gel Interpose), Medica, Saeshin; parceria com SeaSpine (Daytona, deformidade); "fornecedora oficial do Jazz Band e do Sistema Wego para deformidades" | páginas /parceiros/ e /english/ (nomes dos arquivos de logo); posts do blog; LinkedIn |
| Rede de atendimento citada: interior de SP (Piracicaba), RJ, PR, MG, BA, AM, RS, MT, GO, TO, ES, PI | sp-osteos.com.br/quem-somos/ |
| Educação médica: canal **#EducacaoContinuUP** com presença em congressos (GSC Rio 2025, 19º Congresso Brasileiro de Coluna 2024 com estande, CBOO, RECONPED, congresso de auditoria OPME-DMI, AOFAS, NASS) e treinamento interno (curso avançado de endoscopia de coluna, abr/2024) | sp-osteos.com.br/blog/ e posts (API pública do WordPress do site) |

**Catálogo público** (41 produtos em 4 categorias, `sp-osteos.com.br/produtos/`):
- **Implantáveis:** sistemas de fixação pedicular, pedicular percutânea, cervical anterior e cervical posterior; cage
  cervical Dicom e autobloqueante; ALIF Osteo Fusion.
- **Biológicos:** cimento ósseo **VERT-MAXX**; enxerto de sulfato de cálcio (granulado/pó); enxerto **Nanogel**
  (fosfato de cálcio); hemostático **StarSil**; Curavisc (ácido hialurônico).
- **Descartáveis:** tratamento da dor (Kit Block Pain, Kit Plex Block, cânulas de bloqueio, radiofrequência e RF
  refrigerada, Stimyplus, Stimy echo, Pain Disc, discectomia percutânea); endoscopia de coluna (Kit Desc Disc, Kit
  Maxcut, Kit El Spine, Guillotine, aspirador Chicagotip, equipo de irrigação, cânula de debridação); vertebroplastia e
  cifoplastia (Kit Vertfix, Kit Aluminum, Kit Cânula Injeção Cimento, biópsia Sample Trap); PediGuard; drenagem
  Neurodrain.
- **Instrumentais:** endoscópio, pinças e tesouras, Kerrison, cureta (endoscopia de coluna).

**Não consegui verificar:** certificação ISO 13485, certificado de boas práticas de distribuição (BPDA/CBPAD) e
números de AFE ou de registros ANVISA (nenhum aparece nas páginas consultadas; só o logo da ANVISA); quais marcas são
importadas com registro em nome da SP OSTEOS e quais são compradas de importador nacional; faturamento; se a "fábrica
de kits" e a unidade de otorrino são outras empresas (CNPJ) do grupo, o que é provável, porque o catálogo desta
distribuidora não tem produto de otorrino.

## 2. Missão, visão e valores, e como o painel deve refletir isso

Da página "Quem Somos":
- **Missão:** "buscar, incansavelmente, a excelência em nosso segmento, prestando atendimento de qualidade e oferecendo
  produtos que contribuam para a sustentação do nosso mercado, e a melhoria da qualidade de vida das pessoas."
- **Visão:** "Ser uma empresa de referência no mercado da saúde, um mercado que muda todos os dias com novas tecnologias".
- **Valores:** inovação, integridade, comprometimento, o ser humano, melhoria contínua, sustentabilidade e trabalho em
  equipe. Bordão: "seja inovador, mantendo o foco".
- **O que dizem fazer no dia a dia:** escolher os materiais a importar, manutenção preventiva dos equipamentos,
  instrumentais "calibrados, afiados, limpos" e em quantidade suficiente para cada caso; "96% dos nossos novos clientes
  voltam a comprar".

| Compromisso público | Indicador hoje | Indicador que falta (recomendação) |
|---|---|---|
| Atendimento de qualidade em cada cirurgia | cirurgias de hoje e 7 dias, cirurgias sem vale (sino), remessas a conferir | % de cirurgias com vale enviado antes da hora marcada; cirurgias atendidas fora do horário comercial (logística 24 h) — P |
| Foco em coluna | vendas e margem do mês (total) | vendas, margem e cirurgias **por linha de produto** — depende da rec. 1 |
| 96% de recompra | — | hospitais com compra nos últimos 12 meses que voltaram a comprar (sai de `PedidoVenda` FATURADO) — P |
| Inovação / novas tecnologias | — | participação nas vendas de produtos cadastrados nos últimos 12 meses (`Produto.criadoEm`) — P |
| Instrumental calibrado, afiado, limpo | — | caixas com manutenção vencida — depende da rec. 3 |
| Integridade / regulatório | registros ANVISA vencendo, documentos vencendo, recolhimentos, quarentena | — (coberto) |

## 3. Matriz de aderência

| # | Processo real | Já cobre (tela / modelo) | Cobre em parte | Falta | Recomendação | Esf. |
|---|---|---|---|---|---|---|
| 1 | Importação de implantes e biomateriais | `/compras/pedidos` com importação: moeda, câmbio PTAX/contratado, incoterm, invoice, DI, despesas aduaneiras rateadas, custo nacionalizado (`PedidoCompra`, `PedidoCompraDespesa`) | só o número da DI; LI e anuência ANVISA na LI não existem | NF-e de importação | campos LI e data de anuência no pedido de importação | P |
| 2 | Registro ANVISA como detentor (área regulatória própria) | `Produto.registroAnvisa`, `validadeRegistro`, `classeRisco`; `/qualidade/registros`; `/qualidade/documentos` (REGISTRO_ANVISA, AFE, CBPAD, licença) com alerta | o documento guarda o registro concedido, não o processo | petição, protocolo, exigência e prazo de resposta | "processos regulatórios" na Qualidade (situação: protocolado, em exigência, deferido, indeferido) ligados ao produto | M |
| 3 | Recebimento, quarentena, inspeção (boas práticas de distribuição) | entrada em quarentena, inspeção de embalagem/rotulagem/documentação, liberação ou não conforme, bloqueio de lote vencido ou registro vencido | — | — | — | — |
| 4 | Consignação em hospitais para cirurgia de coluna | cirurgia (hospital, médico, convênio, procedimento, representante) → vale FEFO → envio → conferência (devolvido/consumido) → consumo por lote → inventário de consignado (`/estoque/inventario`) | o vale leva implantes e descartáveis; o **instrumental** vai no mesmo vale como produto com lote, sem controle de peça/série nem de devolução obrigatória | caixa de instrumental como patrimônio (série, conteúdo, conferência de peças na volta) | ver rec. 3 | M |
| 5 | Caixas e kits montados ("fábrica de kits cirúrgicos" do grupo; kits descartáveis do catálogo) | `Kit`/`KitItem` = modelo de caixa que preenche o vale | o kit não é produto: não tem lote próprio, registro nem custo de montagem | ordem de montagem (consome componentes por lote, gera lote do kit, rastreia kit → componentes) | se a montagem for desta empresa: ordem de montagem no Estoque; se for outra empresa do grupo: tratar como fornecedor | G |
| 6 | Instrumentador em sala e logística 24 h | — | a cirurgia tem representante, não instrumentador | quem instrumentou cada cirurgia; escala; horas fora do expediente | campo "instrumentador" (usuário ou cadastro) na cirurgia + relatório por pessoa | P |
| 7 | Manutenção preventiva, afiação, esterilização e calibração de instrumental e equipamento (endoscópio) | — | — | cadastro de equipamento/caixa com série, ciclos, próxima manutenção, laudo | módulo de ativos/manutenção (aproveita `Documento` para laudos) | M |
| 8 | Comodato/aluguel de equipamento (CNAE 7739-0/02) | — | instrumental cedido sai e volta pelo vale, sem cobrança | taxa de locação por cirurgia ou por mês | linha de receita "locação" no pedido de venda + conta no plano | M |
| 9 | Venda a subdistribuidores (outros estados, alguns do grupo) | dá para cadastrar o subdistribuidor como "hospital" (CNPJ, prazo, tabela de preço) e vender por pedido | o sistema chama tudo de hospital; o pedido de venda sem cirurgia não tem tela própria; consignado no distribuidor funciona como "local do hospital" | tipo de cliente; pedido de venda avulso (sem cirurgia); preço de distribuidor; relatório por canal | `tipo` no cadastro de cliente (HOSPITAL, CLINICA, DISTRIBUIDOR) e pedido de venda direto | M |
| 10 | Representantes e comissões | `Representante.comissaoPercent`, comissão no faturamento, `/comercial/comissoes` (vendido, custo, margem, comissão por representante, hospital e médico) | percentual único por representante | comissão por linha de produto ou por canal; pagamento da comissão como conta a pagar | regra de comissão por linha (depende da rec. 1) e geração da conta a pagar no fechamento | M |
| 11 | Faturamento ao hospital | faturar cirurgia → `PedidoVenda` (preço da tabela do hospital) → NF digitada → conta a receber pelo prazo | NF digitada à mão | emissão de NF-e (remessa em consignação, retorno, venda do consignado) | emissor de NF-e por API (`docs/HANDOFF.md` §10) | G |
| 12 | Faturamento ao convênio e ao particular; SUS | convênio na cirurgia, autorização prévia/guias (`AutorizacaoConvenio`), glosa por categoria e recurso, flag SUS | a conta a receber é sempre do hospital; paciente particular é só um nome | título contra convênio (faturamento direto) ou paciente (CPF); TISS; SIGTAP | pagador no título (hospital, convênio ou paciente) quando a empresa faturar direto | M |
| 13 | Educação médica e eventos (#EducacaoContinuUP, congressos, cursos) | conta "4.07 Comerciais e marketing" no plano padrão; centros de custo livres | dá para classificar a despesa, não o evento | agenda de eventos, custo por evento, médicos participantes | criar centro de custo "Eventos e educação continuada" (configuração, hoje) e, depois, cadastro de eventos | P / M |
| 14 | Rastreabilidade de lote e UDI | lote/série/validade em toda movimentação; `/qualidade/rastreabilidade` (lote → fornecedor → hospital → paciente) com impressão; `Produto.gtin` | o GTIN é o UDI-DI; não há leitura do código de barras GS1 (lote/validade do UDI-PI) | leitura por câmera/coletor no recebimento e na conferência; etiqueta | leitor GS1-128/DataMatrix (fase 3 do roteiro) | M |
| 15 | Recall e tecnovigilância | `/qualidade/recolhimentos`: bloqueio do lote, hospitais e pacientes afetados, comunicado, recolhimento físico, conclusão | — | notificação eletrônica à ANVISA (fora do sistema) | — | — |
| 16 | Cobrança, SISPAG e conciliação (Itaú) | boleto CNAB 400, SISPAG (TED, crédito, boleto, Pix), extrato OFX/CNAB 240, aprovação e segregação de funções, DRE, fechamento | nunca validado com arquivo real do Itaú | — | roteiro de validação em `docs/REVISAO.md` §2 | P |
| 17 | Grupo com várias empresas | um CNPJ por instalação | — | multiempresa, transferência entre empresas do grupo, consolidação | só se o grupo quiser um sistema único; senão, uma instalação por CNPJ | G |
| 18 | Indicadores por linha (foco em coluna) | gestão: ABC, giro, margem por produto/hospital/representante, vendas por mês; DRE por centro de custo | — | dimensão "linha de produto" | rec. 1 | P |

## 4. Linhas de produto da SP OSTEOS (proposta para a rec. 1)

Grupo = categoria do site. A lista deve ser **editável** (tabela, não enum), porque marcas e linhas entram e saem.

| Código | Linha | Grupo | Exemplos do catálogo |
|---|---|---|---|
| COL-FIX | Coluna – fixação | Implantáveis | fixação pedicular, percutânea, cervical anterior e posterior |
| COL-CAGE | Coluna – cages e artrodese | Implantáveis | cage cervical Dicom, autobloqueante, ALIF Osteo Fusion |
| COL-DEF | Coluna – deformidade | Implantáveis | Jazz Band, Wego, Daytona |
| BIO-CIM | Cimento ósseo | Biológicos | VERT-MAXX |
| BIO-ENX | Enxertos ósseos | Biológicos | sulfato de cálcio granulado/pó, Nanogel |
| BIO-HEM | Hemostáticos e barreiras | Biológicos | StarSil, Interpose |
| BIO-VIS | Viscossuplementação | Biológicos | Curavisc |
| DOR | Dor e intervenção | Descartáveis | Block Pain, Plex Block, cânulas de bloqueio e radiofrequência, Pain Disc |
| END | Endoscopia de coluna | Descartáveis | Desc Disc, Maxcut, El Spine, Guillotine, aspirador, equipo |
| VTP | Vertebroplastia e cifoplastia | Descartáveis | Vertfix, Aluminum, cânula injeção de cimento, biópsia |
| COL-DESC | Coluna – descartáveis de apoio | Descartáveis | PediGuard, Neurodrain |
| INS | Instrumentais | Instrumentais | endoscópio, Kerrison, cureta, pinças (Best Medical) |

Otorrino não entra: é unidade do grupo, sem produto no catálogo desta distribuidora.

## 5. Terminologia: o que o sistema diz × o que a SP OSTEOS diz

As telas de cadastros, comercial e estoque são de outra sessão; aqui fica só o rótulo sugerido.

| Onde | Hoje | Sugerido | Por quê |
|---|---|---|---|
| Cadastro e menu "Hospitais" | Hospital | manter "Hospitais" até existir o tipo de cliente; depois "Clientes" com tipo (hospital, clínica, subdistribuidor) | a empresa vende a hospitais e a subdistribuidores |
| Cadastro "Convênios" | Convênio | **manter** "Convênio"; ajuda: "operadora de plano de saúde (registro ANS)" | o site e o LinkedIn dizem "convênios" |
| Médico, especialidade (texto livre) | "Ortopedia" (exemplo genérico) | sugerir "Ortopedia – Coluna", "Neurocirurgia", "Anestesiologia – Dor", "Radiologia intervencionista" | o catálogo de dor e endoscopia é usado por esses especialistas |
| Kits | "Caixas e kits" | "Caixas cirúrgicas (instrumental e implantes)" | é o termo de sala; o "kit" do catálogo é produto descartável vendido inteiro (Kit Desc Disc) |
| Produto, GTIN | GTIN | "GTIN (UDI-DI)" | liga ao vocabulário de rastreabilidade |
| Fabricante | fabricante + país | acrescentar "marca" (BAVI Spine, Best Medical) quando a marca não é o nome do fabricante | marcas exclusivas são argumento comercial |
| Cirurgia | representante | acrescentar "instrumentador" | a empresa vende o serviço de instrumentação |

## 6. O que foi corrigido nesta revisão

- `src/lib/empresa.ts`: padrões com os dados públicos da Receita (razão social, CNPJ, endereço fiscal com sala e
  bairro, novo campo CEP); telefone e e-mail continuam só por `.env`. O cabeçalho impresso (vale, boleto, orçamento,
  comunicado, inventário) passa a sair completo sem configuração. Teste: `tests/comercial/empresa-impresso.test.ts`.
- `.env.example`: os mesmos dados + telefone e e-mail públicos do site.
- `docs/MARCA.md`: tabela de dados da empresa e a observação de paleta (já alinhada às cores da marca).
- `docs/HANDOFF.md` §1: quem é o cliente e os termos do negócio.
- Sem migration: não existe enum de categoria para trocar, e um campo novo sem tela de cadastro (de outra sessão)
  ficaria órfão. Desenho na rec. 1.

## 7. As cinco recomendações mais importantes

1. **Linha de produto (P, Comercial/Cadastros + Gestão).** Tabela `LinhaProduto` (codigo único, nome, grupo enum
   IMPLANTAVEL/BIOLOGICO/DESCARTAVEL/INSTRUMENTAL, ativo) com a lista da §4 inserida pela migration, e
   `Produto.linhaId` opcional (FK, `onDelete: Restrict`). Campo no cadastro de produto; filtro "linha" em ABC, margem,
   vendas e comissões; cartão "vendas e margem por linha" no painel. Teste: produto sem linha aparece como "Sem linha";
   soma das linhas = total do mês; inativar linha com produto não apaga nada.
2. **Cliente subdistribuidor e venda direta (M, Comercial + Financeiro).** `Hospital.tipo` (HOSPITAL, CLINICA,
   DISTRIBUIDOR; padrão HOSPITAL, sem renomear a tabela) e pedido de venda sem cirurgia (itens, lote, preço da tabela do
   cliente, NF, conta a receber pelo mesmo `gerarContaReceberTx`). Teste: venda a distribuidor gera CONSUMO do depósito
   (ou do consignado do distribuidor), título e CMV no DRE; relatório de vendas por tipo de cliente.
3. **Instrumental e instrumentador (M, Estoque + Comercial).** Caixa de instrumental como ativo (série, conteúdo,
   próxima manutenção, laudos via `Documento`), conferência de peças na volta do vale e campo "instrumentador" na
   cirurgia. Teste: vale com caixa vencida de manutenção é recusado; caixa que volta faltando peça gera pendência.
4. **Pagador do título e faturamento direto (M, Financeiro).** Permitir conta a receber contra convênio ou paciente
   particular (CPF) além do hospital, e ligar a glosa ao convênio da cirurgia. Teste: aging e DRE por pagador; baixa e
   cobrança continuam iguais.
5. **NF-e por emissor externo (G, depende de contrato).** Remessa em consignação, retorno e venda do consignado,
   importação. É o maior risco fiscal hoje (NF digitada à mão). Decisão do dono: qual emissor contratar.

Depois destas: campos LI/anuência na importação (P), processos regulatórios (M), leitura GS1 (M), indicadores de
recompra e de produtos novos no painel (P), kits montados (G, se a montagem for desta empresa), multiempresa (G).

## 8. Configuração que o dono pode fazer hoje, sem código

- **Centros de custo** (`/financeiro/plano-contas`): Coluna – implantes; Dor e endoscopia; Biológicos; Instrumentais e
  locação; Subdistribuidores; Eventos e educação continuada. Escolher o centro no pedido de venda e nas despesas dá o
  DRE por unidade de negócio enquanto a rec. 1 não sai.
- **Plano de contas:** subcontas em "4.07 Comerciais e marketing" para congressos/estandes e cursos; em "1.02 Outras
  receitas" para locação de equipamentos, se houver.
- **Documentos da empresa** (`/qualidade/documentos`, escopo EMPRESA): AFE, licença sanitária, CBPAD/BPDA,
  certificados ISO, com validade, para o alerta de vencimento.
- **Convênios:** marcar "não exige autorização" nos que não pedem guia (SUS já vem assim no demo).

## 9. Dados de demonstração (sugestão para quem cuida de `scripts/demo/*` e `prisma/seed.ts`)

O demo ainda tem linhas que a SP OSTEOS não vende (trauma, artroplastia de quadril e joelho, âncoras de ombro; no
`prisma/seed.ts`, stent e angioplastia). Para a demonstração ao cliente, trocar por: coluna (TLIF e ACDF já existem),
vertebroplastia/cifoplastia com cimento, endoscopia de coluna, bloqueio e radiofrequência para dor, enxerto e
hemostático; especialidades Ortopedia – Coluna, Neurocirurgia e Anestesiologia – Dor; centros de custo da §8. Usar
descrições genéricas ("cimento ósseo acrílico para vertebroplastia"), sem preço associado a marca real.
