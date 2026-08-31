export const dynamic = "force-dynamic";
import Link from "next/link";
import { q } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function resolve(formData: FormData) {
  "use server";
  await q("UPDATE review_queue SET status=$2 WHERE id=$1", [Number(formData.get("id")), String(formData.get("status"))]);
  revalidatePath("/review");
}

const chip: Record<string, string> = {
  low: "bg-[#efebe4] text-ink-2", moderate: "bg-amber-soft text-amber", high: "bg-rose-soft text-rose", critical: "bg-rose text-white",
};
const Level = ({ label, level }: { label: string; level: string | null }) => (
  <>
    <span className="text-ink-3">{label}</span>
    <span className={`rounded-full px-2.5 py-[3px] font-medium ${level ? chip[level] ?? chip.low : "text-ink-4"}`}>{level ?? "—"}</span>
  </>
);

/** Human reviewer queue (ground rule #5). Every High/Critical call and every rule/LLM disagreement lands here. */
export default async function Review() {
  const rows = await q<{ id: number; user_id: string; message: string; rule_level: string; llm_level: string | null; final_level: string; created_at: string }>(
    "SELECT id,user_id,message,rule_level,llm_level,final_level,created_at FROM review_queue WHERE status='open' ORDER BY id DESC LIMIT 50");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b border-line px-5 sm:px-10">
        <div className="flex items-baseline gap-3.5">
          <span className="font-serif text-2xl font-medium tracking-[0.04em]">MIRA</span>
          <span className="text-[13px] text-ink-3">Reviewer queue</span>
        </div>
        <Link href="/" className="text-[13px] font-medium text-ink-2 hover:text-ink">Back to check-in</Link>
      </header>
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-5 py-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium">Open safety calls</h1>
            <p className="text-sm text-ink-3">Every High or Critical classification, and every rule/model disagreement, waits here for a qualified human.</p>
          </div>
          <span className="self-start rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium whitespace-nowrap text-white">Open · {rows.length}</span>
        </div>
        {rows.length === 0 && <p className="rounded-[14px] border border-line bg-white p-6 text-sm text-ink-3">Nothing waiting. Every open call has been reviewed.</p>}
        {rows.map((r) => (
          <form key={r.id} action={resolve} className="grid gap-4 rounded-[14px] border border-line bg-white px-6 py-5 md:grid-cols-[120px_minmax(0,1fr)_auto] md:gap-6">
            <input type="hidden" name="id" value={r.id} />
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[13px] font-medium tabular-nums">#{r.id}</span>
              <span className="text-ink-3">{r.user_id}</span>
              <span className="text-ink-4">{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <p className="font-serif text-[17px] leading-[1.5] text-pretty whitespace-pre-wrap">{r.message}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Level label="rule" level={r.rule_level} />
                <span className="ml-1.5" /><Level label="model" level={r.llm_level} />
                <span className="ml-1.5" /><Level label="final" level={r.final_level} />
              </div>
            </div>
            <div className="flex gap-2 md:justify-end">
              <button name="status" value="confirmed" className="h-10 rounded-full bg-sage px-4 text-[13px] font-medium text-white hover:bg-sage-deep">Confirm</button>
              <button name="status" value="overridden" className="h-10 rounded-full border border-line-2 bg-white px-4 text-[13px] font-medium text-ink-2 hover:bg-ground">Override</button>
            </div>
          </form>
        ))}
      </main>
    </div>
  );
}
