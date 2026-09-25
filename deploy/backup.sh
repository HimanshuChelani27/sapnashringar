#!/bin/sh
# Nightly backup. Cron: 30 2 * * * /opt/sapna/deploy/backup.sh
set -e
DATA=/var/lib/sapna
OUT=/var/backups/sapna
DAY=$(date +%F)
mkdir -p "$OUT"
sqlite3 "$DATA/garba.db" ".backup '$OUT/garba-$DAY.db'"
tar czf "$OUT/files-$DAY.tgz" -C "$DATA" photos payments
find "$OUT" -type f -mtime +30 -delete
# Copy offsite too (a backup on the same server doesn't survive losing the server), e.g.:
# rclone copy "$OUT" gdrive:sapna-backups
