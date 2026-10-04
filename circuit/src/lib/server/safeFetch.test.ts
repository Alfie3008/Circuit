/** The safe fetcher: what programs can and can't reach from Circuit's servers. */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkUrl, FetchBlocked, htmlToPage, isPublicIp, safeFetch } from "./safeFetch";

describe("which addresses count as public", () => {
  it("refuses private, loopback, metadata and reserved ranges, in every spelling", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:a00:1::"])
      expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicIp(ip), ip).toBe(true);
  });

  it("refuses odd schemes, ports, credentials and internal names before connecting", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com", "http://example.com:8080/", "http://user:pw@example.com/", "http://localhost/", "http://db.internal/", "http://printer/", "not a url"])
      expect(() => checkUrl(u), u).toThrow(FetchBlocked);
    expect(checkUrl("https://example.com/a?b=1").hostname).toBe("example.com");
  });
});

describe("fetching", () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/page") return res.end(`<html><head><title>Hi &amp; bye</title><script>evil()</script></head><body><p>Hello <b>world</b></p><a href="/next">n</a><a href="mailto:x@y">m</a></body></html>`);
      if (req.url === "/big") return res.end("x".repeat(5000));
      if (req.url === "/loop") return res.writeHead(302, { location: "/loop" }).end();
      if (req.url === "/to-private") return res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      if (req.url === "/post") {
        let body = "";
        req.on("data", (c) => (body += c));
        return req.on("end", () => res.end(JSON.stringify({ method: req.method, body })));
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  // The test server is on loopback: let exactly that through, so every other rule still applies.
  const local = { allowAddress: (ip: string) => ip === "127.0.0.1", anyPort: true };

  it("refuses loopback and cloud metadata under the normal rules, by name or by IP", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(FetchBlocked);
    await expect(safeFetch("http://[::1]/")).rejects.toThrow(FetchBlocked);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(FetchBlocked);
    await expect(safeFetch("http://localtest.me/")).rejects.toThrow(FetchBlocked); // a public name that resolves to 127.0.0.1
  });

  it("reads a page; refuses redirect loops and redirects into private addresses; cuts big bodies; sends POST bodies", async () => {
    const page = await safeFetch(`${base}/page`, local);
    expect(page).toMatchObject({ status: 200, truncated: false });
    expect(page.text).toContain("<title>");
    await expect(safeFetch(`${base}/loop`, local)).rejects.toThrow(/redirected too many times/);
    await expect(safeFetch(`${base}/to-private`, local)).rejects.toThrow(FetchBlocked);
    const big = await safeFetch(`${base}/big`, { ...local, maxBytes: 1000 });
    expect(big.truncated).toBe(true);
    expect(big.text.length).toBe(1000);
    const post = await safeFetch(`${base}/post`, { ...local, method: "POST", body: '{"a":1}' });
    expect(JSON.parse(post.text)).toEqual({ method: "POST", body: '{"a":1}' });
  });

  it("turns HTML into title, text and absolute links, never markup", () => {
    const page = htmlToPage(`<title>Hi &amp; bye</title><style>.x{}</style><script>evil()</script><p>Hello <b>world</b></p><a href="/next">n</a><a href="mailto:x@y">m</a><a href="https://other.org/x">o</a>`, "https://site.com/a");
    expect(page.title).toBe("Hi & bye");
    expect(page.text).toBe("Hello world\nn m o");
    expect(page.links).toEqual(["https://site.com/next", "https://other.org/x"]);
    // Minified pages: unquoted attributes; in-page anchors are skipped.
    expect(htmlToPage(`<a href=/plain>p</a><a class=x href=https://b.org/y>y</a><a href="#top">t</a>`, "https://site.com/").links).toEqual(["https://site.com/plain", "https://b.org/y"]);
  });
});
