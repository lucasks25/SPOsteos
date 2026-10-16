# LGPD — proteção de dados no Sistema OPME (SP OSTEOS)

Documento para o dono da empresa e para quem for nomeado encarregado (DPO). Diz quais dados o sistema guarda, por que, por quanto tempo, quem vê, o que já está protegido no código e **o que fazer se houver vazamento**.

> **Aviso.** Este texto foi escrito pela equipe técnica. As citações de lei marcadas com **[confirmar]** precisam ser revisadas por advogado ou consultoria em proteção de dados antes de virar política oficial. As citações sem marca foram conferidas no texto da Lei 13.709/2018 (LGPD).

---

## 1. O que fazer agora (lista do dono)

1. **Nomear o encarregado** (pessoa ou empresa) e publicar nome e contato no site (art. 41). Ver §11.
2. **Gerar a `DATA_KEY`** de produção (`openssl rand -hex 32`), guardar uma cópia **fora do servidor** (cofre de senhas da empresa, com duas pessoas que saibam acessar) e só então rodar `scripts/lgpd-cifrar.ts --aplicar` (§4). **Perder essa chave = perder as carteirinhas cifradas.**
3. **Banco de produção** com o papel de menor privilégio (`scripts/db-papel-app.sql`), TLS (`sslmode=require`) e backup cifrado (§9 e `docs/PRODUCAO-SEGURA.md`).
4. **Agendar** a rotina mensal de retenção: `scripts/lgpd-retencao.ts --aplicar` (§7).
5. **Imprimir o runbook de incidente** (§10) e deixar com quem atende o suporte. **Prazo para avisar a ANPD e os pacientes: 3 dias úteis.**
6. Fazer o **RIPD** (Relatório de Impacto, §12) com o encarregado. É obrigatório na prática para quem trata dado de saúde em escala.
7. Revisar contratos com hospitais e convênios (papéis de controlador e operador) e com o provedor de hospedagem (operador, art. 39) **[confirmar]**.

---

## 2. Inventário de dados pessoais

Legenda da base legal (art. 7º para dado comum, art. 11 para dado sensível): **OL** = obrigação legal ou regulatória (7º II / 11 II "a"); **EC** = execução de contrato (7º V); **ED** = exercício regular de direitos em contrato ou processo (7º VI / 11 II "d"); **LI** = legítimo interesse (7º IX); **CR** = proteção do crédito (7º X).

| Modelo.campo | Titular | Categoria | Sensível? | Base legal | Finalidade | Retenção | Quem acessa (perfil) |
|---|---|---|---|---|---|---|---|
| `Cirurgia.paciente` | paciente | nome | **Sim**: ligado a cirurgia e implante = dado de saúde (art. 5º II) | OL (rastreabilidade sanitária) + ED (cobrança do convênio/hospital) **[confirmar]** | agendar, faturar, rastrear lote até o paciente, recall | enquanto durar a obrigação de rastreabilidade (§7) | COMERCIAL, FINANCEIRO, ESTOQUE (detalhe); listas mascaradas; QUALIDADE/ESTOQUE na rastreabilidade; QUALIDADE no recall; ADMIN |
| `Cirurgia.carteirinha` (**cifrada**) + `carteirinhaHash` | paciente | identificador no convênio | **Sim** | ED (autorização e cobrança do convênio) | guia/autorização e faturamento | igual à cirurgia (avaliar descarte após o recebimento: §7) | COMERCIAL, FINANCEIRO, ESTOQUE (detalhe), ADMIN |
| `Cirurgia.sus`, `procedimento`, `observacao`, `medico`, `hospital`, `convenio` | paciente | contexto clínico | **Sim** (procedimento) | igual ao nome | igual ao nome | igual | igual |
| `CirurgiaConsumo` (lote × cirurgia) | paciente | implante recebido | **Sim** | OL | rastreabilidade lote → paciente; recall | igual | COMERCIAL, ESTOQUE, QUALIDADE |
| `Anexo` (arquivos em `storage/uploads/cirurgias/`) | paciente | guias, laudos, pedidos médicos | **Sim** | ED / OL | prova de autorização e uso | igual à cirurgia | COMERCIAL, FINANCEIRO, ESTOQUE (download auditado) |
| `AutorizacaoConvenio` (guia, senha) | paciente | autorização do convênio | **Sim** | ED | autorização prévia, glosa | igual | COMERCIAL, FINANCEIRO |
| `RecolhimentoPaciente` | paciente | uso do lote recolhido | **Sim** | OL (tecnovigilância/ação de campo) **[confirmar a norma]** | comunicar hospital/paciente no recall | igual ao recolhimento | **só QUALIDADE e ADMIN** |
| `Orcamento.paciente` | paciente | nome | **Sim** | EC (proposta comercial) | orçar o material | aprovado: igual à venda; **não aprovado: 6 meses e anonimiza** (§7) | COMERCIAL, FINANCEIRO |
| `Movimento.observacao` | paciente | nome (só registros antigos) | Sim | — | — | **não grava mais o nome**; o script de retenção limpa os antigos | ESTOQUE, COMERCIAL, QUALIDADE |
| `Medico` (nome, CRM, e-mail, telefone) | médico | profissional | Não | EC / LI | agenda, comissões, rastreabilidade | enquanto ativo + prazo fiscal | todos os perfis operacionais |
| `Representante` (nome, comissão) | representante | profissional/financeiro | Não | EC | comissões | contrato + 5 anos fiscal **[confirmar]** | COMERCIAL, FINANCEIRO |
| `Usuario` (nome, e-mail, hash da senha, MFA) | funcionário | conta de acesso | Não | EC (relação de trabalho) / LI (segurança) | autenticação | enquanto ativo; desativar em vez de apagar (log) | ADMIN |
| `LogAuditoria` | funcionário (e ids de pacientes) | registro de atividade | Não (não guarda nome do paciente) | OL (art. 37: registro das operações) + LI (segurança) | prova de quem fez/viu o quê | **5 anos** (§7) | ADMIN |
| `TentativaLogin` | quem tenta entrar | e-mail/IP | Não | LI (segurança) | limitar força bruta | 15 min (apaga sozinho) | ninguém (técnico) |
| `FormularioEnviado` | funcionário | token | Não | LI | evitar envio duplicado | 7 dias (apaga sozinho) | ninguém |
| `Fornecedor` banco/agência/conta/Pix, `RemessaPagamento.conteudo` | fornecedor (PJ; pode ser MEI = pessoa física) | dado bancário | Não (mas financeiro) | EC | pagar | contrato + 5 anos fiscal **[confirmar]** | **só FINANCEIRO e ADMIN** (alteração com dupla aprovação) |
| `Hospital`, `Convenio`, `Fabricante` (CNPJ, contatos) | PJ (contato é pessoa) | cadastro | Não | EC | operação | enquanto houver relação + prazo fiscal | todos |

**Não guardamos** CPF, data de nascimento, endereço nem telefone do paciente. É uma escolha de minimização: ninguém deve acrescentar esses campos sem passar pelo encarregado.

---

## 3. Minimização na tela (implementado)

- **Listas, busca global e seletores** mostram o paciente reduzido: "Maria da Silva Santos" vira **"Maria S."** (`src/lib/privacidade.ts`, `mascararNome`). A busca continua usando o nome completo: quem digita "Maria Silva" acha a cirurgia, mas a lista mostra "Maria S.".
  Telas: Cirurgias (lista), Orçamentos (lista), Vales e remessas (lista e "aguardando vale"), Nova remessa (seletor), busca global (Ctrl K).
- **Nome completo** aparece só no detalhe da cirurgia e na edição, no detalhe do orçamento, no detalhe/vale impresso da remessa (o hospital confere o material pelo nome), na rastreabilidade e no recolhimento. Todas essas telas têm a leitura auditada (§5).
- **Carteirinha** só aparece no detalhe e na edição da cirurgia. Existe `mascararCarteirinha` ("•••• 2345") para qualquer tela nova que precise mostrá-la.
- O comunicado de recolhimento ao hospital **não leva o nome do paciente**: o hospital identifica pelo número e pela data da cirurgia.
- O kardex **não grava mais** "Consumo direto — paciente Fulano". Agora grava "Consumo direto na cirurgia CIR-n".

---

## 4. Criptografia em repouso (decisão)

**Decisão: as duas camadas, com escopo diferente por campo.**

| Camada | O quê | Situação |
|---|---|---|
| (a) Cifra na aplicação, AES-256-GCM | `Cirurgia.carteirinha` | **Implementado** (`src/lib/cripto.ts`) |
| (b) Disco/volume cifrado + backup cifrado + controle de acesso | todo o banco, inclusive `paciente` | checklist de produção (`docs/PRODUCAO-SEGURA.md`, do agente infra) |
| (a) para `paciente` | nome do paciente | **Desenhado, não ligado (P1, ver abaixo)** |

**Por que a carteirinha foi cifrada já.** Ninguém busca carteirinha por trecho, ela aparece em só duas telas e é o identificador mais "vendável" (fraude no convênio). Cifrar não quebra nenhuma função. A busca por carteirinha no atendimento ao titular usa o **índice cego** `carteirinhaHash`, um HMAC do valor normalizado que acha por igualdade sem guardar o número em claro.

**Por que o nome do paciente ainda NÃO foi cifrado na aplicação:**
1. A busca por nome é **por trecho** ("contém") em três telas (cirurgias, remessas, busca global). Com cifra só sobra busca por igualdade (nome completo exato ou palavra inteira via HMAC por palavra). É uma piora de uso que **o cliente precisa aceitar**.
2. Os testes e rotinas de limpeza procuram cirurgias pelo prefixo do nome. Mudar exige revisar todos os testes de banco, e há vários agentes trabalhando ao mesmo tempo.
3. **Risco de perder a chave**: o nome é o elo da rastreabilidade sanitária. Antes de cifrá-lo, a empresa precisa provar que guarda a `DATA_KEY` com segurança (passo 2 do §1).
4. Na hospedagem prevista (um servidor), a `DATA_KEY` fica no mesmo ambiente do app. A cifra na aplicação protege contra **vazamento de backup/dump e acesso direto ao banco**, e isso a camada (b) também cobre se o backup for cifrado.

**Desenho pronto para o P1 (nome do paciente), esforço de ~1,5 dia:**
- Colunas `pacienteCifrado` (texto cifrado, contexto `"Cirurgia.paciente"`) e `pacienteBusca String[]` (HMAC de cada palavra normalizada com 3 ou mais letras), com índice GIN.
- Busca: `pacienteBusca: { hasEvery: indicesPorPalavra(q) }`, que acha "maria silva" e "silva", mas não acha "silv".
- Gravação em `salvarCirurgiaTx`; leitura por `decifrarParaExibir` nas ~12 telas listadas no §3; `Orcamento.paciente` igual.
- Migração em 3 passos: criar colunas, rodar script que preenche, trocar leituras, e só então zerar a coluna antiga.
- Testes: os helpers de teste passam a marcar as cirurgias por `observacao` com prefixo, não pelo nome.

**Formato e rotação.** O valor gravado é `enc:v<versão>:<iv>:<tag>:<cifrado>`. Para trocar a chave: `DATA_KEY="v2:<nova>,v1:<antiga>"`, reiniciar, rodar `scripts/lgpd-cifrar.ts --aplicar`, conferir "Restantes: 0" e só então tirar a v1. A subida em produção é recusada sem `DATA_KEY` válida (`src/instrumentation.ts` + `src/lib/cripto-config.ts`). Fora de produção, sem chave, a carteirinha é gravada em claro com aviso, e o script cifra depois.

**Por que isso importa para multa:** art. 48 §3º. Na avaliação do incidente, a ANPD considera se os dados ficaram **ininteligíveis** para quem os obteve. Carteirinha cifrada vazada num dump não é carteirinha vazada.

---

## 5. Auditoria de leitura (implementado)

Antes só as alterações eram registradas. Agora `auditLeitura()` (`src/lib/forms.ts`) grava uma linha "visualizar" quando o dado sensível **sai do servidor**:

| Tela | Registro |
|---|---|
| Detalhe da cirurgia | `visualizar Cirurgia <id> CIR-n` |
| Edição da cirurgia | `visualizar Cirurgia <id> CIR-n (edição)` |
| Detalhe da remessa / vale impresso com paciente | `visualizar Cirurgia <id> CIR-n via REM-m` |
| Detalhe do orçamento com paciente | `visualizar Orcamento <id>` |
| Rastreabilidade (cada lote exibido com uso em cirurgia) | `visualizar Lote <id> rastreabilidade: k uso(s)` |
| Recolhimento, aba "Pacientes" | `visualizar Recolhimento <id> REC-n: k paciente(s)` |
| Relatório impresso do recolhimento | idem, "relatório" |
| Download de anexo da cirurgia | `baixar anexo Cirurgia <id>` (rota do agente acesso) |
| Scripts LGPD (titular, retenção, cifra, sessões) | linha com `[script <operador>]` |

- Listas não são auditadas (volume) e mostram o nome mascarado.
- Nenhuma exportação CSV contém paciente (conferido: financeiro e gestão).
- O registro é feito no servidor de propósito. Um registro feito no navegador seria pulado por quem baixa a página direto. O pré-carregamento de links do Next não renderiza estas páginas, porque existe `src/app/(app)/loading.tsx` (`node_modules/next/dist/docs/01-app/02-guides/prefetching.md`). Se um dia renderizar, a linha é marcada "(pré-carregamento)" em vez de sumir.
- O log **não guarda o nome nem a carteirinha**, só ids e números de documento.
- Como responder "quem viu a cirurgia CIR-123?": Administração > Auditoria, filtrar entidade Cirurgia, ou `scripts/lgpd-titular.ts --cirurgias=123` (seção "Registro de acessos").

---

## 6. Integridade do log de auditoria (implementado)

- Migration `20261016235000_lgpd_auditoria_imutavel`: trigger no Postgres que **recusa UPDATE, DELETE e TRUNCATE** em `"LogAuditoria"`. Vale também para um bug do código ou uma injeção de operador do Prisma (como o S1 da `docs/REVISAO.md` §19).
- `LogAuditoria.usuarioId` passou de `SET NULL` para **`RESTRICT`**: usuário com histórico não pode ser apagado (desative-o), e o log não perde o autor.
- **Exceção de manutenção**: só o **dono** da tabela, na própria transação, com `SELECT set_config('opme.manutencao_auditoria','on',true)`. Serve para o expurgo após o prazo (§7) e para a limpeza dos testes (`tests/negocio-db/_auditoria.ts`). O papel da aplicação (`opme_app`) não é dono e nem tem o privilégio, então a exceção não vale para ele (conferido no banco local).
- **Limite honesto**: quem é dono do banco pode remover a trigger. Contra isso valem o papel separado (§9), o backup diário guardado fora e o log do próprio Postgres.
- Teste: `tests/negocio-db/lgpd-auditoria.test.ts` (UPDATE, DELETE, deleteMany e TRUNCATE recusados; a exceção vale só na transação; FK Restrict).
- Pendência conhecida (`REVISAO.md` §19): `audit()` grava depois da transação e engole falha. Uma mutação pode ficar sem linha se o insert do log falhar.

---

## 7. Retenção e descarte

| Dado | Prazo | Como | Base |
|---|---|---|---|
| Cirurgia, consumo, lote, remessa, recolhimento (paciente × lote) | **não descartar** enquanto vigorar a obrigação de rastreabilidade. Proposta: **20 anos após a cirurgia** ou a vida útil declarada do implante, o que for maior | manual, por decisão do encarregado | art. 16 I (obrigação regulatória). Prazo **[confirmar com o RT e o jurídico]**: a Lei 13.787/2018 (20 anos) trata do prontuário do estabelecimento de saúde, não da distribuidora; usamos como referência prudente. O CDC art. 27 (5 anos contados do conhecimento do dano) favorece guardar enquanto o implante estiver no paciente |
| Carteirinha | proposta: apagar 5 anos após a cirurgia faturada e recebida | P2 (script, ainda não feito) | o propósito (cobrança) acaba; prazo fiscal **[confirmar]** |
| Anexos da cirurgia | igual à cirurgia | — | idem |
| Orçamento **não aprovado** (recusado, ou rascunho/enviado vencido) | **6 meses**, depois o nome do paciente é apagado (anonimização) | **implementado**: `scripts/lgpd-retencao.ts --aplicar`, mensal | art. 15 I e 16 (finalidade alcançada sem contrato) |
| Orçamento aprovado, pedido de venda, NF, títulos | 5 anos (fiscal) **[confirmar]** | — | art. 16 I |
| `LogAuditoria` | **5 anos**; o expurgo exige a exceção de manutenção do dono | manual | art. 37; Res. CD/ANPD 15/2024 pede guardar o registro de incidentes por no mínimo 5 anos **[confirmar artigo]** |
| `TentativaLogin` | 15 min | automático (`auth-login.ts`) | segurança |
| `FormularioEnviado` | 7 dias | automático (`idempotencia.ts`) | técnico |
| Remessa SISPAG (`conteudo`, dado bancário) | 5 anos (fiscal) | P2 | `REVISAO.md` 1.9 |
| Observação do kardex com nome do paciente (registros antigos) | imediato | **implementado** no mesmo script | minimização |
| Backups | 30 dias (padrão de `RETENCAO_DIAS`), cifrados com age | infra (`scripts/backup-db.sh`) | um dado apagado no banco some do backup ao fim da rotação |

Rodar `npx tsx scripts/lgpd-retencao.ts` mostra o que seria feito, sem alterar nada. Com `--aplicar`, faz e audita.

---

## 8. Direitos do titular (art. 18)

**Canal**: e-mail do encarregado publicado no site. **Prazo**: confirmação simplificada imediata; declaração completa em até **15 dias** (art. 19 II). Confirmar a identidade antes de qualquer resposta (documento com foto + dado da cirurgia).

**Gerar o relatório de tudo o que temos do paciente:**
```bash
OPERADOR="Nome de quem atende" npx tsx scripts/lgpd-titular.ts --nome="Maria da Silva" --saida=/tmp/titular.md
OPERADOR="..." npx tsx scripts/lgpd-titular.ts --carteirinha=0123456789
OPERADOR="..." npx tsx scripts/lgpd-titular.ts --nome="Maria" --parcial     # só para achar candidatos
OPERADOR="..." npx tsx scripts/lgpd-titular.ts --cirurgias=12,15            # depois de separar homônimos
```
O relatório traz cirurgias, material implantado com lote e registro ANVISA, autorizações, remessas, faturamento, anexos, recolhimentos, orçamentos, com quem compartilhamos e a resposta padrão. Traz também o **registro de acessos, que é de uso interno**: não envie ao titular sem avaliar. Cuidado com **homônimos**: o sistema não guarda CPF nem data de nascimento. Se o relatório avisar mais de uma pessoa, confirme pela data, pelo hospital e pelo médico e gere de novo com `--cirurgias`. O arquivo sai com permissão 600; entregue por canal seguro e apague depois. A geração é auditada, sem o nome.

| Pedido | Resposta |
|---|---|
| Confirmação / acesso (I, II) | relatório acima, sem a seção interna |
| Correção (III) | COMERCIAL corrige na edição da cirurgia/orçamento (auditado). Cirurgia faturada/cancelada não edita pela tela: o ADMIN corrige no banco com registro no log e anota o pedido |
| Anonimização / eliminação (IV, VI) | **cirurgia e rastreabilidade: negar com justificativa** (modelo abaixo); orçamento não aprovado: anonimizar já (rodar o script de retenção ou apagar o campo) |
| Portabilidade (V) | o relatório em Markdown/PDF atende **[confirmar se a regulamentação exige formato]** |
| Compartilhamento (VII) | seção "Com quem os dados foram compartilhados" do relatório |

**Modelo de resposta: retenção por obrigação legal.**
> Prezado(a) [nome], recebemos em [data] seu pedido de eliminação dos dados pessoais. Informamos que os dados que vinculam seu nome ao material implantado na cirurgia de [data] (produto, lote e registro na ANVISA) são mantidos para cumprimento de obrigação legal e regulatória de rastreabilidade sanitária de dispositivos médicos, inclusive para permitir que sejamos avisados e o(a) avisemos em caso de recolhimento do produto, conforme os arts. 7º, II, 11, II, "a", e 16, I, da Lei 13.709/2018. Por isso não podem ser eliminados enquanto durar essa obrigação. Eles estão protegidos por controle de acesso, registro de quem os consulta e cifra dos identificadores, e não são usados para nenhuma outra finalidade. Dados que não estão sujeitos a essa obrigação ([listar: ex. orçamento recusado]) foram eliminados/anonimizados em [data]. Você pode pedir a correção de qualquer dado incorreto. Encarregado: [nome, e-mail].

---

## 9. Banco de dados

- **Papel de menor privilégio** `opme_app` (`scripts/db-papel-app.sql`): SELECT/INSERT/UPDATE/DELETE nos dados; em `"LogAuditoria"` só SELECT e INSERT; sem DDL, sem TRUNCATE, sem acesso a `_prisma_migrations`; `statement_timeout` e `idle_in_transaction_session_timeout` de 60 s. Testado em transação desfeita no banco local: UPDATE/DELETE no log, CREATE TABLE, TRUNCATE e leitura de `_prisma_migrations` deram "permission denied"; INSERT no log, UPDATE em Hospital e `nextval` funcionaram.
- **Duas URLs**: a aplicação usa `opme_app`; `prisma migrate deploy` usa o dono numa URL que **não fica no servidor da aplicação**. Rodar o `.sql` depois de cada migration que criar tabela, ou contar com o `ALTER DEFAULT PRIVILEGES`, que cobre tabelas criadas pelo mesmo dono.
- **TLS**: `sslmode=require` na `DATABASE_URL` de produção. Com certificado próprio, `verify-full`. A subida recusa banco sem TLS (`src/lib/infra-config.ts`, do agente infra).
- Porta do Postgres **não exposta** à internet; backup diário cifrado e guardado fora (`scripts/backup-db.sh`, `scripts/restaurar-db.sh`, `docker-compose.prod.yml`, do agente infra; checklist em `docs/PRODUCAO-SEGURA.md`).
- `DATA_KEY` e `AUTH_SECRET` **não ficam no mesmo lugar do backup**. Quem tem o backup não pode ter a chave.

---

## 10. Runbook de incidente de segurança (art. 48 + Resolução CD/ANPD nº 15/2024)

**Incidente** = acesso não autorizado, vazamento, perda, alteração ou destruição de dado pessoal: notebook roubado com sessão aberta, senha de usuário vazada, backup exposto, banco acessado de fora, e-mail com relatório enviado à pessoa errada.

**Relógio**: o prazo é de **3 dias úteis** contados de quando a empresa **soube** que o incidente afetou dados pessoais, para comunicar a ANPD **e** os titulares, quando o incidente puder causar risco ou dano relevante. Dado de saúde está entre os critérios de risco relevante da resolução, então **conte que precisa comunicar** **[confirmar artigos da Res. 15/2024]**. Na ANPD, a infração mais punida é **não comunicar**. Na dúvida, comunique e complemente depois.

### Hora 0 — detectar e registrar
1. Quem percebeu avisa **na hora** o encarregado e o dono (telefone, não só e-mail).
2. Abrir o **registro do incidente** (planilha ou documento): data/hora em que soube, quem avisou, o que se sabe. Guardar por **no mínimo 5 anos**, mesmo que se conclua que não precisava comunicar.

### Horas 0–4 — conter
3. **Derrubar todas as sessões**: `OPERADOR="Nome" npx tsx scripts/derrubar-sessoes.ts --todos --motivo="incidente AAAA-MM-DD"`. Para uma conta suspeita: `--email=fulano@... --desativar`.
4. **Trocar segredos** se houver suspeita de que o servidor ou o `.env` vazou:
   - `AUTH_SECRET` (novo `openssl rand -hex 32`, reiniciar): invalida todos os cookies, inclusive forjados.
   - `DATA_KEY`: rotação `v2:<nova>,v1:<antiga>`, rodar `scripts/lgpd-cifrar.ts --aplicar`, depois remover a v1. Se a chave antiga vazou junto com o banco, as carteirinhas antigas devem ser tratadas como expostas.
   - Senha do banco (`opme_app` e dono), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, credenciais de hospedagem e do banco Itaú (SISPAG).
5. Isolar o que vazou: tirar o backup público do ar, revogar link, bloquear IP, desconectar a máquina **sem desligar** (desligar perde evidência).

### Horas 4–24 — preservar e investigar
6. **Preservar evidência antes de mexer**: `pg_dump` da tabela `"LogAuditoria"`, logs do servidor e do proxy, lista de usuários e `sessaoVersao`. O log de auditoria não pode ser apagado pelo app (§6).
7. Responder com o log: quem acessou o quê. Administração > Auditoria, ou SQL por `acao = 'visualizar'`, por `usuarioId` e por período. Leituras de paciente aparecem como "visualizar Cirurgia/Lote/Recolhimento"; downloads de anexo, como "baixar anexo".
8. Listar os **titulares afetados**: para cada cirurgia envolvida, `scripts/lgpd-titular.ts --cirurgias=...`.

### Até o 3º dia útil — avaliar e comunicar
9. **Avaliação de risco** (escrever): natureza dos dados (saúde = sensível), quantos titulares, se estavam cifrados (carteirinha: sim, se a `DATA_KEY` não vazou junto), probabilidade de uso indevido, medidas tomadas.
10. **Comunicar a ANPD** pelo formulário oficial de comunicação de incidente de segurança, no site da ANPD (gov.br/anpd) **[confirmar o caminho atual do formulário]**. Conteúdo mínimo (art. 48 §1º): natureza dos dados afetados; titulares envolvidos; medidas técnicas e de segurança usadas; riscos; motivo da demora, se houver; medidas para reverter ou reduzir os efeitos. Se faltar informação, comunique o que tiver e complemente depois (a resolução prevê complementação **[confirmar o prazo, 20 dias úteis]**).
11. **Comunicar os titulares** (pacientes) em linguagem simples, individualmente quando for possível identificá-los. Como o sistema não guarda contato do paciente, combinar com o **hospital** o envio. Modelo:

> **Comunicado sobre incidente de segurança com seus dados pessoais**
> Em [data], a [razão social da SP OSTEOS], distribuidora do material usado na sua cirurgia de [data] no [hospital], identificou [descrição simples: ex. "acesso indevido a uma cópia do nosso sistema"]. Os dados envolvidos foram: [nome, número da cirurgia, hospital, médico, material implantado; carteirinha do convênio: sim/não/estava cifrada]. Não guardamos seu CPF, endereço nem dados de pagamento. O que já fizemos: [bloqueio de acessos, troca de senhas e chaves, apuração]. Riscos possíveis: [ex. uso do nome e da carteirinha em tentativa de fraude no convênio]. O que recomendamos: [avisar o convênio se notar atendimento que não reconhece; desconfiar de contatos pedindo dados]. Dúvidas: encarregado [nome], [e-mail], [telefone].

12. Se houver sinal de crime, registrar boletim de ocorrência e guardar o protocolo junto com o registro do incidente.

### Depois
13. Relatório final no registro do incidente: causa, correção, o que muda. Revisar o RIPD (§12).

---

## 11. Responsáveis

| Papel | Quem | Observação |
|---|---|---|
| Controlador | SP OSTEOS (razão social/CNPJ) | decide por que e como os dados são tratados |
| Encarregado (DPO) | **[a nomear]** | art. 41; regulamentado pela Res. CD/ANPD nº 18/2024 **[confirmar]**. A dispensa para agente de pequeno porte (Res. CD/ANPD nº 2/2022) **não vale** para quem faz tratamento de alto risco, e dado de saúde costuma enquadrar **[confirmar]** |
| Responsável técnico do sistema | **[nome]** | executa o runbook (§10) e os scripts |
| Responsável técnico ANVISA (RT) | **[nome]** | confirma os prazos de rastreabilidade (§7) |
| Operadores | hospedagem, backup, e-mail | contrato com cláusula LGPD (art. 39) |

---

## 12. Checklist do RIPD (Relatório de Impacto, art. 5º XVII e art. 38)

- [ ] Descrição dos tratamentos (use o §2 e o §13).
- [ ] Necessidade e proporcionalidade: por que cada campo é necessário; o que **não** coletamos (CPF, nascimento, endereço do paciente).
- [ ] Bases legais por finalidade, revisadas pelo jurídico (marcas [confirmar]).
- [ ] Riscos aos titulares: vazamento de dado de saúde, fraude com carteirinha, acesso interno indevido (funcionário curioso), perda da rastreabilidade (perda de chave ou backup), erro de homônimo no atendimento.
- [ ] Medidas: perfis por setor (§14), mascaramento (§3), cifra (§4), auditoria de leitura (§5), log imutável (§6), MFA e sessão de 1 dia (agente acesso), papel de banco e TLS (§9), backup cifrado, runbook (§10), retenção (§7).
- [ ] Risco residual e plano: cifra do nome (P1 do §4), descarte da carteirinha (P2), treinamento da equipe.
- [ ] Aprovação do encarregado e do dono, com data; revisar a cada mudança relevante ou a cada ano.

---

## 13. Registro das operações de tratamento (art. 37)

| Operação | Dados | Titulares | Finalidade | Base | Compartilhado com | Retenção |
|---|---|---|---|---|---|---|
| Agendamento e execução da cirurgia (material) | nome, carteirinha, convênio, procedimento, médico, hospital | pacientes | fornecer o material | ED / OL | hospital, convênio | §7 |
| Faturamento e cobrança | idem + valores, NF | pacientes, hospitais | cobrar | ED, CR | hospital, convênio, banco (cobrança) | fiscal |
| Rastreabilidade e recall | nome × lote × cirurgia | pacientes | segurança sanitária | OL | fabricante, ANVISA, hospital | §7 |
| Orçamentos | nome (opcional), convênio | pacientes | proposta | EC | hospital | 6 meses se não aprovado |
| Pagamentos a fornecedores | dados bancários/Pix | fornecedores (PF/MEI) | pagar | EC | banco Itaú (SISPAG) | fiscal |
| Gestão de usuários e segurança | nome, e-mail, logs, IP | funcionários | autenticação, auditoria | EC / LI / OL | — | §7 |
| Cadastro de médicos e representantes | nome, CRM, contato, comissão | médicos, representantes | operação e comissão | EC / LI | — | contrato + fiscal |

Este documento, junto com a Administração > Auditoria, é o registro. Atualizar quando surgir campo ou finalidade nova.

---

## 14. Matriz de acesso a dado de paciente (como está no código)

| Perfil | Lista de cirurgias | Detalhe da cirurgia (nome completo + carteirinha) | Anexos | Orçamentos | Remessas (vale) | Rastreabilidade | Recall (pacientes) |
|---|---|---|---|---|---|---|---|
| ADMIN | sim (mascarado) | sim | sim | sim | sim | sim | sim |
| COMERCIAL | sim (mascarado) | sim | sim | sim | sim | não | não (só contagem) |
| FINANCEIRO | sim (mascarado) | sim | sim | sim | não | não | não |
| ESTOQUE | não | sim (pelo vale) | sim | não | sim | sim | não |
| QUALIDADE | não | não | não | não | sim (sem link para a cirurgia) | sim | **sim** |
| COMPRAS | não | não | não | não | não | não | não |

Decisões a revisar com o cliente: o FINANCEIRO precisa da carteirinha (ou só do número da cirurgia)? O ESTOQUE precisa do nome completo no vale, ou basta "Maria S." + CIR-n?

---

## 15. Pendências

| # | Item | Esforço |
|---|---|---|
| P1 | Cifrar o nome do paciente (desenho no §4), depois de o cliente aceitar a busca por palavra inteira e de a guarda da `DATA_KEY` estar provada | ~1,5 dia |
| P1 | Rodar `scripts/lgpd-cifrar.ts --aplicar` em produção (e no banco local, quando houver `DATA_KEY` no `.env`) | 10 min |
| P2 | Descarte da carteirinha 5 anos após o recebimento | 2 h |
| P2 | `audit()` dentro da transação da mutação (hoje grava depois e engole falha) | 1–2 dias (todas as actions) |
| P2 | Expurgo de `LogAuditoria` > 5 anos (script com a exceção de manutenção, rodado pelo dono) | 1 h |
| P2 | Rever: "login falhou" grava o texto digitado no e-mail (pode ser senha digitada no campo errado; `REVISAO.md` §19.1) | 1 h (agente acesso) |
| P3 | `observacao` livre (cirurgia, orçamento) pode receber dado clínico: orientar a equipe a não escrever diagnóstico | treinamento |
| — | Jurídico: confirmar as marcas **[confirmar]** (normas ANVISA de rastreabilidade de implantes e ação de campo, prazos fiscais, artigos da Res. 15/2024) | consultoria |
