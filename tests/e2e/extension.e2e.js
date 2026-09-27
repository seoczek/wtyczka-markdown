import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";

const EXTENSION = resolve(import.meta.dirname, "../..");
const PAGE = readFileSync(resolve(EXTENSION, "test-page.html"));

let context;
let server;
let origin;
let worker;

test.beforeAll(async () => {
  server = createServer((request, response) => response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

async function selectAndClickButton(page, locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await locator.click({ clickCount: 3 });
  const rect = await page.evaluate(() => {
    const range = getSelection().getRangeAt(0);
    const rects = range.getClientRects();
    const { right, bottom } = rects[rects.length - 1];
    return { right, bottom };
  });
  await page.waitForFunction(() => document.querySelector("wm-markdown-ui"));
  await page.mouse.click(rect.right + 6 + 15, rect.bottom + 6 + 15);
}

const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

test("MD button converts the selection and copies it", async () => {
  const page = await context.newPage();
  await page.goto(origin);
  await selectAndClickButton(page, page.locator("#main-article li").first());
  await expect.poll(() => clipboard(page)).toContain("Pierwszy punkt z prostą treścią.");
  await page.close();
});

test("collect mode stores entries and updates the badge", async () => {
  await worker.evaluate(() => chrome.storage.sync.set({ "wm-settings": { collectMode: true } }));
  const page = await context.newPage();
  await page.goto(origin);
  await selectAndClickButton(page, page.locator("blockquote p"));
  await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get("wm-session"))["wm-session"]?.entries?.length ?? 0)).toBe(1);
  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe("1");
  await worker.evaluate(() => chrome.storage.sync.set({ "wm-settings": { collectMode: false } }));
  await page.close();
});

test("tables are exported as TSV for spreadsheets", async () => {
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => {
    const table = [...document.querySelectorAll("table")].at(-1);
    getSelection().selectAllChildren(table);
  });
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return convert({ tabId: tab.id, trigger: "popup" });
  });
  const stored = await worker.evaluate(async () => (await chrome.storage.session.get("wm-last-result"))["wm-last-result"]);
  expect(stored.tables[0]).toBe("Fraza\tWolumen\tKD\nmarkdown chrome\t1 300\t24\nkopiuj jako markdown\t480\t12");
  await page.close();
});

test("works inside a same-origin iframe", async () => {
  const page = await context.newPage();
  await page.goto(origin);
  const iframe = page.locator("iframe");
  await iframe.scrollIntoViewIfNeeded();
  const frame = page.frame({ url: "about:srcdoc" });
  await page.frameLocator("iframe").locator("p").click({ clickCount: 3 });
  const box = await iframe.boundingBox();
  const rect = await frame.evaluate(() => {
    const rects = getSelection().getRangeAt(0).getClientRects();
    const { right, bottom } = rects[rects.length - 1];
    return { right, bottom };
  });
  await frame.waitForFunction(() => document.querySelector("wm-markdown-ui"), null, { timeout: 5000 });
  await page.mouse.click(box.x + rect.right + 21, box.y + rect.bottom + 21);
  await expect.poll(() => clipboard(page)).toContain("Zaznacz ten akapit w ramce i kliknij **MD**.");
  await page.close();
});
