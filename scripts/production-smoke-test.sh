#!/bin/bash
# DataForge AI — Production Smoke Test Script
# Usage: bash scripts/production-smoke-test.sh [API_BASE_URL] [FRONTEND_BASE_URL]

set -euo pipefail

API="${1:-http://localhost:4000/api}"
FRONTEND="${2:-https://dataforge-web.vercel.app}"
WALLET="0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expected_code="$2"
  local actual_code="$3"
  local body="$4"

  if [ "$actual_code" = "$expected_code" ]; then
    echo "  ✅ PASS: $name (HTTP $actual_code)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL: $name (expected HTTP $expected_code, got $actual_code)"
    echo "     Body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "🔍 DataForge AI Production Smoke Test"
echo "   API Base:      $API"
echo "   Frontend Base: $FRONTEND"
echo "   $(date)"
echo ""

# 1. Health
RESP=$(curl -s -o /tmp/prod_smoke_body.txt -w "%{http_code}" "$API/health")
check "1. GET /health" "200" "$RESP" "$(cat /tmp/prod_smoke_body.txt)"

# 2. Auth — cryptographic nonce challenge handshake
echo "Running cryptographic login..."
if command -v node >/dev/null 2>&1; then
  TOKEN=$(node "$(dirname "$0")/smoke-login.js" "$API" 2>/tmp/prod_smoke_login_err.txt)
else
  TOKEN=$(docker exec -i dataforge_api node -e "$(cat "$(dirname "$0")/smoke-login.js")" "http://localhost:4000/api" 2>/tmp/prod_smoke_login_err.txt)
fi
if [ -n "$TOKEN" ]; then
  echo "  ✅ PASS: 2. Cryptographic Auth login successful"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: 2. Cryptographic Auth login failed"
  cat /tmp/prod_smoke_login_err.txt
  FAIL=$((FAIL + 1))
  exit 1
fi

# 3. Dataset list
RESP=$(curl -s -o /tmp/prod_smoke_datasets.txt -w "%{http_code}" "$API/datasets")
check "3. GET /datasets" "200" "$RESP" "$(cat /tmp/prod_smoke_datasets.txt)"

# 4. Search
RESP=$(curl -s -o /tmp/prod_smoke_search.txt -w "%{http_code}" "$API/search?q=crypto")
check "4. GET /search?q=crypto" "200" "$RESP" "$(cat /tmp/prod_smoke_search.txt)"

# 5. Create Dataset
TIMESTAMP=$(date +%s)
DATASET_SLUG="smoke-dataset-$TIMESTAMP"
RESP=$(curl -s -o /tmp/prod_smoke_create_ds.txt -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Test Dataset $TIMESTAMP\",\"slug\":\"$DATASET_SLUG\",\"description\":\"Smoke test dataset description\",\"type\":\"tabular\",\"tags\":[\"smoke\",\"test\"],\"license\":\"MIT\",\"visibility\":\"public\"}" \
  "$API/datasets")
check "5. Create Dataset" "201" "$RESP" "$(cat /tmp/prod_smoke_create_ds.txt)"
DATASET_ID=$(cat /tmp/prod_smoke_create_ds.txt | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

# 6. Create Version
RESP=$(curl -s -o /tmp/prod_smoke_create_ver.txt -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"v1.0.0\",\"changelog\":\"Initial smoke release\"}" \
  "$API/datasets/$DATASET_ID/versions")
check "6. Create Version" "201" "$RESP" "$(cat /tmp/prod_smoke_create_ver.txt)"
VERSION_ID=$(cat /tmp/prod_smoke_create_ver.txt | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

# 7. Upload CSV
printf "header1,header2\nvalue1,value2" > /tmp/prod_smoke_file.csv
RESP=$(curl -s -o /tmp/prod_smoke_upload.txt -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/prod_smoke_file.csv" \
  -F "path=data.csv" \
  "$API/versions/$VERSION_ID/files/upload")
check "7. Upload File" "201" "$RESP" "$(cat /tmp/prod_smoke_upload.txt)"

# 8. Publish version
RESP=$(curl -s -o /tmp/prod_smoke_publish.txt -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$API/versions/$VERSION_ID/publish")
check "8. Publish Version" "201" "$RESP" "$(cat /tmp/prod_smoke_publish.txt)"

# 9. Poll status until ready
echo "   Polling version status until ready..."
STATUS="pending"
COUNTER=0
MAX_POLLS=15
while [ "$STATUS" != "ready" ] && [ "$STATUS" != "failed" ] && [ "$COUNTER" -lt "$MAX_POLLS" ]; do
  sleep 1
  RESP_BODY=$(curl -s "$API/versions/$VERSION_ID/status")
  STATUS=$(echo "$RESP_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  COUNTER=$((COUNTER + 1))
  echo "     - Poll $COUNTER: status = $STATUS"
done
if [ "$STATUS" = "ready" ]; then
  echo "  ✅ PASS: 9. Poll status (Version is ready)"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: 9. Poll status (Version failed to become ready, status: $STATUS)"
  FAIL=$((FAIL + 1))
fi

# 10. Verify manifest generated
RESP=$(curl -s -o /tmp/prod_smoke_version_detail.txt -w "%{http_code}" "$API/versions/$VERSION_ID")
check "10. Get Version Detail" "200" "$RESP" "$(cat /tmp/prod_smoke_version_detail.txt)"
MANIFEST_BLOB=$(cat /tmp/prod_smoke_version_detail.txt | python3 -c "import sys,json; print(json.load(sys.stdin).get('manifestShelbyBlobName',''))" 2>/dev/null || echo "")
if [ -n "$MANIFEST_BLOB" ]; then
  echo "  ✅ PASS: 10. manifest.json registered on Shelby (Blob: $MANIFEST_BLOB)"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: 10. manifestShelbyBlobName not found in version details"
  FAIL=$((FAIL + 1))
fi

# 11. Download file
RESP=$(curl -s -o /tmp/prod_smoke_files_list.txt -w "%{http_code}" "$API/versions/$VERSION_ID/files")
check "11. Get Files List" "200" "$RESP" "$(cat /tmp/prod_smoke_files_list.txt)"
FILE_ID=$(cat /tmp/prod_smoke_files_list.txt | python3 -c "import sys,json; print(next((f['id'] for f in json.load(sys.stdin) if f['path'] == 'data.csv'), ''))" 2>/dev/null || echo "")
if [ -n "$FILE_ID" ]; then
  RESP=$(curl -s -o /tmp/prod_smoke_download.txt -w "%{http_code}" "$API/files/$FILE_ID/download")
  check "11. Download File" "200" "$RESP" "$(cat /tmp/prod_smoke_download.txt)"
else
  echo "  ❌ FAIL: 11. Download File (Could not find file ID for data.csv)"
  FAIL=$((FAIL + 1))
fi

# 12. Verify frontend returns 200
RESP=$(curl -s -o /tmp/prod_smoke_frontend.txt -w "%{http_code}" "$FRONTEND")
check "12. Frontend Home Page" "200" "$RESP" "Frontend home page request"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
