"""Pure 30-day balance forecast calculator.

Deliberately has no database access and makes no outbound network
calls — web/ collects the current balance and recurring rules from
Finance API and sends them here as input. This keeps Analytics Service
a dependency-free calculator: if it goes down, nothing else in the
app breaks (CLAUDE.md — "an unavailable forecast must never render as
zero").
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

FORMULA_VERSION = "1.0"
FORECAST_WINDOW_DAYS = 30


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RecurringRuleInput(CamelModel):
    type: Literal["income", "expense"]
    amount: Decimal
    day_of_month: int


class ForecastRequest(CamelModel):
    current_balance: Decimal
    recurring_rules: list[RecurringRuleInput]
    calculation_date: date


class ForecastResponse(CamelModel):
    forecast_balance: Decimal
    calculation_date: date
    window_end_date: date
    formula_version: str
    assumptions: list[str]


def _clamped_occurrence(year: int, month: int, day_of_month: int) -> date:
    # A rule set for day 31 lands on the month's last real day in a
    # shorter month (e.g. 31 -> Sept 30) — decided with the user,
    # brief §11 rule 5.
    last_day_of_month = monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last_day_of_month))


def _occurrences_in_window(
    day_of_month: int, window_start: date, window_end: date
) -> list[date]:
    """window_end is exclusive, matching the [today, today+30) convention
    already agreed for "sold estimat". A monthly rule can occur twice in
    one window near a month boundary (e.g. window_start = Jan 31 with
    day_of_month = 1 includes both Feb 1 and Mar 1)."""
    occurrences: list[date] = []
    year, month = window_start.year, window_start.month

    while True:
        candidate = _clamped_occurrence(year, month, day_of_month)
        if candidate >= window_end:
            break
        if candidate >= window_start:
            occurrences.append(candidate)
        month += 1
        if month > 12:
            month = 1
            year += 1

    return occurrences


def compute_forecast(request: ForecastRequest) -> ForecastResponse:
    window_end = request.calculation_date + timedelta(days=FORECAST_WINDOW_DAYS)

    balance = request.current_balance
    for rule in request.recurring_rules:
        occurrences = _occurrences_in_window(
            rule.day_of_month, request.calculation_date, window_end
        )
        for _ in occurrences:
            balance += rule.amount if rule.type == "income" else -rule.amount

    return ForecastResponse(
        forecast_balance=balance,
        calculation_date=request.calculation_date,
        window_end_date=window_end,
        formula_version=FORMULA_VERSION,
        assumptions=[
            "Includes only confirmed recurring rules (monthly frequency).",
            "One-off irregular past expenses are not statistically extrapolated.",
            "Interval convention: [calculation_date, calculation_date + 30 days).",
        ],
    )
