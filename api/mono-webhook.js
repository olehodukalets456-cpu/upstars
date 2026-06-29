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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const secretFromUrl = url.searchParams.get("secret");
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (expectedSecret && secretFromUrl !== expectedSecret) {
    return sendJson(res, 401, {
      ok: false,
      error: "Invalid webhook secret.",
    });
  }

  const payload = await readJsonBody(req);

  console.log("MONO WEBHOOK:", JSON.stringify(payload, null, 2));

  // Тут пізніше можна додати:
  // 1. запис у базу даних
  // 2. відправку email покупцю
  // 3. Telegram/Slack notification тобі
  // 4. видачу доступу до PDF

  return sendJson(res, 200, {
    ok: true,
  });
};
