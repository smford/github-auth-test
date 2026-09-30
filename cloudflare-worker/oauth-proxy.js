/**
 * Cloudflare Worker — GitHub OAuth Token Proxy
 *
 * Why this exists:
 *   The GitHub OAuth Authorization Code flow requires a server-side step to
 *   exchange a short-lived `code` for an `access_token`.  That exchange must
 *   include the OAuth App's `client_secret`, which must NEVER be shipped to
 *   the browser.  This Worker holds the secret and performs the exchange on
 *   behalf of the static GitHub Pages front-end.
 *
 * Deployment:
 *   1. Install Wrangler:  npm install -g wrangler
 *   2. Login:             wrangler login
 *   3. Set secrets:
 *        wrangler secret put GITHUB_CLIENT_ID
 *        wrangler secret put GITHUB_CLIENT_SECRET
 *        wrangler secret put ALLOWED_ORIGIN   (e.g. https://you.github.io)
 *   4. Deploy:            wrangler deploy
 *
 * wrangler.toml (create alongside this file):
 *   name = "github-oauth-proxy"
 *   main = "oauth-proxy.js"
 *   compatibility_date = "2024-01-01"
 */

export default {
  async fetch(request, env) {
    // ── CORS pre-flight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204, env);
    }

    // Only allow GET requests
    if (request.method !== "GET") {
      return corsResponse(
        JSON.stringify({ error: "method_not_allowed" }),
        405,
        env
      );
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return corsResponse(
        JSON.stringify({ error: "missing_code", error_description: "No OAuth code supplied." }),
        400,
        env
      );
    }

    // ── Exchange code for access token ───────────────────────────────────────
    let githubResponse;
    try {
      githubResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "github-pages-oauth-proxy/1.0",
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: code,
          }),
        }
      );
    } catch (err) {
      return corsResponse(
        JSON.stringify({
          error: "upstream_error",
          error_description: "Could not reach GitHub.",
        }),
        502,
        env
      );
    }

    if (!githubResponse.ok) {
      return corsResponse(
        JSON.stringify({
          error: "upstream_error",
          error_description: `GitHub returned ${githubResponse.status}.`,
        }),
        502,
        env
      );
    }

    const data = await githubResponse.json();

    // Surface GitHub errors (e.g. bad_verification_code) to the client
    if (data.error) {
      return corsResponse(JSON.stringify(data), 400, env);
    }

    // Only return what the client actually needs — never echo back secrets
    return corsResponse(
      JSON.stringify({ access_token: data.access_token, token_type: data.token_type }),
      200,
      env
    );
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function corsResponse(body, status, env) {
  const allowedOrigin = env?.ALLOWED_ORIGIN ?? "*";

  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (body === null) {
    return new Response(null, { status, headers });
  }

  return new Response(body, {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
