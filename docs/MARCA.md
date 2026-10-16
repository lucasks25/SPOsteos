# Marca SP OSTEOS

Logotipos oficiais instalados em 16/10/2026 a partir do site público sp-osteos.com.br: `public/marca/logo.png` (colorido, fundo claro), `logo-escuro.png` (branco, menu lateral e tema escuro), `isotipo.png` (símbolo roxo/azul, marca d'água do login) e `src/app/icon.png` (favicon). As cores da marca são roxo (#4b2a85) e azul (#1b7fc4) com texto azul-marinho; a paleta do sistema já foi alinhada a elas (commit b18ab55, tokens em `docs/DESIGN-SYSTEM.md`). Se faltar algum arquivo, o sistema volta ao monograma "SPO" em texto.

## Onde colocar o logotipo

| Arquivo | Uso | Tamanho sugerido |
|---|---|---|
| `public/marca/logo.svg` (ou `logo.png`) | fundo claro: barra superior, impressos | SVG de preferência; PNG com pelo menos 600 px de largura, fundo transparente, proporção horizontal (altura útil de 48 px nos impressos, 24 px na barra, 40 px no login) |
| `public/marca/logo-escuro.svg` (ou `logo-escuro.png`) | tema escuro, faixa escura do login | mesmo tamanho; versão em cores claras/branca |

Sem `logo-escuro`, o `logo` é usado em todos os temas. Só `logo-escuro` (sem `logo`) também funciona. SVG tem prioridade sobre PNG.

As rotas `/marca/*` e `/icon.png` ficam fora da verificação de sessão do `src/proxy.ts`, para o login carregar a logo.

A detecção (`fs.existsSync`) é feita no servidor em `src/components/marca.tsx` e fica em cache por processo: em produção, refaça o build/reinicie depois de colocar os arquivos; em desenvolvimento vale na hora.

## Componentes

- `<Marca variante="topo" | "login" | "impresso" sobreEscuro? />` (`src/components/marca.tsx`, Server Component). A barra superior recebe a marca por prop (`marca` do `AppShell`, montada em `src/app/(app)/layout.tsx`), porque o shell é Client Component.
- `<CabecalhoImpresso />`: marca + dados cadastrais da empresa. Usado em: vale de remessa, boleto, orçamento impresso, comunicado e relatório de recolhimento, folha de inventário.

## Dados cadastrais da empresa

Um lugar só: `src/lib/empresa.ts`, lido das variáveis de ambiente (ver `.env.example`). Os padrões são os dados públicos do CNPJ na Receita Federal (consulta de 16/10/2026; fontes em `docs/ALINHAMENTO-SPOSTEOS.md` §1), isto é, o endereço fiscal que a NF-e tem de levar:

| Variável | Padrão |
|---|---|
| `EMPRESA_NOME` | `SP OSTEOS` (nome fantasia) |
| `EMPRESA_RAZAO_SOCIAL` | `SP OSTEOS Distribuidora de Produtos para a Saúde Ltda` |
| `EMPRESA_CNPJ` | `19.966.249/0001-84` |
| `EMPRESA_ENDERECO` | `Rua Alegre, 470, sala 1001 - Santa Paula` |
| `EMPRESA_CEP` | `09550-250` |
| `EMPRESA_CIDADE` | `São Caetano do Sul - SP` |
| `EMPRESA_TELEFONE` | vazio (o público no site é (11) 2311-0730, já no `.env.example`) |
| `EMPRESA_EMAIL` | vazio (o público no site é comercial@sp-osteos.com.br, já no `.env.example`) |

Variável vazia usa o padrão; telefone e e-mail vazios não aparecem no impresso. O site institucional mostra "10º andar, Barcelona" e o LinkedIn "CJ 1301"; nos documentos vale o cadastro da Receita (sala 1001, bairro Santa Paula). Confirme com o financeiro/contabilidade antes de emitir NF-e.
