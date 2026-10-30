// Edge Function: dato il link di un prodotto, restituisce foto, titolo, prezzo e negozio.
// Richiede il login (verify_jwt = true), così non può essere usata come proxy da chiunque.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const k = key.replace(/[:.]/g, "\\$&");
    const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']+)["']`, "i");
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, "i");
    const m = html.match(a) || html.match(b);
    if (m?.[1]) return decode(m[1]);
  }
  return null;
}

function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (!s) return null;
  // "1.299,99" -> 1299.99 ; "1,299.99" -> 1299.99 ; "29,99" -> 29.99
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// deno-lint-ignore no-explicit-any
function findProduct(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findProduct(n); if (r) return r; }
    return null;
  }
  const t = node["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return node;
  if (node["@graph"]) return findProduct(node["@graph"]);
  return null;
}

function jsonLdProduct(html: string) {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const b of blocks) {
    try {
      const p = findProduct(JSON.parse(b[1].trim()));
      if (p) return p;
    } catch { /* blocco non valido, si passa al prossimo */ }
  }
  return null;
}

function absolute(u: string | null, base: string): string | null {
  if (!u) return null;
  try { return new URL(u.trim(), base).href; } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let url: string;
  try {
    ({ url } = await req.json());
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    // Niente indirizzi interni/privati
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname) ||
        u.hostname.endsWith(".internal") || u.hostname.endsWith(".local")) throw new Error();
  } catch {
    return json({ error: "Link non valido" }, 400);
  }

  let html = "", finalUrl = url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
    });
    finalUrl = res.url || url;
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return json({ error: "Non riesco ad aprire la pagina del negozio" }, 502);
  }

  const product = jsonLdProduct(html);

  // --- FOTO ---
  let image =
    meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src", "image"]) ??
    null;
  if (!image && product?.image) {
    const im = product.image;
    image = typeof im === "string" ? im : Array.isArray(im) ? (typeof im[0] === "string" ? im[0] : im[0]?.url) : im.url;
  }
  if (!image) {
    // Amazon
    const hires = html.match(/data-old-hires=["']([^"']+)["']/i)?.[1];
    const dyn = html.match(/data-a-dynamic-image=["']\{&quot;([^&]+)&quot;/i)?.[1];
    const landing = html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i)?.[1];
    image = hires || dyn || landing || null;
  }
  if (!image) image = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null;

  // --- TITOLO ---
  const amazonTitle = html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const title =
    (amazonTitle && decode(amazonTitle)) ||
    (product?.name && decode(String(product.name))) ||
    meta(html, ["og:title", "twitter:title"]) ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] && decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1])) ||
    null;

  // --- DESCRIZIONE ---
  const description = meta(html, ["og:description", "description", "twitter:description"]);

  // --- PREZZO ---
  const offers = product?.offers ? (Array.isArray(product.offers) ? product.offers[0] : product.offers) : null;
  const price =
    parsePrice(offers?.price ?? offers?.lowPrice) ??
    parsePrice(meta(html, ["product:price:amount", "og:price:amount", "price"])) ??
    parsePrice(html.match(/class=["']a-price[^"']*["'][^>]*>\s*<span class=["']a-offscreen["']>([^<]+)</i)?.[1]) ??
    null;

  const store = new URL(finalUrl).hostname.replace(/^www\./, "");

  return json({
    image: absolute(image, finalUrl),
    title,
    description: description && description.length > 300 ? description.slice(0, 297) + "…" : description,
    price,
    store,
  });
});
