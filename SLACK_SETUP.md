# Slack Setup — AGM Approvals via DM

This wires up Slack so that whenever a Front Desk Executive submits an
expense, every configured AGM/approver for that site gets a Slack DM with
the full expense details, the receipt, and **Approve**/**Reject** buttons —
no need to open the app.

You need your API already deployed (Render) before Slack's interactivity
request URL can be set, since Slack requires a live public HTTPS endpoint.

## 1. Create the Slack App

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**.
2. Name it something like "ExpenseHub Approvals", pick your workspace.

## 2. Add permissions (OAuth Scopes)

1. Left sidebar → **OAuth & Permissions**.
2. Under **Scopes → Bot Token Scopes**, add:
   - `chat:write` (send messages)
   - `im:write` (open DMs)
   - `users:read.email` (look up a person by their email, and read the
     clicking user's email back when they press a button)
3. Scroll up → **Install to Workspace** → allow.
4. Copy the **Bot User OAuth Token** (starts `xoxb-...`) — this is
   `SLACK_BOT_TOKEN`.

## 3. Get the Signing Secret

1. Left sidebar → **Basic Information** → **App Credentials**.
2. Copy **Signing Secret** — this is `SLACK_SIGNING_SECRET`. This is what
   proves incoming requests really came from Slack (not signing in — Slack
   never gets a password of any kind).

## 4. Enable Interactivity

1. Left sidebar → **Interactivity & Shortcuts**.
2. Toggle **Interactivity** on.
3. **Request URL**: `https://<your-render-url>/api/slack/interactions`
   (e.g. `https://neoteric-expensehub.onrender.com/api/slack/interactions`).
4. Save.

## 5. Set the environment variables on Render

On your `expensehub-api` service → **Environment**, set:

| Key | Value |
|---|---|
| `SLACK_BOT_TOKEN` | the `xoxb-...` token from step 2 |
| `SLACK_SIGNING_SECRET` | the secret from step 3 |
| `APP_BASE_URL` | your Render URL, e.g. `https://neoteric-expensehub.onrender.com` (no trailing slash) |

Save — Render redeploys automatically.

## 6. Give each AGM a Slack email

In the app: **User Management** → edit the AGM's user → set **Slack Email**
to the email address they use to sign into your Slack workspace (this can
be different from their app login email). Leave it blank and that person
simply won't get Slack DMs — everything else keeps working through the app
as normal.

## 7. Try it

1. Log in as a Front Desk Executive, submit an expense with a receipt
   attached.
2. The AGM configured for that site (Master → Fund Policy & Approvals →
   Approvers) should get a Slack DM within a few seconds, showing the
   expense details, the receipt image, and Approve/Reject buttons.
3. Clicking **Approve** posts the approval immediately and updates the
   message to show who approved it.
4. Clicking **Reject** opens a small popup asking for a reason (required) —
   submitting it rejects the expense **and still deducts the fund** (the
   money was already spent; only the label changes), per how rejections
   work in this app.

## Troubleshooting

- **No DM arrives**: check the AGM's Slack Email is set correctly (must
  match exactly what they use to log into Slack), and that
  `SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET` are set on Render. Check Render's
  logs for `[slack] approval notification failed` — a submission never fails
  just because Slack did, so the error only shows up in logs, not to the
  user submitting.
- **Buttons don't respond / Slack shows an error**: double-check the
  Interactivity Request URL exactly matches your deployed API's
  `/api/slack/interactions` path, and that `APP_BASE_URL` has no trailing
  slash.
- **Receipt image doesn't preview**: only image receipts (JPG/PNG/WEBP)
  preview inline in Slack; PDF receipts show as a clickable link instead
  (Slack can't inline-render PDFs in a DM).
