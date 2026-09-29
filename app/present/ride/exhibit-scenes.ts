import * as T from "three";
import type { ExhibitKit } from "./exhibit-kit.ts";
import { formatPlace } from "../../../lib/places.ts";

const words = (value: string) => value.replaceAll("-", " ").toUpperCase();
const country = (k: ExhibitKit) => k.event.places.filter(p => p.country !== "XX").map(formatPlace).join(" / ") || "GLOBAL";
function stateCard(k: ExhibitKit, text = words(k.design.state), x = 0, z = 9.7) {
  k.box(x, 2.35, z, 16, 2.5, .4, k.m.brass);
  k.label(text, x, 2.35, z + .22, 15.5, 2.08);
  k.mark(`state:${k.design.state}`);
}
function shelf(k: ExhibitKit, x: number, z: number, width = 10) {
  for (const y of [3, 7, 11]) { k.box(x, y, z, width, .28, 3, k.m.wood); k.books(x - width / 2 + .5, y + .2, z, Math.floor(width / .8)); }
  for (const dx of [-width / 2, width / 2]) k.box(x + dx, 7, z, .3, 10, 3, k.m.brass);
}
function paperStack(k: ExhibitKit, x: number, y: number, z: number, count = 7) {
  for (let i = 0; i < count; i++) { const p = k.box(x, y + i * .06, z, 4, .045, 3, k.m.paper, 0); p.rotation.y = i * .02; }
}
function deskLamp(k: ExhibitKit, x: number, y: number, z: number) {
  k.cyl(x, y, z, 1.15, .16, k.m.brass);
  k.tube([[x, y, z], [x, y + 3.5, z], [x + 1, y + 4.5, z], [x + 2, y + 3.7, z]], .09, k.m.brass);
  k.box(x + 2, y + 3.5, z, 2.5, .7, 1.5, k.m.green, .3);
  k.box(x + 2, y + 3.13, z, 2.1, .06, 1.2, k.m.glow);
}
function envelope(k: ExhibitKit, x: number, y: number, z: number, scale = 1) {
  k.box(x, y, z, 4 * scale, 2.6 * scale, .12, k.m.paper);
  k.tube([[x - 2 * scale, y + 1.3 * scale, z + .07], [x, y - .1, z + .09], [x + 2 * scale, y + 1.3 * scale, z + .07]], .035, k.m.cream);
  k.box(x + 1.3 * scale, y + .7 * scale, z + .09, .6 * scale, .6 * scale, .025, k.m.blue, 0);
}
function stamp(k: ExhibitKit, x: number, y: number, z: number, text: string, positive = false) {
  k.box(x, y, z, 5, .35, 3, k.m.ink);
  k.cyl(x, y + .7, z, .65, 1.1, k.m.wood);
  k.sphere(x, y + 1.3, z, .75, k.m.wood).scale.y = .6;
  const label = k.label(text, x, y + .23, z + 2.5, 5.5, 2, { bg: positive ? "#285c4b" : "#6f3428", size: 100 }); label.rotation.x = -Math.PI / 2;
}
function chair(k: ExhibitKit, x: number, z: number, rotation = 0) {
  const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; k.static.add(g);
  k.box(0, 2.8, 0, 2.8, .65, 2.8, k.m.ink, .2, g);
  k.box(0, 4.7, -1.2, 2.8, 3, .5, k.m.panel, .2, g);
  for (const dx of [-1, 1]) for (const zz of [-.9, .9]) k.box(dx, 1.5, zz, .16, 2.5, .16, k.m.brass, 0, g);
}

export function archiveScene(k: ExhibitKit) {
  const { motif } = k.design;
  k.floor("workshop"); k.desk(-2, 3, 23); shelf(k, -10, -9, 10); deskLamp(k, -12, 6.25, 1); paperStack(k, -8, 6.3, 5);
  const names: Record<string, string> = {
    "blind-signature": "BLIND SIGNATURES\nSigning without seeing the message",
    mint: "DIGICASH\nElectronic cash\nA central issuer",
    postage: "HASHCASH\nProof of work\nComputational postage",
    "distributed-ledger": "b-money\nA distributed ledger proposal",
    "reusable-token": "RPOW\nReusable proofs of work",
    "proof-chain": "BIT GOLD\nA chain of proofs",
    whitepaper: "Bitcoin: A Peer-to-Peer\nElectronic Cash System\nSatoshi Nakamoto",
  };
  k.folio(4.8, 10.7, -1.6, names[motif] ?? k.event.title);
  k.label(k.event.actors.join(" / "), -4, 14.1, -10.9, 18, 1.4);
  if (motif === "blind-signature") {
    envelope(k, -4, 9.7, .6, 1.7); stamp(k, -4, 6.6, 4, "SEALED"); k.mark("sealed-message-and-signature");
  } else if (motif === "postage") {
    envelope(k, -4.5, 10, .5, 1.7);
    for (let i = 0; i < 5; i++) k.cyl(-8 + i * 1.1, 6.9, 4, .4, .7 + i * .2, k.m.steel);
    stamp(k, -4, 6.8, 4, "WORK", true); k.mark("computational-postage");
  } else if (motif === "mint") {
    k.box(-5, 9.4, .4, 5.5, 5.7, 3, k.m.ink, .25); k.coin(-5, 10, 2, 1.6, "eCash");
    k.box(-5, 7.6, 2, 3.5, .25, .2, k.m.brass); k.mark("central-mint");
  } else if (motif === "whitepaper") {
    for (let i = 0; i < 3; i++) {
      k.box(-8 + i * 3, 9.3, .4, 2, 2, 2, k.m.brass, .12);
      if (i < 2) k.tube([[-7 + i * 3, 9.3, .4], [-6 + i * 3, 9.3, .4]], .07);
    }
    k.mark("whitepaper-and-proof-chain");
  } else {
    const count = motif === "distributed-ledger" ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const x = -8 + i * 2.7;
      k.box(x, 8.5 + (i % 2), 1, 2, 2, 2, motif === "proof-chain" ? k.m.brass : k.m.steel);
      if (i) k.tube([[x - 2.7, 8.5 + ((i - 1) % 2), 1], [x, 8.5 + i % 2, 1]], .08);
    }
    if (motif === "reusable-token") k.ring(-5, 10, 2, 3, .16, k.m.green);
    k.mark(motif);
  }
  k.plant(14, 7); stateCard(k, `${k.event.date.slice(0, 4)}  /  RESEARCH & PRECURSORS`);
}

export function computerScene(k: ExhibitKit) {
  const { motif } = k.design, { m, event } = k;
  k.floor("workshop"); k.desk(); shelf(k, 10, -9, 8); deskLamp(k, -11, 6.2, 0);
  const headings: Record<string, string> = { mail: "CORRESPONDENCE", domain: "bitcoin.org", repository: "SOURCEFORGE", client: "Running bitcoin", transaction: "PEER → PEER", forum: "BITCOIN FORUM", wiki: "BITCOIN WIKI", release: "SOFTWARE RELEASE" };
  const short = event.slug === "hodl-post-written" ? "I AM HODLING" : headings[motif];
  k.monitor(-3.5, 9.7, 0, `${short}\n${event.date}\n${event.actors[0] ?? "Bitcoin"}`);
  k.keyboard(-3.5, 6.3, 4.5);
  k.box(4, 9, 0, 3.4, 5.6, 5, m.cream, .18);
  for (let i = 0; i < 3; i++) k.box(4, 10.7 - i * .55, 2.52, 2.75, .2, .06, m.ink, 0);
  for (let i = 0; i < 8; i++) k.box(4, 7.1 + i * .15, 2.52, 2.5, .04, .03, m.ink, 0);
  k.sphere(5, 9, 2.58, .12, m.glow);
  k.tube([[4, 6.2, -2], [5, 4, -4], [-2, 3, -4], [-3, 6, -2]], .07, m.edge);
  if (motif === "transaction") {
    k.monitor(10.6, 9.4, -6.8, event.slug.includes("fiat") ? "FIAT\nEXCHANGE" : "RECEIVING\nNODE", false);
    k.tube([[-3, 13, -1], [0, 15, -3], [5, 15, -5], [10.6, 12.2, -6.8]], .12, m.glow);
    k.coin(3.5, 14.5, -4, 1, event.slug.includes("fiat") ? "USD" : "10 BTC"); k.mark("two-connected-workstations");
  } else if (motif === "mail") {
    envelope(k, 8.5, 8.2, 4, 1.4); envelope(k, -9, 13, -7, 1.1); k.mark("correspondence-envelopes");
  } else if (motif === "release" || motif === "repository") {
    k.box(9, 7.8, 2.4, 4.2, 3.2, .4, m.ink);
    k.box(9, 8.5, 2.65, 2.7, 1.5, .1, m.steel);
    k.label(event.title.replace(/^Bitcoin(?: Core|-Qt)? /, ""), 9, 7.1, 2.7, 3.5, .9, { size: 120 });
    k.mark("release-media");
  } else if (motif === "domain") {
    k.framed("bitcoin.org\nDOMAIN REGISTRATION", 9.8, 9.5, -3.3, 8, 4, true); k.mark("domain-certificate");
  } else { paperStack(k, 9, 6.3, 3); k.books(-11, 6.2, -1, 3); k.mark(motif); }
  stateCard(k, words(k.design.state));
}

export function genesisScene(k: ExhibitKit) {
  k.floor("workshop"); k.desk(-7, 3, 15); k.monitor(-8, 9.5, 1, "BITCOIN\nBLOCK 0\n50 BTC"); k.keyboard(-8, 6.3, 4.6);
  k.folio(8, 10.8, -3, "The Times 03/Jan/2009\nChancellor on brink of\nsecond bailout for banks");
  k.box(6, 1.5, 4, 8, 2.2, 7, k.m.ink, .2); k.box(6, 5.1, 4, 5.8, 5.2, 5.2, k.m.brass, .18);
  for (let i = 0; i < 6; i++) k.box(6, 3.1 + i * .72, 6.62, 5.4, .035, .025, k.m.cream, 0);
  k.label("000000000019d6689c…\nGENESIS / BLOCK 0", 6, 5, 6.67, 5.3, 2.9, { bg: "#a17534", size: 92 });
  k.mark("genesis-block-and-newspaper"); stateCard(k, "03 JANUARY 2009  /  BLOCK ZERO");
}

export function miningScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("workshop");
  const off = state === "closed", gpu = motif === "gpu";
  const miningUnit = (x: number, z: number, on: boolean, rows: number) => {
    if (k.event.date < "2013" && !gpu) {
      k.desk(x, z + 1, 7.4, 4.2); k.monitor(x, 8, z, "CPU MINER\nPROOF OF WORK"); k.keyboard(x, 4.7, z + 3.5, .7); k.mark("pre-asic-cpu-miner");
    } else k.server(x, z, on, rows, gpu);
  };
  if (motif === "migration") {
    k.server(-9, -5, false, 3); k.server(10, -5, true, 4);
    for (let i = 0; i < 3; i++) {
      k.box(-3 + i * 3.5, 1.8, 2 + i % 2 * 2, 3, 2.7, 4, m.wood);
      for (const dx of [-1, 1]) k.box(-3 + i * 3.5 + dx, 1.8, 4.04 + i % 2 * 2, .18, 2.7, .06, m.brass, 0);
    }
    k.tube([[-7, 10, -3], [-3, 13, -2], [3, 13, -2], [9, 11, -3]], .16, m.blue);
    k.label("RELOCATION\nDIFFICULTY −28%", 0, 13, -9, 16, 3); k.mark("relocation-crates");
  } else if (["pool", "peer-pool", "split-reward", "concentration"].includes(motif)) {
    for (let i = 0; i < 3; i++) miningUnit(-10 + i * 10, -6, true, i === 1 && motif === "concentration" ? 5 : 3);
    if (motif === "peer-pool") {
      k.tube([[-10, 11, -5], [0, 14, -5], [10, 11, -5]], .1, m.blue);
      k.tube([[-10, .8, -3], [-10, .8, 5], [10, .8, 5], [10, .8, -3]], .1, m.blue);
      for (const x of [-10, 0, 10]) { k.box(x, 1.5, 5, 4, 2, 3, m.panel); k.coin(x, 3.4, 5, .85, ""); }
      k.mark("decentralized-pool-no-central-hub");
    } else {
      for (const x of [-10, 0, 10]) k.tube([[x, .7, -3], [x, .7, 2], [0, 1, 4]], .09, m.blue);
      k.box(0, 3.2, 4, 7, 4.5, 5, m.panel); k.coin(0, 3.4, 6.57, 1.4);
      if (motif === "split-reward") for (const x of [-9, 9]) { k.box(x, 1.2, 5, 4, 1.2, 3, m.wood); k.coin(x, 2.9, 5, .8, ""); k.tube([[0, 3, 4], [x / 2, 2.5, 5], [x, 2, 5]], .1, m.brass); }
    }
    if (motif === "concentration") {
      k.label("HASHRATE CONCENTRATION\nNOT A CONSENSUS RULE CHANGE", 0, 13.5, -9, 22, 3); k.mark("hashrate-warning");
    } else { k.label("SHARED WORK · SHARED REWARDS", 0, 13.5, -9, 23, 2); k.mark("pool-reward-distribution"); }
  } else if (motif === "supply") {
    k.server(-10, -5, true, 4);
    for (let col = 0; col < 7; col++) for (let row = 0; row < 3; row++) k.box(-1 + col * 1.9, 1.1 + row * 1.1, 1, 1.55, .9, 2.3, col === 6 ? m.steel : m.brass);
    k.framed("20,000,000 BTC\nMINED SUPPLY MILESTONE", 5, 12, -7, 18, 4); k.mark("supply-display");
  } else {
    miningUnit(-8, -4, !off, gpu ? 3 : 5); miningUnit(1, -4, !off, gpu ? 3 : 5);
    if (motif === "difficulty") {
      k.ring(11, 9, -1, 3, .25, m.brass); k.box(11, 9, -1, .14, 5, .1, m.red).rotation.z = -.8; k.mark("difficulty-gauge");
    } else if (motif === "asic") {
      k.box(10, 2, 2, 6, 3, 5, m.wood); k.box(10, 4.4, 2, 4.7, 1.6, 3.4, m.steel);
      for (let i = 0; i < 11; i++) k.box(8 + i * .4, 5.5, 2, .13, 1.2, 3.1, m.steel, 0);
      k.mark("shipping-crate-and-heatsink");
    } else if (motif === "shutdown" || motif === "permit") {
      k.folio(11, 8, -2, `${country(k)}\n${words(state)}\nMINING POLICY`);
      if (off || state === "restricted") k.barrier(); else k.mark("proposal-not-a-shutdown");
      k.mark(off ? "power-disconnected" : "mining-policy-document");
    } else { k.desk(10, 3, 7, 4.5); k.monitor(10, 8.1, 1, k.event.slug.includes("opencl") ? "OPENCL\nPUBLIC MINER" : "GPU\nPROOF OF WORK", true); k.mark("graphics-card-mining"); }
  }
  stateCard(k, `${words(motif)}  /  ${words(state)}`, 0, 11.7);
}

export function halvingScene(k: ExhibitKit) {
  const index = ["first", "second", "third", "fourth"].indexOf(k.design.motif);
  k.floor("workshop"); k.server(-12, -6, true, 4, index === 0);
  const [before, after] = k.design.state.split(" → ");
  k.box(3, 2, 0, 20, 3, 9, k.m.ink);
  for (const x of [-3, 10]) {
    k.cyl(x, 4.1, 1, 3.3, .6, k.m.steel);
    const count = x < 0 ? 8 : 4;
    for (let i = 0; i < count; i++) k.cyl(x, 4.6 + i * .55, 1, 2.5, .43, k.m.brass);
  }
  k.label(`${before} BTC`, -3, 3, 4.6, 7, 1.6); k.label(`${after} BTC`, 10, 3, 4.6, 7, 1.6);
  for (const z of [-4, 4]) k.box(3.5, 6.7, z, .18, 9, .18, k.m.blue);
  k.box(3.5, 11.2, 0, .18, .18, 8, k.m.blue);
  k.framed(`HALVING ${index + 1}\n${k.design.state} BTC\nBLOCK ${k.event.blockHeight?.toLocaleString("en-US") ?? (index + 1) * 210000}`, 4, 12.8, -8, 20, 4.1);
  k.mark("subsidy-halved-not-total-supply"); stateCard(k, "NEW BLOCK SUBSIDY / NOT THE TOTAL SUPPLY");
}

export function protocolScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("gallery");
  k.box(0, 1.2, 0, 29, 1.6, 16, m.ink); k.box(0, 2.05, 0, 28.7, .18, 15.7, m.brass);
  const block = (x: number, y: number, z: number, color = m.steel, label = "") => {
    k.box(x, y, z, 3.3, 3.3, 3.3, color, .15);
    for (let i = 0; i < 3; i++) k.box(x, y - .9 + i * .9, z + 1.67, 2.6, .055, .025, m.cream, 0);
    if (label) k.label(label, x, y, z + 1.71, 2.8, 1.3, { size: 220 });
  };
  if (motif === "seed") {
    for (let i = 0; i < 12; i++) {
      const x = -9 + i % 4 * 6, y = 4.2 + Math.floor(i / 4) * 3.3;
      k.box(x, y, 0, 5.2, 2.6, .65, m.paper); k.label(`WORD ${String(i + 1).padStart(2, "0")}`, x, y, .34, 4.8, 1.8, { bg: "#eee3cb", color: "#314a44", size: 150 });
    }
    k.mark("twelve-placeholder-words-never-a-real-seed");
  } else if (motif === "taproot" || motif === "key-tree") {
    block(0, 4.1, 3, m.brass, motif === "taproot" ? "ROOT" : "SEED");
    for (let i = 0; i < 4; i++) {
      const x = -10.5 + i * 7;
      k.tube([[0, 5, 2], [x * .5, 8, 0], [x, 11, -2]], .13, state === "active" ? m.glow : m.steel);
      block(x, 11.5, -2, state === "proposed" ? m.cream : m.green, motif === "taproot" ? "SCRIPT" : "KEY");
    }
    if (state === "locked-in") k.ring(0, 8.5, 2.5, 2, .25, m.brass);
    k.mark(`${motif}-tree`);
  } else if (motif === "split" || motif === "sidechain") {
    block(-10, 5, 1); block(-4, 5, 1); k.tube([[-10, 5, 1], [-4, 5, 1]], .15);
    for (const branch of [-1, 1]) {
      const y = branch < 0 ? 5 : 10;
      k.tube([[-4, 5, 1], [1, y, 0], [8, y, 0]], .13, branch > 0 && state === "cancelled" ? m.red : m.brass);
      block(3, y, 0, branch < 0 ? m.brass : m.blue); block(10, y, 0, branch < 0 ? m.brass : m.blue);
    }
    if (state === "rejoined") k.tube([[10, 10, 0], [13, 8, 1], [10, 5, 0]], .18, m.green);
    if (state === "cancelled") for (const a of [-.7, .7]) k.box(8, 10, 2, .32, 5, .22, m.red).rotation.z = a;
    k.mark(state === "cancelled" ? "cancelled-branch" : state === "rejoined" ? "rejoined-branches" : "separate-chains");
  } else if (motif === "segwit") {
    const separated = state === "active" || state === "user-activated";
    block(-7, 6, 1, m.steel, "TX"); block(-2, 6, 1, m.steel, "TX");
    block(separated ? 8 : 3, separated ? 10 : 6, 1, m.blue, "WITNESS");
    k.tube([[-6, 4, 1], [0, 3, 1], [8, separated ? 8 : 4, 1]], .12, m.brass);
    for (let i = 0; i < 10; i++) k.box(-11 + i * 2.4, 13.4, -5, 1.4, .7, .5, state === "signaling" && i > 5 ? m.steel : m.green);
    if (state === "locked-in") k.ring(8, 11, 1, 1.5, .22);
    k.mark(separated ? "separate-witness-compartment" : "segwit-activation-stage");
  } else if (motif === "clock") {
    k.ring(0, 9, 0, 5.2, .28); k.box(0, 9, 0, .2, 7, .3, m.brass).rotation.z = -.5;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; k.sphere(Math.cos(a) * 4.5, 9 + Math.sin(a) * 4.5, .1, .2, m.steel); }
    block(-10, 5, 0); block(10, 5, 0); k.mark("relative-timelock-clock");
  } else if (motif === "overflow" || motif === "patch") {
    for (let i = 0; i < 4; i++) block(-10 + i * 6.5, 6, 0, i === 2 ? m.red : m.steel, i === 2 ? "BUG" : "VALID");
    k.tube([[-4, 6, 0], [0, 11, 0], [6, 11, 0], [10, 6, 0]], .2, m.green);
    k.framed("VALIDATION REPAIRED", 0, 13.5, -6, 18, 2); k.mark("validation-repair-not-exchange-collapse");
  } else {
    for (let i = 0; i < 4; i++) { block(-10 + i * 6.7, 6, 1, i === 3 ? m.brass : m.steel, motif === "height" ? String((k.event.blockHeight ?? 227931) + i - 3) : ["INPUT", "SCRIPT", "CHECK", "OUTPUT"][i]); if (i) k.tube([[-10 + (i - 1) * 6.7, 6, 1], [-10 + i * 6.7, 6, 1]], .13); }
    if (motif === "data") for (let i = 0; i < 8; i++) k.box(-6 + i * 1.7, 10.5, -2, 1, 3 + i % 2, 1, m.blue);
    else k.framed(k.event.bip ? `BIP ${k.event.bip}` : words(motif), 0, 12.8, -7, 17, 2.5);
    k.mark(motif);
  }
  stateCard(k, `${words(motif)} / ${words(state)}`);
}

export function lightningScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("gallery"); k.box(0, 1.2, 0, 29, 1.6, 17, m.ink);
  const count = motif === "relay" ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const x = -11 + i * 22 / (count - 1), y = i % 2 ? 10 : 6;
    k.box(x, y, 0, 4.4, 4.4, 3.2, m.panel, .25); k.ring(x, y, 1.7, 1.55, .16, m.brass);
    k.label(i === 0 ? "A" : i === count - 1 ? "B" : "NODE", x, y, 1.75, 2.5, 1.8, { size: 260 });
    if (i) {
      const prevX = -11 + (i - 1) * 22 / (count - 1), prevY = (i - 1) % 2 ? 10 : 6;
      k.tube([[prevX, prevY, 0], [(prevX + x) / 2, 12, 0], [x, y, 0]], motif === "wide-channel" ? .45 : .16, state === "proposed" ? m.steel : m.glow);
      k.tube([[prevX, prevY - 1, .3], [(prevX + x) / 2, 10.5, .3], [x, y - 1, .3]], .07, m.blue);
    }
    k.cyl(x, y / 2, 0, .18, y, m.brass);
  }
  if (motif === "assets") k.folio(0, 8, 5, "TARO\nTAPROOT ASSETS\nPROPOSAL");
  if (motif === "relay") k.coin(0, 13.3, 1, 1.4, "TORCH");
  k.mark(motif === "wide-channel" ? "expanded-channel-capacity" : motif === "relay" ? "multi-hop-payment-relay" : "off-chain-payment-channels");
  stateCard(k, `${words(motif)} / ${words(state)}`);
}

export function marketScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("gallery");
  const down = ["low", "crash", "liquidation"].includes(state);
  const heights = down ? [12, 11, 12.5, 8, 6, 6.5, 3] : motif === "rate" ? [4, 4.5, 5, 5.5, 6, 6.5, 7] : [2, 3.5, 3, 6, 5, 9, 13];
  const points: [number, number, number][] = [];
  for (let i = 0; i < heights.length; i++) {
    const x = -12 + i * 4, h = heights[i];
    k.box(x, h / 2 + .6, -3, 2.2, h, 3, down ? m.red : i === 6 ? m.brass : m.steel);
    k.box(x, .55, -3, 2.8, .3, 4, m.ink);
    points.push([x, h + 1, -.9]);
  }
  k.tube(points, .13, down ? m.red : m.brass);
  k.desk(-1, 6, 25, 3.6);
  k.label("DIRECTIONAL SCULPTURE · NOT A PRICE SERIES", -1, 3.8, 10.05, 24, 1, { size: 42 });
  if (motif === "leverage") {
    for (let i = 0; i < 6; i++) k.box(-8 + i * 3, 5.5, 6, 1.3, 4, .6, m.cream).rotation.z = -.1 - i * .15;
    k.mark("liquidation-dominoes");
  } else {
    k.framed(`${words(motif)}\n${down ? "DRAWDOWN / MARKET LOW" : state === "listed" ? "INDEX INCLUSION" : "MARKET MILESTONE"}`, 0, 7, 4, 16, 4);
    k.coin(11, 7, 6, 1.7, motif === "index" ? "INDEX" : "BTC");
  }
  k.mark(down ? "descending-market-sculpture" : "ascending-market-sculpture");
}

export function exchangeScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m, event } = k;
  k.floor("office");
  const notTrading = ["filed", "rejected", "approved", "announced", "closed"].includes(state);
  const institution = event.actors.slice(0, 2).join(" / ");
  k.framed(`${institution}\n${words(motif)} / ${words(state)}`, 0, 12.8, -10.9, 26, 4);
  k.desk(-1, 1, 26, 5.2);
  k.monitor(-8, 8.9, -.2, `${motif.includes("etf") ? "FUND SHARES" : "BTC / USD"}\n${notTrading ? words(state) : "MARKET ACCESS"}`, true);
  k.keyboard(-8, 5.7, 3.8, .85);
  if (motif.includes("etf") || motif === "trust") {
    k.folio(3, 9.8, -.4, `${words(motif)}\n${words(state)}\n${country(k)}`);
    k.safe(11, 4.6, -5, false, .67);
    const bridge = motif === "futures-etf" ? m.blue : m.brass;
    k.tube([[3, 5, 1], [6, 4, 3], [11, 3, 0]], .11, bridge);
    if (state === "rejected") { stamp(k, 8, 5.75, 3.8, "REJECTED"); k.mark("rejected-application-no-trading"); }
    else if (state === "filed" || state === "approved") { stamp(k, 8, 5.75, 3.8, words(state), state === "approved"); k.mark("application-before-trading"); }
    else k.mark(motif === "futures-etf" ? "fund-holds-futures-not-spot" : "fund-share-and-custody-link");
  } else if (["futures", "delivery", "options"].includes(motif)) {
    k.folio(2, 9.8, -.4, `${words(motif)}\n${motif === "delivery" ? "PHYSICAL DELIVERY" : "DERIVATIVE CONTRACT"}\n${words(state)}`);
    k.framed("EXPIRY\nCONTRACT CALENDAR", 11, 8.2, 2.5, 5, 4.7, true);
    if (motif === "delivery") { k.box(11, 2, 6.5, 5, 2.8, 4, m.wood); k.coin(11, 2.4, 8.6, .9); }
    if (motif === "options") { k.label("CALL / PUT", 2, 7.4, 2, 5.5, 1.2); k.mark("options-contract"); }
    if (state === "closed") k.barrier();
    k.mark(`${motif}-settlement`);
  } else if (motif === "listing") {
    k.monitor(4, 8.9, -.2, "COIN\nPUBLIC LISTING", true);
    k.cyl(11, 7.6, 3, 1.7, 2.3, m.brass, k.static, .7); k.cyl(11, 6.3, 3, 2, .3, m.wood);
    k.mark("listing-bell");
  } else {
    k.monitor(3, 8.9, -.2, motif === "handover" ? "OWNERSHIP\nTRANSFER" : "ORDER BOOK\nBUY / SELL", true);
    k.keyboard(3, 5.7, 3.8, .85);
    if (motif === "handover") { k.folio(11, 9, 4, "OWNERSHIP\nTRANSFER"); k.mark("ownership-documents"); }
    else { k.books(10, 5.6, 1, 4); k.mark("trading-terminals"); }
  }
  chair(k, -8, 6); chair(k, 3, 6); k.plant(-14, -7);
  stateCard(k, `${words(motif)} / ${words(state)}`, 0, 11.8);
}

export function custodyScene(k: ExhibitKit) {
  k.floor("office"); k.safe(-5, 6.2, -2, true);
  k.desk(9, 3, 10, 4.3);
  if (k.design.motif === "peg") {
    k.coin(8, 9, 1, 2.5, "USD₮"); k.coin(13, 9, 1, 1.5, "USD");
    k.tube([[8, 9, 1], [10, 12, 1], [13, 9, 1]], .12, k.m.blue);
    k.label("DOLLAR-DENOMINATED TOKEN\nNOT BITCOIN ISSUANCE", 9, 12.6, -8, 12, 2.8); k.mark("dollar-token-peg");
  } else {
    k.folio(9, 9.6, 1, `${k.design.motif === "charter" ? "TRUST / BANK CHARTER" : "DIGITAL ASSET CUSTODY"}\n${country(k)}`);
    k.mark("custody-controls");
  }
  k.box(-5, 13.2, -2, 11, 1.2, 7, k.m.wood); k.books(-9, 13.9, -2, 12);
  k.plant(14, 8); stateCard(k);
}

export function securityScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("office");
  if (motif === "account" || motif === "data") {
    k.desk(); k.monitor(-7, 9.5, 0, motif === "data" ? "CUSTOMER DATA\nEXPOSED" : "ACCOUNT\nCOMPROMISED", true);
    k.keyboard(-7, 6.3, 4);
    for (let i = 0; i < 6; i++) {
      const x = 3 + i % 3 * 3.6, y = 8 + Math.floor(i / 3) * 3.3;
      k.box(x, y, 1, 3.1, 2.5, .16, m.paper);
      k.sphere(x - .7, y + .2, 1.12, .45, m.blue);
      for (let j = 0; j < 3; j++) k.box(x + .5, y + .6 - j * .4, 1.1, 1.1, .07, .03, m.steel, 0);
    }
    k.tube([[-3, 9, 1], [0, 12, 1], [6, 12, 1]], .12, m.red); k.mark(motif === "data" ? "identity-records-not-coin-theft" : "compromised-social-account");
  } else {
    k.safe(-5, 6.3, -2, state !== "recovered");
    if (motif === "server") k.server(10, -5, false, 5);
    else {
      k.box(10, 3, 2, 8, 5, 6, m.panel);
      const asset = motif === "ether" ? "ETH" : motif === "nem" ? "NEM" : "BTC";
      k.coin(10, 7.7, 2, 2.5, asset);
      k.label(state === "recovered" ? "RECOVERED FUNDS" : `${asset} / STOLEN ASSETS`, 10, 3.2, 5.05, 7, 2.3);
      k.mark(`affected-asset:${asset}`);
    }
    const start = state === "recovered" ? 10 : -5, end = state === "recovered" ? -5 : 10;
    k.tube([[start, 9, 2], [0, 13, 2], [end, 10, 2]], .14, state === "recovered" ? m.green : m.red);
    k.mark(state === "recovered" ? "funds-return-to-custody" : "funds-leave-custody");
  }
  stateCard(k, `${words(motif)} / ${words(state)}`);
}

export function insolvencyScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("office");
  if (motif === "peg") {
    k.box(0, 2.4, 0, 25, 3.6, 12, m.ink);
    k.cyl(0, 7, 0, .3, 9, m.brass);
    const beam = k.box(0, 10.8, 0, 20, .25, .3, m.brass); beam.rotation.z = -.26;
    k.coin(-9, 10.4, 1, 2.5, "USD"); k.coin(9, 5.8, 1, 2.5, "UST");
    k.tube([[-7, 12.7, 0], [-7, 10.2, 0]], .06); k.tube([[8, 8.6, 0], [8, 5.8, 0]], .06);
    k.label("BROKEN PEG\nTERRA / UST / LUNA", 0, 3, 6.1, 18, 2.5); k.mark("unbalanced-stablecoin-peg");
  } else if (motif === "withdrawals" || motif === "deposits") {
    k.safe(-7, 6.2, -3, false); k.desk(8, 3, 11, 4.5); k.monitor(8, 8.3, 1, motif === "deposits" ? "NEW YUAN DEPOSITS\nHALTED" : "WITHDRAWALS\nPAUSED", true);
    k.barrier(); k.mark(motif === "deposits" ? "yuan-deposit-channel-halted" : "withdrawals-blocked-not-yet-bankrupt");
  } else if (state === "repaying") {
    k.safe(0, 6.2, -5, true, .9);
    for (const x of [-11, 0, 11]) {
      k.box(x, 2.1, 7, 5, 3, 3, m.wood); k.label("CREDITOR", x, 2.1, 8.55, 4.5, 1.3);
      k.tube([[0, 5, 0], [x * .6, 3, 3], [x, 3.8, 7]], .14, m.green); k.coin(x, 4.7, 7, .7, "");
    }
    k.mark("creditor-repayments");
  } else if (motif === "ponzi") {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4 - row; col++) k.box(-7 + row * 2.3 + col * 4.6, 2 + row * 2.5, -2, 4, 2.1, 4, row === 3 ? m.red : m.wood);
    k.box(10, 2, 3, 4, 3, 5, m.cream).rotation.z = .3; k.barrier(); k.mark("unsustainable-payout-pyramid");
  } else {
    if (motif === "mine") k.server(-11, -5, false, 4); else shelf(k, -11, -8, 8);
    k.desk(3, 2, 21, 4.8); k.folio(2, 10, 0, `${k.event.actors[0] ?? "CREDITOR PROCEEDINGS"}\n${words(state)}`);
    for (let i = 0; i < 3; i++) {
      k.box(10, 5.6 + i * 1.3, 3, 5.5, 1.1, 4, m.cream);
      k.label(i === 0 ? "CLAIMS" : i === 1 ? "ASSETS" : "CREDITORS", 10, 5.6 + i * 1.3, 5.02, 4.4, .55, { bg: "#d5c3a0", color: "#243a3b", size: 95 });
    }
    stamp(k, -5, 5.4, 3, words(state)); k.mark("creditor-files-not-physical-collapse");
  }
  stateCard(k, words(state), 0, 11.8);
}

export function lawScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("civic"); k.desk(0, 2, 26, 4.8);
  k.folio(-6, 10, -.6, `${country(k)}\n${words(motif)}\n${words(state)}`);
  deskLamp(k, -12, 5.3, 2); paperStack(k, -10, 5.3, 5);
  const restrictive = ["restricted", "closed", "prohibited", "frozen"].includes(state);
  if (motif.includes("gate") || motif === "sanctions") {
    k.box(7, 8.2, -2, 8, 6, 4, m.ink); k.label(words(motif), 7, 9, .05, 7.3, 2);
    for (const x of [5, 7, 9]) k.box(x, 6.8, .1, .25, 2.2, .1, m.steel);
    k.barrier(0, 8, !restrictive); k.mark(restrictive ? "restricted-access" : "restored-access");
  } else if (motif === "tender") {
    // A proposal has only a document. Adoption adds the tender emblem; removal
    // crosses it out, and voluntary acceptance adds a separate choice mechanism.
    if (!["announced", "agreement"].includes(state)) k.coin(8, 10, 0, 3.1);
    if (state === "removed") {
      for (const a of [-.7, .7]) k.box(8, 10, .5, .4, 8, .22, m.red).rotation.z = a;
      k.mark("legal-tender-status-removed");
    } else if (state === "voluntary") {
      for (const [x, text] of [[5, "ACCEPT"], [11, "DECLINE"]] as const) { k.box(x, 6, 3, 4.8, .5, 3, m.panel); k.label(text, x, 6.4, 4.1, 4.1, 1.2); }
      k.mark("merchant-choice-not-mandatory");
    } else { stamp(k, 8, 5.4, 4, words(state), state === "passed"); k.mark(`tender-${state}`); }
  } else if (motif === "mica" || motif === "house-bill" || motif === "committee-bill") {
    const stages = motif === "mica" ? ["AGREEMENT", "ADOPTED", "APPLIES", "DEADLINE"] : ["COMMITTEE", "HOUSE", "SENATE", "LAW"];
    const active = motif === "mica" ? ["agreement", "adopted", "effective", "deadline"].indexOf(state) : state === "advanced" ? 0 : 1;
    for (let i = 0; i < 4; i++) {
      const y = 6.4 + i * 2.2;
      k.box(8, y, -.6, 9, 1.8, 1.1, i <= active ? m.green : m.ink);
      k.label(stages[i], 8, y, 0, 8.4, 1.3, { size: 115 });
    }
    if (motif !== "mica") k.label("NOT YET ENACTED", 8, 5.5, 4.2, 8, 1.3, { color: "#e0ab86" });
    k.mark(`legislative-stage:${active}`);
  } else if (["tax", "accounting", "reporting", "bank-standard"].includes(motif)) {
    k.framed(motif === "tax" ? "PROPERTY\nTAX TREATMENT" : words(motif), 8, 10, 0, 8, 5, true);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) k.box(5 + col * 1.5, 5.5, 2 + row, 1, .3, .7, col === 3 ? m.brass : m.cream);
    k.mark("ledger-and-reporting");
  } else if (motif === "custody" || motif === "custody-rule" || motif === "investment") {
    k.safe(9, 9, -1, state === "permitted" || state === "authorized", .6);
    stamp(k, 8, 5.4, 4, words(state), ["removed", "rescinded", "permitted", "authorized"].includes(state)); k.mark(`custody-rule-${state}`);
  } else if (motif === "stablecoin" || motif === "issuance" || motif === "token-sale") {
    k.coin(8, 10.5, 0, 2.6, motif === "stablecoin" ? "USD" : "TOKEN");
    stamp(k, 8, 5.4, 4, words(state), state === "enacted"); k.mark("token-policy-not-bitcoin-tender");
  } else {
    shelf(k, 9, -7, 9); stamp(k, 7, 5.4, 4, words(state), ["enacted", "effective", "permitted"].includes(state));
    if (motif === "network") for (let i = 0; i < 3; i++) { k.box(4 + i * 3, 8, 2, 1.5, 1.5, 1.5, m.blue); if (i) k.tube([[1 + i * 3, 8, 2], [4 + i * 3, 8, 2]], .08); }
    k.mark(`policy:${motif}`);
  }
  stateCard(k, `${country(k)} / ${words(state)}`, 0, 11.7);
}

export function courtScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("civic");
  k.box(0, 2, -3, 28, 3, 12, m.wood);
  for (let x = -12; x <= 12; x += 4) { k.box(x, 4.5, 2.9, 3.4, 4, .35, m.panel); k.box(x, 4.5, 3.1, 2.9, 3.5, .1, m.ink); }
  k.box(0, 6.8, -1, 29, .6, 10, m.wood);
  k.folio(-7.5, 11.4, -1, `${country(k)}\n${words(motif)}\n${words(state)}`);
  k.cyl(5, 7.3, 1, 2, .5, m.wood); k.cyl(5, 9, 1, .55, 4, m.wood).rotation.z = -.6;
  k.cyl(6.1, 10.65, 1, .9, 2.8, m.brass).rotation.z = Math.PI / 2;
  if (motif === "seizure") {
    k.box(9, 8.6, -5, 7, 3, 4, m.cream); k.label("SEIZED\nEVIDENCE", 9, 8.6, -2.95, 6.5, 2, { bg: "#d4c4a5", color: "#713b2c" }); k.mark("evidence-under-custody");
  } else if (motif === "identity") {
    k.framed("IDENTITY CLAIM\nREJECTED BY THE COURT", 7, 13, -8, 14, 3); k.mark("identity-ruling-no-invented-portrait");
  } else if (motif === "bank-gate") { k.barrier(0, 8, true); k.mark("ban-overturned"); }
  else {
    paperStack(k, 10, 7.2, 1, 18); k.mark(motif === "charges" || motif === "complaint" ? "allegations-not-conviction" : "court-decision");
  }
  stateCard(k, state === "charged" ? "CHARGES / NOT A CONVICTION" : words(state), 0, 11.7);
}

function car(k: ExhibitKit, x: number, y: number, z: number) {
  const { m } = k;
  k.box(x, y, z, 11.4, 1.7, 5.2, m.cream, .65);
  k.box(x - 1.1, y + 1.45, z, 5.6, 1.8, 4.6, m.panel, .6);
  k.box(x - 1, y + 1.35, z + 2.34, 4.8, 1.25, .08, m.blue);
  for (const dx of [-3.8, 3.8]) for (const zz of [-2.5, 2.5]) {
    k.cyl(x + dx, y - .8, z + zz, 1.15, .6, m.edge).rotation.x = Math.PI / 2;
    k.cyl(x + dx, y - .8, z + zz + (zz > 0 ? .32 : -.32), .63, .04, m.steel).rotation.x = Math.PI / 2;
  }
  for (const zz of [-1.7, 1.7]) k.box(x + 5.75, y + .3, z + zz, .06, .3, .9, m.glow);
}
function gamepad(k: ExhibitKit, x: number, y: number, z: number) {
  k.box(x, y, z, 6, 1.2, 2.8, k.m.cream, .45);
  for (const dx of [-2.1, 2.1]) k.sphere(x + dx, y - .1, z + .8, 1.3, k.m.cream).scale.set(.65, .45, 1.2);
  k.box(x - 1.7, y + .66, z, 1.5, .12, .45, k.m.ink); k.box(x - 1.7, y + .67, z, .45, .12, 1.5, k.m.ink);
  for (let i = 0; i < 4; i++) k.cyl(x + 1.6 + Math.sin(i * 1.57) * .48, y + .7, z + Math.cos(i * 1.57) * .48, .16, .18, [k.m.red, k.m.green, k.m.blue, k.m.brass][i]);
}
function paymentTerminal(k: ExhibitKit, x: number, y: number, z: number, accepting: boolean) {
  k.box(x, y, z, 3.1, .7, 4, k.m.ink, .15);
  k.box(x, y + .5, z - .75, 2.7, .4, 1.8, accepting ? k.m.green : k.m.red);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) k.box(x - .75 + col * .75, y + .43, z + .3 + row * .65, .48, .15, .4, k.m.cream, 0);
}

export function commerceScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k, accepting = state !== "stopped";
  k.floor("workshop");
  k.box(0, 13.6, -5, 29, .6, 6, m.cream);
  for (let i = 0; i < 15; i++) k.box(-14 + i * 2, 13.56, -4.9, 1, .7, 6.1, accepting ? m.green : m.red);
  if (motif === "car") { car(k, -4, 3, 0); k.box(11, 3, 1, 4, 5, 4, m.ink); paymentTerminal(k, 11, 5.8, 1, accepting); k.mark("vehicle-payment-suspended"); }
  else {
    k.box(0, 3.4, 3, 26, 5.7, 8, m.ink, .18); k.box(0, 6.5, 3, 26.7, .55, 8.4, m.wood);
    for (let x = -10; x <= 10; x += 4) { k.box(x, 3.5, 7.1, 3.5, 4, .18, m.panel); k.box(x, 3.5, 7.2, 3, 3.5, .06, m.ink); }
    paymentTerminal(k, 9, 7.1, 3, accepting);
    if (motif === "pub") {
      k.box(-2, 8.7, -8, 24, .3, 3, m.wood);
      for (let i = 0; i < 12; i++) { k.cyl(-12 + i * 1.8, 9.6, -8, .35, 1.7, i % 2 ? m.green : m.brass); k.cyl(-12 + i * 1.8, 10.65, -8, .15, .45, m.ink); }
      for (const x of [-7, -2, 3]) { k.cyl(x, 7.6, 3, .65, 1.5, m.cream); k.ring(x + .75, 7.6, 3, .4, .12, m.brass).rotation.y = Math.PI / 2; }
      k.mark("pub-counter");
    } else if (motif === "games") { gamepad(k, -6, 7.5, 4); k.monitor(-3, 10, -3, accepting ? "GAME LIBRARY\nBTC ACCEPTED" : "BTC PAYMENTS\nSTOPPED", true); k.mark("game-controller"); }
    else if (motif === "computer" || motif === "publishing") { k.monitor(-5, 10.3, .3, motif === "publishing" ? "PUBLISH\nWITH BITCOIN" : "DIGITAL\nPURCHASES", true); k.keyboard(-5, 7, 4); k.mark(motif === "publishing" ? "publishing-workstation" : "digital-goods-counter"); }
    else if (motif === "parcels" || motif === "marketplace") {
      for (let i = 0; i < 5; i++) { k.box(-9 + i % 3 * 4.4, 8 + Math.floor(i / 3) * 3, 2 - Math.floor(i / 3) * 1.5, 3.8, 2.5, 3, m.cream); k.box(-9 + i % 3 * 4.4, 9.3 + Math.floor(i / 3) * 3, 2 - Math.floor(i / 3) * 1.5, .5, .03, 3, m.brass, 0); }
      k.mark("merchant-parcels");
    } else if (motif === "tender") {
      k.coin(-7, 9, 3, 2.1); k.coin(-1, 9, 3, 2.1, "USD"); k.framed(`${country(k)}\nLEGAL TENDER IN EFFECT`, 1, 10.4, -7, 16, 3); k.mark("bitcoin-and-dollar-checkout");
    } else { k.monitor(-4, 10, -1, "MERCHANT\nPAYMENT SERVICE", true); k.keyboard(-4, 7, 3.5); k.mark("merchant-payment-service"); }
  }
  if (!accepting) { k.barrier(); k.mark("bitcoin-payments-stopped"); }
  k.plant(-14, 9); stateCard(k, motif === "tender" ? "LEGAL TENDER / IN EFFECT" : accepting ? "BITCOIN PAYMENTS / OPEN" : "BITCOIN PAYMENTS / STOPPED", 0, 11.8);
}

export function treasuryScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("office"); k.safe(-8, 6.4, -3, ["buying", "selling"].includes(state), .95);
  k.desk(7, 3, 15, 4.5); k.folio(7, 9.7, .6, `${k.event.actors[0] ?? country(k)}\n${words(motif)}\n${words(state)}`);
  if (motif === "car") { car(k, 7, 1.9, 7); k.mark("automotive-treasury"); }
  else if (motif === "assessment") { stamp(k, 7, 5.1, 4, "REJECTED"); k.mark("assessment-rejected-no-purchase"); }
  else if (motif === "pension" || motif === "retirement") {
    k.framed(motif === "pension" ? "FUND SHARES\nDISCLOSED HOLDING" : "WORKPLACE PLAN\nOPTION ANNOUNCED", 8, 13, -9, 12, 3);
    k.mark("retirement-fund-not-direct-coin-display");
  } else { k.books(2, 4.9, 2, 6); paperStack(k, 11, 4.9, 4); k.mark(motif === "national" || motif === "state" ? "public-reserve-established" : "corporate-balance-sheet"); }
  if (["buying", "selling"].includes(state)) {
    const direction = state === "selling" ? 1 : -1;
    k.tube([[-7 * direction, 12, 2], [0, 14.2, 2], [7 * direction, 12, 2]], .14, state === "selling" ? m.blue : m.brass);
    const tip = k.mesh(new T.ConeGeometry(.55, 1.2, 12), m.brass, 7 * direction, 12, 2); tip.rotation.z = direction * -Math.PI / 2;
    k.mark(state === "selling" ? "coins-leave-treasury" : "coins-enter-treasury");
  }
  stateCard(k, `${words(motif)} / ${words(state)}`, 0, 11.8);
}

export function mediaScene(k: ExhibitKit) {
  const { motif } = k.design;
  k.floor("workshop"); k.desk(0, 3, 25, 4.8);
  if (motif === "film") {
    k.monitor(0, 10, -3, "WHAT IS BITCOIN?\nAN EXPLAINER FILM", true);
    for (const x of [-8, 8]) { k.ring(x, 9.8, 1, 2.2, .3, k.m.steel); for (let i = 0; i < 5; i++) { const a = i * 1.257; k.sphere(x + Math.sin(a) * 1.2, 9.8 + Math.cos(a) * 1.2, 1, .38, k.m.ink); } }
    k.mark("film-reels");
  } else {
    k.folio(0, 10.2, 0, `${motif === "identity-claim" ? "DISPUTED IDENTITY CLAIM" : k.event.actors[0] ?? "PRESS COVERAGE"}\n${k.event.title}`);
    paperStack(k, -9, 5.3, 3, 16); deskLamp(k, 9, 5.3, 2);
    k.mark(motif === "identity-claim" ? "disputed-claim-not-established-identity" : "press-archive");
  }
  stateCard(k, motif === "identity-claim" ? "CLAIM / NOT PROOF OF IDENTITY" : "MEDIA & PUBLIC AWARENESS");
}

export function memorialScene(k: ExhibitKit) {
  k.floor("gallery"); k.desk(-4, 2, 19, 5); k.monitor(-5, 8.9, 0, "Running bitcoin\nHal Finney\n1956–2014"); k.keyboard(-5, 5.5, 4);
  k.framed("HAL FINNEY\nCypherpunk · Cryptographer\nAn early Bitcoin contributor", 6, 12, -9, 15, 4, true);
  k.cyl(9, 1.6, 5, 1.5, 2.7, k.m.cream); k.plant(12, 3);
  for (let i = 0; i < 5; i++) { k.tube([[9, 2, 5], [9 + Math.sin(i * 2) * 1.2, 4.7 + i * .3, 5 + Math.cos(i * 2)]], .05, k.m.green); k.sphere(9 + Math.sin(i * 2) * 1.2, 4.7 + i * .3, 5 + Math.cos(i * 2), .6, k.m.paper); }
  k.mark("quiet-workstation-memorial-no-portrait"); stateCard(k, "IN REMEMBRANCE / HAL FINNEY");
}

export function assemblyScene(k: ExhibitKit) {
  const { motif, state } = k.design, { m } = k;
  k.floor("civic");
  if (["conference", "speech", "hearing"].includes(motif)) {
    k.box(0, 1, -1, 28, 1.4, 15, m.wood); k.box(0, 5, 0, 7, 6.5, 5, m.ink, .2); k.box(0, 8.6, 0, 8, .5, 5.4, m.wood);
    k.tube([[1, 8.8, 0], [1, 10.1, 0], [0, 10.6, 1]], .065, m.steel); k.sphere(0, 10.6, 1, .18, m.edge);
    k.label(words(motif), 0, 5.5, 2.54, 6.4, 3);
    for (const x of [-10, -6, 6, 10]) chair(k, x, 7);
    k.mark(motif === "speech" ? "speech-not-enacted-policy" : "podium-and-audience");
  } else {
    k.desk(0, 0, 25, 4.5);
    for (const x of [-9, -3, 3, 9]) { chair(k, x, 5); chair(k, x, -5, Math.PI); paperStack(k, x, 4.9, 0, 3); }
    k.folio(0, 10, -7, `${words(motif)}\n${words(state)}`); k.mark("negotiation-table-not-consensus-enforcement");
  }
  stateCard(k, `${words(motif)} / ${words(state)}`, 0, 11.8);
}

export function charityScene(k: ExhibitKit) {
  k.floor("workshop"); k.desk(0, 2, 25, 4.5);
  if (k.design.motif === "faucet") {
    k.tube([[-8, 5, 0], [-8, 11, 0], [-5, 12, 0], [-3, 12, 0], [-3, 10, 0]], .55, k.m.brass);
    k.cyl(-8, 9, 0, .16, 3, k.m.steel).rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) k.coin(-3, 8.6 - i * .65, 0, .45, "");
    k.box(-3, 5.2, 0, 5, .6, 4, k.m.steel); k.monitor(7, 8.3, 0, "BITCOIN FAUCET\n5 BTC", false); k.mark("five-bitcoin-faucet");
  } else {
    for (let i = 0; i < 3; i++) {
      const x = -8 + i * 8;
      k.box(x, 7.2, 1, 6, 4.5, 5, k.m.cream, .15); k.box(x, 9.5, 1, 3, .08, .35, k.m.edge);
      k.label(k.event.places.some(p => p.country === "UA") ? "UKRAINE\nDONATIONS" : "CRYPTO\nDONATIONS", x, 7.2, 3.54, 5, 2.7, { bg: "#dccaab", color: "#294643" });
      if (k.design.state !== "suspended") k.coin(x, 11, 1, .75, "");
    }
    if (k.design.state === "suspended") k.barrier();
    k.mark(k.design.state === "suspended" ? "donations-suspended" : "donation-boxes");
  }
  stateCard(k);
}

export function auctionScene(k: ExhibitKit) {
  k.floor("civic"); k.desk(-3, 1, 22, 4.5); k.folio(-6, 10, -1, `${k.design.state === "completed" ? "SALE COMPLETED" : "AUCTION LOTS"}\n${country(k)}`);
  for (let i = 0; i < 4; i++) {
    const x = -4 + i * 4.5; k.cyl(x, 5.2, 4, 1.3, .25, k.m.wood); k.coin(x, 6.3, 4, 1.1, "");
    if (k.design.motif === "paddles") { k.cyl(x, 9, 0, 1.15, .15, k.m.cream).rotation.x = Math.PI / 2; k.box(x, 7.5, 0, .23, 2, .17, k.m.wood); k.label(String(i + 1), x, 9, .1, 1.3, 1.3, { bg: "#d8c6a7", color: "#324445", size: 400 }); }
  }
  k.mark(k.design.motif === "paddles" ? "auction-paddles" : "completed-sale-ledger"); stateCard(k);
}

export function inscriptionScene(k: ExhibitKit) {
  const { motif } = k.design;
  k.floor("gallery");
  for (let i = 0; i < 3; i++) {
    const x = -10 + i * 10;
    k.box(x, 1.7, 0, 7.5, 2.6, 6, k.m.ink);
    k.box(x, 8.4, 0, 7, 10, .8, k.m.brass, .12);
    k.box(x, 8.4, .43, 6.5, 9.5, .12, k.m.paper);
    if (motif === "art") {
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if ((row * 7 + col * 3 + i) % 4 !== 0) k.box(x - 2.2 + col * 1.1, 5 + row * 1.1, .58, .95, .95, .1, [k.m.blue, k.m.green, k.m.red, k.m.brass][(row + col + i) % 4], 0);
    } else k.label(motif === "token" ? '{ "p": "brc-20" }\nTOKEN EXPERIMENT' : 'RUNES\nFUNGIBLE TOKENS', x, 8.4, .52, 6, 6, { bg: "#e4d6b7", color: "#28463f", size: 94 });
    k.label(motif === "art" ? "INTERPRETIVE ART" : "PROTOCOL DATA", x, 1.8, 3.05, 6.5, 1, { size: 77 });
  }
  k.mark(motif === "art" ? "inscribed-satoshi-gallery" : `${motif}-data-tablets`);
  stateCard(k, k.design.state === "milestone" ? "10 MILLION INSCRIPTIONS" : `${words(motif)} / ${words(k.design.state)}`, 0, 11.8);
}

export function atmScene(k: ExhibitKit) {
  k.floor("workshop");
  k.box(-3, 7, 0, 8.4, 13, 7, k.m.ink, .4); k.box(-3, 7.5, 3.6, 7.7, 10, .6, k.m.steel, .2);
  k.label("BITCOIN ATM\nBUY / SELL", -3, 10, 3.96, 6.4, 3, { bg: "#173c3a", color: "#c0d8bd" });
  k.box(-3, 7, 4, 4.8, .5, .2, k.m.edge); k.box(-3, 4.3, 4, 4.8, .8, .2, k.m.edge);
  paymentTerminal(k, -3, 6.1, 4.2, true);
  k.framed("VANCOUVER\nCASH ↔ BITCOIN\n29 OCTOBER 2013", 9, 10, -7, 11, 6, true);
  k.cyl(9, 4, 2, 3.3, .5, k.m.wood); k.cyl(9, 2.2, 2, .25, 3.6, k.m.brass); k.cyl(9, 4.8, 2, .6, 1.1, k.m.cream);
  k.plant(-13, 7); k.mark("cash-bitcoin-kiosk"); stateCard(k, "FIRST PUBLIC BITCOIN ATM");
}
