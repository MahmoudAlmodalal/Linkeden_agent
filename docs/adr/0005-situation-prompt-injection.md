# Production Scenario Prompt Injection & Visual Staging

We introduced `/situation [prompt]` (and `/incident`) as dedicated Telegram commands to allow the reviewer to inject custom real-world production engineering situations into the generation pipeline:

1. **System Prompt Injection**: Rather than treating the user input as a loose query, the submitted scenario is injected as an authoritative `[Featured Production Scenario]` block into the grounded prompt, alongside Mahmoud's Principal Architect identity. It enforces the 5-element LinkedIn technical structure (Hook, Technical Mechanics, Trade-Offs, Battle-Tested Rules, Peer Question & Hashtags).
2. **Visual Generation**: Automatically feeds the synthesized post text and scenario dilemma into `card_generator.js` to render a high-signal branded graphic asset representing the situation.
3. **Conversational UX & Stateful Handling**:
   - Direct command with text (`/situation <prompt>`) triggers generation immediately.
   - Empty `/situation` sets an `awaiting_situation` user state in `data/bot_state.json` so the subsequent message is captured as the prompt.
   - Long direct text (> 50 characters) sent without a slash command is automatically detected as a scenario prompt.
4. **Dedicated Archiving**: Persists each submitted scenario along with its assigned Draft ID and timestamp to `data/scenarios.json`, preserving an audit trail of custom scenarios for future fine-tuning and reuse.
