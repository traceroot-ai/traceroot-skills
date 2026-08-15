# Scorers: the ladder

A scorer grades one case. Climb only as far as the job needs — most scorers stay on rung 1.

## Rung 1 — an ordinary function (the default)

No wrapper, no import. The metric name defaults to the function name.

**Python** — a plain scorer declares the fields it consumes by name, from
`(input, output, expected, metadata)`; anything it doesn't need it simply doesn't declare:

```python
def covers_both_cities(input, output, expected=None):
    out = (output or "").lower()
    return all(c.lower() in out for c in input["cities"])
```

A Python scorer may instead take a single `ctx` argument (`ScorerContext`) — both forms work. A
plain scorer may only take those four names; any other required parameter raises a `TypeError`.

**TypeScript** — a scorer always takes the `ScorerContext`, idiomatically destructured:

```ts
import type { ScorerContext } from "@traceroot-ai/traceroot";

const coversBothCities = ({ input, output }: ScorerContext): boolean => {
  const out = String(output ?? "").toLowerCase();
  return (input as WeatherInput).cities.every((c) => out.includes(c.toLowerCase()));
};
```

`ScorerContext` has exactly four fields: `input`, `output`, `expected`, `metadata`.

Scorers may be sync or async in both runtimes.

## Return values — `Score` is optional, but prefer it

| Return | Becomes |
|---|---|
| `bool` / number / string | one score named after the scorer |
| `Score` | one score with an explicit name + comment ← **prefer this** |
| list of `Score` | several metrics from one scorer |
| `{"metric": value, ...}` map | one score per entry |
| `DeferredScore` | a pending score awaiting review — never coerced to 0 |
| `None` / `null` | no score for this case |

A bare bool is the on-ramp. A `Score` adds the two things that make a run readable: an explicit
metric name and a per-case `comment` explaining *why*.

### Which name becomes the metric

This decides what you see on the platform, so be deliberate:

| Scorer returns | Metric name is |
|---|---|
| a `Score` | **the `Score`'s `name`** — it wins over everything on the scorer |
| a bare bool/number | the scorer **function's** name |
| a `{metric: value}` map | each key |

The scorer's `name` / `key` are its *definition* identity (how the platform tracks the same scorer
across runs and languages); a returned `Score.name` is the *metric* label.

They *can* differ, but usually shouldn't: once a run has more than one scorer, a threshold only
applies to a score whose `name` matches its scorer's declared `name` (see "How a score finds its
owning scorer" below). A mismatch silently costs that metric its pass/fail verdict. **Keep the
scorer's `name` equal to the `Score` name you emit** — the examples below do exactly that.

**TypeScript footgun:** a metric named after "the function" is named after the function's *actual*
JS name. An inline arrow assigned to a `const` inside `Scorer.code(opts, fn)` has no usable name and
the metric comes out as the literal `"scorer"` — the `name` in the options object does **not**
rename it. In TypeScript, return an explicit `Score` (or use a named `function` declaration) rather
than relying on inference.

```python
from traceroot import Score

def covers_both_cities(input, output, expected=None):
    hit = all(c.lower() in (output or "").lower() for c in input["cities"])
    return Score(
        name="coverage",
        value=1.0 if hit else 0.0,
        comment="all cities present" if hit else "missing a city",
    )
```

```ts
import type { Score } from "@traceroot-ai/traceroot";

const coversBothCities = ({ input, output }: ScorerContext): Score => {
  const hit = (input as WeatherInput).cities.every((c) =>
    String(output ?? "").toLowerCase().includes(c.toLowerCase()));
  return { name: "coverage", value: hit ? 1.0 : 0.0,
           comment: hit ? "all cities present" : "missing a city" };
};
```

`Score` fields: `name`, `value` (number | bool | string), `comment`, `metadata`, `version`.
Only `name` and `value` are required.

## Rung 2 — `Scorer.code`: declared policy

Use when you want a **per-score pass/fail verdict** (that needs a `threshold`) or the **same
logical scorer in both SDKs** (that needs a shared `key`).

```python
from traceroot import Score, Scorer

@Scorer.code(
    key="covers_both_cities",       # stable semantic identity — set identically in TS
    name="coverage",                # matches the Score name below, so the threshold applies
    value_type="numeric",           # "numeric" | "boolean" | "categorical"
    direction="higher_is_better",   # "higher_is_better" | "lower_is_better" | "none"
    threshold=1.0,                  # per-score `passed` is derived from this
    description="1.0 when every requested city appears in the answer, else 0.0.",
    metadata={"kind": "coverage"},   # free-form labels carried on the scorer; optional
)
def covers_both_cities(ctx):
    hit = all(c.lower() in (ctx.output or "").lower() for c in ctx.input["cities"])
    return Score(name="coverage", value=1.0 if hit else 0.0,
                 comment="all cities present" if hit else "missing a city")
```

In TypeScript the options come **first**, the function second — `Scorer.code(opts, fn)`:

```ts
import { Scorer, type Score, type ScorerContext } from "@traceroot-ai/traceroot";

const coversBothCities = Scorer.code(
  {
    key: "covers_both_cities",
    name: "coverage",              // matches the Score name below, so the threshold applies
    valueType: "numeric",
    direction: "higher_is_better",
    threshold: 1.0,
    description: "1.0 when every requested city appears in the answer, else 0.0.",
  },
  ({ input, output }: ScorerContext): Score => {
    const hit = (input as WeatherInput).cities.every((c) =>
      String(output ?? "").toLowerCase().includes(c.toLowerCase()));
    return { name: "coverage", value: hit ? 1.0 : 0.0,
             comment: hit ? "all cities present" : "missing a city" };
  },
);
```

Python uses `snake_case` option names, TypeScript `camelCase`. Both also accept `name`, `version`,
`output_type` / `outputType` (`"score"` | `"classification"`), and `required_inputs` /
`requiredInputs` (a subset of `input`, `output`, `expected`, `metadata`, `trace`).

**Where `passed` comes from:** each emitted `Score` gets its own `passed`, derived from the
declared `threshold` (the pass boundary, inclusive) + `direction` of the scorer that produced it.
A scorer with no declared threshold emits scores with no pass/fail verdict — that is fine and
normal. There is never a case-level or run-level pass/fail.

This is also what puts `pass=k/n` on a metric's line in `summary()`. No threshold, no pass-rate —
just a mean and a count. If someone asks "how many passed?", that question needs rung 2.

**How a score finds its owning scorer** (this is why the metric name matters): if the run has
exactly one scorer and it emits exactly one score, that score is owned name-agnostically. In every
other case the emitted score's `name` must match a declared scorer `name` for the threshold to
apply. So the moment you have more than one scorer, a `Score` whose `name` doesn't match its
scorer's declared `name` silently loses its pass/fail verdict. Either keep the names equal, or set
the scorer's `name` to the metric you actually emit. The local `summary()` resolves ownership the
same way the platform does, so what you see locally is what the dashboard shows.

## Rung 3 — `Scorer.llm_judge`: grading with a model

The judge's `model` + `messages` are its reported definition, and its version is a deterministic
hash of that config — no function body needed. The SDK renders the template, calls the model,
parses a single number, and traces the call.

### Static judge (declarative only)

```python
from traceroot import Scorer

no_conclusion = Scorer.llm_judge(
    key="no_conclusion",
    name="no_conclusion",
    model="claude-opus-4-8",
    messages=[
        {"role": "system", "content": (
            "Grade whether an ANSWER ends with a concluding or summary paragraph. Reply with a "
            "single number and nothing else: 1.0 if it has NO such conclusion, 0.0 if it does.")},
        {"role": "user", "content": "ANSWER:\n{{output}}"},
    ],
    value_type="numeric", direction="higher_is_better", threshold=1.0,
    description="1.0 when the answer has no concluding/summary paragraph, else 0.0.",
)
```

```ts
const noConclusion = Scorer.llmJudge({
  key: "no_conclusion",
  name: "no_conclusion",
  model: "claude-opus-4-8",
  messages: [
    { role: "system", content:
        "Grade whether an ANSWER ends with a concluding or summary paragraph. Reply with a " +
        "single number and nothing else: 1.0 if it has NO such conclusion, 0.0 if it does." },
    { role: "user", content: "ANSWER:\n{{output}}" },
  ],
  valueType: "numeric", direction: "higher_is_better", outputType: "score", threshold: 1.0,
  description: "1.0 when the answer has no concluding/summary paragraph, else 0.0.",
});
```

`messages` uses `{{input}}` / `{{output}}` / `{{expected}}` placeholders. `rubric="..."` is
shorthand for a system message plus a `{{output}}` user message — pass `messages` **or** `rubric`,
one is required.

**The judge needs a provider key of its own.** With no `complete=` override, a model id starting
`claude`/`anthropic` is called through the `anthropic` package (`ANTHROPIC_API_KEY`); anything else
through `openai` (`OPENAI_API_KEY`). The package must be installed and the key set, or the judge
raises part-way through the run. Pass `complete=(model, messages) -> str` to route the call
yourself — that is also how you make a judge deterministic in tests.

The judge contract is "reply with a single number and nothing else". An ambiguous reply is an
isolated scorer error with the raw text preserved — never a silently wrong score. For a
categorical verdict set `output_type="classification"` / `outputType: "classification"`.

### Dynamic judge (a builder for per-case template variables)

The builder returns the judge's **template variables**, never the score:

```python
@Scorer.llm_judge(
    key="comparison_present",
    name="comparison_present",
    model="claude-opus-4-8",
    messages=[
        {"role": "system", "content": (
            "Reply with a single number: 1.0 if the ANSWER explicitly COMPARES the two cities "
            "({{cities}}) against each other, 0.0 if it only lists them separately.")},
        {"role": "user", "content": "ANSWER:\n{{answer}}"},
    ],
    value_type="numeric", direction="higher_is_better", threshold=1.0,
)
def comparison_present(ctx):
    return {"answer": ctx.output, "cities": " and ".join(ctx.input["cities"])}
```

```ts
const comparisonPresent = Scorer.llmJudge(
  { key: "comparison_present", name: "comparison_present", model: "claude-opus-4-8",
    messages: [
      { role: "system", content:
          "Reply with a single number: 1.0 if the ANSWER explicitly COMPARES the two cities " +
          "({{cities}}) against each other, 0.0 if it only lists them separately." },
      { role: "user", content: "ANSWER:\n{{answer}}" },
    ],
    valueType: "numeric", direction: "higher_is_better", threshold: 1.0 },
  ({ input, output }: ScorerContext) => ({
    answer: String(output ?? ""),
    cities: (input as WeatherInput).cities.join(" and "),
  }),
);
```

An LLM judge is a **convenience, not a required concept** — a hand-written function that calls a
model and returns a float is a perfectly good scorer (rung 1). Use the helper when you want the
prompt captured as the scorer's versioned definition.

## Naming and cross-language identity

- `name` — the metric label.
- `key` — stable *semantic* identity. Set the same `key` in Python and TypeScript to make the same
  logical scorer resolve across both SDKs. Defaults to the name; never derived from source.
- `version` — only what you explicitly declare. The SDK never invents a version for a code scorer;
  a judge's version defaults to the hash of its declarative config.

## Errors are isolated

A scorer that raises fails **that scorer on that case** — the other scorers still run, the case is
marked `errored`, and the run completes. Don't wrap scorer bodies in try/except to return 0: a
swallowed exception becomes a real-looking zero and hides the bug.

## Inspecting what the platform will receive

`describe_scorers([...])` / `describeScorers([...])` returns the descriptors your scorers report —
name, key, version, value type, direction, threshold, and (for a judge) model and messages. Absent
fields are omitted rather than invented. Use it to check that a threshold or key you meant to
declare actually landed, before spending a run to find out.

## Aliases

`scorer` and `llm_judge` (Python) / `scorer` and `llmJudge` (TypeScript) remain importable and
behave identically — `Scorer.code` and `Scorer.llm_judge` are the same functions under one
namespace. Write new code against the `Scorer` namespace.
