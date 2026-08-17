const crypto = require("crypto");

const RESEND_API_URL = "https://api.resend.com";
const SITE_URL = "https://realadbook.com";
const CASE_PATH = "/api/download-case";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const LEAD_SEGMENT_NAME = "Marbella Case Leads";
const CONTACT_PROPERTIES = [
  { key: "source", type: "string", fallback_value: "website" },
  { key: "language", type: "string", fallback_value: "en" },
  { key: "marketing_consent", type: "string", fallback_value: "false" },
  { key: "consent_recorded_at", type: "string", fallback_value: "not_recorded" }
];

let setupPromise;

const copy = {
  en: {
    subject: "Daniel's Marbella Meta campaign teardown",
    preview: "Daniel's Marbella campaign teardown is ready.",
    intro: "Here is Daniel's Marbella campaign teardown.",
    body: "It shows how a real client's Marbella account moved from $169 to $31 per qualified buyer with almost the same spend, while keeping protected implementation details inside the full Playbook.",
    button: "Download the free case",
    note: "This private download link is valid for 7 days.",
    signoff: "If you have a question after reading it, just reply to this email.",
    role: "Real Estate Performance Marketing Specialist",
    footer: "You received this email because you requested Daniel's Marbella case on realadbook.com."
  },
  uk: {
    subject: "Розбір Meta-кампанії Daniel у Marbella",
    preview: "Розбір кампанії Daniel у Marbella готовий.",
    intro: "Ось розбір кампанії Daniel у Marbella.",
    body: "У ньому показано, як акаунт реального клієнта у Marbella знизив вартість кваліфікованого покупця зі $169 до $31 за майже незмінного бюджету, а захищені деталі реалізації залишилися всередині повного Playbook.",
    button: "Завантажити безкоштовний кейс",
    note: "Приватне посилання діє 7 днів.",
    signoff: "Якщо після прочитання виникне питання — просто дайте відповідь на цей лист.",
    role: "Спеціаліст із performance-маркетингу в нерухомості",
    footer: "Ви отримали цей лист, тому що запросили кейс Daniel у Marbella на realadbook.com."
  },
  es: {
    subject: "El teardown de la campaña Meta de Daniel en Marbella",
    preview: "El teardown de Daniel en Marbella está listo.",
    intro: "Aquí tienes el teardown de la campaña de Daniel en Marbella.",
    body: "Muestra cómo la cuenta de un cliente real en Marbella pasó de $169 a $31 por comprador cualificado con casi la misma inversión, mientras los detalles protegidos de implementación permanecen dentro del Playbook completo.",
    button: "Descargar el caso gratis",
    note: "Este enlace privado de descarga es válido durante 7 días.",
    signoff: "Si tienes alguna pregunta después de leerlo, responde directamente a este email.",
    role: "Especialista en performance marketing inmobiliario",
    footer: "Has recibido este email porque solicitaste el caso de Daniel en Marbella en realadbook.com."
  }
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}

function isValidName(name) {
  return name.length >= 2 && !/[<>]/.test(name);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function resendRequest(path, apiKey, options = {}) {
  const response = await fetch(`${RESEND_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data.message || data.error || "Resend request failed.");
    error.statusCode = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

async function ensureResendSetup(apiKey) {
  const [propertiesResponse, segmentsResponse] = await Promise.all([
    resendRequest("/contact-properties", apiKey),
    resendRequest("/segments", apiKey)
  ]);

  const existingProperties = new Set(
    (propertiesResponse.data || []).map((property) => property.key)
  );

  await Promise.all(CONTACT_PROPERTIES.map(async (property) => {
    if (existingProperties.has(property.key)) return;

    try {
      await resendRequest("/contact-properties", apiKey, {
        method: "POST",
        body: JSON.stringify(property)
      });
    } catch (error) {
      if (error.statusCode !== 409 && error.statusCode !== 422) throw error;
    }
  }));

  const existingSegment = (segmentsResponse.data || [])
    .find((segment) => segment.name === LEAD_SEGMENT_NAME);
  if (existingSegment) return existingSegment.id;

  try {
    const segment = await resendRequest("/segments", apiKey, {
      method: "POST",
      body: JSON.stringify({ name: LEAD_SEGMENT_NAME })
    });
    return segment.id;
  } catch (error) {
    if (error.statusCode !== 409 && error.statusCode !== 422) throw error;
    const refreshed = await resendRequest("/segments", apiKey);
    const segment = (refreshed.data || [])
      .find((item) => item.name === LEAD_SEGMENT_NAME);
    if (!segment) throw error;
    return segment.id;
  }
}

function getSegmentId(apiKey) {
  if (!setupPromise) {
    setupPromise = ensureResendSetup(apiKey).catch((error) => {
      setupPromise = undefined;
      throw error;
    });
  }
  return setupPromise;
}

async function upsertContact({ apiKey, email, name, marketingConsent, language, source }) {
  const segmentId = await getSegmentId(apiKey);
  const contact = {
    email,
    first_name: name,
    unsubscribed: !marketingConsent,
    properties: {
      source,
      language,
      marketing_consent: String(marketingConsent),
      consent_recorded_at: new Date().toISOString()
    }
  };

  try {
    await resendRequest("/contacts", apiKey, {
      method: "POST",
      body: JSON.stringify(contact)
    });
  } catch (error) {
    if (error.statusCode !== 409 && error.statusCode !== 422) throw error;

    await resendRequest(`/contacts/${encodeURIComponent(email)}`, apiKey, {
      method: "PATCH",
      body: JSON.stringify({
        first_name: name,
        unsubscribed: !marketingConsent,
        properties: contact.properties
      })
    });
  }

  try {
    await resendRequest(
      `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`,
      apiKey,
      { method: "POST" }
    );
  } catch (error) {
    if (error.statusCode !== 409 && error.statusCode !== 422) throw error;
  }
}

function renderEmail({ name, language, downloadUrl }) {
  const strings = copy[language] || copy.en;
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(downloadUrl);
  const portraitUrl = `${SITE_URL}/author-capital.jpg`;

  return {
    subject: strings.subject,
    html: `<!doctype html>
<html lang="${language === "uk" ? "uk" : language}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#f3efe7;color:#11100e;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(strings.preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3efe7;padding:30px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #d8d1c5;">
          <tr><td style="background:#11100e;padding:24px 30px;color:#f3efe7;font-family:Georgia,serif;font-size:22px;font-weight:700;line-height:1.05;">
            The Real Estate <span style="color:#c9844e;font-style:italic;">Meta</span> Playbook
          </td></tr>
          <tr><td style="padding:36px 30px 30px;">
            <p style="margin:0 0 20px;font-size:18px;line-height:1.55;">Hi ${safeName},</p>
            <p style="margin:0 0 16px;font-size:17px;line-height:1.6;">${escapeHtml(strings.intro)}</p>
            <p style="margin:0 0 28px;color:#5b5750;font-size:15px;line-height:1.65;">${escapeHtml(strings.body)}</p>
            <p style="margin:0 0 22px;">
              <a href="${safeUrl}" style="display:inline-block;background:#b74b2c;color:#fff;padding:16px 22px;text-decoration:none;font-size:13px;font-weight:800;text-transform:uppercase;">${escapeHtml(strings.button)}</a>
            </p>
            <p style="margin:0 0 30px;color:#777168;font-size:12px;line-height:1.5;">${escapeHtml(strings.note)}</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.65;">${escapeHtml(strings.signoff)}</p>
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">
                  <img src="${portraitUrl}" width="64" height="64" alt="Oleh Odukalets" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover;object-position:50% 78%;border:1px solid #d8d1c5;">
                </td>
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 4px;font-size:15px;font-weight:800;line-height:1.3;">Oleh Odukalets</p>
                  <p style="margin:0;color:#777168;font-size:12px;line-height:1.45;">${escapeHtml(strings.role)}</p>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 30px;border-top:1px solid #d8d1c5;color:#777168;font-size:11px;line-height:1.5;">
            ${escapeHtml(strings.footer)}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const downloadSecret = process.env.CASE_DOWNLOAD_SECRET || apiKey;
  const emailDomain = process.env.RESEND_EMAIL_DOMAIN || "realadbook.com";
  const from = process.env.CASE_FROM_EMAIL || `Oleh Odukalets <oleh@${emailDomain}>`;

  if (!apiKey || !downloadSecret) {
    sendJson(res, 503, { ok: false, error: "Email delivery is not configured yet." });
    return;
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
    return;
  }

  if (String(body.company || "").trim()) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const name = normalizeName(body.name);
  const email = normalizeEmail(body.email);
  const marketingConsent = body.marketingConsent === true;
  const language = ["en", "uk", "es"].includes(body.language) ? body.language : "en";
  const source = String(body.source || "website-marbella-case").slice(0, 80);

  if (!isValidName(name)) {
    sendJson(res, 400, { ok: false, error: "Please enter a valid name." });
    return;
  }

  if (!isValidEmail(email)) {
    sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
    return;
  }

  try {
    await upsertContact({ apiKey, email, name, marketingConsent, language, source });

    const token = signToken({
      email,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    }, downloadSecret);
    const downloadUrl = `${SITE_URL}${CASE_PATH}?token=${encodeURIComponent(token)}`;
    const emailCopy = renderEmail({ name, language, downloadUrl });

    await resendRequest("/emails", apiKey, {
      method: "POST",
      body: JSON.stringify({
        from,
        to: [email],
        subject: emailCopy.subject,
        html: emailCopy.html,
        reply_to: process.env.CASE_REPLY_TO || "oleh.odukalets@gmail.com"
      })
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("request-case failed", {
      message: error.message,
      statusCode: error.statusCode || null
    });
    sendJson(res, 502, {
      ok: false,
      error: "Could not send the case right now. Please try again shortly."
    });
  }
};
