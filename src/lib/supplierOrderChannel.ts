/** Defaults for supplier_order_channels (synced from Admin + migration 113). */

export type SupplierOrderChannelRow = {
  supplier_id: string;
  channel: "email" | "whatsapp";
  email_to?: string | null;
  email_cc?: string | null;
  email_subject_template?: string | null;
  whatsapp_phone?: string | null;
  whatsapp_use_api?: boolean;
  auto_send?: boolean;
};

function norm(name: string): string {
  return name.toLowerCase().trim();
}

export function buildSupplierOrderChannelUpsert(
  supplierId: string,
  name: string,
  contactEmail: string | null | undefined,
  contactInfo: string | null | undefined
): SupplierOrderChannelRow | null {
  const n = norm(name);
  const email = contactEmail?.trim() || null;
  const info = contactInfo?.trim() || null;

  if (n === "gédé" || n === "gedé") {
    return {
      supplier_id: supplierId,
      channel: "email",
      email_to: email || "info@gede.nl",
      email_cc: "Tos@gede.nl",
      email_subject_template: "Bestelling MIMA {datum} — levering {leverdatum}",
      auto_send: false,
    };
  }
  if (n === "tuana") {
    return {
      supplier_id: supplierId,
      channel: "email",
      email_to: email || "Info@tuana-kruiden.nl",
      email_subject_template: "Bestelling MIMA kruiden — {datum} (levering {leverdatum})",
      auto_send: false,
    };
  }
  if (n === "today food group") {
    return {
      supplier_id: supplierId,
      channel: "email",
      email_to: email,
      email_subject_template: "Bestelling MIMA — {datum} (levering {leverdatum})",
      auto_send: false,
    };
  }
  if (n === "java bakery") {
    return {
      supplier_id: supplierId,
      channel: "whatsapp",
      whatsapp_phone: info || email || "+31620517867",
      whatsapp_use_api: false,
      auto_send: false,
    };
  }
  return null;
}

export function isOnDemandSupplierName(name: string): boolean {
  const n = norm(name);
  return n === "tuana" || n === "today food group";
}
