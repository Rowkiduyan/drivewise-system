// Minimal test: does a <form onSubmit> with a required type=number empty input
// actually block the submit event (so handleSubmit never fires)?
// We test this on the REAL form page by intercepting the network.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let submitFired = false;
let submitError = null;

// Intercept Supabase insert
page.on("response", async (res) => {
  const url = res.url();
  if (url.includes("/rest/v1/delivery_requests") && res.request().method() === "POST") {
    const text = await res.text().catch(() => "");
    submitError = { status: res.status(), body: text.slice(0, 300) };
  }
});

// Also listen for console logs
page.on("console", msg => { if (msg.text().includes("cargo") || msg.text().includes("insert")) console.log("CONSOLE:", msg.text()); });

await page.goto("https://localhost:5175/customer/deliveries/request", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(4000);

// The page uses lazy-loaded React route. Wait for the form to appear.
try {
  await page.waitForSelector('htmlFor="cargoWeight"', { timeout: 15000 });
  console.log("Form appeared (cargoWeight label found)");
} catch (e) {
  console.log("Form NOT found, checking page...");
  const title = await page.title();
  console.log("Page title:", title);
  const html = await page.content();
  console.log("Has delivery route:", html.includes("customer/deliveries/request"));
}

// Check current URL
console.log("URL:", page.url());
await browser.close();
