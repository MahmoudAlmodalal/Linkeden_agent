# LinkedIn Agent (`linkedin-agent`)

Automated LinkedIn personal branding and technical thought leadership pipeline powered by n8n, Google Gemini, Telegram human-in-the-loop review, and LinkedIn REST API.

---

## Architecture Overview

- **Decoupled Workflow Pipeline**:
  - **Workflow 1: Staging** (`workflows/workflow_1_staging.json`): Scheduled (Sun-Thu 10:00 AM) or triggered via `/webhook/generate`; selects topics, generates 5-element technical posts via Gemini, pairs visuals, and stages drafts to `data/pending_drafts.json`.
  - **Workflow 2: Publishing & Ingress** (`workflows/workflow_2_publishing.json`): Telegram webhook endpoint; handles command authorization, draft approval/rejection, situation ingestion, and executes 3-step LinkedIn media publishing.
- **Human-in-the-Loop Review**: All generated posts require approval from `TELEGRAM_ALLOWED_USER_ID` via Telegram commands or inline callback buttons before going live.
- **AI Resilience & Model Strategy**:
  - Primary text: `gemini-4-hydrogen` (with `gemini-3.8-flash` fast retry) via `@google/genai`.
  - Primary visual: `gemini-nano-banana-2.1` or branded HTML/Chromium card rendering.
  - Automatic fallbacks: Cloudflare Workers AI (`@cf/meta/llama-3.1-70b-instruct`, `@cf/black-forest-labs/flux-1-schnell`) and OpenRouter.
- **Dual Visual Asset Routing**: Local diagrams in `assets/` take precedence over AI generation to preserve architecture diagram fidelity.

---

## Directory Structure

- [workflows/](workflows): Declarative n8n JSON workflows (`workflow_1_staging.json`, `workflow_2_publishing.json`).
- [scripts/](scripts): Core runtime logic, engines, and CLI utilities.
  - `gemini_engine.js`: LLM prompt orchestration, model deprecation guards, and Cloudflare fallbacks.
  - `telegram_router.js`: Command parsing, access control, and state management.
  - `linkedin_publisher.js`: LinkedIn REST API 3-step publishing flow (`initializeUpload` -> binary upload -> create post).
  - `rag_engine.js` / `generate_rag_draft.js`: Grounded draft generation with domain context.
  - `card_content.js` / `generate_card_asset.js`: Branded 1080x1350 technical card generation via headless Chromium.
  - `topic_manager.js` / `topic_mode.js`: Topic rotation and deduplication.
  - `build_workflow_1.py` / `build_workflow_2.py`: Workflow compiler scripts.
  - `get_linkedin_token.mjs`: OAuth2 token retrieval server.
  - `register_telegram_webhook.mjs`: Webhook registration utility.
- [config/](config):
  - `post_topics.json`: Curated pool of technical topics (Arabic/English, architecture, backend, AI agents, clean code).
- [data/](data): Local persistence stores.
  - `pending_drafts.json`: Active drafts awaiting approval indexed by numeric Draft ID.
  - `post_history.json`: Historical log of staged and published posts.
  - `scenarios.json`: Submitted incident / architecture situation prompts.
  - `bot_state.json`: Reviewer multi-turn conversational state.
- [tests/](tests): Full unit/contract suite (`npm test`) verifying API payloads, routers, config integrity, and state management.
- [docs/](docs): Specification ([spec.md](docs/spec.md)), ADRs ([docs/adr](docs/adr)), and glossary ([GLOSSARY.md](GLOSSARY.md)).

---

## Telegram Reviewer Interface

- `/approve [id]`: Publishes specified draft to LinkedIn (defaults to latest draft if ID omitted).
- `/reject [id]`: Deletes specified pending draft from the queue.
- `/generate`: Triggers immediate generation of the next topic draft.
- `/situation [prompt]` or `/incident`: Seeds draft with a custom production scenario or architecture dilemma.
- `/edit [id] [text]`: Modifies text of a pending draft before approval (handled by Workflow 2's inline parser; the ESM `telegram_router.js` module does not implement it — see the parity test in `tests/workflow_callbacks.test.js`).
- **Inline Buttons**: Tap-to-approve, tap-to-reject, and show-preview image callbacks.

---

## Key Environment Variables

- `GEMINI_API_KEY`: Google Gemini API key.
- `TELEGRAM_BOT_TOKEN`: Telegram Bot authorization token.
- `TELEGRAM_ALLOWED_USER_ID`: Numeric Telegram user ID allowed to review and publish.
- `TELEGRAM_WEBHOOK_SECRET`: Secret header token validating incoming webhooks. Leave empty only until a real secret is configured; the container entrypoint re-registers the Telegram webhook with it on startup and warns when it is unset.
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`: LinkedIn Developer App credentials.
- `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_PERSON_URN`: OAuth2 user access token and target profile URN. Publishing fails with a clear warning at startup if the token is empty.
- `NGROK_AUTHTOKEN` / `NGROK_DOMAIN`: Tunnel configuration for public webhook ingress.
- `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`: Cloudflare Workers AI credentials (fallback).

---

## Common Development Commands

```bash
# Run unit and contract tests
npm test

# Generate LinkedIn OAuth access token
npm run auth:linkedin

# Set up Telegram bot command menu
npm run setup:telegram

# Compile n8n workflow definitions
python3 scripts/build_workflow_1.py
python3 scripts/build_workflow_2.py

# Launch local stack (n8n + Ngrok)
docker compose up -d
```
