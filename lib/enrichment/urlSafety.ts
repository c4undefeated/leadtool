import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Basic SSRF guard for "fetch a URL the user gave us" — a real, common
 * OWASP-relevant risk any time a server makes an outbound request driven by
 * untrusted input. Blocks obviously-private/loopback/link-local targets,
 * both as literal IPs and after DNS resolution.
 *
 * Known limitation: this checks the hostname's resolved address at call
 * time, not the exact connection `fetch` ultimately makes (a TOCTOU/DNS-
 * rebinding attack could in theory swap the answer between check and
 * connect). That's an acceptable gap for an authenticated, non-mass-market
 * V1 feature — not a claim that this is bulletproof.
 */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed -> treat as unsafe
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice(7)); // IPv4-mapped
  return false;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);

/** Throws if the URL isn't a safe public http(s) target. Returns the parsed URL otherwise. */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("That host isn't allowed.");
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) throw new Error("That host isn't allowed.");
  if (ipVersion === 6 && isPrivateIPv6(hostname)) throw new Error("That host isn't allowed.");

  if (ipVersion === 0) {
    let records: { address: string; family: number }[];
    try {
      records = await lookup(hostname, { all: true });
    } catch {
      throw new Error("Couldn't resolve that domain.");
    }
    for (const rec of records) {
      if (rec.family === 4 && isPrivateIPv4(rec.address)) {
        throw new Error("That domain resolves to a private address, which isn't allowed.");
      }
      if (rec.family === 6 && isPrivateIPv6(rec.address)) {
        throw new Error("That domain resolves to a private address, which isn't allowed.");
      }
    }
  }

  return url;
}
