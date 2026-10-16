# Design system — tema "Horizonte" (estilo SAP Fiori Horizon)

O visual do sistema segue o **estilo** do SAP Fiori, tema Horizon: claro ("Morning Horizon") e escuro ("Evening Horizon"). Ele foi escolhido por ser o design system de ERP com mais documentação pública, e porque os floorplans dele (List Report, Object Page, Overview Page) correspondem às nossas telas.

**Limite legal.** Reproduzimos o estilo: cores, tipografia, medidas, raios, sombras, estrutura dos floorplans e padrões de interação. **Não** usamos a marca SAP, logos, a fonte proprietária "72" nem CSS ou código do SAPUI5/UI5 Web Components. A fonte é a **Inter** (licença OFL), servida pelo `next/font`, com a fonte do sistema como reserva. Os valores numéricos vêm dos parâmetros públicos do tema no repositório `SAP/theming-base-content`, que é Apache 2.0. Lemos esses valores e os reescrevemos nos nossos próprios tokens; nenhum arquivo deles foi copiado.

## 1. Fontes consultadas

| Fonte | Status | O que deu |
|---|---|---|
| `github.com/SAP/theming-base-content` → `content/Base/baseLib/sap_horizon/css_variables.css` e `sap_horizon_dark/css_variables.css` (Theming Engine 17.0.47) | **lido** | todos os hex, raios, sombras, alturas, tamanhos de fonte e recuos citados abaixo |
| experience.sap.com/fiori-design-web (List Report, Object Page, Overview Page, Table Overview, Button, Message Toast, Message Strip, Shell Bar, Dynamic Page, Typography) | **lido via web.archive.org** (o site novo em sap.com/design-system devolve 403 para robôs) | estrutura dos floorplans, regras de botão, toast, faixa de mensagem e shell bar |
| páginas "colors" e "typography" arquivadas | lidas, mas descrevem Belize/Quartz, não Horizon | só a escala geral de títulos; as cores Horizon vêm dos tokens |
| "responsive-spacing-system", "object-status", "message-handling" | **não abriram** (404 no arquivo, 403 no site; "object-status" foi descontinuada e redireciona para "Object Display Components") | recuos tirados do token `sapContent_Padding_*`; semântica de status tirada dos tokens `sap*Color`/`sap*Background` |

## 2. Como o tema é aplicado

As páginas usam **apenas** as escalas do Tailwind `teal`, `slate`, `emerald`, `rose`, `amber`, `sky`, `violet` e `white`. Em `src/app/globals.css` cada escala é remapeada para uma variável `--c-<escala>-<passo>`, e cada modo (claro, escuro, impressão) tem o seu bloco de valores. Para trocar o tema basta trocar os valores. Nenhuma `page.tsx` muda.

| Escala/variável nossa | Papel Fiori |
|---|---|
| `teal-*` | azul de marca, links e texto de botão (`teal-700` = link) |
| `slate-*` | neutros: fundo, bordas, rótulos, texto |
| `emerald` / `rose` / `amber` / `sky` | Positive / Negative / Critical / Informative |
| `violet` | cor de destaque 9 (Accent 9), para categorias |
| `white` | superfície (cartão, campo); no escuro vira a superfície escura |
| `bg-primary`, `text-on-primary`, `primary-hover/active` | botão Emphasized (só nos componentes) |
| `border-b-field` | linha inferior do campo (`sapField_BorderColor`) |
| `--focus` (`outline-focus`, `ring-focus`) | `sapContent_FocusColor` |
| `bg-shell`, `border-shell-border` | barra superior (`sapShellColor`, `sapShell_BorderColor`) |
| `--shadow-card / -raised / -overlay / -header` | `sapContent_Shadow0 / 1 / 2` e `sapContent_HeaderShadow` |

## 3. Paleta

Legenda: **T** = valor exato de um token Horizon (nome entre parênteses). **D** = passo derivado, interpolado entre dois tokens vizinhos para completar a escala de 11 passos do Tailwind.

### 3.1 Claro (Morning Horizon)

| Passo | teal (marca) | slate (neutros) | emerald | rose | amber | sky |
|---|---|---|---|---|---|---|
| 50 | `#ebf8ff` T (List_SelectionBackgroundColor) | `#f5f6f7` T (BackgroundColor) | `#f5fae5` T (SuccessBackground) | `#ffeaf4` T (ErrorBackground) | `#fff8d6` T (WarningBackground) | `#e1f4ff` T (InformationBackground) |
| 100 | `#d1efff` T (AccentBackgroundColor6) | `#eaecee` T (HoverColor) | `#ebf5cb` T (AccentBackgroundColor8) | `#ffd6e9` T (Button_Reject_Background) | `#fff3b8` T (AccentBackgroundColor1) | `#d1efff` T |
| 200 | `#a6e0ff` D | `#e5e5e5` T (List_BorderColor) | `#c8e6a0` D | `#ffc2de` T (Button_Reject_BorderColor) | `#ffdf72` D | `#a6e0ff` D |
| 300 | `#70c4ff` D | `#bcc3ca` T (Button_BorderColor) | `#8fcf6a` D | `#ff8cb2` D | `#f7bf00` D | `#70c4ff` D |
| 400 | `#4db1ff` D | `#758ca4` T (Content_NonInteractiveIconColor) | `#4fae5e` D | `#f53232` T (NegativeElementColor) | `#dd6100` T (WarningBorderColor) | `#4db1ff` D |
| 500 | `#1b85f7` D | `#5b728a` D (texto apagado, AA) | `#30914c` T (PositiveElementColor) | `#e90b0b` T (ErrorBorderColor / Field_InvalidColor) | `#e76500` T (CriticalElementColor) | `#0070f2` T (InformativeColor) |
| 600 | `#0070f2` T (BrandColor) | `#556b82` T (Content_LabelColor) | `#2a7f43` D | `#aa0808` T (NegativeColor / NegativeTextColor) | `#b44f00` T (CriticalTextColor) | `#0064d9` T (InformativeTextColor) |
| 700 | `#0064d9` T (HighlightColor / LinkColor / Button_TextColor) | `#3f5568` D | `#256f3a` T (PositiveColor) | `#8f0707` D | `#9a4400` D | `#0057d2` T (AccentColor6) |
| 800 | `#0050b8` D | `#223548` T (Content_ShadowColor) | `#1e5a2f` D | `#6e0505` D | `#7a3600` D | `#0040b0` D |
| 900 | `#0032a5` T (Content_FocusColor) | `#131e29` T (TextColor) | `#174526` D | `#520404` D | `#5c2900` D | `#0032a5` T |
| 950 | `#00144a` D | `#0b1219` D | `#11331a` D | `#350000` D | `#382700` D | `#00144a` D |

`violet` (claro): 100 `#ddccf0` T (AccentBackgroundColor9), 600 `#6c32a9` T (AccentColor9); os outros passos são D.

Variáveis do claro: `--bg #f5f6f7` (BackgroundColor), `--surface/white #fff` (BaseColor), `--fg #131e29` (TextColor), `--primary #0070f2` (Button_Emphasized_Background), `--primary-hover #0064d9` (Button_Emphasized_Hover_Background), `--focus #0032a5`, `--shell #fff` (ShellColor), `--shell-border #d9d9d9` (Shell_BorderColor), `--field-border #556b81` (Field_BorderColor).

### 3.2 Escuro (Evening Horizon)

| Passo | teal | slate | emerald | rose | amber | sky |
|---|---|---|---|---|---|---|
| 50 | `#0f2236` D | `#222b35` T (HoverColor) | `#11331a` T (SuccessBackground) | `#350000` T (ErrorBackground) | `#382700` T (WarningBackground) | `#00144a` T (InformationBackground) |
| 100 | `#002643` T (Button_Selected_Background) | `#28323d` D | `#17421f` D | `#490000` T (Button_Reject_Background) | `#4a3300` D | `#002643` T |
| 200 | `#003b6b` D | `#2e3742` T (List_BorderColor) | `#236c39` T (AccentBackgroundColor8) | `#620000` T (Button_Reject_BorderColor) | `#6b4a00` D | `#003b6b` D |
| 300 | `#0054cc` T (AccentBackgroundColor6) | `#3a4a5a` T (Button_BorderColor) | `#3f7f1f` D | `#890506` T (AccentBackgroundColor2) | `#8f6400` D | `#0054cc` T |
| 400 | `#0070f2` T (BrandColor) | `#647891` T (ScrollBar_FaceColor) | `#6dad1f` T (PositiveElementColor) | `#e04848` D | `#f7bf00` T (CriticalElementColor) | `#008fff` T (LinkColor) |
| 500 | `#008fff` T (LinkColor) | `#8396a8` T (Content_LabelColor) | `#97dd40` T (PositiveColor) | `#fa6161` T (NegativeColor) | `#ffdf72` T (CriticalColor) | `#4db1ff` T (InformativeColor) |
| 600–700 | `#4db1ff` T (HighlightColor / Button_TextColor) | 600 `#a9b4be` T (NeutralColor); 700 `#c5cdd4` D | `#97dd40` T | 600 `#fa6161` T; 700 `#ff8a8a` D | `#ffdf72` T (CriticalTextColor) | `#4db1ff` T |
| 800 | `#9ad3ff` T (Content_FocusColor) | `#e1e6ea` D | `#bde986` T (AccentColor8) | `#ffb3b3` D | `#ffe9a3` D | `#9ad3ff` T |
| 900 | `#c3e5ff` D | `#f5f6f7` T (TextColor) | `#d6f2b4` D | `#ffd1d1` D | `#fff2c7` D | `#c3e5ff` D |
| 950 | `#e1f4ff` D | `#ffffff` | `#ebf9d9` D | `#ffe8e8` D | `#fff8e5` D | `#e1f4ff` D |

`violet` (escuro): 100 `#4e247a` T (AccentBackgroundColor9), 500–600 `#b995e0` T (AccentColor9), 700 `#d3b6ff` T (AccentColor5).

Variáveis do escuro: `--bg #12171c` (BackgroundColor), `--surface/white #1d232a` (BaseColor), `--fg #f5f6f7`, `--primary #0070f2` (o Emphasized continua azul com texto branco, como no Horizon escuro), `--focus #9ad3ff`, `--shell #1d232a`, `--shell-border #2e3742`, `--field-border #a9b4be`.

**Impressão:** `@media print` força o bloco claro, com fundo branco e texto preto. O boleto e o vale continuam usando as próprias classes `print:`.

### 3.3 Contraste (WCAG AA), verificado por script

Texto pede 4,5:1; borda de campo e ícone pedem 3:1. Todos os pares passam nos dois modos. Os valores mais justos estão abaixo.

| Par | Claro | Escuro |
|---|---|---|
| texto `slate-900` / superfície | 16,9 | 14,6 |
| texto apagado `slate-500` / superfície | 4,98 | 5,20 |
| rótulo `slate-600` / superfície | 5,51 | 7,51 |
| link `teal-700` / superfície | 5,49 | 6,82 |
| botão Emphasized (branco / `#0070f2`) | **4,57** | 4,57 |
| badge `amber-700` / `amber-50` | 6,14 | 11,0 |
| badge `rose-600` / `rose-50` | 6,67 | 6,03 |
| botão Reject `rose-600` / `rose-100` | 5,84 | 5,41 |
| borda inferior do campo / superfície (3:1) | 5,52 | 7,51 |
| ícone não interativo `slate-400` (3:1) | 3,47 | 3,50 |

O passo `slate-500` claro foi escurecido de `#758ca4` (token de ícone, só 3,4:1) para `#5b728a`, porque as páginas usam esse passo em texto pequeno.

## 4. Tipografia

| Uso | Valor | Origem |
|---|---|---|
| Corpo, células, campos, botões | 0.875rem (14 px), linha 1.5 | `sapFontSize`, `sapContent_LineHeight` |
| Pequeno (dica, nota, badge) | 0.75rem | `sapFontSmallSize` |
| Grande / título de cartão (`text-base`) | 1rem | `sapFontLargeSize`, `sapGroup_Title_FontSize` |
| Título de página (`PageHeader`, `text-2xl` negrito) | 1.5rem | `sapObjectHeader_Title_FontSize` (o tamanho recolhido seria 1.25rem) |
| Rótulo de campo / `Dl` | 0.875rem, cor `slate-600` | `sapContent_LabelColor` |
| Cabeçalho de tabela | 0.875rem semibold, `slate-700`, **sem caixa alta** | Fiori não usa caixa alta; o peso é **assumido** |
| Valor de KPI | 1.25rem negrito | assumido; o Fiori deixa livre ("custom display sizes") |

O globals.css tem um ajuste de compatibilidade: as páginas que ainda usam `text-[13px]` passam a 14 px, e as que usam `text-[11px]` passam a 12 px. Código novo deve usar `text-sm` e `text-xs`.

## 5. Espaçamento, densidade, raios e sombras

**Recuo do conteúdo** (`.conteudo` no globals.css): 1rem abaixo de 600 px, 2rem de 600 a 1439 px e 3rem a partir de 1440 px. Origem: `sapContent_Padding_M/L = 2rem` e `sapContent_Padding_XL = 3rem`. O token S vale 0; usamos 1rem porque nossos componentes não trazem recuo próprio. Não há letterboxing: o conteúdo usa a largura toda, que é o recomendado na página Dynamic Page para apps de negócio.

**Grade:** múltiplos de 0.25rem. Espaços usuais: 0.5rem entre controles e 1rem entre blocos.

**Densidade, escolha documentada:**
- Tabelas em **compact**: linha de 2rem (`sapElement_Compact_LineHeight`). Esse é o padrão de ERP de mesa.
- Botões e campos em **cozy**: 2.25rem (`sapElement_Height`), porque com fonte de 14 px o controle compacto de 1.625rem fica apertado.
- Botão `small`, usado dentro das linhas da tabela: 1.625rem (`sapElement_Compact_Height`).
- O modo cozy da tabela (2.75rem, `sapElement_LineHeight`) não está implementado. Para ligá-lo basta trocar `[&>tr]:h-8` por `h-11` em `Table`.

**Raios:**

| Elemento | Raio | Origem |
|---|---|---|
| Campo (`rounded-sm`) | 0.25rem | `sapField_BorderCornerRadius` |
| Botão, menu, faixa de mensagem, `rounded` padrão | 0.5rem | `sapButton_BorderCornerRadius`, `sapPopover_BorderCornerRadius` |
| Cartão, tabela, KPI (`rounded-xl`) | 0.75rem | `sapGroup_BorderCornerRadius`, `sapElement_BorderCornerRadius` |
| Cartão do painel (`rounded-2xl`, opcional) | 1rem | `sapTile_BorderCornerRadius` |

**Sombras:**

| Variável | Uso | Origem |
|---|---|---|
| `--shadow-card` (`shadow-sm`) | cartões | `sapContent_Shadow0` |
| `--shadow-raised` (`shadow-lg`) | elementos elevados | `sapContent_Shadow1` |
| `--shadow-overlay` (`shadow-xl`) | menus, toast, diálogos | `sapContent_Shadow2` |
| `--shadow-header` | cabeçalho de página e barra superior | `sapContent_HeaderShadow` |

## 6. Barra superior (Shell Bar)

- Faixa 1 com 2.75rem de altura, fundo `--shell` (branco no claro) e sombra de cabeçalho. Da esquerda para a direita: **marca** (logo e nome, que o Fiori exige na shell bar), **busca** em formato pílula (Ctrl+K), ajuda, pendências (sino) e **avatar** redondo.
- Faixa 2: abas dos módulos, só texto. A aba ativa fica em azul `teal-700`, semibold, com sublinhado de 0.1875rem arredondado em cima.
- Faixa 3: abas das telas do módulo, separadas por grupo, com rótulo do grupo em `text-xs`.
- A diretriz da Shell Bar lista componentes, mas não informa altura. Adotamos 2.75rem (= `sapElement_LineHeight`), como pedia o briefing. **Não confirmado:** o Horizon real pode usar uma barra mais alta, perto de 3.25rem.

## 7. Floorplans mapeados para as nossas telas

### List Report = telas de lista
Exemplos: `/financeiro/receber`, `/cadastros/produtos`, `/gestao/giro`.
1. **Cabeçalho (`PageHeader`)**: faixa branca de borda a borda, com migalha (o módulo), título de 1.5rem, subtítulo e ações globais à direita (ex.: "Novo título").
2. **Indicadores (`KpiGrid`)** e **barra de filtros (`FilterBar`/`Filtros`)**. Se vierem logo abaixo do cabeçalho, entram na mesma faixa. A barra de filtros é **recolhível** ("Mostrar filtros" / "Ocultar filtros"), abre expandida e tem o botão "Filtrar" como Emphasized. O Fiori chama isso de modo de atualização manual, com botão "Go".
3. **Área de conteúdo (`Table`)**: barra da tabela com o título e a contagem no formato "Títulos (12)" à esquerda e ações à direita. O cabeçalho das colunas é branco, com linha mais forte embaixo e sem caixa alta. As linhas são compactas, com hover cinza.
4. **Lista vazia (`EmptyState`)**: diz por que está vazia e o que fazer, como pede o "no data" do Fiori.
- Ainda **não implementado**: o resumo "Filtrado por (n): …" com a barra recolhida, variantes, cabeçalho de coluna fixo (o contêiner tem rolagem horizontal) e o rodapé de ações finais.

### Object Page = telas de detalhe
Exemplos: `/financeiro/receber/[id]`, `/comercial/cirurgias/[id]`.
- **Cabeçalho**: migalha, título (o identificador do objeto), subtítulo, ações globais e status (`StatusBadge`, nas ações à direita). Os indicadores (`KpiGrid`) logo abaixo fazem o papel das facetas de cabeçalho chave-valor.
- **Seções**: um `Card` por seção, com título de 1rem, `Dl` para pares rótulo-valor (a faceta "form") e `Table` para itens.
- Ainda **não implementado**: a barra de âncoras/abas fixa entre o cabeçalho e as seções. Ela exige mudar `page.tsx`, o que está fora deste escopo. Quando for feita, deve ser um componente `<Secoes>` com âncoras para os `id` das seções.

### Overview Page = Painel (`/`)
- Cabeçalho só com texto (variante 3 do OVP), indicadores na faixa e conteúdo em **cartões** (`Card`) num grid. Cartões com raio de 0.75rem e sombra Shadow0. Só cartões, nunca blocos de atalho ("tiles").

## 8. Componentes

| Fiori | Nosso | Regra |
|---|---|---|
| Button **Emphasized** | `btn.primary` (`bg-primary`, texto branco, negrito) | **uma** ação principal por tela |
| Button **Default** | `btn.secondary` (fundo branco, borda `slate-300`, texto azul) | ações secundárias no cabeçalho e no rodapé |
| Button **Transparent** | `btn.ghost` (texto azul; fundo `slate-100` no hover) | caminho negativo (Cancelar, Limpar) e ações nas barras de tabela |
| Button **Reject** | `btn.danger` (fundo `rose-100`, borda `rose-200`, texto `rose-600`) | ações destrutivas (excluir, estornar, cancelar) |
| Button compacto | `btn.small` (1.625rem) | ação dentro da linha da tabela |
| Input / Select / TextArea | `campo` em `ui.tsx` (usado por `form.tsx` e `filtros.tsx`) | borda clara com linha inferior `--field-border`, raio 0.25rem, hover azul, foco de 2 px em `--focus`; inválido com borda `rose-500` e fundo `rose-50` |
| Label | rótulo do `Wrap` / `Dl` | 0.875rem `slate-600`; obrigatório com `*` em `rose-600` |
| **ObjectStatus** | `Badge` / `StatusBadge` | texto na cor semântica sobre o fundo claro da mesma semântica, contorno interno de 20% (como `sapContent_*_Shadow`), 1.25rem de altura, **sem ponto** |
| **MessageStrip** | faixas de erro/aviso do `Form` e banners das páginas | fundo `*-50`, borda `*-200`, texto `*-700`/`*-800`, ícone à esquerda e raio 0.5rem; tipos Information, Warning, Error e Success |
| **MessageToast** | `toast()` | **centralizado no rodapé**; só para sucesso curto e sem "com sucesso" no texto; ≥ 3 s (usamos 4 s). Erro não vai em toast: vai em MessageStrip ou no campo |
| Dynamic Page Header | `PageHeader` (+ `KpiGrid`, `FilterBar`) | ver seção 7 |
| Card | `Card` | título de 1rem, ícone opcional sem caixinha colorida |

Semântica de cor dos status (`StatusBadge`): `green` = Positive (concluído, pago, liberado), `yellow` = Critical (pendente, aberto, quarentena), `red` = Negative (vencido, recusado, não conforme), `blue` = Information (enviado, em andamento), `gray` = Neutral (cancelado, rascunho), `teal` e `purple` = categorias (cores de destaque 6 e 9).

## 9. Regras de uso

1. Páginas usam só as escalas nomeadas (`teal`, `slate`, `emerald`, `rose`, `amber`, `sky`, `violet`, `white`). Nunca hex e nunca `text-[13px]`; use `text-sm`/`text-xs`.
2. Uma ação Emphasized por tela. As demais usam Default ou Transparent.
3. Número em célula vai com `text-right` (o cabeçalho da coluna se alinha sozinho).
4. Status sempre por `StatusBadge`/`Badge`. Não crie bolinhas nem cores soltas.
5. Sucesso vai em `toast`. Erro e aviso vão em faixa (MessageStrip) ou no campo.
6. Ao criar componente novo, use os tokens (`bg-primary`, `border-b-field`, `outline-focus`, `--shadow-*`) e confira o contraste nos dois modos.
7. Para trocar de tema, altere só os blocos `--c-*` do `globals.css` (claro, escuro e impressão) e atualize este documento.

## 10. Não confirmado nas fontes (valor assumido)

- **Altura da Shell Bar:** sem token nem medida na diretriz. Assumido 2.75rem.
- **Peso e cor do cabeçalho de tabela:** os tokens só dão `sapList_HeaderTextColor = #131e29`. Assumido semibold `slate-700`.
- **Visual do ObjectStatus "inverted" e da MessageToast no Horizon:** as páginas não abriram. Assumidos fundo claro semântico (badge) e cartão branco com Shadow2 (toast).
- **Recuo no tamanho S:** o token dá 0. Usamos 1rem.
- **Passos D da paleta:** interpolados por nós, sem token correspondente.
