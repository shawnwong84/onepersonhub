import { describe, it, expect, vi } from "vitest";

vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(),
  },
}));

import { promises as dns } from "node:dns";
import { assertSafeExternalUrl } from "@/lib/url-safety";

const mockLookup = vi.mocked(dns.lookup);

describe("assertSafeExternalUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertSafeExternalUrl("file:///etc/passwd")).rejects.toThrow(/http/i);
  });

  it("rejects the literal hostname localhost", async () => {
    await expect(assertSafeExternalUrl("http://localhost/")).rejects.toThrow(/localhost/i);
  });

  it("rejects a hostname that resolves to a loopback address", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    await expect(assertSafeExternalUrl("http://example.test/")).rejects.toThrow(/private|internal/i);
  });

  it("rejects a hostname that resolves to the cloud metadata link-local address", async () => {
    mockLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
    await expect(assertSafeExternalUrl("http://metadata.internal/")).rejects.toThrow(/private|internal/i);
  });

  it("rejects a hostname that resolves to a private RFC1918 address", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);
    await expect(assertSafeExternalUrl("http://internal-service/")).rejects.toThrow(/private|internal/i);

    mockLookup.mockResolvedValue([{ address: "192.168.1.1", family: 4 }] as never);
    await expect(assertSafeExternalUrl("http://lan-host/")).rejects.toThrow(/private|internal/i);

    mockLookup.mockResolvedValue([{ address: "172.16.0.1", family: 4 }] as never);
    await expect(assertSafeExternalUrl("http://docker-host/")).rejects.toThrow(/private|internal/i);
  });

  it("rejects a hostname that resolves to an IPv6 loopback or unique-local address", async () => {
    mockLookup.mockResolvedValue([{ address: "::1", family: 6 }] as never);
    await expect(assertSafeExternalUrl("http://v6-loopback/")).rejects.toThrow(/private|internal/i);

    mockLookup.mockResolvedValue([{ address: "fd00::1", family: 6 }] as never);
    await expect(assertSafeExternalUrl("http://v6-ula/")).rejects.toThrow(/private|internal/i);
  });

  it("rejects a hostname that fails to resolve", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeExternalUrl("http://does-not-exist.invalid/")).rejects.toThrow(/resolve/i);
  });

  it("allows a hostname that resolves to a public address", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertSafeExternalUrl("https://example.com/page")).resolves.toBeInstanceOf(URL);
  });
});
