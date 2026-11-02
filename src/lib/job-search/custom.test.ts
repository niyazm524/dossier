import { afterEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "@/lib/ai/test-http";
import { custom, customUrlSchema } from "./custom";
import { searchPostings } from "./index";
import { EMPTY_QUERY } from "./search";

const query = { ...EMPTY_QUERY, keywords: "content lead", country: "am", remoteOnly: true };
const credentials = { url: "http://jobfeed:8000/catalogue", auth: { username: "reader", password: "secret" } };
const item = { id: "canonical-1", title: "Content Lead", company: "Example", location: "Remote", remote: true, salary: "", postedAt: null,
  url: "https://jobs.example/1", description: "A real description would be collected by the service.", complete: true };
const ready = { items: [item], nextCursor: null, searchStatus: "ready" };
afterEach(() => vi.unstubAllGlobals());

describe("Custom HTTP catalogue", () => {
  it("passes all filters and an opaque cursor to the configured service only", async () => {
    const requests = stubFetch(() => json({ ...ready, nextCursor: "opaque-next" }));
    const page = await custom.search(query, credentials, "opaque-current");
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url.origin + requests[0].url.pathname).toBe("http://jobfeed:8000/catalogue/v1/jobs");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ keywords: "content lead", place: "", country: "am", radiusKm: "25", remoteOnly: "true", postedWithin: "any", limit: "20", cursor: "opaque-current" });
    expect(requests[0].headers.get("authorization")).toBe(`Basic ${Buffer.from("reader:secret").toString("base64")}`);
    expect(page).toEqual({ postings: [{ ...item, id: undefined, location: undefined, source: "CUSTOM", externalId: item.id, place: item.location, via: "" }], next: "opaque-next" });
  });

  it("supports no authentication and never follows redirects", async () => {
    stubFetch(() => json(ready));
    await custom.search(query, { url: "https://feed.example" }, null);
    const fetch = vi.mocked(globalThis.fetch);
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).has("authorization")).toBe(false);
  });

  it("registers pending searches, then sees newly collected results on the very next request", async () => {
    let collected = false;
    const requests = stubFetch(() => json(collected ? ready : { items: [], nextCursor: null, searchStatus: "pending" }));
    await expect(searchPostings("CUSTOM", credentials, query)).rejects.toMatchObject({ problem: "pending" });
    collected = true;
    await expect(searchPostings("CUSTOM", credentials, query)).resolves.toMatchObject({ postings: [{ externalId: "canonical-1" }] });
    await searchPostings("CUSTOM", credentials, query);
    expect(requests).toHaveLength(3);
  });

  it("accepts a completed empty search and removes duplicate canonical IDs", async () => {
    stubFetch(() => json({ ...ready, items: [] }));
    expect(await custom.search(query, credentials, null)).toEqual({ postings: [], next: null });
    stubFetch(() => json({ ...ready, items: [item, item] }));
    expect((await custom.search(query, credentials, null)).postings).toHaveLength(1);
  });

  it.each([
    { ...ready, items: [{ ...item, url: "javascript:alert(1)" }] },
    { ...ready, items: [{ ...item, description: "", complete: true }] },
    { ...ready, items: [{ ...item, id: "" }] },
    { ...ready, items: [{ ...item, company: "" }] },
    { ...ready, searchStatus: "pending" },
    { items: [] },
  ])("rejects a malformed catalogue response", async (answer) => {
    stubFetch(() => json(answer));
    await expect(custom.search(query, credentials, null)).rejects.toMatchObject({ problem: "changed" });
  });

  it("rejects a cursor that makes no progress", async () => {
    stubFetch(() => json({ ...ready, nextCursor: "same" }));
    await expect(custom.search(query, credentials, "same")).rejects.toMatchObject({ problem: "changed" });
  });

  it.each([[401, "key"], [403, "key"], [422, "query"], [429, "quota"], [503, "unavailable"], [302, "changed"]])("handles HTTP %s without exposing the response body", async (status, problem) => {
    stubFetch(() => json({ error: "sensitive upstream message" }, { status: status as number }));
    await expect(custom.search(query, credentials, null)).rejects.toMatchObject({ problem });
  });

  it("checks health without creating a search subscription", async () => {
    const requests = stubFetch(() => json({ status: "ok" }));
    await custom.test(credentials);
    expect(requests[0].url.pathname).toBe("/catalogue/health");
    expect(requests[0].url.search).toBe("");
    stubFetch(() => json({ status: "broken" }));
    await expect(custom.test(credentials)).rejects.toMatchObject({ problem: "changed" });
  });

  it("never scrapes a posting to fill a missing description", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const posting = { ...item, source: "CUSTOM" as const, externalId: item.id, place: item.location, via: "" };
    expect(await custom.details({ ...posting, complete: false }, credentials)).toBeNull();
    expect(await custom.details(posting, credentials)).toBe(item.description);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["file:///etc/passwd", "https://user:secret@feed.example", "https://feed.example?key=secret", "https://feed.example#fragment"])("refuses credentials or unsupported URLs: %s", (url) => {
    expect(customUrlSchema.safeParse(url).success).toBe(false);
  });
});
