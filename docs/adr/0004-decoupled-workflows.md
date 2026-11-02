# Decoupled Workflows: Drafting and Command Publishing

We decoupled the system into two distinct n8n workflows rather than a single monolithic pipeline:
1. `Content Generator & Stager`: Runs on a schedule, generates text and visuals, assigns a sequential Draft ID, persists the pending draft, and sends Telegram alerts.
2. `Command Handler & Publisher`: Triggered by Telegram webhooks, validates user security, and handles `/approve` (executing LinkedIn 3-step media upload and post publishing) or `/reject`.

This separation isolates generation failures from publishing logic and avoids long-running suspended workflow executions.
