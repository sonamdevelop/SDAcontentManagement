#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Fresh synthetic database only. Never reset, refresh or drop a database.
suffix="$(python3 -c 'import secrets; print(secrets.token_hex(6))')"
export SDA_ACCEPTANCE_DATABASE="sda_acceptance_$suffix"
container="sda-acceptance-$suffix"
restore="sda_restore_$suffix"
mkdir -p .runtime/acceptance
log=".runtime/acceptance/$suffix.log"
backup=".runtime/acceptance/$suffix.sql.gz"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Do not use IF NOT EXISTS: a collision must fail rather than reusing existing data.
docker compose exec -T db mariadb -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" -e "CREATE DATABASE $SDA_ACCEPTANCE_DATABASE; GRANT ALL ON $SDA_ACCEPTANCE_DATABASE.* TO 'krayin'@'%';"
docker compose run --rm --no-deps -e DB_DATABASE="$SDA_ACCEPTANCE_DATABASE" app php tools/initialize.php >"$log" 2>&1
# Verify the actual selected connection before launching any mutating browser requests.
docker compose run --rm --no-deps -e DB_DATABASE="$SDA_ACCEPTANCE_DATABASE" app php -r 'require "vendor/autoload.php"; $app=require "bootstrap/app.php"; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); if (!preg_match("/^sda_acceptance_[0-9a-f]+$/", Illuminate\Support\Facades\DB::connection()->getDatabaseName())) {exit(1);} echo "Verified isolated acceptance database.\n";'
docker compose run -d --no-deps --name "$container" -p 127.0.0.1:8082:8000 -e DB_DATABASE="$SDA_ACCEPTANCE_DATABASE" -e CACHE_DRIVER=array -e CACHE_STORE=array -e SESSION_DRIVER=array app php artisan serve --host=0.0.0.0 --port=8000 >/dev/null
python3 - <<'PY'
import json,time,urllib.request
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(30):
    try:
        with op.open('http://127.0.0.1:8082/api/v1/properties',timeout=3) as r:
            assert r.status==200 and json.load(r)['data']==[]
        break
    except Exception:
        if attempt==29: raise
        time.sleep(1)
PY
(cd ../web && npx playwright test --config playwright.acceptance.config.ts)
# Exercise backup and restoration of synthetic data without touching development data.
umask 077
docker compose exec -T db mariadb-dump -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" --single-transaction "$SDA_ACCEPTANCE_DATABASE" | gzip > "$backup"
gzip -t "$backup"
docker compose exec -T db mariadb -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" -e "CREATE DATABASE $restore;"
gzip -dc "$backup" | docker compose exec -T db mariadb -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" "$restore"
for table in properties property_deals property_deal_events leads persons property_documents; do
  original="$(docker compose exec -T db mariadb -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" -N -e "SELECT COUNT(*) FROM $SDA_ACCEPTANCE_DATABASE.$table")"
  restored="$(docker compose exec -T db mariadb -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" -N -e "SELECT COUNT(*) FROM $restore.$table")"
  test "$original" = "$restored"
done
docker compose run --rm --no-deps -e DB_DATABASE="$SDA_ACCEPTANCE_DATABASE" app php tools/verify-acceptance-files.php
printf 'Acceptance passed; synthetic backup restored and row counts verified.\nRetained databases: %s, %s\nBackup: %s\n' "$SDA_ACCEPTANCE_DATABASE" "$restore" "$backup"
