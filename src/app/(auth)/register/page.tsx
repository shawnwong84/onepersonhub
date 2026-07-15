"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";

function errorMessage(data: unknown, fallback: string): string {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message) || fallback;
  }
  return fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, name, email, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorMessage(data, "Registration failed. Please try again."));
        setLoading(false);
        return;
      }
      router.replace("/billing");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-owly-surface rounded-2xl shadow-lg border border-owly-border p-8">
      <div className="flex flex-col items-center mb-8">
        <BrandMark size={56} className="mb-4" />
        <h1 className="text-2xl font-bold text-owly-text">Create your company account</h1>
        <p className="text-owly-text-light text-sm mt-1">
          Your own isolated Paperhuman workspace, ready in a minute.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-owly-text mb-1.5">
            Company name
          </label>
          <input
            id="companyName"
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
            placeholder="Acme Support Co."
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-owly-text mb-1.5">
            Your name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
            placeholder="Jane Cooper"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-owly-text mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
            placeholder="jane@example.com"
          />
        </div>

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-owly-text mb-1.5">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
            placeholder="Choose a unique username"
          />
          <p className="mt-1 text-xs text-owly-text-light">
            Usernames are shared across every company on this deployment - pick something distinctive.
          </p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-owly-text mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-owly-text mb-1.5">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
            placeholder="Re-enter your password"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-owly-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-owly-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-owly-primary-dark focus:outline-none focus:ring-2 focus:ring-owly-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Creating your workspace...
            </span>
          ) : (
            "Create account"
          )}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-owly-text-light">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-owly-primary hover:text-owly-primary-dark">
          Log in
        </a>
      </p>
    </div>
  );
}
