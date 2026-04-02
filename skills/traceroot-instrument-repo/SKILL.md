---
name: traceroot-instrument-repo
description: >
  Instrument an existing Python codebase with Traceroot tracing. Use when
  the user wants to add observability to their LLM application — whether
  starting fresh or adding to an existing project. Covers auto-instrumentation
  (OpenAI, LangChain, Anthropic) and manual spans with @observe.
---

# Traceroot Instrument Repo

## Workflow

1. Assess current state:
   - Is `traceroot` installed (`pip show traceroot`)?
   - Which LLM libraries are in use? (OpenAI, LangChain, Anthropic, other?)
   - Is there any existing observability or tracing setup?

2. Install if needed: `pip install traceroot python-dotenv`.

3. Add `traceroot.initialize()` at the application entry point — before any LLM library imports — with the right integrations for the stack. Load env vars before importing traceroot.

4. Add `@observe` decorators to agent entrypoints, tool functions, and key orchestration steps. See `references/python-instrument.md` for what to instrument and what to avoid.

5. Use `using_attributes(user_id=..., session_id=...)` as a context manager where user/session context is available.

6. For scripts or tests: add `traceroot.flush()` at exit.

7. Run a representative flow and verify traces appear in the Traceroot UI.

## References

- `references/python-instrument.md` — SDK patterns, initialization, decorators, context, what to instrument
