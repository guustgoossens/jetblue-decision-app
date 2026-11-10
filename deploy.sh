#!/usr/bin/env bash
# CLI route. Requires: databricks CLI >= 0.250 (brew install databricks) and a logged-in profile (run `databricks auth login` yourself).
set -euo pipefail
PROFILE="${PROFILE:-DEFAULT}"
APP="jetblue-decision-team12"
ME="$(databricks current-user me -p "$PROFILE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["userName"])')"
DEST="/Workspace/Users/$ME/$APP"
cd "$(dirname "$0")/app"
[ -f static/index.html ] || { echo "static/index.html missing"; exit 1; }
databricks apps get "$APP" -p "$PROFILE" >/dev/null 2>&1 || databricks apps create "$APP" -p "$PROFILE"   # waits until compute ACTIVE
databricks sync . "$DEST" --full -p "$PROFILE" --exclude '.venv*' --exclude '__pycache__'   # no .gitignore: sync honours it, so uploads static/ (build output is often gitignored!)
databricks apps deploy "$APP" --source-code-path "$DEST" -p "$PROFILE"
# let all account users open it (= UI Share, "Anyone in my organization can use"):
databricks apps update-permissions "$APP" -p "$PROFILE" --json '{"access_control_list":[{"group_name":"users","permission_level":"CAN_USE"}]}' >/dev/null
databricks apps get "$APP" -p "$PROFILE" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("url"))'
