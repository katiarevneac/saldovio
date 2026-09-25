import os

from fastapi.testclient import TestClient

os.environ.setdefault("ANALYTICS_API_SECRET", "test-secret-value")

from main import app  # noqa: E402  (env var must be set before import)

client = TestClient(app)

VALID_REQUEST_BODY = {
    "currentBalance": "100.00",
    "recurringRules": [],
    "calculationDate": "2026-01-01",
    "windowEndDate": "2026-01-31",
}


def test_forecast_without_secret_header_is_rejected():
    response = client.post("/forecast", json=VALID_REQUEST_BODY)
    assert response.status_code == 401


def test_forecast_with_wrong_secret_is_rejected():
    response = client.post(
        "/forecast",
        json=VALID_REQUEST_BODY,
        headers={"X-Analytics-Secret": "not-the-real-secret"},
    )
    assert response.status_code == 401


def test_forecast_with_correct_secret_succeeds():
    response = client.post(
        "/forecast",
        json=VALID_REQUEST_BODY,
        headers={"X-Analytics-Secret": "test-secret-value"},
    )
    assert response.status_code == 200


def test_health_check_still_requires_no_auth():
    response = client.get("/")
    assert response.status_code == 200
