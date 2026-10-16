# Roteiro: o que falta para um ERP completo de importador e distribuidor de OPME

Base: pesquisa (15–16/10/2026) + comparação com o sistema. Fontes públicas consultadas: recomendação do CNJ sobre OPME (exigências de registro ANVISA, autorização de funcionamento e comercialização), termos de licitação de OPME (consignação, comodato, reposição, rastreabilidade), material sobre custo de importação (FOB, frete, seguro, II, IPI, PIS/COFINS, ICMS por dentro, AFRMM, despachante, armazenagem; DI e NF-e de nacionalização), estudos sobre glosa de OPME (administrativa, técnica, linear; falta de autorização prévia, divergência material x guia) e o Anuário ABRAIDI 2026 (R$ 5,8 bi em pagamentos pendentes a fornecedores de produtos para saúde em 2025; 74% das empresas com glosa). Normas citadas que precisam de confirmação no texto oficial: RDC 497/2021 (boas práticas de distribuição de produtos para saúde, segundo o certificado BPDA) e a norma vigente de UDI.

## O sistema já tem
Cadastros (produto com registro ANVISA, classe de risco, GTIN, NCM), lotes e validade com quarentena/inspeção, rastreabilidade lote→cirurgia→paciente, consignação com vale e conferência (FEFO), kits, cirurgias/agenda/orçamentos/tabelas de preço/comissões, compras com recebimento (custo médio, quarentena), financeiro completo (CNAB/SISPAG/cobrança, DRE, glosa, fechamento), auditoria e perfis.

## Lacunas, por valor para o negócio
| # | Lacuna | Por quê | Estado |
|---|---|---|---|
| 1 | **Custo de importação (landed cost)**: moeda, câmbio, despesas aduaneiras e tributos rateados por item, custo nacionalizado no recebimento | Sem isso a margem de produto importado está errada | **Feito (16/10/2026)**: ver docs/REVISAO.md seção 17 |
| 2 | **Busca global de dados** (produto, hospital, pedido, lote, cirurgia), "+ Novo", sino de pendências e atalhos de teclado | Produtividade diária | **Feito** |
| 3 | **Relatórios de gestão**: curva ABC, giro e cobertura de estoque, margem por produto/hospital/representante, vencimentos, vendas por mês | Decisão de compra e de preço | **Feito** (módulo Gestão) |
| 4 | **Inventário de consignado nos hospitais**: contagem física × saldo do sistema, divergências, ajuste e cobrança | É onde a distribuidora perde dinheiro; auditorias apontam falta de comprovação de saída | Planejado |
| 5 | **Documentos e licenças** (AFE, licença sanitária, CBPAD/BPDA, registros, certificados) com alerta de vencimento | Conformidade da distribuidora e dos fornecedores | **Feito (16/10/2026)**: /qualidade/documentos, cartão nos cadastros, sino |
| 6 | **Recolhimento / tecnovigilância**: bloquear lote, listar hospitais e pacientes afetados, registrar ações e prazos | Exigência sanitária; hoje só há rastreabilidade para consulta | Planejado |
| 7 | **Autorização prévia e guia do convênio** ligadas à cirurgia, e relatório de glosa por convênio/motivo | A glosa de OPME vem de falta de autorização e divergência material × guia | Planejado |
| 8 | NF-e / NFS-e emitidas pelo sistema; TISS | Exigem emissor/contrato externo | Fora do alcance sem contratar |
| 9 | Etiquetas UDI/GS1 e leitura por câmera | Fase futura | Planejado |
