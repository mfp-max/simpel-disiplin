import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Semua halaman wajib login, kecuali halaman masuk, akses ditolak, dan cron
// (cron dijaga dengan CRON_SECRET di route-nya sendiri).
const publik = createRouteMatcher(["/masuk(.*)", "/daftar(.*)", "/akses-ditolak", "/api/cron/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!publik(req)) await auth.protect({ unauthenticatedUrl: new URL("/masuk", req.url).toString() });
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
