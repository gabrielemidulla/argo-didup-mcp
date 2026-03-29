export type GradeType = "scritto" | "orale" | "pratico";

export type GradeRow = {
  date: string;
  type: GradeType | null;
  grade: string;
  note: string;
};

export type SubjectGrades = {
  subject: string;
  rows: GradeRow[];
};

export type ArgoCredentials = {
  codiceScuola: string;
  username: string;
  password: string;
};

export type BachecaFile = {
  name: string;
  url: string;
};

export type BachecaEntry = {
  date: string;
  subject: string;
  message: string;
  files: BachecaFile[];
};

/** Voce nella modale compiti (fieldset con data in legend). */
export type CompitoAssegnato = {
  /** Data nel legend del fieldset (DD/MM/YYYY). */
  data: string;
  materia: string;
  testo: string;
  /** Data da “(Assegnati il DD/MM/YYYY)” nel testo, se presente. */
  assegnatoIl: string | null;
};

/** Riga attività in modale Argomenti (legend = materia; prima colonna = data lezione). */
export type AttivitaSvolta = {
  materia: string;
  /** Data nella prima cella (DD/MM/YYYY) o stringa vuota se assente. */
  data: string;
  descrizione: string;
};

/** Eletto al consiglio di classe (modale famiglia). */
export type ConsiglioClasseEletto = {
  nominativo: string;
  sesso: string;
  /** Es. "Alunno", "Genitore". */
  ruolo: string;
};

/** Promemoria classe (modale famiglia). */
export type Promemoria = {
  /** Data promemoria DD/MM/YYYY (come in griglia). */
  data: string;
  /** Data ISO da valore nascosto se presente (YYYY-MM-DD). */
  dataIso: string | null;
  appunto: string;
  inseritaDa: string;
};

/** Riga registro assenze / uscite / ritardi (modale famiglia, servizi alunno). */
export type AssenzaGiornalieraRow = {
  /** Data di riferimento (da colonna con evento o da valore nascosto). */
  data: string;
  dataIso: string | null;
  /** Data visibile nella colonna Assenze. */
  assenza: boolean;
  uscita: boolean;
  ritardo: boolean;
};

/** Totali di riepilogo in fondo alla modale assenze (tabella sotto la griglia). */
export type AssenzeTotali = {
  totaleAssenze: number | null;
  totaleUscite: number | null;
  totaleRitardi: number | null;
};

export type AssenzeResult = {
  totali: AssenzeTotali;
  righe: AssenzaGiornalieraRow[];
};

/** Riga voti scrutinio — primo quadrimestre (tab con Scritto, Orale, …). */
export type VotoScrutinioQuadrimestre1 = {
  materia: string;
  scritto: string;
  orale: string;
  altro: string;
  pratico: string;
  assenze: string;
};

/** Riga voti scrutinio — scrutinio finale (tab con Voto unico). */
export type VotoScrutinioQuadrimestre2 = {
  materia: string;
  voto: string;
  assenze: string;
};

export type VotiScrutiniResult =
  | {
      quadrimestre: 1;
      tabEtichetta: string;
      righe: VotoScrutinioQuadrimestre1[];
    }
  | {
      quadrimestre: 2;
      tabEtichetta: string;
      righe: VotoScrutinioQuadrimestre2[];
      /** Es. “Voti non ancora visibili alla famiglia” se mostrato in modale. */
      avvisoFamiglia: string | null;
    };

/** Dati anagrafici alunno (modale famiglia, servizi alunno). */
export type DatiAnagraficiAlunno = {
  cognome: string;
  nome: string;
  /** DD/MM/YYYY come in portale. */
  dataNascita: string;
  /** Es. Maschio, Femmina (da radio selezionato). */
  sesso: string;
  codiceFiscale: string;
  comuneNascita: string;
  cittadinanza: string;
  comuneResidenza: string;
  cap: string;
  via: string;
  telefono: string;
};

/** Riga curriculum alunno (modale famiglia, servizi alunno). */
export type CurriculumAlunnoRow = {
  /** Anno scolastico es. 2021/2022 */
  anno: string;
  classe: string;
  credito: number | null;
  media: number | null;
  esito: string;
  /** True se in prima colonna compare l’icona smile (come in portale per anni conclusi). */
  iconaSmile: boolean;
};

/** Nota disciplinare / generica (modale famiglia, servizi alunno). */
export type NotaDisciplinare = {
  data: string;
  dataIso: string | null;
  /** Testo colonna "Nota". */
  nota: string;
  inseritaDa: string;
  /** Es. Generica, Disciplinare. */
  categoria: string;
  /** Orario mostrato (es. 13:35). */
  orario: string;
  /** Da valore nascosto se presente (HH:MM:SS). */
  orarioIso: string | null;
};

/** Docente della classe (modale famiglia). */
export type DocenteClasse = {
  nominativo: string;
  /** True se in portale il nome termina con (*) — tipico coordinatore di classe. */
  coordinatoreClasse: boolean;
  /** Materie dalla colonna (split su virgola). */
  materie: string[];
};

/** Eletto al consiglio d'istituto (modale famiglia). */
export type ConsiglioIstitutoEletto = {
  nominativo: string;
  sesso: string;
  /** Colonna "Tipo Comp." (es. Alunno). */
  tipoComponente: string;
  /** Componente di giunta (checkbox in portale). */
  componenteGiunta: boolean;
  nota: string;
};

/** Cella orario (griglia settimanale famiglia). */
export type OrarioSlot = {
  /** Fascia oraria (es. "1^", "2^"). */
  fascia: string;
  /** Nome giorno intestazione colonna (es. "Lunedì"). */
  giorno: string;
  /** Data intestazione colonna (DD/MM/YYYY). */
  data: string;
  /** Materia/e in grassetto nella cella (più materie unite con " / "). */
  materia: string;
  /** Docenti dalle righe piccole tra parentesi. */
  docenti: string[];
};
