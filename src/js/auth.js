/**
 * auth.js — GitHub OAuth flow manager
 *
 * Responsibilities:
 *  - Validate a stored access token against the GitHub API.
 *  - Redirect unauthenticated users to the GitHub OAuth consent screen.
 *  - Exchange the one-time code (returned by GitHub) for an access token
 *    via the secure Cloudflare Worker proxy.
 *  - Store / clear the token in sessionStorage (not localStorage so it
 *    is scoped to the browser tab session and not persisted across restarts).
 *  - Expose `Auth.getUser()` so pages can personalise their content.
 */

"use strict";

const Auth = (() => {
  const TOKEN_KEY = "gh_access_token";
  const USER_KEY = "gh_user";

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function getUser() {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function setUser(user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // ── GitHub API ─────────────────────────────────────────────────────────────

  async function fetchGitHubUser(token) {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    return res.json();
  }

  // ── OAuth redirect ─────────────────────────────────────────────────────────

  function buildOAuthURL(returnTo) {
    const callbackURL =
      window.location.origin +
      CONFIG.GITHUB_REPO_PATH +
      "/callback.html";

    // Store where to send the user after login
    sessionStorage.setItem("oauth_return_to", returnTo || window.location.href);

    const params = new URLSearchParams({
      client_id: CONFIG.GITHUB_CLIENT_ID,
      redirect_uri: callbackURL,
      scope: "read:user",
      state: crypto.randomUUID(), // CSRF token
    });

    // Persist the CSRF state so callback.html can verify it
    sessionStorage.setItem("oauth_state", params.get("state"));

    return `https://github.com/login/oauth/authorize?${params}`;
  }

  function redirectToLogin() {
    window.location.href = buildOAuthURL(window.location.href);
  }

  // ── Token exchange (via Cloudflare Worker) ─────────────────────────────────

  async function exchangeCodeForToken(code, state) {
    // Verify CSRF state
    const savedState = sessionStorage.getItem("oauth_state");
    if (state !== savedState) {
      throw new Error("OAuth state mismatch — possible CSRF attack.");
    }
    sessionStorage.removeItem("oauth_state");

    const res = await fetch(
      `${CONFIG.OAUTH_PROXY_URL}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    );

    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);

    return data.access_token;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Guard a page behind authentication.
   * Call once at the top of each protected page's inline <script>.
   * Redirects to GitHub if no valid token is found.
   */
  async function requireAuth() {
    const token = getToken();
    if (!token) {
      redirectToLogin();
      return null;
    }

    // Reuse cached user to avoid an API call on every navigation
    let user = getUser();
    if (user) return user;

    try {
      user = await fetchGitHubUser(token);
      setUser(user);
      return user;
    } catch {
      // Token invalid / expired — start login again
      clearSession();
      redirectToLogin();
      return null;
    }
  }

  /**
   * Handle the OAuth callback. Call this only from callback.html.
   * Returns the authenticated user and redirects to the original page.
   */
  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) throw new Error("No code present in callback URL.");

    const token = await exchangeCodeForToken(code, state);
    setToken(token);

    const user = await fetchGitHubUser(token);
    setUser(user);

    const returnTo =
      sessionStorage.getItem("oauth_return_to") ||
      window.location.origin + CONFIG.GITHUB_REPO_PATH + "/";
    sessionStorage.removeItem("oauth_return_to");

    window.location.replace(returnTo);
    return user;
  }

  /** Sign the user out. */
  function logout() {
    clearSession();
    window.location.replace(
      window.location.origin + CONFIG.GITHUB_REPO_PATH + "/"
    );
  }

  return { requireAuth, handleCallback, getUser, logout };
})();
