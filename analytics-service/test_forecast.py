from datetime import date
from decimal import Decimal

from forecast import (
    ForecastRequest,
    RecurringRuleInput,
    _occurrences_in_window,
    compute_forecast,
)


def _request(current_balance, rules, calculation_date):
    return ForecastRequest(
        current_balance=Decimal(current_balance),
        recurring_rules=rules,
        calculation_date=calculation_date,
    )


def test_no_recurring_rules_returns_current_balance():
    result = compute_forecast(_request("1000.00", [], date(2026, 9, 9)))
    assert result.forecast_balance == Decimal("1000.00")


def test_income_within_window_is_added():
    rule = RecurringRuleInput(type="income", amount=Decimal("500.00"), day_of_month=15)
    result = compute_forecast(_request("1000.00", [rule], date(2026, 9, 9)))
    assert result.forecast_balance == Decimal("1500.00")


def test_expense_within_window_is_subtracted():
    rule = RecurringRuleInput(type="expense", amount=Decimal("200.00"), day_of_month=15)
    result = compute_forecast(_request("1000.00", [rule], date(2026, 9, 9)))
    assert result.forecast_balance == Decimal("800.00")


def test_occurrence_before_window_start_is_excluded():
    # calculation_date is the 9th; day 1 already happened this month.
    rule = RecurringRuleInput(type="income", amount=Decimal("500.00"), day_of_month=1)
    result = compute_forecast(_request("1000.00", [rule], date(2026, 9, 9)))
    # Next occurrence is Oct 1, which IS inside [Sep 9, Oct 9).
    assert result.forecast_balance == Decimal("1500.00")


def test_occurrence_at_window_start_is_included():
    rule = RecurringRuleInput(type="income", amount=Decimal("500.00"), day_of_month=9)
    result = compute_forecast(_request("1000.00", [rule], date(2026, 9, 9)))
    assert result.forecast_balance == Decimal("1500.00")


def test_occurrence_exactly_at_window_end_is_excluded():
    # Tested directly against the boundary helper with a contrived
    # start/end, rather than via compute_forecast's real 30-day
    # window — calendar month lengths vary, so hitting the exact
    # boundary through real dates is fragile; the boundary logic
    # itself isn't.
    occurrences = _occurrences_in_window(
        day_of_month=9, window_start=date(2026, 9, 1), window_end=date(2026, 9, 9)
    )
    assert occurrences == []


def test_day_31_clamps_to_last_day_of_shorter_month():
    # September has 30 days — day_of_month=31 lands on Sep 30, and
    # since the window start is inclusive, calculating exactly on
    # Sep 30 still counts that occurrence.
    rule = RecurringRuleInput(type="income", amount=Decimal("100.00"), day_of_month=31)
    result = compute_forecast(_request("0.00", [rule], date(2026, 9, 30)))
    assert result.forecast_balance == Decimal("100.00")

    # One day later (Oct 1): the Sep 30 occurrence is in the past, and
    # the next one clamps to Oct 31 (October has 31 days, no clamping
    # needed) — which lands exactly on the window's end boundary
    # (Oct 1 + 30 days = Oct 31) and is correctly excluded.
    result_next_day = compute_forecast(_request("0.00", [rule], date(2026, 10, 1)))
    assert result_next_day.forecast_balance == Decimal("0.00")


def test_monthly_rule_can_occur_twice_near_month_boundary():
    # Jan 31 + 30 days = Mar 2 (exclusive). A day_of_month=1 rule lands
    # on Feb 1 AND Mar 1, both inside [Jan 31, Mar 2).
    rule = RecurringRuleInput(type="income", amount=Decimal("100.00"), day_of_month=1)
    result = compute_forecast(_request("0.00", [rule], date(2026, 1, 31)))
    assert result.forecast_balance == Decimal("200.00")


def test_forecast_balance_is_decimal_not_float():
    result = compute_forecast(_request("10.10", [], date(2026, 9, 9)))
    assert isinstance(result.forecast_balance, Decimal)
