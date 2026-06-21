// Resolves the canonical site URL across environments.
// Priority: explicit NEXT_PUBLIC_APP_URL → Vercel's deployment URL → localhost.
// This keeps Open Graph images, sitemap, and robots correct on Vercel even
// when NEXT_PUBLIC_APP_URL hasn't been set manually.
export function getSiteUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
