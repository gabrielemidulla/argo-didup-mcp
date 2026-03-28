import type { ArgoCredentials } from "./types.ts";
import { createBrowser, login } from "./browser.ts";
import { votiGiornalieri } from "./commands/voti-giornalieri.ts";

const COMMANDS = {
  "voti-giornalieri": {
    description: "Recupera i voti giornalieri",
    run: votiGiornalieri,
  },
} as const;

type CommandName = keyof typeof COMMANDS;

function getCredentials(): ArgoCredentials {
  const codiceScuola = Bun.env["CODICE_SCUOLA"];
  const username = Bun.env["USERNAME"];
  const password = Bun.env["PASSWORD"];

  if (!codiceScuola || !username || !password) {
    console.error(
      "Variabili d'ambiente mancanti: CODICE_SCUOLA, USERNAME, PASSWORD",
    );
    process.exit(1);
  }

  return { codiceScuola, username, password };
}

function printUsage(): never {
  console.error("Uso: bun index.ts <comando>\n");
  console.error("Comandi disponibili:");
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.error(`  ${name.padEnd(24)} ${cmd.description}`);
  }
  process.exit(1);
}

export async function run(args: string[]) {
  const commandName = args[0] as CommandName | undefined;

  if (!commandName || !(commandName in COMMANDS)) {
    printUsage();
  }

  const credentials = getCredentials();
  const command = COMMANDS[commandName];

  const browser = await createBrowser();
  try {
    const page = await login(browser, credentials);
    const result = await command.run(page);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}
