import type { Page } from "puppeteer";

export async function closeModalIfPresent(page: Page): Promise<void> {
  const closed = await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>(
      '.btl-modal-closeButton, [class*="closeButton"]',
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (closed) {
    await new Promise((r) => setTimeout(r, 500));
  }
}
