import { clerkMiddleware } from "@clerk/nextjs/server";

// Pages: redirect to Clerk's hosted sign-in when there is no session. API routes check `auth()` themselves and return
// 401 (auth.protect() would answer 404 for non-navigation requests). No local sign-in/up pages, so nothing is public.
export default clerkMiddleware(async (auth, req) => {
  if (!req.nextUrl.pathname.startsWith("/api/")) await auth.protect();
});

export const config = {
  // Skip static assets; always run for API routes.
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
