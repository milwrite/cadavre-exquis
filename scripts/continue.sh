#!/usr/bin/env bash
# Scheduled "continue the project" runner. Invoked by cron. Launches headless
# Claude Code against CONTINUE.md to advance the project by one verified step,
# then commit. Guarded by flock (no overlap with a long training run) and a
# timeout (a run finishes a step or backgrounds a long job and exits).
#
# Remove from schedule:  crontab -e   (delete the exquisite-corpse line)
# Watch it:              tail -f /home/milwrite/inference-arcade/exquisite-corpse/logs/cron.log
#
# SECURITY (acknowledged, user-authorized 2026-07-08): this launches an
# unattended agent with `--permission-mode bypassPermissions` — no per-action
# approval, runs as your user with network access. Accepted because the work
# (pip install, launch training, git commit) needs arbitrary Bash, and blast
# radius is bounded: no git remote (no push/exfil), flock + timeout guards,
# CONTINUE.md forbids deleting data / adding copyright-restricted scrapers.
# To harden: wrap the `claude` call in bubblewrap/firejail with a read-only
# rootfs + no-network except pypi/HF, or run under a dedicated unprivileged
# user with no ssh keys. See docs/superpowers/specs for rationale.
set -uo pipefail

PROJ="/home/milwrite/inference-arcade/exquisite-corpse"
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

# Pre-flight: the regression suite (tests/, stdlib-only, ~0.1s) guards the
# pipeline's silent transforms. Red suite -> yesterday's commit broke something;
# today's step becomes fixing it, not building on top of it.
if .venv/bin/python -m unittest discover -s tests >> logs/cron.log 2>&1; then
  echo "$(date -Is) pre-flight tests OK" >> logs/cron.log
  PROMPT='Read CONTINUE.md and PROGRESS.md in this repository, then advance the project by exactly ONE verified step following that runbook. Prefer the first unchecked box in PROGRESS.md. Long jobs (installing training deps, training) must be started in the background so you can exit promptly. When done, update PROGRESS.md and commit with a descriptive message. Do not restart from scratch, do not delete data/, do not add scrapers for copyright-restricted sites.'
else
  echo "$(date -Is) pre-flight tests FAILED -> repair mode" >> logs/cron.log
  PROMPT='The regression suite is FAILING: .venv/bin/python -m unittest discover -s tests. Read CONTINUE.md and PROGRESS.md, then make this run'\''s ONE step diagnosing and fixing that failure (root cause, not test deletion or assertion loosening — the tests encode load-bearing pipeline invariants; see PROGRESS.md "Tests"). Verify the suite is green, note the cause in PROGRESS.md, and commit. Do not restart from scratch, do not delete data/, do not add scrapers for copyright-restricted sites.'
fi

# 45-minute ceiling: enough to complete a step or kick off a background job.
timeout 45m claude -p "$PROMPT" \
  --permission-mode bypassPermissions \
  --add-dir "$PROJ" \
  >> logs/cron.log 2>&1
code=$?

# Post-run: record whether today's step left the tree green. Can't un-commit
# from here, but a FAILED line makes the regression loud in the log, and the
# next run's pre-flight will enter repair mode.
if .venv/bin/python -m unittest discover -s tests >> logs/cron.log 2>&1; then
  echo "$(date -Is) post-run tests OK" >> logs/cron.log
else
  echo "$(date -Is) post-run tests FAILED — next run will enter repair mode" >> logs/cron.log
fi

echo "===== $(date -Is) continue run end (exit $code) =====" >> logs/cron.log
exit 0
