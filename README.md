# Confluence — Collective Synthesis Engine

GenLayer positions itself as the adjudication layer for cases that need
genuine judgment, not just a rule to check — most of a task is a plain
happy path, but the hard part is a call that requires weighing evidence.
Confluence applies that idea to collaborative work: several people
contribute partial ideas toward one open brief, an AI synthesizes them
into a single coherent answer, and the same AI has to decide *how much
each contribution actually shaped that answer* — a judgment call, not
an arithmetic one. A funded reward pool is then split among
contributors proportional to that judgment, automatically, with no
editor deciding whose ideas mattered.

## The trust problem this actually solves

Synthesizing several people's input into one output, and then paying
them proportionally to how much their input mattered, is exactly the
kind of decision that invites favoritism if it's left to a single human
editor or a single unaudited AI call — an editor could just favor
whoever they like, and no contributor could ever prove otherwise.
Confluence doesn't remove the judgment call; it makes sure nobody can
make it alone. `synthesize()` runs the same synthesis independently
across GenLayer's validators, and the leader's proposed attribution
weights are only accepted once every other validator's own
independently-computed weights agree within a fixed tolerance (see
`ATTRIBUTION_TOLERANCE_BPS` below). Nobody, including the contract's
own creator, can move the reward pool without that independent
agreement happening first — there's no admin function that could
override it (see **Non-upgradability**).

## How a session works

```
open ──(window closes or min. contributions reached)──> synthesize()
  │                                                           │
  │ (min. contributions never reached)                        ├─> synthesized ──> claim_reward() per contributor
  └────────────────────────────────────────> failed           │
                                               │                └─> request_resynthesis() [convener, once, pre-claim]
                                    reclaim_funding() [convener]        │
                                                                        └─> closed ──> synthesize() again
```

- **open** — contributors submit, one per wallet address (a
  `TreeMap`-backed dedup check blocks a second submission from the
  same address in the same session).
- **synthesize()** — the *only* non-deterministic step in the whole
  contract. Anyone can call it once the contribution window has
  passed, or early if `min_contributions` is already met. If the
  minimum was never reached, the session is marked `failed` instead of
  synthesized — no LLM call happens, nothing to adjudicate.
- **synthesized** — the reward pool (minus the 2% synthesis-trigger
  reward, see below) is now claimable by each contributor, proportional
  to their `attribution_bps`.
- **closed** — a convener who's unsatisfied with the first pass can
  call `request_resynthesis()` exactly once, but only *before* anyone
  has claimed a reward — attribution changing after money has already
  moved would be unfair to whoever claimed first.
- **failed** — the convener can pull the original funding back with
  `reclaim_funding()`.

## Validators enforce consistency, not just matching numbers

`synthesize()` uses a custom `gl.vm.run_nondet_unsafe` validator
instead of `gl.eq_principle.strict_eq` or `prompt_comparative`, because
the thing being agreed on isn't one value — it's a vector of weights,
one per contribution, that has to sum to exactly 10000 bps. The
validator doesn't just check that the numbers are close; it rejects
the leader's whole proposal outright if:

- `attribution_bps` doesn't cover exactly the contribution ids that
  exist for the session (no missing ids, no extra ones)
- any single weight isn't a plain 0–10000 integer
- the weights don't sum to exactly 10000
- the synthesis text or reasoning fails basic length bounds

Only after a proposal passes that schema check does the tolerance
comparison run: each validator independently re-runs the full
synthesis prompt itself, and the leader's proposal is accepted only if
**every single contribution's weight** is within
`ATTRIBUTION_TOLERANCE_BPS` of what that validator computed
independently — not just the total, and not just on average. That's
deliberate: it stops one contribution's payout from being dragged far
off by disagreement elsewhere in the vector. The synthesis *text*
itself is taken from the leader as-is once the numbers controlling
real money have independently corroborated — see
`_validate_synthesis_payload` and `_attribution_within_tolerance` in
`contracts/confluence.py`.

## Session parameters

| Constant | Value | Why |
|---|---|---|
| `MIN_BRIEF_CHARS` | 20 | a brief has to be specific enough to actually synthesize against |
| `MIN_CONTRIBUTION_CHARS` / `MAX_CONTRIBUTION_CHARS` | 20 / 2000 | keeps contributions substantive without letting the synthesis prompt blow up |
| `MAX_CONTRIBUTIONS_PER_SESSION` | 12 | keeps the synthesis prompt a bounded, predictable size |
| `contribution_window_days` | 1–90, set per session | convener's call on how long to gather input |
| `min_contributions` | 2–12, set per session | below this, synthesis can't run — a "synthesis" of one contribution isn't a synthesis |
| `SYNTHESIS_TRIGGER_REWARD_BPS` | 200 (2%) | paid to whoever calls `synthesize()` — it costs real gas and an LLM call, so without an incentive there's no guarantee anyone but the convener ever bothers, which would strand every contributor's reward indefinitely |
| `ATTRIBUTION_TOLERANCE_BPS` | 1500 (15 pts) | tight enough that no single validator can move a large share of the pool by itself, loose enough to tolerate normal model-to-model variation in how two different LLMs weigh the same text |
| `MAX_RESYNTHESIS` | 1 | mirrors the single-escalation pattern used elsewhere in this codebase |

## Project structure

```
confluence/
├── contracts/
│   └── confluence.py       # The Intelligent Contract (non-upgradable)
├── frontend/                 # Next.js 14 app (App Router, TypeScript, Tailwind)
│   ├── app/
│   │   ├── page.tsx                 # Session feed + convene form
│   │   └── session/[id]/page.tsx    # Session detail: contribute, synthesize, claim
│   ├── components/          # AttributionBar, SessionActions, ConnectButton, ...
│   ├── lib/
│   │   ├── genlayer/        # chains.ts, contract.ts — read/write wrappers
│   │   ├── wallet/          # WalletProvider, EIP-6963 discovery, chain switching
│   │   └── format.ts
│   └── .env.example
└── README.md
```

## Networks

Configured for Studionet by default (hosted, no local setup):

| Setting | Value |
|---|---|
| GenLayer RPC | `https://studio.genlayer.com/api` |
| Chain ID | `61999` |
| Currency | GEN |
| Explorer | `explorer-studio.genlayer.com` |
| Faucet | Built-in 💧 button in Studio's account selector |

`frontend/lib/genlayer/chains.ts` also ships `localnet`, `testnetAsimov`,
and `testnetBradbury` (both testnets share chain ID `4221` — same
underlying rollup, different RPC endpoints). Switch by setting
`NEXT_PUBLIC_GENLAYER_NETWORK` in `.env.local`; every chain ID and RPC
URL there is pulled straight from the `genlayer-js` package itself,
not hand-typed.

## Setup

```bash
# 1. Tooling
npm install -g genlayer
py -3.12 -m pip install genvm-linter

# 2. Frontend dependencies
cd frontend && npm install && cd ..

# 3. Network
genlayer network   # choose studionet (fund via the 💧 faucet)

# 4. Lint — non-upgradable, so this matters more than usual
genvm-lint check contracts/confluence.py

# 5. Deploy directly from the CLI
genlayer deploy --contract contracts/confluence.py

# 6. Copy the printed contract address into frontend/.env.local
cd frontend && cp .env.example .env.local
# paste the address as NEXT_PUBLIC_CONTRACT_ADDRESS, then:
npm run dev
```

`Confluence.__init__` takes no arguments — every parameter that
matters (contribution limits, tolerance, trigger reward, resynthesis
cap) is a module-level constant in `contracts/confluence.py`, checked
at write-time rather than passed in at deploy time.

Redeploying after any contract change? `upgraders` is never populated
in `__init__`, so GenVM permanently locks the code slot the instant
`__init__` finishes running. There's no in-place upgrade path — every
contract edit needs a fresh deploy to a new address, and the old
address's sessions are left behind, inaccessible from the new one.

## The `wallet_getSnaps` fix

If you're pulling `lib/wallet/` into another project: this app never
calls genlayer-js's `client.connect()`. That method's own signature
(`connect(network?, snapSource?)`) shows it's wired into MetaMask
*Snaps* — a different thing entirely from EIP-1193/EIP-3326 network
switching — and a wallet that never enabled Snaps (most plain MetaMask
installs, and every non-MetaMask wallet like OKX) has no handler for
the resulting `wallet_getSnaps` call, so it rejects it right when the
user tries to sign. `lib/wallet/connectChain.ts` does the chain
check/switch itself instead, with only `eth_chainId`,
`wallet_switchEthereumChain` (EIP-3326), and `wallet_addEthereumChain`
(EIP-3085) as a fallback — then builds the genlayer-js client from just
the address, the officially supported "let the injected wallet handle
signing" mode.

## Testing

There's no separate test suite in this repo — verification happens in
two places:

**`genvm-lint check contracts/confluence.py`** before every deploy.
Since the contract can't be patched afterward, this is the primary
correctness gate.

**Manual QA against the deployed app**, in this order:

1. **Connect / disconnect wallet** — connect, confirm the address
   shows in the header, disconnect, refresh, confirm it stays
   disconnected. If you have more than one wallet extension installed,
   confirm the picker lists each one separately (EIP-6963) rather than
   defaulting to whichever loaded last.
2. **Convene a session** — fund with GEN, confirm the pool amount
   shown matches what you sent, confirm it appears in the session
   feed.
3. **Submit contributions** — from a second wallet, confirm dedup:
   trying to submit twice from the same address should be rejected by
   the contract, not just hidden by the UI.
4. **Synthesize** — once the window passes or `min_contributions` is
   met, run it. Open the transaction in the GenLayer Explorer and
   confirm the validators reached consensus and `attribution_bps`
   across all contributions sums to 10000.
5. **Claim reward** — confirm the claiming wallet's actual balance
   increases, not just the on-page number. This is the step that broke
   silently in an earlier project here before switching payouts to the
   `_Wallet` EOA-transfer pattern (see Design notes) — worth checking
   every time.
6. **Request resynthesis** — as the convener, before anyone claims,
   confirm the session goes back to `closed` and can only be
   re-synthesized once.
7. **Reclaim funding** — let a session's window pass without reaching
   `min_contributions`, call `synthesize()` (should resolve to
   `failed`), then reclaim as the convener and confirm the balance
   actually increases.

## Design notes worth knowing

- **`@allow_storage` above `@dataclass` is mandatory** for `Session`
  and `Contribution`, since both are stored inside a `TreeMap`.
- **Compound-keyed `TreeMap` (`"session_id:index"`), not a nested
  `DynArray`** — GenVM storage doesn't support a `DynArray` nested
  inside a dataclass field, so contributions are flattened into
  `contributions: TreeMap[str, Contribution]` instead, the same
  pattern used elsewhere in this codebase.
- **Closure safety** — every value `leader_fn`/`validator_fn` reads
  (`brief`, `count`, `sid_local`, `is_escalated`,
  `contributions_json`) is copied to a plain local variable before the
  closures are defined.
- **`gl.vm.run_nondet_unsafe` with a custom validator, not
  `gl.eq_principle`** — because the output is a vector of numbers that
  needs tolerance-based agreement per-element, not one scalar or one
  block of byte-identical text.
- **`_Wallet(...).emit_transfer(value=...)`, not
  `gl.get_contract_at().emit_transfer()`**, for every payout —
  synthesis-trigger rewards, contributor claims, and reclaimed funding
  all go to plain wallet addresses (MetaMask/OKX EOAs), not other
  Intelligent Contracts. The two are not interchangeable; using the
  wrong one looks fine at the call site but fails silently at
  execution.
- **Read-only views return plain dicts** (`get_session`,
  `get_session_contributions`, ...) rather than raw dataclass/storage
  references, so the frontend can consume them directly without
  touching storage internals.
- **One contribution per address blocks trivial self-dilution, not
  real Sybil resistance** — an address is free, so someone determined
  to inflate their own share with multiple wallets still can. A future
  version could require staking or an identity attestation per
  contribution; this MVP doesn't attempt that and says so plainly
  rather than overclaiming resistance it doesn't have.

## Deploying the frontend to Vercel

The frontend lives in `frontend/`, not the repo root, so Vercel needs one
non-default setting:

1. Import the repo in Vercel as usual.
2. In **Project Settings → General → Root Directory**, set it to
   `frontend`. Vercel auto-detects Next.js from there.
3. In **Project Settings → Environment Variables**, add the same
   values `frontend/.env.example` documents (`.env.local` itself is
   gitignored and never reaches Vercel):
   - `NEXT_PUBLIC_GENLAYER_NETWORK` = `studionet` (or a testnet)
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = the address from your own
     `genlayer deploy` — Vercel only serves the frontend, it doesn't
     deploy the contract.
4. Deploy. Redeploy (or update the env var and redeploy) any time the
   contract address changes — see **Non-upgradability** for why that
   happens more than you might expect.

## Non-upgradability

`contracts/confluence.py` never populates the `upgraders` list in
`__init__`. GenVM automatically calls `root.lock_default()` right after
`__init__` returns, permanently locking the code slot. There's no
admin function and no override anywhere in the contract — not even for
the contract's own creator.

## Path forward

- **Sybil resistance.** Covered honestly above — this MVP doesn't
  attempt it. Staking or an identity attestation per contribution is
  the natural next step.
- **Real external use.** Any group that needs to combine several
  people's input into one funded, fairly-attributed answer — a DAO's
  strategy brief, a shared design doc, a policy draft with multiple
  stakeholders — currently has no on-chain way to do that without
  trusting a single editor's judgment. Confluence's whole point is
  that nobody has to.
- **Reusability.** The session lifecycle (fund → contribute → verified
  synthesis → proportional payout) doesn't know anything specific
  about "collective writing" — the same shape applies to any task
  where several inputs need to be merged and paid out by verified,
  independently-reproducible judgment.

## License

MIT
