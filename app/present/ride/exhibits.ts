import type * as THREE from "three";
import type { PresentationEvent } from "@/lib/event-schema";
import { ExhibitKit } from "./exhibit-kit.ts";
import { exhibitDesign, type ExhibitKind } from "./exhibit-design.ts";
import { buildPizzaExhibit } from "./exhibit-pizza.ts";
import * as scenes from "./exhibit-scenes.ts";

export { exhibitKind } from "./exhibit-design.ts";
export type { ExhibitKind } from "./exhibit-design.ts";
export type Exhibit = { group: THREE.Group; update: (time: number) => void; dispose: () => void; kind: ExhibitKind };

export function exhibitDate(event: Pick<PresentationEvent, "date" | "precision">): string {
  if (event.precision === "year") return event.date.slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", ...(event.precision === "day" ? { day: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${event.date}T00:00:00Z`));
}

const builders: Record<Exclude<ExhibitKind, "pizza">, (kit: ExhibitKit) => void> = {
  archive: scenes.archiveScene, computer: scenes.computerScene, genesis: scenes.genesisScene,
  mining: scenes.miningScene, halving: scenes.halvingScene, protocol: scenes.protocolScene,
  lightning: scenes.lightningScene, market: scenes.marketScene, exchange: scenes.exchangeScene,
  custody: scenes.custodyScene, security: scenes.securityScene, insolvency: scenes.insolvencyScene,
  law: scenes.lawScene, court: scenes.courtScene, commerce: scenes.commerceScene,
  treasury: scenes.treasuryScene, media: scenes.mediaScene, memorial: scenes.memorialScene,
  auction: scenes.auctionScene, assembly: scenes.assemblyScene, charity: scenes.charityScene,
  inscription: scenes.inscriptionScene, atm: scenes.atmScene,
};

/** Local x = screen right, y = up, z = toward rider. No real premises are implied. */
export function buildExhibit(event: PresentationEvent, accent: number): Exhibit {
  const design = exhibitDesign(event);
  if (design.kind === "pizza") return buildPizzaExhibit(event);
  const kit = new ExhibitKit(event, design, accent);
  builders[design.kind](kit);
  return kit.finish();
}
