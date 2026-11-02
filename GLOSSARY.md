# LinkedIn Automation & Personal Branding

Automates technical content drafting, review via Telegram, and publishing to LinkedIn personal profile.

## Language

**Draft ID**:
A sequential numeric identifier assigned to each pending draft to allow targeted approval or rejection via Telegram.
_Avoid_: Post ID, tracking code, UUID

**Pending Draft**:
A generated technical breakdown, visual asset, and assigned Draft ID stored in `data/pending_drafts.json` awaiting review.
_Avoid_: Unapproved post, temporary message, draft workflow

**Approval Command**:
Dedicated Telegram commands (`/approve [id]`, `/reject [id]`, `/generate`) sent by the reviewer to control drafting and publication.
_Avoid_: Callback button, inline click, webhook response

**Allowed Reviewer**:
The specific Telegram user whose unique ID matches `TELEGRAM_ALLOWED_USER_ID`, authorized to execute approval commands.
_Avoid_: Admin, bot manager, public user

**Media Asset**:
An image entity registered and uploaded to LinkedIn's Assets API (`urn:li:image:...`) before being referenced in a post.
_Avoid_: Post picture, photo attachment

**Topic Spec**:
A structured entry in `post_topics.json` containing the subject, core architecture concepts, and target language (`ar` or `en`).
_Avoid_: Idea, title, raw subject

**Publishing Failure**:
An error during LinkedIn media initialization, upload, or post creation that preserves the pending draft for user retry.
_Avoid_: Discarded draft, silent drop
