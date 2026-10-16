# Segurança do Sistema OPME: as 10 maiores ameaças a um ERP e como este sistema se defende

> Escrito em 16/10/2026 pela equipe de segurança (3 agentes: acesso, LGPD, infraestrutura). Complementa `docs/REVISAO.md` §13 e §19 (auditorias anteriores), `docs/LGPD.md` (dados pessoais, incidente, titular) e `docs/PRODUCAO-SEGURA.md` (como colocar em produção).
> Contexto legal: multa da LGPD de até 2% do faturamento, teto de R$ 50 milhões por infração (art. 52). A infração mais sancionada pela ANPD não é o vazamento em si, e sim **não comunicar o incidente** (art. 48). Dado de saúde (paciente, carteirinha) é dado sensível (art. 11) e agrava a sanção.

## Resumo em uma tabela

| # | Ameaça (como ERPs são invadidos) | O que o sistema faz | Estado |
|---|---|---|---|
| 1 | Senha roubada ou vazada (phishing, reuso, credential stuffing) | 2º fator TOTP obrigatório para ADMIN e FINANCEIRO; política única de senha (10+ caracteres, lista de senhas comuns, não pode conter nome ou e-mail); senha provisória trocada no 1º acesso; limite de 5 erros por 15 min por e-mail, 30 por IP, IP só confiável atrás de proxy; tempo de resposta igual para e-mail inexistente | Pronto e testado |
| 2 | Quebra de controle de acesso (IDOR, ver ou agir em dado de outro setor; OWASP A01) | `requireUser(perfis)` obrigatório em toda page e action, com guarda estática que falha o `npm test` se faltar; todo argumento de action validado (`argId`, `argInt`), contra objeto-operador do Prisma; ids de filho carregados junto com o pai; rotas de arquivo respondem 401/403; page sem perfil vai para `/sem-acesso` | Pronto (B3 revisado e fechado) |
| 3 | Sessão roubada ou sequestrada (cookie, fixação, subdomínio) | JWT HS256 em cookie httpOnly/secure/sameSite, nome `__Host-` em produção; token novo a cada login; `sessaoVersao` derruba sessões ao trocar senha, perfil, desativar, zerar MFA ou "encerrar outras sessões"; AUTH_SECRET forte exigido na subida | Pronto |
| 4 | Vazamento ou exposição de dados pessoais (paciente, carteirinha) | Carteirinha cifrada AES-256-GCM com rotação de chave e hash para busca; nome mascarado em listas e na busca global ("Maria S."); nome fora do kardex; leitura de dado de saúde auditada (detalhe da cirurgia, vale, orçamento, rastreabilidade, recall, download de anexo); erros em log sem dados do paciente; nenhum CSV com paciente (guarda estática) | Pronto; cifra do **nome** desenhada como P1 |
| 5 | Exfiltração interna em massa (funcionário exporta tudo) | Toda exportação CSV audita quem, rota, filtros e nº de linhas; limite de 10 CSV/min e 60 downloads/min por usuário; paginação com teto; busca global filtrada pelo perfil | Pronto |
| 6 | Injeção (SQL, upload malicioso, XSS) | Prisma parametrizado (sem `queryRawUnsafe`); upload só PDF/JPG/PNG por assinatura de bytes, nome gerado pelo servidor, fora de `public/`; CSP com nonce e `strict-dynamic`, sem `dangerouslySetInnerHTML` de dado; cabeçalhos COOP, CORP, nosniff, frame-ancestors none, HSTS | Pronto (confirmado desde §13) |
| 7 | Fraude financeira interna (troca de conta bancária, aprovação) | Dupla checagem de dados bancários do favorecido (hash aprovado por outra pessoa antes do SISPAG); segregação na aprovação de contas a pagar (quem edita não aprova; aprova o que viu); travas `FOR UPDATE`; download de remessa auditado com sha256 | Pronto (§19) |
| 8 | Adulteração do rastro (apagar o log para esconder o ataque) | Trigger no Postgres recusa UPDATE/DELETE/TRUNCATE em `LogAuditoria`; FK do autor RESTRICT; papel de banco `opme_app` sem DDL e sem DELETE no log; auditoria de login falho, troca de senha, MFA, exportação | Pronto; expurgo > 5 anos é P2 |
| 9 | Cadeia de suprimentos e segredos (dependência maliciosa, chave no git, banco exposto) | `ignore-scripts=true`, `overrides` nas dependências vulneráveis, `npm run audit` = 0 em produção; varredura do histórico sem segredo; bancos de ferramenta de IA removidos do git; Postgres só em 127.0.0.1; produção recusa subir com `opme:opme`, sem `sslmode` ou sem `DATA_KEY` | Pronto; `braces` (só lint) sem correção upstream |
| 10 | Incidente sem resposta (a multa mais comum) e indisponibilidade | Runbook do art. 48 em `docs/LGPD.md` (3 dias úteis para comunicar à ANPD): conter com `scripts/derrubar-sessoes.ts`, preservar log, modelo de comunicado; relatório do titular (`scripts/lgpd-titular.ts`); backup diário cifrado com `age` + restauração testada; compose de produção com TLS e scram | Pronto; depende do cliente nomear o encarregado (DPO) |

## O que cada peça faz (para quem vai operar)

- **2º fator (TOTP)**: código de 6 dígitos do aplicativo autenticador. Sem ele, senha roubada não entra. Obrigatório para quem move dinheiro e acessos. Códigos de recuperação de uso único; admin pode zerar o de outra pessoa (auditado).
- **Senha provisória**: a senha que o admin cria ou redefine só serve para a primeira entrada; o sistema força a troca.
- **Limite de tentativas**: barra adivinhação de senha e de código, por e-mail, por IP e por usuário.
- **Cookie `__Host-`**: o navegador só aceita o cookie vindo do próprio domínio em HTTPS; outro site ou subdomínio não consegue plantar sessão.
- **`sessaoVersao`**: número que sobe a cada troca de senha, logout geral ou mudança de perfil; cookies antigos deixam de valer na hora.
- **`requireUser` + guarda estática**: cada tela e ação confere quem é e qual perfil; um teste automático reprova o código se alguém esquecer.
- **Cifra da carteirinha (`DATA_KEY`)**: no banco fica texto ilegível; sem a chave, um dump vazado não expõe a carteirinha. A chave fica fora do servidor de banco e pode ser trocada sem parar o sistema.
- **Mascaramento**: listas mostram "Maria S."; o nome completo só na tela de detalhe, que é auditada.
- **Auditoria de leitura**: fica registrado quem abriu o prontuário de qual cirurgia e quando. É o que a ANPD pergunta num incidente.
- **Log imutável**: nem o administrador consegue apagar ou editar o histórico; só o dono do banco, em manutenção explícita.
- **Exportação auditada e limitada**: cada CSV baixado fica registrado com quem, filtros e quantas linhas; rajadas são bloqueadas.
- **Upload por assinatura**: o conteúdo do arquivo é lido para confirmar que é PDF/JPG/PNG; nome e extensão são do servidor; o arquivo nunca fica acessível sem login.
- **CSP com nonce e cabeçalhos**: só scripts gerados pela própria página rodam; a aplicação não pode ser embutida em outro site (clickjacking).
- **Aprovação dupla de favorecido**: trocar conta bancária de fornecedor exige que outra pessoa aprove antes de qualquer pagamento sair.
- **Papel de banco `opme_app`**: a aplicação não consegue criar/apagar tabelas nem apagar o log, mesmo que seja comprometida.
- **Checagens na subida**: em produção o servidor se recusa a subir com segredo fraco, banco com senha padrão, sem TLS ou sem chave de cifra.
- **Backup cifrado + restauração testada**: dump diário cifrado com `age`, sha256 conferido; o script de restauração recusa destino não vazio.
- **Runbook de incidente**: passo a passo para conter, apurar e comunicar ANPD e titulares no prazo; modelo de comunicado pronto.

## Pendências priorizadas

| Prior. | Item | Esforço | Dono |
|---|---|---|---|
| P1 | Cifrar também o **nome do paciente** (busca passa a ser por palavra inteira; aceitar com o cliente) | 1,5 dia | dev |
| P1 | Em produção: gerar `DATA_KEY`, guardar fora do servidor, rodar `npx tsx scripts/lgpd-cifrar.ts --aplicar` | 10 min | ops |
| P1 | Nomear o **encarregado (DPO)**, preencher o RIPD e o registro de operações (`docs/LGPD.md`), revisar os pontos marcados [confirmar] com advogado | 1 dia | cliente |
| P1 | Produção conforme `docs/PRODUCAO-SEGURA.md`: HTTPS por proxy, `TRUST_PROXY`, TLS no banco, papel `opme_app`, disco cifrado, `age` instalado | 1 dia | ops |
| P2 | Sessão com tempo de inatividade (hoje vale 24 h do login) | 3 h | dev |
| P2 | QR code no cadastro do 2º fator (hoje digita a chave ou abre o link `otpauth://`) | 1 h | dev |
| P2 | Alerta ao admin após N falhas seguidas de código MFA | 2 h | dev |
| P2 | Descarte da carteirinha 5 anos após o recebimento; expurgo do log > 5 anos; `audit()` dentro da transação | 2 dias | dev |
| P2 | "login falhou" não gravar o texto digitado no campo e-mail quando não é e-mail | 1 h | dev |
| P3 | `braces` no lint sem correção upstream; reavaliar a cada atualização do `eslint-config-next` | — | dev |

## Como foi verificado (16/10/2026)

- `npm test` 259/259 (inclui 12 arquivos em `tests/seguranca/`: guarda estática, argumentos, TOTP com vetores das RFC 6238/4648, sessão/JWT, senha, exportação, cifra, máscara, config de infra).
- `npm run test:db` 265/265 (inclui `mfa.test.ts` com 2 pedidos simultâneos do mesmo código, `lgpd-auditoria.test.ts` provando que UPDATE/DELETE no log falham, `login.test.ts` com 20 tentativas paralelas).
- `npm run arquitetura` 0 violações; `npm run lint` 0 erros; `npm run audit` 0 vulnerabilidades (produção).
- Cabeçalhos conferidos com `curl` no servidor de desenvolvimento; compose de produção subido em projeto isolado com TLS e scram confirmados; ciclo backup/restauração executado.
- **Não provado:** telas novas (MFA, trocar senha, segurança) não foram abertas no navegador nesta rodada; cifra real com `age` e `lgpd-cifrar --aplicar` não executados contra o banco (o `.env` local não tem `DATA_KEY`).
