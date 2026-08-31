import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

/** Reviewer pages show other people's crisis messages: a session is not enough. Set `publicMetadata.reviewer = true`
 *  on the user in the Clerk dashboard. */
// ponytail: one Clerk API call per reviewer page load; put public_metadata in the session token if this gets hot.
export async function requireReviewer() {
  const u = await currentUser();
  if (u?.publicMetadata.reviewer !== true) notFound();
  return u.id;
}
