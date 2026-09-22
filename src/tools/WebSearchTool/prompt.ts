import { getLocalMonthYear } from 'src/constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

/**
 * WebSearch on non-Anthropic providers: the query is routed to specialist sources
 * (see localSearch.ts), so the description names them instead of "the web".
 */
export function getLocalWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- Searches news, filings and research, and returns dated results with links
- Sources are chosen automatically from your query: financial news (Yahoo Finance, and Chinese news from 东方财富/新浪财经), A-share announcements and periodic reports (巨潮资讯 cninfo), research papers (arXiv, PubMed, OpenAlex incl. IEEE), AI models (Hugging Face), tech news (Hacker News), and general web and news search when available
- Use this tool for every search. Do NOT use WebFetch on search-engine result pages (bing.com/search, google.com/search, baidu.com/s, …): they return anti-bot or unrelated pages. Use WebFetch only to open a specific URL, e.g. one returned by this tool
- Queries may be in Chinese or English. Name the company, ticker or stock code, sector and time, e.g. "半导体设备 板块 9月22日 冲高回落" or "NVDA earnings August 2026"

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response

IMPORTANT - Use the correct date in search queries:
  - The current month is ${currentMonthYear}. Use this year, and name the date when asking about a specific day.
`
}

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Domain filtering is supported to include or block specific websites
  - Web search is only available in the US

IMPORTANT - Use the correct year in search queries:
  - The current month is ${currentMonthYear}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If the user asks for "latest React docs", search for "React documentation" with the current year, NOT last year
`
}

