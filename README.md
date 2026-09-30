# GitHub Pages Auth Demo

A minimal GitHub Pages site protected by **GitHub OAuth 2.0 Authentication**, deployed automatically via **GitHub Actions**.

> [!CAUTION]
> **This is not a secure way to protect files hosted on GitHub Pages.**
> The authentication in this project is enforced by client-side JavaScript only.
> Any file (`index.html`, `page1.html`, `page2.html`, `auth.js`, etc.) can be
> retrieved directly with `wget`, `curl`, or by simply disabling JavaScript —
> completely bypassing the login flow. See the [Security Limitations](#security-limitations) section for a full explanation and the recommended alternative.

---

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

## Security Limitations

### The fundamental problem with static site "authentication"

GitHub Pages is a **public static file host**. Every file in the `src/` directory is reachable by anyone who knows the URL — the web server has no concept of a logged-in user and will serve files unconditionally.

The JavaScript in this project redirects unauthenticated browsers to GitHub's login page, but this check happens **inside the browser, after the HTML has already been delivered**. It is trivially bypassed:

```bash
# Anyone can do this — no login required
wget https://stephenford.org/github-auth-test/index.html
curl https://stephenford.org/github-auth-test/page1.html
curl https://stephenford.org/github-auth-test/page2.html

# The JS files themselves are also fully public
curl https://stephenford.org/github-auth-test/js/auth.js
curl https://stephenford.org/github-auth-test/js/config.js
```

Disabling JavaScript in the browser, using a headless browser, or using any HTTP client other than a standard browser will also bypass the guard entirely.

### Pros of the current approach

| Pro | Detail |
|---|---|
| **Zero infrastructure cost** | GitHub Pages and the Cloudflare Worker free tier are both free |
| **Simple to set up** | No servers, no databases, no session management |
| **Stops casual access** | A normal user visiting in a browser will be prompted to log in |
| **Personalised experience** | The GitHub token lets you display the user's name, avatar, and profile data |
| **Honest OAuth flow** | Uses a real OAuth 2.0 Authorization Code flow with CSRF state protection — the pattern itself is correct |
| **Good learning example** | Demonstrates how OAuth works end-to-end in a static context |

### Cons of the current approach

| Con | Detail |
|---|---|
| **Not actually secure** | Any HTTP client bypasses auth entirely — the files are unconditionally public |
| **JavaScript can be disabled** | Turning off JS in the browser reveals all page content immediately |
| **Source always visible** | View Source works regardless of auth state |
| **No server-side enforcement** | There is no component that can reject an unauthenticated request before content is served |
| **Token in sessionStorage** | While scoped to the tab, `sessionStorage` is readable by any JavaScript on the page (XSS risk) |
| **Client secret still needed** | Requires a Cloudflare Worker (or equivalent) to safely exchange the OAuth code — it is not truly "serverless" |

### When this approach is acceptable

- **Demo or portfolio sites** where you want to show a login flow without real security requirements
- **Internal tools** used exclusively by trusted colleagues who would not attempt to bypass auth
- **Convenience gates** where the goal is UX ("please log in") rather than access control ("you are forbidden")
- **Prototypes** being built before a proper backend is in place

### The secure alternative: Cloudflare Access

If you need to genuinely prevent access to files, the correct solution is to enforce authentication at the **network edge**, before any file is served — so that `wget` and `curl` are blocked just like a browser.

Since `stephenford.org` already sits behind Cloudflare, **Cloudflare Access** (free up to 50 users) is the recommended upgrade path. It intercepts every HTTP request and requires a valid GitHub login before passing the request to the GitHub Pages origin.

```
wget https://stephenford.org/github-auth-test/index.html
  │
  ▼
Cloudflare Edge
  │
  ├── no valid Access session?  ──►  HTTP 302 → GitHub Login
  │
  └── valid session  ──────────────►  file served from GitHub Pages
```

See the [Cloudflare Access documentation](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) for setup instructions.

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
   - **Homepage URL**: `https://<your-domain>/<repo-name>/`
   - **Redirect URI**: `https://<your-domain>/<repo-name>/callback.html`
3. Click **Register application**.
4. Note your **Client ID**.
5. Click **Generate a new client secret** and copy it (shown only once).

> [!NOTE]
> If you are using a custom domain (e.g. `stephenford.org`) use that in the URLs above, not the `github.io` address. The Redirect URI must match exactly what the browser sees.

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
wrangler secret put ALLOWED_ORIGIN    # e.g. https://stephenford.org

# Deploy
wrangler deploy
```

Note the deployed Worker URL — it looks like:
`https://github-oauth-proxy.<your-subdomain>.workers.dev`

> [!IMPORTANT]
> The `ALLOWED_ORIGIN` secret must match the domain the browser is actually using to visit your site. If you use a custom domain, set it to that — not the `github.io` URL. A mismatch causes a CORS error ("Failed to fetch") during the token exchange step.

### Step 4 — Configure the Site

Edit [`src/js/config.js`](src/js/config.js):

```js
const CONFIG = Object.freeze({
  GITHUB_CLIENT_ID: "your_actual_client_id",                         // from Step 2
  OAUTH_PROXY_URL:  "https://github-oauth-proxy.xxx.workers.dev",   // from Step 3
  GITHUB_REPO_PATH: "/github-auth-test",                             // or "" for user/org sites
});
```

> [!NOTE]
> `GITHUB_CLIENT_ID` is safe to commit — it is a public value by design in the OAuth spec.
> The `GITHUB_CLIENT_SECRET` must **never** appear here; it lives only in the Cloudflare Worker secret store.

### Step 5 — Push & Deploy

```bash
git add .
git commit -m "feat: initial GitHub Pages auth demo"
git push origin main
```

The GitHub Actions workflow will run automatically. Visit your site at:
`https://<your-domain>/<repo-name>/`

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

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Spinner stuck / "Failed to fetch" | `OAUTH_PROXY_URL` in `config.js` is wrong or the Worker is not deployed | Check the Worker URL and redeploy |
| "Failed to fetch" after Worker is deployed | `ALLOWED_ORIGIN` Worker secret does not match your site's domain | `wrangler secret put ALLOWED_ORIGIN` with the correct domain |
| Correct config not appearing on live site | Cloudflare CDN is caching the old `config.js` | Purge cache in the Cloudflare dashboard → Caching → Purge Everything |
| "bad_verification_code" from GitHub | The OAuth code was already used or expired (codes are single-use and expire in 10 minutes) | Start the login flow again from the home page |
| Redirect URI mismatch error from GitHub | The callback URL in your OAuth App settings does not match what the browser used | Update the Redirect URI in GitHub → Settings → Developer settings → OAuth Apps |

---

## Local Development

Because the site is pure static HTML/JS/CSS, you can preview it with any static server:

```bash
# Using Python
python3 -m http.server 8080 --directory src

# Using Node.js (npx)
npx serve src
```

> Add `http://localhost:8080/callback.html` as an additional Redirect URI in your GitHub OAuth App settings for local testing. GitHub OAuth Apps support multiple redirect URIs.