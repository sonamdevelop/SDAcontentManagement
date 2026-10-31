#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
p=Path('.env')
if not p.exists():
    values={'APP_URL':'http://127.0.0.1:8081','APP_CURRENCY':'INR','DB_HOST':'db','DB_DATABASE':'krayin','DB_USERNAME':'krayin','DB_PASSWORD':'local_dev_only','MAIL_MAILER':'log'}
    lines=Path('.env.example').read_text().splitlines()
    p.write_text('\n'.join(k+'='+values[k] if (k:=line.split('=',1)[0]) in values else line for line in lines)+'\nDEBUGBAR_ENABLED=false\n')
    p.chmod(0o600)
PY
python3 tools/cache-composer-archives.py
docker compose up -d --wait db
docker compose run --rm --no-deps -e COMPOSER_DISABLE_NETWORK=1 app composer install --prefer-dist --no-interaction --no-progress
docker compose run --rm --no-deps app php tools/initialize.php
bash tools/start.sh
