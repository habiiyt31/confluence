"""
Direct (in-memory, no Studio/network needed) tests for the trustworthy-
time fix from review: "replace caller-supplied current_day with a
trustworthy contract-side time boundary and prevent arbitrary callers
from prematurely failing funded sessions."

`_day_from_datetime`, `_parse_message_datetime`, and
`_session_should_fail` are duplicated here from contracts/confluence.py
rather than imported, matching this codebase's existing pattern for
pure helpers (see that file's own "Pure helpers (no genlayer imports
needed; duplicated in tests)" comment) -- these tests need to run
without the `genlayer` package installed, since `from genlayer import
*` at the top of the contract file requires the GenVM runtime
environment.

If you change any of these functions in contracts/confluence.py,
update the copies here too.
"""

import datetime

import pytest

_EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
_MESSAGE_DATETIME_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"


def _day_from_datetime(dt: datetime.datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return (dt - _EPOCH).days


def _parse_message_datetime(raw: str) -> datetime.datetime:
    return datetime.datetime.strptime(raw, _MESSAGE_DATETIME_FORMAT).replace(
        tzinfo=datetime.timezone.utc
    )


def _session_should_fail(window_passed: bool, enough_contributions: bool) -> bool:
    return window_passed and not enough_contributions


class TestDayFromDatetime:
    def test_epoch_is_day_zero(self):
        assert _day_from_datetime(_EPOCH) == 0

    def test_one_day_later_is_day_one(self):
        assert _day_from_datetime(_EPOCH + datetime.timedelta(days=1)) == 1

    def test_just_under_a_day_is_still_day_zero(self):
        assert _day_from_datetime(_EPOCH + datetime.timedelta(hours=23, minutes=59)) == 0

    def test_naive_datetime_treated_as_utc(self):
        naive = datetime.datetime(1970, 1, 2)  # no tzinfo
        assert _day_from_datetime(naive) == 1

    def test_known_real_date(self):
        # 2026-08-19 is 20,684 days after the 1970-01-01 epoch.
        dt = datetime.datetime(2026, 8, 19, 12, 0, tzinfo=datetime.timezone.utc)
        assert _day_from_datetime(dt) == 20684

    def test_far_future_date_does_not_overflow_or_error(self):
        # Nothing in this function should choke on a caller-influenced-
        # looking large date -- it's pure arithmetic either way. The
        # actual security property isn't "this function is safe with
        # weird input" (it always was); it's that nothing in the
        # contract ever hands this function anything other than the
        # protocol-assigned transaction datetime anymore. See
        # TestForgedDateAttackSurface below for the ABI-level assertion
        # of *that*.
        far_future = datetime.datetime(2100, 1, 1, tzinfo=datetime.timezone.utc)
        result = _day_from_datetime(far_future)
        assert isinstance(result, int)
        assert result > 0


class TestParseMessageDatetime:
    """
    GenVM serializes gl.message_raw["datetime"] as a string in this
    exact format. This was found by testing against a live contract --
    the docs describe gl.message.datetime as a plain NamedTuple
    attribute, which doesn't match what a real deploy does at all
    (AttributeError: 'MessageType' object has no attribute 'datetime').
    The real value lives on the separate gl.message_raw mapping, as a
    string, and needs parsing.
    """

    def test_parses_expected_format(self):
        dt = _parse_message_datetime("2026-08-19T12:00:00.000000Z")
        assert dt.year == 2026
        assert dt.month == 8
        assert dt.day == 19
        assert dt.hour == 12
        assert dt.tzinfo is not None

    def test_parsed_datetime_feeds_correctly_into_day_from_datetime(self):
        dt = _parse_message_datetime("2026-08-19T12:00:00.000000Z")
        assert _day_from_datetime(dt) == 20684

    def test_malformed_string_raises_rather_than_silently_misparsing(self):
        # A wrong or unexpected format should fail loudly (ValueError
        # from strptime), not silently produce some default/zero day
        # that could be exploited the same way the old caller-supplied
        # argument was.
        with pytest.raises(ValueError):
            _parse_message_datetime("not-a-real-datetime")


class TestSessionShouldFail:
    """
    The exact rule synthesize() uses. Every combination of
    (window_passed, enough_contributions) is asserted explicitly so a
    future edit that flips the boolean logic by accident is caught
    immediately, rather than only showing up as a subtle behavior
    change in a live session months later.
    """

    def test_window_passed_and_not_enough_fails(self):
        assert _session_should_fail(window_passed=True, enough_contributions=False) is True

    def test_window_passed_and_enough_does_not_fail(self):
        assert _session_should_fail(window_passed=True, enough_contributions=True) is False

    def test_window_open_and_enough_does_not_fail(self):
        # The "proceed early" path: min_contributions reached before
        # the window closes. synthesize() should run the real
        # synthesis, not fail the session.
        assert _session_should_fail(window_passed=False, enough_contributions=True) is False

    def test_window_open_and_not_enough_does_not_fail_here(self):
        # In the live contract this combination never reaches
        # _session_should_fail at all -- synthesize() raises a
        # UserError ("window is still open and the minimum hasn't
        # been reached yet") before the fail-check runs. Asserted here
        # anyway so the pure function's behavior is fully specified in
        # isolation, independent of where its caller happens to guard it.
        assert _session_should_fail(window_passed=False, enough_contributions=False) is False


class TestForgedDateAttackSurface:
    """
    "Prevent arbitrary callers from prematurely failing funded
    sessions" -- the actual fix isn't a new check inside
    _session_should_fail (that function's logic was always correct);
    it's that every call site that used to accept `current_day` as a
    plain function argument now derives it from
    `gl.message_raw["datetime"]` instead, via Confluence._current_day().
    A plain argument is forgeable by any caller;
    gl.message_raw["datetime"] is assigned by the protocol when the
    transaction is processed.

    These tests assert that ABI change directly against the contract
    source, via static analysis (the `ast` module) rather than by
    importing contracts/confluence.py -- that file does
    `from genlayer import *` at module scope, which requires the GenVM
    runtime and would make these tests unable to run without Studio or
    a full GenLayer install. Parsing the source as a syntax tree needs
    nothing but the standard library, matching the "direct" tests'
    whole point: fast, dependency-free, runs in CI on every commit.
    """

    @staticmethod
    def _load_contract_ast():
        import ast
        from pathlib import Path

        contract_path = Path(__file__).resolve().parents[2] / "contracts" / "confluence.py"
        source = contract_path.read_text()
        return ast.parse(source), source

    def _find_method(self, tree, class_name: str, method_name: str):
        import ast

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name == class_name:
                for item in node.body:
                    if isinstance(item, ast.FunctionDef) and item.name == method_name:
                        return item
        raise AssertionError(f"{class_name}.{method_name} not found in contracts/confluence.py")

    @pytest.mark.parametrize(
        "method_name", ["create_session", "submit_contribution", "synthesize"]
    )
    def test_write_method_does_not_accept_current_day_argument(self, method_name):
        tree, _ = self._load_contract_ast()
        method = self._find_method(tree, "Confluence", method_name)
        arg_names = [a.arg for a in method.args.args]
        assert "current_day" not in arg_names, (
            f"{method_name} still accepts a caller-supplied current_day argument -- "
            "this is the exact vulnerability flagged in review: any caller could pass "
            "an arbitrary day to prematurely fail a funded session or reopen a closed "
            "contribution window. Derive the day from gl.message_raw[\"datetime\"] instead."
        )

    def test_current_day_helper_reads_gl_message_raw_datetime(self):
        tree, _ = self._load_contract_ast()
        method = self._find_method(tree, "Confluence", "_current_day")
        import ast

        # Looking for the subscript expression gl.message_raw["datetime"]:
        # Subscript(value=Attribute(value=Name('gl'), attr='message_raw'),
        #           slice=Constant(value='datetime'))
        found = any(
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Attribute)
            and node.value.attr == "message_raw"
            and isinstance(node.slice, ast.Constant)
            and node.slice.value == "datetime"
            for node in ast.walk(method)
        )
        assert found, (
            '_current_day() should read gl.message_raw["datetime"] -- the '
            "protocol-assigned, non-forgeable transaction time -- not any other "
            "source. Note this is NOT the same as gl.message.datetime: gl.message "
            "is a 5-field NamedTuple with no datetime field, and accessing "
            ".datetime on it raises AttributeError on a live deploy."
        )

    def test_current_day_does_not_use_gl_message_dot_datetime(self):
        # Regression guard for the exact bug this was fixed from: an
        # earlier version of this contract read gl.message.datetime
        # (attribute access), which is what actually raised
        # AttributeError: 'MessageType' object has no attribute
        # 'datetime' on a live deploy. Fixing that shouldn't quietly
        # regress back to the broken form.
        tree, _ = self._load_contract_ast()
        method = self._find_method(tree, "Confluence", "_current_day")
        import ast

        broken_pattern_found = any(
            isinstance(node, ast.Attribute)
            and node.attr == "datetime"
            and isinstance(node.value, ast.Attribute)
            and node.value.attr == "message"
            for node in ast.walk(method)
        )
        assert not broken_pattern_found, (
            "_current_day() appears to read gl.message.datetime again -- this "
            "raises AttributeError on a live deploy. Use gl.message_raw[\"datetime\"] "
            "instead."
        )

