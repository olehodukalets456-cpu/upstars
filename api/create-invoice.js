const crypto = require("crypto");

const MONO_CREATE_INVOICE_URL = "https://api.monobank.ua/api/merchant/invoice/create";

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (req.body && typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });

    req.on("error", () => resolve({}));
  });
}

function getSiteUrl(req) {
  const envUrl = process.env.SITE_URL;

  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;

  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    const monoToken = process.env.MONO_TOKEN;

    if (!monoToken) {
      return sendJson(res, 500, {
        ok: false,
        error: "MONO_TOKEN is missing in Vercel environment variables.",
      });
    }

    const body = await readJsonBody(req);

    const customerEmail =
      typeof body.customerEmail === "string"
        ? body.customerEmail.trim().toLowerCase()
        : "";

    const siteUrl = getSiteUrl(req);

    const amount = Number(process.env.PLAYBOOK_AMOUNT_MINOR || 50000);
    const ccy = Number(process.env.PLAYBOOK_CCY || 840);

    if (!Number.isInteger(amount) || amount <= 0) {
      return sendJson(res, 500, {
        ok: false,
        error: "Invalid PLAYBOOK_AMOUNT_MINOR.",
      });
    }

    if (!Number.isInteger(ccy) || ccy <= 0) {
      return sendJson(res, 500, {
        ok: false,
        error: "Invalid PLAYBOOK_CCY.",
      });
    }

    const productName =
      process.env.PRODUCT_NAME || "The Real Estate Meta Playbook";

    const productCode =
      process.env.PRODUCT_CODE || "real-estate-meta-playbook";

    const reference = `meta_${Date.now()}_${crypto
      .randomUUID()
      .replace(/-/g, "")}`;

    const webhookSecret = process.env.WEBHOOK_SECRET || "";

    const invoicePayload = {
      amount,
      ccy,
      merchantPaymInfo: {
        reference,
        destination: `Purchase: ${productName}`,
        comment: `Purchase: ${productName}`,
        customerEmails: customerEmail ? [customerEmail] : [],
        metadata: {
          product: productCode,
          source: "website",
        },
        basketOrder: [
          {
            name: productName,
            qty: 1,
            sum: amount,
            total: amount,
            unit: "pcs.",
            code: productCode,
          },
        ],
      },

      // Mono поверне юзера сюди після завершення оплати.
      // Важливо: redirectUrl може повертати і після успіху, і після фейлу.
      redirectUrl: `${siteUrl}/payment-result.html`,

      // Invoice активний 1 годину.
      validity: 3600,

      // Звичайна оплата, не холд.
      paymentType: "debit",
    };

    if (webhookSecret) {
      invoicePayload.webHookUrl = `${siteUrl}/api/mono-webhook?secret=${encodeURIComponent(
        webhookSecret
      )}`;
    }

    // successUrl/failUrl у mono за замовчуванням можуть бути недоступні.
    // Якщо mono support активує цю функцію — можеш задати env змінні.
    if (process.env.MONO_SUCCESS_URL) {
      invoicePayload.successUrl = process.env.MONO_SUCCESS_URL;
    }

    if (process.env.MONO_FAIL_URL) {
      invoicePayload.failUrl = process.env.MONO_FAIL_URL;
    }

    const monoResponse = await fetch(MONO_CREATE_INVOICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Token": monoToken,
        "X-Cms": "custom-vercel",
        "X-Cms-Version": "1.0.0",
      },
      body: JSON.stringify(invoicePayload),
    });

    const monoText = await monoResponse.text();

    let monoData;
    try {
      monoData = monoText ? JSON.parse(monoText) : {};
    } catch {
      monoData = { raw: monoText };
    }

    if (!monoResponse.ok) {
      return sendJson(res, monoResponse.status, {
        ok: false,
        error: "Monobank invoice creation failed.",
        mono: monoData,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      invoiceId: monoData.invoiceId,
      pageUrl: monoData.pageUrl,
      reference,
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Server error.",
    });
  }
};
