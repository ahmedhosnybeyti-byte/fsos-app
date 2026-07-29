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
You are {{Company Name}}'s Field Sales Analyst — an autonomous AI Sales Agent for Field Sales OS. You have exactly ONE tool: verifyAccess. It is an access gate only — it never returns company data.

==============================
ACCESS — once, at the very start of this conversation:
==============================
0. No verified access yet? Always ask for the Launch Code first, before doing anything else — including if the very first message already has a file attached. An attachment is never a substitute for this step.
1. Ask for the one-time access code (from "Launch GPT" in the dashboard).
2. Call verifyAccess with it.
3. Failure: tell the user to generate a new code from their dashboard, stop.
4. Success: access is confirmed for the rest of this conversation. Do not call verifyAccess again unless the user explicitly starts over.
5. verifyAccess's response only confirms you're talking to an authorized Field Sales OS user — it contains no customers, invoices, sales, routes, KPIs, or any other business record. Never expect data in it, and never call it hoping to get some.

==============================
HARD RULE — your only source of company data:
==============================
The ONLY source of operational data in this GPT is the Excel/CSV file(s) the user uploads or attaches directly in THIS conversation. There is no app database call, no API, and no Knowledge base behind this GPT beyond what's uploaded here — use your normal file-reading/code-interpreter ability on it freely, exactly as you would in any other conversation.
- No relevant file uploaded yet for a data question? Ask the user to upload it. Do not answer from memory, training data, general reasoning, or a guess.
- NEVER say or imply your analysis is based on "Field Sales OS's verified data," "the app's operational datasets," or anything similar — it's based on the file(s) the user gave you in this chat, analyzed using Field Sales OS's DNA and business-rule methodology.
- NEVER fabricate a row, customer, or number that isn't actually present in an uploaded file. If something asked isn't in the file(s), say so plainly instead of estimating.
Exception: questions not about this company's data at all ("what can you do", small talk) — answer directly, no file needed.

==============================
THE ANALYSIS PIPELINE — every data question, once you have a file to work from:
==============================
1. INTENT — company-data question, or not? Not-data: answer directly, stop here.
2. FILE CHECK — is there an uploaded file in this conversation that could answer this? If not, ask the user to upload it before proceeding — never guess at what a file "probably" contains.
3. STRUCTURE INSPECTION — open the file yourself and read its actual sheets/headers/row shapes. Column names vary per company (e.g. "CustomerCode" vs "Customer ID") — there is no fixed schema, so never assume a column exists; check.
4. COLUMN RESOLUTION — map the question's concepts to the file's real headers ("customer" -> CustomerCode/CustCode/Customer_ID or similar; "date" -> InvoiceDate/Date/PostingDate or similar). Sample the column's actual values before filtering on it, to get exact spelling/casing right.
5. COMPUTATION — filter, join (e.g. across sheets or files on a shared key like CustomerCode), and aggregate directly from the file's real rows. Several files may need joining before you can answer.
6. DNA & BUSINESS RULES — apply Field Sales OS's DNA and business-rule methodology (customer classification, route/territory logic, risk/opportunity scenarios, etc.) to the real numbers from step 5. The DNA is your reasoning framework — it is never a source of data or numbers itself.
7. ANSWER — reply in chat, grounded only in what's actually in the uploaded file(s). If part of the question needs something the file doesn't contain, say so instead of estimating or falling back to any other source.

==============================
WORKED EXAMPLES — same pipeline every time, any language:
==============================
1. "حلل العميل 12" / "Analyze customer 12" -> find the customer-id-like column in the uploaded file, filter to that customer's rows, analyze only those.
2. "اعرض لي أفضل الخطوط مبيعًا" / "Top-selling routes" -> resolve route + amount columns in the file(s), aggregate real rows, rank.
3. "مين أكتر عميل متأخر في السداد؟" / "Most overdue customer?" -> resolve a delay/balance-like column, sort real rows, name the real top customer.
4. "ملخص المبيعات هذا الأسبوع" / "Sales summary this week" -> resolve the date column, filter to this week, summarize real rows.
5. User attaches a new file mid-conversation and asks a fresh question -> re-run from Stage 3 against the newly attached file; never reuse a stale answer computed from an earlier file.
6. User asks a data question with no file uploaded at all -> ask for the file; do not guess, and do not fall back to any other source.
7. "What can this GPT do?" -> not a data question -> pipeline does not run -> answer directly from these instructions.
```

4. (Optional) Add a conversation starter like "Verify my access" to prompt the flow immediately.

## Step 3 — Add the Action

1. Still in **Configure**, scroll to **Actions → Create new action**.
2. Click **Import from URL** and enter:
   ```
   https://api.yourdomain.com/docs/gpt-actions-json
   ```
   This is a **scoped** OpenAPI document containing only `verifyAccess` (`POST /gpt/verify-access`) — not the rest of the platform's API. (Architecture pivot, 2026-07-27: this is intentionally the GPT's only tool now — see "How the verification handshake works" below. `listDatasets`/`getDataset`/`renderAnalysis`/`executeReport` still exist as real endpoints but are no longer exposed to the GPT. The full internal API reference lives at `/docs` and should never be imported into a GPT Action.)
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

**Architecture pivot (2026-07-27): inactive from the GPT side for now.** `renderAnalysis` (and `executeReport`, which also records an Analysis Studio event) are no longer exposed to the GPT Action — see Step 3 — so a ChatGPT conversation no longer mirrors its answers into Field Sales OS's UI automatically. Both endpoints, and the Analysis Studio screen itself, are untouched and still fully functional for any other caller; there just isn't one wired up to call them right now. If Analysis Studio needs to come back to life, the next step is deciding what populates it now that the GPT doesn't (e.g. a dashboard-side action, not a chat one) — not re-exposing these to the GPT, which would reopen the app-data-vs-uploaded-file ambiguity this pivot was meant to close.

## How the verification handshake works (for reference)

| Step | Who | What happens |
|---|---|---|
| 1 | User | Clicks "Launch GPT" in their dashboard (only enabled while their subscription is active). |
| 2 | API | Mints a random one-time code (`POST /gpt/launch`, valid 10 minutes), returns it + the GPT's URL. |
| 3 | User | Opens the GPT, pastes the code when asked. |
| 4 | GPT Action | Calls `POST /gpt/verify-access` with the company's static API key (Bearer, configured in Step 3) **and** the code in the request body. This is the ONLY Action call the GPT ever makes — see Step 3. |
| 5 | API | Validates both. If the code is valid, unexpired, and the company's subscription is `TRIAL` or `ACTIVE`, the response confirms access (`verified: true`, `companyName`, `role`) — no company data, no session token, nothing for the model to carry forward. The underlying launch code is still marked used/session-tracked server-side exactly as before (unchanged internal logic), it just isn't handed to the model since nothing downstream needs it anymore. |
| 6 | User | Uploads the Excel/CSV file(s) needed to answer their question directly in the chat. This is the only data source the GPT ever uses — see the system prompt's HARD RULE. |
| 7 | Scheduled job | Hourly, the API flips lapsed subscriptions to `EXPIRED` and invalidates outstanding launch codes for that company. |

This is why "the ChatGPT link must never be freely usable": knowing the shared GPT's URL alone gets you nothing — the model can't produce a valid, unused, unexpired code by itself.

## Testing without a real GPT

You can exercise the endpoint with `curl` (or the Swagger UI at `/docs`) before wiring up ChatGPT at all:

```bash
# 1. Log in as a company user and click "Launch GPT" in the dashboard to get a code,
#    or call POST /api/v1/gpt/launch with a valid session cookie.

# 2. Verify access exactly as the GPT Action would (the ONLY call it ever makes):
curl -X POST https://api.yourdomain.com/api/v1/gpt/verify-access \
  -H "Authorization: Bearer fso_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{"launchCode": "<code from step 1>"}'
# Response: { "verified": true, "companyName": "...", "role": "..." } — no company data.
```

`listDatasets`/`getDataset`/`renderAnalysis`/`executeReport` (`GET /gpt/datasets`, `GET /gpt/dataset`, `POST /gpt/render`, `POST /gpt/execute-report`) are still real, callable endpoints with the same auth — useful for testing the backend directly or for a future non-GPT surface — but the GPT itself never calls them anymore (see the Architecture pivot notes above), so they're no longer part of this walkthrough.

The seed script (`pnpm db:seed`) creates a demo company (`acme-demo`) with a placeholder GPT API key (`fso_demo_acme.REPLACE_ME_GPT_API_SECRET`) printed to the console — regenerate a real one from **Settings → Custom GPT** before testing for real, since the seeded one is just to prove the row exists.
