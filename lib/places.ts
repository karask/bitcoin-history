/**
 * Place vocabulary for the archive.
 *
 * Events used to carry a flat `regions: string[]` that mixed countries ("Japan"),
 * subdivisions ("Wyoming"), continents ("Africa") and blocs ("European Union") at a
 * single level, which made region filtering incoherent. Places are now stored as an
 * ISO country plus an optional ISO 3166-2 subdivision, and everything broader —
 * continent, EU or CEMAC membership — is derived from the tables below.
 */

export type ContinentId = "africa" | "asia" | "europe" | "north-america" | "south-america" | "oceania" | "global";

export const continentLabels: Record<ContinentId, string> = {
  africa: "Africa",
  asia: "Asia",
  europe: "Europe",
  "north-america": "North America",
  "south-america": "South America",
  oceania: "Oceania",
  global: "Global",
};

export type BlocId = "eu" | "cemac" | "eea";

export const blocLabels: Record<BlocId, string> = {
  eu: "European Union",
  cemac: "CEMAC",
  eea: "European Economic Area",
};

type CountryRecord = {
  name: string;
  continent: ContinentId;
  blocs?: BlocId[];
};

/**
 * `XX` marks an event with no meaningful territory — protocol changes, releases and
 * network-wide records. `EU` is the ISO 3166-1 exceptional reservation for the Union
 * itself, used when the actor is a European institution rather than a member state.
 */
export const countries = {
  XX: { name: "Global", continent: "global" },
  EU: { name: "European Union", continent: "europe", blocs: ["eu"] },

  AE: { name: "United Arab Emirates", continent: "asia" },
  AR: { name: "Argentina", continent: "south-america" },
  AU: { name: "Australia", continent: "oceania" },
  BR: { name: "Brazil", continent: "south-america" },
  BS: { name: "Bahamas", continent: "north-america" },
  CA: { name: "Canada", continent: "north-america" },
  CF: { name: "Central African Republic", continent: "africa", blocs: ["cemac"] },
  CN: { name: "China", continent: "asia" },
  CZ: { name: "Czech Republic", continent: "europe", blocs: ["eu", "eea"] },
  DE: { name: "Germany", continent: "europe", blocs: ["eu", "eea"] },
  FI: { name: "Finland", continent: "europe", blocs: ["eu", "eea"] },
  FR: { name: "France", continent: "europe", blocs: ["eu", "eea"] },
  GB: { name: "United Kingdom", continent: "europe" },
  GR: { name: "Greece", continent: "europe", blocs: ["eu", "eea"] },
  HK: { name: "Hong Kong", continent: "asia" },
  IN: { name: "India", continent: "asia" },
  JP: { name: "Japan", continent: "asia" },
  KP: { name: "North Korea", continent: "asia" },
  KR: { name: "South Korea", continent: "asia" },
  NG: { name: "Nigeria", continent: "africa" },
  NL: { name: "Netherlands", continent: "europe", blocs: ["eu", "eea"] },
  NO: { name: "Norway", continent: "europe", blocs: ["eea"] },
  RU: { name: "Russia", continent: "europe" },
  SE: { name: "Sweden", continent: "europe", blocs: ["eu", "eea"] },
  SG: { name: "Singapore", continent: "asia" },
  SV: { name: "El Salvador", continent: "north-america" },
  TR: { name: "Turkey", continent: "asia" },
  UA: { name: "Ukraine", continent: "europe" },
  US: { name: "United States", continent: "north-america" },
  VG: { name: "British Virgin Islands", continent: "north-america" },
} as const satisfies Record<string, CountryRecord>;

export type CountryCode = keyof typeof countries;

export const subdivisions = {
  "CN-SC": "Sichuan",
  "DE-SN": "Saxony",
  "US-NH": "New Hampshire",
  "US-NY": "New York",
  "US-TX": "Texas",
  "US-WI": "Wisconsin",
  "US-WY": "Wyoming",
} as const satisfies Record<string, string>;

export type SubdivisionCode = keyof typeof subdivisions;

export type Place = { country: CountryCode; subdivision?: SubdivisionCode };

export function isCountryCode(value: string): value is CountryCode {
  return Object.hasOwn(countries, value);
}

export function isSubdivisionCode(value: string): value is SubdivisionCode {
  return Object.hasOwn(subdivisions, value);
}

/** "Wyoming, United States" for a subdivision, otherwise just the country name. */
export function formatPlace(place: Place): string {
  const country = countries[place.country].name;
  if (!place.subdivision) return country;
  return `${subdivisions[place.subdivision]}, ${country}`;
}

export function formatPlaces(places: Place[]): string {
  return places.map(formatPlace).join(" · ");
}

/** Every continent an event touches, in a stable order, with global filtered out. */
export function continentsOf(places: Place[]): ContinentId[] {
  const seen = new Set<ContinentId>();
  for (const place of places) {
    const continent = countries[place.country].continent;
    if (continent !== "global") seen.add(continent);
  }
  return (Object.keys(continentLabels) as ContinentId[]).filter((continent) => seen.has(continent));
}

/** Every bloc an event touches. An EU regulation matches a filter on any member state. */
export function blocsOf(places: Place[]): BlocId[] {
  const seen = new Set<BlocId>();
  for (const place of places) {
    // `satisfies` narrows each entry to its literal shape, so widen to read the optional field.
    const record: CountryRecord = countries[place.country];
    for (const bloc of record.blocs ?? []) seen.add(bloc);
  }
  return (Object.keys(blocLabels) as BlocId[]).filter((bloc) => seen.has(bloc));
}

/**
 * Does this event match a place filter? Accepts a country code, a subdivision code,
 * a continent id or a bloc id, so one control can offer "United States", "Texas",
 * "Europe" and "European Union" without the caller knowing which level it got.
 */
export function matchesPlace(places: Place[], filter: string): boolean {
  if (!filter || filter === "all") return true;
  if (places.some((place) => place.country === filter)) return true;
  if (places.some((place) => place.subdivision === filter)) return true;
  if (continentsOf(places).some((continent) => continent === filter)) return true;
  if (blocsOf(places).some((bloc) => bloc === filter)) return true;
  return false;
}
