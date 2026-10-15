// Who may see the finance section. Edge-safe (used by the middleware too).
// Not role-based on purpose: only the two owners, not other admins. Override with FINANCE_OWNER_EMAILS.
export const FINANCE_OWNER_EMAILS_DEFAULT = ["marc@mimafood.nl", "michiel@mimafood.nl"];

export function financeOwnerEmails(): string[] {
  const raw = process.env.FINANCE_OWNER_EMAILS;
  const list = raw ? raw.split(",") : FINANCE_OWNER_EMAILS_DEFAULT;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isFinanceOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return financeOwnerEmails().includes(email.trim().toLowerCase());
}
