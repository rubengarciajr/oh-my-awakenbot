#!/usr/bin/env bash
# Ephemeral Linux-runner smoke: native window, bundled bridge and 20-second survival.
set -euo pipefail

if [ -z "${AWAKEN_SMOKE_XVFB:-}" ]; then
  AWAKEN_SMOKE_XVFB=1 exec timeout 110 xvfb-run -a -s '-screen 0 1280x800x24' bash "$0" "$1"
fi

image_path=$(realpath "${1:?AppImage required}")
smoke_dir=$(mktemp -d)
app_pid=''
cleanup() {
  if [ -n "$app_pid" ]; then
    kill -TERM -- "-$app_pid" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-$app_pid" 2>/dev/null || true
  fi
  rm -rf "$smoke_dir"
}
trap cleanup EXIT

chmod +x "$image_path"
(cd "$smoke_dir" && "$image_path" --appimage-extract > /dev/null)
image_root="$smoke_dir/squashfs-root"
bridge_script=$(find "$image_root" -path '*/bridge/omher_bridge.py' -type f -print -quit)
test -n "$bridge_script"
python -m venv --system-site-packages "$smoke_dir/python"
mkdir -p "$smoke_dir/hermes"

(cd "$image_root" && exec env APPIMAGE="$image_path" APPDIR="$image_root" \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  OMHER_HERMES_PYTHON="$smoke_dir/python/bin/python" HERMES_HOME="$smoke_dir/hermes" \
  setsid ./AppRun > "$smoke_dir/app.out" 2> "$smoke_dir/app.err") &
app_pid=$!
window_id=''
bridge_seen=''
for tick in $(seq 1 45); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    tail -n 80 "$smoke_dir/app.err"
    exit 1
  fi
  window_id=$(xdotool search --onlyvisible --name '^Awaken Bot$' 2>/dev/null | head -1 || true)
  # Match this extraction's script only, without logging the bridge's command-line token.
  if pgrep -f "$bridge_script" > /dev/null; then bridge_seen=yes; fi
  if [ "$tick" -ge 20 ] && [ -n "$window_id" ] && [ "$bridge_seen" = yes ]; then
    echo 'PASS: Awaken Bot stayed alive, showed its window and started its bundled bridge.'
    exit 0
  fi
  sleep 1
done
tail -n 80 "$smoke_dir/app.err"
echo 'FAIL: window or bundled bridge not observed.'
exit 1
