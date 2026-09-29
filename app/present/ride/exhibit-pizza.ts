import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PresentationEvent } from '@/lib/event-schema';
/** An interpretive pizza-shop diorama, not a reconstruction of the real location. */
export function buildPizzaExhibit(event: PresentationEvent) {
    const offer = event.slug === "bitcoin-pizza-offer-posted";
    const root = new T.Group(), architecture = new T.Group();
    root.add(architecture);
    const lids: T.Object3D[] = [], ovenBricks: T.Object3D[] = [];
    let seed = 210000;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const mat = (color: number, roughness = .7, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
    const charcoal = mat(0x152b29), edge = mat(0x101a1a), grout = mat(0x524c3f), brass = mat(0xc69a54, .32, .75);
    const cream = mat(0xeadfc2, .6), dark = mat(0x263332, .56), metal = mat(0x626d69, .34, .7), paper = mat(0xf2e6ca);
    const terra = [0x965637, 0xa66341, 0x7f4933, 0x9b6145, 0xb57851, 0x89543d].map(c => mat(c, .93));
    const tileMats = [mat(0xddd8bd, .45), mat(0x304d43, .5), mat(0xd1c7ac, .52), mat(0x3d5b4e, .45)];
    function mesh(g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0, p: T.Object3D = architecture) {
        const o = new T.Mesh(g, m);
        o.position.set(x, y, z);
        o.castShadow = true;
        o.receiveShadow = true;
        p.add(o);
        return o;
    }
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: T.Material, r = .05, p: T.Object3D = architecture) => mesh((Math.min(w, h, d) < .2 ? new T.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 3, h / 3, d / 3))), m, x, y, z, p);
    const cyl = (x: number, y: number, z: number, r: number, h: number, m: T.Material, p: T.Object3D = architecture, top = r) => mesh(new T.CylinderGeometry(top, r, h, 24), m, x, y, z, p);
    const ball = (x: number, y: number, z: number, r: number, m: T.Material, p: T.Object3D = architecture) => mesh(new T.SphereGeometry(r, 10, 7), m, x, y, z, p);
    function tube(points: number[][], radius: number, m: T.Material, p: T.Object3D = architecture) {
        return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v => new T.Vector3(...v as [
            number,
            number,
            number
        ]))), 32, radius, 8, false), m, 0, 0, 0, p);
    }
    function canvasTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        paint(c.getContext('2d')!);
        const t = new T.CanvasTexture(c);
        t.colorSpace = T.SRGBColorSpace;
        t.anisotropy = 8;
        return t;
    }
    const timberTexture = canvasTexture(1024, 256, c => {
        c.fillStyle = '#9a6439';
        c.fillRect(0, 0, 1024, 256);
        for (let i = 0; i < 900; i++) {
            c.strokeStyle = `rgba(${i % 3 ? '43,23,10' : '235,182,112'},${.02 + rand() * .13})`;
            c.lineWidth = .3 + rand() * 2;
            c.beginPath();
            const y = rand() * 256;
            c.moveTo(0, y);
            for (let x = 0; x <= 1024; x += 32)
                c.lineTo(x, y + Math.sin(x / 80 + i) * 1.4);
            c.stroke();
        }
        for (let i = 0; i < 5; i++) {
            c.fillStyle = 'rgba(31,20,10,.2)';
            c.fillRect(0, i * 51, 1024, 2);
        }
    });
    const wood = new T.MeshStandardMaterial({ map: timberTexture, roughness: .54, bumpMap: timberTexture, bumpScale: .035 });
    const cardboardTexture = canvasTexture(256, 256, c => { c.fillStyle = '#ba925a'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 18000; i++) {
        c.fillStyle = rand() > .5 ? '#c4a16c' : '#ad854f';
        c.globalAlpha = .28;
        c.fillRect(rand() * 256, rand() * 256, 1, 1);
    } c.globalAlpha = 1; });
    const cardboard = new T.MeshStandardMaterial({ map: cardboardTexture, bumpMap: cardboardTexture, bumpScale: .03, roughness: .94 });
    const innerCard = mat(0xd1ae74, .94);
    function sign(lines: {
        text: string;
        size: number;
        color: string;
        font?: string;
    }[], w: number, h: number, x: number, y: number, z: number, bg = '#142d27', p: T.Object3D = architecture, emissive = 0) {
        const texture = canvasTexture(1536, Math.round(1536 * h / w), c => {
            const height = c.canvas.height;
            c.fillStyle = bg;
            c.fillRect(0, 0, 1536, height);
            const total = lines.reduce((a, l) => a + l.size * 1.32, 0);
            let yy = (height - total) / 2;
            for (const l of lines) {
                c.font = `${l.font ?? '500'} ${l.size}px ${l.font === 'italic' ? 'Georgia' : 'Arial'},sans-serif`;
                c.fillStyle = l.color;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                yy += l.size * .66;
                c.fillText(l.text, 768, yy, 1450);
                yy += l.size * .66;
            }
        });
        const m = new T.MeshStandardMaterial({ map: texture, roughness: .7, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: emissive });
        return mesh(new T.PlaneGeometry(w, h), m, x, y, z, p);
    }
    // Layered foundation and a tiled floor, each tile slightly different.
    box(0, -.9, 0, 35, 2, 27, edge, .5);
    box(0, .04, 0, 34.7, .22, 26.7, brass, .1);
    box(0, .25, 0, 34.3, .35, 26.3, grout, .1);
    for (let ix = 0; ix < 17; ix++)
        for (let iz = 0; iz < 13; iz++)
            box(-16 + ix * 2, .47, -12 + iz * 2, 1.94, .15, 1.94, tileMats[(ix + iz) % 2 + (rand() > .78 ? 2 : 0)], .03);
    // Back wall with real brick relief, staggered mortar joints, coping and skirting.
    box(0, 10, -11.7, 34, 20, .65, grout, .05);
    for (let row = 0; row < 19; row++)
        for (let col = 0; col < 16; col++) {
            const x = -16.7 + col * 2.12 + (row % 2) * 1.06;
            if (x > 16.8)
                continue;
            box(x, .97 + row * 1.01, -11.24, 2.01, .9, .28, terra[Math.floor(rand() * terra.length)], .085);
        }
    box(0, 20.35, -11.55, 34.5, .6, 1.3, wood, .1);
    box(0, 1.1, -10.87, 34, .6, .2, charcoal, .04);
    // Low left wall keeps the interior readable from the ride.
    box(-16.6, 4, -2.3, .65, 7, 18.3, charcoal, .12);
    box(-16.6, 7.6, -2.3, 1, .35, 18.7, wood);
    for (let z = -10; z < 7; z += 2.2)
        box(-16.15, 3.8, z, .12, 5.8, 1.65, dark, .05);
    // Large enamel station sign, lit by a brass picture lamp.
    box(-4.1, 17, -10.76, 19.6, 4.9, .38, brass, .14);
    box(-4.1, 17, -10.53, 19.22, 4.55, .12, charcoal, .04);
    sign([{ text: offer ? 'P I Z Z A   F O R   B I T C O I N S ?' : 'P I Z Z A   D A Y', size: 156, color: '#f2d8a6', font: '600' }, { text: offer ? 'M A Y   1 8 ,   2 0 1 0  /  T H E  O F F E R' : 'M A Y   2 2 ,   2 0 1 0', size: 54, color: '#c69a54' }], 18.8, 4.35, -4.1, 17, -10.44);
    tube([[-4.1, 19.6, -11], [-4.1, 20.4, -9.8], [-4.1, 19.5, -9]], .08, brass);
    box(-4.1, 19.45, -9, 5, .22, .48, brass, .1);
    const lampGlow = new T.MeshStandardMaterial({ color: 0xffefc7, emissive: 0xffd59b, emissiveIntensity: 3 });
    box(-4.1, 19.3, -9, 4.6, .045, .38, lampGlow, .01);
    // A dark green counter with carved panels, brass trim and a substantial timber top.
    box(-1, 3.65, 3, 27, 6.1, 10, charcoal, .17);
    for (let x = -12; x < 12; x += 4.25) {
        box(x, 3.7, 8.07, 3.72, 4.5, .18, dark, .08);
        box(x, 3.7, 8.19, 3.3, 4.05, .1, charcoal, .035);
    }
    box(-1, 6.85, 3, 27.7, .72, 10.65, wood, .13);
    box(-1, 6.38, 8.08, 27, .14, .16, brass, .03);
    box(-1, 1, 8.1, 27, .5, .35, wood);
    tube([[-14, 1.45, 9.2], [12, 1.45, 9.2]], .13, brass);
    for (const x of [-13, 0, 11])
        tube([[x, 1.45, 9.2], [x, 1.45, 8.3], [x, .7, 8.3]], .13, brass);
    // Oven: masonry shell and a vaulted black mouth made from an extruded arch.
    box(10, 5.3, -6.7, 9, 9.5, 7, cream, .28);
    box(10, 2.3, -6.7, 9.3, .4, 7.3, wood);
    const arch = new T.Shape();
    arch.moveTo(-3, 0);
    arch.lineTo(-3, 2);
    arch.absarc(0, 2, 3, Math.PI, 0, true);
    arch.lineTo(3, 0);
    arch.closePath();
    mesh(new T.ShapeGeometry(arch), mat(0x100d08), 10, 6.2, -3.1);
    for (let i = 0; i <= 12; i++) {
        const a = Math.PI * i / 12;
        const b = box(10 + 3.35 * Math.cos(a), 8.2 + 3.35 * Math.sin(a), -2.9, .84, 1.2, .8, terra[i % terra.length], .09);
        b.rotation.z = a - Math.PI / 2;
        ovenBricks.push(b);
    }
    for (const x of [6.6, 13.4])
        for (let i = 0; i < 2; i++)
            ovenBricks.push(box(x, 6.6 + i, -2.9, .86, .94, .85, terra[i % terra.length], .06));
    box(10, 6, -2.35, 8.5, .35, 2.3, metal, .08);
    cyl(10, 14, -7, 1.2, 8, charcoal);
    cyl(10, 18, -7, 1.55, .5, brass);
    // Ember bed and flame silhouettes live inside the oven, away from the food.
    const embers = mat(0xcc5412);
    embers.emissive.set(0xff5b12);
    embers.emissiveIntensity = 2.5;
    for (let i = 0; i < 24; i++) {
        const e = ball(8 + rand() * 4, 6.48 + rand() * .22, -3.15 + rand() * .3, .12 + rand() * .14, embers);
        e.scale.y = .6;
    }
    const fireMat = new T.MeshBasicMaterial({ color: 0xffb33b, side: T.DoubleSide });
    const flames: T.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
        const shape = new T.Shape();
        shape.moveTo(-.28, 0);
        shape.quadraticCurveTo(-.6, .8, 0, 1.6);
        shape.quadraticCurveTo(.12, .8, .35, 0);
        const f = mesh(new T.ShapeGeometry(shape), fireMat, 8.1 + i * .63, 6.5, -3.02, root);
        f.scale.y = .6 + rand() * .8;
        f.castShadow = false;
        flames.push(f);
    }
    // Shelf, dishes, glass bottles and tiny herb pots give the station a lived-in scale.
    box(-6, 11.4, -8.9, 17, .35, 3.1, wood, .09);
    for (const x of [-12, -1]) {
        box(x, 10.6, -10, .18, 1.5, 1.6, brass);
    }
    for (let i = 0; i < 5; i++) {
        cyl(-10, 11.7 + i * .16, -8.7, 1.25, .14, cream);
    }
    const bottle = mat(0x304f25, .24, .12);
    for (const x of [-6, -4.9, -3.8]) {
        cyl(x, 12.25, -8.8, .33, 1.6, bottle);
        cyl(x, 13.25, -8.8, .14, .55, bottle);
        cyl(x, 13.58, -8.8, .16, .16, brass);
        box(x, 12.3, -8.44, .45, .75, .02, paper, .01);
    }
    const herb = mat(0x486636);
    for (const x of [-1.6, 0]) {
        cyl(x, 12, -8.8, .55, .8, terra[1], architecture, .45);
        for (let i = 0; i < 10; i++) {
            const l = ball(x + (rand() - .5) * .9, 12.8 + rand() * .9, -8.8 + (rand() - .5) * .8, .32, herb);
            l.scale.set(.65, 1.5, .45);
            l.rotation.z = rand();
        }
    }
    // Actual thin box walls, raised lids, corner folds and visible corrugated edges.
    function pizzaBox(x: number, z: number, angle: number, variant: number) {
        const g = new T.Group();
        g.position.set(x, 7.3, z);
        g.rotation.y = angle;
        architecture.add(g);
        box(0, 0, 0, 10, .18, 9.6, cardboard, .05, g);
        for (const side of [-1, 1]) {
            box(side * 4.85, .4, 0, .16, .8, 9.6, innerCard, .035, g);
            box(0, .4, side * 4.7, 9.7, .8, .16, innerCard, .035, g);
        }
        for (let i = 0; i < 88; i++)
            box(-4.75 + i * .108, .76, 4.72, .025, .05, .15, cardboard, .006, g);
        // The old backward lean intersected the oven masonry, not the depth buffer.
        const lid = new T.Group();
        lid.position.set(0, .2, -4.7);
        lid.rotation.x = .08;
        g.add(lid);
        lids.push(lid);
        box(0, 4.7, 0, 9.9, 9.5, .14, cardboard, .055, lid);
        for (const side of [-1, 1]) {
            const flap = box(side * 4.8, 4.8, .15, .65, 9.3, .13, innerCard, .025, lid);
            flap.rotation.y = side * .5;
        }
        sign([{ text: 'THE PIZZA EXCHANGE', size: 72, color: '#37543c', font: '700' }, { text: offer ? 'WANTED:' : 'TWO PIZZAS.', size: 150, color: '#37543c', font: '700' }, { text: offer ? 'TWO PIZZAS' : 'ONE MOMENT.', size: 150, color: '#37543c', font: '700' }, { text: offer ? 'OFFER  /  10,000 BTC' : '22 MAY 2010  /  10,000 BTC', size: 63, color: '#5b6942' }], 8, 6.1, 0, 5, .095, '#cfb17a', lid);
        if (offer)
            return; // The offer precedes the fulfilled purchase: empty waiting boxes.
        // Uneven dough surface, mottled toasted skin and blistered cheese.
        const crustMap = canvasTexture(512, 256, c => { c.fillStyle = '#d9983f'; c.fillRect(0, 0, 512, 256); for (let i = 0; i < 750; i++) {
            const r = rand() * 7 + .5;
            c.fillStyle = rand() > .2 ? 'rgba(113,48,13,.20)' : 'rgba(245,203,102,.4)';
            c.beginPath();
            c.ellipse(rand() * 512, rand() * 256, r, r * .7, 0, 0, Math.PI * 2);
            c.fill();
        } });
        const crust = new T.MeshStandardMaterial({ map: crustMap, bumpMap: crustMap, bumpScale: .065, roughness: .76 });
        const cheese = mat(0xe9b94c, .53), sauce = mat(0x9e2d0f, .64), toast = mat(0x91491b, .7), mozzarella = mat(0xffd880, .6);
        cyl(0, .44, 0, 4.3, .34, crust, g);
        cyl(0, .64, 0, 4.03, .08, sauce, g);
        cyl(0, .7, 0, 3.92, .12, cheese, g);
        const rimG = new T.TorusGeometry(4.02, .32, 12, 128);
        const pos = rimG.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const a = Math.atan2(pos.getY(i), pos.getX(i));
            const wobble = 1 + .012 * Math.sin(a * 9) + .009 * Math.sin(a * 17);
            pos.setXYZ(i, pos.getX(i) * wobble, pos.getY(i) * wobble, pos.getZ(i) * (1 + .13 * Math.sin(a * 11)));
        }
        rimG.computeVertexNormals();
        mesh(rimG, crust, 0, .69, 0, g).rotation.x = Math.PI / 2;
        for (let i = 0; i < 110; i++) {
            const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 3.7;
            const o = ball(Math.cos(a) * r, .79, Math.sin(a) * r, .09 + rand() * .24, i % 4 === 0 ? toast : mozzarella, g);
            o.scale.set(1, .14, .6 + rand());
        }
        const pepper = mat(variant ? 0xa13a19 : 0xad3c21, .45), pepperRim = mat(0x792c15, .63), fat = mat(0xe1ad66, .55);
        for (let i = 0; i < 22; i++) {
            const a = i * 2.39996 + variant * .6, r = Math.sqrt((i + .5) / 23) * 3.38, px = Math.cos(a) * r, pz = Math.sin(a) * r;
            const piece = new T.Group();
            piece.position.set(px, .87, pz);
            piece.rotation.set((rand() - .5) * .12, rand() * 6, (rand() - .5) * .12);
            g.add(piece);
            cyl(0, 0, 0, .48, .055, pepper, piece);
            mesh(new T.TorusGeometry(.44, .048, 6, 22), pepperRim, 0, .04, 0, piece).rotation.x = Math.PI / 2;
            for (let j = 0; j < 8; j++) {
                const aa = rand() * 6.28, rr = rand() * .35;
                const speck = ball(Math.cos(aa) * rr, .04, Math.sin(aa) * rr, .025 + rand() * .02, fat, piece);
                speck.scale.y = .22;
            }
        }
        const leafM = mat(0x4d732c, .68), veinM = mat(0x829243);
        leafM.side = T.DoubleSide;
        for (let i = 0; i < 8; i++) {
            const a = i * 2.5, r = .7 + rand() * 2.7;
            const leaf = new T.Group();
            leaf.position.set(Math.cos(a) * r, .98, Math.sin(a) * r);
            leaf.rotation.y = a;
            g.add(leaf);
            const shape = new T.Shape();
            shape.moveTo(0, -.46);
            shape.bezierCurveTo(-.5, -.15, -.43, .32, 0, .53);
            shape.bezierCurveTo(.35, .28, .4, -.15, 0, -.46);
            const geo = new T.ShapeGeometry(shape, 8);
            const p = geo.attributes.position;
            for (let k = 0; k < p.count; k++) {
                const xx = p.getX(k), yy = p.getY(k);
                p.setXYZ(k, xx, .1 * Math.sin(yy * 4) - Math.abs(xx) * .18, yy);
            }
            geo.computeVertexNormals();
            mesh(geo, leafM, 0, 0, 0, leaf);
            tube([[0, 0, -.45], [0, .1, 0], [0, .08, .5]], .012, veinM, leaf);
        }
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const cut = box(Math.sin(a) * 2, .79, Math.cos(a) * 2, .023, .023, 3.8, toast, .006, g);
            cut.rotation.y = a;
        }
    }
    pizzaBox(-7, 2.8, -.075, 0);
    pizzaBox(4.6, 3.2, .11, 1);
    // Counter objects: napkins, shaker, receipt and a discreet metal payment marker.
    for (let i = 0; i < 7; i++) {
        const n = box(11.4, 7.32 + i * .035, 5.3, 1.8, .026, 2.3, paper, .015);
        n.rotation.y = .18 + i * .018;
    }
    cyl(11.6, 7.78, 2.7, .42, 1.15, cream);
    cyl(11.6, 8.36, 2.7, .44, .17, metal);
    for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        cyl(11.6 + Math.cos(a) * .23, 8.455, 2.7 + Math.sin(a) * .23, .028, .015, edge);
    }
    const receipt = sign([{ text: offer ? 'PIZZA FOR BITCOINS?' : 'BITCOIN PIZZA DAY', size: 67, color: '#34352d', font: '700' }, { text: offer ? '18 / 05 / 2010' : '22 / 05 / 2010', size: 48, color: '#535648' }, { text: '2 PIZZAS', size: 90, color: '#34352d' }, { text: '10,000 BTC', size: 122, color: '#34352d', font: '700' }, { text: offer ? 'OFFER POSTED / AWAITING REPLY' : 'A REAL-WORLD EXCHANGE', size: 40, color: '#737665' }], 3.1, 4.9, -.9, 7.28, 7.1, '#f0e6c9');
    receipt.rotation.x = -Math.PI / 2;
    receipt.rotation.z = -.14;
    box(-1, 4.1, 8.39, 9.5, 2.35, .22, brass, .12);
    sign([{ text: offer ? '10,000 BTC  /  OFFER POSTED' : '10,000 BTC  /  TWO PIZZAS', size: 110, color: '#e6d4a3', font: '600' }, { text: offer ? 'THE PURCHASE HAS NOT HAPPENED YET' : 'THE FIRST FAMOUS BITCOIN PURCHASE', size: 39, color: '#9db49a' }], 9.1, 2.08, -1, 4.1, 8.515);
    // A small period workstation and a forum transcript label, not a modern laptop.
    box(-11.7, 5.2, -6.7, 7, 1, 4.5, wood);
    for (const x of [-14, -9.4])
        box(x, 2.8, -6.7, .3, 5, 3, metal);
    box(-11.7, 8.1, -6.6, 4.7, 3.65, 3, cream, .23);
    box(-11.7, 8.1, -4.95, 4.08, 3.08, .35, dark, .16);
    sign([{ text: 'bitcoin / forum', size: 100, color: '#b7d4aa' }, { text: 'Pizza for bitcoins?', size: 85, color: '#a4c18d' }, { text: 'laszlo · May 2010', size: 60, color: '#729a6c' }], 3.6, 2.5, -11.7, 8.1, -4.75, '#172923', architecture, .35);
    box(-11.7, 6.05, -6.6, 2.2, .4, 2.2, cream, .08);
    box(-11.7, 5.84, -4.65, 4.4, .22, 1.3, cream);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 12; c++)
            box(-13.65 + c * .35, 6, -5.1 + r * .36, .27, .13, .26, paper, .025);
    // Suspended fixtures with warm light: three shades create clear depth and pools.
    for (const x of [-10, 0, 10]) {
        tube([[x, 22, -1], [x, 18.5, -1]], .035, edge);
        const profile = [new T.Vector2(.22, 1.7), new T.Vector2(.4, 1.65), new T.Vector2(.64, 1.1), new T.Vector2(1.4, .58), new T.Vector2(1.75, .15), new T.Vector2(1.75, 0)];
        mesh(new T.LatheGeometry(profile, 40), charcoal, x, 17, -1);
        cyl(x, 17.06, -1, 1.55, .07, lampGlow);
        ball(x, 16.85, -1, .24, lampGlow);
    }
    // Quiet typography on the plinth anchors the miniature in the historical record.
    sign([{ text: `${event.date}     •     ${offer ? 'THE PIZZA OFFER' : 'BITCOIN PIZZA DAY'}     •     INTERPRETIVE DIORAMA`, size: 52, color: '#d2c6a7' }], 25, .9, 0, -.67, 13.515, '#101a1a');
    // Merge all stationary objects by material to keep detail affordable at runtime.
    root.updateMatrixWorld(true);
    // Keep actual pre-bake world bounds for the regression: no renderer ordering
    // workaround can fix solids that physically intersect.
    const bounds = (o: T.Object3D) => { const b = new T.Box3().setFromObject(o); return { min: b.min.toArray(), max: b.max.toArray() }; };
    root.userData.occlusion = { lids: lids.map(bounds), ovenBricks: ovenBricks.map(bounds) };
    architecture.updateMatrixWorld(true);
    const batches = new Map<T.Material, T.BufferGeometry[]>();
    architecture.traverse(o => { if (!(o instanceof T.Mesh) || Array.isArray(o.material))
        return; let clone = o.geometry.clone().applyMatrix4(o.matrixWorld); if (clone.index) {
        const expanded = clone.toNonIndexed();
        clone.dispose();
        clone = expanded;
    } for (const key of Object.keys(clone.attributes))
        if (!['position', 'normal', 'uv'].includes(key))
            clone.deleteAttribute(key); const bucket = batches.get(o.material) ?? []; bucket.push(clone); batches.set(o.material, bucket); o.geometry.dispose(); });
    architecture.clear();
    for (const [m, parts] of batches) {
        const g = mergeGeometries(parts);
        parts.forEach(p => p.dispose());
        if (g)
            mesh(g, m);
    }
    root.name = event.slug;
    root.userData.design = { kind: 'pizza', motif: offer ? 'offer' : 'purchase', state: offer ? 'pending' : 'complete', artifacts: [offer ? 'empty-boxes-awaiting-purchase' : 'two-completed-pizzas', 'upright-lids-clear-of-oven'] };
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    root.traverse(o => { if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            materials.add(m);
            for (const value of Object.values(m))
                if (value instanceof T.Texture)
                    textures.add(value);
        }
    } });
    let disposed = false;
    return { group: root, kind: 'pizza' as const, update: (time: number) => { if (!disposed)
            flames.forEach((f, i) => { f.scale.y = .8 + Math.sin(time * 3 + i) * .12; }); }, dispose: () => { if (disposed)
            return; disposed = true; geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.clear(); } };
}
