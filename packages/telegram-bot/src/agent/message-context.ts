export const USER_MESSAGE_TIMEZONE = "Europe/Rome";

export function wrapUserMessageWithDateTime(text: string, when: Date): string {
  const weekdayEn = new Intl.DateTimeFormat("en-US", {
    timeZone: USER_MESSAGE_TIMEZONE,
    weekday: "long",
  }).format(when);
  const dateTimeIt = new Intl.DateTimeFormat("it-IT", {
    timeZone: USER_MESSAGE_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(when);
  return `[Messaggio dell'utente ricevuto ${weekdayEn}, ${dateTimeIt} (${USER_MESSAGE_TIMEZONE})]\n\n${text}`;
}

export function wrapAutomationPromptForAgent(
  storedPrompt: string,
  when: Date,
): string {
  const weekdayEn = new Intl.DateTimeFormat("en-US", {
    timeZone: USER_MESSAGE_TIMEZONE,
    weekday: "long",
  }).format(when);
  const dateTimeIt = new Intl.DateTimeFormat("it-IT", {
    timeZone: USER_MESSAGE_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(when);
  return (
    `[⚙️ Esecuzione AUTOMATIZZATA da promemoria pianificato. ` +
    `Non è un messaggio scritto dall'utente in questo momento: è un'attività pianificata dal calendario del bot.\n` +
    `Momento esecuzione: ${weekdayEn}, ${dateTimeIt} (${USER_MESSAGE_TIMEZONE}). ` +
    `Rispondi nella stessa chat Telegram dell'utente, con lo stesso stile delle risposte manuali (HTML, emoji, strumenti Argo se servono).\n\n` +
    `Istruzione salvata nell'automazione:\n${storedPrompt}]`
  );
}
