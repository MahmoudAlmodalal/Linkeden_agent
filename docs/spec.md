# Specification: Automated LinkedIn Personal Branding System

## Problem Statement

Software engineers seeking career growth and recruitment visibility on LinkedIn face significant friction in consistently authoring high-signal, deep-dive technical content with engaging visuals. Manually brainstorming topics, composing in-depth architecture explanations, creating diagrams, and maintaining a regular posting schedule is time-intensive. Furthermore, existing social media scheduling tools lack automated technical composition capabilities and fail to provide an immediate, mobile-first human-in-the-loop review mechanism with simple command approvals before posts go live to personal profiles.

## Solution

An automated system that orchestrates technical content generation, AI visual synthesis, mobile-first review via Telegram, and publishing to LinkedIn personal profiles. The system operates on a scheduled cadence (Sunday to Thursday at 10:00 AM) and on demand via Telegram commands. It pulls curated technical topics, generates structured breakdowns with Google Gemini, pairs them with either conceptual AI visuals or priority local diagrams, and assigns a sequential Draft ID to the pending draft. The reviewer receives the draft and visual directly in Telegram, retaining complete human control to approve, reject, or request new generations using simple text commands (`/approve [id]`, `/reject [id]`, `/generate`). Upon approval, the asset is uploaded to LinkedIn via the Media Assets API, published as a rich post, and verified with a live URL sent back to the reviewer.

## User Stories

1. As an engineering professional, I want the system to automatically generate deep-dive technical explanations based on curated software architecture and clean code topics, so that I can establish technical thought leadership on LinkedIn without writing every post from scratch.
2. As a reviewer, I want to receive generated drafts directly in my private Telegram chat with the accompanying visual, so that I can review upcoming publications on my mobile phone from anywhere.
3. As an engineering professional, I want each generated post to follow a structured framework (Hook, Deep-dive, Takeaways, Call to Action, and relevant hashtags), so that my content effectively engages tech recruiters and engineering leaders.
4. As an allowed reviewer, I want to approve a draft using a simple Telegram text command (`/approve [id]`), so that the draft is published to LinkedIn without having to log into a management dashboard or click complex interfaces.
5. As an allowed reviewer, I want to reject a draft using `/reject [id]`, so that unsuitable content is deleted from the queue and prevented from being posted.
6. As an allowed reviewer, I want to trigger an immediate draft generation using `/generate`, so that I can produce and review a new post on demand outside the scheduled cron window.
7. As an allowed reviewer, I want plain `/approve` without an ID to default to the latest pending draft, so that I can quickly approve the most recent draft with minimal typing.
8. As a content curator, I want the system to assign a sequential numeric Draft ID to each pending draft, so that I can manage and approve multiple pending drafts out of order without collision.
9. As a developer, I want the system to preserve local technical diagrams from an `assets/` directory over AI-generated images whenever a matching asset exists, so that complex system design diagrams and architecture charts retain complete visual fidelity.
10. As a content curator, I want AI-generated conceptual graphics generated via Google Gemini Imagen when no local asset is provided, so that every post consistently has a striking visual element.
11. As an engineer targeting a regional and international audience, I want posts authored in professional Arabic enriched with standard English programming terminology, so that I can maximize engagement within the regional engineering community.
12. As an engineer, I want the ability to configure the language (`ar` or `en`) per topic in `post_topics.json`, so that I can selectively publish international English posts when targeting global recruiters.
13. As a LinkedIn user, I want the system to publish to my personal profile using LinkedIn OAuth2 and the official 3-step Media Assets API (`initializeUpload`, binary upload, post creation), so that posts appear natively on my personal profile with high-resolution imagery.
14. As an allowed reviewer, I want to receive the live LinkedIn post URL back in Telegram immediately after successful publication, so that I can verify the live post and respond to early comments.
15. As an allowed reviewer, I want the system to notify me via Telegram if publishing to LinkedIn fails (such as an expired token or rate limit) and keep the draft pending, so that I can fix the issue and retry approval without losing the generated content.
16. As a security-conscious owner, I want the bot to reject any commands originating from Telegram user IDs other than my verified allowed ID, so that unauthorized users cannot trigger or publish posts.
17. As an operator, I want the automation running locally inside Docker containers alongside a persistent Ngrok tunnel, so that incoming Telegram webhooks and OAuth redirects function reliably without exposing open ports or complex public server setups.
18. As a content planner, I want topics from `post_topics.json` selected in a sequential, non-repeating cycle, so that all planned topics are covered systematically before any topic is repeated.

## Implementation Decisions

- **Decoupled Workflow Architecture**: Split into two distinct n8n workflows: a Content Generator & Stager workflow (cron and webhook-driven) and a Command Handler & Publisher workflow (Telegram webhook-driven), isolating background scheduling from interactive event handling.
- **Telegram Command Approval Interface**: Interactivity uses plain chat commands (`/approve [id]`, `/reject [id]`, `/generate`) rather than inline callback buttons or synchronous wait nodes, decoupling review timing from workflow execution timeouts.
- **Sequential Multi-Draft Persistence**: Pending drafts are stored in a local JSON file (`data/pending_drafts.json`) indexed by sequential numeric `Draft ID`. Drafts remain stored until explicitly approved or rejected.
- **Dual Visual Asset Strategy & Fallback**: When staging a draft, the workflow inspects the local `assets/` directory for an image associated with the current topic. If present, it uses this asset directly; otherwise, it invokes Gemini's image generation (gemini-nano-banana-2.1). If Gemini visual generation fails or is unavailable, it automatically falls back to Cloudflare Workers AI FLUX.1-schnell (`@cf/black-forest-labs/flux-1-schnell`).
- **AI Engine Redundancy (Cloudflare Fallback)**: Google Gemini (`gemini-3.8-flash`) acts as the primary text generation engine. If Gemini encounters rate limits (HTTP 429), quota limits, or outages, the engine seamlessly falls back to Cloudflare Workers AI REST API running `@cf/meta/llama-3.1-70b-instruct` via native `fetch` without requiring extra npm packages.
- **Dual-Language Configuration**: Content defaults to technical Arabic with English technical nomenclature, with an optional `language` attribute in `post_topics.json` supporting English-only generation.
- **LinkedIn Media Assets Protocol**: Publishing implements LinkedIn's v2 REST protocol:
  1. `POST /rest/images?action=initializeUpload` with owner URN (`urn:li:person:...`).
  2. `PUT` upload of binary image data to the returned `uploadUrl`.
  3. `POST /rest/posts` referencing the uploaded media asset URN (`urn:li:image:...`) and commentary text.
- **Persistent Ingress via Ngrok**: Exposes n8n using an Ngrok container configured with an authentication token and reserved domain (`NGROK_AUTHTOKEN`, `NGROK_DOMAIN`) in `docker-compose.yml` to ensure deterministic webhook endpoints for Telegram.
- **Access Control and Authorization**: The command handler validates incoming Telegram messages against `TELEGRAM_ALLOWED_USER_ID`, silently dropping or rejecting unauthorized senders.
- **Scheduled Cadence**: Cron trigger configured for Sunday through Thursday at 10:00 AM local time (`0 10 * * 0-4`).

## Testing Decisions

- **Good Test Definition**: Tests must verify external behavioral contracts rather than implementation internals:
  - Correct parsing of Telegram commands and argument extraction.
  - Proper state transitions in `data/pending_drafts.json` (addition on generation, removal on approval/rejection).
  - Accurate sequence and payload construction for the LinkedIn 3-step Media API.
  - Verification that unauthorized Telegram user IDs are rejected without triggering downstream actions.
- **Tested Modules**:
  - *Topic Selector & Stager*: Sequential topic advancement, draft queue persistence, and asset routing logic.
  - *Telegram Bot Ingress*: Command routing (`/approve`, `/reject`, `/generate`) and authorization verification.
  - *LinkedIn Publisher*: 3-step API execution sequence (initialize upload -> upload binary -> create post).
- **Prior Art**: n8n webhook test payloads and mock HTTP responses for Telegram Bot API and LinkedIn REST API.

## Out of Scope

- Auto-responding to LinkedIn comments or managing post engagement.
- Publishing to LinkedIn Company Pages (personal profiles only).
- Multi-user collaboration or multiple reviewer permission tiers.
- Video or PDF carousel document generation.
- Real-time conversational editing of drafts in Telegram (users approve, reject, or generate fresh drafts).

## Further Notes

- Required environment variables: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_PERSON_URN`, `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`. Optional fallback credentials: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TEXT_MODEL`, `CLOUDFLARE_IMAGE_MODEL`.
- The domain glossary is maintained in `GLOSSARY.md` and architectural rationale is recorded in `docs/adr/`.
