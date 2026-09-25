import { createServerClient } from "@supabase/ssr";
const BASE = "https://wallxer-crm-pro.vercel.app";
const jar = new Map();
const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: { getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })), setAll: (c) => c.forEach(({ name, value }) => jar.set(name, value)) },
});
await sb.auth.signInWithPassword({ email: process.env.CHECK_EMAIL, password: process.env.CHECK_PASSWORD });
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

async function time(path, runs = 3) {
  const times = [];
  let region = "";
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    await res.text();
    times.push(Date.now() - t0);
    region = res.headers.get("x-vercel-id") ?? "";
  }
  const min = Math.min(...times);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  console.log(`${path.padEnd(22)} min ${String(min).padStart(5)}ms   avg ${String(avg).padStart(5)}ms   ${region.split("::")[0]}`);
}

console.log("route                     fastest        average   vercel region");
await time("/api/health");
await time("/dashboard");
await time("/contacts");
await time("/projects");
await time("/tasks");
await time("/pipeline");
