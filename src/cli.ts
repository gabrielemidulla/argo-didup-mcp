import type { Page } from "puppeteer";
import type { ArgoCredentials } from "./types.ts";
import { getArgoCredentialsFromEnv, login, openPortalIndex } from "./browser.ts";
import { bacheca, type BachecaOptions } from "./commands/bacheca.ts";
import {
  attivitaSvolte,
  type AttivitaSvolteOptions,
} from "./commands/attivita-svolte.ts";
import {
  compitiAssegnati,
  type CompitiAssegnatiOptions,
} from "./commands/compiti-assegnati.ts";
import {
  orarioFamiglia,
  type OrarioFamigliaOptions,
} from "./commands/orario-famiglia.ts";
import {
  consiglioClasse,
  type ConsiglioClasseOptions,
} from "./commands/consiglio-classe.ts";
import {
  consiglioIstituto,
  type ConsiglioIstitutoOptions,
} from "./commands/consiglio-istituto.ts";
import {
  docentiClasse,
  type DocentiClasseOptions,
} from "./commands/docenti-classe.ts";
import { promemoria, type PromemoriaOptions } from "./commands/promemoria.ts";
import { note, type NoteOptions } from "./commands/note.ts";
import { assenze, type AssenzeOptions } from "./commands/assenze.ts";
import { curriculumAlunno } from "./commands/curriculum-alunno.ts";
import { datiAnagrafici } from "./commands/dati-anagrafici.ts";
import {
  votiScrutini,
  type VotiScrutiniOptions,
} from "./commands/voti-scrutini.ts";
import { votiGiornalieri } from "./commands/voti-giornalieri.ts";
import { getBrowser, shutdownSession } from "./session.ts";

type CommandDef = {
  description: string;
  run: (page: Page, argv?: string[]) => Promise<unknown>;
};

function parseBachecaArgv(argv: string[]): BachecaOptions {
  const out: BachecaOptions = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--limit" && argv[i + 1]) {
      out.limit = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (a === "--mese" && argv[i + 1]) {
      out.mese = argv[++i]!;
      continue;
    }
    if (a === "--cerca" && argv[i + 1]) {
      out.cerca = argv[++i]!;
      continue;
    }
    if (!a.startsWith("-")) positional.push(a);
  }
  if (out.cerca === undefined && positional.length > 0) {
    out.cerca = positional.join(" ");
  }
  return out;
}

function parseCompitiArgv(argv: string[]): CompitiAssegnatiOptions {
  const out: CompitiAssegnatiOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--materia" && argv[i + 1]) {
      out.materia = argv[++i]!;
      continue;
    }
    if (a === "--contenuto" && argv[i + 1]) {
      out.contenuto = argv[++i]!;
      continue;
    }
    if (a === "--data-da" && argv[i + 1]) {
      out.data_da = argv[++i]!;
      continue;
    }
    if (a === "--data-a" && argv[i + 1]) {
      out.data_a = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseAttivitaArgv(argv: string[]): AttivitaSvolteOptions {
  const out: AttivitaSvolteOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--materia" && argv[i + 1]) {
      out.materia = argv[++i]!;
      continue;
    }
    if (a === "--contenuto" && argv[i + 1]) {
      out.contenuto = argv[++i]!;
      continue;
    }
    if (a === "--data-da" && argv[i + 1]) {
      out.data_da = argv[++i]!;
      continue;
    }
    if (a === "--data-a" && argv[i + 1]) {
      out.data_a = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseOrarioArgv(argv: string[]): OrarioFamigliaOptions {
  const out: OrarioFamigliaOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--materia" && argv[i + 1]) {
      out.materia = argv[++i]!;
      continue;
    }
    if (a === "--giorno" && argv[i + 1]) {
      out.giorno = argv[++i]!;
      continue;
    }
    if (a === "--contenuto" && argv[i + 1]) {
      out.contenuto = argv[++i]!;
      continue;
    }
    if (a === "--data-da" && argv[i + 1]) {
      out.data_da = argv[++i]!;
      continue;
    }
    if (a === "--data-a" && argv[i + 1]) {
      out.data_a = argv[++i]!;
      continue;
    }
    if (a === "--fascia" && argv[i + 1]) {
      out.fascia = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseConsiglioArgv(argv: string[]): ConsiglioClasseOptions {
  const out: ConsiglioClasseOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--nominativo" && argv[i + 1]) {
      out.nominativo = argv[++i]!;
      continue;
    }
    if (a === "--ruolo" && argv[i + 1]) {
      out.ruolo = argv[++i]!;
      continue;
    }
    if (a === "--sesso" && argv[i + 1]) {
      out.sesso = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseBoolArg(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "si" || s === "sì" || s === "yes")
    return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

function parseConsiglioIstitutoArgv(argv: string[]): ConsiglioIstitutoOptions {
  const out: ConsiglioIstitutoOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--nominativo" && argv[i + 1]) {
      out.nominativo = argv[++i]!;
      continue;
    }
    if (a === "--sesso" && argv[i + 1]) {
      out.sesso = argv[++i]!;
      continue;
    }
    if (a === "--tipo-componente" && argv[i + 1]) {
      out.tipo_componente = argv[++i]!;
      continue;
    }
    if (a === "--nota" && argv[i + 1]) {
      out.nota = argv[++i]!;
      continue;
    }
    if (a === "--componente-giunta" && argv[i + 1]) {
      const b = parseBoolArg(argv[++i]!);
      if (b !== undefined) out.componente_giunta = b;
      continue;
    }
  }
  return out;
}

function parseDocentiClasseArgv(argv: string[]): DocentiClasseOptions {
  const out: DocentiClasseOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--nominativo" && argv[i + 1]) {
      out.nominativo = argv[++i]!;
      continue;
    }
    if (a === "--materia" && argv[i + 1]) {
      out.materia = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parsePromemoriaArgv(argv: string[]): PromemoriaOptions {
  const out: PromemoriaOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--data-da" && argv[i + 1]) {
      out.data_da = argv[++i]!;
      continue;
    }
    if (a === "--data-a" && argv[i + 1]) {
      out.data_a = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseNoteArgv(argv: string[]): NoteOptions {
  const out: NoteOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--categoria" && argv[i + 1]) {
      out.categoria = argv[++i]!;
      continue;
    }
    if (a === "--data-da" && argv[i + 1]) {
      out.data_da = argv[++i]!;
      continue;
    }
    if (a === "--data-a" && argv[i + 1]) {
      out.data_a = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseAssenzeArgv(argv: string[]): AssenzeOptions {
  const out: AssenzeOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tipo" && argv[i + 1]) {
      out.tipo = argv[++i]!;
      continue;
    }
    if (a === "--data-da" && argv[i + 1]) {
      out.data_da = argv[++i]!;
      continue;
    }
    if (a === "--data-a" && argv[i + 1]) {
      out.data_a = argv[++i]!;
      continue;
    }
  }
  return out;
}

function parseVotiScrutiniArgv(argv: string[]): VotiScrutiniOptions {
  const out: Partial<VotiScrutiniOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--quadrimestre" || a === "-q") && argv[i + 1]) {
      const n = Number.parseInt(argv[++i]!, 10);
      if (n === 1 || n === 2) out.quadrimestre = n;
    }
  }
  if (out.quadrimestre !== 1 && out.quadrimestre !== 2) {
    throw new Error(
      "Obbligatorio: --quadrimestre 1 (primo quadrimestre) oppure 2 (scrutinio finale)",
    );
  }
  return out as VotiScrutiniOptions;
}

const COMMANDS: Record<string, CommandDef> = {
  "voti-giornalieri": {
    description: "Recupera i voti giornalieri",
    run: async (page) => votiGiornalieri(page),
  },
  bacheca: {
    description:
      "Circolari in bacheca; argomenti: [testo ricerca] oppure --cerca … [--limit N] [--mese MM/YYYY]",
    run: async (page, argv = []) => bacheca(page, parseBachecaArgv(argv)),
  },
  "compiti-assegnati": {
    description:
      "Compiti assegnati; opzioni: --materia … --contenuto … --data-da DD/MM/YYYY --data-a DD/MM/YYYY",
    run: async (page, argv = []) =>
      compitiAssegnati(page, parseCompitiArgv(argv)),
  },
  "attivita-svolte": {
    description:
      "Attività svolte (Argomenti); stesse opzioni compiti: --materia --contenuto --data-da --data-a",
    run: async (page, argv = []) =>
      attivitaSvolte(page, parseAttivitaArgv(argv)),
  },
  "orario-famiglia": {
    description:
      "Orario settimanale; opzioni: --materia --giorno --contenuto --data-da --data-a DD/MM/YYYY --fascia (es. 1^)",
    run: async (page, argv = []) =>
      orarioFamiglia(page, parseOrarioArgv(argv)),
  },
  "consiglio-classe": {
    description:
      "Eletti consiglio di classe; opzioni: --nominativo … --ruolo alunno|genitore --sesso M|F|maschio|femmina",
    run: async (page, argv = []) =>
      consiglioClasse(page, parseConsiglioArgv(argv)),
  },
  "consiglio-istituto": {
    description:
      "Eletti consiglio d'istituto; --nominativo --sesso --tipo-componente --nota --componente-giunta true|false",
    run: async (page, argv = []) =>
      consiglioIstituto(page, parseConsiglioIstitutoArgv(argv)),
  },
  "docenti-classe": {
    description:
      "Docenti della classe; opzioni: --nominativo … --materia … (AND su elenco materie)",
    run: async (page, argv = []) =>
      docentiClasse(page, parseDocentiClasseArgv(argv)),
  },
  promemoria: {
    description:
      "Promemoria; --data-da/--data-a opzionali: checkbox passati solo se il range può andare prima di oggi (Rome)",
    run: async (page, argv = []) =>
      promemoria(page, parsePromemoriaArgv(argv)),
  },
  note: {
    description:
      "Note disciplinari; --categoria … --data-da DD/MM/YYYY --data-a DD/MM/YYYY",
    run: async (page, argv = []) => note(page, parseNoteArgv(argv)),
  },
  assenze: {
    description:
      "Assenze: JSON con totali (portale) + righe; --tipo (AND) --data-da --data-a filtrano solo le righe",
    run: async (page, argv = []) =>
      assenze(page, parseAssenzeArgv(argv)),
  },
  "curriculum-alunno": {
    description: "Curriculum alunno: anni, classe, credito, media, esito",
    run: async (page) => curriculumAlunno(page),
  },
  "dati-anagrafici": {
    description:
      "Dati anagrafici alunno: cognome, nome, nascita, CF, residenza, ecc.",
    run: async (page) => datiAnagrafici(page),
  },
  "voti-scrutini": {
    description:
      "Voti scrutinio; obbligatorio --quadrimestre 1|2 (-q) — 1 primo Q., 2 scrutinio finale",
    run: async (page, argv = []) =>
      votiScrutini(page, parseVotiScrutiniArgv(argv)),
  },
};

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
  const commandName = args[0];

  if (!commandName || !(commandName in COMMANDS)) {
    printUsage();
  }

  const credentials = getCredentials();
  const command = COMMANDS[commandName]!;

  try {
    const browser = await getBrowser();
    const page = await login(browser, credentials);
    await openPortalIndex(page);
    const result = await command.run(page, args.slice(1));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await shutdownSession();
  }
}
