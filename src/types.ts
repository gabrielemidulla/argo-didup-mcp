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
