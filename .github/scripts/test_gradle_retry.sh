#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
export PATH="$temp:$PATH"
export QA_STATE="$temp/count" QA_SLEEP="$temp/sleep-count"
cat > "$temp/sleep" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$1" >> "$QA_SLEEP"
SH
cat > "$temp/fake-gradle" <<'SH'
#!/usr/bin/env bash
n=0
if [[ -f "$QA_STATE" ]]; then read -r n < "$QA_STATE"; fi
n=$((n+1))
echo "$n" > "$QA_STATE"
case "$1" in
  recover)
    if (( n < 3 )); then
      echo "Could not GET 'https://repo.maven.apache.org/maven2/gson.pom'. Received status code 429 from server: Too Many Requests"
      exit 1
    fi
    ;;
  permanent-http)
    echo "Could not GET 'https://repo.maven.apache.org/maven2/gson.pom'. Received status code 503 from server: Unavailable"
    exit 17
    ;;
  compiler)
    echo 'error: unresolved symbol 429'
    exit 23
    ;;
  *) exit 0 ;;
esac
SH
chmod +x "$temp/sleep" "$temp/fake-gradle"
run_case() {
  rm -f "$QA_STATE" "$QA_SLEEP"
  local status=0
  bash "$here/gradle_retry.sh" "$temp/fake-gradle" "$1" || status=$?
  [[ "$status" == "$2" ]]
  [[ "$(cat "$QA_STATE")" == "$3" ]]
  if [[ -f "$QA_SLEEP" ]]; then
    [[ "$(paste -sd, "$QA_SLEEP")" == "$4" ]]
  else
    [[ -z "$4" ]]
  fi
}
run_case success 0 1 ''
run_case recover 0 3 '30,90'
run_case permanent-http 17 4 '30,90,180'
run_case compiler 23 1 ''
echo 'PASS: immediate success, HTTP 429 recovery, bounded 503 retries, no compiler retry.'
