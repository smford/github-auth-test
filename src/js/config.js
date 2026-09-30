/**
 * GitHub OAuth Configuration
 *
 * Fill in these values after completing the setup steps in README.md.
 *
 * GITHUB_CLIENT_ID   – The OAuth App's Client ID (safe to be public).
 * OAUTH_PROXY_URL    – URL of your Cloudflare Worker that exchanges the code
 *                      for an access token (keeps your Client Secret safe).
 * GITHUB_REPO_PATH   – The path prefix for your GitHub Pages site.
 *                      e.g. "/github-auth-test" for a project site,
 *                           "" (empty string) for a user/org site.
 */
const CONFIG = Object.freeze({
  GITHUB_CLIENT_ID: "Ov23liWNRV7dsG2xuXLS",
  OAUTH_PROXY_URL: "https://github-oauth-proxy.smford.workers.dev",
  GITHUB_REPO_PATH: "/github-auth-test",
});
