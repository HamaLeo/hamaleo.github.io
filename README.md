# Muhammed Hoger — GitHub Pages portfolio

Public website: https://hamaleo.github.io
Private studio route: https://hamaleo.github.io/hameleoadmin/

The footer contains no admin link. The route is not an authentication secret: server-side authorization protects every administrative operation.

## Build and publication

Run `npm ci`, then `npm run build`. GitHub Pages publishes the committed `docs/` folder from `main`. The public layout includes the portrait, bilingual Kurdish/English content, animated black hole, background, research diagrams, projects and company links.

`public/config.js` contains only a Supabase project URL and publishable/anon key. These are designed to be public. Never put a password, username, TOTP secret, service-role key, secret key or personal access token there.

## Secure backend

Supabase Auth stores the password; an Edge Function verifies the private username. Username hashes and salts live in an RLS-protected database table. No default username or password exists in this repository.

First-time setup requires an OTP sent to the pre-provisioned owner's email before credentials can be chosen. The owner then enrolls an authenticator. Owner-only row-level policies require a verified AAL2 token for content changes and analytics. An AAL1 session cannot administer the database, even if the client is modified.

The browser keeps auth tokens in memory, not local storage. Reloading requires sign-in again. Visitor IDs are anonymous local browser IDs; no raw IP is stored. Requests are rate-limited using salted IP hashes.

## Deployment requirements

1. Deploy the SQL migration and `portfolio-api` Edge Function to a Supabase project dedicated to this portfolio, or approve using an existing project.
2. Disable public user signup, enable TOTP MFA, require secure passwords, and configure the email template to include `{{ .Token }}` for owner bootstrap codes. Rate limits and verified owner provisioning prevent first-visitor takeover.
3. Provision exactly one owner with the local server-only provisioning script. It takes credentials from hidden stdin, never from command arguments or files, and creates no password.
4. Seed the published content from `src/seed.json` and configure only the project URL and publishable key in `public/config.js`.
5. Build and push. The backend remains closed until these steps are complete. The old private Sites deployment remains unchanged during migration.

`supabase/config.toml` disables gateway JWT verification only for the public login/visit endpoint. The function validates owner JWTs itself, and RLS independently enforces owner + MFA for administrative data.

Keep your authenticator backed up or enroll a second factor through a trusted account recovery process. No recovery codes are published or generated in the public source.
