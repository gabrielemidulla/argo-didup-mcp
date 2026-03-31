import { Command, InvalidArgumentError } from "commander";
import { assenze, type AssenzeOptions } from "../commands/assenze.ts";
import {
  attivitaSvolte,
  type AttivitaSvolteOptions,
} from "../commands/attivita-svolte.ts";
import { bacheca, type BachecaOptions } from "../commands/bacheca.ts";
import {
  compitiAssegnati,
  type CompitiAssegnatiOptions,
} from "../commands/compiti-assegnati.ts";
import {
  consiglioClasse,
  type ConsiglioClasseOptions,
} from "../commands/consiglio-classe.ts";
import {
  consiglioIstituto,
  type ConsiglioIstitutoOptions,
} from "../commands/consiglio-istituto.ts";
import { curriculumAlunno } from "../commands/curriculum-alunno.ts";
import { datiAnagrafici } from "../commands/dati-anagrafici.ts";
import {
  docentiClasse,
  type DocentiClasseOptions,
} from "../commands/docenti-classe.ts";
import { note, type NoteOptions } from "../commands/note.ts";
import {
  orarioFamiglia,
  type OrarioFamigliaOptions,
} from "../commands/orario-famiglia.ts";
import { promemoria, type PromemoriaOptions } from "../commands/promemoria.ts";
import {
  votiScrutini,
  type VotiScrutiniOptions,
} from "../commands/voti-scrutini.ts";
import { votiGiornalieri } from "../commands/voti-giornalieri.ts";
import { parseBoolArg, parsePositiveIntOption } from "./parse.ts";
import { withArgoSession } from "./with-argo-session.ts";

export function buildProgram(): Command {
  const program = new Command();
  program.name("argo-mcp");
  program.description("CLI Argo Famiglia (cwd: packages/argo-mcp)");
  program.configureHelp({ sortSubcommands: true });
  program.showHelpAfterError(true);

  program
    .command("voti-giornalieri")
    .description("Recupera i voti giornalieri")
    .action(async () => {
      await withArgoSession((page) => votiGiornalieri(page));
    });

  program
    .command("bacheca")
    .description(
      "Circolari in bacheca; argomenti: [testo ricerca] oppure --cerca … [--limit N] [--mese MM/YYYY]",
    )
    .argument("[cerca...]", "testo ricerca (se omesso, usare --cerca)")
    .option(
      "--limit <n>",
      "limite risultati",
      (v) => parsePositiveIntOption(v, "--limit"),
    )
    .option("--mese <mese>", "MM/YYYY")
    .option("--cerca <text>", "testo ricerca")
    .action(async (cercaParts: string[], opts) => {
      const out: BachecaOptions = {
        limit: opts.limit,
        mese: opts.mese,
        cerca: opts.cerca,
      };
      if (out.cerca === undefined && cercaParts.length > 0) {
        out.cerca = cercaParts.join(" ");
      }
      await withArgoSession((page) => bacheca(page, out));
    });

  program
    .command("compiti-assegnati")
    .description(
      "Compiti assegnati; opzioni: --materia … --contenuto … --data-da DD/MM/YYYY --data-a DD/MM/YYYY",
    )
    .option("--materia <m>", "filtro materia")
    .option("--contenuto <c>", "filtro contenuto")
    .option("--data-da <d>", "da data DD/MM/YYYY")
    .option("--data-a <d>", "a data DD/MM/YYYY")
    .action(async (opts) => {
      const o: CompitiAssegnatiOptions = {
        materia: opts.materia,
        contenuto: opts.contenuto,
        data_da: opts.dataDa,
        data_a: opts.dataA,
      };
      await withArgoSession((page) => compitiAssegnati(page, o));
    });

  program
    .command("attivita-svolte")
    .description(
      "Attività svolte (Argomenti); stesse opzioni compiti: --materia --contenuto --data-da --data-a",
    )
    .option("--materia <m>", "filtro materia")
    .option("--contenuto <c>", "filtro contenuto")
    .option("--data-da <d>", "da data DD/MM/YYYY")
    .option("--data-a <d>", "a data DD/MM/YYYY")
    .action(async (opts) => {
      const o: AttivitaSvolteOptions = {
        materia: opts.materia,
        contenuto: opts.contenuto,
        data_da: opts.dataDa,
        data_a: opts.dataA,
      };
      await withArgoSession((page) => attivitaSvolte(page, o));
    });

  program
    .command("orario-famiglia")
    .description(
      "Orario settimanale; opzioni: --materia --giorno --contenuto --data-da --data-a DD/MM/YYYY --fascia (es. 1^)",
    )
    .option("--materia <m>", "filtro materia")
    .option("--giorno <g>", "giorno")
    .option("--contenuto <c>", "filtro contenuto")
    .option("--data-da <d>", "da data DD/MM/YYYY")
    .option("--data-a <d>", "a data DD/MM/YYYY")
    .option("--fascia <f>", "es. 1^")
    .action(async (opts) => {
      const o: OrarioFamigliaOptions = {
        materia: opts.materia,
        giorno: opts.giorno,
        contenuto: opts.contenuto,
        data_da: opts.dataDa,
        data_a: opts.dataA,
        fascia: opts.fascia,
      };
      await withArgoSession((page) => orarioFamiglia(page, o));
    });

  program
    .command("consiglio-classe")
    .description(
      "Eletti consiglio di classe; opzioni: --nominativo … --ruolo alunno|genitore --sesso M|F|maschio|femmina",
    )
    .option("--nominativo <n>", "filtro nominativo")
    .option("--ruolo <r>", "alunno | genitore")
    .option("--sesso <s>", "M | F | maschio | femmina")
    .action(async (opts) => {
      const o: ConsiglioClasseOptions = {
        nominativo: opts.nominativo,
        ruolo: opts.ruolo,
        sesso: opts.sesso,
      };
      await withArgoSession((page) => consiglioClasse(page, o));
    });

  program
    .command("consiglio-istituto")
    .description(
      "Eletti consiglio d'istituto; --nominativo --sesso --tipo-componente --nota --componente-giunta true|false",
    )
    .option("--nominativo <n>", "filtro nominativo")
    .option("--sesso <s>", "filtro sesso")
    .option("--tipo-componente <t>", "tipo componente")
    .option("--nota <t>", "nota")
    .option("--componente-giunta <bool>", "true|false|1|0|si|no", (v) => {
      const b = parseBoolArg(v);
      if (b === undefined) {
        throw new InvalidArgumentError(
          "Valore non valido per --componente-giunta (usa true/false, 1/0, si/no)",
        );
      }
      return b;
    })
    .action(async (opts) => {
      const o: ConsiglioIstitutoOptions = {
        nominativo: opts.nominativo,
        sesso: opts.sesso,
        tipo_componente: opts.tipoComponente,
        nota: opts.nota,
      };
      if (opts.componenteGiunta !== undefined) {
        o.componente_giunta = opts.componenteGiunta;
      }
      await withArgoSession((page) => consiglioIstituto(page, o));
    });

  program
    .command("docenti-classe")
    .description(
      "Docenti della classe; opzioni: --nominativo … --materia … (AND su elenco materie)",
    )
    .option("--nominativo <n>", "filtro nominativo")
    .option("--materia <m>", "filtro materia")
    .action(async (opts) => {
      const o: DocentiClasseOptions = {
        nominativo: opts.nominativo,
        materia: opts.materia,
      };
      await withArgoSession((page) => docentiClasse(page, o));
    });

  program
    .command("promemoria")
    .description(
      "Promemoria; --data-da/--data-a opzionali: checkbox passati solo se il range può andare prima di oggi (Rome)",
    )
    .option("--data-da <d>", "da data DD/MM/YYYY")
    .option("--data-a <d>", "a data DD/MM/YYYY")
    .action(async (opts) => {
      const o: PromemoriaOptions = {
        data_da: opts.dataDa,
        data_a: opts.dataA,
      };
      await withArgoSession((page) => promemoria(page, o));
    });

  program
    .command("note")
    .description(
      "Note disciplinari; --categoria … --data-da DD/MM/YYYY --data-a DD/MM/YYYY",
    )
    .option("--categoria <c>", "categoria")
    .option("--data-da <d>", "da data DD/MM/YYYY")
    .option("--data-a <d>", "a data DD/MM/YYYY")
    .action(async (opts) => {
      const o: NoteOptions = {
        categoria: opts.categoria,
        data_da: opts.dataDa,
        data_a: opts.dataA,
      };
      await withArgoSession((page) => note(page, o));
    });

  program
    .command("assenze")
    .description(
      "Assenze: JSON con totali (portale) + righe; --tipo (AND) --data-da --data-a filtrano solo le righe",
    )
    .option("--tipo <t>", "tipo (AND)")
    .option("--data-da <d>", "da data DD/MM/YYYY")
    .option("--data-a <d>", "a data DD/MM/YYYY")
    .action(async (opts) => {
      const o: AssenzeOptions = {
        tipo: opts.tipo,
        data_da: opts.dataDa,
        data_a: opts.dataA,
      };
      await withArgoSession((page) => assenze(page, o));
    });

  program
    .command("curriculum-alunno")
    .description("Curriculum alunno: anni, classe, credito, media, esito")
    .action(async () => {
      await withArgoSession((page) => curriculumAlunno(page));
    });

  program
    .command("dati-anagrafici")
    .description(
      "Dati anagrafici alunno: cognome, nome, nascita, CF, residenza, ecc.",
    )
    .action(async () => {
      await withArgoSession((page) => datiAnagrafici(page));
    });

  program
    .command("voti-scrutini")
    .description(
      "Voti scrutinio; obbligatorio --quadrimestre 1|2 (-q) — 1 primo Q., 2 scrutinio finale",
    )
    .requiredOption(
      "-q, --quadrimestre <n>",
      "1 (primo quadrimestre) o 2 (scrutinio finale)",
      (v) => {
        const n = Number.parseInt(v, 10);
        if (n !== 1 && n !== 2) {
          throw new InvalidArgumentError(
            "Usa 1 per il primo quadrimestre o 2 per lo scrutinio finale",
          );
        }
        return n;
      },
    )
    .action(async (opts) => {
      const o: VotiScrutiniOptions = { quadrimestre: opts.quadrimestre };
      await withArgoSession((page) => votiScrutini(page, o));
    });

  return program;
}
