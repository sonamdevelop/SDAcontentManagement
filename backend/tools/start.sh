#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --wait
python3 - <<'PY'
import json,time,urllib.request
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(30):
    try:
        with opener.open('http://127.0.0.1:8081/api/v1/properties',timeout=5) as response:
            assert response.status==200 and isinstance(json.load(response)['data'],list)
        print('API readiness: HTTP 200 with property collection.')
        break
    except Exception:
        if attempt==29: raise
        time.sleep(1)
PY
