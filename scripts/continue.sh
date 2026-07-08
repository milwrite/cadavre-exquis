#!/usr/bin/env bash
# Scheduled "continue the project" runner. Invoked by cron. Launches headless
# Claude Code against CONTINUE.md to advance the project by one verified step,
# then commit. Guarded by flock (no overlap with a long training run) and a
# timeout (a run finishes a step or backgrounds a long job and exits).
#
# Remove from schedule:  crontab -e   (delete the exquisite-corpse line)
# Watch it:              tail -f /home/milwrite/exquisite-corpse/logs/cron.log
set -uo pipefail

PROJ="/home/milwrite/exquisite-corpse"
cd "$PROJ" || exit 1
mkdir -p logs
export PATH="/home/milwrite/.local/bin:$PATH"

# one run at a time — training can span hours
exec 9>logs/.cron.lock
if ! flock -n 9; then
  echo "$(date -Is) skip: previous run still active" >> logs/cron.log
  exit 0
fi

echo "===== $(date -Is) continue run start =====" >> logs/cron.log

PROMPT='Read CONTINUE.md and PROGRESS.md in this repository, then advance the project by exactly ONE verified step following that runbook. Prefer the first unchecked box in PROGRESS.md. Long jobs (installing training deps, training) must be started in the background so you can exit promptly. When done, update PROGRESS.md and commit with a descriptive message. Do not restart from scratch, do not delete data/, do not add scrapers for copyright-restricted sites.'

# 45-minute ceiling: enough to complete a step or kick off a background job.
timeout 45m claude -p "$PROMPT" \
  --permission-mode bypassPermissions \
  --add-dir "$PROJ" \
  >> logs/cron.log 2>&1
code=$?

echo "===== $(date -Is) continue run end (exit $code) =====" >> logs/cron.log
exit 0
