import { chromium } from "playwright";

const BASE = "http://localhost:3411";
const email = `smoke+${Date.now()}@example.com`;

function check(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage();

try {
  // Signup
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name="name"]', "Smoke Test");
  await page.fill('input[name="companyName"]', "Smoke Fitness Co");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correcthorsebattery");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/onboarding/, { timeout: 10000 });
  check("signup redirects to onboarding", page.url().includes("/onboarding"));

  // Onboarding — pick Fitness/Coaching template (already default first card) and submit
  await page.waitForSelector('textarea[name="whatYouSell"]');
  const whatYouSell = await page.inputValue('textarea[name="whatYouSell"]');
  check("vertical template pre-fills whatYouSell", whatYouSell.length > 0);
  await page.fill('textarea[name="idealCustomer"]', "Intermediate lifters who plateaued");
  await page.click('button:has-text("Start scanning")');
  await page.waitForURL(/\/campaigns\//, { timeout: 10000 });
  check("onboarding redirects to new campaign", page.url().includes("/campaigns/"));

  const campaignUrl = page.url();

  // Campaign page shows seeded keywords
  const keywordCount = await page.locator("text=looking for a coach").count();
  check("campaign seeded with vertical template keywords", keywordCount > 0);

  // Manual import — without ANTHROPIC_API_KEY, should show a clear, honest error (not a fake result)
  await page.fill('textarea[name="originalText"]', "Looking for an online coach, I've plateaued for a year.");
  await page.fill('input[name="url"]', "https://example.com/smoke-test-post");
  await page.click('button:has-text("Analyze this conversation")');
  await page.waitForTimeout(1500);
  const bodyText = await page.textContent("body");
  check(
    "manual import fails honestly when ANTHROPIC_API_KEY is unset (no fabricated result)",
    bodyText.includes("ANTHROPIC_API_KEY")
  );

  // Opportunities feed — should show the honest empty state, not fabricated cards
  await page.goto(`${BASE}/opportunities`);
  const feedText = await page.textContent("body");
  check(
    "opportunities feed shows honest 'no strong opportunities' empty state",
    feedText.includes("No strong opportunities found")
  );

  // Campaigns list page
  await page.goto(`${BASE}/campaigns`);
  const campaignsText = await page.textContent("body");
  check("campaigns list shows the created campaign", campaignsText.includes("Smoke Fitness Co") || (await page.locator("a[href^='/campaigns/']").count()) > 0);

  // Log out works
  await page.click('button:has-text("Log out")');
  await page.waitForURL(/\/login/, { timeout: 10000 });
  check("logout redirects to /login", page.url().includes("/login"));
} finally {
  await browser.close();
}

console.log(process.exitCode === 1 ? "\nSMOKE TEST: FAILURES ABOVE" : "\nSMOKE TEST: ALL PASSED");
