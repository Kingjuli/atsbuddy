"use client";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const csrfRes = await fetch("/api/auth/login");
      const csrfJson = (await csrfRes.json()) as { ok?: boolean; csrfToken?: string; error?: string };
      if (!csrfRes.ok || !csrfJson.csrfToken) throw new Error(csrfJson.error || "Failed to get CSRF token");
      const csrfToken = csrfJson.csrfToken;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Login failed");
      const url = new URL(window.location.href);
      const raw = url.searchParams.get("callback");
      let cb = raw || "/admin";
      // Map legacy paths to new admin routes
      if (cb === "/metrics" || cb.startsWith("/metrics/")) cb = "/admin/metrics";
      if (cb === "/logs" || cb.startsWith("/logs/")) cb = "/admin/logs";
      window.location.replace(cb);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-4">Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          className="w-full border rounded px-3 py-2 text-sm"
        />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-3 py-2 rounded bg-foreground text-background text-sm"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}


