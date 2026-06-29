const MONO_STATUS_URL = "https://api.monobank.ua/api/merchant/invoice/status";

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed. Use GET.",
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

    const url = new URL(req.url, `https://${req.headers.host}`);
    const invoiceId = url.searchParams.get("invoiceId");

    if (!invoiceId) {
      return sendJson(res, 400, {
        ok: false,
        error: "invoiceId is required.",
      });
    }

    const monoResponse = await fetch(
      `${MONO_STATUS_URL}?invoiceId=${encodeURIComponent(invoiceId)}`,
      {
        method: "GET",
        headers: {
          "X-Token": monoToken,
        },
      }
    );

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
        error: "Could not check invoice status.",
        mono: monoData,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      invoiceId: monoData.invoiceId,
      status: monoData.status,
      amount: monoData.amount,
      ccy: monoData.ccy,
      finalAmount: monoData.finalAmount,
      reference: monoData.reference,
      failureReason: monoData.failureReason || null,
      paymentMethod: monoData.paymentInfo?.paymentMethod || null,
      paymentSystem: monoData.paymentInfo?.paymentSystem || null,
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Server error.",
    });
  }
};
