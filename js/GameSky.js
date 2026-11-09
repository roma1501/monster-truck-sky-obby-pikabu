// GameSky.js — небо миров Monster Truck Sky Obby: панорама, нарисованная кодом (Canvas2D -> DynamicTexture на
// куполе со своими UV «долгота/широта»), подвижный слой облаков поверх неё, частицы у камеры и вспышки.
// Трасса висит в небе, поэтому нижняя половина купола видна не меньше верхней — у каждого мира своё «дно».
//   world-1 «Свалка в облаках» — золотое утро: низкое солнце с лучами, перистые облака, башни кучевых
//            облаков на горизонте, внизу — облачный океан, подсвеченный солнцем.
//   world-2 «Порт контейнеров»   — порт в дымке: стальное сине-серое небо, тусклое жёлтое солнце,
//            слоистые сланцевые облака, внизу — серый облачный океан; в воздухе пыль.
//   world-3 «Литейный цех» — ночь над вулканами: кровавое затмение, звёзды, пепельные тучи с
//            подсветкой лавы, силуэты вулканов с извержениями, внизу — лавовое море; угольки и молнии.
// Солнце (или луна) на панораме стоит там же, откуда светит свет сцены (sunAz/sunEl мира) — тени совпадают.
// Вид, а не логика (инвариант 4): физика неба не спрашивает.

/** @satisfies {Record<string, any>} */
const GameSky = {
    /** @type {any[]} */ meshes: [],
    /** @type {any[]} */ mats: [],
    /** @type {any[]} */ fx: [],
    /** @type {any} */ clouds: null,
    /** @type {any} */ base: null,
    /** @type {any} */ view: null,
    /** @type {any} */ def: null,
    t: 0, flash: 0, nextFlash: 8, flashLeft: 0,

    // Оформление миров: свет сцены, туман, направление солнца, особенности.
    WORLDS: {
        'world-1': { sunAz: 205, sunEl: 22, sunColor: 0xffd49a, sunI: 0.95, skyI: 0.5, skyLight: 0xcfe6ff, ground: 0xffe2c4, fogColor: 0xffd9ae, fog: 0.00006, drift: 0.004 },
        'world-2': { sunAz: 150, sunEl: 14, sunColor: 0xffc98a, sunI: 0.85, skyI: 0.55, skyLight: 0xb9d0e6, ground: 0x9fb0bf, fogColor: 0x9db4c6, fog: 0.00007, drift: 0.006 },
        'world-3': { sunAz: 320, sunEl: 34, sunColor: 0xff9b70, sunI: 0.85, skyI: 0.42, skyLight: 0x7a5aa0, ground: 0xff6a2a, fogColor: 0x4a1622, fog: 0.00008, drift: 0.01, lightning: true },
    },

    /** Свет и туман мира — до постройки купола (Course.applyTheme). */
    lighting(mapId, theme) {
        const W = this.WORLDS[mapId] || this.WORLDS['world-1'];
        return { sky: W.fogColor, fog: W.fog, sunColor: W.sunColor, sunIntensity: W.sunI, skyIntensity: W.skyI, skyLight: W.skyLight, groundLight: W.ground,
            sunAz: W.sunAz, sunEl: W.sunEl, _theme: theme };
    },

    clear() {
        for (const h of this.fx) { try { h.stop(); } catch (e) { /* уже */ } }
        for (const m of this.meshes) { try { m.dispose(false, true); } catch (e) { /* уже */ } }
        for (const m of this.mats) { try { m.dispose(true, true); } catch (e) { /* уже */ } }
        this.fx = []; this.meshes = []; this.mats = []; this.clouds = null; this.base = null;
    },

    /** Купол неба мира mapId на виде view (радиус R); app — для частиц (app.fx). */
    build(view, mapId, R, app) {
        this.clear();
        this.view = view;
        const id = this.WORLDS[mapId] ? mapId : 'world-1';
        this.def = Object.assign({ id }, this.WORLDS[id]);
        this.t = 0; this.flash = 0; this.nextFlash = 6 + Math.random() * 6; this.flashLeft = 0;
        const low = (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) || (typeof Quality !== 'undefined' && Number(Quality.level) <= 0);
        const W = low ? 1024 : 2048, H = W / 2;
        const scene = view.scene;
        // основная панорама
        const tex = new BABYLON.DynamicTexture('sky-pano-' + id, { width: W, height: H }, scene, true);
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        const P = this._painter(ctx, W, H, id);
        if (id === 'world-1') this._paintDawn(P);
        else if (id === 'world-2') this._paintPort(P);
        else this._paintVolcano(P);
        tex.update(true);
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this.base = this._dome(scene, 'sky-dome', R, tex, false, -1000);
        // подвижный слой облаков (прозрачный, медленно плывёт)
        const ct = new BABYLON.DynamicTexture('sky-clouds-' + id, { width: W, height: H }, scene, true);
        const cctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (ct.getContext()));
        cctx.clearRect(0, 0, W, H);
        this._paintCloudLayer(this._painter(cctx, W, H, id + 'c'), id);
        ct.hasAlpha = true;
        ct.update(true);
        ct.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; ct.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this.clouds = this._dome(scene, 'sky-clouds', R * 0.97, ct, true, -999);
        this._particles(app, id);
        return this.base;
    },

    // Купол с UV «долгота/широта»: u = долгота/2π (0 — вдоль +x, растёт к +z), v = 0 низ .. 1 верх.
    _dome(scene, name, R, tex, alpha, order) {
        const NU = 72, NV = 36;
        const pos = [], uv = [], idx = [];
        for (let j = 0; j <= NV; j++) {
            const lat = -Math.PI / 2 + Math.PI * j / NV, cl = Math.cos(lat), sl = Math.sin(lat);
            for (let i = 0; i <= NU; i++) {
                const lon = Math.PI * 2 * i / NU;
                pos.push(Math.cos(lon) * cl * R, sl * R, Math.sin(lon) * cl * R);
                uv.push(i / NU, j / NV);
            }
        }
        for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
            const a = j * (NU + 1) + i, b = a + NU + 1;
            idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.uvs = uv; vd.indices = idx;
        const nrm = []; BABYLON.VertexData.ComputeNormals(pos, idx, nrm); vd.normals = nrm;
        vd.applyToMesh(mesh, false);
        const mat = new BABYLON.StandardMaterial(name + '-mat', scene);
        mat.disableLighting = true;
        mat.emissiveTexture = tex;
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        if (alpha) { mat.opacityTexture = tex; mat.alpha = 0.999; }
        mat.fogEnabled = false;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.metadata = { toon: false };
        mesh.material = mat;
        mesh.infiniteDistance = true;
        mesh.isPickable = false;
        mesh.applyFog = false;
        mesh.renderingGroupId = 0;
        mesh.alphaIndex = order;
        this.meshes.push(mesh); this.mats.push(mat, tex);
        return mesh;
    },

    // Рисовальщик по сферическим координатам: долгота/широта (рад) -> пиксели, обёртка по шву, свой ГСЧ.
    _painter(ctx, W, H, seedKey) {
        let seed = 0;
        for (const ch of String(seedKey)) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
        seed = seed || 12345;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const D = Math.PI / 180;
        const X = (lon) => (((lon % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * W;
        const Y = (lat) => (0.5 - lat / Math.PI) * H;
        const sun = this.def ? { lon: (this.def.sunAz + 180) * D, lat: this.def.sunEl * D } : { lon: 0, lat: 0.4 };
        /** Нарисовать трижды со сдвигом на ширину (шов u=0/1). */
        const wrap = (x, r, fn) => { for (const dx of [-W, 0, W]) if (x + dx + r > 0 && x + dx - r < W) fn(x + dx); };
        /** Вертикальный градиент по широте: stops [[широта°, цвет], ...] сверху вниз. */
        const vgrad = (stops) => {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            for (const [lat, c] of stops) g.addColorStop(Math.max(0, Math.min(1, Y(lat * D) / H)), c);
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        };
        /** Мягкое пятно (эллипс с учётом растяжения по долготе): угловой радиус r (рад). */
        const blob = (lon, lat, r, inner, outer, k) => {
            const x = X(lon), y = Y(lat), ry = r / Math.PI * H, rx = ry / Math.max(0.2, Math.cos(lat)) * (k || 1);
            wrap(x, rx, (xx) => {
                ctx.save(); ctx.translate(xx, y); ctx.scale(rx / ry, 1);
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
                g.addColorStop(0, inner); g.addColorStop(1, outer);
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            });
        };
        /** Диск с заливкой (функция fill(ctx, r) рисует в локальных координатах круга радиуса r). */
        const disc = (lon, lat, r, fill) => {
            const x = X(lon), y = Y(lat), ry = r / Math.PI * H, rx = ry / Math.max(0.2, Math.cos(lat));
            wrap(x, rx, (xx) => { ctx.save(); ctx.translate(xx, y); ctx.scale(rx / ry, 1); fill(ctx, ry); ctx.restore(); });
        };
        /** Кучевое облако из пухлых шаров: светлая верхушка, тень снизу. */
        const cloud = (lon, lat, size, light, shade, puffs) => {
            const n = puffs || 9;
            for (let k = 0; k < n; k++) {
                const a = (k / (n - 1) - 0.5) * 2, r = size * (0.5 + 0.5 * Math.cos(a * 1.4)) * (0.75 + rnd() * 0.4);
                const dl = a * size * 1.6, dh = r * 0.35 + rnd() * size * 0.15;
                blob(lon + dl / Math.max(0.3, Math.cos(lat)), lat - size * 0.15, r * 1.05, shade, 'rgba(0,0,0,0)');
                blob(lon + dl / Math.max(0.3, Math.cos(lat)), lat + dh * 0.4, r, light, 'rgba(255,255,255,0)');
            }
        };
        const stars = (n, latMin, color) => {
            for (let i = 0; i < n; i++) {
                const lat = (latMin + rnd() * (88 - latMin)) * D, lon = rnd() * Math.PI * 2;
                const x = X(lon), y = Y(lat), s = rnd() < 0.08 ? 2.2 : rnd() < 0.3 ? 1.4 : 0.9;
                ctx.globalAlpha = 0.35 + rnd() * 0.65;
                ctx.fillStyle = color || '#ffffff';
                ctx.beginPath(); ctx.arc(x, y, s * W / 2048, 0, Math.PI * 2); ctx.fill();
                if (s > 2) { ctx.globalAlpha *= 0.4; ctx.fillRect(x - 6 * W / 2048, y - 0.5, 12 * W / 2048, 1); ctx.fillRect(x - 0.5, y - 6 * W / 2048, 1, 12 * W / 2048); }
            }
            ctx.globalAlpha = 1;
        };
        /** Облачный океан внизу: россыпь облаков от горизонта (дальние, мелкие) к надиру (ближние, крупные). */
        const sea = (n, color) => {
            const list = [];
            for (let i = 0; i < n; i++) {
                const depth = Math.pow(rnd(), 1.5);                       // 0 — у горизонта, 1 — под нами
                list.push({ lat: -(1.5 + depth * 74) * D, lon: rnd() * Math.PI * 2, s: (1.6 + depth * 9 + rnd() * 2.5) * D, k: rnd() });
            }
            list.sort((a, b) => b.lat - a.lat);
            for (const c of list) { const [l, sh] = color(c); cloud(c.lon, c.lat, c.s, l, sh, 6 + Math.floor(c.k * 5)); }
        };
        return { ctx, W, H, D, X, Y, rnd, wrap, vgrad, blob, disc, cloud, stars, sun, sea };
    },

    // ---------------------------------------------------------------- world-1: золотое утро
    _paintDawn(P) {
        const { ctx, D, rnd, vgrad, blob, disc, cloud, sun, W } = P;
        vgrad([[90, '#1747c8'], [55, '#2f7bf0'], [28, '#7cc4ff'], [12, '#cfe9ff'], [5, '#ffe2b0'], [0, '#ffc98a'],
            [-4, '#ffd9b4'], [-18, '#fff0dc'], [-50, '#f4e8ff'], [-90, '#d9cdfa']]);
        // широкое тёплое зарево вокруг солнца
        blob(sun.lon, sun.lat, 70 * D, 'rgba(255,214,150,0.55)', 'rgba(255,214,150,0)', 1.2);
        blob(sun.lon, sun.lat - 10 * D, 40 * D, 'rgba(255,170,90,0.35)', 'rgba(255,170,90,0)', 1.6);
        // лучи
        const sx = P.X(sun.lon), sy = P.Y(sun.lat);
        P.wrap(sx, W * 0.2, (xx) => {
            ctx.save(); ctx.translate(xx, sy); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 18; i++) {
                const a = (i / 18) * Math.PI * 2 + rnd() * 0.15, L = W * (0.05 + rnd() * 0.07), w = 0.05 + rnd() * 0.05;
                const g = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
                g.addColorStop(0, 'rgba(255,240,200,0.16)'); g.addColorStop(1, 'rgba(255,240,200,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a - w) * L, Math.sin(a - w) * L); ctx.lineTo(Math.cos(a + w) * L, Math.sin(a + w) * L); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        });
        disc(sun.lon, sun.lat, 4.2 * D, (c, r) => {
            const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
            g.addColorStop(0, '#fffef4'); g.addColorStop(0.4, '#fff6cf'); g.addColorStop(0.42, 'rgba(255,226,150,0.85)'); g.addColorStop(1, 'rgba(255,200,120,0)');
            c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.4, 0, Math.PI * 2); c.fill();
        });
        // башни кучевых облаков по горизонту
        for (let i = 0; i < 26; i++) {
            const lon = rnd() * Math.PI * 2, s = (3 + rnd() * 5) * D;
            const toward = Math.cos(lon - sun.lon);
            cloud(lon, (1.5 + rnd() * 5) * D, s, toward > 0.3 ? 'rgba(255,236,206,0.95)' : 'rgba(255,255,255,0.95)', 'rgba(170,160,215,0.55)', 9);
        }
        // облачный океан внизу, подсвеченный солнцем с одной стороны
        P.sea(300, (c) => {
            const lit = 0.5 + 0.5 * Math.cos(c.lon - sun.lon);
            return [`rgba(255,${Math.round(246 - 22 * lit)},${Math.round(236 - 60 * lit)},0.96)`, `rgba(${Math.round(170 + 30 * lit)},${Math.round(160 + 10 * lit)},228,0.55)`];
        });
        // дымка у горизонта
        const g = ctx.createLinearGradient(0, P.Y(6 * D), 0, P.Y(-6 * D));
        g.addColorStop(0, 'rgba(255,224,180,0)'); g.addColorStop(0.5, 'rgba(255,224,180,0.5)'); g.addColorStop(1, 'rgba(255,224,180,0)');
        ctx.fillStyle = g; ctx.fillRect(0, P.Y(6 * D), W, P.Y(-6 * D) - P.Y(6 * D));
    },

    // ---------------------------------------------------------------- world-2: порт в дымке (рескин: стальное небо, жёлтое зарево, сланцевые облака)
    _paintPort(P) {
        const { ctx, D, rnd, vgrad, blob, disc, cloud, W } = P;
        vgrad([[90, '#1d2a38'], [60, '#2f4558'], [38, '#4f6c84'], [20, '#7f9bb0'], [9, '#b9c6cc'], [2, '#e8c79a'], [0, '#f2b86e'],
            [-5, '#c9a98a'], [-22, '#8da0b0'], [-55, '#5d7388'], [-90, '#3f566b']]);
        // низкое тусклое солнце в дымке
        const sun = P.sun;
        blob(sun.lon, sun.lat, 55 * D, 'rgba(255,200,130,0.55)', 'rgba(255,200,130,0)', 1.3);
        disc(sun.lon, sun.lat, 3.4 * D, (c, r) => {
            const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
            g.addColorStop(0, '#fff6df'); g.addColorStop(0.45, '#ffd9a0'); g.addColorStop(0.47, 'rgba(255,190,110,0.7)'); g.addColorStop(1, 'rgba(255,170,90,0)');
            c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.2, 0, Math.PI * 2); c.fill();
        });
        // сланцево-серые облака у горизонта и внизу
        const palette = [['rgba(214,222,230,0.95)', 'rgba(110,130,150,0.6)'], ['rgba(190,204,216,0.95)', 'rgba(90,110,132,0.6)'], ['rgba(236,222,206,0.95)', 'rgba(130,125,130,0.55)']];
        for (let i = 0; i < 22; i++) { const [l, sh] = palette[i % 3]; cloud(rnd() * Math.PI * 2, (2 + rnd() * 6) * D, (2.5 + rnd() * 4) * D, l, sh, 8); }
        P.sea(300, (c) => palette[Math.floor(c.k * 3) % 3]);
        ctx.globalAlpha = 1;
        void W;
    },

    // ---------------------------------------------------------------- world-3: ночь над вулканами
    _paintVolcano(P) {
        const { ctx, D, rnd, vgrad, blob, disc, stars, sun, W, H } = P;
        vgrad([[90, '#05030c'], [60, '#0f0720'], [35, '#22092e'], [16, '#470d2a'], [7, '#8a1d1e'], [1.5, '#e8541c'], [0, '#ff7a2a'],
            [-3, '#c63a14'], [-12, '#5a1308'], [-40, '#200604'], [-90, '#0c0302']]);
        stars(900, 14, '#ffeedd');
        // кровавое затмение: тёмный диск с короной
        const moon = { lon: sun.lon, lat: Math.max(20 * D, sun.lat) };
        blob(moon.lon, moon.lat, 30 * D, 'rgba(255,90,40,0.35)', 'rgba(255,60,30,0)', 1.1);
        disc(moon.lon, moon.lat, 6 * D, (c, r) => {
            const g = c.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.9);
            g.addColorStop(0, 'rgba(255,190,120,0.95)'); g.addColorStop(0.15, 'rgba(255,110,50,0.75)'); g.addColorStop(1, 'rgba(255,40,20,0)');
            c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 1.9, 0, Math.PI * 2); c.fill();
            const m = c.createRadialGradient(r * 0.25, r * 0.2, r * 0.1, 0, 0, r);
            m.addColorStop(0, '#5a1410'); m.addColorStop(1, '#1a0606');
            c.fillStyle = m; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
        });
        // вулканы по горизонту: тёмные силуэты, светящиеся жерла и потоки лавы
        for (let i = 0; i < 14; i++) {
            const lon = (i + rnd() * 0.6) / 14 * Math.PI * 2, x = P.X(lon), w = W * (0.045 + rnd() * 0.06), h = H * (0.04 + rnd() * 0.07), y0 = P.Y(0.5 * D);
            P.wrap(x, w, (xx) => {
                ctx.fillStyle = '#16070a';
                ctx.beginPath(); ctx.moveTo(xx - w, y0);
                ctx.lineTo(xx - w * 0.18, y0 - h); ctx.lineTo(xx - w * 0.06, y0 - h * 0.92); ctx.lineTo(xx + w * 0.07, y0 - h * 0.95); ctx.lineTo(xx + w * 0.2, y0 - h * 0.99);
                ctx.lineTo(xx + w, y0); ctx.closePath(); ctx.fill();
                // жерло
                const g = ctx.createRadialGradient(xx, y0 - h, 0, xx, y0 - h, w * 0.45);
                g.addColorStop(0, 'rgba(255,190,80,0.9)'); g.addColorStop(0.3, 'rgba(255,90,30,0.5)'); g.addColorStop(1, 'rgba(255,60,20,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xx, y0 - h, w * 0.45, 0, Math.PI * 2); ctx.fill();
                // потоки
                ctx.strokeStyle = 'rgba(255,120,40,0.85)'; ctx.lineWidth = Math.max(1, W / 1400);
                for (let k = 0; k < 3; k++) {
                    ctx.beginPath(); let px = xx + (rnd() - 0.5) * w * 0.2, py = y0 - h * 0.95; ctx.moveTo(px, py);
                    for (let s = 0; s < 6; s++) { px += (rnd() - 0.5) * w * 0.18 + (k - 1) * w * 0.05; py += h / 6; ctx.lineTo(px, py); }
                    ctx.stroke();
                }
                // столб дыма
                for (let k = 0; k < 6; k++) {
                    const sy = y0 - h - k * h * 0.5, sr = w * (0.18 + k * 0.08);
                    const sg = ctx.createRadialGradient(xx + k * w * 0.06, sy, 0, xx + k * w * 0.06, sy, sr);
                    sg.addColorStop(0, `rgba(60,30,35,${0.5 - k * 0.06})`); sg.addColorStop(1, 'rgba(60,30,35,0)');
                    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(xx + k * w * 0.06, sy, sr, 0, Math.PI * 2); ctx.fill();
                }
            });
        }
        // лавовое море внизу: тёмная корка и светящиеся трещины
        ctx.lineCap = 'round';
        for (let i = 0; i < 160; i++) {
            const lon = rnd() * Math.PI * 2, lat = -(2 + Math.pow(rnd(), 1.4) * 70) * D;
            const x = P.X(lon), y = P.Y(lat), L = W * (0.01 + rnd() * 0.03) / Math.max(0.3, Math.cos(lat));
            P.wrap(x, L, (xx) => {
                ctx.strokeStyle = `rgba(255,${Math.round(90 + rnd() * 90)},40,${0.35 + rnd() * 0.5})`; ctx.lineWidth = Math.max(1, W / 1024 * (1 + rnd() * 2));
                ctx.beginPath(); ctx.moveTo(xx, y);
                let px = xx, py = y;
                for (let s = 0; s < 5; s++) { px += L / 5; py += (rnd() - 0.5) * L * 0.25; ctx.lineTo(px, py); }
                ctx.stroke();
            });
            if (i % 4 === 0) blob(lon, lat, (1 + rnd() * 3) * D, 'rgba(255,120,40,0.35)', 'rgba(255,90,30,0)', 1.4);
        }
    },

    // ---------------------------------------------------------------- подвижный слой облаков
    _paintCloudLayer(P, id) {
        const { ctx, D, rnd, blob, cloud, W } = P;
        if (id === 'world-1') {
            // перистые полосы в верхнем небе
            for (let i = 0; i < 70; i++) {
                const lon = rnd() * Math.PI * 2, lat = (18 + rnd() * 45) * D, L = (8 + rnd() * 18) * D;
                for (let k = 0; k < 6; k++) blob(lon + k * L / 6 / Math.cos(lat), lat + Math.sin(k) * 0.4 * D, (0.8 + rnd() * 0.8) * D, 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 4);
            }
            for (let i = 0; i < 14; i++) cloud(rnd() * Math.PI * 2, (10 + rnd() * 16) * D, (2 + rnd() * 2.5) * D, 'rgba(255,255,255,0.9)', 'rgba(200,205,240,0.5)', 7);
        } else if (id === 'world-2') {
            // длинные слоистые облака над портом
            for (let i = 0; i < 40; i++) {
                const lon = rnd() * Math.PI * 2, lat = (8 + rnd() * 34) * D, L = (6 + rnd() * 14) * D;
                for (let k = 0; k < 7; k++) blob(lon + k * L / 7 / Math.cos(lat), lat + Math.sin(k) * 0.3 * D, (0.9 + rnd() * 0.8) * D, 'rgba(215,224,232,0.5)', 'rgba(215,224,232,0)', 4);
            }
        } else {
            // пепельные тучи, подсвеченные лавой снизу
            for (let i = 0; i < 40; i++) {
                const lon = rnd() * Math.PI * 2, lat = (6 + rnd() * 34) * D, s = (3 + rnd() * 6) * D;
                cloud(lon, lat, s, 'rgba(70,40,55,0.8)', 'rgba(255,90,40,0.35)', 8);
            }
            ctx.globalAlpha = 1;
        }
        void W;
    },

    // Частицы у камеры: пыль и дымка (мир 2), угольки (мир 3).
    _particles(app, id) {
        const fx = app && app.fx;
        const cam = this.view && this.view.camera;
        if (!fx || !cam || id === 'world-1') return;
        const ahead = () => {
            const p = cam.position, t = cam.getTarget ? cam.getTarget() : p;
            const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1;
            return new BABYLON.Vector3(p.x + dx / l * 700, p.y - 100, p.z + dz / l * 700);
        };
        const h = id === 'world-2'
            ? fx.create({ texture: 'assets/fx/dust-puff.webp', blend: 'standard', rate: 10, capacity: 90, life: [2, 4], size: [30, 70], speed: [20, 60], follow: ahead,
                box: [[-1400, -500, -1400], [1400, 600, 1400]], direction: [[0.4, -0.05, -0.1], [1, 0.1, 0.1]], gravity: [0, 0, 0],
                colorGradient: [[0, '#dfe6ec', 0], [0.3, '#cfd8e0', 0.28], [1, '#cfd8e0', 0]] })
            : fx.create({ texture: 'assets/fx/flame.webp', rate: 26, capacity: 200, life: [1.6, 3.2], size: [8, 18], speed: [30, 90], follow: ahead,
                box: [[-1500, -700, -1500], [1500, 300, 1500]], direction: [[-0.3, 0.6, -0.3], [0.3, 1, 0.3]], gravity: [0, 60, 0],
                colorGradient: [[0, '#ffd27a', 0], [0.2, '#ff8a2a', 1], [1, '#ff3010', 0]] });
        if (h) this.fx.push(h);
    },

    /** Кадр: облака плывут; в мире 3 — молнии (вспышка неба). */
    update(dt) {
        if (!this.base || !this.def) return;
        this.t += dt;
        if (this.clouds) this.clouds.rotation.y += dt * this.def.drift;
        if (this.def.lightning) {
            this.nextFlash -= dt;
            if (this.nextFlash <= 0) { this.flashLeft = Math.random() < 0.5 ? 2 : 1; this.flash = 1; this.nextFlash = 7 + Math.random() * 9; }
            if (this.flash > 0) {
                this.flash -= dt * 9;
                if (this.flash <= 0 && this.flashLeft > 1) { this.flashLeft--; this.flash = 0.8; }
            }
            const k = Math.max(0, this.flash);
            const m = this.base.material;
            m.emissiveColor.set(k * 0.35, k * 0.3, k * 0.45);   // поверх текстуры: вспышка
        }
    },
};
