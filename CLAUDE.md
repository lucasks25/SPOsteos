@AGENTS.md

# Projeto: Sistema de Gestão OPME

Antes de qualquer tarefa, leia **docs/HANDOFF.md**: objetivo, como rodar, arquitetura, convenções obrigatórias (requireUser, movimentar(), parseForm, audit), status e especificação de cada módulo.

## Roteamento de modelos (economia)

A conversa principal roda em **Sonnet** e coordena. Delegue pelo agente certo (`.claude/agents/`), passando no prompt o contexto necessário:

| Dificuldade | Agente | Modelo | Exemplos |
|---|---|---|---|
| Fácil / mecânica | `rapido` | Haiku | achar onde está algo, ler e resumir arquivo, rodar tsc/lint/test/build e resumir, consulta simples ao banco, renomear, texto/rótulo, atualizar trecho de doc |
| Média | `executor` | Sonnet | tela/CRUD no padrão existente, testes, bug com causa conhecida, ligar tela a lógica pronta |
| Difícil | `arquiteto` | Opus | modelo de dados e migrations, regras financeiras, CNAB/SISPAG/cobrança, fiscal/ANVISA, segurança, revisão antes de commit, bug sem causa conhecida |

Regras:
- Tarefa fácil feita direto na conversa principal só se for de 1 passo (uma leitura, um comando); acima disso, `rapido`.
- Na dúvida entre dois níveis, escolha o mais barato e suba se ele devolver "Precisa do arquiteto".
- Os agentes do ruflo (`~/.claude/agents/`) não definem modelo e herdam o da conversa; prefira os três acima neste projeto.
- Painel dos agentes: comando `/agentes` (mod `painel-agentes`), mostra cada agente, seu modelo e quantas vezes rodou na sessão.
