// Edge Function: dato il link di un prodotto, restituisce foto, titolo, prezzo e negozio.
// Su Amazon il prezzo è SOLO quello dell'offerta venduta da Amazon.it (non il venditore più economico).
// Richiede il login (verify_jwt = true), così non può essere usata come proxy da chiunque.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
};
async function get(url: string, cookie?: string) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: cookie ? { ...HEADERS, Cookie: cookie } : HEADERS });
  return { url: res.url || url, status: res.status, html: (await res.text()).slice(0, 3_000_000) };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();
const text = (h: string) => decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));

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
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
// deno-lint-ignore no-explicit-any
function findProduct(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findProduct(n); if (r) return r; } return null; }
  const t = node["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return node;
  if (node["@graph"]) return findProduct(node["@graph"]);
  return null;
}
function jsonLdProduct(html: string) {
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const p = findProduct(JSON.parse(b[1].trim())); if (p) return p; } catch { /* blocco non valido */ }
  }
  return null;
}
const absolute = (u: string | null, base: string) => { if (!u) return null; try { return new URL(u.trim(), base).href; } catch { return null; } };

// ritaglia l'HTML a partire da un id (es. un riquadro della pagina Amazon)
function section(html: string, id: string, len = 8000): string | null {
  const i = html.search(new RegExp(`id=["']${id}["']`, "i"));
  return i < 0 ? null : html.slice(i, i + len);
}
const firstOffscreen = (h: string | null) => h ? parsePrice(h.match(/class=["'][^"']*\b(?:a-offscreen|aok-offscreen)\b[^"']*["'][^>]*>\s*([^<]+?)\s*</i)?.[1]) : null;

/* ======================= AMAZON ======================= */
// diagnostica: { debug: { grep: "regex", len: 1500, max: 3 } } restituisce ritagli delle pagine lette
function grep(where: string, html: string) {
  if (!DBG?.grep) return;
  const re = new RegExp(DBG.grep.re, "gi"); const out: string[] = []; let m;
  while ((m = re.exec(html)) && out.length < (DBG.grep.max ?? 3)) { out.push(html.slice(Math.max(0, m.index - 100), m.index + (DBG.grep.len ?? 1500)).replace(/\s+/g, " ")); re.lastIndex = m.index + 1000; }
  (DBG.grepOut ||= {})[where] = out;
}
// deno-lint-ignore no-explicit-any
let DBG: any = null;   // diagnostica, solo se richiesta con { debug: true }
const isAmazon = (host: string) => /(^|\.)amazon\.[a-z.]+$/i.test(host) || /^(amzn\.(eu|to)|a\.co)$/i.test(host);
const AMAZON_IT_ID = "A11IL2PNWYJU7H";   // codice venditore di Amazon.it (usato anche nel filtro "Venduto da Amazon")
const isAmazonSeller = (s: string) => /^\s*(amazon(\.it|\.com|\.de|\.fr|\.es)?|amazon eu s\.?\s?(a|à) ?r\.? ?l\.?)\s*$/i.test(s);
function asinOf(u: string): string | null {
  const m = u.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|o\/ASIN)\/([A-Z0-9]{10})(?=[/?#]|$)/i);
  return m ? m[1].toUpperCase() : null;
}
const blocked = (h: string) => /captcha|api-services-support@amazon|Inserisci i caratteri che vedi/i.test(h) && !/id=["']productTitle["']/i.test(h);

// Nota: Amazon mostra prezzi e venditori in base all'indirizzo di consegna. Il server non è in Italia
// e Amazon non gli permette di cambiare località senza account, quindi alcune offerte di Amazon.it
// (prodotti che non spedisce all'estero) dal server non sono visibili: in quel caso non si inventa un prezzo.

// prezzo e venditore del riquadro d'acquisto principale
function amazonBuybox(html: string) {
  const core = section(html, "corePriceDisplay_desktop_feature_div") ?? section(html, "corePrice_feature_div") ??
    section(html, "corePrice_desktop") ?? section(html, "apex_desktop");
  let price = core ? parsePrice(core.match(/priceToPay[\s\S]{0,400}?a-offscreen["'][^>]*>\s*([^<]+)</i)?.[1]) ?? firstOffscreen(core) : null;
  if (price == null && core) {
    const w = core.match(/a-price-whole["'][^>]*>([\d.]+)/i)?.[1], f = core.match(/a-price-fraction["'][^>]*>(\d+)/i)?.[1];
    if (w) price = parsePrice(`${w.replace(/\./g, "")},${f ?? "00"}`);
  }
  // prezzo consigliato / prezzo precedente, utile come "prezzo pieno"
  const basis = core?.match(/basisPrice[\s\S]{0,600}?a-offscreen["'][^>]*>\s*([^<]+)</i)?.[1];
  const listPrice = parsePrice(basis);
  // chi vende: riquadro "Venduto da"
  let seller: string | null = null;
  const mid = html.match(/id=["']merchantID["'][^>]*value=["']([A-Z0-9]*)["']/i)?.[1] || null;
  const sp = html.match(/id=["']sellerProfileTriggerId["'][^>]*>([^<]+)</i)?.[1];
  if (sp) seller = decode(sp);
  else {
    const box = section(html, "merchantInfoFeature_feature_div", 3000) ?? section(html, "tabular-buybox", 6000) ?? section(html, "merchant-info", 1500);
    const t = box ? text(box) : "";
    const m = t.match(/(?:Venditore|Venduto da|Sold by)\s+(.+?)(?:\s+(?:Resi|Pagamento|Spedizione|Spedito|Imballaggio|Returns|Payment)\b|$)/i);
    if (m) seller = m[1].trim();
  }
  if (mid === AMAZON_IT_ID) seller = "Amazon.it";
  return { price, listPrice, seller, merchantId: mid };
}

// elenco di tutte le offerte ("Altri venditori"): cerca quella di Amazon.it, condizione Nuovo
async function amazonOffers(origin: string, asin: string) {
  const out: { price: number | null; seller: string; used: boolean; sid: string | null }[] = [];
  try {
    const r = await get(`${origin}/gp/product/ajax/aodAjaxMain/ref=dp_aod_NEW_mbc?asin=${asin}&pc=dp&experienceId=aodAjaxMain`);
    grep("aod", r.html);
    if (r.status >= 400 || blocked(r.html)) return { offers: out, ok: false };
    const parts = r.html.split(/(?=id=["']aod-(?:pinned-)?offer["'])/i).slice(1);
    for (const p of parts) {
      const block = p.slice(0, 80000);   // un'offerta può essere lunga (moduli, script)
      const sb = block.match(/id=["']aod-offer-soldBy["'][\s\S]*?(?=id=["']aod-offer-(?!soldBy|seller-rating)|$)/i)?.[0] ?? "";
      if (!sb) continue;
      const sid = sb.match(/[?&;]seller=([A-Z0-9]+)/i)?.[1] ?? null;
      const name = text("<div " + sb.replace(/<[^>]*$/, "")).replace(/^(Venditore|Venduto da|Sold by)\s*/i, "")
        .split(/\s*(?:la valutazione|valutazion|\(\d|\d+\s?%|apre una nuova|nuovo venditore|just launched)/i)[0].trim();
      const seller = sid === AMAZON_IT_ID ? "Amazon.it" : name;
      const head = block.match(/id=["']aod-offer-heading["'][\s\S]{0,400}/i)?.[0] ?? "";
      const used = /usato|ricondizionat|used|renewed/i.test(text(head));
      const price = firstOffscreen(block.match(/id=["']aod-price[^"']*["'][\s\S]{0,3000}/i)?.[0] ?? null) ??
        (() => { const w = block.match(/a-price-whole["'][^>]*>([\d.]+)/i)?.[1], f = block.match(/a-price-fraction["'][^>]*>(\d+)/i)?.[1]; return w ? parsePrice(`${w.replace(/\./g, "")},${f ?? "00"}`) : null; })();
      if (seller) out.push({ price, seller, used, sid });
    }
    if (DBG) DBG.aod = { status: r.status, len: r.html.length, offers: out };
    return { offers: out, ok: true };
  } catch { return { offers: out, ok: false }; }
}

async function amazon(pageUrl: string, html: string) {
  const asin = asinOf(pageUrl) ?? html.match(/name=["']ASIN["'][^>]*value=["']([A-Z0-9]{10})/i)?.[1] ?? null;
  const origin = new URL(pageUrl).origin;
  const titleRaw = html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const title = titleRaw ? decode(titleRaw) : meta(html, ["og:title", "title"]);
  const img = html.match(/data-old-hires=["']([^"']+)["']/i)?.[1] ||
    html.match(/data-a-dynamic-image=["']\{&quot;([^&]+)&quot;/i)?.[1] ||
    html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i)?.[1] || meta(html, ["og:image"]);
  grep("page", html);
  const bb = amazonBuybox(html);
  if (DBG) DBG.buybox = bb;
  const base = { title, image: img, store: new URL(pageUrl).hostname.replace(/^www\./, ""), listPrice: bb.listPrice };

  // 1) il riquadro principale è già di Amazon.it
  if (bb.seller && isAmazonSeller(bb.seller) && bb.price != null)
    return { ...base, price: bb.price, seller: "Amazon.it", amazonSeller: true };

  // 2) cerca l'offerta di Amazon.it tra tutte le offerte
  if (asin) {
    const { offers, ok } = await amazonOffers(origin, asin);
    const own = offers.find(o => !o.used && isAmazonSeller(o.seller) && o.price != null);
    if (own) return { ...base, price: own.price, seller: "Amazon.it", amazonSeller: true };
    // controllo diretto: pagina del prodotto "venduto da Amazon.it"
    try {
      const sm = await get(`${origin}/dp/${asin}?smid=${AMAZON_IT_ID}&psc=1`);
      const sb2 = amazonBuybox(sm.html);
      if (DBG) DBG.smid = sb2;
      if (sb2.price != null && (sb2.merchantId === AMAZON_IT_ID || (sb2.seller && isAmazonSeller(sb2.seller))))
        return { ...base, listPrice: base.listPrice ?? sb2.listPrice, price: sb2.price, seller: "Amazon.it", amazonSeller: true };
    } catch { /* ignora */ }
    const others = offers.filter(o => !o.used && o.price != null).map(o => o.price as number);
    const best = others.length ? Math.min(...others) : bb.price;
    if (ok && (offers.length || bb.price != null)) {
      return { ...base, price: null, seller: bb.seller, amazonSeller: false, otherPrice: best,
        note: "Non trovo un'offerta venduta da Amazon.it" + (best != null ? ` (altri venditori da ${best.toFixed(2).replace(".", ",")} €)` : "") +
          ": Amazon.it potrebbe non venderlo ora, oppure non mostrarlo fuori dall'Italia. Controlla sul sito e scrivi il prezzo a mano." };
    }
  }
  // 3) nessuna offerta di Amazon.it trovata: non si usa il prezzo di altri venditori
  return { ...base, price: null, seller: bb.seller, amazonSeller: false, otherPrice: bb.price,
    note: "Non riesco a vedere il prezzo di Amazon.it per questo prodotto: controlla sul sito e scrivi il prezzo a mano." };
}

/* ======================= HANDLER ======================= */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let url: string, debug: unknown = false;
  try {
    ({ url, debug } = await req.json());
    // deno-lint-ignore no-explicit-any
    const d: any = debug;
    DBG = d ? { grep: d?.grep ? { re: String(d.grep), len: +d.len || 1500, max: +d.max || 3 } : null } : null;
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname) ||
        u.hostname.endsWith(".internal") || u.hostname.endsWith(".local")) throw new Error();
  } catch {
    return json({ error: "Link non valido" }, 400);
  }

  let page;
  try { page = await get(url); } catch { return json({ error: "Non riesco ad aprire la pagina del negozio" }, 502); }
  const { html } = page, finalUrl = page.url;
  const host = new URL(finalUrl).hostname;

  if (isAmazon(host) || isAmazon(new URL(url).hostname)) {
    const pg = page;
    if (blocked(pg.html)) return json({ error: "Amazon ha bloccato la lettura automatica (verifica anti-robot): riprova tra poco o compila a mano" }, 502);
    const a = await amazon(pg.url, pg.html);
    return json({ ...a, image: absolute(a.image, finalUrl), ...(DBG ? { _debug: { ...DBG, status: pg.status, len: pg.html.length } } : {}) });
  }

  const product = jsonLdProduct(html);
  let image = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src", "image"]);
  if (!image && product?.image) {
    const im = product.image;
    image = typeof im === "string" ? im : Array.isArray(im) ? (typeof im[0] === "string" ? im[0] : im[0]?.url) : im.url;
  }
  if (!image) image = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
  const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = (product?.name && decode(String(product.name))) || meta(html, ["og:title", "twitter:title"]) || (pageTitle && decode(pageTitle)) || null;
  const description = meta(html, ["og:description", "description", "twitter:description"]);
  const offers = product?.offers ? (Array.isArray(product.offers) ? product.offers[0] : product.offers) : null;
  const price = parsePrice(offers?.price ?? offers?.lowPrice) ??
    parsePrice(meta(html, ["product:price:amount", "og:price:amount", "price"])) ?? null;

  return json({
    image: absolute(image, finalUrl), title,
    description: description && description.length > 300 ? description.slice(0, 297) + "…" : description,
    price, store: host.replace(/^www\./, ""),
  });
});
