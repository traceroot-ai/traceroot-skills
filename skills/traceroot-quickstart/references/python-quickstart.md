# Python quickstart demo (no external LLM calls)

## Steps

1. Install dependencies: `pip install traceroot python-dotenv`
2. Set `TRACEROOT_API_KEY` in your `.env` file.
3. Create `quickstart.py` with the code below.
4. Run `python quickstart.py`.
5. Open the Traceroot UI → Traces — filter for the `quickstart.root` trace.

## quickstart.py

```python
from dotenv import load_dotenv
load_dotenv()

import traceroot
from traceroot import observe

# Reads TRACEROOT_API_KEY from env automatically
traceroot.initialize(integrations=[])

@observe(name="quickstart.step", type="span")
def step():
    return {"answer": 42}

@observe(name="quickstart.root", type="agent")
def main():
    return {"result": step()}

if __name__ == "__main__":
    main()
    traceroot.flush()  # required in short-lived scripts
```

## Notes

- `traceroot.flush()` is required at the end of scripts — without it, spans may not be exported before the process exits.
- `integrations=[]` disables auto-instrumentation; this demo only uses manual `@observe` spans.
- To target a self-hosted instance, set `TRACEROOT_HOST_URL` in `.env`.
