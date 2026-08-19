const crypto = require("crypto");

const MONO_CREATE_INVOICE_URL = "https://api.monobank.ua/api/merchant/invoice/create";
const PRODUCT_NAME = "Marbella Real Estate Ad Intelligence";
const PRODUCT_CODE = "marbella-ad-intelligence";
const AMOUNT = 4900;
const CCY = 840;

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function getSiteUrl(req) {
  const envUrl = process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
  }

  try {
    const monoToken = process.env.MONO_TOKEN;
    if (!monoToken) {
      return sendJson(res, 500, { ok: false, error: "Payment configuration is unavailable." });
    }

    const body = await readJsonBody(req);
    const customerEmail = typeof body.customerEmail === "string"
      ? body.customerEmail.trim().toLowerCase().slice(0, 254)
      : "";
    const siteUrl = getSiteUrl(req);
    const reference = `intel_${Date.now()}_${crypto.randomUUID().replace(/-/g, "")}`;
    const webhookSecret = process.env.WEBHOOK_SECRET || "";

    const invoicePayload = {
      amount: AMOUNT,
      ccy: CCY,
      merchantPaymInfo: {
        reference,
        destination: `Purchase: ${PRODUCT_NAME}`,
        comment: `Purchase: ${PRODUCT_NAME}`,
        customerEmails: customerEmail ? [customerEmail] : [],
        metadata: {
          product: PRODUCT_CODE,
          source: "marbella-thank-you"
        },
        basketOrder: [{
          name: PRODUCT_NAME,
          qty: 1,
          sum: AMOUNT,
          total: AMOUNT,
          unit: "pcs.",
          code: PRODUCT_CODE
        }]
      },
      redirectUrl: `${siteUrl}/intelligence-payment-result.html`,
      validity: 3600,
      paymentType: "debit"
    };

    if (webhookSecret) {
      invoicePayload.webHookUrl = `${siteUrl}/api/mono-webhook?secret=${encodeURIComponent(webhookSecret)}`;
    }

    const monoResponse = await fetch(MONO_CREATE_INVOICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Token": monoToken,
        "X-Cms": "custom-vercel",
        "X-Cms-Version": "1.0.0"
      },
      body: JSON.stringify(invoicePayload)
    });

    const monoText = await monoResponse.text();
    let monoData = {};
    try { monoData = monoText ? JSON.parse(monoText) : {}; }
    catch { monoData = { raw: monoText }; }

    if (!monoResponse.ok || !monoData.pageUrl || !monoData.invoiceId) {
      console.error("Marbella Intelligence Mono invoice error", monoResponse.status, monoData);
      return sendJson(res, monoResponse.status || 502, {
        ok: false,
        error: "Could not start checkout. Please try again."
      });
    }

    return sendJson(res, 200, {
      ok: true,
      invoiceId: monoData.invoiceId,
      pageUrl: monoData.pageUrl,
      reference
    });
  } catch (error) {
    console.error("Marbella Intelligence checkout error", error);
    return sendJson(res, 500, {
      ok: false,
      error: "Could not start checkout. Please try again."
    });
  }
};
