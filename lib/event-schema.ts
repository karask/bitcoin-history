import { z } from "zod";
import { isCountryCode, isSubdivisionCode, type Place } from "@/lib/places";

export const categoryIds = [
  "origins",
  "protocol",
  "mining",
  "adoption",
  "infrastructure",
  "finance",
  "policy",
  "crisis",
] as const;

export type CategoryId = (typeof categoryIds)[number];

export const categoryLabels: Record<CategoryId, string> = {
  origins: "Origins & culture",
  protocol: "Protocol & scaling",
  mining: "Mining & supply",
  adoption: "Payments & adoption",
  infrastructure: "Companies & infrastructure",
  finance: "Markets & finance",
  policy: "Law & sovereign policy",
  crisis: "Crises & controversy",
};

export const categoryShortLabels: Record<CategoryId, string> = {
  origins: "Origins",
  protocol: "Protocol",
  mining: "Mining",
  adoption: "Adoption",
  infrastructure: "Infrastructure",
  finance: "Finance",
  policy: "Policy",
  crisis: "Crises",
};

/**
 * `category` says which domain an event belongs to. `kind` says what type of thing
 * happened, independently of domain — a court ruling and a statute are both policy
 * but they are not the same kind of event, and "every chain split" was previously
 * inexpressible because forks, releases and activations all lived under `protocol`.
 * The presentation setlists are built on this axis.
 */
export const kindIds = [
  "research",
  "release",
  "activation",
  "fork",
  "launch",
  "adoption",
  "record",
  "failure",
  "law",
  "guidance",
  "ruling",
  "enforcement",
  "culture",
] as const;

export type KindId = (typeof kindIds)[number];

export const kindLabels: Record<KindId, string> = {
  research: "Research & proposals",
  release: "Software releases",
  activation: "Consensus activations",
  fork: "Chain splits",
  launch: "Launches & foundings",
  adoption: "Adoption & integration",
  record: "Records & milestones",
  failure: "Failures & losses",
  law: "Legislation",
  guidance: "Regulatory guidance",
  ruling: "Court rulings",
  enforcement: "Enforcement actions",
  culture: "Culture & community",
};

export const significanceIds = ["landmark", "major", "context"] as const;
export type SignificanceId = (typeof significanceIds)[number];

/**
 * Landmarks are capped hard (see tests/corpus.test.mjs) so the tier keeps meaning:
 * roughly the set of events a thirty-minute documentary could not omit. Significance
 * also drives presentation pacing, so an inflated tier flattens the whole ride.
 */
export const LANDMARK_LIMIT = 32;
export const MAJOR_LIMIT = 120;

const sourceSchema = z.object({
  title: z.string().min(2),
  publisher: z.string().min(2),
  url: z.string().url(),
  type: z.enum(["primary", "secondary"]),
});

const placeSchema = z.object({
  country: z.string().refine(isCountryCode, "unknown country code"),
  subdivision: z.string().refine(isSubdivisionCode, "unknown subdivision code").optional(),
});

export const bitcoinEventSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Set only when the record describes a period rather than a moment. */
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  precision: z.enum(["day", "month", "year"]),
  title: z.string().min(4),
  summary: z.string().min(12),
  details: z.string().min(24),
  whyItMatters: z.string().min(8),
  category: z.enum(categoryIds),
  categories: z.array(z.enum(categoryIds)).min(1),
  kind: z.enum(kindIds),
  scope: z.enum(["protocol", "ecosystem"]),
  significance: z.enum(significanceIds),
  curated: z.boolean(),
  places: z.array(placeSchema).min(1),
  tags: z.array(z.string()),
  actors: z.array(z.string()),
  evidence: z.enum(["documented", "well-supported", "disputed", "estimated"]),
  sources: z.array(sourceSchema).min(1),
  /** Slugs of records that belong to the same thread, for "follow this story". */
  related: z.array(z.string()).optional(),
  technicalNote: z.string().optional(),
  blockHeight: z.number().int().nonnegative().optional(),
  txid: z.string().optional(),
  bip: z.union([z.string(), z.number()]).optional(),
});

export type BitcoinEventRecord = z.infer<typeof bitcoinEventSchema>;

/**
 * The stored record plus fields derived at load time. `priceUsd` is never authored —
 * it is read from content/price-context.json so the corpus cannot drift from the
 * price series the presentation rides on. It is null before Bitcoin had a quoted price.
 */
export type BitcoinEvent = BitcoinEventRecord & {
  places: Place[];
  priceUsd: number | null;
};

export type TimelineEvent = Pick<
  BitcoinEvent,
  | "slug"
  | "date"
  | "endDate"
  | "precision"
  | "title"
  | "summary"
  | "whyItMatters"
  | "category"
  | "categories"
  | "kind"
  | "scope"
  | "significance"
  | "curated"
  | "places"
  | "tags"
  | "actors"
  | "evidence"
  | "related"
  | "technicalNote"
  | "blockHeight"
  | "txid"
  | "bip"
  | "priceUsd"
>;

/** Full reading material is sent only to the presentation, not every archive card. */
export type PresentationEvent = TimelineEvent & Pick<BitcoinEvent, "details" | "sources">;

export function formatEventDate(event: Pick<BitcoinEvent, "date" | "precision">) {
  const date = new Date(`${event.date}T00:00:00Z`);
  if (event.precision === "year") return String(date.getUTCFullYear());
  if (event.precision === "month") {
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** "18 May – 22 May 2010" style label for records that span a period. */
export function formatEventRange(event: Pick<BitcoinEvent, "date" | "endDate" | "precision">) {
  const start = formatEventDate(event);
  if (!event.endDate) return start;
  const end = formatEventDate({ date: event.endDate, precision: event.precision });
  return `${start} – ${end}`;
}

export function toTimelineEvent(event: BitcoinEvent): TimelineEvent {
  const {
    slug, date, endDate, precision, title, summary, whyItMatters, category, categories,
    kind, scope, significance, curated, places, tags, actors, evidence, related,
    technicalNote, blockHeight, txid, bip, priceUsd,
  } = event;
  return {
    slug, date, endDate, precision, title, summary, whyItMatters, category, categories,
    kind, scope, significance, curated, places, tags, actors, evidence, related,
    technicalNote, blockHeight, txid, bip, priceUsd,
  };
}
