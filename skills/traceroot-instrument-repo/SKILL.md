---
name: traceroot-instrument-repo
description: >
  Instrument an existing codebase with TraceRoot tracing. Use when the user wants
  to add observability to their LLM application — whether starting fresh or adding
  to an existing project. Covers auto-instrumentation (OpenAI, LangChain, Anthropic,
  Bedrock) and manual spans. Works for Python and TypeScript/Node.js.
---

# TraceRoot Instrument Repo

## Workflow

1. Identify the runtime: Python or TypeScript/Node.js.

2. Assess current state:
   - Which LLM libraries are in use? (OpenAI, LangChain, Anthropic, Bedrock, other?)
   - Is the SDK already installed?
   - Is there any existing observability or tracing setup?

3. Install if needed:
   - Python: `pip install traceroot python-dotenv`
   - TypeScript/Node.js: `npm install @traceroot-ai/traceroot dotenv`

4. Add initialization at the application entry point — before any LLM library imports — with the right integrations for the stack. Use the appropriate reference for patterns:
   - Python: `references/python-instrument.md`
   - TypeScript/Node.js: `references/ts-instrument.md`

5. Add manual spans around agent entrypoints, tool functions, and key orchestration steps.

6. Use the session/user context helper where user/session context is available (`using_attributes` for Python, `usingAttributes` for TypeScript).

7. For scripts or tests: add flush at exit (`traceroot.flush()` / `await TraceRoot.flush()`).

8. Run a representative flow and verify traces appear in the TraceRoot UI.

## References

- `references/python-instrument.md` — Python SDK patterns: initialization, `@observe`, `using_attributes`, context
- `references/ts-instrument.md` — TypeScript SDK patterns: initialization, `observe()`, `usingAttributes`, context
