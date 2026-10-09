/** Aceita uma lista colada com vírgulas, ponto e vírgula ou quebras de linha. */
export function parseEmailRecipients(value: string) {
  const recipients: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const raw of value.split(/[,;\r\n]+/)) {
    const email = raw.trim();
    if (!email) continue;
    if (email.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) {
      invalid.push(email);
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    recipients.push(email);
  }
  return { recipients, invalid, duplicates };
}

export function emailErrorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}
