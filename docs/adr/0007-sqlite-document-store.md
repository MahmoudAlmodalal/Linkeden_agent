# SQLite Document Store Replaces Lock-File JSON

Pending Drafts, the Scenario Archive and Reviewer State used to be three JSON files protected by a lock file. They now live in one SQLite database (`data/linkedin_agent.db`, Node's built-in `node:sqlite`), one document per legacy file, with writes inside `BEGIN IMMEDIATE` transactions. This supersedes the "JSON file, not a database" cost noted in the README.

- **Interfaces unchanged:** `draft_store.js` and the router's load/save helpers keep their signatures, so the n8n workflows and the Telegram handler behave as before.
- **Migration:** the first read of a legacy JSON file imports it. Draft IDs are preserved and the file is left in place as a backup.
- **JSON mirror:** every write also refreshes the JSON file. n8n code nodes that still read or write it directly keep working: a JSON file changed outside the store is re-imported on the next read, and deleting it resets that document.
- **IDs:** a `sequences` table records the highest Draft ID ever issued, so IDs are never reused after a draft is removed.
- **Runtime:** requires Node 22.5+; the Docker base image is pinned to an n8n release that ships it.

**Cost:** the mirror must be kept until the remaining inline n8n nodes call the store directly; `node:sqlite` is still flagged experimental by Node.
