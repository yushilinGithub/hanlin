import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  applyRecencyDefault,
  backupCall,
  fallbackCalls,
  makeOutputFromLocalSearch,
  runSourceCalls,
  selectSources,
  toolCallsFrom,
} from '../localSearch.js'
import { buildArxivQuery, parseArxivFeed } from '../sources/arxiv.js'
import { beijingDate, findCompanyIn, findStock } from '../sources/cninfo.js'
import { parseStockNewsPage, sinaSymbol } from '../sources/sina.js'
import { timeRange } from '../sources/tavily.js'
import { parseEastmoneyDate, topicQuery, unwrapJsonp } from '../sources/eastmoney.js'
import { rebuildAbstract } from '../sources/openalex.js'
import { parsePubmedDate } from '../sources/pubmed.js'
import type { SearchSource } from '../sources/types.js'

const names = (sources: SearchSource[]) => sources.map(s => s.name)

describe('selectSources', () => {
  it('offers the Tavily web search only when TAVILY_API_KEY is set', () => {
    const saved = process.env.TAVILY_API_KEY
    try {
      Reflect.deleteProperty(process.env, 'TAVILY_API_KEY')
      assert.ok(!names(selectSources({})).includes('web_search'))
      process.env.TAVILY_API_KEY = 'test'
      assert.equal(names(selectSources({})).at(-1), 'web_search')
    } finally {
      if (saved === undefined) Reflect.deleteProperty(process.env, 'TAVILY_API_KEY')
      else process.env.TAVILY_API_KEY = saved
    }
  })

  it('offers every source without a domain filter', () => {
    assert.deepEqual(names(selectSources({})).filter(n => n !== 'web_search'), [
      'yahoo_finance_news',
      'eastmoney_news',
      'cninfo_announcements',
      'arxiv_search',
      'pubmed_search',
      'openalex_search',
      'huggingface_search',
      'hackernews_search',
    ])
  })

  it('allowed_domains keeps matching sources and those that link out', () => {
    assert.deepEqual(names(selectSources({ allowed_domains: ['arxiv.org'] })).filter(n => n !== 'web_search'), [
      'arxiv_search',
      'openalex_search',
      'hackernews_search',
    ])
  })

  it('blocked_domains removes a source only when all its hosts are blocked', () => {
    assert.ok(names(selectSources({ blocked_domains: ['pubmed.ncbi.nlm.nih.gov'] })).includes('pubmed_search'))
    assert.ok(!names(selectSources({ blocked_domains: ['ncbi.nlm.nih.gov'] })).includes('pubmed_search'))
  })
})

describe('toolCallsFrom', () => {
  const sources = selectSources({})
  const block = (id: string, name: string, input: unknown) =>
    ({ type: 'tool_use', id, name, input }) as unknown as BetaContentBlock

  it('keeps offered tools, drops unknown names and duplicates', () => {
    const calls = toolCallsFrom(
      [
        block('a', 'arxiv_search', { query: 'jev' }),
        block('b', 'arxiv_search', { query: 'jev' }),
        block('c', 'made_up_tool', { query: 'x' }),
        block('d', 'pubmed_search', { query: 'Japanese encephalitis virus' }),
      ],
      sources,
    )
    assert.deepEqual(
      calls.map(c => c.id),
      ['a', 'd'],
    )
  })

  it('caps at 8 calls', () => {
    const blocks = Array.from({ length: 12 }, (_, i) => block(`id${i}`, 'arxiv_search', { query: `q${i}` }))
    assert.equal(toolCallsFrom(blocks, sources).length, 8)
  })

  it('recency words add each source’s recentDays when the model set no days', () => {
    const calls = applyRecencyDefault(
      'jev model latest',
      [
        { id: '1', name: 'hackernews_search', args: { query: 'jev' } },
        { id: '2', name: 'pubmed_search', args: { query: 'jev', days: 7 } },
        { id: '3', name: 'arxiv_search', args: { query: 'jev' } },
      ],
      sources,
    )
    assert.deepEqual(
      calls.map(c => c.args.days),
      [30, 7, 365],
    )
    assert.equal(applyRecencyDefault('宁德时代 最新消息', [calls[0]!], sources)[0]!.args.days, 30)
  })

  it('no recency words, no days added', () => {
    const call = { id: '1', name: 'hackernews_search', args: { query: 'New York Times' } }
    assert.equal(applyRecencyDefault('New York Times', [call], sources)[0]!.args.days, undefined)
  })

  it('fallback searches every offered source with the query', () => {
    const calls = fallbackCalls('jev model', sources)
    assert.equal(calls.length, sources.length)
    assert.ok(calls.every(c => c.args.query === 'jev model'))
  })
})

describe('runSourceCalls + makeOutputFromLocalSearch', () => {
  const fake = (name: string, impl: SearchSource['search']): SearchSource => ({
    name,
    label: name.toUpperCase(),
    description: '',
    hosts: ['example.com'],
    parameters: { type: 'object', properties: {} },
    isAvailable: () => true,
    search: impl,
  })

  it('reports hits with dates, failures as text, and applies blocked_domains to hit URLs', async () => {
    const ok = fake('ok', async () => [
      { title: 'Kept', url: 'https://example.com/a', published: '2026-09-18T10:00:00Z', snippet: 'about a' },
      { title: 'Blocked', url: 'https://spam.test/b' },
    ])
    const broken = fake('broken', async () => {
      throw new Error('HTTP 500 from example.com')
    })
    const results = await runSourceCalls(
      [
        { id: '1', name: 'ok', args: { query: 'q' } },
        { id: '2', name: 'broken', args: { query: 'q' } },
      ],
      [ok, broken],
      { blocked_domains: ['spam.test'] },
      new AbortController().signal,
    )
    const output = makeOutputFromLocalSearch(results, 'q', 1)
    assert.deepEqual(output.results[0], {
      tool_use_id: '1',
      content: [{ title: 'Kept', url: 'https://example.com/a' }],
    })
    assert.match(String(output.results[1]), /\[2026-09-18\] Kept/)
    assert.doesNotMatch(String(output.results[1]), /Blocked/)
    assert.equal(output.results[2], 'BROKEN — q: search failed (HTTP 500 from example.com).')
  })

  it('spaces calls to a rate-limited source', async () => {
    const times: number[] = []
    const slow = {
      ...fake('slow', async () => {
        times.push(Date.now())
        return []
      }),
      minIntervalMs: 100,
    }
    await runSourceCalls(
      [
        { id: '1', name: 'slow', args: { query: 'a' } },
        { id: '2', name: 'slow', args: { query: 'b' } },
      ],
      [slow],
      {},
      new AbortController().signal,
    )
    assert.ok(times[1]! - times[0]! >= 95)
  })
})

describe('arXiv', () => {
  it('plain keywords become an AND of all: terms without stopwords', () => {
    assert.equal(buildArxivQuery('mixture of experts'), '(all:mixture AND all:experts)')
  })

  it('quoted phrases stay whole', () => {
    assert.equal(buildArxivQuery('"mixture of experts" inference'), '(all:"mixture of experts" AND all:inference)')
  })

  it('field syntax passes through, with category and date range appended', () => {
    assert.ok(buildArxivQuery('ti:"diffusion"', 'cs.LG', 30).startsWith('(ti:"diffusion") AND cat:cs.LG AND submittedDate:['))
  })

  it('parses Atom entries', () => {
    const xml = `<feed><entry><id>http://arxiv.org/abs/2609.01234v1</id>
      <published>2026-09-20T12:00:00Z</published><title>A &amp; B:
      Test</title><summary>Short abstract.</summary>
      <author><name>Ada Lovelace</name></author></entry></feed>`
    assert.deepEqual(parseArxivFeed(xml), [
      {
        title: 'A & B: Test',
        url: 'https://arxiv.org/abs/2609.01234v1',
        published: '2026-09-20T12:00:00Z',
        snippet: 'Ada Lovelace — Short abstract.',
      },
    ])
  })
})

describe('cninfo', () => {
  const list = [
    { code: '300750', orgId: 'GD165627', zwjc: '宁德时代' },
    { code: '600519', orgId: 'gssh0600519', zwjc: '贵州茅台' },
  ]

  it('finds a company by code or exact short name', () => {
    assert.equal(findStock(list, '300750')?.orgId, 'GD165627')
    assert.equal(findStock(list, ' 贵州茅台 ')?.code, '600519')
  })

  it('returns undefined for names it does not know', () => {
    assert.equal(findStock(list, '茅台'), undefined)
  })

  it('dates are Beijing dates, not UTC', () => {
    // 2026-07-25 00:00 Beijing is 2026-07-24 16:00 UTC.
    assert.equal(beijingDate(new Date('2026-07-24T16:00:00Z')), '2026-07-25')
  })
})

describe('Eastmoney', () => {
  it('reads the JSONP wrapper', () => {
    assert.deepEqual(unwrapJsonp('cb({"result":{"a":[1]}})'), { result: { a: [1] } })
  })

  it('drops filler words but never empties the query', () => {
    assert.equal(topicQuery('固态电池 最新进展'), '固态电池')
    assert.equal(topicQuery('宁德时代最新消息'), '宁德时代')
    assert.equal(topicQuery('最新消息'), '最新消息')
  })

  it('treats article times as Beijing time', () => {
    assert.equal(parseEastmoneyDate('2026-09-22 14:54:43'), '2026-09-22T14:54:43+08:00')
    assert.equal(parseEastmoneyDate(undefined), undefined)
  })
})

describe('Tavily backup', () => {
  const web = { name: 'web_search' } as SearchSource
  const news = { name: 'eastmoney_news' } as SearchSource
  const result = (name: string, hits: number, error?: string) => ({
    call: { id: name, name, args: {} },
    source: { name } as SearchSource,
    hits: error ? undefined : Array.from({ length: hits }, () => ({ title: 't', url: 'https://x.test' })),
    error,
  })

  it('runs when every call is empty or failed', () => {
    const call = backupCall('原油', [result('eastmoney_news', 0), result('arxiv_search', 0, 'HTTP 429')], [news, web])
    assert.deepEqual(call, { id: 'backup-web-search', name: 'web_search', args: { query: '原油' } })
  })

  it('does not run when anything was found, when already called, or when unavailable', () => {
    assert.equal(backupCall('q', [result('eastmoney_news', 3)], [news, web]), undefined)
    assert.equal(backupCall('q', [result('web_search', 0)], [news, web]), undefined)
    assert.equal(backupCall('q', [result('eastmoney_news', 0)], [news]), undefined)
  })

  it('maps days to Tavily time ranges', () => {
    assert.deepEqual([undefined, 1, 7, 30, 365].map(timeRange), [undefined, 'day', 'week', 'month', 'year'])
  })
})

describe('Sina fallback', () => {
  it('maps stock codes to Sina symbols', () => {
    assert.equal(sinaSymbol('600519'), 'sh600519')
    assert.equal(sinaSymbol('300750'), 'sz300750')
    assert.equal(sinaSymbol('832000'), 'bj832000')
  })

  it('parses the per-stock page and drops auto-generated price notes', () => {
    const html =
      "2026-09-22&nbsp;15:49&nbsp;&nbsp;<a target='_blank' href='https://finance.sina.com.cn/stock/aiassist/ggsp/x.shtml'>科威尔跌1.54%</a><br>" +
      "2026-09-22&nbsp;15:26&nbsp;&nbsp;<a target='_blank' href='http://finance.sina.com.cn/roll/y.shtml'>五连跌后，宁德时代收涨2.53%</a><br>"
    assert.deepEqual(parseStockNewsPage(html), [
      {
        title: '五连跌后，宁德时代收涨2.53%',
        url: 'https://finance.sina.com.cn/roll/y.shtml',
        published: '2026-09-22T15:26:00+08:00',
        snippet: '新浪财经',
      },
    ])
  })

  it('finds the company a query mentions, preferring the longest name', () => {
    const list = [
      { code: '300750', orgId: 'GD165627', zwjc: '宁德时代' },
      { code: '000001', orgId: 'x', zwjc: '平安银行' },
      { code: '601318', orgId: 'y', zwjc: '中国平安' },
    ]
    assert.equal(findCompanyIn(list, '宁德时代 储能')?.code, '300750')
    assert.equal(findCompanyIn(list, '300750 公告')?.code, '300750')
    assert.equal(findCompanyIn(list, '固态电池'), undefined)
  })

  it('eastmoney_news falls back to Sina per-stock news when Eastmoney fails', async () => {
    const realFetch = globalThis.fetch
    const requested: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      requested.push(new URL(url).host)
      if (url.includes('eastmoney.com')) return new Response('down', { status: 503 })
      if (url.includes('szse_stock.json')) {
        return Response.json({ stockList: [{ code: '300750', orgId: 'GD165627', zwjc: '宁德时代' }] })
      }
      if (url.includes('vCB_AllNewsStock/symbol/sz300750')) {
        const page = "2026-09-22&nbsp;15:26&nbsp;&nbsp;<a href='https://finance.sina.com.cn/roll/y.shtml'>宁德时代收涨</a>"
        return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      return new Response('unexpected', { status: 404 })
    }) as typeof fetch
    try {
      const eastmoney = selectSources({}).find(s => s.name === 'eastmoney_news')!
      const hits = await eastmoney.search({ query: '宁德时代 最新消息' }, new AbortController().signal)
      assert.deepEqual(
        hits.map(h => h.title),
        ['宁德时代收涨'],
      )
      assert.deepEqual(requested, [
        'search-api-web.eastmoney.com',
        'www.cninfo.com.cn',
        'vip.stock.finance.sina.com.cn',
      ])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('OpenAlex', () => {
  it('rebuilds an abstract from its inverted index', () => {
    assert.equal(rebuildAbstract({ HBM4: [0], doubles: [1], bandwidth: [2, 4], per: [3] }), 'HBM4 doubles bandwidth per bandwidth')
    assert.equal(rebuildAbstract(null), undefined)
  })

  it('stops at maxWords', () => {
    assert.equal(rebuildAbstract({ a: [0], b: [1], c: [2] }, 2), 'a b')
  })
})

describe('parsePubmedDate', () => {
  const cases: [string, string | undefined][] = [
    ['2026 Aug 18', '2026-08-18'],
    ['2026 Oct', '2026-10-01'],
    ['2026', '2026-01-01'],
    ['', undefined],
  ]
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(parsePubmedDate(input), expected)
    })
  }
})
