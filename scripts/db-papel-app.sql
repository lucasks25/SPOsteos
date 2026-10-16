-- Papel de MENOR PRIVILÉGIO para a aplicação (docs/LGPD.md §9; checklist de produção em docs/PRODUCAO-SEGURA.md).
--
-- A aplicação passa a conectar como opme_app: lê e grava dados, mas NÃO cria/altera/apaga tabelas (sem DDL), não
-- esvazia tabelas (sem TRUNCATE), não altera nem apaga a auditoria ("LogAuditoria": só SELECT e INSERT) e não vê a
-- tabela de controle das migrations. As migrations (npx prisma migrate deploy) continuam com o papel DONO, numa URL
-- separada que não fica no servidor da aplicação.
--
-- Uso (como o papel dono das tabelas, DEPOIS de cada `prisma migrate deploy` que crie tabela nova, ou uma vez se as
-- tabelas novas forem criadas pelo mesmo dono: o ALTER DEFAULT PRIVILEGES abaixo cobre as futuras):
--   psql "postgresql://<dono>:<senha>@<host>:5432/opme?sslmode=require" -v ON_ERROR_STOP=1 \
--        -v app_senha="$(openssl rand -hex 24)" -f scripts/db-papel-app.sql
-- Depois, no .env de produção da aplicação:
--   DATABASE_URL=postgresql://opme_app:<app_senha>@<host>:5432/opme?schema=public&sslmode=require
-- Idempotente: pode rodar de novo (troca a senha para a informada).

\if :{?app_senha}
\else
  \echo 'Informe a senha: -v app_senha=...'
  \quit
\endif

BEGIN;

SELECT 'CREATE ROLE opme_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opme_app') \gexec
ALTER ROLE opme_app WITH LOGIN PASSWORD :'app_senha';
-- transação esquecida aberta segura travas (FOR UPDATE) e conexões do pool; o app usa timeout de 10 s nas transações
ALTER ROLE opme_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE opme_app SET statement_timeout = '60s';

GRANT CONNECT ON DATABASE :"DBNAME" TO opme_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO opme_app;

-- dados: leitura e escrita comuns
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opme_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opme_app;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM opme_app;

-- auditoria: só acrescenta e lê (a trigger da migration 20261016235000 também recusa UPDATE/DELETE/TRUNCATE)
REVOKE UPDATE, DELETE, TRUNCATE ON "LogAuditoria" FROM opme_app;

-- controle das migrations: a aplicação não precisa
REVOKE ALL ON "_prisma_migrations" FROM opme_app;

-- tabelas e sequências criadas no futuro por ESTE papel (o das migrations) já nascem com os mesmos direitos
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO opme_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO opme_app;

COMMIT;

\echo 'opme_app pronto. Confira: psql como opme_app e tente UPDATE "LogAuditoria" (deve dar permission denied).'
