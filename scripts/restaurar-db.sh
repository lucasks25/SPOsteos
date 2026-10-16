#!/usr/bin/env bash
# Restaura um backup cifrado (age) num banco VAZIO e confere o resultado. Use para o TESTE MENSAL DE RESTAURAÇÃO e para
# recuperação de desastre. Roteiro: docs/PRODUCAO-SEGURA.md §6.
#
#   AGE_IDENTITY=/caminho/chave-privada.txt ./scripts/restaurar-db.sh backups/opme-AAAAMMDDTHHMMSSZ.dump.age postgresql://dono:senha@host/opme_restore?sslmode=require
#
# Nunca aponte para o banco de produção em uso: o script recusa um destino que já tenha tabelas.
# RESTORE_CMD (opcional) substitui o pg_restore, ex. com Docker:
#   RESTORE_CMD='docker exec -i opme-db-prod pg_restore -U opme -d opme_restore --no-owner --exit-on-error'
#   CHECK_CMD='docker exec -i opme-db-prod psql -U opme -d opme_restore -tA'
set -euo pipefail
umask 077

arquivo="${1:?uso: restaurar-db.sh <arquivo.dump.age> <url-do-banco-destino>}"
url="${2:-}"
: "${AGE_IDENTITY:?defina AGE_IDENTITY (arquivo com a chave privada age)}"
command -v age >/dev/null || { echo "age não encontrado" >&2; exit 1; }
[ -f "$arquivo" ] || { echo "arquivo não existe: $arquivo" >&2; exit 1; }
if [ -f "$arquivo.sha256" ]; then (cd "$(dirname "$arquivo")" && shasum -a 256 -c "$(basename "$arquivo").sha256"); fi

[ -n "${RESTORE_CMD:-}" ] || : "${url:?informe a URL do banco destino}"
RESTORE_CMD="${RESTORE_CMD:-pg_restore --no-owner --exit-on-error --dbname \"$url\"}"
CHECK_CMD="${CHECK_CMD:-psql \"$url\" -tA}"

tabelas=$(bash -c "$CHECK_CMD" <<< "select count(*) from information_schema.tables where table_schema='public';")
[ "$tabelas" = "0" ] || { echo "destino não está vazio ($tabelas tabelas): recusado" >&2; exit 1; }

age -d -i "$AGE_IDENTITY" "$arquivo" | bash -c "$RESTORE_CMD"
echo "--- conferência (contagens por tabela-chave) ---"
bash -c "$CHECK_CMD" <<< "select 'Usuario', count(*) from \"Usuario\" union all select 'LogAuditoria', count(*) from \"LogAuditoria\" union all select 'Lancamento', count(*) from \"Lancamento\" union all select 'Movimento', count(*) from \"Movimento\";"
echo "restauração concluída: compare as contagens com as da produção e abra o sistema apontando para este banco."
