---
name: traceroot-eval
description: >
  Write and run offline evaluations with the TraceRoot SDK. Use when the user wants to evaluate
  an LLM app or agent, add evals or scorers, build an eval dataset or test cases, grade outputs
  with an LLM judge, check for regressions between prompt/model versions, or "add evals to my
  project" — for Python or TypeScript/Node.js. Covers datasets, scorers, LLM judges, running
  `evaluate()`, and reading metric-first results on the TraceRoot platform.
allowed-tools:
  - Bash(traceroot status)
metadata:
  author: traceroot-ai
  version: "1.0"
compatibility: >
  Python uses the `traceroot` package (pip); TypeScript/Node.js uses `@traceroot-ai/traceroot`
  (npm). Evaluation is cloud-only — every run reports to TraceRoot and needs TRACEROOT_API_KEY.
---

# TraceRoot Eval

Author an offline evaluation: a **dataset** of cases, a **task** that runs the system under test,
and **scorers** that grade each output. `evaluate()` runs the task over every case, scores each
result, and reports a trace-native run to the TraceRoot platform.

## Rules (read first)

- **Start at the bottom of the scorer ladder.** A scorer is an ordinary function. Reach for
  `Scorer.code` / `Scorer.llm_judge` only when you need what they add.
- **Prefer returning a `Score` object.** A bare `bool`/number is valid and is the on-ramp, but a
  `Score` carries an explicit metric name and a per-case comment, which is what makes results
  readable on the platform. Optional — but prefer it.
- **Never invent a headline metric.** There is no `main_score` / `primary_metric` / run-level
  pass-rate. Results are metric-first: every scorer's metric and its mean. Pass/fail is
  **per-score**, from the owning scorer's declared `threshold`.
- **Never hand-write a dataset push.** Pass a local `Dataset` to `evaluate()` and it provisions
  the dataset for you. No `ensure_synced()`, no manual `push()` step before the run.
- **Don't invent cases.** Ask the user for real inputs, or derive them from real traces/fixtures
  in the repo. A dataset of made-up queries measures nothing.
- **Never hardcode secrets.** `TRACEROOT_API_KEY` comes from the environment.

## Before writing code

Turn the workflow below into a checklist (TodoWrite) and execute it in order.

## Workflow

### 1. Precondition — API key
Evaluation is cloud-only: every run reports to the platform. Confirm `TRACEROOT_API_KEY` is set
(environment or `.env`). If not, ask the user to add it (TraceRoot UI → project settings) and stop
until it is present. Without credentials `evaluate()` raises rather than running locally.

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
name updates the same dataset with a new version rather than forking. See `references/datasets.md`.

### 5. Write scorers — climb the ladder only as far as you need
1. **Plain function** — the default. Returns a bool or number.
2. **`Scorer.code(...)`** — adds declared policy (`value_type` / `direction` / `threshold`) and a
   stable cross-language `key`. Use when you want a per-score pass/fail verdict or the same
   logical scorer in both SDKs.
3. **`Scorer.llm_judge(...)` / `Scorer.llmJudge(...)`** — grading that needs a model. Static
   (declarative config only, no function body) or dynamic (a builder returning template variables
   per case).

Full ladder with working code for both runtimes: `references/scorers.md`.

### 6. Run
One call — `evaluate()` publishes the local dataset (idempotent) and then runs:
- Python → `references/python-eval.md`
- TypeScript/Node.js → `references/ts-eval.md`

### 7. Verify (required — do not stop early)
Run the eval and confirm it landed:
- The run prints a dashboard URL — share it as proof.
- Print `result.summary()`; confirm every scorer you wrote appears as a metric with a mean. A
  scorer that errored on every case reports no metric at all — that is a bug in the scorer, not a
  zero score.
- Check for `errored` cases you didn't expect. `not_scored` means no score was emitted, not a
  failure.
- If nothing reported, re-check `TRACEROOT_API_KEY` — evaluation cannot run offline without an
  explicit test transport.

## Common mistakes

| Mistake | Fix |
|---|---|
| Picking a "primary" metric to report | Report every metric. There is no headline score. |
| `main_score=` / `primary_metric=` | Removed. Not a parameter. |
| Pushing the dataset before running | `evaluate(dataset=Dataset(...))` provisions it for you. |
| Treating `not_scored` as a failure | It means no score was emitted, not a bad score. |
| A new `Dataset` name per run | Reuse the name; edits become new versions of one dataset. |
| Wrapping every scorer in `Scorer.code` | A plain function is the default. Wrap only for policy. |

## References

- `references/scorers.md` — the scorer ladder, `Score` objects, thresholds and per-score pass/fail
- `references/datasets.md` — dataset identity, versions, the publish confirmation, pulling
- `references/python-eval.md` — Python: complete runnable eval, exact signatures
- `references/ts-eval.md` — TypeScript/Node.js: complete runnable eval, exact signatures
