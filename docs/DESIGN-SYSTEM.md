# Design system: SP OSTEOS, layout de ERP real

O visual segue os **ERPs de mercado** (ERPNext, Odoo e Bling) e as **cores da marca SP OSTEOS**: azul `#1b7fc4` e roxo `#4b2a85` do logo, menu azul-marinho e neutros frios. A regra é a dos ERPs reais: tela densa e tabular, bordas finas, cinza neutro, cor só para status, valor negativo e ação principal, tipografia uniforme, filtros compactos e as ações sempre no mesmo lugar.

**Limite legal.** Reproduzimos padrões de interface (estrutura, medidas, comportamento), que não são protegidos. **Não** usamos marca, logotipo, ilustrações, fontes proprietárias, textos nem código de Bling, Odoo ou ERPNext. As cores são as da SP OSTEOS e a fonte é livre (Inter, OFL).

Substitui o tema "Bling médico" (verde-petróleo com acento menta, cartões de raio grande e botões em pílula), que vigorou até 16/10/2026.

## 1. Referências reais (o que embasou cada padrão)

As capturas ficam em `scratchpad/referencias/` (índice em `INDEX.md`, coletado em 16/10/2026). Origens: documentação do Odoo 18 (odoo.com/documentation/18.0), documentação do ERPNext v16 (docs.frappe.io/erpnext) e blog do Bling (atualização das telas de produto). As fotos de marketing do Bling foram descartadas.

| Padrão nosso | ERP e tela de referência | O que copiamos |
|---|---|---|
| Cabeçalho de lista (`PageHeader`) | ERPNext, lista "Sales Invoice" | título simples à esquerda, ações à direita na mesma linha, um só botão primário |
| Cabeçalho de registro (`PageHeader voltar status meta`) | ERPNext, "Item" e "Sales Invoice"; Odoo, recebimento "WH/IN" | trilha "Módulo / Lista", status em etiqueta pastel ao lado do título, ações à direita |
| Faixa de indicadores (`KpiGrid`/`Stat`) | ERPNext, painel de Manufatura; ERPNext, relatório de Resultado (totais sem caixa) | rótulo cinza pequeno sobre o número, sem ícone, sem fundo colorido, cartões planos e iguais |
| Filtros em barra (`FilterBar`) | ERPNext, lista "Sales Invoice" (campos em linha + "Filter") | uma linha de campos de 32 px acima da tabela, botão de filtrar, extras recolhidos |
| Filtros laterais (`FilterBar layout="lateral"`) | Odoo, relatório de estoque (painel de filtros à esquerda); Bling (lista com painel) | coluna de filtros fixa à esquerda da tabela, em telas largas |
| Tabela (`Table`) | ERPNext, "Sales Invoice"; Odoo, "Moves History" | cabeçalho cinza claro, linhas de 32 px sem zebra, valores à direita, total em negrito no rodapé, contagem no topo |
| Status (`Badge`/`StatusBadge`) | ERPNext, "Draft/Unpaid/Overdue/Paid" | etiqueta pequena, fundo pastel e texto escuro da mesma cor |
| Aging (`AgingBarra`) | ERPNext, relatórios "Accounts Receivable/Payable" | barra empilhada por faixa de vencimento, legenda e totais por faixa |
| Conciliação em duas colunas | Odoo, conciliação bancária | extrato à esquerda (data em negrito, valor à direita, item aberto com fundo azul-claro e barra roxa), ações da linha à direita, uma ação principal |
| DRE e fluxo (`Table relatorio`) | ERPNext, "Profit and Loss" e "Cash Flow" | filtros em linha, 3 ou 4 totais, tabela com subtotais em negrito e colunas por período |
| Formulário (`Form`, `Secao`, `Grid`) | ERPNext, "Item" (seções, 2 colunas); Bling, cadastro de produto (Cancelar + Salvar) | rótulo acima (13 px), asterisco vermelho, campo de 32 px, seções com título simples, Cancelar e Salvar juntos |
| Ajuda em "i" (`Dica`) | Bling, cadastro de produto (ícone "i" de ajuda) | texto de ajuda no "i", não em parágrafo fixo |
| Abas (`Abas`) | ERPNext e Odoo (abas de texto sublinhadas) | abas de texto, sem ícone, sublinhado na ativa |

**Removido por não existir em ERP real:** ícone em quadradinho colorido em cartão e indicador, halos e gradientes, botão em pílula em tudo, raios acima de 8 px, sombra em cartão interno, subtítulo explicativo sob o título, nota longa embaixo de cada número, saudação "Olá, fulano", título grande com descrição no login.

**Não verificado:** medidas exatas em pixels dos três produtos. Os valores abaixo são nossos, escolhidos olhando as capturas (2880 px de largura, divididas por 2).

## 2. Como o tema é aplicado

Os estilos ficam em `src/app/estilos/`, importados por `src/app/globals.css`:

| Arquivo | Conteúdo |
|---|---|
| `tokens.css` | `@theme` do Tailwind (fontes, raios, tamanhos, sombras) e as variáveis `--c-*` dos modos claro e escuro |
| `paleta.mjs` | fonte dos valores de cor e verificação de contraste: `node src/app/estilos/paleta.mjs` (relatório) e `--css` (imprime os blocos para colar em `tokens.css`) |
| `base.css` | corpo, títulos, foco, seleção, rolagem, seta do select, campo de arquivo, impressão |
| `componentes.css` | área de conteúdo, faixa de indicadores, tabela (cabeçalho fixo, linha clicável, colunas que somem, relatório), filtros (barra, "Mais filtros", lateral), grade de campos, menu lateral recolhido |

As páginas usam **só** as escalas `teal`, `slate`, `emerald`, `rose`, `amber`, `sky`, `violet` e `white`. Os nomes ficaram do tema anterior de propósito: nenhuma página precisou mudar.

| Escala/variável | Papel |
|---|---|
| `teal-*` | **azul da marca**. `teal-600` = `#1b7fc4` (logo; barra de gráfico, foco). `teal-700` = `#166aa6`: link e botão principal |
| `violet-*` | **roxo da marca**. `violet-700` = `#4b2a85` (logo). Série 2 dos gráficos, destaque de marca (barra do item aberto na conciliação), categoria |
| `slate-*` | neutros frios: fundo, bordas, rótulos, texto |
| `emerald` / `amber` / `rose` / `sky` | sucesso / alerta / erro / informação |
| `white` | superfície (cartão, campo); no escuro vira a superfície escura |
| `bg-primary`, `text-on-primary`, `primary-hover/active` | botão principal |
| `accent`, `accent-soft`, `on-accent-soft` | roxo da marca e seu fundo claro (sobrou do tema anterior; quase sem uso) |
| `bg-sidebar`, `text-sidebar-fg`, `text-sidebar-fg-ativo`, `bg-sidebar-destaque` | menu lateral (azul-marinho em `tokens.css`; a casca pode sobrescrever estes quatro em `estilos/menu.css`, que é da sessão do menu) |
| `border-field` | borda dos campos (3:1 sobre a superfície) |
| `--shadow-card` | **vazio**: `shadow-sm`/`shadow` não desenham nada em cartões; `shadow-lg` é sutil; `shadow-xl` fica para menus, diálogos e toast |

**Escuro.** Escolhido pelo usuário (cookie `opme_tema`, `data-theme="dark"`) ou, sem escolha, segue o sistema. Os dois blocos escuros de `tokens.css` são idênticos; ao mudar uma cor, regenere com o script. O escuro só vale na tela (`@media screen`): **a impressão usa sempre o claro**.

**Cuidado com `white` no escuro.** `text-white` vira a cor da superfície escura. No menu lateral use `text-sidebar-fg-ativo`.

## 3. Paleta

### 3.1 Claro

| Passo | teal (azul) | violet (roxo) | slate | emerald | amber | rose | sky |
|---|---|---|---|---|---|---|---|
| 50 | `#eef6fc` | `#f5f2fb` | `#f8fafc` | `#effaf3` | `#fffbeb` | `#fef2f2` | `#f0f7ff` |
| 100 | `#d9eaf8` | `#ebe4f6` | `#f1f4f8` | `#d9f2e2` | `#fef3c7` | `#fde3e3` | `#ddeefe` |
| 200 | `#b6d6f0` | `#d6c9ed` | `#e3e8ef` | `#b3e4c4` | `#fde68a` | `#fbcaca` | `#bcdcfb` |
| 300 | `#84bae4` | `#b8a0de` | `#cbd3de` | `#7fcf9c` | `#fbd04f` | `#f6a3a3` | `#89c1f5` |
| 400 | `#4f9cd6` | `#9474c9` | `#8190a5` | `#3fae68` | `#f5ae24` | `#ec6b6b` | `#4f9ee9` |
| 500 | `#2b8bcf` | `#7552b0` | `#5d6b80` | `#1a9047` | `#dd8a0a` | `#dc2f2f` | `#2a80d6` |
| 600 | **`#1b7fc4`** | `#5f3c9c` | `#4a576b` | **`#15803d`** | **`#b45309`** | **`#b91c1c`** | `#1d67b8` |
| 700 | `#166aa6` | **`#4b2a85`** | `#364256` | `#166534` | `#92400e` | `#991b1b` | `#195495` |
| 800 | `#125789` | `#3e236e` | `#232d3e` | `#14532d` | `#78350f` | `#7f1d1d` | `#18467a` |
| 900 | `#0f476f` | `#331d5a` | `#131b2b` | `#11442a` | `#652d10` | `#691a1a` | `#163b64` |
| 950 | `#0a2d48` | `#20123a` | `#0a101c` | `#062b17` | `#3f1904` | `#430b0b` | `#0e2541` |

Outras variáveis do claro: fundo `--bg #f4f6f9`, superfície `#ffffff`, texto `#131b2b`; primário `#166aa6` (hover `#125789`, pressionado `#0f476f`, texto branco); foco `#1b7fc4`; acento `#4b2a85` sobre `#f5f2fb`; menu lateral `#0f1f3d` (texto `#c7d2e6`, ativo `#ffffff`, destaque lilás `#a78fe0`); borda de campo `#8190a5`.

**Por que o botão não usa o azul do logo.** Branco sobre `#1b7fc4` dá **4,30:1**, abaixo dos 4,5:1 que o texto de 14 px exige (WCAG 1.4.3). O botão e o link usam o passo 700 (`#166aa6`, 5,76:1); o `#1b7fc4` fica para o que não é texto (barra de gráfico, anel de foco, ícone).

### 3.2 Escuro (dessaturado, sem inverter)

| Passo | teal | violet | slate | emerald | amber | rose | sky |
|---|---|---|---|---|---|---|---|
| 50 | `#10243a` | `#221a3a` | `#182134` | `#0e2a1c` | `#2f230e` | `#361518` | `#11253d` |
| 200 | `#183a5e` | `#382b61` | `#26314a` | `#194a33` | `#563e14` | `#5f2328` | `#1b3d63` |
| 400 | `#2c6ea8` | `#6c5ab3` | `#68758d` | `#2f8f61` | `#ac7b22` | `#bf4a50` | `#3572b5` |
| 500 | `#3f8dcc` | `#8d7bd2` | `#8c98ad` | `#45ae7b` | `#d49b38` | `#e2676c` | `#5390d6` |
| 600 | `#62a6de` | `#a99be2` | `#a8b2c4` | `#68c695` | `#e8b860` | `#ee8a8e` | `#78ace6` |
| 700 | `#7db7e6` | `#bcb1ea` | `#c3cbd8` | `#84d3a9` | `#efca80` | `#f3a4a7` | `#94bfee` |
| 900 | `#cfe3f6` | `#e9e5f9` | `#edf1f6` | `#d0f0de` | `#faedd1` | `#fbdfe0` | `#dbeaf9` |

(escala completa em `paleta.mjs`.) Fundo `#0d1422`, superfície `#141c2d`, texto `#edf1f6`; primário `#5aa3dc` com texto escuro `#08182b`; menu `#0a1426` (texto `#b4c0d6`); borda de campo `#68758d`.

### 3.3 Contraste (WCAG AA), verificado por script

`node src/app/estilos/paleta.mjs` confere 43 pares por modo; **0 falhas**. Texto pede 4,5:1; borda de campo, ícone, foco, barra de gráfico e destaque do menu pedem 3:1.

| Par | Claro | Escuro |
|---|---|---|
| texto `slate-900` / superfície | 17,22 | 15,01 |
| texto apagado `slate-500` / fundo | 5,00 | 6,32 |
| rótulo `slate-600` / superfície | 7,33 | 7,97 |
| link `teal-700` / superfície | 5,76 | 7,93 |
| botão principal (texto / fundo) | 5,76 | 6,55 |
| status `emerald-700` / `emerald-50` | 6,67 | 8,69 |
| status `amber-700` / `amber-50` | 6,84 | 9,82 |
| status `rose-700` / `rose-50` | 7,60 | 8,36 |
| status `sky-700` / `sky-50` | 7,09 | 8,07 |
| status `violet-700` / `violet-50` | 9,64 | 8,31 |
| texto `amber-600` / superfície | 5,02 | 9,29 |
| texto `rose-600` / superfície | 6,47 | 7,02 |
| texto do menu / fundo do menu | 10,74 | 10,04 |
| destaque do menu / fundo do menu (3:1) | 5,96 | 7,43 |
| borda de campo / superfície (3:1) | 3,25 | 3,66 |
| barra `teal-600` / superfície (3:1) | 4,30 | 6,51 |
| barra `violet-500` / superfície (3:1) | 5,85 | 4,78 |

**Gráficos CSS** (aging da visão geral, comparativo do fluxo) usam só tokens: série 1 `bg-teal-600` (azul), série 2 `bg-violet-500` (roxo); no aging, vencido `bg-rose-500`, vence hoje `bg-amber-400`, 7 dias `bg-teal-600`, 30 dias `bg-teal-300`, depois `bg-slate-300`. O valor sempre aparece também em texto ao lado.

## 4. Tipografia

Uma fonte só: **Inter** (`--font-display` aponta para ela; a Manrope saiu). O `src/app/layout.tsx` ainda carrega a Manrope; pode ser removida de lá (arquivo de outra sessão).

| Uso | Valor |
|---|---|
| Corpo, células, campos, botões | 0.875rem (14 px), linha 1.5 |
| Título de página | 1.25rem (20 px) semibold; registro (com `voltar`): 1.375rem |
| Trilha acima do título | 0.75rem, `slate-500`; o link da lista em `teal-700` |
| Título de cartão e de tabela | 0.9375rem (15 px) semibold |
| Rótulo de campo | 0.8125rem medium `slate-700`; nos filtros 0.75rem `slate-600` |
| Cabeçalho de tabela | 0.75rem semibold `slate-600`, caixa normal, fundo `slate-50` |
| Rótulo / valor de indicador | 0.75rem medium `slate-600` / 1.25rem semibold (1.125rem no celular) |
| Pequeno (nota, status, dica) | 0.75rem |

## 5. Espaçamento, raios e sombras

**Conteúdo** (`.conteudo`): recuo de 1rem no celular, 1.5rem a partir de 768 px e 2rem a partir de 1440 px; largura máxima de 1680 px. Topo de 1rem (1.25rem a partir de 768 px).

**Ritmo:** 1rem (16 px) entre blocos; cabeçalho de cartão 44 px; corpo do cartão 16 px; 8 px entre controles.

**Alturas:** campo e botão **32 px** (área de toque estendida a 44 px por pseudo-elemento); botão `small` 28 px; linha de tabela 32 px; cabeçalho de tabela 32 px.

| Raio | Valor | Uso |
|---|---|---|
| `rounded-sm` | 4 px | status, chip, kbd |
| `rounded` / `rounded-md` / `rounded-lg` | 6 px | campo, botão, item de menu, aviso |
| `rounded-xl` | 8 px | cartão, tabela, faixa de indicadores, menus suspensos |
| `rounded-2xl` | 10 px | diálogo |
| `rounded-full` | pílula | só avatar, busca global e ponto de status |

**Sombras:** nenhuma em cartão, tabela ou indicador (a borda de 1 px `slate-200` faz o contorno). `shadow-xl` só em menu suspenso, diálogo, dica e toast.

## 6. Casca (menu lateral e barra superior)

- **Menu lateral** (`src/components/menu-lateral.tsx`), 16rem, fundo `--sidebar` (azul-marinho): marca SP OSTEOS no topo (`<Marca sobreEscuro />`), módulos (setores) em sanfona com ícone e rótulo, o módulo da tela atual aberto, subgrupos com rótulo em caixa alta (Financeiro: Receber, Pagar, Banco, Resultado). Item ativo: véu claro e **barra lilás de 3 px** (`--sidebar-destaque`) à esquerda. Usuário no rodapé (avatar, nome, perfil) com aparência (Claro, Escuro, Sistema) e Sair.
- **Recolher** (só no desktop): botão redondo na borda do menu; vira trilho de ícones de 4.5rem e os itens do módulo abrem num painel ao lado. A preferência fica no cookie `opme_menu` e o layout lê no servidor, para não piscar ao carregar.
- **Celular** (< 1024 px): o menu vira gaveta com fundo escurecido, aberta pelo botão de menu da barra superior; fecha com Esc, clique fora ou ao navegar.
- **Barra superior** (`src/components/app-shell.tsx`), 4rem, branca translúcida e fixa: busca global em pílula (Ctrl K), tema (lua/sol), ajuda e atalhos, sino de pendências.
- Rotas e permissões do menu não mudaram: vêm de `src/components/nav.ts`, filtradas por perfil em `src/app/(app)/layout.tsx`.

### Posição do menu (à esquerda ou no topo)

Preferência de cada usuário, em **menu do usuário → Aparência → Posição do menu** (rodapé do menu lateral ou avatar da barra do topo; só aparece a partir de 1024 px, porque abaixo disso os dois modos são a mesma gaveta). Não há tela de preferências em `/conta` (só a troca de senha), então o menu do usuário é o único lugar.

- **À esquerda** (padrão): a casca descrita acima, sem mudança de comportamento.
- **No topo** (estilo Bling, `src/components/menu-topo.tsx`), duas faixas fixas no topo e conteúdo na largura toda (sem coluna de menu):
  - **Faixa 1** (56 px, branca, borda inferior fina): logo SP OSTEOS (36 px de altura) à esquerda; à direita lupa (abre a mesma busca global num painel; Ctrl K abre e foca), tema, ajuda, sino e avatar com nome e perfil (duas linhas de 12 px) e seta. Botões de 36 px, cantos de 6 px, 8 px entre eles.
  - **Faixa 2** (44 px, fundo `--sidebar`, o mesmo azul-marinho do menu lateral nos dois temas): módulos na horizontal, ícone de 16 px + rótulo de 14 px, 16 px de recuo, 4 px entre itens. Ativo: véu claro e **sublinhado de 2 px** em `--sidebar-destaque` (o mesmo destaque do item ativo no menu lateral). O que não cabe na largura vai para **"Mais ▾"** (medido em tempo real; com o menu do ADMIN, cabem todos os 9 a partir de 1280 px).
  - **Menu suspenso** abaixo da faixa 2, painel branco com borda e sombra de menu: lista simples quando o módulo tem um grupo; **mega-menu em colunas** quando tem mais de um (Financeiro: Geral, Receber, Pagar, Banco, Resultado; Qualidade: Geral, Ação de campo, Conformidade). O painel alinha ao módulo e não passa da borda direita do conteúdo.
  - Acessibilidade (padrão "disclosure navigation" do WAI-ARIA APG): botões com `aria-expanded`/`aria-controls`; Enter/Espaço abre e fecha, seta para baixo entra no painel, setas esquerda/direita andam entre módulos ou entre colunas, Home/End, Esc fecha e devolve o foco ao módulo; fecha ao clicar fora, ao sair com Tab, ao redimensionar e ao navegar. Mouse: abre ao passar (140 ms) ou ao clicar.
  - Alinhamento: as duas faixas usam a mesma largura máxima (1680 px) e o mesmo recuo do `.conteudo` (24 px; 32 px a partir de 1440 px), então logo, primeiro módulo e título da página começam na mesma linha.
  - Abaixo de 1024 px: a mesma barra do celular e a mesma gaveta do modo lateral (`BarraLateral soCelular`).
- **Persistência**: cookie `opme_menu_pos` (`esquerda` | `topo`, 1 ano, `httpOnly`, `sameSite=lax`) gravado pela Server Action `definirPosicaoMenu` (`src/lib/tema-actions.ts`: `requireUser` + `argEnum`). O layout `src/app/(app)/layout.tsx` lê o cookie no servidor e a página já nasce no modo certo (sem piscar). A troca na tela é instantânea (estado do `AppShell`); a ação só persiste. O shell expõe `data-menu="esquerda|topo"`.
- Tema claro e escuro funcionam nos dois modos (tokens `slate`/`white`/`sidebar`); a impressão esconde as duas barras (`print:hidden`).

## 7. Padrões de tela

### Lista (ex.: `/financeiro/receber`) — ERPNext "Sales Invoice"
1. `PageHeader`: trilha (módulo), título, "i" com a explicação, **uma** ação principal à direita.
2. `KpiGrid` com 3 ou 4 `Stat` curtos (rótulo + número + nota de uma linha), clicáveis quando levam a um filtro.
3. `Filtros`/`FilterBar`: barra de uma linha; até 4 campos à vista, o resto em "Mais filtros"; chips dos filtros ativos embaixo. Em listas com muitos filtros, `layout="lateral"` dentro de `ListaComFiltros` (painel à esquerda a partir de 1536 px).
4. `Table` com título e contagem; **primeira coluna** com o nome do registro em link (`Celula href`), que deixa a **linha inteira clicável**; números à direita; status em `Badge`; total no `rodape`; colunas secundárias com `hideOnMobile`; sem botão "Abrir/Editar" por linha (a linha abre; a ação principal fica no registro).
5. `EmptyState` quando vazia: ícone cinza, por que está vazia e a ação que resolve.

### Registro / detalhe (ex.: `/financeiro/receber/[id]`, `/financeiro/remessas/[id]`) — ERPNext "Item", Odoo "WH/IN"
1. `PageHeader` com `voltar` (vira a trilha "Financeiro / Contas a receber"), `status` ao lado do título e `meta` em linha (parceiro · origem · competência); ações à direita, a principal por último (ex.: "Registrar recebimento", âncora para o formulário); com mais de duas, use `maisAcoes`.
2. Faixa de **fatos-chave**: `KpiGrid` com 3 ou 4 `Stat` (valor, pago, saldo, vencimento), uma moldura só com fios entre as células.
3. Seções em `Card` compactos (dados em `Dl`, rótulo à esquerda como no Odoo), itens em `Table`; ações de apoio em cartões no fim, botão secundário. Com mais de 3 seções longas, prefira `Abas`.

### Formulário (ex.: `/financeiro/contas/nova`, `/financeiro/receber/novo`) — ERPNext "Item", Bling produto
- `Form` dentro de um `Card` de até `max-w-5xl`; campos em `Secao` (título pequeno + descrição) com `Grid cols={2|3}`; as colunas seguem a largura do formulário.
- Rótulo acima, asterisco vermelho no obrigatório (`label="Nome *"`), dica curta abaixo, erro abaixo do campo com ícone (substitui a dica).
- Rodapé com **Cancelar** (`cancelarHref`) e **Salvar** à direita; em formulário longo de página inteira, `rodapeFixo`.

### Conciliação (`/financeiro/conciliacao`) — Odoo
Extrato pendente à esquerda (22rem, rola por dentro), painel da linha aberta à direita: sugestões com a ação principal, baixar título, lançamento avulso; "Excluir linha" no rodapé do painel. A linha aberta vai na URL (`?linha=`), sem estado no navegador.

### Relatório (DRE, fluxo, aging) — ERPNext "Profit and Loss" / "Cash Flow"
Filtros em linha; faixa de 4 totais; `Table relatorio` (sem rolagem interna, 1ª coluna fixa ao rolar na horizontal, estreita no celular); subtotais em negrito (`linha-forte`); total no rodapé; no DRE os valores vão sem "R$" (o título diz a moeda) para caber a coluna Total. Botão "Imprimir"; na impressão entra o `CabecalhoImpresso` com a logo colorida.

### Painel (`/`) — recomendação para a sessão dona de `_painel`
Sem saudação "Olá, fulano" nem frase de abertura. Números em `KpiGrid`/`Stat` (faixa única, cor só quando há o que tratar); aging em barra como o da visão geral do Financeiro (`financeiro/_lib/aging-barra.tsx`); pendências como lista de linhas com a quantidade à esquerda, sem ícone.

### Login
Fundo neutro com o isotipo em marca d'água (sem halos nem gradientes); cartão com borda de 1 px, logo, "Entrar no sistema" e o formulário. Sem frase de efeito.

### Impressos (vale, boleto, orçamento, recolhimento, inventário, DRE, fluxo, aging)
Sempre claros: a impressão usa o bloco claro, esconde menu, barra e botões (`print:hidden`) e mostra o `CabecalhoImpresso` (logo colorida, mesmo com o tema escuro ativo na tela).

## 8. Componentes (`src/components/ui/*.tsx`, reexportados por `ui.tsx`; `form.tsx`)

| Componente | Regra |
|---|---|
| `btn.primary` | retângulo azul de 32 px, raio 6 px; **uma** ação principal por tela |
| `btn.secondary` | contorno cinza, texto escuro (todas as ações de apoio) |
| `btn.ghost` | só texto cinza (Cancelar, Limpar) |
| `btn.danger` | contorno cinza, texto vermelho (excluir, estornar, cancelar) |
| `btn.small` | 28 px, contorno cinza, para dentro de tabelas |
| `AcaoIcone` | ação de linha só com ícone (`olho`, `lapis`, `baixar`), com dica e rótulo para leitor de tela |
| `campo` (Field, Select, TextArea, filtros) | 32 px, raio 6 px, `border-field`, foco com borda azul e anel suave; inválido com borda vermelha |
| `PageHeader` | `title`, `subtitle` (vai para o "i"), `actions`, `maisAcoes`, `voltar`, **`status`**, **`meta`** |
| `Card` | borda 1 px, raio 8 px, sem sombra; cabeçalho 44 px; `title`, `actions`, **`semRecuo`**, **`rodape`**, **`id`**; `icon` ignorado |
| `Table` | ver padrão de lista; `head` aceita texto ou `{ label, className, hideOnMobile }`; **`rodape`**, **`paginacao`**, **`relatorio`**; `icone` ignorado |
| `Td` | célula; **`title`** e **`colSpan`** |
| `Paginacao` | "1–50 de 312" e setas, no `paginacao` da tabela |
| `Stat` / `KpiGrid` | célula de faixa; `tone` default, **ok**, **info**, warn, danger; **`delta`** {valor, direcao, bom}; **`href`**; `icon` ignorado. `KpiGrid` 2 colunas no celular (célula ímpar ocupa a linha), `cols` 3/4/5 |
| `Badge` / `StatusBadge` | etiqueta de 20 px, raio 4 px, fundo pastel e texto escuro; **`title`**; texto com a primeira letra maiúscula |
| `Aviso` | borda esquerda de 3 px na cor do tom e ícone, fundo branco (`info`, `alerta`, `erro`, `ok`) |
| `Dl` | rótulo à esquerda (9 rem) e valor, linhas com fio; **`cols`** 1/2/3 (padrão 2) |
| `Abas` | abas de texto, sublinhado azul de 2 px na ativa, contagem discreta |
| `FilterBar` / `Filtros` | **`layout`** "barra" ou "lateral"; `ListaComFiltros` para o lateral |
| `Dica` | "i" com o texto no hover e no foco; **`alinhar`** "esquerda" ou "direita" |
| `Form` | **`cancelarHref`**, **`rodapeFixo`**, `submitVariant`, `compacto`; botão à direita |
| `Secao` | seção de formulário com título e descrição |
| `Grid` | colunas pela largura do formulário (container query) |
| `MaisAcoes` | botão neutro "Mais ações" com menu |
| `EmptyState` | ícone cinza, `titulo` opcional, texto e ação |
| `toast()` | cartão com borda esquerda verde (ou vermelha); só sucesso curto |
| `confirmar()` | diálogo nativo de raio 10 px; destrutivo em vermelho |

Semântica dos status: `green` = concluído, pago, liberado; `yellow` = pendente, aberto, aguardando; `red` = vencido, recusado, rejeitado; `blue` = enviado, em andamento, parcial; `gray` = cancelado, rascunho; `teal` e `purple` = categorias.

## 9. Mudanças de API (16/10/2026)

Nenhuma prop foi removida; o que muda é o desenho:

1. **`PageHeader.subtitle`** não aparece mais como parágrafo sob o título: vai para um "i" ao lado do título. Texto que precisa estar sempre visível vai em `Aviso` ou em `meta`.
2. **`Card.icon`**, **`Stat.icon`** e **`Table.icone`** continuam aceitos e não são mais desenhados.
3. **`Grid`** passou a contar colunas pela largura do formulário, não da tela (2 colunas a partir de 512 px de formulário; 3 a partir de 672 px; 4 a partir de 768 px). `sm:col-span-N` num campo ocupa a linha inteira enquanto o formulário não tem todas as colunas. Fora de `Form`/`Card` o `Grid` fica com 1 coluna (todas as telas atuais estão dentro de um dos dois).
4. **`Dl`** passou de 3 para 2 colunas em telas largas (rótulo à esquerda); use `cols={3}` para o desenho antigo.
5. **`StatusBadge`** escreve "Em andamento" (antes "em andamento").
6. **`Form`**: o botão de envio fica à direita (exceto com `compacto`).
7. Botões e campos com **32 px** (antes 40 px); `secondary`, `small` e "Mais ações" são cinza (antes contorno verde).
8. **`KpiGrid`** virou uma faixa única com fios; filhos que não são `Stat` (o `Indicador` do Painel, links) viram células sem cartão próprio.
9. Novos: `AcaoIcone`, `Dica`, `Paginacao`, `ListaComFiltros`, `Secao` e as props marcadas em negrito na seção 8.

## 10. Acessibilidade

- Foco visível em todo elemento interativo (contorno de 2 px em `--focus`, afastado 2 px); a `Dica` abre também no foco do teclado.
- Contraste AA em todos os pares de texto e 3:1 em bordas de campo, ícones e barras (seção 3.3).
- Botões de 32 px com área de toque de 44 px; linhas clicáveis com um link real na primeira coluna (o resto da linha é extensão dele).
- Coluna que some no celular (`hideOnMobile`) só para dado secundário; o principal fica sempre.
- Link "Pular para o conteúdo"; `aria-current` no item ativo do menu e no item aberto da conciliação.
- `prefers-reduced-motion` desliga transições.

## 11. Regras de uso

1. Páginas usam só as escalas nomeadas e os tokens. Nunca hex solto.
2. **Uma** ação principal por tela, no cabeçalho ou no fim do formulário principal; as demais em `secondary`.
3. Número em célula com `text-right` (o cabeçalho acompanha sozinho).
4. Status sempre por `StatusBadge`/`Badge`; mensagem por `Aviso`; explicação longa por `Dica`.
5. Sem ícone decorativo em cartão, indicador ou título; ícone só quando é a ação (lupa, imprimir, olho, lápis).
6. Sucesso em `toast`; erro e aviso em faixa ou no campo.
7. Para mudar uma cor: altere `src/app/estilos/paleta.mjs`, rode o script (0 falhas), cole a saída de `--css` em `tokens.css` e atualize a seção 3.

## 12. Revisão visual (16/10/2026)

Percorridas no Chrome sem interface, a 1440 px nos temas claro e escuro e a 390 px, todas as telas do Financeiro (visão geral, receber, pagar, aprovações, cobrança e remessa de cobrança, remessas SISPAG e detalhe, favorecidos e detalhe, contas, detalhe e nova, conciliação, classificar, fluxo, DRE, plano de contas, relatórios, fechamento, título a receber e a pagar, novo título), a troca de senha e o login. Nenhuma tem rolagem horizontal da página. Capturas em `scratchpad/design2/` (`v3/` claro 1440, `escuro/`, `m390/`).

**Corrigido nesta passada:** DRE com rolagem interna que escondia o "Resultado líquido" e coluna Total sumindo no celular (agora `Table relatorio`); cartões da visão geral com alturas diferentes (agora faixa única e textos curtos); impresso com a logo branca quando o tema escuro estava ativo; "Classificar pendentes" mostrava "Lançamento avulso" em todos os itens (o tipo vinha como "A receber"/"A pagar" e era comparado com "receber"/"pagar").

## 13. Não confirmado (valor assumido)

- Medidas e cores exatas de ERPNext, Odoo e Bling: não medidas; os valores são nossos, a partir das capturas.
- Painel lateral de filtros só a partir de 1536 px: escolha nossa para a tabela não ficar espremida ao lado do menu lateral.
- Cabeçalho fixo da tabela: no desktop a tabela de lista rola por dentro (altura da tela menos 9rem); a tabela de relatório não rola por dentro e o cabeçalho não fica fixo.
