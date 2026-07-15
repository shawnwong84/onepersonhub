"use client";

import { useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-owly-border bg-owly-surface p-8 text-center">
        <h2 className="text-xl font-semibold text-owly-text">Thanks, {name.split(" ")[0]}.</h2>
        <p className="mt-2 text-sm leading-relaxed text-owly-text-light">
          We got your message and a real person from the Paperhuman team will reply shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-owly-border bg-owly-surface p-6 text-left sm:p-8">
      <div>
        <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-owly-text">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
          placeholder="Your name"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-owly-text">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-owly-text">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={4}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full resize-none rounded-lg border border-owly-border bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text placeholder:text-owly-text-light focus:outline-none focus:ring-2 focus:ring-owly-primary focus:border-transparent transition-shadow"
          placeholder="What's on your mind?"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-owly-danger">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-owly-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-owly-primary-dark focus:outline-none focus:ring-2 focus:ring-owly-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
