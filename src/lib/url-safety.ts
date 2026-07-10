import { promises as dns } from "node:dns";

function isPrivateOrLoopbackIp(ip: string): boolean {
  if (ip.includes(":")) {
    // IPv6: loopback, link-local, and unique-local ranges.
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("::ffff:127.") // IPv4-mapped loopback
    );
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // fail closed on garbage

  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 0) return true; // "this network"
  return false;
}

/**
 * Blocks server-side fetches to internal/private network targets (SSRF).
 * Resolves the hostname (not just string-matching it) so an attacker can't
 * bypass this with a hostname that only resolves to a private IP at fetch
 * time (DNS rebinding-style bypass of a naive allowlist).
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Requests to localhost are not allowed.");
  }

  const addresses = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new Error("Could not resolve host.");
  }
  if (addresses.some((addr) => isPrivateOrLoopbackIp(addr.address))) {
    throw new Error("Requests to private/internal network addresses are not allowed.");
  }

  return url;
}
