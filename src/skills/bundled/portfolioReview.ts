import {
	AGENT_TOOL_NAME,
	FINANCIAL_LOGIC_CRITIC_AGENT_TYPE,
} from '../../tools/AgentTool/constants.js'
import { registerBundledSkill } from '../bundledSkills.js'

const PORTFOLIO_REVIEW_PROMPT = `# Portfolio Review

Review a personal investment portfolio's holdings for concentration, sector weighting, and overlap risk, for a non-professional individual investor doing personal research. This produces research and analysis only — never a buy/sell/hold recommendation.

If no holdings were given in the invocation, ask for them before proceeding: ticker + shares, ticker + dollar amount, or ticker + weight, typed inline or pasted as a CSV/table. No brokerage integration — holdings are provided fresh each time.

## Step 0: Check relevant memory first

Before researching, check auto-memory (\`feedback\` type) for prior corrections to this skill or prior-caught failure patterns. Apply them.

## Step 1: Parse holdings input

- Normalize into one internal table: ticker | shares (if given) | stated dollar amount (if given) | stated weight (if given).
- If neither shares nor a dollar amount is given for a row (weight only), note explicitly that the report will be weight-based only for that row — do not silently assume a portfolio size.
- Ask once, up front, whether the user wants default concentration-flag thresholds (single-position 10%/20%, single-sector 30%) or custom ones. State plainly this is a mechanical screening parameter of the report, not an endorsed investing guideline.
- Deduplicate/merge same-ticker rows if the user says to treat holdings from multiple accounts as one portfolio.

## Step 2: Fetch current price and sector/industry classification per ticker

- Search to find a live quote/profile source for each ticker, then fetch that specific page directly — never trust a search snippet's price or classification (validated directly: a snippet returned a price five months stale, off by roughly 85% from the real, fetched value).
- For thin or ambiguous classifications, cross-check against the U.S. Securities and Exchange Commission EDGAR SIC code (for U.S.-listed tickers only) as a secondary sanity check — it is coarser than a standard sector taxonomy, so disagreement gets reported, not silently resolved either way.
- For non-U.S. tickers (e.g. China A-shares on the Shanghai or Shenzhen Stock Exchange), classification comes from the listing exchange's own data or a general financial-data source — EDGAR does not apply.
- Every price and every classification gets its own citation (URL + retrieval date). If a ticker cannot be resolved (delisted, typo, private/OTC with no data), list it in a "Could not classify" section rather than guessing.

## Step 3: Compute

- Market value per position = shares × price, or the stated dollar amount directly if shares weren't given.
- Total portfolio value = sum of resolved position values (note explicitly if some tickers are unresolved, so the total reads as partial).
- Weight per position = position value / total. Sector groupings: sum weights by sector, with a per-sector holding count.
- Concentration flags (mechanical, thresholds from Step 1): any position at or above the single-position threshold; any sector at or above the single-sector threshold.
- Overlap flags (cheap, defensible heuristics only — not statistical correlation, which needs historical price series and is out of scope for this note): same-company multiple share classes (e.g. two tickers for one company); 3+ holdings clustered in the same narrow sub-industry.

## Step 4: Draft

Assemble the holdings table, concentration flags, overlap notes, and a data-gaps section. State explicitly that this report does not measure statistical price correlation between holdings — only sector/sub-industry grouping and share-class overlap.

Hold this as a draft — do not show it to the user yet. Two verification passes are mandatory before delivery.

## Step 5: Phase 2a — Grounding (in this same context, mandatory)

For every citation in the draft:
- Re-fetch each source independently and confirm the claimed price/classification is actually present in it. Do not rely on remembering having fetched it once.
- Recompute every weight and total from the cited raw prices/amounts.
- Re-confirm each price timestamp is actually current.
- Scan for any third-party rating adopted without attribution, if any appeared during research.

Fix any failure here directly before moving on — this phase runs in-place, not as a separate agent call.

## Step 6: Phase 2b — Adversarial logic review (mandatory, genuinely separate agent call)

Use the ${AGENT_TOOL_NAME} tool with subagent_type="${FINANCIAL_LOGIC_CRITIC_AGENT_TYPE}". Pass it ONLY the finished draft text (after Phase 2a fixes) — not the research conversation. Ask it specifically to check for hidden shared exposure between nominally-diversified holdings (same supplier, same end customer, same geography, same commodity input, same regulatory dependency) that a sector-label-only concentration check would miss, in addition to its standard checks.

Handle the outcome:
- **PASS**: proceed to Step 7.
- **FAIL**: fix each specific gap identified, capped at 2 repair attempts, re-running the critic after each. If still FAIL after 2 attempts, ship the report with the unresolved gap stated explicitly rather than looping or shipping it unflagged.
- **PARTIAL**: address what the critic said was too thin to review (usually: add citations) before re-running.

## Step 7: Log verification catches to memory

If Phase 2a or 2b caught a real, confirmed defect, write a \`feedback\`-type auto-memory entry describing the *pattern* (e.g. "check for shared supplier exposure, not just sector label, before calling a portfolio diversified") — not the specific report. Do not log outcome-based lessons (whether a flagged concentration "turned out" to matter) — only lessons from a confirmed verification catch.

## Step 8: Output

One markdown note, target 300-700 words plus tables. If holdings exceed ~25 positions, keep the holdings table complete but compress prose elsewhere rather than growing into a multi-page report. Structure:

\`\`\`markdown
# Portfolio Review — [date]

Prices as of [date/time]. See Sources for citations.

## Holdings
| Ticker | Shares / Amount | Price | Market Value | Weight | Sector |

**Total portfolio value:** $X (or "partial — N of M tickers unresolved")

## Concentration Flags
- [Ticker] is X% of portfolio (threshold: Y%)
- [Sector] is X% of portfolio across N holdings (threshold: Y%)

## Overlap Notes
- [ticker A] and [ticker B] are share classes of the same company
- [N holdings] are all in [sub-industry] — flagged as sector-adjacent exposure
- (any hidden shared exposure the adversarial review surfaced)

## Data Gaps
- [ticker]: could not resolve price/classification — [reason]

## Sources
[1] URL, retrieved [date]

## Disclaimer
This is a factual summary generated from current market data and public
sources for personal informational purposes only. It is not personalized
investment advice and is not a recommendation to buy, sell, or hold any
security. This report does not measure statistical price correlation
between holdings — only sector/sub-industry grouping and share-class
overlap. Verify all figures independently before making decisions.
\`\`\`
`

export function registerPortfolioReviewSkill(): void {
	registerBundledSkill({
		name: 'portfolio-review',
		description:
			"Reviews a personal investment portfolio's holdings for concentration, sector weighting, and overlap risk, including hidden shared exposure between nominally-diversified positions, with mandatory two-phase verification (grounding + adversarial logic review) before delivery. Takes tickers with share counts, dollar amounts, or weights, typed inline or pasted as a CSV/table. Research and analysis only — never a recommendation.",
		userInvocable: true,
		argumentHint: '<holdings: ticker + shares/amount/weight, one per line or CSV>',
		async getPromptForCommand(args) {
			let prompt = PORTFOLIO_REVIEW_PROMPT
			if (args) {
				prompt += `\n\n## Holdings\n\n${args}`
			}
			return [{ type: 'text', text: prompt }]
		},
	})
}
