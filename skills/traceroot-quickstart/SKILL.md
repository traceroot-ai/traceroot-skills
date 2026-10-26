---
name: traceroot-quickstart
description: >
  Produce a first TraceRoot trace in minutes. Use when the user wants to verify their TraceRoot
  setup, send a test/first trace, confirm the API key and SDK are wired up correctly, or see a
  trace appear without an existing LLM app — for Python or TypeScript/Node.js.
metadata:
  author: traceroot-ai
  version: "1.0"
compatibility: >
  Python uses the `traceroot` package (pip). TypeScript/Node.js uses `@traceroot-ai/traceroot`
  (npm). Both read TRACEROOT_API_KEY from the environment.
---

# TraceRoot Quickstart

A minimal runnable demo (no external LLM calls) that confirms TraceRoot is wired up correctly.

## Workflow

1. Confirm the runtime: Python or TypeScript/Node.js.
2. TraceRoot reads `TRACEROOT_API_KEY` from the process environment; the SDK does not load `.env` itself, so a key kept there must be loaded before the SDK import (see step 6). You can still create the quickstart script without it, but the trace only appears once the key is set — tell the user to set `TRACEROOT_API_KEY` (found in the TraceRoot UI under project settings) before running step 4. Never hardcode or print the key.
3. Install dependencies and create the quickstart script using the appropriate reference:
   - Python → `references/python-quickstart.md`
   - TypeScript/Node.js → `references/ts-quickstart.md`
4. Run the script. It prints the trace id and flushes before exit.
5. Verify. If the TraceRoot CLI is available and authenticated (`traceroot status` succeeds), check the trace yourself with `traceroot traces get <printed-trace-id> --env-file <file holding the key>` and confirm `quickstart.root` is there with its `quickstart.step` child — report that result rather than an expectation. `--env-file` makes the CLI read with the script's key, so it looks in that key's project (if the key isn't in a file, pass `--project <id>` from `traceroot projects list` instead). Ingest takes a few seconds, so if the trace isn't found, retry a couple of times over about 10 seconds before going to step 6; don't report success. Without the CLI, direct the user to the TraceRoot UI → Traces, where the `quickstart.root` trace should appear within a few seconds (searching the printed trace id finds it immediately) — `npm install -g traceroot-cli` makes this checkable from the terminal.
6. If no trace appears: confirm `TRACEROOT_API_KEY` is loaded (in Python, import `traceroot` after `load_dotenv()`; in TypeScript, `import 'dotenv/config'` before the SDK import), confirm the flush call is present at the end (`traceroot.flush()` for Python / `await TraceRoot.flush()` for TypeScript), and for self-hosting confirm `TRACEROOT_HOST_URL` points at the right instance.

## References

- `references/python-quickstart.md` — minimal runnable Python demo and setup steps
- `references/ts-quickstart.md` — minimal runnable TypeScript/Node.js demo and setup steps
