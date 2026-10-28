import type { VercelRequest, VercelResponse } from "@vercel/node";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (isIP(ip) === 6) {
    const value = ip.toLowerCase();
    return value !== "::" && value !== "::1" &&
      !value.startsWith("fe8") && !value.startsWith("fe9") &&
      !value.startsWith("fea") && !value.startsWith("feb") &&
      !value.startsWith("fc") && !value.startsWith("fd") &&
      !value.startsWith("::ffff:");
  }
  return false;
}
async function validatePublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid URL");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private host");
  const literal = isIP(host);
  const addresses = literal ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicIp(item.address))) throw new Error("Private address");
  return url;
}
function decodeHtml(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
function meta(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp('<meta[^>]+(?:property|name|itemprop)=["\\']' + key + '["\\'][^>]+content=["\\']([^"\\']*)["\\'][^>]*>', "i"),
    new RegExp('<meta[^>]+content=["\\']([^"\\']*)["\\'][^>]+(?:property|name|itemprop)=["\\']' + key + '["\\'][^>]*>', "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return undefined;
}
async function fetchHtml(start: URL): Promise<{ url: URL; html: string }> {
  let url = start;
  for (let redirects = 0; redirects <= 3; redirects++) {
    url = await validatePublicUrl(url.href);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "VoaxLinkPreview/1.0", "Accept": "text/html,application/xhtml+xml;q=0.9" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Too many redirects");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) throw new Error("Not an HTML page");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 1024 * 1024) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const chunk = value.slice(0, 1024 * 1024 - size);
      chunks.push(chunk); size += chunk.length;
      if (chunk.length !== value.length) break;
    }
    void reader.cancel().catch(() => {});
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { url, html: new TextDecoder().decode(bytes) };
  }
  throw new Error("Preview unavailable");
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw || raw.length > 2048) return res.status(400).json({ error: "A valid URL is required" });
  try {
    const start = await validatePublicUrl(raw);
    const { url, html } = await fetchHtml(start);
    const title = meta(html, "og:title") || meta(html, "twitter:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    const description = meta(html, "og:description") || meta(html, "description") || meta(html, "twitter:description");
    const rawImage = meta(html, "og:image") || meta(html, "twitter:image");
    let image: string | undefined;
    if (rawImage) {
      try { const parsedImage = new URL(rawImage, url); if (["http:", "https:"].includes(parsedImage.protocol)) image = parsedImage.href; } catch { /* ignore invalid image metadata */ }
    }
    return res.status(200).json({ url: url.href, hostname: url.hostname.replace(/^www\./, ""), siteName: meta(html, "og:site_name") || url.hostname.replace(/^www\./, ""), title: title ? decodeHtml(title).slice(0, 180) : undefined, description: description ? description.slice(0, 360) : undefined, image });
  } catch {
    return res.status(200).json({ url: raw, hostname: (() => { try { return new URL(raw).hostname; } catch { return "Website"; } })() });
  }
}