// What every server action goes through: the database copy is loaded, the person must be signed in, the action runs, it is written to the
// activity log (who, which action, with what, how it ended), and what changed is saved (also when the action ends with a redirect).
import { ensureLoaded, flush, refresh, lockActions } from "./persist";
import { requireUser } from "./users";
import { logAudit, summarize } from "./audit";
import { BILLING_ACCESS } from "./access";
import { redirect } from "next/navigation";

const decode = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
const words = (n: string) => n.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export const act = <A extends unknown[]>(name: string, fn: (...a: A) => Promise<void>) => async (...a: A): Promise<void> => {
  await ensureLoaded();
  await refresh();
  const user = await requireUser();
  // The middleware only checks the page a request goes to: the action itself checks that this person may use the billing system at all
  // (the user-management actions check for an administrator themselves, and everyone may change their own code).
  // The rights come first: someone refused never waits for (or holds) the lock.
  if (!user.admin && name !== "changeOwnCode" && !user.perms.includes(BILLING_ACCESS)) { logAudit(user.name, words(name), "", "refused: no access to the billing system"); await flush(); redirect("/?denied=1"); }
  const unlock = await lockActions(); // one action at a time across both apps, from the fresh data to the save
  try {
    await refresh(false, true);
    let result = "ok";
    try { await fn(...a); }
    catch (e) {
      const digest = (e as { digest?: string })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) { const m = digest.match(/[?&]err=([^&;]*)/); result = m ? `refused: ${decode(m[1])}` : "ok"; }
      else result = `error: ${e instanceof Error ? e.message : String(e)}`;
      throw e;
    } finally { logAudit(user.name, words(name), summarize(a), result); await flush(); }
  } finally { unlock(); }
};
