"""
Direct tests for the payout math -- duplicated here from
contracts/confluence.py per the same pattern as the other direct
tests. Keep in sync with _compute_trigger_reward / _compute_claim_reward
in that file.

The property under test throughout is the one that actually matters
for solvency: the contract must never pay out more than it was
funded with. Integer division floors, so every individual payout can
only round down, never up -- the failure mode to catch here isn't
"a contributor gets 1 wei too much" (structurally impossible with
floor division), it's "do the pieces still add up to at most the
whole", especially with attribution splits that don't divide evenly.
"""

import pytest

BPS_DENOMINATOR = 10000
TRIGGER_BPS = 200  # 2%


def _compute_trigger_reward(funding_amount: int, trigger_bps: int, bps_denominator: int) -> int:
    return funding_amount * trigger_bps // bps_denominator


def _compute_claim_reward(
    funding_amount: int, attribution_bps: int, trigger_bps: int, bps_denominator: int
) -> int:
    distributable = funding_amount * (bps_denominator - trigger_bps) // bps_denominator
    return distributable * attribution_bps // bps_denominator


class TestTriggerReward:
    def test_exact_2_percent_on_round_number(self):
        assert _compute_trigger_reward(1_000_000, TRIGGER_BPS, BPS_DENOMINATOR) == 20_000

    def test_zero_funding_gives_zero_reward(self):
        assert _compute_trigger_reward(0, TRIGGER_BPS, BPS_DENOMINATOR) == 0

    def test_never_exceeds_funding_amount(self):
        for funding in [1, 7, 99, 100_000_000_000_000_000_000]:  # up to ~100 GEN in wei
            reward = _compute_trigger_reward(funding, TRIGGER_BPS, BPS_DENOMINATOR)
            assert reward <= funding


class TestClaimReward:
    def test_single_contributor_full_attribution_gets_the_whole_distributable_pool(self):
        funding = 10 * 10**18  # 10 GEN, in wei
        distributable = funding * (BPS_DENOMINATOR - TRIGGER_BPS) // BPS_DENOMINATOR
        reward = _compute_claim_reward(funding, 10000, TRIGGER_BPS, BPS_DENOMINATOR)
        assert reward == distributable

    def test_zero_attribution_gets_nothing(self):
        funding = 10 * 10**18
        reward = _compute_claim_reward(funding, 0, TRIGGER_BPS, BPS_DENOMINATOR)
        assert reward == 0

    @pytest.mark.parametrize(
        "funding_wei",
        [
            10**18,  # 1 GEN, divides evenly
            10**18 + 1,  # deliberately not round
            999_999_999_999_999_999,  # just under 1 GEN
            3_333_333_333_333_333_333,  # doesn't divide cleanly by 3
            7,  # pathologically small, worst case for rounding
        ],
    )
    def test_three_way_split_never_exceeds_distributable_pool(self, funding_wei):
        # 3334 + 3333 + 3333 = 10000 -- a deliberately uneven split,
        # the kind most likely to expose a rounding bug that pays out
        # more than the pool actually holds.
        distributable = funding_wei * (BPS_DENOMINATOR - TRIGGER_BPS) // BPS_DENOMINATOR
        rewards = [
            _compute_claim_reward(funding_wei, bps, TRIGGER_BPS, BPS_DENOMINATOR)
            for bps in (3334, 3333, 3333)
        ]
        assert sum(rewards) <= distributable

    def test_total_payout_including_trigger_reward_never_exceeds_funding(self):
        # The strongest invariant: trigger reward + every contributor's
        # claim, summed, must never exceed what the session was
        # actually funded with -- across a spread of funding amounts
        # and an uneven attribution split.
        for funding_wei in (1, 999, 10**18, 3_333_333_333_333_333_333, 10**24):
            trigger = _compute_trigger_reward(funding_wei, TRIGGER_BPS, BPS_DENOMINATOR)
            claims = [
                _compute_claim_reward(funding_wei, bps, TRIGGER_BPS, BPS_DENOMINATOR)
                for bps in (2500, 2500, 2500, 2500)
            ]
            assert trigger + sum(claims) <= funding_wei
