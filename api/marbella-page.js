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

        const transitionCopy = {
          en: {
            eyebrow: "Case sent",
            title: "The case is already in your inbox.",
            body: "If you don't see it in a few minutes, check Spam or Promotions.",
            tease: "And if you're more interested in how the Marbella market works right now — what competitors are advertising, how they position offers, and what happens after the click — I have something for you next.",
            next: "Opening Marbella Market Intelligence…"
          },
          uk: {
            eyebrow: "Кейс надіслано",
            title: "Кейс уже у вас на пошті.",
            body: "Якщо не знайдете його за кілька хвилин, перевірте папку «Спам» або «Промоакції».",
            tease: "А якщо вас більше цікавить, як зараз працює ринок Марбельї — що рекламують конкуренти, як вони позиціонують офери та що відбувається після кліку — далі покажу окрему аналітику.",
            next: "Відкриваю аналітику ринку Марбельї…"
          },
          es: {
            eyebrow: "Caso enviado",
            title: "El caso ya está en tu correo.",
            body: "Si no lo ves en unos minutos, revisa Spam o Promociones.",
            tease: "Y si te interesa más cómo funciona el mercado de Marbella ahora mismo — qué anuncian tus competidores, cómo posicionan sus ofertas y qué ocurre después del clic — tengo algo más para ti.",
            next: "Abriendo la inteligencia de mercado de Marbella…"
          }
        };
        const transition = transitionCopy[lang] || transitionCopy.en;
        const overlay = document.createElement("div");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", transition.title);
        overlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:rgba(16,19,18,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:0;transition:opacity .22s ease";
        overlay.innerHTML = \`
          <div style="width:min(620px,100%);background:#f3efe7;color:#11100e;border:1px solid rgba(243,239,231,.42);box-shadow:0 34px 100px rgba(0,0,0,.38);padding:clamp(28px,5vw,46px);position:relative">
            <div style="font:900 11px/1.2 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#b5482e;margin-bottom:18px">\${transition.eyebrow}</div>
            <div style="font:600 clamp(34px,6vw,50px)/1 Fraunces,Georgia,serif;letter-spacing:-.025em;max-width:520px">\${transition.title}</div>
            <p style="margin:20px 0 0;color:rgba(17,16,14,.68);font:500 15px/1.65 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">\${transition.body}</p>
            <div style="margin-top:24px;padding:20px 0 0;border-top:1px solid rgba(17,16,14,.14);font:500 15px/1.65 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#11100e">\${transition.tease}</div>
            <div style="margin-top:26px;font:800 11px/1.4 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.04em;text-transform:uppercase;color:rgba(17,16,14,.52)">\${transition.next}</div>
            <div style="height:3px;background:rgba(17,16,14,.1);margin-top:12px;overflow:hidden"><div id="marbellaTransitionProgress" style="width:100%;height:100%;background:#b5482e;transform-origin:left;transform:scaleX(1)"></div></div>
          </div>\`;
        document.body.appendChild(overlay);
        document.body.style.overflow = "hidden";
        requestAnimationFrame(() => {
          overlay.style.opacity = "1";
          const progress = document.getElementById("marbellaTransitionProgress");
          if (progress) {
            progress.style.transition = "transform 4.5s linear";
            requestAnimationFrame(() => { progress.style.transform = "scaleX(0)"; });
          }
        });
        window.setTimeout(() => {
          window.location.assign("/marbella-thank-you");
        }, 4500);
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
