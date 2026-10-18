#!/usr/bin/env bash
# Only fictional data; never accepts a host data directory or household volume.
set -euo pipefail
image=${1:?image required}
platform=${2:?platform required}
case "$platform" in linux/amd64|linux/arm64) ;; *) exit 2 ;; esac
root=$(mktemp -d)
name="calendar-image-test-$(date +%s)-$$"
cid=""
cleanup() {
  if [ -n "$cid" ]; then docker rm -f "$cid" >/dev/null; fi
  # root is the exact fresh mktemp directory created above, never caller supplied.
  sudo rm -rf -- "$root"
}
trap cleanup EXIT
node test/fixtures/recovery-data.ts "$root/data"
chmod 755 "$root"
sudo chown -R 1000:1000 "$root/data"
cid=$(docker run -d --name "$name" --platform "$platform" --network none --init \
  --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 384m --pids-limit 128 --tmpfs /tmp \
  -e GOOGLE_SYNC_ENABLED=false -e DATA_DIR=/app/data -e CALENDAR_IMAGE_TEST=1 \
  --mount "type=bind,src=$root/data,dst=/app/data" \
  --mount "type=bind,src=$PWD/scripts/recovery-smoke.mjs,dst=/checks.mjs,readonly" \
  --mount "type=bind,src=$PWD/scripts/image-test-server.mjs,dst=/test-server.mjs,readonly" \
  "$image" node /test-server.mjs)
ready() {
  for attempt in {1..90}; do
    if [ "$(docker inspect --format '{{.State.Health.Status}}' "$cid")" = healthy ]; then return 0; fi
    sleep 1
  done
  echo "Disposable image did not become healthy" >&2
  return 1
}
ready
docker exec "$cid" node /checks.mjs
docker exec -e "EXPECTED_VERSION=$(node -p 'require("./package.json").version')" "$cid" node --input-type=module -e \
  'import {readFileSync} from "node:fs"; if(JSON.parse(readFileSync("package.json")).version !== process.env.EXPECTED_VERSION) process.exit(1);'
# More than ten seconds of initial uptime arms Docker restart monitoring.
sleep 12
docker exec "$cid" node --input-type=module -e \
  'import {writeFileSync} from "node:fs"; writeFileSync("/app/data/request-test-exit", "fixture-only");'
for attempt in {1..90}; do
  if [ "$(docker inspect --format '{{.RestartCount}}' "$cid")" = 1 ]; then break; fi
  sleep 1
done
test "$(docker inspect --format '{{.RestartCount}}' "$cid")" = 1
ready
docker exec "$cid" node /checks.mjs
docker exec "$cid" node --input-type=module -e \
  'import {DatabaseSync} from "node:sqlite"; for(const name of ["calendar","admin","google"]){const db=new DatabaseSync(`/app/data/${name}.sqlite`,{readOnly:true});if(db.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")process.exit(1);db.close();}'
test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" = none
test "$(docker inspect --format '{{.State.OOMKilled}}' "$cid")" = false
echo "Image startup, isolated automatic restart and fixture persistence passed: $platform"
