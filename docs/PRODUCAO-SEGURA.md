# Produção segura: checklist e artefatos

Este documento é o roteiro para colocar o sistema no ar sem expor dados de pacientes e dados bancários (LGPD, art. 46: medidas de segurança técnicas e administrativas). Cada item diz o que fazer e como conferir. Itens de proteção de dados (papel do banco, cifra da carteirinha, retenção, incidente) estão em `docs/LGPD.md`; aqui ficam infraestrutura, segredos, rede e dependências.

Artefatos deste roteiro: `docker-compose.prod.yml`, `scripts/backup-db.sh`, `scripts/restaurar-db.sh`, `.npmrc`, `.env.example`, `src/instrumentation.ts` (trava de subida), `src/lib/ip.ts` (IP confiável).

## 0. Checklist de uma página

| # | Item | Como conferir |
|---|---|---|
| 1 | `npm ci` + `npm run prisma:gerar` + `npm run build` (sem `npm install`) | `package-lock.json` não muda no deploy |
| 2 | `npm run audit` sem HIGH/CRITICAL nas dependências de produção | saída "found 0 vulnerabilities" |
| 3 | `AUTH_SECRET` aleatório (`openssl rand -hex 32`), `DATA_KEY` gerada, ambos em cofre | o servidor não sobe sem eles |
| 4 | `DATABASE_URL` com o papel `opme_app`, senha aleatória e TLS (`sslmode`) | o servidor não sobe com `opme:opme` nem sem TLS |
| 5 | Banco só em `127.0.0.1` ou rede privada; porta 5432 fechada no firewall | `nmap -p 5432 <ip-publico>` mostra fechada |
| 6 | Disco do banco cifrado (LUKS, volume cifrado da nuvem, FileVault) | `lsblk -f` / console da nuvem |
| 7 | App escutando só em `127.0.0.1` atrás de proxy reverso com HTTPS | `curl http://<ip>:3000` de fora não responde |
| 8 | `TRUST_PROXY=1` e o proxy sobrescreve `x-forwarded-for` | login falho grava `ip:<ip real>` em `TentativaLogin` |
| 9 | Várias instâncias: `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` igual em todas | formulários não falham após deploy |
| 10 | Backup diário cifrado com `age` e teste de restauração mensal | `scripts/restaurar-db.sh` num banco vazio |
| 11 | Chave privada do `age`, `AUTH_SECRET` e `DATA_KEY` fora do servidor e fora do backup | cofre de senhas da empresa |
| 12 | Alerta de falhas de login (§7) | consulta SQL no cron |
| 13 | Senhas do seed (`opme1234`) inexistentes: usuários criados por `npm run admin:criar` | `select email from "Usuario"` sem `@opme.local` |
| 14 | Cabeçalhos de segurança chegam (§5) | `curl -sI https://<dominio>/login` |
| 15 | CDN/cache só para `/_next/static/*` e `/marca/*` (§5) | nada de `/api`, `/(app)` nem arquivos em cache |

## 1. Instalar e atualizar dependências

Cadeia de suprimentos (OWASP A03:2025):

- **Sempre `npm ci`** no servidor e no CI, nunca `npm install`: ele instala exatamente o `package-lock.json` versionado e falha se o lock divergir do `package.json`.
- **`.npmrc` com `ignore-scripts=true`**: nenhum pacote de terceiros roda script de instalação (`@prisma/engines`, `esbuild`, `unrs-resolver`). Testado: o fluxo continua igual. Como o `postinstall` do projeto também não roda, **depois do `npm ci` execute `npm run prisma:gerar`** (gera o cliente Prisma em `src/generated/prisma`). Em desenvolvimento, depois de `npm install`, o mesmo comando.
- **`overrides` no `package.json`** fixam `deepmerge-ts >= 8.0.2` e `mysql2 >= 3.24.6` (usados só pelo CLI do Prisma). Não rebaixar `eslint-config-next`, não mudar Prisma 7.10 nem Next 16.4.
- **`npm run audit`** (`npm audit --omit=dev --audit-level=high`): vale para o que roda em produção e precisa sair limpo. `npm run audit:dev` inclui as ferramentas de desenvolvimento e hoje acusa `braces`/`micromatch`/`fast-glob`/`@next/eslint-plugin-next` (negação de serviço por padrões de glob aninhados, só no lint, com entrada fixa da nossa configuração). Não existe versão corrigida do `braces` (a 3.0.3 é a última publicada); reavaliar a cada atualização do `eslint-config-next`.
- **Rotina mensal** (sem GitHub no projeto): `npm outdated`, `npm run audit`, atualizar com teste (`npm run typecheck && npm test && npm run arquitetura`) e registrar no `docs/REVISAO.md`. Se o código for para o GitHub, ativar Dependabot com este `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    ignore:
      - dependency-name: prisma          # fixado em 7.10 (a tag latest é o 8.x RC)
        update-types: ["version-update:semver-major"]
      - dependency-name: "@prisma/*"
        update-types: ["version-update:semver-major"]
      - dependency-name: next            # fixado em 16.4
        update-types: ["version-update:semver-major"]
```

## 2. Variáveis de ambiente de produção

O `src/instrumentation.ts` recusa subir em produção (`NODE_ENV=production`) com configuração insegura, com mensagem objetiva no log.

| Variável | Obrigatória | Regra |
|---|---|---|
| `AUTH_SECRET` | sim | 32+ caracteres aleatórios (`openssl rand -hex 32`); assina o cookie de sessão. Trocar derruba todas as sessões. |
| `DATA_KEY` | sim | cifra da carteirinha do paciente (`docs/LGPD.md`). Perder = perder os dados cifrados: guardar cópia no cofre. |
| `DATABASE_URL` | sim | papel `opme_app`, senha aleatória, TLS. Recusada com `opme:opme`, senha igual ao usuário ou fraca, sem senha, ou sem `sslmode` (exceto banco em `localhost` ou `ALLOW_INSECURE_DB=1`). |
| `ALLOW_INSECURE_DB` | não | `1` só se o banco está na mesma máquina ou numa rede privada isolada e TLS é impossível. Não derruba a regra da senha de exemplo. |
| `TRUST_PROXY` | sim, se há proxy | `0` (padrão) ignora o `x-forwarded-for`; `1` a `5` = quantidade de proxies confiáveis. Valor inválido derruba a subida. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | com 2+ instâncias | `openssl rand -base64 32`, igual em todas as instâncias (senão cada uma cifra os IDs das Server Actions com chave própria e os formulários falham entre instâncias). |
| `DATABASE_POOL_MAX` | não | conexões por processo (padrão 20); a soma das instâncias fica abaixo do `max_connections` do Postgres. |
| `EMPRESA_*` | recomendado | dados impressos nos documentos. |
| `SEED_PASSWORD` | nunca | só desenvolvimento; o seed não deve rodar em produção. |

Segredos nunca entram no git (`.env*`, `secrets/`, `certs/`, `*.key`, `*.pem` estão no `.gitignore`). Não colocar segredo em `NEXT_PUBLIC_*` (vai para o navegador).

## 3. Banco de dados

1. **Subir** com `docker-compose.prod.yml` (senha por arquivo-segredo, TLS ligado, `scram-sha-256`, porta só em `127.0.0.1`, logs de conexão):

```bash
mkdir -p secrets certs && chmod 700 secrets certs
openssl rand -base64 32 | tr -d '\n' > secrets/pg_senha && chmod 600 secrets/pg_senha
# certificado do banco: o CN/SAN precisa ser o nome que o app usa para chegar ao banco
openssl req -new -x509 -days 825 -nodes -out certs/server.crt -keyout certs/server.key \
  -subj "/CN=db.interno" -addext "subjectAltName=DNS:db.interno,IP:127.0.0.1"
chmod 600 certs/server.key
sudo chown 70:70 certs/server.key certs/server.crt     # uid do usuário postgres na imagem alpine (Linux)
OPME_DB_DIR=/srv/opme/pgdata docker compose -f docker-compose.prod.yml up -d
```

   `OPME_DB_DIR` precisa estar em **disco cifrado** (LUKS, volume cifrado da nuvem). Testado: o banco sobe com `ssl=on` e `password_encryption=scram-sha-256`, e a conexão com `sslmode=require` reporta SSL ativo.

2. **TLS no cliente.** O driver `pg` que o Prisma usa trata `sslmode=require` como `verify-full`: valida a cadeia e o nome. Com certificado próprio use `sslmode=verify-full&sslrootcert=/etc/opme/pg-ca.crt` (o próprio `server.crt` serve de CA). Com certificado de uma CA pública, `sslmode=require` basta. Se o Prisma CLI (`migrate deploy`) recusar o certificado próprio, rode as migrations de uma máquina que confie nele; só em último caso, e só para a URL das migrations, use `sslaccept=accept_invalid_certs`.
3. **Duas URLs.** Migrations rodam com a URL do papel **dono** (`DATABASE_URL` no comando `npx prisma migrate deploy`, em sessão de deploy, nunca no ambiente do app). O app roda com `opme_app` (menor privilégio). Depois do `migrate deploy`, aplicar `scripts/db-papel-app.sql` como dono (criado pelo agente LGPD; detalhes em `docs/LGPD.md` §9).
4. **Rede.** Porta 5432 nunca publicada na internet. App e banco na mesma máquina: `127.0.0.1`. Máquinas separadas: rede privada/VPC e regra de firewall só para o IP do app.
5. **Desenvolvimento.** O `docker-compose.yml` agora publica a 5440 só em `127.0.0.1` (antes escutava em todas as interfaces com `opme:opme`, acessível por qualquer pessoa da mesma rede). Quem já tem o container rodando precisa recriá-lo (`docker compose up -d`) para aplicar.

## 4. Aplicação e proxy reverso (HTTPS)

Rodar o app só em loopback e deixar o proxy terminar o TLS:

```bash
npm ci && npm run prisma:gerar && npm run build
NODE_ENV=production npx next start -H 127.0.0.1 -p 3000      # sob systemd/pm2, com EnvironmentFile 600
```

**Caddy** (certificado Let's Encrypt automático, HTTP/2 e redirecionamento para HTTPS):

```caddyfile
opme.suaempresa.com.br {
    encode zstd gzip
    request_body {
        max_size 12MB          # uploads têm teto de 10 MB no sistema; o Next aceita até 11 MB por Server Action
    }
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {remote_host}     # SOBRESCREVE: o cliente não escolhe o próprio IP
        header_up Host {host}
    }
}
```

**nginx** (equivalente):

```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;
server {
    listen 443 ssl http2;
    server_name opme.suaempresa.com.br;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 12m;
    location = /login {                                   # freio extra contra força bruta
        limit_req zone=login burst=10 nodelay;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/opme-proxy.conf;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/opme-proxy.conf;
    }
}
# opme-proxy.conf:
#   proxy_set_header Host $host;
#   proxy_set_header X-Forwarded-For $remote_addr;      # sobrescreve
#   proxy_set_header X-Forwarded-Proto $scheme;
#   proxy_read_timeout 60s;
server { listen 80; server_name opme.suaempresa.com.br; return 301 https://$host$request_uri; }
```

Pontos de atenção:

- **`TRUST_PROXY=1`** só depois de garantir que a porta 3000 não é alcançável sem passar pelo proxy (loopback ou firewall). Com `TRUST_PROXY` ligado e o app exposto, qualquer um forja o IP. Com N proxies em cadeia (CDN + nginx), use `TRUST_PROXY=2`: o sistema lê a N-ésima entrada contada do fim do `x-forwarded-for`. `src/lib/ip.ts` é o único lugar que lê o cabeçalho.
- **Corpo de requisição.** O Next 16 só permite um `serverActions.bodySizeLimit` global (`11mb` em `next.config.ts`, necessário para anexos de 10 MB e extratos); não há limite por rota. O teto efetivo por tela é validado no código (10 MB em `src/lib/upload-seguro.ts`, 5 MB para OFX), e o proxy corta em 12 MB antes de o Node ler o corpo.
- **Server Actions e `Host`.** O Next compara `Origin` com `Host`/`x-forwarded-host`; o proxy precisa repassar o `Host` original (acima já repassa), senão as ações falham por proteção CSRF.

## 5. Cabeçalhos e cache

Definidos em `next.config.ts` (estáticos) e `src/proxy.ts` (CSP com nonce, por requisição). Conferido com `curl -sI` em `/login` e em `/`:

| Cabeçalho | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`, scripts só com nonce + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests` em produção. `img-src 'self' data:` (o `data:` é só a seta do `<select>` em `src/app/estilos/base.css`; `blob:` removido). `connect-src 'self'` cobre a busca e o sino (únicas chamadas de rede do navegador). `style-src` aceita inline porque o React usa atributos `style`. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`. **Sem `preload` de propósito**: entrar na lista de preload é praticamente irreversível e vale para todos os subdomínios. Só acrescentar `; preload` se a empresa decidir submeter o domínio em hstspreload.org e todos os subdomínios servirem HTTPS. |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-Frame-Options` | `DENY` (redundante com `frame-ancestors`, para navegadores antigos) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `same-origin` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `Permissions-Policy` | câmera, microfone, geolocalização, pagamento, USB, giroscópio etc. desligados |

Pontos conhecidos: respostas de redirecionamento (sem sessão, para `/login`) não levam CSP, porque não têm corpo; `/_next/static` e `/marca/*` ficam fora do `proxy` e não levam CSP (arquivos estáticos). Visualizar anexos em PDF direto no navegador está sujeito à CSP do site (`object-src 'none'`): conferir uma vez no navegador de produção; se o visualizador de PDF do Chrome for bloqueado, a saída é servir o anexo com `Content-Disposition: attachment`.

**Cache/CDN:** páginas e `/api/*` respondem `Cache-Control: no-store` e dependem de cookie de sessão. Configure CDN e proxy para fazer cache **apenas** de `/_next/static/*` e `/marca/*`, e para **nunca** guardar `/api/*`, `/_next/data/*`, rotas de arquivo (`.../anexos/...`, `.../arquivo`, `.../exportar`) nem respostas com `Set-Cookie`. No Cloudflare: regra "Bypass cache" para tudo fora desses dois prefixos.

## 6. Backup e restauração

Backup diário cifrado, com a chave privada **fora** do servidor (se o servidor for invadido, o atacante não decifra os backups; se o servidor for perdido, a chave privada permite restaurar).

```bash
# uma vez, numa máquina SEGURA (não no servidor):
age-keygen -o chave-backup.txt         # imprime a chave pública age1...; guarde o arquivo no cofre
# no servidor, só a chave pública:
export AGE_RECIPIENT=age1...
export BACKUP_DIR=/srv/opme/backups    # fora do repositório, chmod 700
# a) pg_dump direto (cliente 17 instalado):
export BACKUP_DATABASE_URL='postgresql://opme:...@127.0.0.1:5432/opme?sslmode=verify-full&sslrootcert=...'
# b) ou via container:
export DUMP_CMD='docker exec -i -e PGPASSWORD="$(cat /srv/opme/secrets/pg_senha)" opme-db-prod pg_dump -U opme -d opme --format=custom --no-owner'
./scripts/backup-db.sh
```

Agendamento (cron): `15 2 * * * cd /srv/opme && ./scripts/backup-db.sh >> /var/log/opme-backup.log 2>&1`. O script grava `.dump.age` com `umask 077`, confere que não ficou vazio, gera `.sha256`, descarta o arquivo se o `pg_dump` falhar e apaga backups com mais de `RETENCAO_DIAS` (padrão 30; alinhar com a política de retenção de `docs/LGPD.md`). Copiar os cifrados para **outro local** (outro provedor/região); backup no mesmo disco não protege de perda do servidor. Sem `age`/`gpg`: `brew install age` / `apt install age`.

**Teste de restauração mensal** (backup que nunca foi restaurado não é backup):

```bash
createdb -h 127.0.0.1 -U opme opme_restore
AGE_IDENTITY=/caminho/seguro/chave-backup.txt \
  ./scripts/restaurar-db.sh /srv/opme/backups/opme-AAAAMMDDTHHMMSSZ.dump.age \
  "postgresql://opme:...@127.0.0.1:5432/opme_restore?sslmode=verify-full&sslrootcert=..."
```

O script confere o `.sha256`, recusa destino com tabelas, restaura com `--exit-on-error` e imprime contagens (`Usuario`, `LogAuditoria`, `Lancamento`, `Movimento`) para comparar com a produção. Depois do teste: `dropdb opme_restore` e registrar data e resultado. Este fluxo foi testado ponta a ponta contra o Postgres 17 do compose de produção (dump, restauração, recusa de destino não vazio, falha do dump sem deixar arquivo).

## 7. Monitoramento de falhas de login

`TentativaLogin` guarda cada tentativa por `email:<x>` e `ip:<x>` (a tentativa bem-sucedida apaga as do e-mail). Consultas para o cron/alerta:

```sql
-- chaves sob ataque agora (5+ tentativas em 15 min)
select chave, count(*) as tentativas, max("criadaEm") as ultima
from "TentativaLogin" where "criadaEm" > now() - interval '15 minutes'
group by chave having count(*) >= 5 order by tentativas desc;

-- falhas de login por hora nas últimas 24 h (a auditoria é imutável e guarda o histórico)
select date_trunc('hour', "criadoEm") as hora, count(*) as falhas
from "LogAuditoria" where acao = 'login falhou' and "criadoEm" > now() - interval '24 hours'
group by 1 order by 1;
```

Alerta simples (cron a cada 10 minutos; ajuste o limite): 

```bash
n=$(psql "$MONITOR_DATABASE_URL" -tA -c "select count(*) from \"LogAuditoria\" where acao='login falhou' and \"criadoEm\" > now() - interval '10 minutes'")
[ "$n" -ge 20 ] && echo "OPME: $n falhas de login em 10 min" | mail -s "Alerta de login OPME" seguranca@suaempresa.com.br
```

Outros sinais para vigiar no `LogAuditoria`/logs: `login` de horário ou IP incomum, muitos `429` em `/api/busca`, `/api/pendencias` e exportações, e `[erro inesperado ...]` repetido no log do app (com código de referência, sem dados pessoais).

## 8. Limites conhecidos (aceitos e documentados)

- **Limites em memória** (busca, pendências, exportações, downloads: `src/lib/limite-rota.ts`, `src/lib/busca-util.ts`) valem por processo. Com N instâncias o limite efetivo é N vezes maior. O limite de **login** é no banco e vale para todas as instâncias.
- **Sem proxy confiável** (`TRUST_PROXY=0`) só vale o limite de login por e-mail: espalhar senhas por vários e-mails a partir de um IP não é contido. O freio por IP do nginx (§4) cobre essa lacuna.
- **Anexos em disco local** (`storage/`): em mais de uma instância, usar volume compartilhado ou bucket privado; incluir `storage/` no backup (cifrado).
- **Histórico do git**: ver relatório da equipe de segurança; os bancos de agente de IA que estavam versionados em `src/app/` não continham segredos e nunca foram a um repositório remoto.
