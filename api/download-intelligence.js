const fs = require("fs");
const path = require("path");

const MONO_STATUS_URL = "https://api.monobank.ua/api/merchant/invoice/status";
const PRODUCT_PREFIX = "intel_";
const EXPECTED_AMOUNT = 4900;
const EXPECTED_CCY = 840;
const PDF_PATH = path.join(
  process.cwd(),
  "api",
  "_private",
  "marbella-real-estate-ad-intelligence.pdf"
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

async function getMonoInvoiceStatus(invoiceId, monoToken) {
  const url = new URL(MONO_STATUS_URL);
  url.searchParams.set("invoiceId", invoiceId);
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Token": monoToken, "Accept": "application/json" }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const err = new Error(data.errText || data.errorDescription || data.message || "Could not verify payment.");
    err.statusCode = response.status;
    throw err;
  }
  return data;
}

function loadValidPdf() {
  try {
    if (!fs.existsSync(PDF_PATH)) return null;
    const stat = fs.statSync(PDF_PATH);
    if (!stat.isFile() || stat.size < 100000) return null;

    const file = fs.readFileSync(PDF_PATH);
    if (file.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
    return file;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, error: "Method not allowed. Use GET." });
  }

  const monoToken = process.env.MONO_TOKEN;
  if (!monoToken) return sendJson(res, 500, { ok: false, error: "Payment configuration is unavailable." });

  const invoiceId = getInvoiceId(req);
  if (!invoiceId || !isSafeInvoiceId(invoiceId)) {
    return sendJson(res, 400, { ok: false, error: "Valid invoiceId is required." });
  }

  try {
    const monoData = await getMonoInvoiceStatus(invoiceId, monoToken);
    const reference = String(monoData.reference || "");

    if (monoData.status !== "success") {
      return sendJson(res, 403, { ok: false, error: "Payment is not confirmed yet.", status: monoData.status || null });
    }

    if (!reference.startsWith(PRODUCT_PREFIX)) {
      return sendJson(res, 403, { ok: false, error: "Payment does not match this product." });
    }

    if (Number(monoData.amount) !== EXPECTED_AMOUNT || Number(monoData.ccy) !== EXPECTED_CCY) {
      return sendJson(res, 403, { ok: false, error: "Payment amount does not match this product." });
    }

    const file = loadValidPdf();
    if (!file) {
      return sendJson(res, 500, { ok: false, error: "Report file is temporarily unavailable." });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Marbella Real Estate Ad Intelligence.pdf"; filename*=UTF-8\'\'Marbella%20Real%20Estate%20Ad%20Intelligence.pdf'
    );
    res.setHeader("Content-Length", String(file.length));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end(file);
  } catch (error) {
    console.error("Marbella Intelligence download error", error);
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Could not verify payment."
    });
  }
};
