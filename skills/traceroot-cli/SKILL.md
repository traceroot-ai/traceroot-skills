---
name: traceroot-cli
description: >
  Read what TraceRoot has already recorded, from the terminal, with the `traceroot` CLI. Use when
  the user asks what happened in a trace, whether an evaluation regressed, which evaluation runs or
  datasets exist, what a detector found, or anything that means querying spans — and once a repo is
  instrumented, whenever the question turns from "is tracing wired up" to "what do the traces say".
  Also use when the user asks what the TraceRoot CLI can do.
allowed-tools:
  - Bash(traceroot --help)
  - Bash(traceroot status)
  - Bash(traceroot doctor)
  - Bash(traceroot status *)
  - Bash(traceroot workspaces list *)
  - Bash(traceroot projects list *)
  - Bash(traceroot traces list *)
  - Bash(traceroot traces get *)
  - Bash(traceroot sql *)
  - Bash(traceroot evals list *)
  - Bash(traceroot evals runs list *)
  - Bash(traceroot evals runs get *)
  - Bash(traceroot datasets list *)
  - Bash(traceroot datasets get *)
  - Bash(traceroot datasets versions list *)
  - Bash(traceroot datasets versions get *)
  - Bash(traceroot detectors list *)
  - Bash(traceroot detectors get *)
  - Bash(traceroot findings list *)
  - Bash(traceroot findings get *)
  - Bash(traceroot alerts list *)
  - Bash(traceroot alerts get *)
  - Bash(traceroot dashboards list *)
  - Bash(traceroot dashboards get *)
  - Bash(traceroot widgets get *)
  - Bash(traceroot widgets data *)
metadata:
  author: traceroot-ai
  version: "1.0"
compatibility: >
  Needs `traceroot` on PATH (`npm install -g traceroot-cli`). Most of the command set is generated
  from the pinned `@traceroot-ai/tools` version, so `--help` is authoritative for the install in
  front of you.
---

# TraceRoot CLI

Read the TraceRoot platform from the terminal. This is a router: it names the command that answers a
question and leaves the flags to `--help`.

## First, establish context

`traceroot status --json` confirms auth and shows the active project. `--project <id>` is global and
**required with a browser login** — omit it and reads fail as an `auth` error rather than as a
missing flag. `traceroot projects list --json` finds the id.

## The smallest command that answers the question

| Question | Command |
|---|---|
| What happened in this trace? | `traceroot traces get <trace-id> --fields full --json` |
| Which traces are recent, or match a filter? | `traceroot traces list --json` |
| Which evaluations exist? | `traceroot evals list --json` |
| Did that evaluation regress? | `traceroot evals runs list --evaluation-id <id> --json`, then `traceroot evals runs get <run-id> --json` |
| What cases went into a run? | `traceroot datasets get <dataset-id> --json` |
| Did a detector fire? | `traceroot findings list --json` |
| Anything the rows above miss | `traceroot sql "SELECT count() FROM spans" --json` |

`--fields full` is the one flag worth naming here: without it, `traces get` omits span input and
output. For everything else, `traceroot --help` is the map and `<command> --help` is the flags —
read those rather than guessing a flag name.

## Built for agents

- **`--json` is global.** Always pass it; parse the payload instead of scraping the table.
- **Exit codes are stable** — `2` usage, `3` auth, `4` not found, `5` network, `1` internal — and
  under `--json` a failure also prints `{"error":{"code","message"}}` carrying the matching string
  code. Branch on the code, never on the message: `3` means re-auth or pass `--project`, `5` is
  retryable, `4` is final.

## Guardrails

- **This is not a read-only CLI.** Eighteen commands are `create`, `update` or `delete`, and
  `alerts status` writes too; none of them prompts for confirmation. `allowed-tools` above is the
  enforcement and carries reads only — don't look for a way around it. When the user wants
  something created, changed or deleted, name the command and let them run it.
- `traceroot traces export` is deliberately not allowlisted: it writes a directory, and `--force`
  clears a non-empty one.
- Verifying a trace you have just instrumented belongs to `traceroot-instrument-repo` and
  `traceroot-quickstart`. Don't repeat it here.
