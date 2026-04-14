export const TOOL_PROGRESS_PREFIX = "🔧 ";

export const TOOL_PROGRESS_HTML: Record<string, string> = {
  "restart-browser":
    "Riavvio il <b>browser</b> del portale Argo e rifaccio il login…",
  "voti-giornalieri": "Sto recuperando i <b>voti</b> dal portale…",
  bacheca: "Sto consultando la <b>bacheca</b> (circolari)…",
  "compiti-assegnati": "Sto caricando i <b>compiti assegnati</b>…",
  "attivita-svolte": "Sto caricando le <b>attività svolte</b> in classe…",
  "orario-famiglia": "Sto caricando l'<b>orario</b> della classe…",
  "consiglio-classe":
    "Sto caricando l'elenco degli <b>eletti al consiglio di classe</b>…",
  "consiglio-istituto":
    "Sto caricando l'elenco degli <b>eletti al consiglio d'istituto</b>…",
  "docenti-classe": "Sto caricando l'elenco dei <b>docenti</b> della classe…",
  promemoria: "Sto caricando i <b>promemoria</b> della classe…",
  note: "Sto caricando le <b>note</b> (disciplinari / generiche)…",
  assenze: "Sto caricando le <b>assenze</b>, uscite e ritardi…",
  "curriculum-alunno": "Sto caricando il <b>curriculum</b> dell'alunno…",
  "dati-anagrafici": "Sto caricando i <b>dati anagrafici</b>…",
  "voti-scrutini": "Sto caricando i <b>voti di scrutinio</b>…",
  leggi_circolare_pdf:
    "Scarico i <b>PDF</b> delle circolari e li analizzo con il modello…",
  automation_create: "Salvo l'<b>automazione</b> nel database…",
  automation_list: "Leggo l'elenco delle <b>automazioni</b>…",
  automation_update: "Aggiorno l'<b>automazione</b>…",
  automation_delete: "Elimino l'<b>automazione</b>…",
  user_memory_read: "Leggo la <b>memoria</b> persistente (MEMORY.md)…",
  user_memory_update: "Aggiorno la <b>memoria</b> persistente (MEMORY.md)…",
};

export function withToolProgressPrefix(htmlBody: string): string {
  return `${TOOL_PROGRESS_PREFIX}${htmlBody}`;
}

export const toolProgressNotify: {
  current?: (toolName: string) => Promise<void>;
} = {};

export const toolProgressSentThisTurn: { current: Set<string> } = {
  current: new Set(),
};
