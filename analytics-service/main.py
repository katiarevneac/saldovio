from dotenv import load_dotenv

# Must run before `auth` is imported: auth.py reads ANALYTICS_API_SECRET
# from os.environ at module import time (not inside a function), so the
# .env file has to be loaded into the process environment first, or a
# fresh clone with a .env file present but unread KeyErrors on startup
# (Epic 15 Story 1 final review finding — .env.example existed with
# nothing to ever read it). No-ops harmlessly when the real deployment
# sets ANALYTICS_API_SECRET directly in the environment instead of a
# .env file (override=False is the default: real env vars always win).
load_dotenv()

from fastapi import Depends, FastAPI  # noqa: E402

from auth import verify_shared_secret  # noqa: E402
from forecast import ForecastRequest, ForecastResponse, compute_forecast  # noqa: E402

app = FastAPI(title="Saldovio Analytics Service")


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/forecast", dependencies=[Depends(verify_shared_secret)])
async def forecast(request: ForecastRequest) -> ForecastResponse:
    return compute_forecast(request)
