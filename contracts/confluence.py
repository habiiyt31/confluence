# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Confluence — Collective Synthesis Engine
-----------------------------------------------------------------------------
Multiple people contribute partial ideas toward one open brief (a
strategy, a design, a policy draft, a research question -- anything
where the best answer is genuinely better as a synthesis of several
perspectives than as any one person's answer alone). Once contributions
close, an AI synthesizes all of them into one coherent output AND
attributes a percentage weight to each contribution based on how much
it actually shaped that output. A funded reward pool is then split
among contributors proportional to their attribution -- automatically,
with no editor deciding whose ideas mattered.

THE GENUINE TRUST PROBLEM (not just "AI gives a better response"):
Synthesizing several people's input into one output, and then paying
them proportionally to how much their input actually mattered, is a
judgment call. Left to a single human editor or a single unaudited AI
call, that judgment is exactly the kind of single point of failure
that invites favoritism -- an editor could just favor whoever they
like, and no contributor could ever prove otherwise. Confluence's
validators independently re-run the same synthesis and must reach
consensus on the attribution weights (within a fixed numeric
tolerance -- see ATTRIBUTION_TOLERANCE_BPS) before any money moves.
Nobody, including the contract's own creator, can move that money
without that independent agreement happening first.

MINIMAL NON-DETERMINISM BY DESIGN:
GenLayer's own docs advise designing contracts to minimize
non-deterministic calls where possible. Of Confluence's public write
functions, exactly one (synthesize) touches an LLM, and it does so
with a single non-deterministic block, once per session. Everything
else -- creating a session, submitting a contribution, requesting a
resynthesis, claiming a reward, reclaiming failed funding -- is plain
deterministic state manipulation. This also makes the contract easy to
test end-to-end: every step except synthesize() behaves identically
every time it's called with the same inputs.

VALIDATOR DESIGN -- tolerance on a vector, not a scalar:
Sepadan (a related project) established the pattern of validators
agreeing on a single fetched price within a numeric tolerance instead
of demanding byte-for-byte identical LLM output. Confluence applies
the same idea to a vector of numbers: each validator independently
generates its own attribution_bps mapping from the same contributions,
and the leader's proposal is accepted only if every single
contribution's weight is within ATTRIBUTION_TOLERANCE_BPS of what the
validator itself computed. The synthesis *text* itself is taken from
the leader as-is once the numbers that control real money have been
independently corroborated -- see _validate_synthesis_payload and
_attribution_within_tolerance below.

ANTI-GAMING, HONESTLY SCOPED:
- One contribution per address per session (a TreeMap-backed dedup
  check) blocks the most trivial form of self-dilution, but this is
  not real Sybil resistance -- an address is free, so someone
  determined to inflate their own share with multiple wallets still
  can. A future version could require staking or an identity
  attestation per contribution; this MVP does not attempt that and
  says so plainly rather than overclaiming Sybil-resistance it
  doesn't have.
- The synthesis prompt explicitly instructs the model to weight
  substance, not length or eloquence, and to give near-zero weight to
  spam, duplicate, or off-brief submissions -- but like any LLM
  judgment, this can be wrong on a given run. That's exactly why the
  validator tolerance check exists: if the model's weighting were
  wildly manipulable by clever phrasing, independent re-runs by
  different validator models would disagree past the tolerance band
  and the transaction simply wouldn't reach consensus.

CLOSURE SAFETY: every value leader_fn/validator_fn read is copied to a
plain local variable before the closure is defined, per the same rule
established in this codebase's other contracts.

NON-UPGRADABLE: `upgraders` is never populated in __init__, so GenVM's
automatic root.lock_default() call after __init__ permanently freezes
the code slot. No admin, no fee setter, no override anywhere.
"""

from genlayer import *

from dataclasses import dataclass
import json
import typing


# ── Constants ────────────────────────────────────────────────────────────

MAX_CONTRIBUTIONS_PER_SESSION = 12   # keeps the synthesis prompt a bounded size
MAX_CONTRIBUTION_CHARS = 2000
MIN_CONTRIBUTION_CHARS = 20
MIN_BRIEF_CHARS = 20
MAX_SYNTHESIS_CHARS = 4000
MIN_SYNTHESIS_CHARS = 50
MAX_REASONING_CHARS = 500

# 2% of a session's funding goes to whoever calls synthesize() -- this
# step costs real gas and an LLM call; without an incentive there's no
# guarantee anyone but the convener would ever bother triggering it,
# which would strand every contributor's reward indefinitely.
SYNTHESIS_TRIGGER_REWARD_BPS = 200

# Maximum allowed disagreement, per contribution, between the leader's
# proposed attribution and a validator's own independently-computed
# attribution, in basis points of the whole pool (1500 = 15 percentage
# points). Tight enough that no single validator can move a large
# share of real money by itself, loose enough to tolerate normal
# model-to-model variation in how two different LLMs weigh the same
# text.
ATTRIBUTION_TOLERANCE_BPS = 1500

MAX_RESYNTHESIS = 1  # mirrors the single-escalation pattern used elsewhere in this codebase

BPS_DENOMINATOR = 10000


# Sending GEN to a regular wallet (EOA) needs this EVM contract
# interface -- gl.get_contract_at(...).emit_transfer() is for
# Intelligent Contract-to-Intelligent Contract transfers only. See
# "Value Transfers > Sending Value to an EOA or EVM Contract" in the
# GenLayer docs.
@gl.evm.contract_interface
class _Wallet:
    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class Session:
    convener: Address
    brief: str
    funding_amount: u256
    contribution_window_days: u32
    created_at_day: u32
    min_contributions: u32
    contribution_count: u32
    status: str                    # open -> closed -> synthesized | failed
    synthesis: str
    synthesis_reasoning: str
    resynthesis_count: u32
    trigger_reward_paid: bool
    funding_reclaimed: bool


@allow_storage
@dataclass
class Contribution:
    contributor: Address
    text: str
    submitted_at_day: u32
    attribution_bps: u32
    claimed: bool


# ── Pure helpers (no genlayer imports needed; duplicated in tests) ────────


def _validate_synthesis_payload(d: dict, expected_ids: list) -> bool:
    """
    Schema + business-rule check: attribution_bps must cover exactly
    the contributions that actually exist for this session, each
    weight must be a plain 0-10000 integer, and the weights must sum
    to exactly 10000 -- a proposal that shortchanges or double-counts
    the pool is rejected outright, not silently accepted.
    """
    if not isinstance(d, dict):
        return False

    attribution = d.get("attribution_bps")
    if not isinstance(attribution, dict):
        return False

    expected_keys = set(str(i) for i in expected_ids)
    if set(attribution.keys()) != expected_keys:
        return False

    total = 0
    for key in expected_keys:
        val = attribution.get(key)
        if not (isinstance(val, int) and not isinstance(val, bool) and 0 <= val <= 10000):
            return False
        total += val
    if total != 10000:
        return False

    synthesis = d.get("synthesis")
    if not (isinstance(synthesis, str) and MIN_SYNTHESIS_CHARS <= len(synthesis.strip()) <= MAX_SYNTHESIS_CHARS):
        return False

    reasoning = d.get("reasoning")
    if not (isinstance(reasoning, str) and 0 < len(reasoning.strip()) <= MAX_REASONING_CHARS):
        return False

    return True


def _attribution_within_tolerance(
    a: dict, b: dict, expected_ids: list, tolerance_bps: int
) -> bool:
    """
    True if every contribution's attribution weight in `a` is within
    `tolerance_bps` of the corresponding weight in `b`. Used to compare
    a validator's own computed attribution against the leader's
    proposal -- the numbers that control real money must independently
    corroborate; the prose does not need to match at all.
    """
    for i in expected_ids:
        key = str(i)
        va = a.get(key)
        vb = b.get(key)
        if va is None or vb is None:
            return False
        if abs(int(va) - int(vb)) > tolerance_bps:
            return False
    return True


class Confluence(gl.Contract):
    sessions: TreeMap[u32, Session]
    next_session_id: u32

    # Compound-keyed ("session_id:index") since GenVM storage doesn't
    # support a DynArray nested inside a dataclass field -- this is
    # the same flattening approach used elsewhere in this codebase.
    contributions: TreeMap[str, Contribution]

    # "session_id:address_hex" -> True, blocks a second contribution
    # from the same address in the same session.
    contributor_seen: TreeMap[str, bool]

    def __init__(self):
        self.next_session_id = u32(0)
        # `upgraders` intentionally left empty -> permanently locked.

    # ==================== SESSIONS ====================

    @gl.public.write.payable
    def create_session(
        self,
        brief: str,
        contribution_window_days: u32,
        min_contributions: u32,
        current_day: u32,
    ) -> u32:
        funding = gl.message.value
        if funding <= u256(0):
            raise gl.vm.UserError("a session must be funded with GEN for contributors")
        if len(brief.strip()) < MIN_BRIEF_CHARS:
            raise gl.vm.UserError(f"brief must be at least {MIN_BRIEF_CHARS} characters")
        if int(contribution_window_days) < 1 or int(contribution_window_days) > 90:
            raise gl.vm.UserError("contribution_window_days must be between 1 and 90")
        if int(min_contributions) < 2 or int(min_contributions) > MAX_CONTRIBUTIONS_PER_SESSION:
            raise gl.vm.UserError(
                f"min_contributions must be between 2 and {MAX_CONTRIBUTIONS_PER_SESSION}"
            )

        sid = self.next_session_id
        self.sessions[sid] = Session(
            convener=gl.message.sender_address,
            brief=brief,
            funding_amount=funding,
            contribution_window_days=contribution_window_days,
            created_at_day=current_day,
            min_contributions=min_contributions,
            contribution_count=u32(0),
            status="open",
            synthesis="",
            synthesis_reasoning="",
            resynthesis_count=u32(0),
            trigger_reward_paid=False,
            funding_reclaimed=False,
        )
        self.next_session_id = u32(sid + 1)
        return sid

    @gl.public.write
    def submit_contribution(self, session_id: u32, text: str, current_day: u32) -> u32:
        session = self.sessions[session_id]
        if session.status != "open":
            raise gl.vm.UserError("session is not open for contributions")
        if int(current_day) > int(session.created_at_day) + int(session.contribution_window_days):
            raise gl.vm.UserError("contribution window has closed")
        if len(text.strip()) < MIN_CONTRIBUTION_CHARS:
            raise gl.vm.UserError(f"contribution must be at least {MIN_CONTRIBUTION_CHARS} characters")
        if len(text) > MAX_CONTRIBUTION_CHARS:
            raise gl.vm.UserError(f"contribution must be at most {MAX_CONTRIBUTION_CHARS} characters")
        if int(session.contribution_count) >= MAX_CONTRIBUTIONS_PER_SESSION:
            raise gl.vm.UserError("this session has reached its contribution limit")

        contributor = gl.message.sender_address
        dedup_key = f"{int(session_id)}:{contributor.as_hex.lower()}"
        if self.contributor_seen.get(dedup_key, False):
            raise gl.vm.UserError("you've already submitted a contribution to this session")

        index = session.contribution_count
        key = f"{int(session_id)}:{int(index)}"
        self.contributions[key] = Contribution(
            contributor=contributor,
            text=text,
            submitted_at_day=current_day,
            attribution_bps=u32(0),
            claimed=False,
        )
        self.contributor_seen[dedup_key] = True
        session.contribution_count = u32(int(index) + 1)
        return index

    # ==================== SYNTHESIS (the only non-deterministic step) ====================

    @gl.public.write
    def synthesize(self, session_id: u32, current_day: u32) -> str:
        """
        Anyone can call this once the contribution window has closed
        (or the session already has enough contributions to proceed
        early). Reads every contribution already in storage --
        deterministic -- then hands them to a single non-deterministic
        block for synthesis + attribution.
        """
        session = self.sessions[session_id]
        if session.status not in ("open", "closed"):
            raise gl.vm.UserError("session has already been synthesized or has failed")

        window_passed = int(current_day) > int(session.created_at_day) + int(
            session.contribution_window_days
        )
        enough = int(session.contribution_count) >= int(session.min_contributions)

        if not window_passed and not enough:
            raise gl.vm.UserError(
                "contribution window is still open and the minimum hasn't been reached yet"
            )

        if not enough:
            session.status = "failed"
            return "failed"

        # Copy everything the closures need into locals first.
        brief = str(session.brief)
        count = int(session.contribution_count)
        sid_local = int(session_id)
        is_escalated = int(session.resynthesis_count) > 0

        contribution_texts = []
        for i in range(count):
            c = self.contributions[f"{sid_local}:{i}"]
            contribution_texts.append({"id": i, "text": str(c.text)})
        contributions_json = json.dumps(contribution_texts)
        expected_ids = list(range(count))

        strictness_note = (
            "This is a SECOND, ESCALATED synthesis requested because the convener "
            "was not satisfied with the first pass. Re-read every contribution more "
            "carefully and be more precise about attribution -- do not simply repeat "
            "the previous weighting."
            if is_escalated
            else "This is the first synthesis pass for this session."
        )

        def leader_fn() -> str:
            prompt = f"""
You are synthesizing several independent contributions into one
coherent answer to an open brief, and deciding how much each
contribution actually shaped that answer.

BRIEF:
{brief}

{strictness_note}

CONTRIBUTIONS (each has an id you must reference exactly):
{contributions_json}

Write ONE synthesized answer that draws on the substance of the
contributions -- not a list of who said what, an actual coherent
answer to the brief. Then attribute a weight (in basis points, out
of 10000 total) to each contribution id based on how much it
genuinely shaped the synthesis:
- Weight substance, not length or eloquence. A short, sharp insight
  can outweigh a long, generic one.
- Give near-zero weight to contributions that are spam, duplicates
  of another contribution, or off-brief.
- Weights must sum to exactly 10000 and cover every contribution id
  listed above, with no extra ids.

Respond ONLY as compact JSON, no markdown fences, exactly:
{{"synthesis": "<the synthesized answer>",
  "attribution_bps": {{"0": <int>, "1": <int>, ...}},
  "reasoning": "<short explanation of the weighting>"}}
"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            data = json.loads(raw)
            attribution_raw = data.get("attribution_bps", {})
            normalized_attribution = {
                str(k): int(v) for k, v in attribution_raw.items()
            }
            return json.dumps(
                {
                    "synthesis": str(data.get("synthesis", "")),
                    "attribution_bps": normalized_attribution,
                    "reasoning": str(data.get("reasoning", ""))[:MAX_REASONING_CHARS],
                },
                sort_keys=True,
            )

        def validator_fn(leaders_res: typing.Any) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                leader = json.loads(leaders_res.calldata)
            except Exception:
                return False
            if not _validate_synthesis_payload(leader, expected_ids):
                return False

            mine = json.loads(leader_fn())
            if not _validate_synthesis_payload(mine, expected_ids):
                return False

            return _attribution_within_tolerance(
                mine["attribution_bps"],
                leader["attribution_bps"],
                expected_ids,
                ATTRIBUTION_TOLERANCE_BPS,
            )

        raw_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result = json.loads(raw_result)

        for i in range(count):
            key = f"{sid_local}:{i}"
            c = self.contributions[key]
            c.attribution_bps = u32(int(result["attribution_bps"][str(i)]))

        session.synthesis = str(result["synthesis"])
        session.synthesis_reasoning = str(result["reasoning"])
        session.status = "synthesized"

        if not session.trigger_reward_paid:
            trigger_reward = u256(
                int(session.funding_amount) * SYNTHESIS_TRIGGER_REWARD_BPS // BPS_DENOMINATOR
            )
            session.trigger_reward_paid = True
            if trigger_reward > u256(0):
                _Wallet(gl.message.sender_address).emit_transfer(value=trigger_reward)

        return "synthesized"

    @gl.public.write
    def request_resynthesis(self, session_id: u32) -> None:
        """
        The convener can request exactly one re-synthesis if they're
        unsatisfied with the first pass -- but only before anyone has
        claimed a reward, since attribution changing after money has
        already moved would be unfair to whoever claimed first.
        """
        session = self.sessions[session_id]
        if session.status != "synthesized":
            raise gl.vm.UserError("session has not been synthesized yet")
        if gl.message.sender_address != session.convener:
            raise gl.vm.UserError("only the convener can request a re-synthesis")
        if int(session.resynthesis_count) >= MAX_RESYNTHESIS:
            raise gl.vm.UserError("this session has already been re-synthesized once")

        count = int(session.contribution_count)
        sid_local = int(session_id)
        for i in range(count):
            c = self.contributions[f"{sid_local}:{i}"]
            if c.claimed:
                raise gl.vm.UserError(
                    "cannot re-synthesize after rewards have already been claimed"
                )

        session.resynthesis_count = u32(int(session.resynthesis_count) + 1)
        session.status = "closed"

    # ==================== REWARDS ====================

    @gl.public.write
    def claim_reward(self, session_id: u32, contribution_index: u32) -> u256:
        session = self.sessions[session_id]
        if session.status != "synthesized":
            raise gl.vm.UserError("session has not been synthesized yet")

        key = f"{int(session_id)}:{int(contribution_index)}"
        contribution = self.contributions[key]
        if gl.message.sender_address != contribution.contributor:
            raise gl.vm.UserError("only the original contributor can claim this")
        if contribution.claimed:
            raise gl.vm.UserError("already claimed")

        # The pool available to contributors excludes the synthesis
        # trigger reward, which was already paid out at synthesis time.
        distributable = (
            int(session.funding_amount) * (BPS_DENOMINATOR - SYNTHESIS_TRIGGER_REWARD_BPS)
            // BPS_DENOMINATOR
        )
        reward = u256(distributable * int(contribution.attribution_bps) // BPS_DENOMINATOR)

        contribution.claimed = True

        if reward > u256(0):
            _Wallet(gl.message.sender_address).emit_transfer(value=reward)

        return reward

    @gl.public.write
    def reclaim_funding(self, session_id: u32) -> u256:
        """
        If a session failed (synthesize() was called but the minimum
        contribution count was never reached), the convener can pull
        the original funding back. One-time -- funding_reclaimed
        prevents a double reclaim.
        """
        session = self.sessions[session_id]
        if session.status != "failed":
            raise gl.vm.UserError("session has not failed")
        if gl.message.sender_address != session.convener:
            raise gl.vm.UserError("only the convener can reclaim funding")
        if session.funding_reclaimed:
            raise gl.vm.UserError("funding has already been reclaimed")

        session.funding_reclaimed = True
        amount = session.funding_amount
        if amount > u256(0):
            _Wallet(gl.message.sender_address).emit_transfer(value=amount)
        return amount

    # ==================== READ-ONLY VIEWS (for the frontend) ====================

    @gl.public.view
    def get_session_count(self) -> u32:
        return self.next_session_id

    @gl.public.view
    def get_session(self, session_id: u32) -> dict:
        session = self.sessions[session_id]
        return {
            "id": int(session_id),
            "convener": session.convener.as_hex,
            "brief": session.brief,
            "funding_amount": str(session.funding_amount),
            "contribution_window_days": int(session.contribution_window_days),
            "created_at_day": int(session.created_at_day),
            "min_contributions": int(session.min_contributions),
            "contribution_count": int(session.contribution_count),
            "status": session.status,
            "synthesis": session.synthesis,
            "synthesis_reasoning": session.synthesis_reasoning,
            "resynthesis_count": int(session.resynthesis_count),
            "trigger_reward_paid": session.trigger_reward_paid,
            "funding_reclaimed": session.funding_reclaimed,
        }

    @gl.public.view
    def get_sessions(self, offset: u32, limit: u32) -> list:
        """Paginated session listing, newest first, for the homepage feed."""
        total = int(self.next_session_id)
        start = max(0, total - 1 - int(offset))
        end = max(-1, start - int(limit))
        result = []
        i = start
        while i > end and i >= 0:
            result.append(self.get_session(u32(i)))
            i -= 1
        return result

    @gl.public.view
    def get_contribution(self, session_id: u32, index: u32) -> dict:
        c = self.contributions[f"{int(session_id)}:{int(index)}"]
        return {
            "index": int(index),
            "contributor": c.contributor.as_hex,
            "text": c.text,
            "submitted_at_day": int(c.submitted_at_day),
            "attribution_bps": int(c.attribution_bps),
            "claimed": c.claimed,
        }

    @gl.public.view
    def get_session_contributions(self, session_id: u32) -> list:
        session = self.sessions[session_id]
        count = int(session.contribution_count)
        result = []
        for i in range(count):
            result.append(self.get_contribution(session_id, u32(i)))
        return result

    @gl.public.view
    def has_contributed(self, session_id: u32, address: str) -> bool:
        dedup_key = f"{int(session_id)}:{address.lower()}"
        return self.contributor_seen.get(dedup_key, False)
