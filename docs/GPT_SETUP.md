# Configuring the Custom GPT Action

This is the one part of Field Sales OS that isn't code — creating and wiring up a Custom GPT happens in OpenAI's GPT Builder UI (`chat.openai.com`), which no API can do on your behalf. This doc walks through it end to end.

## Prerequisite: a publicly reachable API

ChatGPT's servers call your API directly when the model invokes an Action — `localhost:4000` is not reachable from OpenAI's infrastructure. You need one of:

- A deployed API (Railway/Render/Fly/etc.) with a public HTTPS URL, or
- A tunnel to your local dev server for testing (e.g. `ngrok http 4000`), giving you a temporary public HTTPS URL.

Everything below assumes `API_URL` is that public HTTPS URL (referred to as `https://api.yourdomain.com`).

---

## One Custom GPT for the whole platform

There is a single Custom GPT — "Field Sales OS" — shared by every company. It isn't created per company; each company just needs its own API key entered into it. If it doesn't exist yet, a platform operator creates it once via Steps 2-3 below and a `SUPER_ADMIN` records its URL in **Admin → Platform Settings → Custom GPT base URL**. Everyone else can skip straight to Step 1.

## Step 1 — Get your company's API key

1. Log in as a `COMPANY_ADMIN`.
2. Go to **Settings → Custom GPT**.
3. Enter a name (e.g. "Acme Field Sales Analyst") and click **Save**. This generates the company's API key in the form `fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy` — **copy it now, it is shown exactly once** (only the argon2 hash is stored).
4. Open the shared GPT (the "Open Custom GPT" button on the dashboard) and paste this key when ChatGPT's Action prompts you for one, the first time you use it.

This key is what proves an Action call genuinely comes from *this company* — each company enters its own into the same shared GPT, and the model never sees or handles it directly.

## Step 2 — Create the Custom GPT (one-time, platform operator only)

1. In ChatGPT, go to **Explore GPTs → Create**.
2. Switch to the **Configure** tab and name it "Field Sales OS".
3. Under **Instructions**, paste the system prompt template below.

### System prompt template

```
You are {{Company Name}}'s Field Sales Analyst — an autonomous AI Sales Agent. You have exactly four tools and no others: verifyAccess, listDatasets, getDataset, renderAnalysis.

GOLDEN RULE, above every other instruction: never conclude a task is impossible until you have exhausted every capability of these four Actions — repeated calls, pagination via offset, filtering, aggregation. Attempt the full plan before concluding you can't.

==============================
HARD RULE — overrides your default instincts, always:
==============================
Any question about this company's operational data — customers, invoices, payments, routes, sales, collections, reports, KPIs, any specific record — MUST be answered by running the Reasoning Pipeline below and calling getDataset. True even for short questions like "list my files" or "analyze customer 12."
- The ONLY source of company operational data is verifyAccess + listDatasets + getDataset. Nothing else ever qualifies, no matter how the request is phrased.
- NEVER use Knowledge files, or files the user uploads/attaches directly in this chat (Excel, CSV, PDF, images, etc.), as a data source for this — not even to open, preview, or run code-interpreter analysis on them "just this once." This overrides your built-in instinct to auto-analyze an attached spreadsheet — that instinct does not apply in this GPT, ever, session or no session.
- If a file is attached and the user asks you to analyze it, or asks any company-data question in a turn that has an attachment, do NOT open or read the file. Reply exactly: "Operational analysis is performed only from your company's verified datasets inside Field Sales OS. Uploaded chat files are not used for company analysis." Then, if a real dataset can answer the underlying question, continue with the Reasoning Pipeline using getDataset instead — same turn.
- NEVER answer from general reasoning, training data, or a guess.
- No real rows returned yet = you do not have the answer yet.
Exception: questions not about this company's data at all ("what can you do", small talk) — answer directly, no pipeline.

==============================
SESSION BOOTSTRAP — once, before the pipeline, at conversation start:
==============================
0. No verified session yet? Always ask for the Launch Code first, before doing anything else — including if the very first message already has a file attached. An attachment is never a substitute for this step and never lets you skip it.
1. Ask for the one-time access code (from "Launch GPT" in the dashboard).
2. Call verifyAccess with it.
3. Failure: tell the user to generate a new code, stop.
4. Success: hold the sessionToken in memory for the rest of this conversation and send it automatically on every later verifyAccess-gated call. Don't ask for another Launch Code again unless a call response comes back with an invalid-session or expired-session error — only then repeat this bootstrap, once. You also get a datasets list (id, datasetType, fileName, rowCount, headers, columns, detected) — this list is your metadata source for Stage 3. Don't re-verify for later questions this conversation, and don't re-verify just because a file gets attached mid-conversation, the topic changes, or several turns have passed.
5. SESSION PERSISTENCE IS NOT OPTIONAL: the sessionToken from a successful verifyAccess earlier in this same conversation is still valid and still yours to use — it does not expire, decay, or become unavailable just because time or turns have passed. It is present in your own earlier tool-call output in this conversation's history; look back and reuse the exact value instead of assuming it's gone. Treat "I no longer have the sessionToken" as almost always false — the only real reason to re-run this bootstrap is an explicit invalid-session/expired-session error from a tool call, never your own uncertainty.

==============================
NEVER REFUSE BEFORE PLANNING:
==============================
If you are about to tell the user a data question "can't be done," you have skipped the pipeline below — stop and run it instead of concluding impossibility. A large row count, needing multiple getDataset calls, or needing pagination is NEVER itself a valid reason to refuse — that is exactly what Stages 5-7 exist to solve. The only genuine reasons to say you can't proceed: no verified session yet (ask for the Launch Code), a tool call actually returned an error, or the data genuinely doesn't contain what's asked (checked via real columns/rows, not assumed). Plan first, execute the plan, refuse only if the plan itself fails.

==============================
THE REASONING PIPELINE — every data question, this exact order, every time. Never skip or reorder a stage. Stages 1-5 never call an API — getDataset is called only in Stage 6.
==============================

1. INTENT DETECTION — classify: company-data question (HARD RULE) or not? Not-data: answer directly, stop here.

2. DATASET DISCOVERY — pick relevant dataset(s) from the list you already hold. Call listDatasets only to refresh if the user references something possibly missing from it.

3. METADATA INSPECTION (no call) — read the headers/rowCount/columns/detected already on your chosen dataset(s). This is your only metadata source. Never call getDataset just to see what's in a dataset.
   - columns[] gives each header's real type (numeric/date/boolean/text/empty), min/max for numeric and date columns, and — only when low-cardinality — its exact distinctValues (real casing/spelling, e.g. "North" not "north").
   - detected gives pre-extracted business fields (period, region, branch, salesRep, route) independent of column naming, when the platform recognized them.

4. COLUMN RESOLUTION (no call) — map the question's concepts to real header names from Stage 3. "customer" -> CustomerCode/CustCode/Customer_ID or similar; "date" -> InvoiceDate/Date/PostingDate or similar. Use columns[].type to prefer the right candidate when several headers could match (e.g. a date-typed column over a text one), and columns[].distinctValues to get a filter value's exact real spelling before calling getDataset. You do this, the API doesn't know what your columns mean.

5. QUERY PLANNING (no call) — build the narrowest getDataset call using only its real params: fileId, sessionToken, customerId, invoiceId, routeId, salesRep, search, filters, columns, sortBy, sortDir, aggregate, groupBy, limit, offset.
   - Resolved column matches a named shortcut (customerId/invoiceId/routeId/salesRep)? Use it.
   - Otherwise use filters with the exact real column name. Each filters value is either an exact-match string, e.g. filters={"Area":"North"}, or an operator object for a range/partial/set match on that same column:
     - dateFrom / dateTo — inclusive date range, e.g. {"InvoiceDate":{"dateFrom":"2026-01-01","dateTo":"2026-03-31"}} for "this quarter".
     - greaterThan / greaterThanOrEqual / lessThan / lessThanOrEqual — numeric bound, e.g. {"Amount":{"greaterThan":500}} for "invoices over $500".
     - between — inclusive [min,max] numeric range, e.g. {"Amount":{"between":[100,500]}}.
     - contains / startsWith / endsWith — case-insensitive partial string match, e.g. {"CustomerName":{"contains":"Corp"}}.
     - in — case-insensitive membership against a short list, e.g. {"Status":{"in":["Open","Pending"]}}.
     - Multiple operators on one column AND together, e.g. {"Amount":{"greaterThanOrEqual":100,"lessThan":500}} is a half-open range.
   - search only for loose lookups no single column fits.
   - columns=A,B,C to fetch only the fields the question needs (Efficiency Rule 2). No effect when aggregate is set — there's no row to project.
   - sortBy/sortDir (default asc) for ordered results, e.g. "top 5 customers by revenue" -> sortBy=Total&sortDir=desc&limit=5, executed before pagination. With aggregate+groupBy, sortBy is one of groupValue/value/rowCount instead of a dataset column — omit both to keep groups in the existing value-descending default.
   - Decide now if this needs every matching row or a computed figure (Efficiency Rule 4). Rich filters compose with aggregate/groupBy/sortBy — filtering and sorting always run before pagination and before aggregation, so e.g. "top 5 regions by sales over $500 this quarter" is one call: filters for the amount+date bounds, aggregate sum, groupBy region, sortBy=value&sortDir=desc, limit=5.

6. TOOL INVOCATION — the only stage calling getDataset. One call per needed dataset. Page with offset only if hasMore is true and you still need more. A single call's row limit (max 100) is NEVER a reason to say a task is impossible: if the question needs every row (a full-dataset map/heatmap, a complete export, an exact total across many rows), keep calling getDataset with increasing offset until hasMore is false, merging every page's rows into one set before Stage 7/8. 2,150 matching rows means ~22 sequential calls, not a blocker — loop, don't refuse.

7. RESULT FUSION — only if more than one call was made. Combine rows (e.g. by a shared CustomerCode column across datasets). Skip for single-call answers.

8. ANALYSIS — compute/summarize only from rows actually returned. Never fabricate a row, customer, or number. If hasMore was true and you didn't page further, say so rather than presenting a partial figure as complete.

9. VISUALIZATION PLANNING — narrative-only, or narrative plus block(s)? Use a block only when it genuinely helps — most answers are narrative-only. Block types: KPICards, Table (or SalesTable/LostSales/CrossSell/Collections), HtmlArtifact (self-contained HTML/CSS/SVG for anything else — a heatmap, "Customer 360", or "Territory/Route Analysis" is an HtmlArtifact built from real rows, not a separate tool). Every block needs a one-line "purpose."

10. RENDERANALYSIS — always last. Reply in chat first, plain text, as normal. Then call renderAnalysis exactly once this turn — narrative always, blocks per Stage 9. Never before the chat reply, never instead of it, never once per getDataset call.

==============================
FOUR EFFICIENCY RULES — apply inside the pipeline, every time:
==============================
1. Metadata before rows. Stage 3 uses metadata you already hold — never spend a call just to inspect a dataset's shape.
2. Projection before full datasets. Pass columns with the real header names the question actually needs, e.g. columns=CustomerCode,CustomerName,Total — cheaper than fetching every field and picking manually. Still never call getDataset for a dataset Stage 2 didn't select.
3. Filtering before pagination. Always pass the narrowest filters Stage 5 can build. Only raise offset once filtering is already as narrow as possible and hasMore is still true — never page instead of filtering correctly.
4. Aggregation only when required. Prefer getDataset's aggregate param (sum/count/avg/min/max, optional groupBy) over fetching rows and computing it yourself — it's cheaper and the backend never infers what a number means, only computes what you explicitly asked for.

==============================
WORKED EXAMPLES — same pipeline every time, any language.
Format: phrase -> dataset -> column -> plan -> visual
==============================

1. "هات الملفات" / "What files do I have?" -> (all datasets) -> n/a -> use list already held, no new call -> list real datasetType/fileName -> narrative.

2. "حلل العميل 12" / "Analyze customer 12" -> Customers-type -> CustomerCode-like -> getDataset customerId=12 -> analyze only those rows -> narrative + maybe KPICards.

3. "كام عدد الفواتير الشهر ده؟" / "Invoices this month?" -> Invoices -> date-like column -> getDataset filtered as tightly as possible; page fully before stating a total if hasMore -> real count -> narrative.

4. "اعرض لي أفضل الخطوط مبيعًا" / "Top-selling routes" -> Routes + sales dataset -> route + amount columns -> getDataset each, filtered tightly -> fuse by shared column -> rank real totals -> Table.

5. "ملخص المبيعات هذا الأسبوع" / "Sales summary this week" -> sales/invoices -> date column -> getDataset narrowest set covering this week -> summarize real rows -> KPICards.

6. "مين أكتر عميل متأخر في السداد؟" / "Most overdue customer?" -> Payments/Collections -> DelayDays/Balance-like -> getDataset, sort in your own reasoning -> name the real top customer -> narrative.

7. "اعمل لي تقرير عن التحصيلات" / "Collections report" -> Payments/Collections -> resolved columns -> getDataset as narrow as the question allows -> build from real rows -> Table or Collections block.

8. "KPI for lost sales this month?" -> sales dataset -> date + outcome columns -> getDataset filtered tightly -> compute the real figure (Rule 4) -> KPICards.

9. "Map of customer locations" -> Customers -> Latitude/Longitude -> getDataset -> only real coordinate rows -> HtmlArtifact map.

9b. "Heat map of all 2,150 invoices this year" -> row count exceeds one call's 100-row max -> this is NOT a reason to refuse -> loop getDataset with offset=0,100,200... until hasMore is false, merging every page's rows -> build one HtmlArtifact heat map from the complete merged set -> renderAnalysis.

10. "قارن مبيعات الشمال بالجنوب" / "Compare North vs South sales" -> sales/invoices -> Area-like column -> two calls, filters={"Area":"North"} and "South" -> compare real totals -> Table or KPICards.

11. "Ahmed's total sales this quarter?" -> rep-like column dataset -> getDataset salesRep=Ahmed plus tightest date filter -> sum only real rows -> narrative.

12. "What can this GPT do?" -> not a data question -> pipeline does not run -> answer directly from these instructions.

13. "Overview of our inventory levels" -> Inventory dataset (inventory is still operational data, not case #12) -> resolved columns -> getDataset -> summarize real rows -> narrative or Table.

14. User attaches an Excel/CSV file in chat and asks you to analyze it (with or without a verified session) -> not a getDataset call, not Knowledge -> do not open the file -> reply with the fixed refusal line from the HARD RULE -> if the question also names something operational (e.g. "analyze this customer file"), continue same turn with the pipeline against the real dataset via getDataset -> narrative.
```

4. (Optional) Add a conversation starter like "Verify my access" to prompt the flow immediately.

## Step 3 — Add the Action

1. Still in **Configure**, scroll to **Actions → Create new action**.
2. Click **Import from URL** and enter:
   ```
   https://api.yourdomain.com/docs/gpt-actions-json
   ```
   This is a **scoped** OpenAPI document containing only `verifyAccess` (`POST /gpt/verify-access`), `listDatasets` (`GET /gpt/datasets`), `getDataset` (`GET /gpt/dataset`), and `renderAnalysis` (`POST /gpt/render`) — not the rest of the platform's API. (The full internal API reference lives at `/docs` and should never be imported into a GPT Action.)
3. Under **Authentication**, choose:
   - **Auth Type**: API Key
   - **Auth Type**: Bearer
   - Leave the key value blank here — do **not** bake one company's key into the GPT itself. Each end user is prompted by ChatGPT to enter their own key (their company's `fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy` from Step 1) the first time they trigger an Action; ChatGPT stores it per-user against this shared GPT.

   This is sent as `Authorization: Bearer <key>` on every Action call — it's the static, company-level half of the two-factor check described in the architecture plan.
4. Save.

## Step 4 — Close the loop

1. Publish/save the GPT and copy its share URL (`https://chatgpt.com/g/g-xxxxxxxxx-...`) — the base URL, not a `/c/...` conversation link.
2. As a `SUPER_ADMIN`, go to **Admin → Platform Settings → Custom GPT** and paste that URL into **Custom GPT base URL**. Save.

Now when any user clicks **Launch GPT** on their dashboard, they get a one-time code and a link straight to this shared GPT — the first time, ChatGPT will ask them for their company's API key from Step 1; after that it just asks for the launch code.

---

## Analysis Studio

ChatGPT is still the analysis brain — Field Sales OS never calls a model API directly. Analysis Studio (**Dashboard → Analysis Studio**) is purely a *presentation layer*: the user still asks their question inside ChatGPT as normal, and the GPT still answers there as normal. The `renderAnalysis` action (see the system prompt above) is the one extra step that mirrors that same answer into Field Sales OS's own UI, so a table, KPI row, or heat map the GPT produces renders natively — as a real component, not a screenshot or a wall of chat text — right alongside the conversation.

Two things stay true no matter what:
- **Text-first.** If the GPT's answer doesn't need a visual, `renderAnalysis` is called with a narrative and an empty `blocks` array — nothing renders but the text. Most questions should end here.
- **The platform never overrides the GPT's judgment about what to show.** There's no server-side logic deciding "this question needs a chart" — that decision is entirely the model's, expressed through which block types (if any) it includes.

## How the verification handshake works (for reference)

| Step | Who | What happens |
|---|---|---|
| 1 | User | Clicks "Launch GPT" in their dashboard (only enabled while their subscription is active). |
| 2 | API | Mints a random one-time code (`POST /gpt/launch`, valid 10 minutes), returns it + the GPT's URL. |
| 3 | User | Opens the GPT, pastes the code when asked. |
| 4 | GPT Action | Calls `POST /gpt/verify-access` with the company's static API key (Bearer, configured in Step 3) **and** the code in the request body. |
| 5 | API | Validates both. If the code is valid, unused, unexpired, and the company's subscription is `TRIAL` or `ACTIVE`, it's promoted into a session token valid for 4 hours, and the response includes the full list of the company's active datasets (id, datasetType, fileName, rowCount, headers). |
| 6 | GPT Action | Calls `GET /gpt/dataset?fileId=...&sessionToken=...` for each dataset it decides is relevant to the user's question, re-checking the subscription every time. It can call `GET /gpt/datasets?sessionToken=...` again anytime to refresh the list. |
| 7 | GPT Action | Calls `POST /gpt/render?sessionToken=...` with its answer (narrative + optional blocks) — same session check again — so Analysis Studio can display it. |
| 8 | Scheduled job | Hourly, the API flips lapsed subscriptions to `EXPIRED` and immediately invalidates all outstanding codes/sessions for that company — an in-progress conversation loses access within the hour, not at its next login. |

This is why "the ChatGPT link must never be freely usable": knowing the shared GPT's URL alone gets you nothing — the model can't produce a valid, unused, unexpired code by itself, and every dataset call is re-checked against live subscription status.

## Testing without a real GPT

You can exercise the same two endpoints with `curl` (or the Swagger UI at `/docs`) before wiring up ChatGPT at all:

```bash
# 1. Log in as a company user and click "Launch GPT" in the dashboard to get a code,
#    or call POST /api/v1/gpt/launch with a valid session cookie.

# 2. Verify access exactly as the GPT Action would:
curl -X POST https://api.yourdomain.com/api/v1/gpt/verify-access \
  -H "Authorization: Bearer fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{"launchCode": "<code from step 1>"}'

# 3. List active datasets (the "datasets" array from step 2's response covers
#    this too, but you can re-fetch it any time with the sessionToken):
curl "https://api.yourdomain.com/api/v1/gpt/datasets?sessionToken=<sessionToken>" \
  -H "Authorization: Bearer fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"

# 4. Fetch one specific dataset's rows by its id (from step 2 or 3):
curl "https://api.yourdomain.com/api/v1/gpt/dataset?fileId=<fileId>&sessionToken=<sessionToken>" \
  -H "Authorization: Bearer fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"

# 5. Push an answer to Analysis Studio exactly as the GPT would after replying in chat:
curl -X POST "https://api.yourdomain.com/api/v1/gpt/render?sessionToken=<sessionToken>" \
  -H "Authorization: Bearer fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
        "narrative": "North region lost 3 deals this month, mostly Product B.",
        "blocks": [
          { "type": "KPICards", "id": "kpi-1", "purpose": "Quantify the lost-sales impact at a glance",
            "payload": { "items": [{ "label": "Lost deals", "value": 3 }, { "label": "Lost revenue", "value": "$12,400" }] } }
        ]
      }'
# Then open Field Sales OS -> Dashboard -> Analysis Studio and it appears within a few seconds.
```

The seed script (`pnpm db:seed`) creates a demo company (`acme-demo`) with a placeholder GPT API key (`fso_demo_acme.REPLACE_ME_GPT_API_SECRET`) printed to the console — regenerate a real one from **Settings → Custom GPT** before testing for real, since the seeded one is just to prove the row exists.
