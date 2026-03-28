import type { ArgoCredentials } from "./types.ts";
import { getArgoCredentialsFromEnv, login, openPortalIndex } from "./browser.ts";
import { votiGiornalieri } from "./commands/voti-giornalieri.ts";
import { getBrowser, shutdownSession } from "./session.ts";

const COMMANDS = {
  "voti-giornalieri": {
    description: "Recupera i voti giornalieri",
    run: votiGiornalieri,
  },
} as const;

type CommandName = keyof typeof COMMANDS;

function getCredentials(): ArgoCredentials {
  const creds = getArgoCredentialsFromEnv();
  if (!creds) {
    console.error(
      "Variabili d'ambiente mancanti: CODICE_SCUOLA, USERNAME, PASSWORD",
    );
    process.exit(1);
  }
  return creds;
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

  try {
    const browser = await getBrowser();
    const page = await login(browser, credentials);
    await openPortalIndex(page);
    const result = await command.run(page);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await shutdownSession();
  }
}
