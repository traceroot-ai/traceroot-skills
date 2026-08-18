# Python offline eval

## Steps

1. Install: `pip install traceroot python-dotenv` (plus whatever your task needs).
2. Set `TRACEROOT_API_KEY` in `.env` so the run reports — or pass `local=True` to skip reporting.
3. Create the eval script (below) and run it: `python eval_weather.py`.
4. Open the printed dashboard URL to see the run, its metrics, and each case's trace.

## eval_weather.py

```python
from dotenv import load_dotenv
load_dotenv()

import os
import anthropic
import traceroot
from traceroot import Dataset, Score, evaluate

MODEL = "claude-opus-4-8"
SYSTEM_PROMPT = (
    "You are a weather assistant. Answer using ONLY the data provided. Present the facts "
    "and a short Comparison section only. Do NOT add a concluding paragraph."
)
WEATHER_FACTS = {
    "San Francisco": "68°F, Foggy, 75% humidity",
    "Tokyo": "72°F, Sunny, 50% humidity",
    "London": "59°F, Rainy, 88% humidity",
    "Paris": "64°F, Cloudy, 70% humidity",
}
CASES = [
    {"query": "What's the weather in San Francisco and Tokyo? Compare them.",
     "cities": ["San Francisco", "Tokyo"]},
    {"query": "Compare the weather in London and Paris.",
     "cities": ["London", "Paris"]},
]

# Identity is the NAME. evaluate() provisions this for you — no manual push.
DATASET = Dataset("weather-no-conclusion")
for case in CASES:
    DATASET.add(input=case)

traceroot.initialize(
    api_key=os.environ.get("TRACEROOT_API_KEY"),
    integrations=[traceroot.Integration.ANTHROPIC],  # auto-traces the task's LLM call
)
_llm = anthropic.Anthropic()


# The system under evaluation: one input in, one output out.
def task(input):
    facts = "\n".join(f"{c}: {WEATHER_FACTS[c]}" for c in input["cities"])
    resp = _llm.messages.create(
        model=MODEL, max_tokens=400, system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"{input['query']}\n\nData:\n{facts}"}],
    )
    return "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")


# An ordinary function is a scorer. Returning a Score adds a metric name + a per-case comment.
def covers_both_cities(input, output, expected=None):
    hit = all(c.lower() in (output or "").lower() for c in input["cities"])
    return Score(
        name="coverage",
        value=1.0 if hit else 0.0,
        comment="all cities present" if hit else "missing a city",
    )


if __name__ == "__main__":
    # On a terminal this prints its own summary and the run URL — no manual print needed.
    result = evaluate(
        name="weather-no-conclusion",
        dataset=DATASET,
        task=task,
        scorers=[covers_both_cities],
    )
```

## `evaluate()` parameters

Keyword-only. `name`, `dataset`, `task`, `scorers` are what you need for a first eval.

| Parameter | Meaning |
|---|---|
| `name` | the evaluation's display name (required) |
| `dataset` | a `Dataset`, a `DatasetSnapshot`, or a list of cases (required; `data=` is an alias) |
| `task` | `callable(input) -> output` (required) |
| `scorers` | sequence of scorer callables (required) |
| `local` | `True` runs in full and reports **nowhere**; mutually exclusive with a transport |
| `evaluation_key` | stable grouping identity; defaults to `name` |
| `max_concurrency` | cases in flight, default `10` |
| `timeout` | per-case bound in seconds, bounding the task *and* its scorers |
| `select` | `callable(EvalCase) -> bool` to run a subset |
| `metadata` | free-form dict attached to the run record |
| `candidate_version` | label for the candidate under test (a git sha, a model id) |
| `environment` | defaults to `"evaluation"` |
| `dataset_id` | associate the run with an existing platform dataset (skips auto-provision) |
| `transport` / `report_to` | explicit reporting sink; prefer `local=True` for a local run |
| `progress` | live console progress bar; default auto (on for a TTY, off when piped) |

There is **no** `main_score` parameter, and **no `run_scorers`** — whole-run scorers were removed;
aggregate across cases yourself from the returned result. `retry` is deliberately not implemented
and raises `NotImplementedError` rather than silently doing nothing.

`local=True` is the one-word local path — run in full, report nowhere. It is close to
`transport=FakeTransport()` but goes further: it also installs a **non-exporting tracer** (zero
spans leave the process) and suppresses global auto-init, which a bare `FakeTransport` does not.
Passing `local=True` and a `transport` together raises.

**`name` vs `evaluation_key`.** `name` is the display label; `evaluation_key` is the stable identity
runs are grouped by (the same split as a scorer's `name` vs `key`). Set it to keep one history
across a rename, or to group the Python and TypeScript runs of one evaluation.

`evaluate_async(...)` is the async form. `Evaluation(...)` is the reusable object form — build it
once, then `.run()` / `.run_async()`, optionally with per-run overrides.

## Async tasks and scorers

Both may be `async def`; the engine unifies sync and async and bounds concurrency either way. Sync
callables run in a bounded thread pool, so the active span still parents anything they trace.

## Imports

Python has a real top-level/submodule split — unlike TypeScript, where everything comes from the
package root. The authoring surface is top-level:

```python
from traceroot import (
    Dataset, DatasetSnapshot, EvalCase, Score, DeferredScore,
    Scorer, ScorerContext, scorer, llm_judge,
    Evaluation, evaluate, evaluate_async,
    EvalRunResult, EvalItemResult, RunDatasetRef, ScoreSummary, UploadState, case_status,
    pull_dataset, pull_dataset_version,
    DatasetConflictError, DatasetPublishAborted, EvalCompletionError,
)
```

Transports, dataset sync, and the introspection helpers live **only** under `traceroot.eval`:

```python
from traceroot.eval import (
    describe_scorers, aggregate_scores,
    FakeTransport, PlatformTransport, PlatformDatasetSync, LocalDatasetSync, PushResult,
)
```

`Scorer.code` and `Scorer.llm_judge` are the same callables as the older `scorer` / `llm_judge`
imports, which still work.

## Do you need `initialize()`?

`evaluate()` resolves `TRACEROOT_API_KEY` from the environment on its own, so a plain eval runs
without an explicit `initialize()`. Call it when you want the **task's own LLM calls traced** inside
each case — that is what `integrations=[...]` turns on, and it is why the example above passes
`traceroot.Integration.ANTHROPIC`. Without it the run still reports; the task span just has no
child LLM span.

## Reading the result

`evaluate()` prints its summary on completion whenever the progress bar is shown (interactive, or
`progress=True`). Piped, in CI, or called programmatically, stdout stays clean and you read the
result yourself:

```python
run.summary()                        # the same string it auto-prints
run.results                          # list[EvalItemResult]
run.errored                          # cases with a task or scorer error
run.not_scored                       # cases that produced no score
run.task_error_count                 # of those, the ones where the task itself raised
run.scorer_error_count
run.upload_state.dashboard_url       # link to the reported run
run.upload_state.failed_result_count # per-case POSTs dropped; >0 means silently-missing results
run.candidate_version
run.save("run.json")                 # EvalRunResult.load(path) reads it back
run.upload()                         # report a retained/loaded run later
case_status(item)                    # per case: "errored" | "not_scored"
```

`summary()` is a head line plus one line per metric:

```
EvalRunResult(name='weather-no-conclusion', cases=2, errored=0, not_scored=2, task_errors=0, upload=uploaded)
  coverage: mean=1 pass=2/2 count=2
```

`pass=k/n` appears only for a metric whose scorer declared a `threshold`, and is resolved exactly
as the platform resolves it — so the local pass-rate matches what the dashboard will show.

Per-case status is `errored` or `not_scored` — there is no run-level pass/fail to read or compute.
`aggregate_scores(...)` gives each metric's mean and count; numeric and boolean values contribute
to the mean, categorical values to the count only.

A scorer that raises fails that scorer on that case and marks the case `errored`; the run itself
completes and reports. A scorer that returns a non-finite number (`nan`, `inf`) is recorded as a
scorer error too, rather than a fake zero or a null.

## Running without reporting

Pass `local=True`. The run executes in full and returns a complete `EvalRunResult`, but reports
nowhere — no credentials, no HTTP, no dataset publish, and a **non-exporting tracer**, so no spans
leave the process either. Safe on a laptop or in CI without a key.

One trade-off to name for the user: comparing candidates across `candidate_version` happens on the
dashboard, so a local run has nothing to compare. Drafting is local; comparing is reported.

## Asserting the wire in tests

`local=True` discards the record of what *would* have been sent. When a test needs to assert that
sequence, pass `transport=FakeTransport()` instead — it makes zero HTTP calls and records the exact
call order in `.calls`:

```
create_run → register_item×N → record_item_result×N → record_scores×N → finish_run
```

`local=True` reports nowhere like a `FakeTransport` whose record is thrown away — but it is not
identical: `FakeTransport` runs the normal exporting tracer (spans can still be exported), whereas
`local=True` uses a non-exporting tracer and suppresses auto-init. Use `local` to run leak-free; use
`FakeTransport` to assert the wire. Import it from `traceroot.eval`.
