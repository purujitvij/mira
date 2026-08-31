export const dynamic = "force-dynamic";
import { q } from "@/lib/db";
import { requireReviewer } from "@/lib/auth";

export default async function Trace({ params }: { params: Promise<{ id: string }> }) {
  await requireReviewer();
  const { id } = await params;
  const rows = await q<{ node: string; ms: number; tokens_in: number; tokens_out: number; meta: Record<string, unknown>; created_at: string }>(
    "SELECT node, ms, tokens_in, tokens_out, meta, created_at FROM traces WHERE request_id=$1 ORDER BY id", [id]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 font-mono text-sm text-stone-800">
      <h1 className="mb-4 text-base">trace {id}</h1>
      <table className="w-full text-left">
        <thead><tr className="text-stone-500"><th>node</th><th>ms</th><th>in</th><th>out</th><th>meta</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-stone-200 align-top"><td className="py-1 pr-3">{r.node}</td><td className="pr-3">{r.ms}</td><td className="pr-3">{r.tokens_in}</td><td className="pr-3">{r.tokens_out}</td><td className="break-all text-stone-500">{JSON.stringify(r.meta)}</td></tr>
        ))}</tbody>
      </table>
    </main>
  );
}
