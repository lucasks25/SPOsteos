@AGENTS.md

# Projeto: Sistema de Gestão OPME

Antes de qualquer tarefa, leia **docs/HANDOFF.md**: objetivo, como rodar, arquitetura, convenções obrigatórias (requireUser, movimentar(), parseForm, audit), status e especificação de cada módulo.

---

## Roteamento de modelos + effort (economia e qualidade)

A conversa principal roda em **Sonnet** e coordena. Delegue pelo agente certo (`.claude/agents/`), passando no prompt o contexto necessário.

### Tabela de roteamento: Modelo × Effort × Dificuldade

| Dificuldade | Agente | Modelo | Effort recomendado | Faixa permitida | Quando usar |
|---|---|---|---|---|---|
| **Fácil** / mecânica | `rapido` | **Haiku** | `low` | `low` – `medium` | Tarefas de 1-3 passos, sem decisão |
| **Média** | `executor` | **Sonnet** | `medium` | `low` – `high` | Implementação seguindo padrão existente |
| **Difícil** | `arquiteto` | **Opus** | `high` | `medium` – `high` | Arquitetura, regras complexas, investigação |

> **O effort é escolhido pelo modelo**, não fixo. A tabela acima é o ponto de partida; avalie cada tarefa individualmente e ajuste dentro da faixa permitida.

---

### Detalhamento por nível

#### 🟢 Fácil → Haiku | effort padrão `low`, faixa `low`–`medium`

Tarefas mecânicas, repetitivas, sem ambiguidade. Normalmente o modelo vai direto ao ponto.

**Exemplos:**
- Achar onde está algo no código (`grep`, busca de arquivo)
- Ler e resumir um arquivo ou trecho
- Rodar `tsc --noEmit`, `npm test`, `npm run build` e resumir resultado
- Consulta simples ao banco (SELECT direto)
- Renomear variável, componente ou arquivo
- Ajustar texto, rótulo, placeholder
- Atualizar trecho de doc/README
- Corrigir erro de lint/tipo já diagnosticado
- Copiar padrão de um arquivo para outro idêntico

**Quando subir para `medium`:** a tarefa parece fácil mas envolve escolher _qual_ de vários arquivos editar, ou o rename tem efeito cascata em muitos imports.

#### 🟡 Média → Sonnet | effort padrão `medium`, faixa `low`–`high`

Tarefas que seguem um padrão existente mas exigem entender contexto e conectar peças.

**Exemplos:**
- Criar tela/CRUD seguindo padrão de módulo já existente
- Escrever testes unitários ou de integração
- Corrigir bug com causa conhecida (stack trace aponta o local)
- Ligar tela a Server Action ou lógica em `_lib/` já pronta
- Implementar filtro, paginação ou ordenação numa listagem
- Adicionar campo a formulário + validação + migration simples
- Ajustar layout/responsividade de componente existente
- Refatorar código sem mudar comportamento (extract function, mover arquivo)

**Quando descer para `low`:** o CRUD é cópia quase 1:1 de outro módulo, só trocando nomes.
**Quando subir para `high`:** o bug tem causa conhecida mas a correção toca muitos arquivos, ou a tela precisa de lógica condicional complexa (permissões, estados).

#### 🔴 Difícil → Opus | effort padrão `high`, faixa `medium`–`high`

Tarefas que exigem raciocínio profundo, análise de trade-offs, ou lidam com domínio complexo.

**Exemplos:**
- Modelagem de dados e migrations com relacionamentos complexos
- Regras financeiras (baixas, conciliação, fluxo de caixa, DRE)
- Integração bancária (CNAB 240, SISPAG, cobrança, leitura de manuais Itaú)
- Regras fiscais/regulatórias (ANVISA, NF-e)
- Revisão de segurança (autenticação, autorização, injeção, CSRF)
- Revisão de código antes de commit importante
- Bug sem causa conhecida — investigação exploratória
- Decisões de arquitetura (novo módulo, novo padrão, refactor estrutural)
- Otimização de performance com profiling
- Desenho de fluxo multi-etapa (workflow de aprovação, estado de pedido)

**Quando descer para `medium`:** revisão de código simples (poucas linhas, padrão claro), ou migration que adiciona 1-2 colunas sem lógica nova.

---

### Regras de planos e effort

Ao criar um **plano de execução**, avalie cada etapa e escolha o effort adequado:

```
Plano: Implementar módulo de devoluções
─────────────────────────────────────────
1. [FÁCIL  | Haiku  | low]    Ler HANDOFF.md e módulo similar (empréstimos)
2. [DIFÍCIL| Opus   | high]   Desenhar modelo de dados e regras de negócio
3. [MÉDIA  | Sonnet | low]    Criar migration e seed (cópia do padrão existente)
4. [MÉDIA  | Sonnet | medium] Implementar Server Actions (CRUD)
5. [MÉDIA  | Sonnet | high]   Criar telas com lógica condicional de permissões
6. [FÁCIL  | Haiku  | low]    Rodar tsc + testes e reportar
7. [DIFÍCIL| Opus   | medium] Revisar código (poucas linhas, padrão claro)
```

> Note como etapas 3, 5 e 7 usam effort **diferente do padrão** da sua dificuldade — o modelo avaliou o contexto real de cada uma.

**Regras do plano:**
- Cada etapa DEVE ter `[DIFICULDADE | Modelo | effort]` explícito.
- O effort padrão segue a tabela, mas **o modelo pode ajustar dentro da faixa permitida** com base no contexto real da tarefa.
- Justifique brevemente quando o effort escolhido diferir do padrão (ex: `low` porque é cópia 1:1).
- Se uma etapa falhar ou revelar complexidade inesperada, **reclassifique** a dificuldade e o effort antes de prosseguir.
- O plano é um documento vivo: atualize-o conforme descobre informações novas.

---

### Regras gerais de roteamento

- Tarefa fácil feita direto na conversa principal só se for de **1 passo** (uma leitura, um comando); acima disso, delegate para `rapido`.
- Na dúvida entre dois níveis, **escolha o mais barato** e suba se ele devolver "Precisa do arquiteto".
- Os agentes do ruflo (`~/.claude/agents/`) não definem modelo e herdam o da conversa; prefira os três acima neste projeto.
- Painel dos agentes: comando `/agentes` (mod `painel-agentes`), mostra cada agente, seu modelo e quantas vezes rodou na sessão.
- **Nunca gaste Opus em tarefa que Sonnet resolve.** O custo de Opus é ~5x Sonnet e ~25x Haiku.
- **Respeite as faixas de effort.** Haiku não deve receber `high` (não tem capacidade). Opus pode receber `medium` quando a tarefa é difícil mas direta.
- **Ao escolher effort, pergunte-se:** "Quantas alternativas preciso avaliar? Quantos arquivos preciso cruzar? Tem ambiguidade?" — quanto mais, maior o effort.
