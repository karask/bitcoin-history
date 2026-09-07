import { toTimelineEvent, type BitcoinEvent, type CategoryId, type TimelineEvent } from "@/lib/event-schema";
import { filterEvents, getAllEvents, type EventFilterParams } from "@/lib/events";

/**
 * A setlist is a show, not just a filter: it has its own framing, its own palette and
 * its own shape. Selecting on `kind` rather than `category` is what makes "every chain
 * split" or "every failure" expressible at all.
 */
export type Setlist = {
  id: string;
  title: string;
  kicker: string;
  tagline: string;
  accent: CategoryId;
  limit: number;
  select: (event: BitcoinEvent) => boolean;
};

const SCALING_WAR = new Set([
  "hong-kong-scaling-agreement",
  "new-york-agreement-segwit2x",
  "uasf-bip148",
  "segwit-locks-in",
  "segwit-activates",
  "segwit2x-hard-fork-cancelled",
  "bitcoin-xt-block-size-release",
  "bitcoin-core-0-13-1-segwit-release",
  "segwit-miner-signaling-begins",
]);

export const setlists: Setlist[] = [
  {
    id: "grand-tour",
    title: "The Grand Tour",
    kicker: "THE WHOLE ARC",
    tagline: "Every landmark, from a mailing-list post to a sovereign reserve.",
    accent: "origins",
    limit: 32,
    select: (event) => event.significance === "landmark",
  },
  {
    id: "fork-wars",
    title: "The Fork Wars",
    kicker: "WHO DECIDES THE RULES",
    tagline: "Consensus changes, chain splits, and the long argument over who gets to make them.",
    accent: "protocol",
    limit: 22,
    select: (event) =>
      event.kind === "fork"
      || (event.kind === "activation" && event.significance !== "context")
      || SCALING_WAR.has(event.slug),
  },
  {
    id: "boom-and-bust",
    title: "Boom & Bust",
    kicker: "THE PRICE OF EVERYTHING",
    tagline: "Every top, every bottom, and the leverage that made both worse.",
    accent: "finance",
    limit: 24,
    select: (event) =>
      (event.kind === "record" && event.categories.includes("finance"))
      || (event.kind === "failure" && event.categories.includes("finance")),
  },
  {
    id: "broken-trust",
    title: "Broken Trust",
    kicker: "WHAT FAILED, AND WHAT DIDN'T",
    tagline: "Exchanges, custodians and lenders collapse. The chain keeps producing blocks.",
    accent: "crisis",
    limit: 24,
    select: (event) => event.kind === "failure" && event.categories.includes("crisis"),
  },
  {
    id: "rule-of-law",
    title: "The Long Arm of the Law",
    kicker: "STATES RESPOND",
    tagline: "Statutes, guidance, rulings and raids, from the first FinCEN memo to a national reserve.",
    accent: "policy",
    limit: 26,
    select: (event) =>
      ["law", "guidance", "ruling", "enforcement"].includes(event.kind) && event.categories.includes("policy"),
  },
  {
    id: "money-becomes-real",
    title: "Money Becomes Real",
    kicker: "SOMEBODY SPENDS IT",
    tagline: "Two pizzas, a darknet market, a country, and everything acceptance meant in between.",
    accent: "adoption",
    limit: 24,
    select: (event) => event.kind === "adoption" || event.categories.includes("adoption"),
  },
  {
    id: "the-machine",
    title: "The Machine",
    kicker: "PROOF OF WORK",
    tagline: "CPUs to ASICs, a halving every four years, and the night half the miners went dark.",
    accent: "mining",
    limit: 22,
    select: (event) => event.categories.includes("mining"),
  },
  {
    id: "genesis",
    title: "Genesis",
    kicker: "BEFORE THERE WAS A PRICE",
    tagline: "From blind signatures to dollar parity — the years the track runs flat.",
    accent: "origins",
    limit: 24,
    select: (event) => event.date < "2011-03-01",
  },
];

export const defaultSetlistId = "grand-tour";

export function getSetlist(id: string | undefined): Setlist | undefined {
  return setlists.find((setlist) => setlist.id === id);
}

const significanceRank: Record<BitcoinEvent["significance"], number> = { landmark: 0, major: 1, context: 2 };

/** Trim to the setlist's length by significance, then restore chronological order. */
function shape(candidates: BitcoinEvent[], limit: number): TimelineEvent[] {
  return candidates
    .map((event, index) => ({ event, index }))
    .sort((a, b) =>
      significanceRank[a.event.significance] - significanceRank[b.event.significance] || a.index - b.index)
    .slice(0, limit)
    .map(({ event }) => event)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toTimelineEvent);
}

export function getSetlistEvents(id: string | undefined): TimelineEvent[] {
  const setlist = getSetlist(id) ?? getSetlist(defaultSetlistId)!;
  return shape(getAllEvents().filter(setlist.select), setlist.limit);
}

/** The "Your Filter" show: whatever the explorer currently has selected. */
export function getFilteredSetlistEvents(params: EventFilterParams): TimelineEvent[] {
  return shape(filterEvents(params), 24);
}

export function countSetlistEvents(setlist: Setlist): number {
  return Math.min(getAllEvents().filter(setlist.select).length, setlist.limit);
}
