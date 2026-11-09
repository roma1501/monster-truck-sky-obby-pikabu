// GameCourse.js — трасса мира из деталей карты (модели assets/models/obby/*, контракт docs/DESIGN.md §3):
// разбор объектов карты в детали, точные коллайдеры (брус, цилиндр, клин, горб, капсулы молотов и балок),
// движение деталей (move / fall / spin / hammer / spinner), отрисовка кодом: индустриальные металлические плиты
// (клёпки, рифление, жёлто-чёрные полосы по краям) в мировом масштабе,
// статичные детали слиты в пачки по участкам и материалам (мало draw calls), подвижные — свои меши.
// Разрушаемые препятствия (модели break_crate / break_wall / break_car, имя `break coins=N`): коллайдер с флагом brk
// и модель с кусками Piece*; Game решает, когда сломать (Course.shatter), обломки летят по физике кусков в update().
// Нет модели — куски собираются кодом (ящик, стена, старая машина): игра не падает.
// Физика спрашивает только Course (rayDown, sphere), а не Babylon: решения одинаковы на всех устройствах.
//
// Координаты физики — как у Babylon: x — вправо (x карты), y — вверх (h), z — вниз по карте (y карты).

const COURSE_KIT_PREFIX = 'assets/models/obby/';
const COURSE_SQUARE = 240;          // px: плитка покрытия на верхней грани (текстура — 2×2 плитки)
const COURSE_CHUNK = 5000;          // px: участок слияния статичных деталей
const COURSE_GRID = 1024;           // px: клетка сетки поиска коллайдеров

// Тона шахматки (светлый, тёмный) по цветам деталей.
const COURSE_COLORS = {
    purple: [0xa77bff, 0x8a5cf0], orange: [0xf7b267, 0xe0904a], green: [0x8ee05a, 0x6cc43c],
    yellow: [0xfbe86a, 0xe8cf3e], red: [0xff6b6b, 0xe24c4c], blue: [0x5ab8ff, 0x3d97e6],
    pink: [0xff9ad5, 0xf173b9], mint: [0x7ef0c8, 0x4fd6a8], white: [0xffffff, 0xe3e8f0],
    dark: [0x4a4560, 0x36324a], ice: [0xd2f8ff, 0xa6e6f7],
};

// Оформление миров: небо (зенит, горизонт, низ), туман, свет, бока плит, музыка.
const COURSE_THEMES = {
    'world-1': { zenith: 0x2aa6ff, horizon: 0xaeeefa, low: 0xe9fdff, fog: 0.00007, side: 0x2c3a5c,
        sun: 0xfff1d6, sunI: 0.85, skyI: 0.5, skyLight: 0xbfe6ff, ground: 0xd8d0ff },
    'world-2': { zenith: 0x2f4558, horizon: 0x9db4c6, low: 0xe8c79a, fog: 0.00008, side: 0x2f4358,
        sun: 0xffc98a, sunI: 0.82, skyI: 0.55, skyLight: 0xb9d0e6, ground: 0x9fb0bf },
    'world-3': { zenith: 0x3b2a7a, horizon: 0xff9a5c, low: 0xffc58a, fog: 0.00009, side: 0x221519,
        sun: 0xffb36b, sunI: 0.9, skyI: 0.42, skyLight: 0xffb98a, ground: 0x8a4a3a },
};

/** @typedef {{ kind: string, O: number[], ax: number[], ay: number[], az: number[], hx?: number, hz?: number, y0?: number, y1?: number,
 *   rx?: number, rz?: number, sy?: number, a?: number[], b?: number[], r?: number, aabb: number[], piece?: any, dynamic?: boolean,
 *   enabled?: boolean, kill?: boolean, hazard?: boolean, ice?: boolean, boost?: number, jump?: number, wall?: boolean, planes?: number[][],
 *   prev?: any, cells?: string[] }} CourseCollider */

/** @satisfies {Record<string, any>} */
const Course = {
    /** @type {any} */ view: null,
    /** @type {any[]} */ pieces: [],
    /** @type {CourseCollider[]} */ colliders: [],
    /** @type {CourseCollider[]} */ dynamic: [],
    /** @type {Map<string, CourseCollider[]>} */ grid: new Map(),
    /** @type {any[]} */ breakables: [],
    /** @type {any[]} */ breakDefs: [],
    /** @type {any[]} */ debris: [],
    /** @type {Set<number> | null} */ _brokenSet: null,
    /** @type {any} */ _bm: null,
    /** @type {any} */ _bmScene: null,
    /** @type {any[]} */ meshes: [],
    /** @type {Record<string, any>} */ mats: {},
    /** @type {any} */ theme: null,
    /** @type {any} */ sky: null,
    /** @type {any} */ app: null,
    _mapId: '',
    time: 0,
    minTop: 0,
    /** @type {{ id: string, kit: any[] } | null} */ lastKit: null,
    _stamp: 0,
    _dt: 1 / 60,

    // ---------------------------------------------------------------------------------------------
    // Разбор
    // ---------------------------------------------------------------------------------------------

    /** Детали трассы — объекты с моделью из папки obby. */
    isKit(def) { return !!(def && def.model && String(def.model).startsWith(COURSE_KIT_PREFIX)); },

    /** 'move x=600 t=4' -> { role: 'move', x: 600, t: 4 } */
    params(name) {
        const out = { role: '' };
        const words = String(name || '').trim().split(/\s+/);
        if (!words.length) return out;
        out.role = /=/.test(words[0]) ? '' : words[0].toLowerCase();
        for (const w of words) {
            const m = /^([a-z]+)=(-?[\d.]+)$/i.exec(w);
            if (m) out[m[1].toLowerCase()] = Number(m[2]);
        }
        return out;
    },

    /** Деталь из записи карты: тип, цвет, размеры px, базовая поза и параметры. */
    parse(def) {
        const file = String(def.model).slice(COURSE_KIT_PREFIX.length).replace(/\.glb$/i, '');
        const us = file.indexOf('_');
        const type = us > 0 ? file.slice(0, us) : file;
        const color = us > 0 ? file.slice(us + 1) : '';
        const s = Array.isArray(def.scale) ? def.scale : [def.scale || 1, def.scale || 1, def.scale || 1];
        const r = Array.isArray(def.rot) ? def.rot : [0, def.rot || 0, 0];
        const D = Math.PI / 180;
        const M = BABYLON.Matrix.RotationYawPitchRoll(-(Number(r[1]) || 0) * D, (Number(r[0]) || 0) * D, (Number(r[2]) || 0) * D);
        const m = M.m;
        const prm = this.params(def.name);
        return {
            def, type, color, prm,
            sx: Math.max(1, (Number(s[0]) || 1) * 100), sy: Math.max(1, (Number(s[1]) || 1) * 100), sz: Math.max(1, (Number(s[2]) || 1) * 100),
            O: [Number(def.x) || 0, Number(def.h) || 0, Number(def.y) || 0],
            ax: [m[0], m[1], m[2]], ay: [m[4], m[5], m[6]], az: [m[8], m[9], m[10]],
            anim: def.anim || null,
        };
    },

    // ---------------------------------------------------------------------------------------------
    // Постройка мира
    // ---------------------------------------------------------------------------------------------

    /** Снести прошлую трассу и построить новую по деталям карты (в prepare под загрузкой). */
    build(app, kit) {
        this.clear();
        const view = this.view = app.location.view;
        const mapId = app.location.map.id;
        this.app = app; this._mapId = mapId;
        this.theme = COURSE_THEMES[mapId] || COURSE_THEMES['world-1'];
        this.time = 0;
        this.applyTheme(view, app.location.terrain);
        this._makeMaterials(view.scene);
        /** @type {Map<string, any>} */
        const chunks = new Map();
        let minTop = Infinity;
        for (const def of kit || []) {
            const p = this.parse(def);
            if (p.type === 'arrow') { this._addArrow(view, p); continue; }
            if (p.type === 'break') { p.bi = this.breakables.length; p.O = p.O.slice(); this.breakables.push(p); this.breakDefs.push(p); this.pieces.push(p); continue; }
            const dyn = this._isDynamic(p);
            p.dynamic = dyn;
            p.cols = this._collidersFor(p);
            for (const c of p.cols) { c.piece = p; c.dynamic = dyn; c.enabled = true; this.colliders.push(c); if (dyn) this.dynamic.push(c); else this._insert(c); }
            for (const c of p.cols) if (c.kind !== 'capsule' && !c.kill && c.aabb[4] > -1e6) minTop = Math.min(minTop, c.aabb[4]);
            if (dyn) this._buildDynamic(view, p);
            else {
                const cx = Math.floor(p.O[0] / COURSE_CHUNK), cz = Math.floor(p.O[2] / COURSE_CHUNK);
                const key = cx + ',' + cz;
                let b = chunks.get(key);
                if (!b) { b = this._builder(); chunks.set(key, b); }
                b.setTransform(p.O, p.ax, p.ay, p.az);
                this._geometry(b, p);
            }
            this.pieces.push(p);
        }
        this.minTop = Number.isFinite(minTop) ? minTop : 0;
        this._brokenSet = null;
        for (const b of chunks.values()) for (const mesh of b.toMeshes(view.scene, this.mats, 'course')) this._register(view, mesh, true);
        this.update(0);
    },

    clear() {
        const view = this.view;
        for (const m of this.meshes) { try { if (view) World3D.removeObject(view, m); else m.dispose(); } catch (e) { /* уже снят */ } }
        this.meshes = [];
        this.pieces = [];
        this.colliders = [];
        this.dynamic = [];
        this.grid = new Map();
        this.breakables = [];
        this.breakDefs = [];
        this.debris = [];
        this._brokenSet = null;
    },

    _register(view, mesh, isStatic) {
        mesh.isPickable = false;
        if (isStatic) { mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true; }
        World3D.addObject(view, mesh, 'prop', { outline: false });
        this.meshes.push(mesh);
        return mesh;
    },

    _isDynamic(p) {
        const r = p.prm.role;
        return r === 'move' || r === 'fall' || r === 'spin' || p.type === 'spinner' || p.type === 'hammer' || (p.anim && Number(p.anim.speed) > 0 && (p.type === 'cyl' || p.type === 'box'));
    },

    // ---------------------------------------------------------------------------------------------
    // Небо и свет мира
    // ---------------------------------------------------------------------------------------------

    applyTheme(view, terrainObj) {
        const t = this.theme;
        const mapId = view.scene && this._mapId ? this._mapId : 'world-1';
        // Свет, туман и небо мира — GameSky (свои панорамы у каждого мира); без него — градиент по теме.
        const lit = typeof GameSky !== 'undefined' ? GameSky.lighting(mapId, t)
            : { sky: t.horizon, fog: t.fog, sunColor: t.sun, sunIntensity: t.sunI, skyIntensity: t.skyI, skyLight: t.skyLight, groundLight: t.ground };
        delete lit._theme;
        World3D.setLighting(lit, view);
        const scene = view.scene;
        const far = typeof CAMERA_FAR !== 'undefined' ? CAMERA_FAR : 32000;
        view.camera.maxZ = far;
        if (this.sky) { try { this.sky.dispose(false, true); } catch (e) { /* уже */ } this.sky = null; }
        const R = far * 0.45;
        const hor = BABYLON.Color3.FromHexString('#' + Number(lit.sky).toString(16).padStart(6, '0'));
        if (typeof GameSky !== 'undefined') GameSky.build(view, mapId, R, this.app);
        else {
            const sky = BABYLON.MeshBuilder.CreateSphere('sky-dome', { diameter: R * 2, segments: 24, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
            const mat = new BABYLON.StandardMaterial('sky-mat', scene);
            mat.disableLighting = true; mat.emissiveColor = hor.clone(); mat.fogEnabled = false; mat.backFaceCulling = false; mat.disableDepthWrite = true;
            mat.metadata = { toon: false };
            sky.material = mat; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;
            this.sky = sky;
        }
        scene.clearColor = new BABYLON.Color4(hor.r, hor.g, hor.b, 1);
        // Земля карты — вспомогательная для редактора: в небесном мире её нет.
        const terrain = /** @type {any} */ (terrainObj);
        if (terrain) {
            for (const m of terrain.meshes || []) if (m && m.setEnabled) m.setEnabled(false);
            for (const m of [terrain.mesh, terrain.outer]) if (m && m.setEnabled) m.setEnabled(false);
            for (const w of terrain.waters || []) if (w && w.mesh && w.mesh.setEnabled) w.mesh.setEnabled(false);
        }
    },

    // ---------------------------------------------------------------------------------------------
    // Материалы
    // ---------------------------------------------------------------------------------------------

    _makeMaterials(scene) {
        for (const k in this.mats) { try { this.mats[k].dispose(true, true); } catch (e) { /* уже */ } }
        this.mats = {};
        const hex = (h) => BABYLON.Color3.FromHexString('#' + h.toString(16).padStart(6, '0'));
        const std = (name, color) => {
            const m = new BABYLON.StandardMaterial('course-' + name, scene);
            m.diffuseColor = color ? hex(color) : new BABYLON.Color3(1, 1, 1);
            m.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
            m.backFaceCulling = false;
            this.mats[name] = m;
            return m;
        };
        const tex = (name, size, draw) => {
            const t = new BABYLON.DynamicTexture('course-tex-' + name, { width: size, height: size }, scene, true);
            const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (t.getContext()));
            draw(ctx, size);
            t.update(true);
            t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 8;
            return t;
        };
        const css = (h) => '#' + h.toString(16).padStart(6, '0');
        const STEEL = 0x6c747e;
        for (const name of Object.keys(COURSE_COLORS)) {
            const [a, b] = COURSE_COLORS[name];
            const m = std('top:' + name, null);
            m.diffuseTexture = tex(name, 512, (ctx, n) => {
                // индустриальные плиты: крашеная сталь 2×2, фаска, рифление «ёлочкой», клёпки по углам, потёртости
                let seed = 1 + name.length * 977;
                const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
                const rgb = (h) => Array.isArray(h) ? h : [(h >> 16) & 255, (h >> 8) & 255, h & 255];
                const mix = (h1, h2, k) => { const c1 = rgb(h1), c2 = rgb(h2); return c1.map((v, i) => Math.round(v + (c2[i] - v) * k)); };
                const css = (c, k) => 'rgb(' + c.map(v => Math.max(0, Math.min(255, Math.round(v * (k == null ? 1 : k))))).join(',') + ')';
                const half = n / 2;
                const paint = (tx, ty) => name === 'ice' ? mix(a, b, 0.4) : mix(mix(a, b, (tx + ty) % 2 ? 0.45 : 0.1), STEEL, 0.2);
                for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
                    const x0 = tx * half, y0 = ty * half, col = paint(tx, ty);
                    ctx.fillStyle = css(col); ctx.fillRect(x0, y0, half, half);
                    // сталь с продольной шлифовкой
                    for (let i = 0; i < 90; i++) { const y = y0 + rnd() * half; ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; ctx.fillRect(x0 + 4, y, half - 8, 1); }
                    // рифление: ромбики через один под 45° и −45°
                    const step = 23, ds = 7;
                    for (let gy = 0; gy < 10; gy++) for (let gx = 0; gx < 10; gx++) {
                        const cx = x0 + 24 + gx * step, cy = y0 + 24 + gy * step;
                        if (cx > x0 + half - 16 || cy > y0 + half - 16) continue;
                        const dir = (gx + gy) % 2 ? 1 : -1;
                        ctx.save(); ctx.translate(cx, cy); ctx.rotate(dir * Math.PI / 4);
                        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-ds - 1, -2.4, ds * 2 + 2, 6);
                        ctx.fillStyle = css(col, 1.22); ctx.fillRect(-ds, -3, ds * 2, 5);
                        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(-ds, -3, ds * 2, 1.4);
                        ctx.restore();
                    }
                    // фаска плиты: светлая сверху-слева, тёмная снизу-справа
                    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x0, y0, half, 4); ctx.fillRect(x0, y0, 4, half);
                    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x0, y0 + half - 5, half, 5); ctx.fillRect(x0 + half - 5, y0, 5, half);
                    // клёпки по углам
                    for (const [rx, ry] of [[16, 16], [half - 16, 16], [16, half - 16], [half - 16, half - 16]]) {
                        const px = x0 + rx, py = y0 + ry;
                        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(px + 1.5, py + 2, 7.5, 0, Math.PI * 2); ctx.fill();
                        const g = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, 7.5);
                        g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.55, '#a5adb6'); g.addColorStop(1, '#5a626b');
                        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
                    }
                }
                // потёртости и ржавые подтёки
                for (let i = 0; i < 700; i++) { const x = rnd() * n, y = rnd() * n, r = 0.6 + rnd() * 1.7; ctx.fillStyle = rnd() < 0.55 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)'; ctx.fillRect(x, y, r, r); }
                for (let i = 0; i < 9; i++) { const x = rnd() * n, y = rnd() * n; const g = ctx.createRadialGradient(x, y, 0, x, y, 20 + rnd() * 24); g.addColorStop(0, 'rgba(120,64,28,.22)'); g.addColorStop(1, 'rgba(120,64,28,0)'); ctx.fillStyle = g; ctx.fillRect(x - 50, y - 50, 100, 100); }
                // швы между плитами
                ctx.fillStyle = 'rgba(8,10,14,.85)';
                for (const k of [0, half]) { ctx.fillRect(k - 1, 0, 3, n); ctx.fillRect(0, k - 1, n, 3); }
                ctx.fillRect(n - 2, 0, 2, n); ctx.fillRect(0, n - 2, n, 2);
            });
            if (name === 'ice') { m.specularColor = new BABYLON.Color3(0.7, 0.8, 0.9); m.specularPower = 48; }
            else { m.specularColor = new BABYLON.Color3(0.22, 0.22, 0.24); m.specularPower = 28; }
        }
        // бока плит — тёмная сталь с поясами заклёпок (двутавровая балка)
        const side = std('side', null);
        side.diffuseTexture = tex('side', 256, (ctx, n) => {
            const c = this.theme.side;
            const base = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => Math.round(v * 0.55 + 38));
            ctx.fillStyle = 'rgb(' + base.join(',') + ')'; ctx.fillRect(0, 0, n, n);
            for (let i = 0; i < n; i += 2) { ctx.fillStyle = (i * 7) % 5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)'; ctx.fillRect(0, i, n, 1); }
            for (const y of [0, n / 2]) {
                ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, y, n, 5);
                ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, y + 5, n, 2);
                for (let x = 14; x < n; x += 32) { ctx.fillStyle = '#8a929b'; ctx.beginPath(); ctx.arc(x, y + 20, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(x + 1, y + 21, 2.2, 0, Math.PI * 2); ctx.fill(); }
            }
        });
        // предупреждающие полосы по краям широких плит (жёлто-чёрная диагональ) и пунктир по центру
        const kerb = std('kerb', null);
        kerb.diffuseTexture = tex('kerb', 128, (ctx, n) => {
            ctx.fillStyle = '#ffc400'; ctx.fillRect(0, 0, n, n);
            ctx.fillStyle = '#15171b';
            for (let i = -n; i < n * 2; i += n / 2) { ctx.beginPath(); ctx.moveTo(i, n); ctx.lineTo(i + n / 4, n); ctx.lineTo(i + n / 4 + n, 0); ctx.lineTo(i + n, 0); ctx.closePath(); ctx.fill(); }
            ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, n * 0.84, n, n * 0.16);
            ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(0, 0, n, 4);
        });
        kerb.zOffset = -2;
        const dash = std('dash', 0xffc400);
        dash.emissiveColor = new BABYLON.Color3(0.28, 0.2, 0);
        dash.zOffset = -2;
        const kill = std('kill', 0xff4a1c);
        kill.emissiveColor = new BABYLON.Color3(0.9, 0.25, 0.05);
        kill.diffuseTexture = tex('lava', 256, (ctx, n) => {
            ctx.fillStyle = '#ff5a1a'; ctx.fillRect(0, 0, n, n);
            let seed = 7;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            for (let i = 0; i < 60; i++) {
                const x = rnd() * n, y = rnd() * n, r = 8 + rnd() * 26;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, '#ffe36b'); g.addColorStop(1, 'rgba(255,120,30,0)');
                ctx.fillStyle = g;
                for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); }
            }
        });
        kill.metadata = { toon: false };
        const boost = std('boost', 0xffffff);
        boost.emissiveColor = new BABYLON.Color3(0.35, 0.35, 0.35);
        boost.diffuseTexture = tex('boost', 256, (ctx, n) => {
            ctx.fillStyle = '#20c4ff'; ctx.fillRect(0, 0, n, n);
            ctx.fillStyle = '#fff36a'; ctx.strokeStyle = '#1b1240'; ctx.lineWidth = 8;
            for (const ox of [0, n / 2]) {
                ctx.beginPath();
                ctx.moveTo(ox + n * 0.06, n * 0.14); ctx.lineTo(ox + n * 0.3, n * 0.5); ctx.lineTo(ox + n * 0.06, n * 0.86);
                ctx.lineTo(ox + n * 0.2, n * 0.86); ctx.lineTo(ox + n * 0.44, n * 0.5); ctx.lineTo(ox + n * 0.2, n * 0.14); ctx.closePath();
                ctx.fill(); ctx.stroke();
            }
        });
        const jump = std('jump', 0xffffff);
        jump.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        jump.diffuseTexture = tex('jump', 256, (ctx, n) => {
            for (let i = 6; i > 0; i--) {
                ctx.fillStyle = i % 2 ? '#ff4fa3' : '#ffffff';
                ctx.beginPath(); ctx.arc(n / 2, n / 2, n / 2 * i / 6, 0, Math.PI * 2); ctx.fill();
            }
        });
        std('jumpside', 0x46d65a);
        std('pillar', 0xff3b4e);
        std('wood', 0xc98a4b);
        std('post', 0x8b93a8);
        std('bar', 0xff8c1a);
        std('arm', 0x9fb4c8);
        std('head', 0xd9893a);
        std('pivot', 0x3b3560);
    },

    // ---------------------------------------------------------------------------------------------
    // Геометрия деталей (локально, px; X вперёд, Y вверх, Z вправо)
    // ---------------------------------------------------------------------------------------------

    _builder() {
        /** @type {Record<string, { pos: number[], nrm: number[], uv: number[], idx: number[] }>} */
        const bufs = {};
        let O = [0, 0, 0], AX = [1, 0, 0], AY = [0, 1, 0], AZ = [0, 0, 1];
        const tp = (p) => [O[0] + p[0] * AX[0] + p[1] * AY[0] + p[2] * AZ[0], O[1] + p[0] * AX[1] + p[1] * AY[1] + p[2] * AZ[1], O[2] + p[0] * AX[2] + p[1] * AY[2] + p[2] * AZ[2]];
        const tn = (n) => [n[0] * AX[0] + n[1] * AY[0] + n[2] * AZ[0], n[0] * AX[1] + n[1] * AY[1] + n[2] * AZ[1], n[0] * AX[2] + n[1] * AY[2] + n[2] * AZ[2]];
        const buf = (key) => bufs[key] || (bufs[key] = { pos: [], nrm: [], uv: [], idx: [] });
        const api = {
            setTransform(o, ax, ay, az) { O = o; AX = ax; AY = ay; AZ = az; },
            /** Многоугольник (выпуклый, по кругу): точки, нормали (одна на всё или на точку), uv. */
            poly(key, pts, nrms, uvs) {
                const b = buf(key), base = b.pos.length / 3;
                for (let i = 0; i < pts.length; i++) {
                    const p = tp(pts[i]), n = tn(Array.isArray(nrms[0]) ? nrms[i] : nrms);
                    b.pos.push(p[0], p[1], p[2]); b.nrm.push(n[0], n[1], n[2]); b.uv.push(uvs[i][0], uvs[i][1]);
                }
                for (let i = 1; i + 1 < pts.length; i++) b.idx.push(base, base + i, base + i + 1);
            },
            toMeshes(scene, mats, name) {
                const out = [];
                for (const key of Object.keys(bufs)) {
                    const b = bufs[key];
                    if (!b.idx.length) continue;
                    const mesh = new BABYLON.Mesh(name + '-' + key, scene);
                    const vd = new BABYLON.VertexData();
                    vd.positions = b.pos; vd.normals = b.nrm; vd.uvs = b.uv; vd.indices = b.idx;
                    vd.applyToMesh(mesh, false);
                    mesh.material = mats[key] || mats.side;
                    out.push(mesh);
                }
                return out;
            },
        };
        return api;
    },

    _geometry(b, p) {
        const S = COURSE_SQUARE * 2;
        const top = p.color && COURSE_COLORS[p.color] ? 'top:' + p.color : 'top:white';
        const hx = p.sx / 2, hz = p.sz / 2;
        switch (p.type) {
            case 'box': this._box(b, hx, -p.sy, 0, hz, top, 'side', S); if (p.color !== 'ice') this._roadMarks(b, hx, hz); break;
            case 'kill': this._box(b, hx, -p.sy, 0, hz, 'kill', 'kill', S); break;
            case 'cyl': this._cyl(b, hx, hz, -p.sy, 0, 30, top, 'side', S); break;
            case 'ramp': this._wedge(b, hx, p.sy, hz, top, 'side', S); break;
            case 'arch': this._arch(b, hx, p.sy, hz, 28, top, 'side', S); break;
            case 'boost': this._box(b, hx, 0, 5, hz, 'boost', 'side', S); break;
            case 'jump': this._cyl(b, hx, hz, 0, 14, 30, 'jump', 'jumpside', p.sx); break;
            case 'pillar': this._box(b, hx, 0, p.sy, hz, 'pillar', 'pillar', S); break;
            case 'fence': this._fence(b, p.sx); break;
            case 'spinner': this._cyl(b, 20, 20, 0, p.sy + 26, 14, 'post', 'post', S); break;
            case 'hammer': this._box(b, 16, -16, 16, 16, 'pivot', 'pivot', S); break;
            default: this._box(b, hx, -p.sy, 0, hz, top, 'side', S);
        }
    },

    // Разметка на верхней грани бруса: бело-красные бордюры по длинным краям широких плит, пунктир по центру
    // очень широких и длинных (вид; коллайдеров нет, на физику не влияют).
    _roadMarks(b, hx, hz) {
        if (hz * 2 < 560 || hx * 2 < 500) return;
        const W = 46, y = 0.6, L = 160;
        for (const side of [-1, 1]) {
            const z0 = side > 0 ? hz - W : -hz, z1 = side > 0 ? hz : -hz + W;
            b.poly('kerb', [[-hx, y, z0], [-hx, y, z1], [hx, y, z1], [hx, y, z0]], [0, 1, 0], [[0, 0], [0, 1], [hx * 2 / L, 1], [hx * 2 / L, 0]]);
        }
        if (hz * 2 < 900 || hx * 2 < 1200) return;
        for (let x = -hx + 220; x + 180 < hx - 160; x += 420) {
            b.poly('dash', [[x, y, -9], [x, y, 9], [x + 180, y, 9], [x + 180, y, -9]], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        }
    },

    _box(b, hx, y0, y1, hz, topKey, sideKey, S) {
        const uvTop = (x, z) => [(x + hx) / S, (z + hz) / S];
        b.poly(topKey, [[-hx, y1, -hz], [-hx, y1, hz], [hx, y1, hz], [hx, y1, -hz]], [0, 1, 0],
            [uvTop(-hx, -hz), uvTop(-hx, hz), uvTop(hx, hz), uvTop(hx, -hz)]);
        const k = 1 / S;
        b.poly(sideKey, [[-hx, y0, -hz], [hx, y0, -hz], [hx, y0, hz], [-hx, y0, hz]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        b.poly(sideKey, [[hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], [hx, y0, hz]], [1, 0, 0], [[0, y0 * k], [0, y1 * k], [2 * hz * k, y1 * k], [2 * hz * k, y0 * k]]);
        b.poly(sideKey, [[-hx, y0, hz], [-hx, y1, hz], [-hx, y1, -hz], [-hx, y0, -hz]], [-1, 0, 0], [[0, y0 * k], [0, y1 * k], [2 * hz * k, y1 * k], [2 * hz * k, y0 * k]]);
        b.poly(sideKey, [[hx, y0, hz], [hx, y1, hz], [-hx, y1, hz], [-hx, y0, hz]], [0, 0, 1], [[0, y0 * k], [0, y1 * k], [2 * hx * k, y1 * k], [2 * hx * k, y0 * k]]);
        b.poly(sideKey, [[-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz], [hx, y0, -hz]], [0, 0, -1], [[0, y0 * k], [0, y1 * k], [2 * hx * k, y1 * k], [2 * hx * k, y0 * k]]);
    },

    _cyl(b, rx, rz, y0, y1, seg, topKey, sideKey, S) {
        const ring = [];
        for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; ring.push([Math.cos(a), Math.sin(a)]); }
        const uv = (x, z) => [(x + rx) / S, (z + rz) / S];
        b.poly(topKey, ring.map(([c, s]) => [c * rx, y1, s * rz]).reverse(), [0, 1, 0], ring.map(([c, s]) => uv(c * rx, s * rz)).reverse());
        b.poly(sideKey, ring.map(([c, s]) => [c * rx, y0, s * rz]), [0, -1, 0], ring.map(([c, s]) => uv(c * rx, s * rz)));
        for (let i = 0; i < seg; i++) {
            const [c0, s0] = ring[i], [c1, s1] = ring[(i + 1) % seg];
            const n0 = [c0 / rx, 0, s0 / rz], n1 = [c1 / rx, 0, s1 / rz];
            const l0 = Math.hypot(n0[0], n0[2]), l1 = Math.hypot(n1[0], n1[2]);
            b.poly(sideKey, [[c0 * rx, y0, s0 * rz], [c0 * rx, y1, s0 * rz], [c1 * rx, y1, s1 * rz], [c1 * rx, y0, s1 * rz]],
                [[n0[0] / l0, 0, n0[2] / l0], [n0[0] / l0, 0, n0[2] / l0], [n1[0] / l1, 0, n1[2] / l1], [n1[0] / l1, 0, n1[2] / l1]],
                [[i / seg, 0], [i / seg, 1], [(i + 1) / seg, 1], [(i + 1) / seg, 0]]);
        }
    },

    _wedge(b, hx, sy, hz, topKey, sideKey, S) {
        const len = Math.hypot(2 * hx, sy);
        const n = [-sy / len, 2 * hx / len, 0];
        b.poly(topKey, [[-hx, 0, -hz], [-hx, 0, hz], [hx, sy, hz], [hx, sy, -hz]], n,
            [[0, 0], [0, 2 * hz / S], [len / S, 2 * hz / S], [len / S, 0]]);
        b.poly(sideKey, [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        b.poly(sideKey, [[hx, 0, -hz], [hx, sy, -hz], [hx, sy, hz], [hx, 0, hz]], [1, 0, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        b.poly(sideKey, [[-hx, 0, hz], [hx, 0, hz], [hx, sy, hz]], [0, 0, 1], [[0, 0], [1, 0], [1, 1]]);
        b.poly(sideKey, [[-hx, 0, -hz], [hx, sy, -hz], [hx, 0, -hz]], [0, 0, -1], [[0, 0], [1, 1], [1, 0]]);
    },

    _arch(b, hx, sy, hz, seg, topKey, sideKey, S) {
        const pts = [];
        let arc = 0;
        for (let i = 0; i <= seg; i++) {
            const X = -1 + 2 * i / seg, x = X * hx, y = sy * (0.5 + 0.5 * Math.cos(Math.PI * X));
            if (i) arc += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y);
            const slope = -0.5 * Math.PI * Math.sin(Math.PI * X) * sy / hx;   // dy/dx
            const l = Math.hypot(slope, 1);
            pts.push({ x, y, nx: -slope / l, ny: 1 / l, u: arc / S });
        }
        for (let i = 0; i < seg; i++) {
            const a = pts[i], c = pts[i + 1];
            b.poly(topKey, [[a.x, a.y, -hz], [a.x, a.y, hz], [c.x, c.y, hz], [c.x, c.y, -hz]],
                [[a.nx, a.ny, 0], [a.nx, a.ny, 0], [c.nx, c.ny, 0], [c.nx, c.ny, 0]],
                [[a.u, 0], [a.u, 2 * hz / S], [c.u, 2 * hz / S], [c.u, 0]]);
        }
        b.poly(sideKey, [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        // бока — веером от середины низа (профиль невыпуклый у краёв, но звёздный относительно этой точки)
        const side = (zz, nz) => {
            for (let i = 0; i < seg; i++) {
                const a = pts[i], c = pts[i + 1];
                const tri = [[0, 0, zz], [a.x, a.y, zz], [c.x, c.y, zz]];
                b.poly(sideKey, nz > 0 ? tri : tri.reverse(), [0, 0, nz], [[0, 0], [a.x / S, a.y / S], [c.x / S, c.y / S]]);
            }
        };
        side(hz, 1); side(-hz, -1);
    },

    _fence(b, len) {
        const hx = len / 2, S = 200;
        const posts = Math.max(2, Math.round(len / 120) + 1);
        for (let i = 0; i < posts; i++) {
            const x = -hx + 6 + (len - 12) * i / (posts - 1);
            this._boxAt(b, x, 0, 6, 46, 6, 'wood', S);
        }
        this._boxAt(b, 0, 30, hx, 7, 4, 'wood', S);
        this._boxAt(b, 0, 12, hx, 6, 4, 'wood', S);
    },

    // Брус с центром (x, yc) в локальных осях детали: hx, hh, hz — полуразмеры.
    _boxAt(b, x, yc, hx, hh, hz, key, S) {
        const pts = (list) => list.map(([a, c, d]) => [a + x, c + yc, d]);
        const k = 1 / S;
        b.poly(key, pts([[-hx, hh, -hz], [-hx, hh, hz], [hx, hh, hz], [hx, hh, -hz]]), [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        b.poly(key, pts([[-hx, -hh, -hz], [hx, -hh, -hz], [hx, -hh, hz], [-hx, -hh, hz]]), [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        b.poly(key, pts([[hx, -hh, -hz], [hx, hh, -hz], [hx, hh, hz], [hx, -hh, hz]]), [1, 0, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        b.poly(key, pts([[-hx, -hh, hz], [-hx, hh, hz], [-hx, hh, -hz], [-hx, -hh, -hz]]), [-1, 0, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        b.poly(key, pts([[hx, -hh, hz], [hx, hh, hz], [-hx, hh, hz], [-hx, -hh, hz]]), [0, 0, 1], [[0, 0], [0, hh * k], [hx * k, hh * k], [hx * k, 0]]);
        b.poly(key, pts([[-hx, -hh, -hz], [-hx, hh, -hz], [hx, hh, -hz], [hx, -hh, -hz]]), [0, 0, -1], [[0, 0], [0, hh * k], [hx * k, hh * k], [hx * k, 0]]);
    },

    // Подвижная деталь: свой корень, части в локальных осях; поза ставится в update.
    _buildDynamic(view, p) {
        const scene = view.scene;
        const root = new BABYLON.Mesh('dyn-' + p.type, scene);
        root.rotationQuaternion = new BABYLON.Quaternion();
        const S = COURSE_SQUARE * 2;
        const top = p.color && COURSE_COLORS[p.color] ? 'top:' + p.color : 'top:white';
        const hx = p.sx / 2, hz = p.sz / 2;
        const make = (fill) => { const b = this._builder(); fill(b); for (const m of b.toMeshes(scene, this.mats, 'dyn')) { m.parent = root; m.isPickable = false; } };
        if (p.type === 'spinner') {
            make(b => this._cyl(b, 20, 20, 0, p.sy + 26, 14, 'post', 'post', S));
            const bar = new BABYLON.Mesh('spinner-bar', scene);
            bar.parent = root;
            bar.rotationQuaternion = new BABYLON.Quaternion();
            const bb = this._builder();
            const t = Math.max(16, p.sz / 2);
            this._boxAt(bb, 0, p.sy, hx, t, t, 'bar', S);
            for (const m of bb.toMeshes(scene, this.mats, 'bar')) { m.parent = bar; m.isPickable = false; }
            p.barNode = bar;
        } else if (p.type === 'hammer') {
            make(b => this._boxAt(b, 0, 0, 18, 18, 18, 'pivot', S));
            const arm = new BABYLON.Mesh('hammer-swing', scene);
            arm.parent = root;
            arm.rotationQuaternion = new BABYLON.Quaternion();
            const ab = this._builder();
            this._boxAt(ab, 0, -p.sy / 2, 9, p.sy / 2, 9, 'arm', S);
            for (const m of ab.toMeshes(scene, this.mats, 'arm')) { m.parent = arm; m.isPickable = false; }
            const head = BABYLON.MeshBuilder.CreateCylinder('hammer-head', { diameter: p.sx, height: p.sz, tessellation: 20 }, scene);
            head.material = this.mats.head;
            head.parent = arm;
            head.rotation.x = Math.PI / 2;
            head.position.y = -p.sy;
            head.isPickable = false;
            p.armNode = arm;
        } else {
            make(b => this._geometry(b, p));
        }
        World3D.addObject(view, root, 'prop', { outline: false });
        this.meshes.push(root);
        p.node = root;
        p.base = { O: p.O.slice(), ax: p.ax.slice(), ay: p.ay.slice(), az: p.az.slice() };
        p.fallState = 'idle'; p.fallT = 0; p.fallDrop = 0; p.fallVel = 0;
        void top; void hz;
    },

    // Парящая стрелка-подсказка: модель arrow.glb (если есть) или шеврон кодом; без коллизии.
    _addArrow(view, p) {
        const scene = view.scene;
        const root = new BABYLON.Mesh('arrow', scene);
        const b = this._builder();
        const w = 46, l = 70;
        b.poly('boost', [[-l, 0, -w], [0, 0, -w], [l * 0.9, 0, 0], [0, 0, w], [-l, 0, w], [-l * 0.1, 0, 0]].reverse(), [0, 1, 0],
            [[0, 0], [0.5, 0], [1, 0.5], [0.5, 1], [0, 1], [0.45, 0.5]].reverse());
        for (const m of b.toMeshes(scene, this.mats, 'arrow')) { m.parent = root; m.isPickable = false; }
        root.position.set(p.O[0], p.O[1], p.O[2]);
        root.rotationQuaternion = BABYLON.Quaternion.FromRotationMatrix(BABYLON.Matrix.FromValues(
            p.ax[0], p.ax[1], p.ax[2], 0, p.ay[0], p.ay[1], p.ay[2], 0, p.az[0], p.az[1], p.az[2], 0, 0, 0, 0, 1));
        root.rotate(BABYLON.Axis.X, -Math.PI / 2, BABYLON.Space.LOCAL);
        const s = Math.max(0.5, p.sx / 100);
        root.scaling.set(s, s, s);
        World3D.addObject(view, root, 'prop', { outline: false, castShadow: false });
        this.meshes.push(root);
        p.node = root; p.arrow = true; p.baseH = p.O[1];
        this.pieces.push(p);
    },

    // ---------------------------------------------------------------------------------------------
    // Разрушаемые препятствия: ящики, стены из блоков, старые машины
    // ---------------------------------------------------------------------------------------------

    /** Разрушаемая деталь — модель break_* (ящик, стена, машина). */
    isBreakable(p) { return !!p && p.type === 'break'; },

    /** Есть ли в мире разрушаемые, ещё целые (для обучения). */
    hasBreakables() { return this.breakables.some(p => p.brk && p.brk.state === 'idle'); },

    /** Ближайшее целое разрушаемое впереди точки (x, z): { x, y, z } или null — подсказка обучения. */
    nearestBreakable(x, z, fx, fz) {
        let best = null, bd = Infinity;
        for (const p of this.breakables) {
            if (!p.brk || p.brk.state !== 'idle') continue;
            const dx = p.O[0] - x, dz = p.O[2] - z, d = Math.hypot(dx, dz);
            if (d < 150 || d > 9000 || (fx || fz) && (dx * fx + dz * fz) / d < 0.2) continue;
            if (d < bd) { bd = d; best = { x: p.O[0], y: p.O[1], z: p.O[2] }; }
        }
        return best;
    },

    /** После build(): загрузить модели разрушаемых (параллельно, с кэшем Model3D) и собрать коллайдеры и меши. */
    async loadBreakables() {
        const list = this.breakDefs;
        this.breakDefs = [];
        const mapId = this._mapId;
        const models = {};
        const urls = Array.from(new Set(list.map(p => String(p.def.model))));
        await Promise.all(urls.map(async (u) => {
            try { models[u] = await Model3D.load(u); } catch (e) { models[u] = null; }
        }));
        if (mapId !== this._mapId || !this.view) return;
        for (const p of list) this._makeBreakable(p, models[String(p.def.model)]);
    },

    // Размеры запасной модели по виду (px, начало — центр низа), умножаются на scale объекта.
    _breakFallback(kind) {
        if (kind === 'wall') return [90, 260, 520];
        if (kind === 'car') return [440, 150, 190];
        return [130, 130, 130];
    },

    _makeBreakable(p, model) {
        const view = this.view, scene = view.scene;
        const kind = p.color === 'wall' || p.color === 'car' ? p.color : 'crate';
        const sc = Array.isArray(p.def.scale) ? p.def.scale : [p.def.scale || 1, p.def.scale || 1, p.def.scale || 1];
        const S = [Math.max(0.05, Number(sc[0]) || 1), Math.max(0.05, Number(sc[1]) || 1), Math.max(0.05, Number(sc[2]) || 1)];
        const pieces = [];
        let lo, hi, root;
        const hasModel = !!(model && model.parts && model.parts.length && Number.isFinite(model.min[0]));
        if (hasModel) {
            lo = model.min.slice(); hi = model.max.slice();
            root = Model3D.build(model, scene, { name: 'break-' + kind });
            root.scaling.set(S[0], S[1], S[2]);
            for (const m of root.getChildMeshes(true)) {
                const part = String((m.metadata && m.metadata.part) || m.name || '');
                m.isPickable = false;
                if (!/piece/i.test(part)) continue;
                const bb = m.getBoundingInfo().boundingBox;
                const c = bb.center.clone();
                const node = new BABYLON.TransformNode('piece', scene);
                node.parent = root; node.position.copyFrom(c); node.rotationQuaternion = new BABYLON.Quaternion();
                m.parent = node; m.position.set(-c.x, -c.y, -c.z);
                const ext = bb.extendSize;
                pieces.push({ node, mesh: m, r: Math.max(8, Math.min(ext.x * S[0], ext.y * S[1], ext.z * S[2])), home: { pos: c.clone() } });
            }
            if (!pieces.length) {   // куски не размечены: вся модель — один обломок
                const node = new BABYLON.TransformNode('piece', scene);
                node.parent = root; node.rotationQuaternion = new BABYLON.Quaternion();
                for (const m of root.getChildMeshes(true)) m.parent = node;
                pieces.push({ node, mesh: null, r: 40, home: { pos: BABYLON.Vector3.Zero() } });
            }
        } else {
            const fb = this._breakFallback(kind);
            const w = fb[0] * S[0], h = fb[1] * S[1], d = fb[2] * S[2];
            lo = [-w / 2, 0, -d / 2]; hi = [w / 2, h, d / 2];
            root = new BABYLON.Mesh('break-' + kind, scene);
            this._fallbackPieces(root, kind, w, h, d, pieces, scene);
        }
        root.rotationQuaternion = BABYLON.Quaternion.FromRotationMatrix(BABYLON.Matrix.FromValues(
            p.ax[0], p.ax[1], p.ax[2], 0, p.ay[0], p.ay[1], p.ay[2], 0, p.az[0], p.az[1], p.az[2], 0, 0, 0, 0, 1));
        root.position.set(p.O[0], p.O[1], p.O[2]);
        for (const pc of pieces) pc.home.q = pc.node.rotationQuaternion.clone();
        for (const pc of pieces) pc.home.s = pc.node.scaling.clone();
        World3D.addObject(view, root, 'prop', { outline: false });
        for (const m of root.getChildMeshes(false)) m.isPickable = false;
        this.meshes.push(root);
        // коллайдер: брус по габариту модели (в локальных осях объекта, центр сдвинут в O')
        const sx = hasModel ? S[0] : 1, sy = hasModel ? S[1] : 1, sz = hasModel ? S[2] : 1;
        const cx = (lo[0] + hi[0]) / 2 * sx, cz = (lo[2] + hi[2]) / 2 * sz;
        const O = [p.O[0] + p.ax[0] * cx + p.az[0] * cz, p.O[1] + p.ax[1] * cx + p.az[1] * cz, p.O[2] + p.ax[2] * cx + p.az[2] * cz];
        const col = { O, ax: p.ax.slice(), ay: p.ay.slice(), az: p.az.slice(), aabb: [0, 0, 0, 0, 0, 0], kind: 'box',
            hx: Math.max(10, (hi[0] - lo[0]) / 2 * sx), hz: Math.max(10, (hi[2] - lo[2]) / 2 * sz), y0: lo[1] * sy, y1: hi[1] * sy,
            brk: true, piece: p, dynamic: false, enabled: true };
        this._aabb(col);
        this.colliders.push(col);
        this._insert(col);
        p.cols = [col];
        p.brk = { kind, state: 'idle', root, pieces, col, size: [col.hx * 2, col.y1 - col.y0, col.hz * 2], age: 0 };
        // уже сломанное в этом заезде (сохранение) — сразу спрятать
        if (this._brokenSet && this._brokenSet.has(p.bi)) this._hideBreakable(p);
    },

    // Запасные куски кодом: ящик — 8 кубов, стена — кирпичи, машина — кузов, кабина и 4 колеса.
    _fallbackPieces(root, kind, w, h, d, pieces, scene) {
        const mats = this._breakMats(scene);
        const add = (mat, cx, cy, cz, sx, sy, sz) => {
            const m = BABYLON.MeshBuilder.CreateBox('Piece', { width: sx, height: sy, depth: sz }, scene);
            const node = new BABYLON.TransformNode('piece', scene);
            node.parent = root; node.position.set(cx, cy, cz); node.rotationQuaternion = new BABYLON.Quaternion();
            m.parent = node; m.material = mat; m.isPickable = false;
            pieces.push({ node, mesh: m, r: Math.max(8, Math.min(sx, sy, sz) / 2), home: { pos: node.position.clone() } });
        };
        if (kind === 'crate') {
            const hw = w / 2, hh = h / 2, hd = d / 2;
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
                add((i + j + k) % 2 ? mats.wood : mats.woodDark, -hw / 2 + i * hw, hh / 2 + j * hh, -hd / 2 + k * hd, hw - 2, hh - 2, hd - 2);
            }
        } else if (kind === 'wall') {
            const cols = 5, rows = 5, bw = d / cols, bh = h / rows;
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                const off = r % 2 ? bw / 2 : 0;
                if (c === cols - 1 && r % 2) continue;
                add((r + c) % 3 === 0 ? mats.brickDark : (r + c) % 3 === 1 ? mats.brick : mats.concrete, 0, bh / 2 + r * bh, -d / 2 + bw / 2 + off + c * bw, w - 2, bh - 3, bw - 3);
            }
        } else {
            add(mats.rust, 0, h * 0.34, 0, w * 0.98, h * 0.3, d * 0.96);
            add(mats.rustDark, w * 0.3, h * 0.55, 0, w * 0.3, h * 0.16, d * 0.9);
            add(mats.rust, -w * 0.08, h * 0.74, 0, w * 0.4, h * 0.26, d * 0.84);
            add(mats.glass, -w * 0.08, h * 0.76, 0, w * 0.34, h * 0.18, d * 0.86);
            for (const [fx, fz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) add(mats.tire, fx * w * 0.32, h * 0.16, fz * d * 0.46, h * 0.34, h * 0.32, h * 0.2);
        }
    },

    _breakMats(scene) {
        if (this._bm && this._bmScene === scene) return this._bm;
        const mk = (name, hex, spec) => {
            const m = new BABYLON.StandardMaterial('brk-' + name, scene);
            m.diffuseColor = BABYLON.Color3.FromHexString(hex); m.specularColor = new BABYLON.Color3(spec || 0.08, spec || 0.08, spec || 0.08);
            return m;
        };
        this._bmScene = scene;
        this._bm = {
            wood: mk('wood', '#b98750'), woodDark: mk('woodd', '#8f6638'), brick: mk('brick', '#b05a3c'), brickDark: mk('brickd', '#8a4630'),
            concrete: mk('conc', '#9aa0a6'), rust: mk('rust', '#c25a2b'), rustDark: mk('rustd', '#8d3f1e'), glass: mk('glass', '#27384a', 0.4),
            tire: mk('tire', '#17191d'),
        };
        return this._bm;
    },

    _hideBreakable(p) {
        const b = p.brk;
        if (!b) return;
        b.state = 'broken';
        for (const c of p.cols) c.enabled = false;
        b.root.setEnabled(false);
    },

    /**
     * Какие разрушаемые уже сломаны в этом заезде (индексы из сохранения): их скрыть, остальные — восстановить целыми.
     * @param {number[]} [list]
     */
    applyBroken(list) {
        const set = new Set(list || []);
        this._brokenSet = set;
        this.debris.length = 0;
        for (const p of this.breakables) {
            const b = p.brk;
            if (!b) continue;
            if (set.has(p.bi)) { this._hideBreakable(p); continue; }
            // восстановить: куски — обратно в корень, на свои места
            for (const pc of b.pieces) {
                pc.node.setParent(null);
                pc.node.parent = b.root;
                pc.node.position.copyFrom(pc.home.pos); pc.node.rotationQuaternion.copyFrom(pc.home.q); pc.node.scaling.copyFrom(pc.home.s);
                pc.node.setEnabled(true); pc.dead = false;
            }
            b.root.setEnabled(true);
            b.state = 'idle';
            for (const c of p.cols) c.enabled = true;
        }
    },

    /** Номера сломанных (для сохранения заезда). */
    brokenList() { return this.breakables.filter(p => p.brk && p.brk.state === 'broken').map(p => p.bi); },

    /**
     * Разнести препятствие. info: { car, q (точка удара), mode: 'side' | 'top', crush }. Куски получают скорость
     * от трака и от точки удара; сплющенная машина — куски почти на месте, приплюснутые.
     */
    shatter(p, info) {
        const b = p.brk;
        if (!b || b.state !== 'idle') return false;
        b.state = 'broken';
        for (const c of p.cols) c.enabled = false;
        const car = info && info.car, q = (info && info.q) || p.O;
        const crush = !!(info && info.crush);
        const v = car ? car.v : [0, 0, 0];
        const rnd = (a, c) => a + Math.random() * (c - a);
        b.root.computeWorldMatrix(true);
        for (const pc of b.pieces) {
            pc.node.computeWorldMatrix(true);
            const wp = pc.node.getAbsolutePosition().clone();
            const wq = pc.node.absoluteRotationQuaternion ? pc.node.absoluteRotationQuaternion.clone() : pc.node.rotationQuaternion.clone();
            const ws = pc.node.absoluteScaling ? pc.node.absoluteScaling.clone() : new BABYLON.Vector3(1, 1, 1);
            pc.node.setParent(null);
            pc.node.position.copyFrom(wp); pc.node.rotationQuaternion = wq; pc.node.scaling.copyFrom(ws);
            let dx = wp.x - q[0], dy = wp.y - q[1], dz = wp.z - q[2];
            const dl = Math.hypot(dx, dy, dz) || 1;
            dx /= dl; dy /= dl; dz /= dl;
            const out = crush ? rnd(120, 300) : rnd(300, 900);
            const k = crush ? 0.25 : rnd(0.55, 1.0);
            if (crush) pc.node.scaling.y *= 0.35;
            pc.v = [v[0] * k + dx * out, (crush ? rnd(60, 220) : rnd(380, 1100)) + Math.max(0, dy) * 300, v[2] * k + dz * out];
            pc.w = [rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)];
            if (crush) pc.w = [rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)];
            pc.age = 0; pc.dead = false;
            this.debris.push(pc);
        }
        // не даём куче расти бесконечно: самые старые тают раньше
        while (this.debris.length > 220) { const o = this.debris.shift(); if (o && o.node) o.node.setEnabled(false); }
        return true;
    },

    _updateDebris(dt) {
        const list = this.debris;
        if (!list.length) return;
        const g = typeof CAR_GRAVITY !== 'undefined' ? CAR_GRAVITY : 3200;
        const life = typeof RAM_DEBRIS_LIFE !== 'undefined' ? RAM_DEBRIS_LIFE : 3.4;
        const q = new BABYLON.Quaternion();
        for (let i = list.length - 1; i >= 0; i--) {
            const pc = list[i], n = pc.node;
            pc.age += dt;
            if (pc.age > life + 0.7 || n.position.y < this.minTop - 4000) { n.setEnabled(false); pc.dead = true; list.splice(i, 1); continue; }
            const P = n.position, V = pc.v;
            V[1] -= g * dt;
            P.x += V[0] * dt; P.y += V[1] * dt; P.z += V[2] * dt;
            // пол: опора под куском (плита) — отскок с потерей энергии
            const r = pc.r;
            if (V[1] <= 0) {
                const hit = this.rayDown(P.x, P.y + r, P.z, r * 2 + 40, 0.3);
                if (hit && P.y - r * 0.6 < hit.y) {
                    P.y = hit.y + r * 0.6;
                    if (V[1] < -260) { V[1] = -V[1] * 0.32; V[0] *= 0.72; V[2] *= 0.72; for (let k = 0; k < 3; k++) pc.w[k] *= 0.7; }
                    else { V[1] = 0; V[0] *= 0.86; V[2] *= 0.86; for (let k = 0; k < 3; k++) pc.w[k] *= 0.8; }
                }
            }
            const wl = Math.hypot(pc.w[0], pc.w[1], pc.w[2]);
            if (wl > 1e-3) {
                BABYLON.Quaternion.RotationAxisToRef(new BABYLON.Vector3(pc.w[0] / wl, pc.w[1] / wl, pc.w[2] / wl), wl * dt, q);
                q.multiplyToRef(n.rotationQuaternion, n.rotationQuaternion);
            }
            if (pc.age > life) { n.scaling.scaleInPlace(Math.max(0, 1 - dt * 2.4)); }
        }
    },

    // ---------------------------------------------------------------------------------------------
    // Коллайдеры
    // ---------------------------------------------------------------------------------------------

    _collidersFor(p) {
        const hx = p.sx / 2, hz = p.sz / 2;
        const base = { O: p.O.slice(), ax: p.ax.slice(), ay: p.ay.slice(), az: p.az.slice(), aabb: [0, 0, 0, 0, 0, 0] };
        const out = [];
        const add = (c) => { out.push(c); this._aabb(c); return c; };
        const ice = p.color === 'ice';
        switch (p.type) {
            case 'box': add({ ...base, kind: 'box', hx, hz, y0: -p.sy, y1: 0, ice }); break;
            case 'kill': add({ ...base, kind: 'box', hx, hz, y0: -p.sy, y1: 0, kill: true }); break;
            case 'cyl': add({ ...base, kind: 'cyl', rx: hx, rz: hz, y0: -p.sy, y1: 0, ice }); break;
            case 'ramp': add(this._wedgeCol({ ...base, kind: 'wedge', hx, hz, sy: p.sy, ice })); break;
            case 'arch': add(this._archCol({ ...base, kind: 'arch', hx, hz, sy: p.sy, ice })); break;
            case 'boost': add({ ...base, kind: 'box', hx, hz, y0: 0, y1: 5, boost: p.prm.v || (typeof CAR_BOOST_SPEED !== 'undefined' ? CAR_BOOST_SPEED : 3600) }); break;
            case 'jump': add({ ...base, kind: 'cyl', rx: hx, rz: hz, y0: 0, y1: 14, jump: p.prm.v || 2300 }); break;
            case 'pillar': add({ ...base, kind: 'box', hx, hz, y0: 0, y1: p.sy, wall: true }); break;
            case 'fence': add({ ...base, kind: 'box', hx, hz: 6, y0: 0, y1: 46, wall: true }); break;
            case 'spinner': {
                add({ ...base, kind: 'cyl', rx: 20, rz: 20, y0: 0, y1: p.sy + 26, wall: true });
                const t = Math.max(16, p.sz / 2);
                add({ ...base, kind: 'capsule', a: [0, 0, 0], b: [0, 0, 0], r: t, hazard: true, local: { a: [-hx, p.sy, 0], b: [hx, p.sy, 0] } });
                break;
            }
            case 'hammer': {
                add({ ...base, kind: 'capsule', a: [0, 0, 0], b: [0, 0, 0], r: 10, hazard: true, local: { a: [0, 0, 0], b: [0, -p.sy, 0] } });
                add({ ...base, kind: 'capsule', a: [0, 0, 0], b: [0, 0, 0], r: p.sx / 2, hazard: true, local: { a: [0, -p.sy, -Math.max(0, hz - hx)], b: [0, -p.sy, Math.max(0, hz - hx)] } });
                break;
            }
            default: add({ ...base, kind: 'box', hx, hz, y0: -p.sy, y1: 0 });
        }
        for (const c of out) if (c.kind === 'capsule') this._capsuleWorld(c, p, 0);
        for (const c of out) this._aabb(c);
        return out;
    },

    _wedgeCol(c) {
        const len = Math.hypot(2 * c.hx, c.sy);
        const n = [-c.sy / len, 2 * c.hx / len, 0];
        c.planes = [
            [0, -1, 0, 0], [1, 0, 0, c.hx], [-1, 0, 0, c.hx], [0, 0, 1, c.hz], [0, 0, -1, c.hz],
            [n[0], n[1], n[2], n[0] * -c.hx],
        ];
        c.poly = [[-c.hx, 0], [c.hx, 0], [c.hx, c.sy]];
        return c;
    },

    // Горб: профиль — полуэллипс многоугольником (точная сфера-коллизия выпуклой призмы).
    _archCol(c) {
        const n = 32;
        // против часовой (вид с +Z): низ слева -> низ справа -> по холму справа налево
        c.poly = [[-c.hx, 0], [c.hx, 0]];
        for (let i = 1; i < n; i++) { const X = 1 - 2 * i / n; c.poly.push([X * c.hx, c.sy * (0.5 + 0.5 * Math.cos(Math.PI * X))]); }
        return c;
    },

    // Точка в многоугольнике (чётность пересечений; годится и для невыпуклого).
    _inPoly(poly, x, y) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i], b = poly[j];
            if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
    },

    // Сфера против призмы: многоугольник poly в плоскости XY (против часовой), вытянут по Z на ±hz.
    _prismHit(poly, hz, o, r) {
        const n = poly.length;
        let best = Infinity, bq = null, bn = null;
        for (let i = 0; i < n; i++) {
            const a = poly[i], b = poly[(i + 1) % n];
            const ex = b[0] - a[0], ey = b[1] - a[1];
            const l2 = ex * ex + ey * ey || 1;
            let t = ((o[0] - a[0]) * ex + (o[1] - a[1]) * ey) / l2;
            t = Math.max(0, Math.min(1, t));
            const qx = a[0] + ex * t, qy = a[1] + ey * t;
            const d = (o[0] - qx) * (o[0] - qx) + (o[1] - qy) * (o[1] - qy);
            if (d < best) { best = d; bq = [qx, qy]; const l = Math.sqrt(l2); bn = [ey / l, -ex / l]; }
        }
        const inside = this._inPoly(poly, o[0], o[1]);
        const z = o[2];
        if (inside && Math.abs(z) <= hz) {
            const dz = hz - Math.abs(z), de = Math.sqrt(best);
            if (dz < de) return { depth: r + dz, nl: [0, 0, z >= 0 ? 1 : -1], q: [o[0], o[1], z >= 0 ? hz : -hz] };
            return { depth: r + de, nl: [bn[0], bn[1], 0], q: [bq[0], bq[1], z] };
        }
        const q = inside ? [o[0], o[1], z >= 0 ? hz : -hz] : [bq[0], bq[1], Math.max(-hz, Math.min(hz, z))];
        const dx = o[0] - q[0], dy = o[1] - q[1], dzz = o[2] - q[2];
        const dd = Math.hypot(dx, dy, dzz);
        if (dd >= r || dd < 1e-6) return null;
        return { depth: r - dd, nl: [dx / dd, dy / dd, dzz / dd], q };
    },

    // Луч против призмы (невыпуклой тоже): вход через боковой контур или торец Z. Старт внутри — не опора.
    _rayPrism(o, d, poly, hz, smooth) {
        let tz0 = -Infinity, tz1 = Infinity;
        if (Math.abs(d[2]) < 1e-9) { if (Math.abs(o[2]) > hz) return null; }
        else { tz0 = (-hz - o[2]) / d[2]; tz1 = (hz - o[2]) / d[2]; if (tz0 > tz1) { const t = tz0; tz0 = tz1; tz1 = t; } }
        if (Math.abs(o[2]) <= hz && this._inPoly(poly, o[0], o[1])) return null;
        let bestT = Infinity, bestN = null;
        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const a = poly[i], b = poly[(i + 1) % n];
            const ex = b[0] - a[0], ey = b[1] - a[1];
            const den = d[0] * ey - d[1] * ex;
            if (Math.abs(den) < 1e-12) continue;
            const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
            const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
            if (u < 0 || u > 1 || t < 0 || t >= bestT || t < tz0 || t > tz1) continue;
            const l = Math.hypot(ex, ey) || 1, nx = ey / l, ny = -ex / l;
            if (nx * d[0] + ny * d[1] >= 0) continue;          // выход, а не вход
            if (!smooth) { bestT = t; bestN = [nx, ny, 0]; continue; }   // клин: грани острые — нормаль грани как есть
            // нормаль сглажена между соседними рёбрами (холм без «граней» под колесом)
            const pa = poly[(i - 1 + n) % n], pb = poly[(i + 2) % n];
            const na = this._edgeN(pa, a), nb = this._edgeN(b, pb);
            const va = [(na[0] + nx) / 2, (na[1] + ny) / 2], vb = [(nb[0] + nx) / 2, (nb[1] + ny) / 2];
            let sx = va[0] + (vb[0] - va[0]) * u, sy = va[1] + (vb[1] - va[1]) * u;
            const sl = Math.hypot(sx, sy) || 1;
            sx /= sl; sy /= sl;
            if (sx * nx + sy * ny < 0.7) { sx = nx; sy = ny; }   // острый угол — без сглаживания
            bestT = t; bestN = [sx, sy, 0];
        }
        if (tz0 > 0 && tz0 < bestT) {
            const x = o[0] + d[0] * tz0, y = o[1] + d[1] * tz0;
            if (this._inPoly(poly, x, y)) { bestT = tz0; bestN = [0, 0, d[2] > 0 ? -1 : 1]; }
        }
        return bestN ? { t: bestT, n: bestN } : null;
    },

    _edgeN(a, b) { const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1; return [ey / l, -ex / l]; },

    _capsuleWorld(c, p, angle) {
        const L = c.local;
        const rot = (v) => {
            if (p.type === 'spinner') {   // вращение вокруг локальной Y
                const ca = Math.cos(angle), sa = Math.sin(angle);
                return [v[0] * ca + v[2] * sa, v[1], -v[0] * sa + v[2] * ca];
            }
            if (p.type === 'hammer') {    // качание вокруг локальной X
                const ca = Math.cos(angle), sa = Math.sin(angle);
                return [v[0], v[1] * ca - v[2] * sa, v[1] * sa + v[2] * ca];
            }
            return v;
        };
        const w = (v) => { const q = rot(v); return [c.O[0] + q[0] * c.ax[0] + q[1] * c.ay[0] + q[2] * c.az[0], c.O[1] + q[0] * c.ax[1] + q[1] * c.ay[1] + q[2] * c.az[1], c.O[2] + q[0] * c.ax[2] + q[1] * c.ay[2] + q[2] * c.az[2]]; };
        c.a = w(L.a); c.b = w(L.b);
    },

    _aabb(c) {
        let pts;
        if (c.kind === 'capsule') {
            const r = c.r;
            c.aabb = [Math.min(c.a[0], c.b[0]) - r, Math.min(c.a[1], c.b[1]) - r, Math.min(c.a[2], c.b[2]) - r,
                Math.max(c.a[0], c.b[0]) + r, Math.max(c.a[1], c.b[1]) + r, Math.max(c.a[2], c.b[2]) + r];
            return;
        }
        if (c.kind === 'box') pts = this._corners(c.hx, c.y0, c.y1, c.hz);
        else if (c.kind === 'cyl') pts = this._corners(c.rx, c.y0, c.y1, c.rz);
        else pts = this._corners(c.hx, 0, c.sy, c.hz);
        const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (const q of pts) {
            const x = c.O[0] + q[0] * c.ax[0] + q[1] * c.ay[0] + q[2] * c.az[0];
            const y = c.O[1] + q[0] * c.ax[1] + q[1] * c.ay[1] + q[2] * c.az[1];
            const z = c.O[2] + q[0] * c.ax[2] + q[1] * c.ay[2] + q[2] * c.az[2];
            if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
            if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
        }
        c.aabb = bb;
    },

    _corners(hx, y0, y1, hz) {
        const out = [];
        for (const x of [-hx, hx]) for (const y of [y0, y1]) for (const z of [-hz, hz]) out.push([x, y, z]);
        return out;
    },

    _insert(c) {
        const G = COURSE_GRID, bb = c.aabb;
        const x0 = Math.floor(bb[0] / G), x1 = Math.floor(bb[3] / G), z0 = Math.floor(bb[2] / G), z1 = Math.floor(bb[5] / G);
        for (let i = x0; i <= x1; i++) for (let k = z0; k <= z1; k++) {
            const key = i + ',' + k;
            let list = this.grid.get(key);
            if (!list) { list = []; this.grid.set(key, list); }
            list.push(c);
        }
    },

    /** Коллайдеры рядом с прямоугольником [x0..x1]×[z0..z1] (статичные из сетки + подвижные). */
    _near(x0, z0, x1, z1, out) {
        const G = COURSE_GRID;
        const stamp = ++this._stamp;
        out.length = 0;
        for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let k = Math.floor(z0 / G); k <= Math.floor(z1 / G); k++) {
            const list = this.grid.get(i + ',' + k);
            if (!list) continue;
            for (const c of list) { if (c._s === stamp) continue; c._s = stamp; out.push(c); }
        }
        for (const c of this.dynamic) if (c.enabled && c.aabb[3] >= x0 && c.aabb[0] <= x1 && c.aabb[5] >= z0 && c.aabb[2] <= z1) out.push(c);
        return out;
    },

    // ---------------------------------------------------------------------------------------------
    // Запросы физики
    // ---------------------------------------------------------------------------------------------

    _tmp: [],

    /**
     * Луч вниз из (x, y, z) на maxDist: самая высокая опора ниже точки. Стены (крутые грани) и капсулы
     * пропускаются. -> { y, n: [x, y, z], col, t } | null
     */
    rayDown(x, y, z, maxDist, minNy) {
        const list = this._near(x - 1, z - 1, x + 1, z + 1, this._tmp);
        let best = null;
        const lim = minNy == null ? 0.45 : minNy;
        for (const c of list) {
            if (!c.enabled || c.kind === 'capsule' || c.brk) continue;
            const bb = c.aabb;
            if (x < bb[0] || x > bb[3] || z < bb[2] || z > bb[5] || bb[1] > y || bb[4] < y - maxDist) continue;
            const h = this._rayLocal(c, x, y, z, 0, -1, 0, maxDist);
            if (!h || h.n[1] < lim) continue;
            if (!best || h.t < best.t) { best = h; best.col = c; }
        }
        if (best) best.y = y - best.t;
        return best;
    },

    /** Луч (единичное направление) до maxT: ближайшее твёрдое тело (камера не уходит сквозь плиты). */
    ray(ox, oy, oz, dx, dy, dz, maxT, skipBreak) {
        const ex = ox + dx * maxT, ez = oz + dz * maxT;
        const list = this._near(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this._tmp);
        let best = null;
        for (const c of list) {
            if (!c.enabled || c.kind === 'capsule' || (skipBreak && c.brk)) continue;
            const h = this._rayLocal(c, ox, oy, oz, dx, dy, dz, maxT);
            if (h && (!best || h.t < best.t)) { best = h; best.col = c; }
        }
        return best;
    },

    _rayLocal(c, wx, wy, wz, dx, dy, dz, maxT) {
        const px = wx - c.O[0], py = wy - c.O[1], pz = wz - c.O[2];
        const o = [px * c.ax[0] + py * c.ax[1] + pz * c.ax[2], px * c.ay[0] + py * c.ay[1] + pz * c.ay[2], px * c.az[0] + py * c.az[1] + pz * c.az[2]];
        const d = [dx * c.ax[0] + dy * c.ax[1] + dz * c.ax[2], dx * c.ay[0] + dy * c.ay[1] + dz * c.ay[2], dx * c.az[0] + dy * c.az[1] + dz * c.az[2]];
        let hit = null;
        if (c.kind === 'box') hit = this._rayBox(o, d, c.hx, c.y0, c.y1, c.hz);
        else if (c.kind === 'cyl') hit = this._rayCyl(o, d, c.rx, c.rz, c.y0, c.y1);
        else if (c.kind === 'wedge' || c.kind === 'arch') hit = this._rayPrism(o, d, c.poly, c.hz, c.kind === 'arch');
        if (!hit || hit.t < 0 || hit.t > maxT) return null;
        const n = hit.n;
        hit.n = [n[0] * c.ax[0] + n[1] * c.ay[0] + n[2] * c.az[0], n[0] * c.ax[1] + n[1] * c.ay[1] + n[2] * c.az[1], n[0] * c.ax[2] + n[1] * c.ay[2] + n[2] * c.az[2]];
        return hit;
    },

    _rayBox(o, d, hx, y0, y1, hz) {
        let tin = -Infinity, tout = Infinity, axis = -1, sign = 0;
        const lo = [-hx, y0, -hz], hi = [hx, y1, hz];
        for (let i = 0; i < 3; i++) {
            if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
            let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i], s = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
            if (t1 > tin) { tin = t1; axis = i; sign = s; }
            if (t2 < tout) tout = t2;
            if (tin > tout) return null;
        }
        if (tin < 0 || axis < 0) return null;   // старт внутри — не опора
        const n = [0, 0, 0];
        n[axis] = sign;
        return { t: tin, n };
    },

    _rayCyl(o, d, rx, rz, y0, y1) {
        const ox = o[0] / rx, oz = o[2] / rz, dx = d[0] / rx, dz = d[2] / rz;
        let tin = -Infinity, tout = Infinity, cap = false, capSign = 0;
        const a = dx * dx + dz * dz;
        if (a < 1e-12) { if (ox * ox + oz * oz > 1) return null; }
        else {
            const b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - 1, disc = b * b - 4 * a * c;
            if (disc < 0) return null;
            const s = Math.sqrt(disc);
            tin = (-b - s) / (2 * a); tout = (-b + s) / (2 * a);
        }
        if (Math.abs(d[1]) < 1e-9) { if (o[1] < y0 || o[1] > y1) return null; }
        else {
            let t1 = (y0 - o[1]) / d[1], t2 = (y1 - o[1]) / d[1], s = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
            if (t1 > tin) { tin = t1; cap = true; capSign = s; }
            if (t2 < tout) tout = t2;
        }
        if (tin > tout || tin < 0) return null;
        if (cap) return { t: tin, n: [0, capSign, 0] };
        const hx = o[0] + d[0] * tin, hz = o[2] + d[2] * tin;
        const nx = hx / (rx * rx), nz = hz / (rz * rz), l = Math.hypot(nx, nz) || 1;
        return { t: tin, n: [nx / l, 0, nz / l] };
    },

    /**
     * Сфера (x, y, z, r) против всех коллайдеров рядом: fn(контакт) на каждое касание.
     * Контакт: { col, depth, n: [x, y, z] (от коллайдера к сфере), q: [x, y, z] (ближайшая точка) }.
     */
    sphere(x, y, z, r, fn) {
        const list = this._near(x - r, z - r, x + r, z + r, this._tmp);
        for (const c of list) {
            if (!c.enabled) continue;
            const bb = c.aabb;
            if (x + r < bb[0] || x - r > bb[3] || y + r < bb[1] || y - r > bb[4] || z + r < bb[2] || z - r > bb[5]) continue;
            const h = this._sphereCol(c, x, y, z, r);
            if (h) { h.col = c; fn(h); }
        }
    },

    _sphereCol(c, x, y, z, r) {
        if (c.kind === 'capsule') {
            const a = c.a, b = c.b;
            const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
            const L2 = abx * abx + aby * aby + abz * abz;
            let t = L2 > 1e-9 ? ((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / L2 : 0;
            t = Math.max(0, Math.min(1, t));
            const q = [a[0] + abx * t, a[1] + aby * t, a[2] + abz * t];
            const dx = x - q[0], dy = y - q[1], dz = z - q[2], dd = Math.hypot(dx, dy, dz);
            if (dd >= r + c.r) return null;
            const n = dd > 1e-6 ? [dx / dd, dy / dd, dz / dd] : [0, 1, 0];
            return { depth: r + c.r - dd, n, q: [q[0] + n[0] * c.r, q[1] + n[1] * c.r, q[2] + n[2] * c.r] };
        }
        const px = x - c.O[0], py = y - c.O[1], pz = z - c.O[2];
        const o = [px * c.ax[0] + py * c.ax[1] + pz * c.ax[2], px * c.ay[0] + py * c.ay[1] + pz * c.ay[2], px * c.az[0] + py * c.az[1] + pz * c.az[2]];
        let q = null, nl = null, depth = 0;
        if (c.kind === 'box' || c.kind === 'cyl') {
            const isBox = c.kind === 'box';
            const y0 = c.y0, y1 = c.y1;
            if (isBox) {
                q = [Math.max(-c.hx, Math.min(c.hx, o[0])), Math.max(y0, Math.min(y1, o[1])), Math.max(-c.hz, Math.min(c.hz, o[2]))];
            } else {
                const rr = Math.hypot(o[0] / c.rx, o[2] / c.rz);
                const k = rr > 1 ? 1 / rr : 1;
                q = [o[0] * k, Math.max(y0, Math.min(y1, o[1])), o[2] * k];
            }
            const dx = o[0] - q[0], dy = o[1] - q[1], dz = o[2] - q[2], dd = Math.hypot(dx, dy, dz);
            if (dd > 1e-6) {
                if (dd >= r) return null;
                nl = [dx / dd, dy / dd, dz / dd]; depth = r - dd;
            } else {   // центр внутри: выталкивать через ближайшую грань
                const faces = isBox
                    ? [[c.hx - o[0], [1, 0, 0]], [o[0] + c.hx, [-1, 0, 0]], [y1 - o[1], [0, 1, 0]], [o[1] - y0, [0, -1, 0]], [c.hz - o[2], [0, 0, 1]], [o[2] + c.hz, [0, 0, -1]]]
                    : [[y1 - o[1], [0, 1, 0]], [o[1] - y0, [0, -1, 0]], [(1 - Math.hypot(o[0] / c.rx, o[2] / c.rz)) * Math.min(c.rx, c.rz), (() => { const l = Math.hypot(o[0], o[2]) || 1; return [o[0] / l, 0, o[2] / l]; })()]];
                faces.sort((a, b) => a[0] - b[0]);
                nl = faces[0][1]; depth = faces[0][0] + r;
            }
        } else {
            const h = this._prismHit(c.poly, c.hz, o, r);
            if (!h) return null;
            nl = h.nl; depth = h.depth; q = h.q;
        }
        const n = [nl[0] * c.ax[0] + nl[1] * c.ay[0] + nl[2] * c.az[0], nl[0] * c.ax[1] + nl[1] * c.ay[1] + nl[2] * c.az[1], nl[0] * c.ax[2] + nl[1] * c.ay[2] + nl[2] * c.az[2]];
        const qw = [c.O[0] + q[0] * c.ax[0] + q[1] * c.ay[0] + q[2] * c.az[0], c.O[1] + q[0] * c.ax[1] + q[1] * c.ay[1] + q[2] * c.az[1], c.O[2] + q[0] * c.ax[2] + q[1] * c.ay[2] + q[2] * c.az[2]];
        return { depth, n, q: qw };
    },

    /** Скорость точки коллайдера (подвижные детали) — px/с: несёт велосипед, бьёт молотом. */
    pointVel(c, q) {
        if (!c || !c.dynamic || !c.prev) return [0, 0, 0];
        const P = c.prev;
        if (c.kind === 'capsule') {
            // точка на отрезке: та же доля вдоль прошлого отрезка
            const abx = c.b[0] - c.a[0], aby = c.b[1] - c.a[1], abz = c.b[2] - c.a[2];
            const L2 = abx * abx + aby * aby + abz * abz;
            const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((q[0] - c.a[0]) * abx + (q[1] - c.a[1]) * aby + (q[2] - c.a[2]) * abz) / L2)) : 0;
            const now = [c.a[0] + abx * t, c.a[1] + aby * t, c.a[2] + abz * t];
            const was = [P.a[0] + (P.b[0] - P.a[0]) * t, P.a[1] + (P.b[1] - P.a[1]) * t, P.a[2] + (P.b[2] - P.a[2]) * t];
            const inv = 1 / Math.max(1e-4, this._dt);
            return [(now[0] - was[0]) * inv, (now[1] - was[1]) * inv, (now[2] - was[2]) * inv];
        }
        const px = q[0] - c.O[0], py = q[1] - c.O[1], pz = q[2] - c.O[2];
        const lx = px * c.ax[0] + py * c.ax[1] + pz * c.ax[2], ly = px * c.ay[0] + py * c.ay[1] + pz * c.ay[2], lz = px * c.az[0] + py * c.az[1] + pz * c.az[2];
        const wx = P.O[0] + lx * P.ax[0] + ly * P.ay[0] + lz * P.az[0];
        const wy = P.O[1] + lx * P.ax[1] + ly * P.ay[1] + lz * P.az[1];
        const wz = P.O[2] + lx * P.ax[2] + ly * P.ay[2] + lz * P.az[2];
        const inv = 1 / Math.max(1e-4, this._dt);
        return [(q[0] - wx) * inv, (q[1] - wy) * inv, (q[2] - wz) * inv];
    },

    /** Угловая скорость вращающейся детали вокруг вертикали, рад/с (поворот велосипеда на диске). */
    yawRate(c) { return c && c.piece && c.piece.spinRate ? c.piece.spinRate : 0; },

    /** Касание опоры (падающие плиты начинают дрожать). */
    touch(c) {
        const p = c && c.piece;
        if (p && p.prm.role === 'fall' && p.fallState === 'idle') { p.fallState = 'shake'; p.fallT = 0; }
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр: подвижные детали
    // ---------------------------------------------------------------------------------------------

    update(dt) {
        this._dt = dt > 0 ? dt : 1 / 60;
        this.time += dt;
        if (typeof GameSky !== 'undefined') GameSky.update(dt);
        const t = this.time;
        const mats = this.mats;
        if (mats.boost && mats.boost.diffuseTexture) mats.boost.diffuseTexture.uOffset = -(t * 1.6) % 1;
        if (mats.kill) {
            const k = 0.75 + 0.25 * Math.sin(t * 4);
            mats.kill.emissiveColor.set(0.95 * k, 0.32 * k, 0.06 * k);
            if (mats.kill.diffuseTexture) { mats.kill.diffuseTexture.uOffset = (t * 0.05) % 1; mats.kill.diffuseTexture.vOffset = (t * 0.03) % 1; }
        }
        this._updateDebris(dt);
        for (const p of this.pieces) {
            if (p.arrow) { p.node.position.y = p.baseH + Math.sin(t * 2.4 + p.O[0] * 0.01) * 14; continue; }
            if (!p.dynamic) continue;
            this._pose(p, t, dt);
        }
    },

    _pose(p, t, dt) {
        const B = p.base;
        let O = B.O.slice(), ax = B.ax, ay = B.ay, az = B.az;
        let angle = 0;
        const prm = p.prm;
        if (prm.role === 'move') {
            const T = Math.max(0.3, prm.t || 4), s = Math.sin(2 * Math.PI * (t / T + (prm.ph || 0)));
            const dx = (prm.x || 0) * s, dy = (prm.y || 0) * s, dz = (prm.z || 0) * s;
            O = [O[0] + dx * ax[0] + dy * ay[0] + dz * az[0], O[1] + dx * ax[1] + dy * ay[1] + dz * az[1], O[2] + dx * ax[2] + dy * ay[2] + dz * az[2]];
        }
        let spinRate = 0;
        const rpm = p.anim && Number(p.anim.speed) > 0 ? Number(p.anim.speed) : 0;
        if (p.type === 'spinner' || prm.role === 'spin' || (rpm && (p.type === 'cyl' || p.type === 'box'))) {
            const rate = (rpm || 12) / 60 * Math.PI * 2 * (p.anim && p.anim.dir === 'cw' ? -1 : 1);
            angle = rate * t;
            if (p.type !== 'spinner') {
                spinRate = rate;
                const ca = Math.cos(angle), sa = Math.sin(angle);
                const ry = (v) => [v[0] * ca + v[2] * sa, v[1], -v[0] * sa + v[2] * ca];   // вокруг мировой вертикали
                ax = ry(ax); ay = ry(ay); az = ry(az);
            }
        }
        if (p.type === 'hammer') {
            const T = Math.max(0.5, prm.t || 2.6), A = (prm.a || 70) * Math.PI / 180;
            angle = A * Math.sin(2 * Math.PI * (t / T + (prm.ph || 0)));
        }
        if (prm.role === 'fall') {
            const d = prm.d || 0.6, r = prm.r || 3;
            p.fallT += dt;
            if (p.fallState === 'shake') {
                const k = Math.sin(t * 60) * 4;
                O = [O[0] + k, O[1], O[2] + k * 0.6];
                if (p.fallT >= d) { p.fallState = 'drop'; p.fallT = 0; p.fallVel = 0; p.fallDrop = 0; }
            } else if (p.fallState === 'drop') {
                p.fallVel += 2600 * dt; p.fallDrop += p.fallVel * dt;
                O = [O[0], O[1] - p.fallDrop, O[2]];
                if (p.fallT >= r) { p.fallState = 'idle'; p.fallT = 0; p.fallDrop = 0; }
            }
            const on = p.fallState !== 'drop';
            for (const c of p.cols) c.enabled = on || p.fallDrop < 40;
            if (p.node) p.node.setEnabled(p.fallState !== 'drop' || p.fallDrop < 2500);
        }
        p.spinRate = spinRate;
        for (const c of p.cols) {
            c.prev = c.kind === 'capsule' ? { a: c.a.slice(), b: c.b.slice() } : { O: c.O.slice(), ax: c.ax.slice(), ay: c.ay.slice(), az: c.az.slice() };
            c.O = O; c.ax = ax; c.ay = ay; c.az = az;
            if (c.kind === 'capsule') this._capsuleWorld(c, p, angle);
            this._aabb(c);
        }
        const node = p.node;
        if (node) {
            node.position.set(O[0], O[1], O[2]);
            BABYLON.Quaternion.FromRotationMatrixToRef(BABYLON.Matrix.FromValues(ax[0], ax[1], ax[2], 0, ay[0], ay[1], ay[2], 0, az[0], az[1], az[2], 0, 0, 0, 0, 1), node.rotationQuaternion);
            if (p.barNode) BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.Y, angle, p.barNode.rotationQuaternion);
            if (p.armNode) BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.X, angle, p.armNode.rotationQuaternion);
        }
    },
};
