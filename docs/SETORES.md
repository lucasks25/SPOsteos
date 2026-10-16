# Setores e telas

> Regra (ver `docs/ARQUITETURA.md`): cada setor cria e edita só nas telas do próprio módulo. Os outros setores veem a informação em modo leitura, com link para a tela do setor dono ("Ver no Financeiro", "Ver na Qualidade"). ADMIN acessa tudo.
> Esta seção cobre Comercial, Estoque, Qualidade, Compras e Gestão. Cadastros, Administração, login e Financeiro são revisados à parte.

## Comercial (`/comercial/*`)

| Página | Perfis | O que faz | Ações próprias | Links para outros setores |
|---|---|---|---|---|
| `cirurgias` (lista) | COMERCIAL, FINANCEIRO | acompanha agendamento, consumo e faturamento | Nova cirurgia | Agenda |
| `cirurgias/nova`, `[id]/editar` | COMERCIAL | cadastra/corrige a cirurgia | Salvar | — |
| `cirurgias/[id]` | COMERCIAL, FINANCEIRO, ESTOQUE | dados, guias do convênio, consumo, anexos, pedido | Confirmar, Cancelar, Faturar, consumo direto, anexos, guias (FINANCEIRO só fatura; ESTOQUE só consumo/anexos) | vales: Estoque (`/estoque/remessas`) |
| `agenda` | COMERCIAL, FINANCEIRO | semana de cirurgias | Agendar cirurgia | — |
| `orcamentos` (+ `novo`, `[id]`) | COMERCIAL, FINANCEIRO (só leitura) | propostas | Novo orçamento, itens, mudar situação | — |
| `pedidos` (+ `[id]`) | COMERCIAL, FINANCEIRO | pedido de venda gerado ao faturar | Registrar NF, Cancelar pedido | Contas a receber: "Ver no Financeiro" (só FINANCEIRO/ADMIN) |
| `tabelas-preco` (+ `nova`, `[id]`) | COMERCIAL, FINANCEIRO (só leitura) | preço por hospital | Nova tabela, preços, excluir | Cadastro do produto |
| `comissoes` | COMERCIAL, FINANCEIRO | vendido, custo, margem e comissão | — (leitura) | — |

## Estoque (`/estoque/*`)

| Página | Perfis | O que faz | Ações próprias | Links para outros setores |
|---|---|---|---|---|
| `saldos` | ESTOQUE, COMERCIAL, QUALIDADE | o que há em cada local | — | lote na Qualidade (só ESTOQUE/QUALIDADE) |
| `kardex` | idem | histórico de entradas e saídas | — | lote na Qualidade (idem) |
| `remessas` (+ `nova`, `[id]`) | ver: ESTOQUE, COMERCIAL, QUALIDADE; editar: ESTOQUE | vales de consignação; fila "Cirurgias aguardando vale" | Nova remessa, Gerar vale, Enviar, Cancelar, Conferir retorno | cirurgia no Comercial (não aparece para QUALIDADE) |
| `kits` (+ `novo`, `[id]`) | ver: 3 perfis; editar: ESTOQUE | caixas e kits | Novo kit, itens, excluir | — |
| `ajustes` | ver: 3 perfis; editar: ESTOQUE | ajustes e perdas | Registrar | — |
| `inventario` (+ `novo`, `[id]`, `imprimir`) | ver: ESTOQUE, COMERCIAL, QUALIDADE, FINANCEIRO; editar: ESTOQUE | contagem física nos hospitais | Novo inventário, contar, concluir, fechar, cancelar | — |

## Qualidade (`/qualidade/*`)

| Página | Perfis | O que faz | Ações próprias | Links para outros setores |
|---|---|---|---|---|
| `quarentena` (+ `[id]`) | QUALIDADE, ESTOQUE | inspeção antes da liberação | Registrar inspeção | — |
| `lotes` (+ `[id]`) | QUALIDADE, ESTOQUE | lotes e validades | Marcar vencidos | cadastro do produto |
| `rastreabilidade` | QUALIDADE, ESTOQUE | origem, consumo e destino do lote | — | pedido de compra (só ESTOQUE/ADMIN) |
| `registros` | QUALIDADE, ESTOQUE | validade dos registros ANVISA | — | "Abrir no cadastro" do produto |
| `documentos` (+ `novo`, `[id]`, `editar`) | ver: QUALIDADE, ESTOQUE, COMPRAS, COMERCIAL; editar: QUALIDADE | licenças e certificados | Novo, Renovar, Editar, Inativar, enviar arquivo | cadastros |
| `recolhimentos` (+ `novo`, `[id]`, relatório, comunicado) | ver: QUALIDADE, ESTOQUE, COMERCIAL; abrir/operar: QUALIDADE; recolher fisicamente: QUALIDADE, ESTOQUE | ação de campo | Novo recolhimento, recolher, comunicar, concluir | cirurgia no Comercial (não aparece para QUALIDADE) |

## Compras (`/compras/*`)

| Página | Perfis | O que faz | Ações próprias | Links para outros setores |
|---|---|---|---|---|
| `pedidos` (+ `novo`, `[id]`) | COMPRAS, ESTOQUE | pedidos nacionais e importações; recebimento | Novo pedido, cancelar, receber item, dados e despesas da importação | contas a pagar: "Ver no Financeiro" (só FINANCEIRO/ADMIN; os demais veem a situação) |
| `sugestao` | COMPRAS, ESTOQUE | quanto comprar | Pedir (abre o pedido novo) | — |

## Gestão (`/gestao/*`) — só leitura

`abc`, `giro`, `margem`, `vencimentos`, `vendas`: COMERCIAL, ESTOQUE, COMPRAS, FINANCEIRO. `glosas`: COMERCIAL, FINANCEIRO. Nenhuma ação que grava; só filtros e exportação CSV. Em `vencimentos`, o link para a Qualidade só aparece para ESTOQUE/ADMIN.

## O que mudou nesta revisão

1. Links que davam "sem permissão" agora só aparecem para quem consegue abrir: pedido de venda → conta a receber; pedido de compra e despesas → conta a pagar; remessa/lista de remessas → cirurgia (esconde para QUALIDADE); saldos/kardex → lote; vencimentos → lotes; recolhimento → cirurgia (QUALIDADE); rastreabilidade → pedido de compra (QUALIDADE). Os demais veem o texto simples.
2. Subtítulos reescritos em uma frase, dizendo para que serve e para qual setor, sem sinais matemáticos ou termos técnicos. Corrigido o subtítulo de "Nova cirurgia" (o vale é gerado pelo Estoque, não pelo Comercial).
3. Termos técnicos traduzidos: FEFO ("o que vence primeiro sai primeiro"), BLOQUEADOS, VENCIDO, REALIZADA, "Kardex" explicado.
4. Registros ANVISA: botão "Editar" virou "Abrir no cadastro" (a edição é no cadastro do produto).
5. Menu: o grupo Estoque passa a aparecer para o FINANCEIRO apenas com "Inventário consignado" (a tela já permitia a leitura, mas não havia caminho no menu); "Quarentena / inspeção" virou "Quarentena e inspeção"; "Kardex" ganhou explicação.

Nenhuma ação de outro setor foi encontrada dentro dessas telas (o vale já tinha saído da cirurgia). Nenhum `requireUser` precisou mudar.

## Pontos para decisão do dono

- Gestão aparece só para Comercial, Estoque, Compras e Financeiro. A Qualidade não vê (ABC, margem e vendas mostram receita e margem). Se quiser "Vencimentos" também para a Qualidade, é liberar só essa tela.
- ESTOQUE pode faturar? Não: só COMERCIAL e FINANCEIRO. ESTOQUE registra consumo e anexos na cirurgia (logística, conforme já estava).
