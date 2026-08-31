export const dynamic = "force-dynamic";
import { currentUser } from "@clerk/nextjs/server";
import { q } from "@/lib/db";
import Chat from "./chat";

/** Server shell: the only thing the browser can't get itself is the reviewer-only open-queue count. */
export default async function Home() {
  const reviewer = (await currentUser())?.publicMetadata.reviewer === true;
  const openReviews = reviewer ? Number((await q<{ n: string }>("SELECT count(*)::text n FROM review_queue WHERE status='open'"))[0].n) : null;
  return <Chat openReviews={openReviews} />;
}
