import "server-only";

import { z } from "zod";

import type { JobSourceAdapter, SourceCredentials } from "./adapter";
import { jobSearchError } from "./errors";
import { requestJson } from "./http";
import { foundPostingSchema } from "./search";

/** An owner-configured service, including a private Docker host. Credentials belong in Settings. */
export const customUrlSchema = z.string().trim().max(2000).refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, "Use an http:// or https:// base URL without credentials, query parameters or a fragment.");

const itemSchema = foundPostingSchema.omit({ source: true, externalId: true, place: true }).extend({
  id: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(500),
  company: z.string().trim().min(1).max(300),
  location: z.string().max(300),
  via: z.string().max(100).default(""),
}).refine((item) => !item.complete || item.description.trim().length > 0, "A complete posting needs a description.");
const pageSchema = z.object({
  items: z.array(itemSchema).max(100),
  nextCursor: z.string().min(1).max(2000).nullable(),
  searchStatus: z.enum(["pending", "ready"]).default("ready"),
  lastSuccessfulSyncAt: z.iso.datetime().nullable().optional(),
}).refine((page) => page.searchStatus !== "pending" || (page.items.length === 0 && page.nextCursor === null));

function endpoint(credentials: SourceCredentials["CUSTOM"], path: string): URL {
  const parsed = customUrlSchema.safeParse(credentials.url);
  if (!parsed.success) throw jobSearchError("no-key", "CUSTOM");
  return new URL(`${parsed.data.replace(/\/+$/, "")}/${path}`);
}

function headers(credentials: SourceCredentials["CUSTOM"]): Record<string, string> {
  if (!credentials.auth) return {};
  return { authorization: `Basic ${Buffer.from(`${credentials.auth.username}:${credentials.auth.password}`, "utf8").toString("base64")}` };
}

export const custom: JobSourceAdapter<"CUSTOM"> = {
  source: "CUSTOM",
  async search(query, credentials, next, context = {}) {
    const url = endpoint(credentials, "v1/jobs");
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
    url.searchParams.set("limit", "20");
    if (next) url.searchParams.set("cursor", next);
    // Never follow a service redirect with credentials or a search attached.
    const raw = await requestJson("CUSTOM", url, { headers: headers(credentials), signal: context.signal, redirect: "error" });
    const parsed = pageSchema.safeParse(raw);
    if (!parsed.success) throw jobSearchError("changed", "CUSTOM");
    if (parsed.data.searchStatus === "pending") throw jobSearchError("pending", "CUSTOM");
    if (next && parsed.data.nextCursor === next) throw jobSearchError("changed", "CUSTOM");
    const seen = new Set<string>();
    return {
      postings: parsed.data.items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }).map(({ id, location, ...item }) => ({ ...item, source: "CUSTOM" as const, externalId: id, place: location })),
      next: parsed.data.nextCursor,
    };
  },
  // Full text belongs in the catalogue response. Never scrape a vacancy from Dossier.
  details: async (posting) => posting.complete ? posting.description : null,
  async test(credentials, context = {}) {
    const raw = await requestJson("CUSTOM", endpoint(credentials, "health"), { headers: headers(credentials), signal: context.signal, redirect: "error" });
    if (!z.object({ status: z.literal("ok") }).safeParse(raw).success) throw jobSearchError("changed", "CUSTOM");
  },
};
