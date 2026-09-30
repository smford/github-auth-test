# GitHub Pages Auth Demo

A minimal GitHub Pages site protected by **GitHub OAuth 2.0 Authentication**, deployed automatically via **GitHub Actions**.

## Architecture

```
Browser
  │
  │  visit page → no token?
  ▼
GitHub OAuth Consent  ──── redirect with ?code= ────►  callback.html
                                                              │
                                                    POST code to Worker
                                                              │
                                                    Cloudflare Worker
                                                    (holds client_secret)
                                                              │
                                                    ◄── access_token ────
                                                              │
                                                    stored in sessionStorage
                                                              │
                                                    redirect to original page
```

| Component | Technology |
|---|---|
| Static site hosting | GitHub Pages |
| CI/CD | GitHub Actions |
| Auth protocol | OAuth 2.0 Authorization Code |
| Token exchange backend | Cloudflare Worker |
| Token storage | `sessionStorage` (tab-scoped) |

---

## Setup (Step-by-Step)

### Step 1 — Enable GitHub Pages

In your repository:
1. Go to **Settings → Pages**.
2. Under *Source*, select **GitHub Actions**.
3. Save.

### Step 2 — Create a GitHub OAuth App

1. Go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name**: `GitHub Pages Auth Demo` (or anything you like)
   - **Homepage URL**: `https://<your-username>.github.io/<repo-name>/`
   - **Authorization callback URL**: `https://<your-username>.github.io/<repo-name>/callback.html`
3. Click **Register application**.
4. Note your **Client ID**.
5. Click **Generate a new client secret** and copy it (shown only once).

### Step 3 — Deploy the Cloudflare Worker

> The Worker keeps your OAuth client secret off the browser.

```bash
# Install Wrangler (Cloudflare's CLI)
npm install -g wrangler

# Authenticate
wrangler login

# Navigate to the worker directory
cd cloudflare-worker

# Set secrets (you will be prompted to paste each value)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put ALLOWED_ORIGIN    # e.g. https://your-username.github.io

# Deploy
wrangler deploy
```

Note the deployed Worker URL — it looks like:
`https://github-oauth-proxy.<your-subdomain>.workers.dev`

### Step 4 — Configure the Site

Edit [`src/js/config.js`](src/js/config.js):

```js
const CONFIG = Object.freeze({
  GITHUB_CLIENT_ID: "your_actual_client_id",          // from Step 2
  OAUTH_PROXY_URL:  "https://github-oauth-proxy.xxx.workers.dev",  // from Step 3
  GITHUB_REPO_PATH: "/github-auth-test",              // or "" for user sites
});
```

> **Alternative (recommended for teams):** Store secrets as GitHub Actions secrets
> (`GITHUB_OAUTH_CLIENT_ID`, `OAUTH_PROXY_URL`) and uncomment the
> *Inject OAuth config* step in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
> This keeps credentials out of source control entirely.

### Step 5 — Push & Deploy

```bash
git add .
git commit -m "feat: initial GitHub Pages auth demo"
git push origin main
```

The GitHub Actions workflow will run automatically. Visit your site at:
`https://<your-username>.github.io/<repo-name>/`

---

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions — build & deploy
├── src/                        # Everything under here is published
│   ├── index.html              # Home page ("Hello World")
│   ├── page1.html              # Demo page 1
│   ├── page2.html              # Demo page 2 (live GitHub profile card)
│   ├── callback.html           # OAuth redirect handler
│   ├── css/
│   │   └── style.css           # GitHub-dark themed stylesheet
│   └── js/
│       ├── config.js           # ← Fill in your values here
│       └── auth.js             # OAuth flow logic
└── cloudflare-worker/
    ├── oauth-proxy.js          # Worker source
    └── wrangler.toml           # Wrangler config
```

---

## Security Notes

| Concern | Mitigation |
|---|---|
| Client secret exposure | Stored only in Cloudflare Worker secrets — never in browser or repo |
| CSRF during OAuth | Random `state` param generated with `crypto.randomUUID()`, verified in callback |
| Token storage | `sessionStorage` (cleared when tab closes; not accessible cross-tab) |
| Token validation | Verified against `api.github.com/user` on every page load |
| CORS | Worker restricts `Access-Control-Allow-Origin` to your Pages domain |

---

## Local Development

Because the site is pure static HTML/JS/CSS, you can preview it with any static server:

```bash
# Using Python
python3 -m http.server 8080 --directory src

# Using Node.js (npx)
npx serve src
```

> OAuth will still redirect to GitHub and back — set `http://localhost:8080/callback.html`
> as an additional *Authorization callback URL* in your OAuth App settings for local testing.