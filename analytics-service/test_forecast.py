from datetime import date, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from forecast import (
    ForecastRequest,
    RecurringRuleInput,
    _occurrences_in_window,
    compute_forecast,
)


def _request(current_balance, rules, calculation_date, window_end_date=None):
    return ForecastRequest(
        current_balance=Decimal(current_balance),
        recurring_rules=rules,
        calculation_date=calculation_date,
        window_end_date=window_end_date or calculation_date + timedelta(days=30),
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


def test_daily_balances_has_correct_length_and_date_range():
    result = compute_forecast(_request("1000.00", [], date(2026, 9, 9)))
    assert len(result.daily_balances) == 31
    assert result.daily_balances[0].date == date(2026, 9, 9)
    assert result.daily_balances[-1].date == date(2026, 10, 9)


def test_daily_balances_dates_are_strictly_ordered():
    result = compute_forecast(_request("1000.00", [], date(2026, 9, 9)))
    dates = [entry.date for entry in result.daily_balances]
    assert dates == sorted(dates)
    assert len(dates) == len(set(dates))


def test_daily_balances_last_point_matches_forecast_balance():
    rule = RecurringRuleInput(type="income", amount=Decimal("500.00"), day_of_month=15)
    result = compute_forecast(_request("1000.00", [rule], date(2026, 9, 9)))
    assert result.daily_balances[-1].balance == result.forecast_balance


def test_two_occurrence_rule_shows_up_mid_series_not_just_final_total():
    # Jan 31 + 30 days = Mar 2 (exclusive). A day_of_month=1 rule lands
    # on Feb 1 AND Mar 1, both inside the window — the daily series must
    # step up at EACH occurrence date, not just reflect both in the total.
    rule = RecurringRuleInput(type="income", amount=Decimal("100.00"), day_of_month=1)
    result = compute_forecast(_request("0.00", [rule], date(2026, 1, 31)))

    by_date = {entry.date: entry.balance for entry in result.daily_balances}
    assert by_date[date(2026, 1, 31)] == Decimal("0.00")
    assert by_date[date(2026, 2, 1)] == Decimal("100.00")
    assert by_date[date(2026, 2, 28)] == Decimal("100.00")
    assert by_date[date(2026, 3, 1)] == Decimal("200.00")
    assert result.forecast_balance == Decimal("200.00")


def test_occurrence_exactly_at_window_end_not_reflected_in_last_daily_point():
    rule = RecurringRuleInput(type="income", amount=Decimal("100.00"), day_of_month=31)
    result = compute_forecast(_request("0.00", [rule], date(2026, 10, 1)))
    assert result.daily_balances[-1].date == date(2026, 10, 31)
    assert result.daily_balances[-1].balance == Decimal("0.00")


def test_daily_balances_are_decimal_not_float():
    result = compute_forecast(_request("10.10", [], date(2026, 9, 9)))
    assert all(isinstance(entry.balance, Decimal) for entry in result.daily_balances)


def test_same_day_rules_accumulate_instead_of_overwriting():
    # Two rules landing on the same date (e.g. rent + salary both on the
    # 15th) must both be applied — a same-day overwrite bug would silently
    # drop one of them and pass every other test in this file.
    income = RecurringRuleInput(type="income", amount=Decimal("500.00"), day_of_month=15)
    expense = RecurringRuleInput(type="expense", amount=Decimal("200.00"), day_of_month=15)
    result = compute_forecast(_request("1000.00", [income, expense], date(2026, 9, 9)))

    by_date = {entry.date: entry.balance for entry in result.daily_balances}
    assert by_date[date(2026, 9, 14)] == Decimal("1000.00")
    assert by_date[date(2026, 9, 15)] == Decimal("1300.00")
    assert result.forecast_balance == Decimal("1300.00")


def test_window_end_date_is_configurable_not_hardcoded_30_days():
    result = compute_forecast(
        _request("1000.00", [], date(2026, 9, 9), window_end_date=date(2026, 9, 19))
    )
    assert result.window_end_date == date(2026, 9, 19)
    assert len(result.daily_balances) == 11
    assert result.daily_balances[-1].date == date(2026, 9, 19)


def test_window_end_date_before_calculation_date_is_rejected():
    with pytest.raises(ValidationError):
        _request("1000.00", [], date(2026, 9, 9), window_end_date=date(2026, 9, 1))


def test_window_end_date_more_than_366_days_out_is_rejected():
    with pytest.raises(ValidationError):
        _request("1000.00", [], date(2026, 9, 9), window_end_date=date(2028, 1, 1))


# improvements.md F03 (P0): ForecastRequest has no way to say "this rule's
# occurrence today has already been paid" — Transaction and RecurringRule
# have no link in finance-api's schema (prisma/schema.prisma), and
# ForecastRequest itself (forecast.py:38-42) carries current_balance and
# recurring_rules but no transaction/occurrence-status data at all. Since
# _occurrences_in_window's window includes calculation_date itself
# (docstring above, line ~78: "[today, today+30)"), a rule due today is
# always subtracted here — even when current_balance (computed upstream by
# Finance API from actual transactions) already reflects that same payment
# having been made today.
#
# This test models exactly that: current_balance is 800.00 because a
# 200.00 rent expense, due today, was already paid today. The same
# recurring rule is still passed in (there is no other way to represent
# it — nothing marks an occurrence as settled), so the forecast subtracts
# it again.
#
# EXPECTED (once F03 is fixed, e.g. by passing already-settled occurrences
# so they can be excluded): forecast_balance stays 800.00 — the payment
# already happened, nothing further to subtract today.
# CURRENT (proves the finding): forecast_balance is 600.00 — double-counted.
def test_f03_rule_already_paid_today_is_still_subtracted_again():
    already_paid_rule = RecurringRuleInput(
        type="expense", amount=Decimal("200.00"), day_of_month=9
    )
    result = compute_forecast(
        _request(
            "800.00",
            [already_paid_rule],
            date(2026, 9, 9),
            window_end_date=date(2026, 9, 10),
        )
    )
    assert result.forecast_balance == Decimal("800.00")
