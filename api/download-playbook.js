const fs = require("fs");
const path = require("path");

const MONO_STATUS_URL = "https://api.monobank.ua/api/merchant/invoice/status";
const PDF_PATH = path.join(
  process.cwd(),
  "api",
  "_private",
  "real-estate-meta-playbook.pdf"
);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getInvoiceId(req) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  return (url.searchParams.get("invoiceId") || "").trim();
}

function isSafeInvoiceId(invoiceId) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(invoiceId);
}

function safeReferencePrefix(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
}

function isPlaybookReference(reference) {
  const productCode = safeReferencePrefix(
    process.env.PRODUCT_CODE || "real-estate-meta-playbook"
  );

  const allowedPrefixes = [
    productCode ? `${productCode}_` : "",
    "meta_"
  ].filter(Boolean);

  return allowedPrefixes.some((prefix) => reference.startsWith(prefix));
}

async function getMonoInvoiceStatus(invoiceId, monoToken) {
  const url = new URL(MONO_STATUS_URL);
  url.searchParams.set("invoiceId", invoiceId);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": monoToken,
      "Accept": "application/json"
    }
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.errText || data.errorDescription || data.message || "Mono invoice status request failed.";
    const err = new Error(message);
    err.statusCode = response.status;
    err.payload = data;
    throw err;
  }

  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, {
      ok: false,
      error: "Method not allowed. Use GET."
    });
    return;
  }

  const monoToken = process.env.MONO_TOKEN;

  if (!monoToken) {
    sendJson(res, 500, {
      ok: false,
      error: "MONO_TOKEN is not configured."
    });
    return;
  }

  const invoiceId = getInvoiceId(req);

  if (!invoiceId || !isSafeInvoiceId(invoiceId)) {
    sendJson(res, 400, {
      ok: false,
      error: "Valid invoiceId is required."
    });
    return;
  }

  try {
    const monoData = await getMonoInvoiceStatus(invoiceId, monoToken);
    const reference = String(monoData.reference || "");

    if (monoData.status !== "success") {
      sendJson(res, 403, {
        ok: false,
        error: "Payment is not confirmed yet.",
        status: monoData.status || null
      });
      return;
    }

    if (!isPlaybookReference(reference)) {
      sendJson(res, 403, {
        ok: false,
        error: "Payment does not match this product.",
        status: monoData.status || null
      });
      return;
    }

    if (!fs.existsSync(PDF_PATH)) {
      sendJson(res, 500, {
        ok: false,
        error: "Protected PDF is missing from the deployment."
      });
      return;
    }

    const file = fs.readFileSync(PDF_PATH);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="The Real Estate Meta Playbook.pdf"; filename*=UTF-8\'\'The%20Real%20Estate%20Meta%20Playbook.pdf'
    );
    res.setHeader("Content-Length", String(file.length));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end(file);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Could not verify payment."
    });
  }
};
