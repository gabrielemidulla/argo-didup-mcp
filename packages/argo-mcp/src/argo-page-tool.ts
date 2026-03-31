import type { Page } from "puppeteer";
import { openPortalIndex } from "./browser.ts";
import mcpToolResult, {
  type McpTextToolResult,
} from "./tool-response.ts";
import { getLoggedInPage } from "./session.ts";

export async function runWithPortalPage<T>(
  run: (page: Page) => Promise<T>,
): Promise<McpTextToolResult> {
  const page = getLoggedInPage();
  if (!page) return mcpToolResult.sessionNotReady();
  try {
    await openPortalIndex(page);
  } catch (e) {
    return mcpToolResult.errorResult(
      mcpToolResult.errorMessageFromUnknown(e),
    );
  }
  try {
    const data = await run(page);
    return mcpToolResult.jsonResult(data, true);
  } catch (e) {
    return mcpToolResult.errorResult(
      mcpToolResult.errorMessageFromUnknown(e),
    );
  }
}
