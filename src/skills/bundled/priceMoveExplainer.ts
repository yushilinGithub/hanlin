import {
	AGENT_TOOL_NAME,
	FINANCIAL_LOGIC_CRITIC_AGENT_TYPE,
} from '../../tools/AgentTool/constants.js'
import { registerBundledSkill } from '../bundledSkills.js'

const PRICE_MOVE_EXPLAINER_PROMPT = `# Price Move Explainer

Explain what has been reported as driving a recent move in a stock or sector's price, for a non-professional individual investor doing personal research. This produces research and analysis only — never a buy/sell/hold recommendation.

If no ticker/sector and timeframe were given in the invocation, ask for them before proceeding rather than guessing.

## Step 0: Check relevant memory first

Before researching, check auto-memory (\`feedback\` type) for prior corrections to this skill or prior-caught failure patterns (e.g. "watch for X"). Apply them. This is not optional — it is how this skill avoids repeating its own known mistakes.

## Step 1: Normalize the request

- Resolve the ticker or sector name. If sector-level, pick one representative, well-known proxy (an index or sector fund) and state which proxy was used and why.
- Convert any rough timeframe ("last week," "this month") into an explicit date range against today's date.
- Identify the listing venue — this determines which primary-disclosure source applies in Step 5. Do not assume a U.S. listing; check the ticker format and exchange (e.g. a \`.SH\`/\`.SS\` suffix or 6-digit code beginning 60/68 is Shanghai Stock Exchange; \`.SZ\`/000/002/300 is Shenzhen Stock Exchange; no suffix or a 1-5 letter ticker is typically a U.S. exchange, but confirm rather than assume).

## Step 2: Establish the move itself before explaining it

Search to find a live quote source, then fetch that specific page directly — never state a price or move size from a search snippet alone, since snippets can be badly stale (validated directly: a snippet returned a price five months old and roughly 85% off the fetched, dated value for a real ticker). State the percentage move, with start and end price or index level, each with its own citation and retrieval timestamp, before offering any explanation.

## Step 3: Search recent news

Search patterns like "<TICKER> stock why did it fall/rise <timeframe>" and "<sector> stocks <date range> selloff/rally." Prioritize primary sources (company press releases, investor relations, earnings releases) over aggregator or blog content.

## Step 4: Fetch the 2-4 most relevant sources

For each: extract the publish date, the specific reason(s) cited, direct quotes if present, and whether it's reporting a company-specific cause or a broader market/macro/sector move. Track which sources agree vs. disagree.

## Step 5: Cross-check primary disclosure filings (market-aware — do not default to one market)

This step only applies at the ticker level (optional/skippable for sector-level requests). The correct primary-disclosure source depends on where the security is actually listed:

- **U.S.-listed (SEC-reporting):** U.S. Securities and Exchange Commission EDGAR system. Filing list: \`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=[CIK]&type=8-K&dateb=&owner=include&count=40\` (ticker→CIK via \`https://www.sec.gov/files/company_tickers.json\`), or the JSON alternative \`https://data.sec.gov/submissions/CIK[10-digit-CIK].json\`. Common 8-K item codes: 2.02 (earnings results), 4.01 (auditor change), 5.02 (exec/director changes), 7.01 (Reg FD disclosure), 8.01 (other events).
- **China A-shares (Shanghai or Shenzhen Stock Exchange):** SEC EDGAR does not apply — these companies do not file with the U.S. Securities and Exchange Commission. Use the listing exchange's own disclosure system and 巨潮资讯网 (cninfo.com.cn), the official disclosure portal designated by the China Securities Regulatory Commission, searching by the company's stock code.
- **Any other market:** state plainly that this skill does not yet have a mapped primary-disclosure source for that market, rather than silently defaulting to SEC EDGAR or guessing.

This step, when it succeeds, is the strongest citation in the report — a primary source (the company's own required disclosure), not press interpretation. Call that distinction out explicitly in the output.

## Step 6: Draft

Rank reported drivers by how many independent sources cite them (see Phase 2a — independence gets checked, don't just count mentions). Separate what a filing actually disclosed from what press coverage merely attributed the move to. If sources disagree, say so plainly. Add an explicit caveat that press narratives about "why" a stock moved are frequently written after the fact and are not verified causal explanations, and that part of a company-specific move may reflect a broader sector or market move even if no source mentions it.

**Recommendation-attribution rule:** if a source (e.g. an analyst note) issued its own rating or recommendation, you may report that fact with attribution ("Source X maintained a Buy rating, citing..."). Never adopt, restate as your own conclusion, or otherwise echo that rating as this report's own recommendation.

Hold this as a draft — do not show it to the user yet. Two verification passes are mandatory before delivery.

## Step 7: Phase 2a — Grounding (in this same context, mandatory)

For every citation in the draft:
- Re-fetch that specific source independently and confirm the claimed number or fact is actually present in it. Do not rely on remembering having fetched it once already.
- Recompute the stated percentage move from the cited raw prices.
- Re-confirm the price timestamp is actually current (this is the exact failure already found directly: a search snippet gave a price five months stale, off by ~85%).
- Confirm the correct market-aware citation branch (SEC EDGAR vs. exchange/cninfo.com.cn) was applied for the security's actual listing venue.
- Scan the draft for any third-party rating adopted without attribution.

Any failure here gets fixed directly (re-fetch the right source, recompute, correct the branch) before moving on — this phase runs in-place, not as a separate agent call.

## Step 8: Phase 2b — Adversarial logic review (mandatory, genuinely separate agent call)

Use the ${AGENT_TOOL_NAME} tool with subagent_type="${FINANCIAL_LOGIC_CRITIC_AGENT_TYPE}". Pass it ONLY the finished draft text (after Phase 2a fixes) — not the research conversation, not your reasoning, just the draft as a standalone document. This must be a real separate call, not you re-reading your own draft under a different framing.

The critic returns specific findings plus a VERDICT line. Handle the outcome:
- **PASS**: proceed to Step 9.
- **FAIL**: fix each specific gap it identified (the draft's text, not just its framing), capped at 2 repair attempts. Re-run the critic after each fix. If still FAIL after 2 attempts, ship the report with the unresolved gap stated explicitly in the output (e.g. "could not verify whether this driver fully explains the move") rather than looping indefinitely or shipping the claim unflagged.
- **PARTIAL**: note what the critic said was too thin to review, and address that specifically (usually: add citations) before re-running.

## Step 9: Log verification catches to memory

If Phase 2a or Phase 2b caught a real, confirmed defect (not a false alarm), write a \`feedback\`-type auto-memory entry describing the *pattern* (e.g. "check whether multiple cited sources are actually the same wire story before counting them as independent") — not the specific report. This is how the skill avoids repeating its own known failure modes over time. Do not log outcome-based lessons (whether a driver "turned out" to be right after the fact) — only lessons from a confirmed verification catch.

## Step 10: Output

One markdown note, target 300-600 words. Structure:

\`\`\`markdown
# Price Move Explainer — [TICKER or Sector], [start date]–[end date]

**Move:** [+/-X]% ([start price/level] → [end price/level]) [1]

## Reported Drivers (ranked by source frequency)
1. [Driver] — reported by [N] of [M] sources [2][3]

## Primary Filing Cross-Check
- [Filing type] filed [date] — [description] — [source, marked as primary]
- (or: no qualifying filing found in this window / not yet supported for this market)

## Notes on Uncertainty
- Sources disagree on [X vs Y] — both cited
- Part of this move may reflect broader [sector/market] movement not covered above
- (any Phase 2b finding that could not be fully resolved)

## Sources
[1] URL or filing citation, retrieved/filed [date]

## Disclaimer
This report summarizes what press coverage and public filings reported as
drivers of a recent price move; it is not personalized investment advice
and is not a recommendation to buy, sell, or hold any security. Reported
explanations reflect what sources stated at the time and are not verified
causal explanations. Verify independently before acting.
\`\`\`

Resist writing a "mini sector overview" for sector-level requests — this skill answers what happened, not what the sector is.
`

export function registerPriceMoveExplainerSkill(): void {
	registerBundledSkill({
		name: 'price-move-explainer',
		description:
			"Explains what has been reported as driving a recent move in a stock or sector's price, with source citations, a market-aware primary-filing cross-check, and mandatory two-phase verification (grounding + adversarial logic review) before delivery. Research and analysis only — never a recommendation.",
		userInvocable: true,
		argumentHint: '<ticker or sector> <rough timeframe>',
		async getPromptForCommand(args) {
			let prompt = PRICE_MOVE_EXPLAINER_PROMPT
			if (args) {
				prompt += `\n\n## Target\n\n${args}`
			}
			return [{ type: 'text', text: prompt }]
		},
	})
}
