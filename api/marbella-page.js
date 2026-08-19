const fs = require("fs");
const path = require("path");

const HTML_PATH = path.join(process.cwd(), "marbella.html");

module.exports = async function handler(req, res) {
  try {
    let html = fs.readFileSync(HTML_PATH, "utf8");

    const original = `        if (typeof window.fbq === "function") {
          window.fbq("track", "Lead", { content_name: "Daniel Marbella Campaign Teardown" });
        }
        form.reset();
        status.className = "form-status success";
        status.textContent = strings.success;
        postSubmit.hidden = false;`;

    const replacement = `        if (typeof window.fbq === "function") {
          window.fbq("track", "Lead", { content_name: "Daniel Marbella Campaign Teardown" });
        }
        try {
          localStorage.setItem("marbellaLeadName", String(data.get("name") || ""));
          localStorage.setItem("marbellaLeadEmail", String(data.get("email") || ""));
        } catch (storageError) {
          // Checkout still works without browser storage.
        }
        window.location.assign("/marbella-thank-you");
        return;`;

    if (!html.includes(original)) {
      console.warn("Marbella thank-you injection target was not found. Serving original landing page.");
    } else {
      html = html.replace(original, replacement);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.end(html);
  } catch (error) {
    console.error("Could not render Marbella landing", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Could not load the Marbella page.");
  }
};
