#!/bin/bash
# DataForge AI — Smoke Test Script
# Usage: bash scripts/smoke-test.sh [API_BASE_URL]
# Default API_BASE_URL: http://localhost:4000/api

set -euo pipefail

API="${1:-http://localhost:4000/api}"
WALLET="0x1111111111111111111111111111111111111111111111111111111111111111"
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
echo "🔍 DataForge AI Smoke Test"
echo "   API: $API"
echo "   $(date)"
echo ""

# 1. Health
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" "$API/health")
check "GET /health" "200" "$RESP" "$(cat /tmp/smoke_body.txt)"

# 2. Metrics
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" "$API/metrics")
check "GET /metrics" "200" "$RESP" "$(cat /tmp/smoke_body.txt)"

# 3. Auth — valid wallet
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"walletAddress\":\"$WALLET\"}" \
  "$API/auth/wallet")
check "POST /auth/wallet (valid)" "200" "$RESP" "$(cat /tmp/smoke_body.txt)"

# Extract token
TOKEN=$(cat /tmp/smoke_body.txt | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

# 4. Auth — invalid wallet (too short)
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x123"}' \
  "$API/auth/wallet")
check "POST /auth/wallet (invalid short wallet)" "400" "$RESP" "$(cat /tmp/smoke_body.txt)"

# 5. Dataset list
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" "$API/datasets")
check "GET /datasets" "200" "$RESP" "$(cat /tmp/smoke_body.txt)"

# 6. Search
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" "$API/search?q=dataset")
check "GET /search?q=dataset" "200" "$RESP" "$(cat /tmp/smoke_body.txt)"

# 7. Unauthenticated access to protected endpoint
RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"test","type":"tabular"}' \
  "$API/datasets")
check "POST /datasets (no auth)" "401" "$RESP" "$(cat /tmp/smoke_body.txt)"

# 8. Path traversal
if [ -n "$TOKEN" ]; then
  DATASETS=$(curl -s "$API/datasets")
  DATASET_ID=$(echo "$DATASETS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
  if [ -n "$DATASET_ID" ]; then
    VER=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"version":"smoke-test-1.0","changelog":"smoke"}' \
      "$API/datasets/$DATASET_ID/versions" 2>/dev/null)
    VER_ID=$(echo "$VER" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -n "$VER_ID" ]; then
      printf "test" > /tmp/smoke_test.csv
      RESP=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -F "file=@/tmp/smoke_test.csv" \
        -F "path=../../etc/passwd.csv" \
        "$API/versions/$VER_ID/files/upload")
      check "Upload path traversal (expect 400)" "400" "$RESP" "$(cat /tmp/smoke_body.txt)"
    fi
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
