# Design system: tema "Bling médico"

O visual do sistema segue a **linguagem** dos ERPs brasileiros de mercado, com o Bling como referência: menu lateral escuro com ícones e rótulos, conteúdo claro em cartões brancos de raio grande, botões em pílula, abas com sublinhado verde, filtros em cartão com chips e indicadores com ícone em quadradinho verde-claro. A paleta foi levada para a área médica: um **verde-petróleo** sóbrio como cor de marca e um **acento menta** suave (em vez do verde-lima da marca Bling, forte demais num contexto cirúrgico).

**Limite legal.** Reproduzimos padrões de interface (estrutura, medidas, comportamento), que não são protegidos. **Não** usamos marca, logotipo, ilustrações, fontes proprietárias, textos nem código do Bling. As cores são nossas (derivadas, não copiadas) e as fontes são livres (OFL).

Substitui o tema "Horizonte" (estilo SAP Fiori), que vigorou até 16/10/2026.

## 1. Fontes consultadas

| Fonte | Status | O que deu |
|---|---|---|
| Capturas da tela de produto do app Bling (cadastro de produto, assistente de 6 passos) | **lidas** (imagens fornecidas pelo dono) | fundo branco, campos grandes arredondados com rótulo pequeno cinza acima, abas com sublinhado verde, botão primário verde preenchido e secundário com contorno verde, ícones de informação azuis |
| Página "Controle de vendas" do Bling, identidade 2026 (cabeçalho e blocos 2 e 3) | **lidas** | verde muito escuro (~`#0f2b26`) como faixa de marca, verde-lima como destaque, cartões brancos com raio grande e sombra suave, botões pílula, listas de ações com ícone em quadradinho verde-claro |
| Descrição textual do app Bling atual (menu lateral, painel de filtros com botão "Filtrar" e chips, menu "Ações"/"Mais ações", paginação, cards de painel) | **lida** (texto do briefing) | estrutura da casca, dos filtros e do cabeçalho de página |
| WCAG 2.2 (1.4.3 contraste de texto 4,5:1; 1.4.11 contraste de componente 3:1; 2.5.8 área de toque) | conhecida; contraste **verificado por script** (seção 3.3) | limites mínimos da paleta |
| `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` e `.../04-functions/use-search-params.md` (Next 16.4 instalado) | **lidos** | `next/font/google` com `variable` para duas fontes; `useSearchParams` dentro de `<Suspense>` |

**Não verificado:** medidas exatas do app Bling (alturas, raios, hex). Os valores abaixo são nossos, escolhidos para reproduzir a aparência das capturas, não medidos no produto.

## 2. Como o tema é aplicado

Os estilos ficam em `src/app/estilos/`, importados por `src/app/globals.css`:

| Arquivo | Conteúdo |
|---|---|
| `tokens.css` | `@theme` do Tailwind (fontes, raios, tamanhos, sombras) e as variáveis `--c-*` dos modos claro e escuro |
| `base.css` | corpo, títulos em Manrope, foco, seleção, rolagem, seta do select, ícone de data, impressão |
| `componentes.css` | área de conteúdo, grade de indicadores (`.kpi-strip`), tabela com cabeçalho fixo (`.tabela-rolagem`), menu lateral recolhido, botão de tema |

As páginas usam **apenas** as escalas do Tailwind `teal`, `slate`, `emerald`, `rose`, `amber`, `sky`, `violet` e `white`. Cada escala aponta para uma variável `--c-<escala>-<passo>`; trocar o tema é trocar valores, sem tocar nas páginas. Os nomes das escalas foram mantidos do tema anterior de propósito, para nenhuma `page.tsx` precisar mudar.

| Escala/variável | Papel |
|---|---|
| `teal-*` | verde-petróleo da marca; `teal-700` = link e texto de botão secundário |
| `slate-*` | neutros com leve tom verde: fundo, bordas, rótulos, texto |
| `emerald` / `rose` / `amber` / `sky` | sucesso / erro / alerta / informação |
| `violet` | categoria (ex.: cirurgia realizada) |
| `white` | superfície (cartão, campo); no escuro vira a superfície escura |
| `bg-primary`, `text-on-primary`, `primary-hover/active` | botão principal |
| `bg-accent-soft`, `text-on-accent-soft`, `accent` | quadradinho de ícone dos indicadores e cartões; acento menta |
| `bg-sidebar`, `text-sidebar-fg`, `text-sidebar-fg-ativo`, `bg-sidebar-destaque` | menu lateral (sempre escuro) e faixa do login |
| `border-field` | borda dos campos (3:1 sobre a superfície) |
| `--focus` | anel de foco |
| `--shadow-card / -raised / -overlay` | `shadow-sm` (cartão), `shadow-lg` (cartão em hover), `shadow-xl` (menus, diálogos, toast) |

**Escuro.** O tema escuro é escolhido pelo usuário (cookie `opme_tema`, atributo `data-theme="dark"`) ou, sem escolha, segue o sistema operacional. Os dois blocos escuros em `tokens.css` são idênticos (o CSS não permite unir o seletor de atributo e a media query); ao mudar uma cor, mude nos dois. Os blocos escuros ficam dentro de `@media screen`, então **a impressão usa sempre o claro**, sem bloco extra.

**Cuidado com `white` e `black` no escuro.** `text-white` vira a cor da superfície escura. Dentro do menu lateral (sempre escuro) use `text-sidebar-fg-ativo`; para véus claros sobre fundo escuro use valores fixos, como `bg-[rgb(255_255_255/0.08)]`.

## 3. Paleta

### 3.1 Claro

| Passo | teal (marca) | slate (neutros) | emerald | rose | amber | sky | violet |
|---|---|---|---|---|---|---|---|
| 50 | `#effaf7` | `#f6f8f8` | `#ecfaf1` | `#fef3f2` | `#fffaeb` | `#eff7ff` | `#f5f3ff` |
| 100 | `#d6f3ec` | `#eef2f1` | `#d3f3df` | `#fee4e2` | `#fef0c7` | `#dbedff` | `#ece8fe` |
| 200 | `#aee5d8` | `#e2e8e6` | `#a7e6c0` | `#fecdca` | `#fedf89` | `#bcdcfe` | `#dbd4fd` |
| 300 | `#78cfbd` | `#cdd6d3` | `#6fd29b` | `#fca29b` | `#fec84b` | `#8cc4fc` | `#bfb2fb` |
| 400 | `#3fb39f` | `#879794` | `#36b574` | `#f2675d` | `#f5a524` | `#56a5f7` | `#9d87f6` |
| 500 | `#169685` | `#5c6d6a` | `#16975a` | `#e0392d` | `#e08a0b` | `#2f86ee` | `#7c5cee` |
| 600 | `#0d7d70` | `#4c5c59` | `#0e7d49` | `#c42b1f` | `#b25407` | `#1d6bd6` | `#6740d9` |
| 700 | `#0f6e63` | `#374644` | `#0b6a3e` | `#a3231a` | `#93400c` | `#1a57b4` | `#5631b8` |
| 800 | `#115a52` | `#24312f` | `#0b5433` | `#861f18` | `#7a340f` | `#1b4892` | `#472a96` |
| 900 | `#124a44` | `#13201e` | `#0a442b` | `#6f1e18` | `#652c10` | `#1b3d75` | `#3b2579` |
| 950 | `#062e2a` | `#0a1312` | `#052a1a` | `#3f0c08` | `#3b1604` | `#12264a` | `#241548` |

Outras variáveis do claro: fundo `--bg #f6f8f8`, superfície `#ffffff`, texto `#13201e`, primário `#0f6e63` (hover `#115a52`, pressionado `#124a44`, texto branco), foco `#0d7d70`, acento `#a6e3a1`, acento suave `#e3f6dc` com ícone `#1d5a2c`, menu lateral `#0d2724` (texto `#c9dcd8`, ativo `#ffffff`, destaque `#9be3a4`), borda de campo `#879794`.

Os passos 600 de `amber` e `rose` foram escurecidos em relação a uma escala linear porque as páginas usam esses passos em **texto** (`text-amber-600`, `text-rose-600`); assim passam de 4,5:1 sobre branco.

### 3.2 Escuro (dessaturado, sem inverter)

O escuro não é o claro invertido: os fundos são verde-petróleo muito escuros e pouco saturados, e os passos de texto (600 e 700) ficam claros e suaves. Os fundos de status (passo 50) são tons escuros da própria cor.

| Passo | teal | slate | emerald | rose | amber | sky | violet |
|---|---|---|---|---|---|---|---|
| 50 | `#10302b` | `#1a2423` | `#0f2e20` | `#3a1513` | `#33240c` | `#132a42` | `#251d44` |
| 100 | `#143a34` | `#1f2b29` | `#133a28` | `#491a17` | `#3f2c0e` | `#173350` | `#2d2353` |
| 200 | `#1b4d45` | `#2a3735` | `#1a5038` | `#64231f` | `#5a3e12` | `#1e4469` | `#3b2f6d` |
| 300 | `#22675c` | `#3a4846` | `#23704d` | `#88302a` | `#7d5616` | `#28598a` | `#4f3f93` |
| 400 | `#2f8a7b` | `#6b7d7a` | `#2f9464` | `#c4483f` | `#b07a1e` | `#3b7cc0` | `#7360c4` |
| 500 | `#47a897` | `#91a19e` | `#4cb57f` | `#e8695f` | `#d89a35` | `#5c9ce0` | `#9583e0` |
| 600 | `#6cc3b2` | `#a9b7b4` | `#6dcc98` | `#f08a81` | `#ebb75e` | `#80b5ec` | `#ad9fea` |
| 700 | `#7fd0bf` | `#c4cfcd` | `#86d8a9` | `#f4a39c` | `#f1c97f` | `#9cc6f1` | `#c0b5f0` |
| 800 | `#a9e3d6` | `#dde5e3` | `#ace6c4` | `#f8c4bf` | `#f6dcab` | `#c0dbf6` | `#d7cff6` |
| 900 | `#cfefe7` | `#eef3f2` | `#d0f2de` | `#fbdedb` | `#faecd0` | `#dcebfa` | `#e9e5fa` |
| 950 | `#e9f8f4` | `#ffffff` | `#ebfaf1` | `#fdf0ee` | `#fdf6e8` | `#eef5fd` | `#f5f3fd` |

Outras variáveis do escuro: fundo `#0e1615`, superfície `#152120`, texto `#eef3f2`, primário **menta** `#5fbcaa` com texto escuro `#0b201d` (hover `#74c9b8`, pressionado `#4fae9c`), foco `#7fd0bf`, acento suave `#1c3a2a` com ícone `#a9e6b4`, menu lateral `#0a1312`, borda de campo `#647673`.

### 3.3 Contraste (WCAG AA), verificado por script

Texto pede 4,5:1; borda de campo, ícone e indicador do menu pedem 3:1. Todos os pares passam nos dois modos.

| Par | Claro | Escuro |
|---|---|---|
| texto `slate-900` / superfície | 16,8 | 14,8 |
| texto apagado `slate-500` / fundo | 5,12 | 6,81 |
| rótulo `slate-600` / superfície | 7,04 | 7,97 |
| link `teal-700` / superfície | 6,12 | 9,19 |
| botão principal (texto / fundo) | 6,12 | 7,48 |
| badge `emerald-700` / `emerald-50` | 6,20 | 8,67 |
| badge `amber-700` / `amber-50` | 6,76 | 9,58 |
| badge `rose-700` / `rose-50` | 6,87 | 8,15 |
| badge `sky-700` / `sky-50` | 6,33 | 8,18 |
| texto `amber-600` / superfície | 5,04 | 9,03 |
| texto `rose-600` / superfície | 5,66 | 6,82 |
| ícone do indicador / acento suave | 7,24 | 8,69 |
| texto do menu lateral / fundo do menu | 11,04 | 9,48 |
| borda de campo / superfície (3:1) | 3,05 | 3,45 |
| ícone `slate-400` / superfície (3:1) | 3,05 | 3,81 |

## 4. Tipografia

| Uso | Valor |
|---|---|
| Corpo, células, campos, botões | **Inter**, 0.875rem (14 px), linha 1.5 |
| Títulos (`h1`, `h2`, `.font-display`) e números de indicador | **Manrope** (extrabold/bold), espaçamento −0.01em |
| Título de página (`PageHeader`) | 1.5rem no celular, 1.75rem a partir de 768 px, extrabold |
| Título de cartão e de tabela | 1rem bold |
| Migalha acima do título | 0.75rem semibold, caixa alta, `teal-700` |
| Rótulo de campo | 0.8125rem medium `slate-700`, acima do campo |
| Cabeçalho de tabela | 0.75rem semibold, caixa alta, espaçamento 0.04em, `slate-500`, fundo `slate-50` |
| Valor de indicador | 1.5rem Manrope extrabold |
| Pequeno (dica, nota, badge) | 0.75rem |

As duas fontes são OFL e servidas pelo `next/font/google` (`src/app/layout.tsx`, variáveis `--font-inter` e `--font-manrope`). Sem rede no build, cai na fonte do sistema. O ajuste de compatibilidade continua: `text-[13px]` vira 14 px e `text-[11px]` vira 12 px. Código novo usa `text-sm`/`text-xs`.

## 5. Espaçamento, raios e sombras

**Conteúdo** (`.conteudo`): recuo lateral de 1rem no celular, 1.75rem a partir de 768 px e 2.25rem a partir de 1440 px; largura máxima de 1680 px, centralizada.

**Grade:** múltiplos de 0.25rem. 0.5rem entre controles, 0.75rem entre indicadores, 1.25rem entre blocos.

**Alturas:** campo e botão 2.5rem (40 px); os botões têm área de toque de 44 px (pseudo-elemento que estende 2 px acima e abaixo). Botão `small` 2rem, para dentro de tabelas. Linha de tabela 2.5rem. Barra superior 4rem.

| Raio | Valor | Uso |
|---|---|---|
| `rounded-sm` | 6 px | chip pequeno, `kbd` |
| `rounded` / `rounded-md` | 8 px | padrão |
| `rounded-lg` | **10 px** | campo, item de menu, quadradinho de ícone |
| `rounded-xl` | **14 px** | cartão, tabela, indicador, menus suspensos |
| `rounded-2xl` | **20 px** | diálogo, cartão do login |
| `rounded-full` | pílula | botões, badges, chips, busca global |

**Sombras (duas elevações + sobreposição):** `shadow-sm` = cartão em repouso (quase imperceptível, a borda faz o contorno); `shadow-lg` = cartão em hover/elevado; `shadow-xl` = menus suspensos, diálogos e toast.

## 6. Casca (menu lateral e barra superior)

- **Menu lateral** (`src/components/menu-lateral.tsx`), 16rem, fundo `--sidebar`: marca SP OSTEOS no topo (`<Marca sobreEscuro />`), módulos (setores) em sanfona com ícone e rótulo, o módulo da tela atual aberto, subgrupos com rótulo em caixa alta (Financeiro: Receber, Pagar, Banco, Resultado). Item ativo: véu claro e **barra menta de 3 px** à esquerda. Usuário no rodapé (avatar, nome, perfil) com aparência (Claro, Escuro, Sistema) e Sair.
- **Recolher** (só no desktop): botão redondo na borda do menu; vira trilho de ícones de 4.5rem e os itens do módulo abrem num painel ao lado. A preferência fica no cookie `opme_menu` e o layout lê no servidor, para não piscar ao carregar.
- **Celular** (< 1024 px): o menu vira gaveta com fundo escurecido, aberta pelo botão de menu da barra superior; fecha com Esc, clique fora ou ao navegar.
- **Barra superior** (`src/components/app-shell.tsx`), 4rem, branca translúcida e fixa: busca global em pílula (Ctrl K), tema (lua/sol), ajuda e atalhos, sino de pendências.
- Rotas e permissões do menu não mudaram: vêm de `src/components/nav.ts`, filtradas por perfil em `src/app/(app)/layout.tsx`.

## 7. Padrões de tela

### Lista (ex.: `/financeiro/receber`, `/cadastros/produtos`)
1. `PageHeader`: migalha (módulo), título, subtítulo; ação principal à direita.
2. `KpiGrid` com `Stat`: cartões brancos lado a lado.
3. `FilterBar`/`Filtros`: cartão recolhível com os campos lado a lado e o botão "Filtrar"; embaixo, **chips dos filtros ativos**, cada um com "×", e "Limpar tudo".
4. `Table`: cartão com título e contagem em pílula, ações à direita; cabeçalho fixo ao rolar (no desktop a tabela rola por dentro, até a altura da tela), zebra sutil, hover verde-claro.
5. `EmptyState` quando vazia: ícone em círculo verde-claro, por que está vazia e a ação que resolve.

### Detalhe (ex.: `/financeiro/receber/[id]`, `/comercial/cirurgias/[id]`)
- `PageHeader` com `voltar`, status em `StatusBadge` e ações; com mais de duas ações, a principal e uma secundária ficam à vista e o resto vai para `maisAcoes` (menu "Mais ações").
- Um `Card` por seção (ícone opcional em quadradinho verde-claro), `Dl` para pares rótulo-valor, `Table` para itens.

### Painel (`/`)
- Indicadores em cartões com ícone, gráfico de vendas e próximas cirurgias à esquerda, pendências à direita.

### Login
- Faixa escura da marca à esquerda (cor do menu lateral) com os três pilares do sistema; cartão branco de login à direita.

### Impressos (vale, boleto, orçamento, recolhimento, inventário)
- Sempre claros e sóbrios: a impressão usa o bloco claro, esconde menu e barra superior (`print:hidden`) e tira sombras. Os impressos mantêm as próprias classes `print:` em preto e branco.

## 8. Componentes (`src/components/ui.tsx`, `form.tsx`)

| Componente | Regra |
|---|---|
| `btn.primary` | pílula verde preenchida; **uma** ação principal por tela |
| `btn.secondary` | pílula branca com contorno e texto verdes |
| `btn.ghost` | só texto verde, fundo verde-claro no hover (Cancelar, Limpar) |
| `btn.danger` | pílula branca com contorno e texto vermelhos (excluir, estornar, cancelar) |
| `btn.small` | pílula de 32 px dentro de tabelas |
| `campo` (Field, Select, TextArea, filtros) | 40 px, raio 10 px, `border-field`, foco com borda verde e anel suave de 4 px; inválido com borda e fundo vermelhos |
| Rótulo / dica / erro | rótulo acima (0.8125rem medium); dica `slate-500` abaixo; erro `rose-600` abaixo (substitui a dica) |
| `Badge` / `StatusBadge` | pílula de 24 px, fundo claro da cor semântica, texto escuro da mesma cor e ponto à esquerda |
| `Stat` | cartão com rótulo, quadradinho de ícone (`icon`, opcional; tons de alerta/erro mostram "alerta" por padrão), número grande e nota |
| `KpiGrid` | grade de cartões: 2 colunas no celular; `cols` 3/4 a partir de 1024 px; 5 vira 3 colunas até 1535 px |
| `Abas` | links com sublinhado verde de 2 px na ativa e contagem opcional em pílula |
| `Aviso` | faixa de mensagem (`info`, `alerta`, `erro`, `ok`) com ícone, no lugar de divs coloridas soltas |
| `MaisAcoes` | botão "Mais ações" com menu suspenso; os botões de dentro viram itens de lista; Esc, setas e clique fora |
| `FilterBar` / `Filtros` | ver seção 7; os chips leem os rótulos do próprio formulário |
| `EmptyState` | ícone em círculo verde-claro, `titulo` opcional, texto e ação |
| `toast()` | canto inferior direito (centralizado no celular), cartão branco com ícone em círculo; só sucesso curto. Erro vai em faixa ou no campo |
| `confirmar()` | diálogo nativo de raio 20 px com ícone; destrutivo em vermelho |

Semântica dos status: `green` = concluído, pago, liberado; `yellow` = pendente, aberto, quarentena; `red` = vencido, recusado, não conforme; `blue` = enviado, em andamento; `gray` = cancelado, rascunho; `teal` e `purple` = categorias.

## 9. Acessibilidade

- Foco visível em todo elemento interativo (`outline` de 2 px na cor `--focus`, afastado 2 px).
- Contraste AA em todos os pares de texto e 3:1 em bordas de campo e ícones (seção 3.3).
- Área de toque de 44 px nos botões principais; itens do menu lateral com 36 a 40 px.
- Link "Pular para o conteúdo" no topo; menu lateral com `aria-current="page"` no item ativo e `aria-expanded` nos módulos.
- `prefers-reduced-motion` desliga transições.

## 10. Regras de uso

1. Páginas usam só as escalas nomeadas (`teal`, `slate`, `emerald`, `rose`, `amber`, `sky`, `violet`, `white`) e os tokens (`bg-primary`, `bg-accent-soft`, `border-field`). Nunca hex solto.
2. Uma ação principal por tela; com mais de duas ações no cabeçalho, use `maisAcoes`.
3. Número em célula vai com `text-right` (o cabeçalho da coluna se alinha sozinho).
4. Status sempre por `StatusBadge`/`Badge`; mensagens por `Aviso`.
5. Sucesso em `toast`; erro e aviso em faixa ou no campo.
6. Para mudar o tema, altere os valores em `src/app/estilos/tokens.css` (bloco claro e os dois escuros), rode a verificação de contraste e atualize a seção 3.

## 11. Não confirmado (valor assumido)

- Medidas e cores exatas do app Bling: não medidas; os valores são nossos.
- Comportamento real do Bling ao recolher o menu e no celular: assumido (trilho de ícones e gaveta), padrão comum de ERP web.
- Cabeçalho fixo da tabela: no desktop a tabela rola por dentro (altura da tela menos 10rem), porque o cabeçalho fixo não funciona dentro de um contêiner com rolagem horizontal; no celular a tabela rola só na horizontal e o cabeçalho não fica fixo.

## 12. Revisão de QA visual (16/10/2026)

Percorridas no navegador (Chrome sem interface, 1280 px claro, 390 px claro e 1280 px escuro) as 77 rotas de lista e formulário e 28 de detalhe, com verificação automática de rolagem horizontal, tabela fora do padrão, número alinhado à esquerda, cabeçalho desalinhado da coluna, mais de um botão principal e texto cortado. Nenhuma tela tem rolagem horizontal a 390 px.

**Ajustado**
- `Stat` e indicador do painel: rótulo com a largura toda e ícone de 32 px na linha do número, para o rótulo não quebrar espremido. No celular o número cai para 1.25rem e o ícone some, para valores como "R$ 51.305,00" caberem em duas colunas.
- Painel: 7 indicadores em linhas de 4 (antes eram 3 colunas, e o sétimo ficava sozinho na linha); pendências com título inteiro, nota com reticências e uma seta no lugar do botão "Abrir".
- `Table`: o cabeçalho de uma coluna cujas células têm `text-right` se alinha à direita sozinho (regra em `componentes.css`); o estado vazio fica fora da tabela, com a largura do cartão (no celular o texto saía cortado).
- Uma ação principal por tela: "Filtrar" virou secundário (`Filtros` e documentos); "Processar retorno" (SISPAG e cobrança), "Transferir", "Criar centro de custo" e "Enviar anexo" viraram secundários; "Fechar mês" e "Reabrir" são botões compactos na tabela; a ação do estado vazio nas listas é secundária. Para isso o `Form` ganhou `submitVariant` e `compacto` (sem a linha acima do botão).
- Tabelas da guia de autorização (cartão e formulário da cirurgia) e itens da nova remessa no padrão de `Table`/`Td`, sem mudar campos nem handlers.
- Campo de arquivo: botão "Escolher arquivo" em pílula de contorno verde.
- Rótulos dos filtros soltos (documentos, recolhimento, compras, auditoria, formulários de guia, remessa e pedido de compra) no tamanho dos campos (0.8125rem, medium).
- Filtros no celular: os campos crescem para preencher a linha, dois por linha.
- Pedidos de compra: razão social do fornecedor com reticências em vez de corte seco.

**Ficou (fora do escopo desta revisão ou sem tempo)**
- Telas cujo JSX está em `financeiro/_lib` (detalhe de título a pagar/receber, lista de títulos): glosa, recebimento e classificação continuam com três botões principais na mesma tela; o certo é "Registrar recebimento" principal e os outros secundários. Não mexido porque `_lib` é do agente funcional.
- Detalhes com dois ou três formulários (orçamento, tabela de preço, kit, procedimento, conta bancária, usuário, remessa de cobrança) ainda mostram mais de um botão principal; pedem a mesma troca para `submitVariant="secondary"` nas ações de apoio.
- Tabela de itens do pedido de compra (tem rodapé de total, que o `Table` não suporta) e tabela de comunicação do recolhimento: já no visual do padrão, mas escritas à mão.
- Impressos (vale, boleto, orçamento, recolhimento, inventário) e 768 px: não revisados nesta passada.
