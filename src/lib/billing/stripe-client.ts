import Stripe from "stripe";

let cachedClient: Stripe | null = null;

/** Lazily constructs the Stripe client so importing this module never throws
 * when STRIPE_SECRET_KEY is unset (dev without billing configured). */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  cachedClient = new Stripe(secretKey);
  return cachedClient;
}
