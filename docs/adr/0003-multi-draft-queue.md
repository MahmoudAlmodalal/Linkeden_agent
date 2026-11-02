# Sequential Draft ID Queue in File Storage

We chose a multi-draft queue indexed by a sequential numeric `Draft ID` in `data/pending_drafts.json` rather than a single-item overwrite state. Reviewers can approve or reject out of order using `/approve <id>` or `/reject <id>` (with plain `/approve` defaulting to the latest draft). This prevents scheduled runs from clobbering unreviewed drafts when reviews are delayed.
