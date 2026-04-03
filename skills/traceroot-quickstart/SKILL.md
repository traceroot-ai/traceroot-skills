---
name: traceroot-quickstart
description: >
  Get a first TraceRoot trace running in minutes. Use when the user wants
  to verify their TraceRoot setup, see a trace without an existing LLM app,
  or confirm the API key and SDK are wired up correctly.
---

# TraceRoot Quickstart

## Workflow

1. Confirm the runtime: Python or TypeScript/Node.js.
2. Confirm `TRACEROOT_API_KEY` is set in the environment. If not, ask the user to add it to their `.env` file (find it in the TraceRoot UI under project settings).
3. Install dependencies and create the quickstart script using the appropriate reference:
   - Python: `references/python-quickstart.md`
   - TypeScript/Node.js: `references/ts-quickstart.md`
4. Run the script and direct the user to the TraceRoot UI → Traces view. The `quickstart.root` trace should appear within a few seconds.
5. If no trace appears: verify `TRACEROOT_API_KEY` is loaded, and confirm flush is called at the end of the script (`traceroot.flush()` for Python, `await TraceRoot.flush()` for TypeScript).

## References

- `references/python-quickstart.md` — minimal runnable Python demo and setup steps
- `references/ts-quickstart.md` — minimal runnable TypeScript/Node.js demo and setup steps
