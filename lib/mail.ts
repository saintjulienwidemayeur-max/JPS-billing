// E-mail through the customer website's function `admin-mail` (Brevo), with a staff account of the website (owner or agent).
// Needs SUPABASE_URL, SITE_STAFF_EMAIL and SITE_STAFF_PASSWORD (the same values as in the warehouse app). Sends to an e-mail address ("send_to").
const ANON = (process.env.SUPABASE_ANON_KEY ?? "").trim() || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bHduaG1ib3F1bmZscXp2bGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzc4NDMsImV4cCI6MjEwNTkxMzg0M30.tAffoPTs9CFT0KR_e6_uPPfjLjNM3Re4Kev2rcePIGk";
export const mailEnabled = () => !!process.env.SUPABASE_URL && !!process.env.SITE_STAFF_EMAIL && !!process.env.SITE_STAFF_PASSWORD;
export type MailFile = { name: string; content: string }; // content = the file in base64
const ERRORS: Record<string, string> = {
  NOT_AUTHORIZED: "The website refused the staff account (SITE_STAFF_EMAIL / SITE_STAFF_PASSWORD must be an owner or agent).",
  UNKNOWN_ACTION: "The website's admin-mail function is the old version: redeploy it (supabase-functions/admin-mail).", SEND_FAILED: "The e-mail service (Brevo) refused the message.", BAD_REQUEST: "Subject or message missing or too long, or the address is not valid.",
};
export async function mailTo(to: { email: string; name?: string; lang?: string }, subject: string, message: string, attachments: MailFile[] = [], cta?: { label: string; url: string; methods?: boolean }): Promise<string | null> {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/admin-mail`, {
      method: "POST", headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ action: "send_to", to_email: to.email, to_name: to.name ?? "", lang: to.lang ?? "fr", subject, message, ...(attachments.length && { attachments }), ...(cta && { cta_label: cta.label, cta_url: cta.url, ...(cta.methods && { cta_methods: true }) }), staff_email: process.env.SITE_STAFF_EMAIL, staff_password: process.env.SITE_STAFF_PASSWORD }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return r.ok ? null : ERRORS[j.error ?? ""] ?? j.error ?? `The website answered ${r.status}.`;
  } catch (e) { return `Could not reach the website: ${e instanceof Error ? e.message : e}`; }
}
