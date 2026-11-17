---
name: traceroot-eval
description: >
  Write and run offline evaluations with the TraceRoot SDK. Use when the user wants to evaluate
  an LLM app or agent, add evals or scorers, build an eval dataset or test cases, grade outputs
  with an LLM judge, check for regressions between prompt/model versions, or "add evals to my
  project" — for Python or TypeScript/Node.js. Covers datasets, scorers, LLM judges, running an
  evaluation locally with `traceroot evals run`, checking a change against an earlier run, and
  reading metric-first results on the TraceRoot platform.
allowed-tools:
  - Bash(traceroot status)
metadata:
  author: traceroot-ai
  version: "1.0"
compatibility: >
  Python uses the `traceroot` package (pip); TypeScript/Node.js uses `@traceroot-ai/traceroot`
  and `tsx` (npm). Runs go through the TraceRoot CLI (`npm install -g traceroot-cli`): local with
  no TraceRoot key by default, and `--upload` needs a project API key.
---

# TraceRoot Eval

Author an offline evaluation: a **dataset** of cases, a **task** that runs the system under test,
and **scorers** that grade each output. `traceroot evals run <file>` runs the task over every case
and scores each result on this machine; with `--upload` it also reports the run to the TraceRoot
platform.

Evaluation here is **trace-native**: every case runs as its own trace, with an
`evaluation-item → task → scorer` span tree. An eval is a trace you can drill into, so a failing
case is debuggable, not just a number.

## Rules (read first)

- **Start at the bottom of the scorer ladder.** A scorer is an ordinary function. Reach for
  `Scorer.code` / `Scorer.llm_judge` only when you need what they add.
- **Prefer returning a `Score` object.** A bare `bool`/number is valid and is the on-ramp, but a
  `Score` carries an explicit metric name and a per-case comment, which is what makes results
  readable on the platform. Optional — but prefer it.
- **Never invent a headline metric.** There is no `main_score` / `primary_metric` / run-level
  pass-rate. Results are metric-first: every scorer's metric and its mean. Pass/fail is
  **per-score** — a boolean score is its own verdict; a numeric one needs its scorer's `threshold`.
- **Never hand-write a dataset push.** Pass a local `Dataset` to the evaluation and an uploaded
  run provisions it for you. No `ensure_synced()`, no manual `push()` step before the run.
- **Don't invent cases.** Ask the user for real inputs, or derive them from real traces/fixtures
  in the repo. A dataset of made-up queries measures nothing.
- **Never hardcode secrets.** `TRACEROOT_API_KEY` comes from the environment.

## Before writing code

Turn the workflow below into a checklist (TodoWrite) and execute it in order.

## Workflow

### 1. Precondition — credentials
- **A local run needs no TraceRoot key.** `traceroot evals run` keeps the run on this machine: the
  runner gets no API key, and nothing goes to TraceRoot.
- **`--upload` needs a project API key.** A browser login can't upload eval runs. Don't check
  `traceroot status` for the key first: while a browser login is active, it shows that login and
  not the key. When the user asks for an upload, run with `--upload`. A missing or rejected key
  exits `3` before any case runs, so the attempt costs nothing; then ask the user to run
  `traceroot login --api-key <key>` or set `TRACEROOT_API_KEY` (TraceRoot UI → project settings).
- **A task or judge that calls a model needs that provider's key, local or uploaded.** A task
  and scorers that call no model need none. `Scorer.llm_judge` calls the provider directly — an
  `anthropic`/`claude` model needs the `anthropic` package and `ANTHROPIC_API_KEY`; anything else
  goes to `openai` and needs `OPENAI_API_KEY`. A missing provider key fails at scorer time,
  part-way through a run that already cost money. Check it before you run, not after.

### 2. Analyze (read-only — do not edit yet)
- Detect the runtime (Python or TypeScript/Node.js).
- Find the **task**: the function that takes one input and returns the output to grade (an agent
  entrypoint, a chat handler, a RAG `answer()`). One case in → one output out.
- Find **real inputs** for cases: fixtures, test data, logged queries, or traces in the TraceRoot
  UI. If none exist, ask the user — do not fabricate a dataset.
- Each distinct quality question is one scorer.

### 3. Confirm scope (only if ambiguous)
If the task function and the quality criteria are clear, proceed. If several entrypoints could be
the system under test, state your plan in one line and ask before editing.

### 4. Author the dataset
One `Dataset(name)` with the cases. The dataset's **name is its identity** — re-running the same
name updates the same dataset with a new version rather than forking.

One consequence to plan for now: **the case `input` shape is part of the case's identity.** Ids
derive from input content, so changing the shape later rewrites every case id. If a scorer needs
more than the raw user input (the expected cities, a fixture id), put it in the input as a dict
from the start and have the task unwrap it.

An uploaded run publishes the dataset for you and **never prompts** — it auto-approves the version
so a run is never blocked waiting on `[y/N]`. Only an explicit `Dataset.push(...)` confirms first.

See `references/datasets.md`.

### 5. Write scorers — climb the ladder only as far as you need
1. **Plain function** — returns a bool or number. **A bool is already its own pass/fail verdict**,
   so a yes/no check needs nothing more than this.
2. **`Scorer.code(...)`** — adds declared policy (`value_type` / `direction` / `threshold`) and a
   stable cross-language `key`. Climb here when the score is **numeric** and you want a pass/fail
   verdict on it — a number only becomes a verdict against a declared `threshold`.
3. **`Scorer.llm_judge(...)` / `Scorer.llmJudge(...)`** — grading that needs a model. Static
   (declarative config only, no function body) or dynamic (a builder returning template variables
   per case).

**The pass/fail rule, once:** a boolean score *is* its verdict. A numeric score passes only if it
clears its scorer's declared `threshold` in the declared `direction`. No threshold on a numeric
score means no verdict — a mean and a count, nothing more. So returning `True`/`False` from a plain
function is a complete rung-1 scorer; returning `1.0`/`0.0` and expecting a pass-rate is the mistake.

Full ladder with working code for both runtimes: `references/scorers.md`.

### 6. Run
Define the evaluation **at module level** — `evaluation = Evaluation(...)` in Python,
`export const evaluation = new Evaluation({...})` in TypeScript — and run the file with
`traceroot evals run <file>`. Nothing in the file calls `evaluate()` at import.
- Python → `references/python-eval.md`
- TypeScript/Node.js → `references/ts-eval.md` (the runner needs `tsx`)

### 7. Verify (required — do not stop early)
If anything real is still missing — a provider key the task or a judge needs, the task function,
real cases — stop and say exactly what you need. Hand over the file and name the blocker. Never
fabricate a result, and never invent cases just to make the run go.

Otherwise run it and read what it prints: the run id and each metric's mean. What you're checking:
- Every scorer you wrote appears as a metric. A scorer that errored on every case reports no
  metric at all — that is a bug in the scorer, not a zero score.
- Check for `errored` cases you didn't expect. **`not_scored` is not a failure and does not mean
  "no score was emitted"** — status has two values, and `not_scored` is simply *not `errored`*, so
  every clean case carries it.
- Report the run id. It is the baseline for the next run.

## Check a change for a regression

1. Run the evaluation once and keep the run id it prints.
2. Change the code.
3. Run it again against that run: `traceroot evals run <file> --baseline <run id>`. With `--json`,
   stdout is one document whenever the evaluation ran. Its `outcome` is `ok`, `regressed`,
   `not_comparable`, `not_uploaded`, `interrupted` or `failed`, and its `failure` is null unless
   the runner failed after some evaluations finished; then it holds the failure's `kind` and
   `message`.
4. Act on the exit code:

| Exit | Meaning | Do |
|---|---|---|
| `0` | Nothing newly fails or newly errors. A pair that stopped passing under a new version of its scorer is named (under `changed` in `--json`), but isn't a regression | Report the run id, and any pair named under a new scorer version. |
| `18` | A case newly fails or newly errors; the output names each case and scorer | Fix the code, or report the cases if the change was meant to move them. Don't weaken a scorer or move the baseline to get a `0`. |
| `17` | The harness failed: no module-level evaluation, no `tsx`, an SDK too old, or a `fatal` from the runner. Evaluations that finished before it are still compared, and a regression among them exits `18` | Apply the fix the message names. If an evaluation finished first, `--json` prints no envelope: the same message is the document's `failure.message` on stdout. It says nothing about the code under test. |
| `2`, `4` | The baseline can't be used: not comparable (the dataset or its cases changed, a case repeats a score name, or it was sampled or unfinished) or not found. Under `--upload`, either can instead be the API key check's HTTP status (a 404 exits `4`), and then nothing ran | The message says why. Keep the cases fixed across both runs and each case's score names distinct, or run without `--baseline` to start a new one. A failed key check isn't about the baseline: report its message. |
| `3` | `--upload` has no project API key, or it was rejected | Ask the user to run `traceroot login --api-key <key>` or set `TRACEROOT_API_KEY`. |

Only a score with a verdict can regress: a bool, or a number whose scorer declares a `threshold`.
A numeric score with no threshold is reported as changed, never as a regression.

**Runs stay on this machine.** Never add `--upload`, `--host`, `--auth-host`, `--env-file` or
`--api-key` unless the user asked for it, and run only an evaluation file you wrote or the user
named. An uploaded run prints the command that opens it on TraceRoot.

## Common mistakes

| Mistake | Fix |
|---|---|
| Picking a "primary" metric to report | Report every metric. There is no headline score. |
| `main_score=` / `primary_metric=` | Removed. Not a parameter. |
| Pushing the dataset before running | An uploaded run provisions the `Dataset` you pass it. |
| Calling `evaluate()` in the eval file | `traceroot evals run` collects module-level `Evaluation` objects (exported, in TypeScript). With none it exits `17`. |
| Treating `not_scored` as a failure | It just means *not errored* — every clean case is `not_scored`. |
| A new `Dataset` name per run | Reuse the name; edits become new versions of one dataset. |
| Wrapping every scorer in `Scorer.code` | A plain function is the default. Wrap only for policy. |
| Two scorers sharing a **scorer** name | `evaluate()` rejects it before any case runs. Give each a distinct `name` — a distinct `key` does not clear it. |
| Two scorers emitting the same `Score.name` | **Not** caught — the metric silently goes non-directional. Keep emitted names distinct yourself. |
| `run_scorers` / `runScorers` | Removed. Aggregate across cases yourself from the returned result. |
| Renaming an eval and losing its history | Keep `evaluation_key` / `evaluationKey` stable; `name` is only the display label. |
| Printing the summary after `evaluate()` | It prints itself on a terminal. A manual print double-prints. |
| Reporting tokens or cost from a local run | Cost is derived on the platform from span data. A local run emits no spans — there is nothing to read. Don't promise it. |
| Comparing `candidate_version`s from local runs | Comparison across `candidate_version` lives on the dashboard and needs `--upload`. Locally, compare against one earlier run with `--baseline`. |

## References

- `references/scorers.md` — the scorer ladder, `Score` objects, thresholds and per-score pass/fail
- `references/datasets.md` — dataset identity, versions, the publish confirmation, pulling
- `references/python-eval.md` — Python: complete runnable eval, exact signatures
- `references/ts-eval.md` — TypeScript/Node.js: complete runnable eval, exact signatures
