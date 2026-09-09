from fastapi import FastAPI

from forecast import ForecastRequest, ForecastResponse, compute_forecast

app = FastAPI(title="Saldovio Analytics Service")


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/forecast")
async def forecast(request: ForecastRequest) -> ForecastResponse:
    return compute_forecast(request)
