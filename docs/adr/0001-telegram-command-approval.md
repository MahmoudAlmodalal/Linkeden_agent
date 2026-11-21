# Telegram Command-Based Approval Model

We chose an asynchronous Telegram command model (`/approve`, `/reject`) over n8n's synchronous Wait-on-Webhook inline buttons. When a draft is produced, it is persisted to a local pending state; a separate Telegram Trigger listens for user commands to resume publication or cancel. This allows resilient reviewing directly from chat without relying on temporary webhook callbacks or ephemeral wait executions.


> **Amended by [ADR 0006](0006-inline-callbacks-alongside-commands.md):** inline keyboard buttons are also supported, alongside the text commands described here.
