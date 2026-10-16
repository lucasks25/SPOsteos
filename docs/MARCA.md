# Marca SP OSTEOS

Hoje o sistema mostra o nome "SP OSTEOS" em texto com o monograma "SPO" num quadrado da cor de marca. Quando o logotipo chegar, basta colocar os arquivos abaixo; nenhum código muda.

## Onde colocar o logotipo

| Arquivo | Uso | Tamanho sugerido |
|---|---|---|
| `public/marca/logo.svg` (ou `logo.png`) | fundo claro: barra superior, impressos | SVG de preferência; PNG com pelo menos 600 px de largura, fundo transparente, proporção horizontal (altura útil de 48 px nos impressos, 24 px na barra, 40 px no login) |
| `public/marca/logo-escuro.svg` (ou `logo-escuro.png`) | tema escuro, faixa escura do login | mesmo tamanho; versão em cores claras/branca |

Sem `logo-escuro`, o `logo` é usado em todos os temas. Só `logo-escuro` (sem `logo`) também funciona. SVG tem prioridade sobre PNG.

A detecção (`fs.existsSync`) é feita no servidor em `src/components/marca.tsx` e fica em cache por processo: em produção, refaça o build/reinicie depois de colocar os arquivos; em desenvolvimento vale na hora.

## Componentes

- `<Marca variante="topo" | "login" | "impresso" sobreEscuro? />` (`src/components/marca.tsx`, Server Component). A barra superior recebe a marca por prop (`marca` do `AppShell`, montada em `src/app/(app)/layout.tsx`), porque o shell é Client Component.
- `<CabecalhoImpresso />`: marca + dados cadastrais da empresa. Usado em: vale de remessa, boleto, orçamento impresso, comunicado e relatório de recolhimento, folha de inventário.

## Dados cadastrais da empresa

Um lugar só: `src/lib/empresa.ts`, lido das variáveis de ambiente (ver `.env.example`):

| Variável | Padrão |
|---|---|
| `EMPRESA_NOME` | `SP OSTEOS` |
| `EMPRESA_RAZAO_SOCIAL` | vazio |
| `EMPRESA_CNPJ` | vazio |
| `EMPRESA_ENDERECO` | vazio |
| `EMPRESA_CIDADE` | `São Caetano do Sul - SP` |
| `EMPRESA_TELEFONE` | vazio |
| `EMPRESA_EMAIL` | vazio |

Campo vazio não aparece no impresso. Nenhum CNPJ é inventado: preencha o `.env` com os dados reais.
