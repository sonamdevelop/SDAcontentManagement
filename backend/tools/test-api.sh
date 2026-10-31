#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The test database is distinct from the development database.
docker compose exec -T db mariadb -uroot -p"${DB_ROOT_PASSWORD:-local_root_only}" -e "CREATE DATABASE IF NOT EXISTS krayin_test; GRANT ALL PRIVILEGES ON krayin_test.* TO 'krayin'@'%';"
docker compose exec -T -e DB_DATABASE=krayin_test app php tools/initialize.php
docker compose exec -T -e DB_DATABASE=krayin_test app php artisan test --compact --cache-directory=/app/.runtime/phpunit tests/Unit/PropertyDomainTest.php tests/Unit/LeadFollowUpStateTest.php tests/Unit/SiteVisitStateTest.php tests/Unit/ReportPeriodTest.php tests/Unit/DocumentFilePolicyTest.php tests/Unit/PropertyDealStateTest.php tests/Unit/ApiOriginsTest.php tests/Feature/PropertyApi tests/Feature/AuthenticationTest.php tests/Feature/Leads/LeadPartialUpdateTest.php tests/Feature/Security/AuthenticationHardeningTest.php tests/Feature/Notifications
