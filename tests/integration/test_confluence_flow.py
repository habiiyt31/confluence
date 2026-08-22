"""
Integration tests against a real GenLayer network, using the official
GenLayer Testing Suite (`pip install genlayer-test`, see
https://pypi.org/project/genlayer-test/). Unlike tests/direct/, these
need a live network (localnet, studionet, or a testnet) and actually
exercise deployment, consensus, and -- for synthesize() -- a real LLM
call, so they're slower and network-dependent by nature. That's the
right tradeoff for what this file covers: things that only exist once
a contract is actually deployed and called through consensus (event
ordering across transactions, authorization enforced by
gl.message.sender_address at the protocol level, real payout
transfers), as opposed to tests/direct/'s pure logic checks.

Run with:
    gltest --network localnet      # fastest, needs GLSim/Studio running locally
    gltest --network studionet     # no local setup, hosted
    gltest --network testnet_asimov

NOTE: this file documents the intended integration coverage precisely
enough to run once genlayer-test and a network are available; it
wasn't executed as part of writing it (no network access in this
environment). Treat first-run failures as a chance to correct any
gltest API detail below (account/value kwargs in particular) against
whatever version you have installed, not as evidence the contract
itself is wrong -- the contract logic is already covered, executable,
and passing in tests/direct/.
"""

from pathlib import Path

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

CONTRACTS_DIR = Path(__file__).resolve().parents[2] / "contracts"

MIN_BRIEF = "What pricing strategy should we use for the new tier?"
WINDOW_DAYS = 7
MIN_CONTRIBUTIONS = 2
FUNDING_WEI = 10**18  # 1 GEN


def _deploy(default_account):
    factory = get_contract_factory(contract_file_path=CONTRACTS_DIR / "confluence.py")
    return factory.deploy(account=default_account, args=[])


class TestSessionLifecycle:
    def test_create_session_and_read_it_back(self, default_account):
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()

        session = contract.get_session(args=[session_id]).call()
        assert session["brief"] == MIN_BRIEF
        assert session["status"] == "open"
        assert int(session["funding_amount"]) == FUNDING_WEI
        assert session["contribution_count"] == 0

    def test_create_session_without_funding_is_rejected(self, default_account):
        contract = _deploy(default_account)
        tx = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=0,
            account=default_account,
        ).transact()
        assert not tx_execution_succeeded(tx)


class TestForgedDateNoLongerPossible:
    """
    The reviewed vulnerability, tested at the ABI level: there is no
    longer any `current_day` parameter for a caller to forge in the
    first place. get_contract_factory builds its schema from the
    deployed contract itself, so calling with an extra positional day
    argument the ABI doesn't expect should fail the call outright
    rather than silently accepting attacker-controlled time.
    """

    def test_synthesize_rejects_extra_day_argument(self, default_account):
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()

        with pytest.raises(Exception):
            # A forged far-future "day" a pre-fix caller could have
            # passed to force premature failure. Should be rejected
            # for not matching synthesize(session_id)'s real ABI.
            contract.synthesize(args=[session_id, 999_999]).transact()

    def test_synthesize_too_early_fails_honestly_instead_of_being_forgeable(
        self, default_account
    ):
        # With real (not forged) time, a session with a 7-day window
        # and only 0/2 contributions can't be synthesized immediately
        # -- and there's no argument left for a caller to pass that
        # would change that.
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()

        tx = contract.synthesize(args=[session_id]).transact()
        assert not tx_execution_succeeded(tx)

        session = contract.get_session(args=[session_id]).call()
        assert session["status"] == "open"  # not prematurely failed


class TestResynthesisBeforeResubmitting:
    """
    "Re-synthesis before resubmitting": once a convener requests a
    re-synthesis, the session goes back to "closed", not "open" --
    verifying a contributor can't sneak a changed or new contribution
    in between the first and second synthesis.
    """

    def test_cannot_submit_contribution_while_awaiting_resynthesis(
        self, default_account, accounts
    ):
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()

        for i in range(MIN_CONTRIBUTIONS):
            contract.submit_contribution(
                args=[session_id, f"Contribution number {i} with enough characters."],
                account=accounts[i],
            ).transact()

        synth_tx = contract.synthesize(args=[session_id]).transact()
        assert tx_execution_succeeded(synth_tx)

        resynth_tx = contract.request_resynthesis(
            args=[session_id], account=default_account
        ).transact()
        assert tx_execution_succeeded(resynth_tx)

        session = contract.get_session(args=[session_id]).call()
        assert session["status"] == "closed"

        late_contributor = accounts[MIN_CONTRIBUTIONS]
        tx = contract.submit_contribution(
            args=[session_id, "Trying to sneak in after resynthesis was requested."],
            account=late_contributor,
        ).transact()
        assert not tx_execution_succeeded(tx)

    def test_only_convener_can_request_resynthesis(self, default_account, accounts):
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()
        for i in range(MIN_CONTRIBUTIONS):
            contract.submit_contribution(
                args=[session_id, f"Contribution number {i} with enough characters."],
                account=accounts[i],
            ).transact()
        contract.synthesize(args=[session_id]).transact()

        not_the_convener = accounts[0]
        tx = contract.request_resynthesis(
            args=[session_id], account=not_the_convener
        ).transact()
        assert not tx_execution_succeeded(tx)


class TestClaimRewardAuthorizationAndReplay:
    def test_only_the_contributor_can_claim_their_reward(self, default_account, accounts):
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()
        for i in range(MIN_CONTRIBUTIONS):
            contract.submit_contribution(
                args=[session_id, f"Contribution number {i} with enough characters."],
                account=accounts[i],
            ).transact()
        contract.synthesize(args=[session_id]).transact()

        wrong_claimant = accounts[MIN_CONTRIBUTIONS]  # never contributed
        tx = contract.claim_reward(args=[session_id, 0], account=wrong_claimant).transact()
        assert not tx_execution_succeeded(tx)

    def test_cannot_claim_the_same_reward_twice(self, default_account, accounts):
        contract = _deploy(default_account)
        session_id = contract.create_session(
            args=[MIN_BRIEF, WINDOW_DAYS, MIN_CONTRIBUTIONS],
            value=FUNDING_WEI,
            account=default_account,
        ).transact()
        for i in range(MIN_CONTRIBUTIONS):
            contract.submit_contribution(
                args=[session_id, f"Contribution number {i} with enough characters."],
                account=accounts[i],
            ).transact()
        contract.synthesize(args=[session_id]).transact()

        first_claim = contract.claim_reward(
            args=[session_id, 0], account=accounts[0]
        ).transact()
        assert tx_execution_succeeded(first_claim)

        second_claim = contract.claim_reward(
            args=[session_id, 0], account=accounts[0]
        ).transact()
        assert not tx_execution_succeeded(second_claim)
