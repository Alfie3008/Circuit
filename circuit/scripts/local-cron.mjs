// Local stand-in for Vercel Cron: calls the tick route once a minute.
// Usage: npm run cron   (with `npm run dev` running in another terminal)
const url = process.env.CIRCUIT_TICK_URL ?? "http://localhost:3000/api/cron/tick";

async function once() {
  const at = new Date().toLocaleTimeString();
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) return console.log(`${at}  ${res.status} ${body.error ?? ""}`);
    const runs = body.ran.reduce((n, r) => n + r.executions, 0);
    console.log(`${at}  ${body.projects} live project(s), ${runs} run(s) in ${body.ms} ms${body.deferred ? `, ${body.deferred} deferred` : ""}`);
  } catch (e) {
    console.log(`${at}  couldn't reach ${url} (is npm run dev running?) ${e.message}`);
  }
}

console.log(`Ticking ${url} every minute. Ctrl+C to stop.`);
await once();
setInterval(once, 60_000);
