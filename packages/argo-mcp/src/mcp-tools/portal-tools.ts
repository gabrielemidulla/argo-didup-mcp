import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runWithPortalPage } from "../argo-page-tool.ts";
import { assenze } from "../commands/assenze.ts";
import { attivitaSvolte } from "../commands/attivita-svolte.ts";
import { bacheca } from "../commands/bacheca.ts";
import { compitiAssegnati } from "../commands/compiti-assegnati.ts";
import { consiglioClasse } from "../commands/consiglio-classe.ts";
import { consiglioIstituto } from "../commands/consiglio-istituto.ts";
import { curriculumAlunno } from "../commands/curriculum-alunno.ts";
import { datiAnagrafici } from "../commands/dati-anagrafici.ts";
import { docentiClasse } from "../commands/docenti-classe.ts";
import { note } from "../commands/note.ts";
import { orarioFamiglia } from "../commands/orario-famiglia.ts";
import { promemoria } from "../commands/promemoria.ts";
import { votiGiornalieri } from "../commands/voti-giornalieri.ts";
import { votiScrutini } from "../commands/voti-scrutini.ts";

type PortalToolNoSchema = {
  name: string;
  description: string;
  handler: () => ReturnType<typeof runWithPortalPage>;
};

type PortalToolWithSchema = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => ReturnType<typeof runWithPortalPage>;
};

const portalTools: (PortalToolNoSchema | PortalToolWithSchema)[] = [
  {
    name: "voti-giornalieri",
    description:
      "Recupera i voti giornalieri da Argo (ScuolaNext). Il server è già loggato all'avvio; a ogni chiamata si ricarica index.jsf e poi si apre la sezione voti.",
    handler: () => runWithPortalPage((page) => votiGiornalieri(page)),
  },
  {
    name: "bacheca",
    description:
      "Recupera le circolari dalla bacheca di Argo (ScuolaNext). Ritorna oggetto, messaggio, data e link firmati ai file PDF allegati. Senza 'cerca': prime N circolari (limit default 5). Con 'cerca': ricerca testuale su tutto il testo visibile di ogni circolare (parole separate da spazio = tutte devono comparire; case-insensitive); limit default 10 limita solo quante circolari restituire con URL PDF. 'mese' (MM/YYYY) filtra per data.",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .describe(
          "Numero massimo di circolari da restituire (default 5 senza cerca, 10 con cerca)",
        ),
      mese: z
        .string()
        .optional()
        .describe(
          "Filtra per mese, formato MM/YYYY (es. '02/2026' per febbraio 2026)",
        ),
      cerca: z
        .string()
        .optional()
        .describe(
          "Testo da cercare (es. 'natale', 'sciopero 12'); più parole = tutte devono essere presenti",
        ),
    },
    handler: ({ limit, mese, cerca }) =>
      runWithPortalPage((page) =>
        bacheca(page, {
          limit: limit as number | undefined,
          mese: mese as string | undefined,
          cerca: cerca as string | undefined,
        }),
      ),
  },
  {
    name: "compiti-assegnati",
    description:
      "Elenca i compiti assegnati da Argo (modale Compiti famiglia). Per ogni voce: data (legend del fieldset), materia, testo e opzionalmente data di assegnazione ricavata dal testo. Filtri opzionali: materia e contenuto (parole separate da spazio = tutte devono comparire, case-insensitive), intervallo su data legend (data_da / data_a in DD/MM/YYYY inclusivi). Nessun limite al numero di risultati.",
    inputSchema: {
      materia: z
        .string()
        .optional()
        .describe(
          "Filtro su nome materia (es. 'storia', 'matematica algebra')",
        ),
      contenuto: z
        .string()
        .optional()
        .describe("Filtro sul testo del compito (es. 'guerra', 'pagina 42')"),
      data_da: z
        .string()
        .optional()
        .describe(
          "Data minima (legend), formato DD/MM/YYYY inclusiva (es. '01/04/2026')",
        ),
      data_a: z
        .string()
        .optional()
        .describe(
          "Data massima (legend), formato DD/MM/YYYY inclusiva (es. '30/04/2026')",
        ),
    },
    handler: ({ materia, contenuto, data_da, data_a }) =>
      runWithPortalPage((page) =>
        compitiAssegnati(page, {
          materia: materia as string | undefined,
          contenuto: contenuto as string | undefined,
          data_da: data_da as string | undefined,
          data_a: data_a as string | undefined,
        }),
      ),
  },
  {
    name: "attivita-svolte",
    description:
      "Elenco attività svolte in classe (modale Argomenti famiglia): per ogni riga, materia (legend del fieldset), data lezione se presente (prima colonna DD/MM/YYYY), descrizione. Filtri: materia e contenuto (parole separate da spazio = AND, case-insensitive), intervallo data_da/data_a (DD/MM/YYYY inclusivi) sulla data di riga — utile per domande tipo «cosa abbiamo fatto mercoledì scorso» (l’LLM calcola le date dal messaggio utente). Righe senza data nella prima colonna sono escluse se usi filtro data. Nessun limite risultati.",
    inputSchema: {
      materia: z
        .string()
        .optional()
        .describe("Filtro sul nome materia / legend (es. 'educazione civica')"),
      contenuto: z
        .string()
        .optional()
        .describe(
          "Filtro sulla descrizione attività (es. 'cybersecurity', 'film')",
        ),
      data_da: z
        .string()
        .optional()
        .describe(
          "Data minima riga (DD/MM/YYYY), inclusiva; richiede data nella prima colonna",
        ),
      data_a: z
        .string()
        .optional()
        .describe(
          "Data massima riga (DD/MM/YYYY), inclusiva; richiede data nella prima colonna",
        ),
    },
    handler: ({ materia, contenuto, data_da, data_a }) =>
      runWithPortalPage((page) =>
        attivitaSvolte(page, {
          materia: materia as string | undefined,
          contenuto: contenuto as string | undefined,
          data_da: data_da as string | undefined,
          data_a: data_a as string | undefined,
        }),
      ),
  },
  {
    name: "orario-famiglia",
    description:
      "Orario settimanale della classe (modale Orario famiglia): griglia ore × giorni con materia e docenti per cella. Ogni slot ha fascia (es. 1^), giorno (Lunedì…), data colonna (DD/MM/YYYY), materia (più materie nella stessa ora unite con ' / '), docenti. Per domande tipo «domani», «cosa ho lunedì» usare il filtro **giorno** (nome giorno in italiano), non data_da/data_a: le date nei filtri confrontano solo le DD/MM/YYYY mostrate nelle intestazioni colonna della settimana corrente nel portale. data_da/data_a solo per intervalli espliciti su quelle date. Altri filtri: materia, contenuto (AND), fascia.",
    inputSchema: {
      materia: z
        .string()
        .optional()
        .describe("Parole (AND) sul nome materia (case-insensitive)"),
      giorno: z
        .string()
        .optional()
        .describe(
          "Preferito per «domani»/giorni relativi: nome giorno IT, es. 'lunedì', 'mercoledì' (AND su token; case-insensitive)",
        ),
      contenuto: z
        .string()
        .optional()
        .describe(
          "Parole (AND) su materia e docenti insieme (case-insensitive)",
        ),
      data_da: z
        .string()
        .optional()
        .describe(
          "Solo date in intestazione colonna nel portale (DD/MM/YYYY inclusiva); non sostituisce 'giorno' per domani/lunedì ecc.",
        ),
      data_a: z
        .string()
        .optional()
        .describe(
          "Come data_da: massima data colonna visibile; evitare per domande relative al giorno della settimana",
        ),
      fascia: z
        .string()
        .optional()
        .describe("Sottostringa sulla fascia oraria, es. '1^' o '3'"),
    },
    handler: ({ materia, giorno, contenuto, data_da, data_a, fascia }) =>
      runWithPortalPage((page) =>
        orarioFamiglia(page, {
          materia: materia as string | undefined,
          giorno: giorno as string | undefined,
          contenuto: contenuto as string | undefined,
          data_da: data_da as string | undefined,
          data_a: data_a as string | undefined,
          fascia: fascia as string | undefined,
        }),
      ),
  },
  {
    name: "consiglio-classe",
    description:
      "Eletti al consiglio di classe (modale famiglia): elenco con nominativo, sesso (M/F), ruolo (Alunno o Genitore). Filtri opzionali: nominativo e ruolo con parole separate da spazio (AND, case-insensitive); sesso con M/F o maschio/femmina.",
    inputSchema: {
      nominativo: z
        .string()
        .optional()
        .describe(
          "Parole (AND) sul nominativo, es. cognome o nome (case-insensitive)",
        ),
      ruolo: z
        .string()
        .optional()
        .describe(
          "Parole (AND) sul ruolo, es. 'alunno', 'genitore' (case-insensitive)",
        ),
      sesso: z
        .string()
        .optional()
        .describe("Filtro: M, F, maschio o femmina (case-insensitive)"),
    },
    handler: ({ nominativo, ruolo, sesso }) =>
      runWithPortalPage((page) =>
        consiglioClasse(page, {
          nominativo: nominativo as string | undefined,
          ruolo: ruolo as string | undefined,
          sesso: sesso as string | undefined,
        }),
      ),
  },
  {
    name: "consiglio-istituto",
    description:
      "Eletti al consiglio d'istituto (modale famiglia): nominativo, sesso M/F, tipo componente (colonna Tipo Comp., es. Alunno), componenteGiunta (checkbox Comp. Giunta), nota. Filtri: nominativo, sesso, tipo_componente e nota (parole AND case-insensitive); componente_giunta true/false per filtrare in giunta.",
    inputSchema: {
      nominativo: z
        .string()
        .optional()
        .describe("Parole (AND) sul nominativo (case-insensitive)"),
      sesso: z
        .string()
        .optional()
        .describe("M, F, maschio o femmina (case-insensitive)"),
      tipo_componente: z
        .string()
        .optional()
        .describe(
          "Parole (AND) sul tipo componente, es. 'alunno' (case-insensitive)",
        ),
      nota: z
        .string()
        .optional()
        .describe("Parole (AND) sul campo nota (case-insensitive)"),
      componente_giunta: z
        .boolean()
        .optional()
        .describe(
          "Se true: solo componenti di giunta; se false: solo non in giunta; omesso: tutti",
        ),
    },
    handler: ({
      nominativo,
      sesso,
      tipo_componente,
      nota,
      componente_giunta,
    }) =>
      runWithPortalPage((page) =>
        consiglioIstituto(page, {
          nominativo: nominativo as string | undefined,
          sesso: sesso as string | undefined,
          tipo_componente: tipo_componente as string | undefined,
          nota: nota as string | undefined,
          componente_giunta: componente_giunta as boolean | undefined,
        }),
      ),
  },
  {
    name: "docenti-classe",
    description:
      "Docenti della classe (modale famiglia): per ogni docente nominativo, coordinatoreClasse (true se in portale compare (*) accanto al nome), elenco materie. Filtri opzionali: nominativo e materia (parole separate da spazio = AND, case-insensitive; materia cerca nell'elenco materie).",
    inputSchema: {
      nominativo: z
        .string()
        .optional()
        .describe("Parole (AND) sul nominativo (case-insensitive)"),
      materia: z
        .string()
        .optional()
        .describe(
          "Parole (AND) sulle materie del docente, es. 'matematica informatica' (case-insensitive)",
        ),
    },
    handler: ({ nominativo, materia }) =>
      runWithPortalPage((page) =>
        docentiClasse(page, {
          nominativo: nominativo as string | undefined,
          materia: materia as string | undefined,
        }),
      ),
  },
  {
    name: "promemoria",
    description:
      "Promemoria della classe (modale famiglia). Se data_da/data_a (DD/MM/YYYY, Europe/Rome) definiscono un intervallo che può includere date prima di oggi (es. solo data_a, oppure data_da < oggi, oppure entrambe con data_da < oggi), attiva il checkbox per caricare anche i promemoria passati, attende la rete, poi filtra lato server sugli stessi parametri. Se il filtro è solo futuro (es. solo data_da ≥ oggi) o non ci sono date, non usa il checkbox: elenco default del portale (in genere da oggi in poi). Campi: data, dataIso, appunto, inseritaDa.",
    inputSchema: {
      data_da: z
        .string()
        .optional()
        .describe("Data minima promemoria (DD/MM/YYYY inclusiva), opzionale"),
      data_a: z
        .string()
        .optional()
        .describe("Data massima promemoria (DD/MM/YYYY inclusiva), opzionale"),
    },
    handler: ({ data_da, data_a }) =>
      runWithPortalPage((page) =>
        promemoria(page, {
          data_da: data_da as string | undefined,
          data_a: data_a as string | undefined,
        }),
      ),
  },
  {
    name: "note",
    description:
      "Note disciplinari / generiche dello studente (modale famiglia, menu servizi alunno): data, testo nota, inserita da, categoria (es. Generica, Disciplinare), orario. Filtri opzionali: categoria (parole AND case-insensitive), data_da e data_a (DD/MM/YYYY inclusivi sulla data).",
    inputSchema: {
      categoria: z
        .string()
        .optional()
        .describe(
          "Parole (AND) sulla categoria, es. 'generica' o 'disciplinare' (case-insensitive)",
        ),
      data_da: z
        .string()
        .optional()
        .describe("Data minima nota (DD/MM/YYYY inclusiva)"),
      data_a: z
        .string()
        .optional()
        .describe("Data massima nota (DD/MM/YYYY inclusiva)"),
    },
    handler: ({ categoria, data_da, data_a }) =>
      runWithPortalPage((page) =>
        note(page, {
          categoria: categoria as string | undefined,
          data_da: data_da as string | undefined,
          data_a: data_a as string | undefined,
        }),
      ),
  },
  {
    name: "assenze",
    description:
      "Registro assenze giornaliere dello studente (modale famiglia, menu servizi alunno). Risposta: oggetto con `totali` (totaleAssenze, totaleUscite, totaleRitardi dalla tabella riepilogo in modale) e `righe` (per ogni giorno con evento: data, flag assenza/uscita/ritardo). Filtri su `righe`: tipo (parole AND su 'assenza', 'uscita', 'ritardo'), data_da e data_a (DD/MM/YYYY inclusivi). I totali restano quelli del portale (non ricalcolati dai filtri).",
    inputSchema: {
      tipo: z
        .string()
        .optional()
        .describe(
          "Parole (AND), es. 'assenza' oppure 'uscita ritardo' (case-insensitive)",
        ),
      data_da: z
        .string()
        .optional()
        .describe("Data minima (DD/MM/YYYY inclusiva)"),
      data_a: z
        .string()
        .optional()
        .describe("Data massima (DD/MM/YYYY inclusiva)"),
    },
    handler: ({ tipo, data_da, data_a }) =>
      runWithPortalPage((page) =>
        assenze(page, {
          tipo: tipo as string | undefined,
          data_da: data_da as string | undefined,
          data_a: data_a as string | undefined,
        }),
      ),
  },
  {
    name: "curriculum-alunno",
    description:
      "Curriculum dello studente (modale famiglia, menu servizi alunno): per ogni anno scolastico — anno, classe, credito, media, esito, iconaSmile (icona positiva in portale per anni conclusi). Nessun filtro.",
    handler: () => runWithPortalPage((page) => curriculumAlunno(page)),
  },
  {
    name: "dati-anagrafici",
    description:
      "Dati anagrafici dello studente (modale famiglia, menu servizi alunno): cognome, nome, data di nascita, sesso, codice fiscale, comune di nascita, cittadinanza, comune di residenza, CAP, via, telefono. Nessun parametro.",
    handler: () => runWithPortalPage((page) => datiAnagrafici(page)),
  },
  {
    name: "voti-scrutini",
    description:
      "Voti di scrutinio (modale famiglia, menu servizi alunno): `quadrimestre` 1 = primo quadrimestre (colonne Scritto, Orale, Altro, Pratico, Assenze per materia); 2 = scrutinio finale (colonne Voto, Assenze). Per il 2 può esserci `avvisoFamiglia` se i voti non sono ancora visibili.",
    inputSchema: {
      quadrimestre: z
        .number()
        .int()
        .refine((n): n is 1 | 2 => n === 1 || n === 2, {
          message: "Deve essere 1 (primo quadrimestre) o 2 (scrutinio finale)",
        })
        .describe("1 = primo quadrimestre, 2 = scrutinio finale"),
    },
    handler: ({ quadrimestre }) =>
      runWithPortalPage((page) =>
        votiScrutini(page, { quadrimestre: quadrimestre as 1 | 2 }),
      ),
  },
];

export function registerArgoPortalTools(server: McpServer): void {
  for (const spec of portalTools) {
    if ("inputSchema" in spec) {
      server.registerTool(
        spec.name,
        { description: spec.description, inputSchema: spec.inputSchema },
        (args: Record<string, unknown>) => spec.handler(args),
      );
    } else {
      server.registerTool(spec.name, { description: spec.description }, () =>
        spec.handler(),
      );
    }
  }
}
