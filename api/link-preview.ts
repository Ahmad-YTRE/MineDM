import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
// @ts-ignore Node built-ins are available in the Vercel Node runtime.
import { request as httpRequest } from "node:http";
// @ts-ignore Node built-ins are available in the Vercel Node runtime.
import { request as httpsRequest } from "node:https";

type ResolvedTarget = { url: URL; address: string; family: 4 | 6 };

function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    // Only globally routable unicast space is allowed. This also excludes
    // IPv4-mapped, unique-local, link-local, loopback, and unspecified IPv6.
    const first = Number.parseInt(ip.split(":")[0] || "0", 16);
    if (first < 0x2000 || first > 0x3fff) return false;
    const normalized = ip.toLowerCase();
    return !(
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2001:0:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:10:") ||
      normalized.startsWith("2001:20:") ||
      normalized.startsWith("2002:")
    );
  }
  return false;
}

async function validatePublicUrl(value: string): Promise<ResolvedTarget> {
  const url = new URL(value);
  if (![ "http:", "https:" ].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid URL");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private host");
  }

  const literal = isIP(host);
  const addresses = literal
    ? [{ address: host, family: literal as 4 | 6 }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicIp(item.address))) {
    throw new Error("Private address");
  }
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function meta(html: string, key: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    if ([attrs.property, attrs.name, attrs.itemprop].some(value => value?.toLowerCase() === key.toLowerCase()) && attrs.content) return decodeHtml(attrs.content).trim();
  }
  return undefined;
}

function requestPinned(target: ResolvedTarget): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const { url, address, family } = target;
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const request = requestFn(url, {
      method: "GET",
      agent: false,
      headers: {
        "User-Agent": "VoaxLinkPreview/1.0",
        "Accept": "text/html,application/xhtml+xml;q=0.9",
      },
      ...(url.protocol === "https:" && !isIP(host) ? { servername: host } : {}),
      lookup: (_hostname: string, options: any, callback: (...args: any[]) => void) => {
        if (options?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, (response: any) => {
      const status = response.statusCode || 0;
      const headers = response.headers as Record<string, string | string[] | undefined>;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        resolve({ status, headers, body: "" });
        return;
      }
      const contentType = String(headers["content-type"] || "").toLowerCase();
      if (status < 200 || status >= 300 || !contentType.includes("text/html")) {
        response.destroy();
        reject(new Error("Not an HTML page"));
        return;
      }
      const declaredLength = Number(headers["content-length"] || 0);
      if (declaredLength > 1024 * 1024) {
        response.destroy();
        reject(new Error("Response too large"));
        return;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      response.on("data", (chunk: Uint8Array | string) => {
        const buffer = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
        size += buffer.length;
        if (size > 1024 * 1024) {
          response.destroy(new Error("Response too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => { const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; } resolve({ status, headers, body: new TextDecoder().decode(body) }); });
      response.on("error", reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchHtml(start: URL): Promise<{ url: URL; html: string }> {
  let url = start;
  for (let redirects = 0; redirects <= 3; redirects++) {
    // Resolve and validate each hop, then pin the socket to that exact IP.
    const target = await validatePublicUrl(url.href);
    const response = await requestPinned(target);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location || redirects === 3) throw new Error("Too many redirects");
      url = new URL(Array.isArray(location) ? location[0] : location || "", url);
      continue;
    }
    return { url: target.url, html: response.body };
  }
  throw new Error("Preview unavailable");
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw || raw.length > 2048) return res.status(400).json({ error: "A valid URL is required..." });
  try {
    const start = await validatePublicUrl(raw);
    const { url, html } = await fetchHtml(start.url);
    const title = meta(html, "og:title") || meta(html, "twitter:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    const description = meta(html, "og:description") || meta(html, "description") || meta(html, "twitter:description");
    const rawImage = meta(html, "og:image") || meta(html, "twitter:image");
    let image: string | undefined;
    if (rawImage) {
      try {
        const parsedImage = new URL(rawImage, url);
        if (["http:", "https:"].includes(parsedImage.protocol)) image = parsedImage.href;
      } catch { /* ignore invalid image metadata */ }
    }
    return res.status(200).json({
      url: url.href,
      hostname: url.hostname.replace(/^www\./, ""),
      siteName: meta(html, "og:site_name") || url.hostname.replace(/^www\./, ""),
      title: title ? decodeHtml(title).slice(0, 180) : undefined,
      description: description ? description.slice(0, 360) : undefined,
      image,
    });
  } catch {
    return res.status(200).json({
      url: raw,
      hostname: (() => { try { return new URL(raw).hostname; } catch { return "Website"; } })(),
    });
  }
}
