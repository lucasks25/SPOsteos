-- LGPD (docs/LGPD.md §4 e §6). Escrita à mão: só as mudanças desta etapa.

-- 1) Índice cego da carteirinha (HMAC, src/lib/cripto.ts): achar o titular por carteirinha sem guardá-la em claro.
ALTER TABLE "Cirurgia" ADD COLUMN "carteirinhaHash" TEXT;
CREATE INDEX "Cirurgia_carteirinhaHash_idx" ON "Cirurgia"("carteirinhaHash");

-- 2) Auditoria nunca perde quem fez: usuário com histórico não pode ser apagado (desativar em vez de apagar).
--    Antes era ON DELETE SET NULL, que apagaria o autor de todas as linhas do log.
ALTER TABLE "LogAuditoria" DROP CONSTRAINT "LogAuditoria_usuarioId_fkey";
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Log de auditoria imutável: UPDATE, DELETE e TRUNCATE recusados.
--    Exceção de manutenção (expurgo após o prazo de retenção, limpeza de testes): só quem é DONO da tabela e liga,
--    na própria transação, SELECT set_config('opme.manutencao_auditoria', 'on', true). O papel da aplicação em
--    produção (scripts/db-papel-app.sql) não é dono e nem tem o privilégio de UPDATE/DELETE: a exceção não vale para ele.
--    Não protege contra o dono mal-intencionado (ele pode remover a trigger): para isso servem o papel separado,
--    o backup e o registro do Postgres (docs/LGPD.md §9).
CREATE OR REPLACE FUNCTION opme_log_auditoria_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('opme.manutencao_auditoria', true) = 'on'
     AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = TG_RELID AND pg_has_role(current_user, c.relowner, 'MEMBER')) THEN
    IF TG_LEVEL = 'ROW' THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'LogAuditoria é imutável: % recusado (docs/LGPD.md §6)', TG_OP USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "LogAuditoria_imutavel" BEFORE UPDATE OR DELETE ON "LogAuditoria"
  FOR EACH ROW EXECUTE FUNCTION opme_log_auditoria_imutavel();
CREATE TRIGGER "LogAuditoria_sem_truncate" BEFORE TRUNCATE ON "LogAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION opme_log_auditoria_imutavel();
