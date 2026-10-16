#!/usr/bin/env bash
# Backup cifrado do banco (pg_dump | age). Roteiro: docs/PRODUCAO-SEGURA.md §6.
#
# Variáveis:
#   AGE_RECIPIENT   chave PÚBLICA age (age1...) de quem poderá restaurar. A chave privada NÃO fica neste servidor.
#   BACKUP_DIR      pasta de destino (padrão ./backups; fora do git, permissão 700)
#   DUMP_CMD        comando que escreve o dump no stdout. Padrão: pg_dump com BACKUP_DATABASE_URL.
#                   Com Docker: DUMP_CMD='docker exec -i opme-db-prod pg_dump -U opme -d opme --format=custom --no-owner'
#   BACKUP_DATABASE_URL  conexão do pg_dump (papel dono ou leitor total; NÃO o opme_app, que não lê tudo se tiver RLS/colunas restritas)
#   RETENCAO_DIAS   apaga cifrados mais antigos que isto (padrão 30)
#
# Agendamento diário (cron):  15 2 * * *  cd /srv/opme && ./scripts/backup-db.sh >> /var/log/opme-backup.log 2>&1
set -euo pipefail
umask 077

: "${AGE_RECIPIENT:?defina AGE_RECIPIENT (chave pública age1...)}"
command -v age >/dev/null || { echo "age não encontrado (https://age-encryption.org)" >&2; exit 1; }
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-30}"
if [ -z "${DUMP_CMD:-}" ]; then
  : "${BACKUP_DATABASE_URL:?defina BACKUP_DATABASE_URL ou DUMP_CMD}"
  DUMP_CMD='pg_dump --format=custom --no-owner --dbname "$BACKUP_DATABASE_URL"'
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
destino="$BACKUP_DIR/opme-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
parcial="$destino.parcial"
trap 'rm -f "$parcial"' EXIT

# pipefail: se o pg_dump falhar, o script falha e o arquivo parcial é descartado (nunca fica um backup "bom" quebrado)
bash -c "$DUMP_CMD" | age -r "$AGE_RECIPIENT" > "$parcial"
[ -s "$parcial" ] || { echo "backup vazio, abortado" >&2; exit 1; }
mv "$parcial" "$destino"
(cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$destino")" > "$(basename "$destino").sha256")
find "$BACKUP_DIR" -name 'opme-*.dump.age*' -type f -mtime +"$RETENCAO_DIAS" -delete
echo "$(date -u +%FT%TZ) backup ok: $destino ($(wc -c < "$destino") bytes)"
