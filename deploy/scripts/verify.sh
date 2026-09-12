#!/bin/bash
set -euo pipefail
repo_root="${SEAX_SOURCE_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$repo_root"
if [[ ! -f backend/gradlew || ! -f backend/build.gradle ]]; then
  echo "Backend Gradle project is not ready; no application can be deployed." >&2
  exit 1
fi
if [[ "$(uname -s)" == Darwin ]]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 26)"
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
fi
test_port="${TEST_DATABASE_PORT:-15432}"
compose=(docker compose -p seax-ci -f deploy/compose.ci.yaml)
cleanup() { "${compose[@]}" stop postgres >&2 || true; }
trap cleanup EXIT
"${compose[@]}" up -d --wait --wait-timeout 90 postgres >&2
export TEST_DATABASE_URL="jdbc:postgresql://127.0.0.1:$test_port/seax"
export TEST_DATABASE_USERNAME=seax
export TEST_DATABASE_PASSWORD=seax-ci-only
unset OPENAI_API_KEY OPENAI_MODEL
cd backend
bash ./gradlew --no-daemon test integrationTest bootJar >&2
# The Dockerfile deliberately accepts one known executable jar, never a plain jar.
shopt -s nullglob
jars=()
for jar in build/libs/*.jar; do
  [[ "$jar" == *-plain.jar || "$jar" == build/libs/application.jar ]] || jars+=("$jar")
done
if [[ ${#jars[@]} -ne 1 ]]; then
  echo "Expected exactly one bootJar, found ${#jars[@]}." >&2
  exit 1
fi
cp "${jars[0]}" build/libs/application.jar
