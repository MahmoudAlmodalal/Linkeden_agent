# Ngrok for Public Ingress and Webhooks

We chose Ngrok with a persistent domain/auth token over Cloudflare Tunnel for exposing n8n and receiving incoming Telegram webhooks and OAuth callbacks. Ngrok integrates directly via Docker and offers deterministic static domains without requiring Cloudflare DNS domain delegation.
