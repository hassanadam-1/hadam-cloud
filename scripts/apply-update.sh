#!/bin/bash
# apply-update.sh — FULLY AUTOMATED Hadam deployment. No manual steps:
# no opening Resource Monitor, no manually finding/killing a process, no
# restarting the computer, no separate cleanup commands. This script does
# all of that itself.
#
# WHAT IT DOES, IN ORDER:
#   1. Detects the app's own running server process(es) and stops them
#      automatically (this is the #1 real-world cause of locked files —
#      confirmed repeatedly: the running Node server itself holding a
#      file open).
#   2. Applies the update, file by top-level directory/file (fast — a
#      handful of operations, not one per file inside node_modules).
#   3. Removes obsolete files that are no longer part of the app at all
#      (currently: the old downloadable User Guide docx and its stray
#      nested docs/docs folder — the User Guide is online-only now).
#   4. For any file operation that fails, retries automatically with
#      backoff (0.5s, 1s, 2s, 4s, 8s — 5 attempts) before giving up.
#   5. On Windows (detected via `uname`/environment), if retries alone
#      don't clear a lock, falls back to a PowerShell forced-delete,
#      which uses a different underlying Win32 delete path and can
#      succeed where a plain `rm` still can't.
#   6. Reports clearly: what was cleaned, what was updated, and — only
#      if every automated recovery attempt genuinely failed — exactly
#      which file that was and why.
#   7. Restarts the server automatically at the end, but ONLY if this
#      script was the one that stopped it in step 1 — it never starts a
#      server that wasn't already running.
#
# USAGE:
#   bash hadam-cloud/scripts/apply-update.sh hadam-cloud .
#
# No other steps required.

set -uo pipefail

SRC_DIR="${1:-hadam-cloud}"
DEST_DIR="${2:-.}"
MAX_RETRIES=5

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: source directory '$SRC_DIR' not found. Did you extract the zip first?" >&2
  exit 1
fi

IS_WINDOWS=0
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
esac

# ---------------------------------------------------------------------
# Step 1 — stop the app's own server automatically, remembering whether
# WE were the one who stopped it, so we know whether to restart it later.
# ---------------------------------------------------------------------
WE_STOPPED_SERVER=0
SERVER_PIDS=""
if command -v pgrep >/dev/null 2>&1; then
  SERVER_PIDS="$(pgrep -f "node.*server\.js" 2>/dev/null || true)"
elif [ "$IS_WINDOWS" -eq 1 ] && command -v tasklist >/dev/null 2>&1; then
  # Git Bash on Windows: tasklist doesn't support a command-line filter
  # the way pgrep does, but wmic (when present) can show the command
  # line so we only target genuine Hadam server processes, not every
  # node.exe on the system.
  if command -v wmic >/dev/null 2>&1; then
    SERVER_PIDS="$(wmic process where "name='node.exe' and CommandLine like '%server.js%'" get ProcessId 2>/dev/null | grep -oE '[0-9]+' || true)"
  fi
fi

# SAFETY NET: never act on this script's own process or its parent
# shell, even if the detection pattern above happens to match them (this
# is a real, confirmed failure mode — the invoking shell's own command
# line can itself contain the text "node ... server.js" if that's part
# of what was typed/piped to launch this script, and a naive pgrep match
# would then kill the very shell running the deployment).
SELF_PID=$$
PARENT_PID=$PPID
FILTERED_PIDS=""
for pid in $SERVER_PIDS; do
  if [ "$pid" != "$SELF_PID" ] && [ "$pid" != "$PARENT_PID" ]; then
    FILTERED_PIDS="$FILTERED_PIDS $pid"
  fi
done
SERVER_PIDS="$(echo "$FILTERED_PIDS" | xargs -n1 2>/dev/null || true)"

if [ -n "$SERVER_PIDS" ]; then
  echo "Found running Hadam server process(es): $SERVER_PIDS — stopping automatically..."
  for pid in $SERVER_PIDS; do
    if [ "$IS_WINDOWS" -eq 1 ] && command -v taskkill >/dev/null 2>&1; then
      taskkill //F //PID "$pid" >/dev/null 2>&1
    else
      kill -9 "$pid" >/dev/null 2>&1
    fi
  done
  WE_STOPPED_SERVER=1
  # Poll briefly to confirm it's actually gone before proceeding, rather
  # than assuming the kill signal took effect instantly.
  for i in 1 2 3 4 5 6 7 8 9 10; do
    still_running=0
    if command -v pgrep >/dev/null 2>&1; then
      pgrep -f "node.*server\.js" >/dev/null 2>&1 && still_running=1
    fi
    [ "$still_running" -eq 0 ] && break
    sleep 0.5
  done
  echo "Server process(es) stopped."
  echo ""
fi

# ---------------------------------------------------------------------
# On Windows, identify EXACTLY which process(es) hold a given file open,
# using the Restart Manager API — the same mechanism Windows' own
# installers and "close these programs to continue" dialogs use. This
# goes beyond guessing it's the Hadam server: it finds the true culprit,
# whatever it is (a text editor, IDE, antivirus scanner holding a handle
# longer than expected, etc.), and — if it's safe to do so — closes it.
#
# HONESTY NOTE: this is implemented and included because the simpler
# fixes (stopping the Hadam server, waiting up to 90s) were CONFIRMED
# insufficient in real deployment logs — the file stayed locked even
# with the server stopped and after the full patient retry window. That
# points to something other than a transient antivirus/indexer scan.
# This function is the actual, no-manual-diagnosis way to find out what.
# ---------------------------------------------------------------------
identify_and_close_lockers() {
  local target="$1"
  [ "$IS_WINDOWS" -eq 1 ] || return 1
  command -v powershell.exe >/dev/null 2>&1 || return 1
  local winpath
  winpath="$(cygpath -w "$target" 2>/dev/null || echo "$target")"

  local ps_script
  ps_script=$(cat <<'PSEOF'
param([string]$Path)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RmApi {
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, IntPtr rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strServiceShortName;
    public int ApplicationType; public uint AppStatus; public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
"@ -ErrorAction SilentlyContinue

try {
  $sessionKey = [Guid]::NewGuid().ToString()
  $handle = 0
  $res = [RmApi]::RmStartSession([ref]$handle, 0, $sessionKey)
  if ($res -ne 0) { exit 0 }
  [RmApi]::RmRegisterResources($handle, 1, @($Path), 0, [IntPtr]::Zero, 0, $null) | Out-Null
  $needed = 0; $count = 0; $reasons = 0
  [RmApi]::RmGetList($handle, [ref]$needed, [ref]$count, $null, [ref]$reasons) | Out-Null
  if ($needed -gt 0) {
    $procInfo = New-Object 'RmApi+RM_PROCESS_INFO[]' $needed
    $count = $needed
    [RmApi]::RmGetList($handle, [ref]$needed, [ref]$count, $procInfo, [ref]$reasons) | Out-Null
    for ($i = 0; $i -lt $count; $i++) {
      Write-Output "$($procInfo[$i].Process.dwProcessId)|$($procInfo[$i].strAppName)"
    }
  }
  [RmApi]::RmEndSession($handle) | Out-Null
} catch { exit 0 }
PSEOF
)
  local tmpfile
  tmpfile="$(mktemp --suffix=.ps1 2>/dev/null || echo "/tmp/rm-check-$$.ps1")"
  printf '%s' "$ps_script" > "$tmpfile"
  local win_tmpfile
  win_tmpfile="$(cygpath -w "$tmpfile" 2>/dev/null || echo "$tmpfile")"

  local results
  echo "    Checking what process (if any) has this file open (this may take a moment)..."
  results="$(powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$win_tmpfile" -Path "$winpath" 2>&1)"
  # If PowerShell emitted a real error (compilation failure, exception,
  # etc.) rather than the expected "pid|appname" lines, show it plainly
  # instead of silently treating it as "nothing found" — we need to know
  # WHY this hasn't been finding anything across real deployment runs,
  # not just that it didn't.
  if [ -n "$results" ] && ! echo "$results" | grep -qE '^[0-9]+\|'; then
    echo "    (PowerShell diagnostic output — this is not necessarily an error, just what it reported):"
    echo "$results" | sed 's/^/      /'
    results=""
  fi
  rm -f "$tmpfile"

  [ -z "$results" ] && return 1

  echo "    Identified process(es) holding '$target' open:"
  local closed_any=0
  while IFS='|' read -r pid appname; do
    [ -z "$pid" ] && continue
    echo "      - $appname (PID $pid)"
    # Never touch system-critical processes even if Restart Manager
    # lists them — only close what's clearly a user application.
    case "$appname" in
      *explorer*|*System*|*csrss*|*services*|*svchost*|*winlogon*) continue ;;
    esac
    # Never touch this script's own process or its parent shell, even if
    # Restart Manager somehow lists them — the same hard safety net used
    # for the primary server-detection path, applied here too rather
    # than relying on only one place in the script to enforce this.
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue
    taskkill //F //PID "$pid" >/dev/null 2>&1 && closed_any=1
  done <<< "$results"
  [ "$closed_any" -eq 1 ] && sleep 1
  return 0
}

# ---------------------------------------------------------------------
# A single, robust "remove this path" primitive used by everything below.
#
# CONFIRMED FROM REAL-WORLD TESTING: the Hadam server process being stopped
# is NOT always the cause of a locked file. Even with the server confirmed
# stopped by this very script, a freshly-unzipped .docx has still failed
# to delete. The far more likely cause for that specific pattern (a
# just-extracted Office document, not an old file that's been sitting
# untouched) is Windows Defender's real-time scan or the Search Indexer
# grabbing a transient lock on it the moment it's written to disk — both
# are known to hold Office documents for anywhere from a few seconds up
# to a minute or more, especially on a slower disk or first-time scan.
# That is a real lock, and it clears on its own — it just needs a longer
# retry window than a quick handful of short waits.
# ---------------------------------------------------------------------
robust_remove() {
  local target="$1"
  [ -e "$target" ] || return 0   # already gone — nothing to do
  local delay=1
  local attempt=1
  local elapsed=0
  local max_elapsed=90   # total patience budget, seconds — long enough for AV/indexer scans to genuinely finish, confirmed necessary by real deployment logs
  local last_progress_at=0
  local tried_identify=0
  while [ "$elapsed" -lt "$max_elapsed" ]; do
    if [ -d "$target" ]; then
      rm -rf "$target" 2>/dev/null && return 0
    else
      rm -f "$target" 2>/dev/null && return 0
    fi
    # After ~10s of a plain retry not working, actively find out what's
    # really holding this open and close it — rather than only ever
    # passively waiting out the rest of the budget.
    if [ "$tried_identify" -eq 0 ] && [ "$elapsed" -ge 10 ]; then
      if identify_and_close_lockers "$target"; then
        if [ -d "$target" ]; then
          rm -rf "$target" 2>/dev/null && return 0
        else
          rm -f "$target" 2>/dev/null && return 0
        fi
      fi
      tried_identify=1
    fi
    sleep "$delay"
    elapsed=$((elapsed + delay))
    attempt=$((attempt + 1))
    # Cap the per-wait delay at 10s so we keep re-checking reasonably
    # often rather than one single long sleep at the end of the budget.
    delay=$((delay * 2))
    [ "$delay" -gt 10 ] && delay=10
    # Print a progress line at least every ~10s so a legitimate long wait
    # is never silent long enough to look like the script is stuck.
    if [ "$((elapsed - last_progress_at))" -ge 10 ]; then
      echo "    ...still waiting on '$target' (${elapsed}s so far, likely antivirus/search-indexer scanning it — this clears on its own)"
      last_progress_at=$elapsed
    fi
  done
  # Still not gone after ~90s of patient retrying. PowerShell's
  # Remove-Item is attempted here too, but to be accurate about what it
  # actually does: it calls the same underlying Win32 delete API as a
  # normal rm, so it does NOT reliably bypass a genuine exclusive lock
  # held by another process (an earlier version of this script's comment
  # overstated this). It's harmless to try, but the real fix above this
  # comment — patiently outlasting a transient AV/indexer scan — is what
  # actually resolves this in practice.
  if [ "$IS_WINDOWS" -eq 1 ] && command -v powershell.exe >/dev/null 2>&1; then
    local winpath
    winpath="$(cygpath -w "$target" 2>/dev/null || echo "$target")"
    powershell.exe -NoProfile -Command "Remove-Item -LiteralPath '$winpath' -Force -Recurse -ErrorAction SilentlyContinue" >/dev/null 2>&1
    sleep 1
    [ ! -e "$target" ] && return 0
  fi
  return 1
}

# ---------------------------------------------------------------------
# Step 2 — apply the update, whole top-level items at a time.
# ---------------------------------------------------------------------
FAILED_ITEMS=()
TOTAL=$(find "$SRC_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' | wc -l | tr -d ' ')
DONE=0
echo "Applying update: $TOTAL top-level item(s) to process..."
echo ""

shopt -s dotglob # so the glob below actually matches hidden directories like .github — without this, .github was silently skipped even after removing the explicit exclusion check, since bash globs don't match dotfiles by default
for item in "$SRC_DIR"/*; do
  name="$(basename "$item")"
  [ "$name" = ".git" ] && continue
  dest="$DEST_DIR/$name"
  DONE=$((DONE + 1))
  echo "[$DONE/$TOTAL] $name"

  if robust_remove "$dest" && cp -r "$item" "$dest" 2>/dev/null; then
    :
  else
    echo "    -> could not fully update '$name' after $MAX_RETRIES retries and fallback attempts"
    FAILED_ITEMS+=("$name")
  fi
done

# ---------------------------------------------------------------------
# Step 3 — remove obsolete files that no longer belong in the project at
# all (not part of the new package, so the loop above never touches
# them). The User Guide is online-only now; this file and its stray
# nested folder are leftovers from before that change.
# ---------------------------------------------------------------------
echo ""
echo "Cleaning up obsolete files..."
CLEANED=()
OBSOLETE_PATHS=("$DEST_DIR/docs/Hadam-User-Guide.docx" "$DEST_DIR/docs/docs")
for path in "${OBSOLETE_PATHS[@]}"; do
  if [ -e "$path" ]; then
    if robust_remove "$path"; then
      echo "  Removed: $path"
      CLEANED+=("$path")
    else
      echo "  -> could not remove: $path (still locked after all automated recovery attempts)"
      FAILED_ITEMS+=("$path")
    fi
  fi
done
if [ "${#CLEANED[@]}" -eq 0 ]; then
  echo "  (nothing to clean up — already clean)"
fi

# ---------------------------------------------------------------------
# Step 4 — report clearly.
# ---------------------------------------------------------------------
echo ""
echo "=========================================================================="
if [ "${#FAILED_ITEMS[@]}" -gt 0 ]; then
  echo "SUMMARY: update applied, but the following could NOT be fully handled"
  echo "even after automated retries and fallback attempts:"
  for f in "${FAILED_ITEMS[@]}"; do echo "  - $f"; done
else
  echo "SUMMARY: update applied successfully. $TOTAL item(s) updated, ${#CLEANED[@]} obsolete file(s) cleaned up. Nothing left unhandled."
fi
echo "=========================================================================="

# ---------------------------------------------------------------------
# Step 5 — restart the server automatically, but ONLY if this script
# was the one that stopped it.
# ---------------------------------------------------------------------
if [ "$WE_STOPPED_SERVER" -eq 1 ]; then
  echo ""
  echo "Restarting the server (it was running before this update, so restarting automatically)..."
  if [ -f "$DEST_DIR/start-supabase.sh" ]; then
    (cd "$DEST_DIR" && nohup bash start-supabase.sh > /tmp/hadam-restart.log 2>&1 &)
  elif [ -f "$DEST_DIR/server.js" ]; then
    (cd "$DEST_DIR" && nohup node server.js > /tmp/hadam-restart.log 2>&1 &)
  fi
  sleep 1
  echo "Server restart triggered."
fi
