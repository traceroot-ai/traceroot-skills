---
name: traceroot-quickstart
description: >
  Get a first TraceRoot trace running in minutes. Use when the user wants
  to verify their TraceRoot setup, see a trace without an existing LLM app,
  or confirm the API key and SDK are wired up correctly.
---

# TraceRoot Quickstart

## Workflow

1. Confirm `TRACEROOT_API_KEY` is set in the environment. If not, ask the user to add it to their `.env` file (find it in the TraceRoot UI under project settings).
2. Install dependencies: `pip install traceroot python-dotenv`.
3. Create `quickstart.py` using the code in `references/python-quickstart.md` — no external LLM calls required.
4. Run `python quickstart.py`.
5. Direct the user to the TraceRoot UI → Traces view. The `quickstart.root` trace should appear within a few seconds.
6. If no trace appears: verify `TRACEROOT_API_KEY` is loaded, and confirm `traceroot.flush()` is called at the end of the script.

## References

- `references/python-quickstart.md` — minimal runnable demo and setup steps
