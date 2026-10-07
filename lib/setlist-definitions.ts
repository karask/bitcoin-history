import type { CategoryId } from "@/lib/event-schema";

/**
 * Setlist definitions and the selection that shapes them.
 *
 * Kept free of value imports from path-aliased modules (the only import is type-only and
 * is erased), so `tests/setlists.test.mjs` can load this file directly under Node's type
 * stripping and check every show's membership against the real corpus.
 */

/** The fields a show needs to decide membership. */
export type SetlistCandidate = {
  slug: string;
  date: string;
  kind: string;
  /** Primary category; `categories` also lists the secondary ones. */
  category: string;
  significance: "landmark" | "major" | "context";
  categories: readonly string[];
};

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
  select: (event: SetlistCandidate) => boolean;
  /**
   * Records the show must carry even though its rule would not pick them — a thread's
   * closing chapter, or an event that belongs to the show's argument but not its kind.
   * Featured records and landmarks are never cut to make room.
   */
  feature?: readonly string[];
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

/** The identity thread: who Satoshi was, how they left, and who was named since. */
const SATOSHI_QUESTION = new Set([
  "satoshi-contacts-wei-dai",
  "bitcoin-white-paper-announced",
  "satoshi-p2p-foundation-announcement",
  "first-person-to-person-bitcoin-transaction",
  "satoshi-last-public-forum-post",
  "satoshi-final-known-email",
  "newsweek-names-dorian-nakamoto",
  "hal-finney-dies",
  "craig-wright-claims-satoshi-identity",
  "hodlonaut-wins-norway-wright-case",
  "copa-v-wright-identity-ruling",
  "hbo-money-electric-names-peter-todd",
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
    limit: 24,
    select: (event) =>
      event.kind === "fork"
      || (event.kind === "activation" && event.significance !== "context")
      || SCALING_WAR.has(event.slug),
    // Not forks or activations, but the same argument: who sets node policy, and how
    // the rules might change to survive quantum computers. Core 31's cluster mempool
    // is the next node-policy change after v30's.
    feature: ["bitcoin-core-v30-op-return-policy", "bitcoin-core-31-cluster-mempool", "bip360-post-quantum-output-type"],
  },
  {
    id: "boom-and-bust",
    title: "Boom & Bust",
    kicker: "THE PRICE OF EVERYTHING",
    tagline: "Every top, every bottom, and the leverage that made both worse.",
    accent: "finance",
    limit: 24,
    // Price records, plus failures that were market events in their own right. Matching
    // any failure tagged finance swept in thefts and bankruptcies that belong to Broken
    // Trust, so the two shows largely duplicated each other.
    select: (event) =>
      (event.kind === "record" && event.categories.includes("finance"))
      || (event.kind === "failure" && event.category === "finance"),
    // Filed as crises, but each was a bust the market priced: the pandemic sell-off and
    // the 2022 leverage unwind that ran from Terra to FTX.
    feature: ["bitcoin-black-thursday", "terra-collapse", "ftx-chapter-11"],
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
    // The largest pool of any show (about 90 records), so it runs longer than the rest.
    limit: 33,
    // Identity disputes are court rulings too, but about who Satoshi was rather than how
    // states treat Bitcoin; they belong to The Satoshi Question.
    select: (event) =>
      ["law", "guidance", "ruling", "enforcement"].includes(event.kind)
      && event.categories.includes("policy")
      && event.category !== "origins",
    feature: [
      // Bitcoin's legal classification sits three months from the BitLicense landmark, so
      // time spacing alone would drop it.
      "cftc-bitcoin-commodity-coinflip",
      // The EU's framework and the first U.S. federal crypto statute fall in crowded years.
      "eu-council-adopts-mica",
      "genius-act-signed",
      // Threads the show opens must be allowed to close: Silk Road and Binance end in
      // pardons, the Tornado Cash sanction in a split verdict, and the market-structure
      // bill on the Senate floor.
      "ross-ulbricht-pardoned",
      "changpeng-zhao-pardoned",
      "roman-storm-tornado-cash-verdict",
      "samourai-founders-sentenced",
      "clarity-act-senate-cloture-fails",
    ],
  },
  {
    id: "money-becomes-real",
    title: "Money Becomes Real",
    kicker: "SOMEBODY SPENDS IT",
    tagline: "Two pizzas, a darknet market, a country, and everything acceptance meant in between.",
    accent: "adoption",
    limit: 29,
    select: (event) => event.kind === "adoption" || event.categories.includes("adoption"),
    feature: [
      // The show is about use, and these are its first places to spend: a cash machine and
      // a major retailer.
      "first-public-bitcoin-atm",
      "overstock-accepts-bitcoin",
      // 2025 widened who could hold it — a treasury-company boom, a second sovereign
      // reserve, workplace retirement plans and a central bank — and set up the unwind the
      // show ends on.
      "twenty-one-capital-launched",
      "pakistan-strategic-bitcoin-reserve",
      "us-401k-alternative-assets-order",
      "czech-national-bank-bitcoin-test-portfolio",
    ],
  },
  {
    id: "the-machine",
    title: "The Machine",
    kicker: "PROOF OF WORK",
    tagline: "CPUs to ASICs, a halving every four years, and the night half the miners went dark.",
    accent: "mining",
    limit: 22,
    // Mining runs through many records as a secondary tag. For the minor ones that is
    // not enough: time spacing otherwise filled the show's spare slots with an exchange
    // rate and an Ordinals count ahead of the first difficulty increase.
    select: (event) => event.categories.includes("mining")
      && (event.category === "mining" || event.significance !== "context"),
  },
  {
    id: "satoshi-question",
    title: "The Satoshi Question",
    kicker: "WHO WROTE IT",
    tagline: "A pseudonym, a quiet exit, and more than a decade of people claiming to have found the person behind it.",
    accent: "origins",
    limit: 14,
    select: (event) => SATOSHI_QUESTION.has(event.slug),
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

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

/**
 * Choose a show's chapters from date-ordered `events`.
 *
 * Featured records and landmarks always make the cut. The remaining slots are filled one
 * tier at a time, each pick being the candidate furthest in time from everything already
 * chosen. Breaking ties by date order instead — the previous behaviour — handed every
 * slot to the oldest records: a full show like Rule of Law kept a single event from 2023
 * onward, so its own tagline's "national reserve" era was cut first. Spacing by time
 * covers the whole span and fills the longest silences first.
 */
export function shapeSetlist<E extends SetlistCandidate>(
  events: readonly E[],
  setlist: Pick<Setlist, "limit" | "select" | "feature">,
): E[] {
  const featured = new Set(setlist.feature ?? []);
  const eligible = events.filter((event) => featured.has(event.slug) || setlist.select(event));
  const chosen = eligible.filter((event) => featured.has(event.slug) || event.significance === "landmark");
  const chosenDays = chosen.map((event) => dayOf(event.date));

  for (const tier of ["major", "context"] as const) {
    const pool = eligible.filter((event) => !featured.has(event.slug) && event.significance === tier);
    const poolDays = pool.map((event) => dayOf(event.date));
    while (chosen.length < setlist.limit && pool.length) {
      let best = 0;
      let bestGap = -1;
      for (let index = 0; index < pool.length; index += 1) {
        let gap = Infinity;
        for (const day of chosenDays) gap = Math.min(gap, Math.abs(day - poolDays[index]));
        // Strict comparison keeps the earlier record when two are equally far away.
        if (gap > bestGap) { best = index; bestGap = gap; }
      }
      chosen.push(pool.splice(best, 1)[0]);
      chosenDays.push(poolDays.splice(best, 1)[0]);
    }
  }

  // Restore archive order, so same-day chapters play in the sequence the archive lists them.
  const position = new Map(events.map((event, index) => [event.slug, index]));
  return chosen.sort((a, b) => position.get(a.slug)! - position.get(b.slug)!);
}
