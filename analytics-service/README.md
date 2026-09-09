# Analytics Service

30-day balance forecast calculator (roadmap stage 5). Pure computation
service — no database access, no calls to other services. `web/`
collects the current balance and recurring rules from Finance API and
sends them here as input; this service just computes and returns.

## Setup

```
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Run

```
./venv/bin/uvicorn main:app --port 8000 --reload
```

## Test

```
./venv/bin/pytest -v
```
