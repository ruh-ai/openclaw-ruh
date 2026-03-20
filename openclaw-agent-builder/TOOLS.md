# TOOLS.md — Native OpenClaw Tools Reference

This file is the **source of truth** for tools that are natively available in the OpenClaw runtime. Every agent running on OpenClaw has access to these tools **without any API keys, external dependencies, or additional configuration**.

## Why This File Matters

When the Architect designs a skill graph or the Builder generates SKILL.md files, they MUST check this file first. **If a native tool can fulfill a capability, it MUST be used instead of generating a skill that calls an external API.**

---

## Native Tools (Always Available)

### WebSearch
- **What it does:** Searches the web and returns results
- **Use for:** Finding current information, weather, news, facts, documentation, prices, events
- **No API key required** — built into the OpenClaw runtime
- **Replaces:** Brave Search API, Tavily API, SerpAPI, Google Custom Search, Bing Search API
- **Example use in SOUL.md:** "Use the WebSearch tool to look up current weather for the user's city"

### WebFetch
- **What it does:** Fetches content from a URL and processes it
- **Use for:** Reading web pages, extracting data from URLs, scraping public endpoints
- **No API key required** — built into the OpenClaw runtime
- **Replaces:** curl to public web pages, requests.get() for HTML content
- **Example use in SOUL.md:** "Use WebFetch to read the content at the given URL"

### exec / Bash
- **What it does:** Executes shell commands (bash/python/node)
- **Use for:** Running scripts, processing data, file operations, API calls via curl
- **No API key required**
- **Note:** Skills with inline exec commands use this tool implicitly

### message
- **What it does:** Sends messages via configured channels (Telegram, Slack, Discord, etc.)
- **Use for:** Notifications, alerts, daily digests, delivery of results
- **No API key required** (uses pre-configured channel integrations)
- **Replaces:** Direct Telegram Bot API calls, Slack webhook scripts
- **Example:** `message(action="send", channel="telegram", target="...", message="...")`

### Read / Write / Edit
- **What it does:** File system operations — read, write, and edit files
- **Use for:** Reading config files, writing output, editing templates
- **No API key required**

### Glob / Grep
- **What it does:** File search and content search
- **Use for:** Finding files by pattern, searching content across files
- **No API key required**

---

## Tool-to-Capability Mapping

Use this table when deciding whether to generate an external API skill or use a native tool:

| Capability Needed | Native Tool | DO NOT generate skill using |
|---|---|---|
| Web search / lookup | `WebSearch` | Brave API, Tavily, SerpAPI, Google CSE, Bing API |
| Fetch web page content | `WebFetch` | curl to HTML pages, requests + BeautifulSoup |
| Send notifications | `message` | Direct Telegram API, Slack webhooks, Discord API |
| Run shell commands | `exec` | subprocess.run(), os.system() wrappers |
| Read/write files | `Read` / `Write` | Custom file I/O skills |
| Search files | `Glob` / `Grep` | find/grep wrapper skills |

---

## When External APIs ARE Needed

Native tools do NOT cover everything. You MUST use external API skills when:

- **Structured API access** — Jira REST API, GitHub API, Linear API (these return structured data, not web pages)
- **Authentication-gated services** — APIs requiring OAuth, API keys for data access (not search)
- **Data ingestion** — Writing to the data-ingestion service (always use `data-ingestion-openclaw` skill)
- **User explicitly requests a specific provider** — If user says "use Tavily for search", respect that choice

---

## Environment-Specific Notes

Add your setup-specific tool notes below:

```markdown
### Example
- SSH hosts, camera names, preferred TTS voices, etc.
```

---

**This file is read by the Architect and Builder agents. Keep it updated when new native tools are added to OpenClaw.**
