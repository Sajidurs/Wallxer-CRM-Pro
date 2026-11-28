# MCP access

Assistants such as Grok Bot call the CRM over MCP. There is no browser login.
The key acts as a person already in the workspace, so that person's role and
finance access still apply.

The endpoint is not deployed by adding this file. Apply the migration, create
a key, then point the assistant at the URL.

## 1. Apply the migration

`supabase/migrations/0027_bot_api_keys.sql` creates `bot_api_keys` and
`mcp_audit_log`. It is not applied automatically.

When you are ready, apply it the same way as the other migrations
(`supabase db push`, or paste the file into the Supabase SQL editor). Do not
edit the file after it has been applied.

No new environment variable is required. The app uses the service role it
already has to look up the key, then opens a short-lived session as the linked
person so Row Level Security applies. `generateLink` does not send an email.
Use a dedicated active user for the bot if you do not want those sessions on
someone's personal account.

## 2. Create a key

Sign in as an admin and open **Settings → API keys** (`/settings/bots`).

- **Name** is a label, for example `Grok Bot`.
- **Acts as** is the person the key becomes. A member cannot do what a member
  cannot do in the app.
- **Read** lists and opens records. **Write** includes read, and can create
  and update. **Finance** is extra: invoice and ledger tools also need finance
  access on that person (admins have it; everyone else needs the grant).

The raw key is shown once, in the dialog. It starts with `wxm_`. Only its
SHA-256 hash is stored. Revoke is permanent; create another key if it is lost.

## 3. Connect a client

Streamable HTTP. No OAuth.

| | |
| --- | --- |
| URL | `https://portal.wallxer.com/api/mcp` |
| Header | `Authorization: Bearer wxm_...` |

Locally that URL is `http://localhost:3000/api/mcp`.

A client that only speaks stdio can proxy with
`npx mcp-remote https://portal.wallxer.com/api/mcp` and pass the same header.
Put the key in the assistant's secret store, not in a committed config file.

The route is public to the login redirect and answers `Cache-Control: no-store`.
A missing, unknown, or revoked key gets 401 or 403 and no CRM data.

## Tools

There are no delete tools, and no tools to reveal, create, or change
credentials, invite users, change roles, or grant finance access.

Money **inputs** are major units (`1500` or `"1500.50"`). Money **outputs**
named `amount_poisha` or `*_minor` are minor units; divide by 100. Deal
`amount` is already a major-unit decimal. Updates replace the fields the form
edits, so read the record first.

### Dashboard

`get_dashboard_counts`, `list_deals_by_stage`, `list_projects_at_risk`,
`list_recent_activity`, `list_my_tasks` (the linked person), `list_team_members`

### Contacts

`search_contacts`, `get_contact`, `create_contact`, `update_contact`

### Pipeline

`list_pipelines`, `list_pipeline_stages`, `search_deals`, `get_deal`,
`create_deal`, `update_deal`, `move_deal`

`move_deal` changes the stage. The database writes `deal_stage_history` and
sets won, lost, or open from that stage. Pass `stageId`, or `outcome` of
`open`, `won`, or `lost`.

### Projects

`search_projects`, `get_project`, `create_project`, `update_project`,
`add_project_website`

### Tasks

`search_tasks`, `get_task`, `create_task`, `update_task`, `move_task`,
`add_checklist_item`, `set_checklist_item_done`

Changing an assignee needs a manager. Links added later go through
`add_resource_link`.

### Proposals

`search_proposals`, `get_proposal`, `create_proposal`, `update_proposal`,
`set_proposal_status`

Same permissions as projects. Only a draft can be edited. Leaving draft
freezes the letterhead.

### Invoices

`search_invoices`, `get_invoice`, `create_invoice`, `update_invoice`,
`set_invoice_status`

Finance scope and finance access. Paying an invoice does not write the ledger.

### Finance

`search_transactions`, `get_transaction`, `list_transaction_categories`,
`create_transaction`, `update_transaction`, `create_transaction_category`,
`finance_summary`

Finance scope and finance access. `finance_summary` calls `finance_series`,
`finance_by_category`, and `finance_by_project`. Figures are poisha.

### Renewals

`search_renewals`, `get_renewal`, `create_renewal`, `update_renewal`,
`mark_renewal_renewed`

`mark_renewal_renewed` calls `advance_renewal`.

### Shared

`list_brands`, `list_resource_links`, `add_resource_link`, `list_attachments`
(name, type, size — no file and no storage path), `list_credentials` (label,
category, url, username, project or contact — never the secret).

## Audit

Every write tool call, including a refusal, is inserted into `mcp_audit_log`
with the key id, the tool, the entity, and whether it succeeded. Arguments
and the raw key are not stored. Admins can read the table. The service role
writes it.
