#!/usr/bin/env bash
# Retry explicit temporary HTTP failures during dependency resolution only.
# A Gradle/compiler/test/signing failure without this evidence is not retried.
set -euo pipefail
if (( $# == 0 )); then
  echo 'Usage: gradle_retry.sh ./gradlew <task> [options...]' >&2
  exit 2
fi
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
delays=(30 90 180)
for attempt in 1 2 3 4; do
  echo "Gradle attempt $attempt/4"
  set +e
  "$@" 2>&1 | tee "$log"
  codes=("${PIPESTATUS[@]}")
  set -e
  status="${codes[0]}"
  if (( codes[1] != 0 )); then
    echo 'Unable to capture Gradle output.' >&2
    exit 1
  fi
  if (( status == 0 )); then
    exit 0
  fi
  # Require the actual dependency download failure, not a generic 429
  # appearing in a compiler diagnostic, test result or unrelated message.
  if (( attempt == 4 )) || ! grep -Eiq 'Could not (GET|HEAD).*Received status code (429|502|503|504)([^0-9]|$)' "$log"; then
    exit "$status"
  fi
  delay="${delays[attempt-1]}"
  echo "::warning::Temporary dependency repository HTTP failure; retrying in ${delay}s."
  sleep "$delay"
done
