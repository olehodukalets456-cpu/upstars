const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PDF_PATH = path.join(process.cwd(), "api", "_private", "marbella-teardown.pdf");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getToken(req) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  return (url.searchParams.get("token") || "").trim();
}

function decodeToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, suppliedSignature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);

  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { ok: false, error: "Method not allowed. Use GET." });
    return;
  }

  const secret = process.env.CASE_DOWNLOAD_SECRET || process.env.RESEND_API_KEY;
  if (!secret) {
    sendJson(res, 503, { ok: false, error: "Case delivery is not configured." });
    return;
  }

  const payload = decodeToken(getToken(req), secret);
  const now = Math.floor(Date.now() / 1000);

  if (!payload || !payload.email || !payload.exp || payload.exp < now) {
    sendJson(res, 403, { ok: false, error: "This download link is invalid or has expired." });
    return;
  }

  if (!fs.existsSync(PDF_PATH)) {
    sendJson(res, 500, { ok: false, error: "The case PDF is missing from the deployment." });
    return;
  }

  const file = fs.readFileSync(PDF_PATH);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Marbella Meta Campaign Teardown.pdf"; filename*=UTF-8\'\'Marbella%20Meta%20Campaign%20Teardown.pdf'
  );
  res.setHeader("Content-Length", String(file.length));
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.end(file);
};
