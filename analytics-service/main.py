from fastapi import Depends, FastAPI

from auth import verify_shared_secret
from forecast import ForecastRequest, ForecastResponse, compute_forecast

app = FastAPI(title="Saldovio Analytics Service")


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/forecast", dependencies=[Depends(verify_shared_secret)])
async def forecast(request: ForecastRequest) -> ForecastResponse:
    return compute_forecast(request)
