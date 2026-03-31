import type { Page } from "puppeteer";
import type { GradeType, SubjectGrades } from "../types.ts";

const SEL = {
  menuVotiGiornalieri: '[id="menu-servizialunno:voti-giornalieri-famiglia"]',
  sheetDidargo: '[id="sheet-sezioneDidargo:sheet"]',
} as const;

export async function votiGiornalieri(page: Page): Promise<SubjectGrades[]> {
  await page.waitForSelector(SEL.menuVotiGiornalieri, {
    visible: true,
    timeout: 60_000,
  });
  await page.click(SEL.menuVotiGiornalieri);

  await page.waitForSelector(SEL.sheetDidargo, {
    visible: true,
    timeout: 120_000,
  });
  await new Promise((r) => setTimeout(r, 1000));

  const grades = await page.evaluate(() => {
    function parseGrade(raw: string): { type: GradeType | null; grade: string } {
      const lower = raw.toLowerCase();
      let type: GradeType | null = null;
      if (lower.includes("scritto")) type = "scritto";
      else if (lower.includes("orale")) type = "orale";
      else if (lower.includes("pratico")) type = "pratico";

      const numMatch = raw.match(/\((\d+(?:[.,]\d+)?)\)/);
      const grade = numMatch?.[1] ? numMatch[1].replace(",", ".") : raw;
      return { type, grade };
    }

    const out: SubjectGrades[] = [];

    document.querySelectorAll(".fieldset-anagrafe").forEach((fs) => {
      const legend = fs.querySelector("legend") as HTMLLegendElement | null;
      const subject = legend?.innerText?.trim() ?? "";
      const rows: SubjectGrades["rows"] = [];

      fs.querySelectorAll("table tr").forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length >= 4) {
          const rawGrade = (tds[2] as HTMLTableCellElement).innerText.trim();
          const { type, grade } = parseGrade(rawGrade);
          rows.push({
            date: (tds[1] as HTMLTableCellElement).innerText.trim(),
            type,
            grade,
            note: (tds[3] as HTMLTableCellElement).innerText.trim(),
          });
        }
      });

      if (subject || rows.length > 0) {
        out.push({ subject, rows });
      }
    });

    return out;
  });

  return grades;
}
