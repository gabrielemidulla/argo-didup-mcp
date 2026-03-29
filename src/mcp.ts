import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openPortalIndex } from "./browser.ts";
import { bootstrapArgoSession } from "./argo-bootstrap.ts";
import { votiGiornalieri } from "./commands/voti-giornalieri.ts";
import { bacheca } from "./commands/bacheca.ts";
import { attivitaSvolte } from "./commands/attivita-svolte.ts";
import { compitiAssegnati } from "./commands/compiti-assegnati.ts";
import { orarioFamiglia } from "./commands/orario-famiglia.ts";
import { consiglioClasse } from "./commands/consiglio-classe.ts";
import { consiglioIstituto } from "./commands/consiglio-istituto.ts";
import { docentiClasse } from "./commands/docenti-classe.ts";
import { promemoria } from "./commands/promemoria.ts";
import { note } from "./commands/note.ts";
import { assenze } from "./commands/assenze.ts";
import { curriculumAlunno } from "./commands/curriculum-alunno.ts";
import { datiAnagrafici } from "./commands/dati-anagrafici.ts";
import { votiScrutini } from "./commands/voti-scrutini.ts";
import { getLoggedInPage } from "./session.ts";

export function createMcpServer() {
  const server = new McpServer({
    name: "argo-didup",
    version: "1.0.0",
  });

  server.registerTool(
    "voti-giornalieri",
    {
      description:
        "Recupera i voti giornalieri da Argo (ScuolaNext). Il server è già loggato all'avvio; a ogni chiamata si ricarica index.jsf e poi si apre la sezione voti.",
    },
    async () => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      const grades = await votiGiornalieri(page);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(grades, null, 2) }],
      };
    },
  );

  server.registerTool(
    "bacheca",
    {
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
    },
    async ({ limit, mese, cerca }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const entries = await bacheca(page, { limit, mese, cerca });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "compiti-assegnati",
    {
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
    },
    async ({ materia, contenuto, data_da, data_a }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await compitiAssegnati(page, {
          materia,
          contenuto,
          data_da,
          data_a,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "attivita-svolte",
    {
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
    },
    async ({ materia, contenuto, data_da, data_a }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await attivitaSvolte(page, {
          materia,
          contenuto,
          data_da,
          data_a,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "orario-famiglia",
    {
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
    },
    async ({ materia, giorno, contenuto, data_da, data_a, fascia }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await orarioFamiglia(page, {
          materia,
          giorno,
          contenuto,
          data_da,
          data_a,
          fascia,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "consiglio-classe",
    {
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
    },
    async ({ nominativo, ruolo, sesso }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await consiglioClasse(page, { nominativo, ruolo, sesso });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "consiglio-istituto",
    {
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
    },
    async ({
      nominativo,
      sesso,
      tipo_componente,
      nota,
      componente_giunta,
    }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await consiglioIstituto(page, {
          nominativo,
          sesso,
          tipo_componente,
          nota,
          componente_giunta,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "docenti-classe",
    {
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
    },
    async ({ nominativo, materia }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await docentiClasse(page, { nominativo, materia });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "promemoria",
    {
      description:
        "Promemoria della classe (modale famiglia). Se data_da/data_a (DD/MM/YYYY, Europe/Rome) definiscono un intervallo che può includere date prima di oggi (es. solo data_a, oppure data_da < oggi, oppure entrambe con data_da < oggi), attiva il checkbox per caricare anche i promemoria passati, attende la rete, poi filtra lato server sugli stessi parametri. Se il filtro è solo futuro (es. solo data_da ≥ oggi) o non ci sono date, non usa il checkbox: elenco default del portale (in genere da oggi in poi). Campi: data, dataIso, appunto, inseritaDa.",
      inputSchema: {
        data_da: z
          .string()
          .optional()
          .describe(
            "Data minima promemoria (DD/MM/YYYY inclusiva), opzionale",
          ),
        data_a: z
          .string()
          .optional()
          .describe(
            "Data massima promemoria (DD/MM/YYYY inclusiva), opzionale",
          ),
      },
    },
    async ({ data_da, data_a }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await promemoria(page, { data_da, data_a });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "note",
    {
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
    },
    async ({ categoria, data_da, data_a }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await note(page, { categoria, data_da, data_a });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "assenze",
    {
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
    },
    async ({ tipo, data_da, data_a }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const result = await assenze(page, { tipo, data_da, data_a });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "curriculum-alunno",
    {
      description:
        "Curriculum dello studente (modale famiglia, menu servizi alunno): per ogni anno scolastico — anno, classe, credito, media, esito, iconaSmile (icona positiva in portale per anni conclusi). Nessun filtro.",
    },
    async () => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const rows = await curriculumAlunno(page);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rows, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "dati-anagrafici",
    {
      description:
        "Dati anagrafici dello studente (modale famiglia, menu servizi alunno): cognome, nome, data di nascita, sesso, codice fiscale, comune di nascita, cittadinanza, comune di residenza, CAP, via, telefono. Nessun parametro.",
    },
    async () => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const data = await datiAnagrafici(page);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "voti-scrutini",
    {
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
    },
    async ({ quadrimestre }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const result = await votiScrutini(page, { quadrimestre });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export async function startMcpServer() {
  try {
    await bootstrapArgoSession();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("argo-didup MCP server running on stdio");
}
