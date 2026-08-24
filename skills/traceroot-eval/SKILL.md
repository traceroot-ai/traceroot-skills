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
  (npm). A run reports to TraceRoot and needs TRACEROOT_API_KEY, unless it asks to run locally.
---

# TraceRoot Eval

Author an offline evaluation: a **dataset** of cases, a **task** that runs the system under test,
and **scorers** that grade each output. `evaluate()` runs the task over every case, scores each
result, and reports the run to the TraceRoot platform.

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
- **Never hand-write a dataset push.** Pass a local `Dataset` to `evaluate()` and it provisions
  the dataset for you. No `ensure_synced()`, no manual `push()` step before the run.
- **Don't invent cases.** Ask the user for real inputs, or derive them from real traces/fixtures
  in the repo. A dataset of made-up queries measures nothing.
- **Never hardcode secrets.** `TRACEROOT_API_KEY` comes from the environment.

## Before writing code

Turn the workflow below into a checklist (TodoWrite) and execute it in order.

## Workflow

### 1. Precondition — credentials
A run reports to the platform unless you ask for a local one.
- Confirm `TRACEROOT_API_KEY` is set (environment or `.env`) — `traceroot status` reports whether
  the SDK resolves it. If it is missing, ask the user to add it (TraceRoot UI → project settings).
- **While drafting, or with no key available, pass `local=True` / `local: true`.** The run executes
  in full and returns a complete result but reports nowhere — no credentials, no dataset publish,
  no run record. That is the supported way to run without a key; don't reach for a test transport.
- **If you will write an LLM judge, check the provider key too.** `Scorer.llm_judge` calls the
  provider directly — an `anthropic`/`claude` model needs the `anthropic` package and
  `ANTHROPIC_API_KEY`; anything else goes to `openai` and needs `OPENAI_API_KEY`. A missing
  provider key fails at scorer time, part-way through a run that already cost money. Check it
  before you run, not after.

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

`evaluate()` publishes the dataset for you and **never prompts** — it auto-approves the version so
a run is never blocked waiting on `[y/N]`. Only an explicit `Dataset.push(...)` confirms first.

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
One call — `evaluate()` publishes the local dataset (idempotent) and then runs:
- Python → `references/python-eval.md`
- TypeScript/Node.js → `references/ts-eval.md`

### 7. Verify (required — do not stop early)
If anything real is still missing — no credentials, no task function, no real cases — stop and say
exactly what you need. Hand over the script and name the blocker. Never fabricate a dashboard URL
or a result, and never invent cases just to make the run go.

Otherwise run the eval and confirm it landed. **On a terminal `evaluate()` prints its own summary
and the dashboard URL** — don't add a `print(result.summary())` alongside it, that double-prints.
(The auto-print is gated on the progress bar, so piped/CI/programmatic callers get clean stdout and
read `result.summary()` themselves.) What you're checking:

```
EvalRunResult(name='routing-v1', cases=2, errored=0, not_scored=2, task_errors=0, upload=uploaded)
  coverage: mean=1 pass=2/2 count=2
```

- Every scorer you wrote appears as a metric line. A scorer that errored on every case reports no
  metric at all — that is a bug in the scorer, not a zero score.
- `pass=k/n` appears for any metric whose scores are **judgeable**: boolean values always are;
  numeric values are only once their scorer declares a `threshold`. If you expected a pass-rate and
  got only a mean, the scorer is returning a number with no threshold — return a bool instead, or
  declare a threshold via `Scorer.code`.
- The dashboard URL — share it as proof.
- Check for `errored` cases you didn't expect. **`not_scored` is not a failure and does not mean
  "no score was emitted"** — status has two values, and `not_scored` is simply *not `errored`*, so
  every clean case carries it. That is why the run above shows `not_scored=2` next to `pass=2/2`.
- If nothing reported, re-check `TRACEROOT_API_KEY` — or run with `local=True` if a local result is
  all you need right now.

## Common mistakes

| Mistake | Fix |
|---|---|
| Picking a "primary" metric to report | Report every metric. There is no headline score. |
| `main_score=` / `primary_metric=` | Removed. Not a parameter. |
| Pushing the dataset before running | `evaluate(dataset=Dataset(...))` provisions it for you. |
| Treating `not_scored` as a failure | It just means *not errored* — every clean case is `not_scored`. |
| A new `Dataset` name per run | Reuse the name; edits become new versions of one dataset. |
| Wrapping every scorer in `Scorer.code` | A plain function is the default. Wrap only for policy. |
| Two scorers sharing a **scorer** name | `evaluate()` rejects it before any case runs. Give each a distinct `name` — a distinct `key` does not clear it. |
| Two scorers emitting the same `Score.name` | **Not** caught — the metric silently goes non-directional. Keep emitted names distinct yourself. |
| `run_scorers` / `runScorers` | Removed. Aggregate across cases yourself from the returned result. |
| Renaming an eval and losing its history | Keep `evaluation_key` / `evaluationKey` stable; `name` is only the display label. |
| Printing the summary after `evaluate()` | It prints itself on a terminal. A manual print double-prints. |
| Reporting tokens or cost from a local run | Cost is derived on the platform from span data. A local run emits no spans — there is nothing to read. Don't promise it. |
| `local=True` while comparing candidates | Comparison across `candidate_version` lives on the dashboard; a local run reports nowhere, so there is nothing to compare. |

## References

- `references/scorers.md` — the scorer ladder, `Score` objects, thresholds and per-score pass/fail
- `references/datasets.md` — dataset identity, versions, the publish confirmation, pulling
- `references/python-eval.md` — Python: complete runnable eval, exact signatures
- `references/ts-eval.md` — TypeScript/Node.js: complete runnable eval, exact signatures
