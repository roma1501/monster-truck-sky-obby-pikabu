// Game.js — Monster Truck Sky Obby: блочный водитель на монстр-траке проходит длинные обби-трассы в небе над облаками.
// Состояния: menu (витрина у старта мира, выбор мира, Гараж и подарки) -> ride (заезд) -> dead (упал —
// вернётся на последний чекпоинт) -> finish (мир пройден). Трасса — детали карты (GameCourse), физика —
// GameCar, камера — GameCamera, вид машины, водителя и косметика — GameLook, интерфейс — GameHud и GameMeta.
// Уровни — карты Maps.js (world-1..3), точки — маркеры spawn / checkpoint-N / finish / coin.
// Механики трака: таран разрушаемых препятствий (Course.shatter, монеты, потеря скорости, сплющивание машин),
// трюки в воздухе (сальто, бочка: монеты, буст, надпись), тюнинг «Подвеска / Мотор / Броня» за монеты (save.tune).

// Детали трассы не строит Location3D (их сотни): копия карты отдаёт их Course, остальное — как обычно.
(() => {
    const copy = Location3D.copyMap;
    Location3D.copyMap = function (map) {
        const m = copy.call(this, map);
        if (m && Array.isArray(m.objects)) {
            const kit = [], rest = [];
            for (const d of m.objects) (Course.isKit(d) ? kit : rest).push(d);
            m.objects = rest;
            Course.lastKit = { id: m.id, kit };
        }
        return m;
    };
})();

// Декор миров (облака, острова) — в своей папке: движок батчит и прореживает его по уровню графики.
Location3D.DECOR_PREFIX = 'assets/models/decor/';

// Окна Гаража, подарка, колеса (GameMeta.js); не загрузился модуль — игра идёт без них.
const GAME_META_STUB = { init() {}, open() {}, close() {}, isOpen() { return false; }, onMenu() {} };
/** @returns {any} */
function gameMeta() { return typeof Meta !== 'undefined' && Meta ? Meta : GAME_META_STUB; }

// Playgama: на ультрашироком ПК поле игры не шире 2:1 (index.html, класс aspect-2x1) — до main.js, до первого кадра.
if (String(GAME_PLATFORM) === 'playgama' && typeof document !== 'undefined') document.documentElement.classList.add('aspect-2x1');

const GAME_WORLDS = [
    { n: 1, id: 'world-1', music: 'assets/sounds/music-1.ogg' },
    { n: 2, id: 'world-2', music: 'assets/sounds/music-2.ogg' },
    { n: 3, id: 'world-3', music: 'assets/sounds/music-3.ogg' },
];

/** @satisfies {Record<string, any>} */
const Game = {
    /** @type {LoryApp | null} */ app: null,
    /** @type {any} */ save: null,
    /** @type {'menu' | 'ride' | 'dead' | 'finish'} */ state: 'menu',
    world: 1,
    selected: 1,
    /** @type {any[]} */ cps: [],
    /** @type {any} */ spawn: null,
    /** @type {any} */ finish: null,
    /** @type {any[]} */ coins: [],
    cp: 0,
    runTime: 0, deaths: 0, runCoins: 0,
    deadT: 0,
    /** @type {any[]} */ flags: [],
    /** @type {any} */ finishGate: null,
    /** @type {any} */ coinMesh: null,
    /** @type {any} */ rocketFx: null,
    /** @type {any} */ loops: {},
    pathLen: 1, segLens: [],
    tutDist: 0, tutYaw: 0, tutTrick: false,
    /** Серия трюков/тарана для HUD. */
    ramCombo: 0, _ramT: 0,
    _saveT: 0,
    _starting: false,

    // -------------------------------------------------------------------------------------------
    // Запуск
    // -------------------------------------------------------------------------------------------

    // До первой карты (main.js): прочитать сохранение и начать с мира, где игрок остановился.
    async firstMap() {
        await this._loadSave();
        return this.worldDef(Math.min(this.save.sel || 1, this.save.unlocked || 1)).id;
    },

    async _loadSave() {
        if (this.save) return;
        let save = null;
        try { save = await Platform.load(); } catch (e) { console.warn('Platform.load:', e); }
        this.save = this._normalize(save || {});
    },

    async init(app) {
        this.app = app;
        await this._loadSave();
        // Без обводки и контура рёбер (просьба пользователя): переопределение рендера игры; уровни графики его не возвращают.
        const noOutlines = () => World3D.setOutlines(false);
        noOutlines();
        if (typeof Quality !== 'undefined' && Quality.onChange) Quality.onChange(noOutlines);
        HudLayout.init({ app });
        // Playables: мобильное управление и на ПК — мышь как палец (стик слева, взгляд справа, кнопка прыжка); ?mousetouch — проверить на вебе
        const mouseTouch = String(GAME_PLATFORM) === 'playables' || (typeof location !== 'undefined' && /[?&]mousetouch\b/.test(location.search));
        Input.init({ app, mouse: 'none', mouseTouch });   // мышь камеры — своя (зажатая ЛКМ, GameCamera); пальцы — стик и взгляд Input
        Car.tune = this.save.tune;
        gameMeta().init(this.save, () => this.persist());
        Hud.init();
        Cam.init(app);
        Look.init(app);
        Bots.init(app);
        Bots.on.bump = (b, rel, pt) => {
            Sound.play('assets/sounds/metal-hit.ogg', { volume: Math.min(1, 0.3 + rel / 1600), rate: 0.85 + Math.random() * 0.25 });
            if (rel > 450) Sound.play('assets/sounds/hit.ogg', { volume: Math.min(0.8, rel / 2400) });
            if (this.app.fx) this.app.fx.play('carbump', new BABYLON.Vector3(pt[0], pt[1], pt[2]));
            Cam.shake(Math.min(16, 3 + rel / 120), 0.22);
        };
        Look.onBackfire = () => Sound.play('synth:pop', { volume: 0.5, rate: 0.9 + Math.random() * 0.3 });
        Bots.on.knock = (b) => { Sound.play('assets/sounds/hit.ogg', { volume: 0.8 }); Cam.shake(6, 0.15); Hud.toast(Lang.t('toast.knock', { name: b.name }), true); };
        this._initTutorial();
        this._registerFx();
        this._initSound();
        app.onUpdate((dt) => { Rig.updateAll(dt); Look.ik(); Bots.ik(); });   // IK — поверх поз ригов
        if (typeof Shop !== 'undefined' && Shop.on) Shop.on((e) => {
            if (e.type === 'equip' || e.type === 'unequip' || e.type === 'preview' || e.type === 'grant') Look.apply(Shop.look());
            if (e.type === 'coins') Hud.setCoins(Shop.coins);
        });
        this._bindHud();
        this._initUiAds();
        this._bindCar();
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape' && e.code !== 'KeyP') return;
            if (gameMeta().isOpen()) return;
            if (this.state === 'ride' && !Pause.has('manual')) this.pause(true);
            else if (Pause.has('manual') && Hud.overlayOpen()) this.pause(false);
        });
        window.addEventListener('lory-release-input', () => { /* Input отпускает клавиши сам */ });
        this.selected = Math.min(this.save.sel || 1, this.save.unlocked || 1);
        await this._prepareWorld(app);
        await Look.apply(Shop.look());
        this.toMenu(true);
    },

    async ready() {
        await Look._queue;
    },

    _normalize(s) {
        s.v = 1;
        s.worlds = s.worlds || {};
        for (const w of GAME_WORLDS) {
            const r = s.worlds[w.id] = s.worlds[w.id] || {};
            r.cp = r.cp | 0; r.time = Number(r.time) || 0; r.deaths = r.deaths | 0; r.best = r.best || null;
            r.done = !!r.done; r.maxCp = Math.max(r.maxCp | 0, r.cp); r.taken = Array.isArray(r.taken) ? r.taken : []; r.runCoins = r.runCoins | 0;
            r.brk = Array.isArray(r.brk) ? r.brk : [];
        }
        // тюнинг трака: уровни 0..TUNE_MAX_LEVEL
        const tune = s.tune && typeof s.tune === 'object' ? s.tune : {};
        const maxL = typeof TUNE_MAX_LEVEL !== 'undefined' ? TUNE_MAX_LEVEL : 5;
        s.tune = {};
        for (const k of ['susp', 'motor', 'armor']) s.tune[k] = Math.max(0, Math.min(maxL, tune[k] | 0));
        s.stats = s.stats && typeof s.stats === 'object' ? s.stats : {};
        s.stats.rams = s.stats.rams | 0; s.stats.tricks = s.stats.tricks | 0;
        s.unlocked = Math.max(1, s.unlocked | 0);
        s.sel = s.sel || 1;
        return s;
    },

    persist() {
        try { Platform.save(this.save); } catch (e) { console.warn('Platform.save:', e); }
    },

    worldDef(n) { return GAME_WORLDS.find(w => w.n === n) || GAME_WORLDS[0]; },
    worldOfMap() { const id = this.app.location.map.id; const w = GAME_WORLDS.find(x => x.id === id); return w ? w.n : 1; },
    rec() { return this.save.worlds[this.worldDef(this.world).id]; },

    // Трасса, точки и объекты текущей карты (в prepare под экраном загрузки и при старте).
    async _prepareWorld(app) {
        const loc = app.location;
        this.world = this.worldOfMap();
        let kit = Course.lastKit && Course.lastKit.id === loc.map.id ? Course.lastKit.kit : [];
        if (!kit.length && /[?&]devcourse/.test(location.search)) kit = this._devCourse(loc);
        Course.build(app, kit);
        await Course.loadBreakables();
        Course.applyBroken(this.rec().brk);
        if (typeof Skids !== 'undefined') Skids.clear();
        const markers = (name) => loc.markers(name);
        const num = (d) => { const m = /-(\d+)$/.exec(String(d.name)); return m ? Number(m[1]) : 0; };
        this.cps = markers('checkpoint').slice().sort((a, b) => num(a) - num(b));
        this.spawn = loc.marker('spawn') || this.cps[0] || { x: loc.width / 2, y: loc.height / 2, h: 0, rot: [0, 0, 0] };
        this.finish = loc.marker('finish');
        this.coins = markers('coin').map((d, i) => ({ i, x: Number(d.x) || 0, y: Number(d.h) || 0, z: Number(d.y) || 0, taken: false }));
        this._measurePath();
        this._buildMarkers(app);
        Hud.setWorld(this.world, this.cps.length + 1);
        const rec = this.rec();
        for (const i of rec.taken) if (this.coins[i]) this.coins[i].taken = true;
        this.cp = Math.min(rec.cp, this.cps.length);
        this.placeAt(this.cp);
        this._refreshFlags();
        this._updateCoins(0);
        await Bots.build(app, this.cps, this.spawn, this.finish);
    },

    // Отладка без карт (?devcourse): короткая проверочная трасса со всеми видами деталей.
    _devCourse(loc) {
        loc.map.objects = loc.map.objects.filter(d => d.kind !== 'marker');
        const k = [], m = loc.map.objects;
        const B = (x, y, h, sx, sz, color, extra) => k.push(Object.assign({ name: '', model: COURSE_KIT_PREFIX + 'box_' + color + '.glb', kind: 'prop', x, y, h, rot: [0, 0, 0], scale: [sx / 100, 0.8, sz / 100] }, extra || {}));
        const P = (model, x, y, h, rot, scale, name, anim) => k.push({ name: name || '', model: COURSE_KIT_PREFIX + model + '.glb', kind: 'prop', x, y, h, rot, scale, anim });
        const M = (name, x, y, h, yaw, s) => m.push({ name, kind: 'marker', x, y, h, rot: [0, yaw || 0, 0], scale: [s || 3, 1, s || 3] });
        const H = 1000;
        B(1000, 1000, H, 1600, 1600, 'purple');
        M('spawn', 700, 1000, H, 0);
        B(2400, 1000, H, 1200, 700, 'orange');
        P('ramp_yellow', 2850, 1000, H, [0, 0, 0], [3, 0.9, 5]);
        B(3900, 1000, H + 60, 900, 700, 'green');
        M('checkpoint-1', 3900, 1000, H + 60, 0);
        P('arch_red', 4700, 1000, H + 60, [0, 0, 0], [6, 1.4, 5]);
        B(4700, 1000, H + 60, 700, 500, 'red');
        B(5600, 1000, H + 60, 1100, 600, 'yellow');
        P('spinner', 5600, 1000, H + 60, [0, 0, 0], [5, 0.35, 0.3], 'spin', { part: 'Bar', axis: 'y', speed: 14, dir: 'cw' });
        B(6600, 1000, H + 140, 500, 500, 'blue', { name: 'move z=500 t=4' });
        B(7600, 1000, H + 140, 1000, 700, 'pink');
        P('hammer', 7600, 1000, H + 140 + 220, [0, 0, 0], [0.7, 1.9, 1.0], 'hammer t=2.4 a=70 ph=0');
        B(8700, 1000, H + 140, 900, 380, 'ice');
        B(9700, 1000, H + 140, 900, 900, 'mint');
        M('checkpoint-2', 9700, 1000, H + 140, 0);
        P('boost', 10000, 1000, H + 140, [0, 0, 0], [3, 1, 3], 'boost v=2000');
        B(11500, 1000, H + 140, 1200, 900, 'white');
        P('pillar', 11500, 900, H + 140, [0, 0, 12], [0.6, 4, 0.6]);
        P('pillar', 11800, 1150, H + 140, [0, 0, -12], [0.6, 4, 0.6]);
        P('fence', 11500, 1430, H + 140, [0, 0, 0], [12, 1, 1]);
        P('kill', 12550, 1000, H + 141, [0, 0, 0], [1.6, 0.2, 9]);
        B(12550, 1000, H + 140, 900, 900, 'dark');
        B(13600, 1000, H + 140, 600, 600, 'orange', { name: 'fall d=0.6 r=3' });
        P('jump', 14500, 1000, H + 140, [0, 0, 0], [2.4, 1, 2.4], 'jump v=2300');
        B(14500, 1000, H + 140, 800, 800, 'purple');
        B(15600, 1000, H + 600, 1400, 1400, 'green');
        M('finish', 15800, 1000, H + 600, 0, 4);
        for (let i = 0; i < 8; i++) M('coin-' + (i + 1), 1700 + i * 180, 1000, H + 60, 0, 1);
        return k;
    },

    _pt(d) { return { x: Number(d.x) || 0, y: Number(d.h) || 0, z: Number(d.y) || 0, yaw: ((Array.isArray(d.rot) ? Number(d.rot[1]) : Number(d.rot)) || 0) * Math.PI / 180 }; },

    _measurePath() {
        const pts = [this.spawn].concat(this.cps, this.finish ? [this.finish] : []).map(d => this._pt(d));
        this.segLens = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y); this.segLens.push(l); total += l; }
        this.pathLen = Math.max(1, total);
        this.pathPts = pts;
    },

    /** Доля пройденной трассы: по отрезкам между чекпоинтами. */
    progress() {
        const pts = this.pathPts;
        if (!pts || pts.length < 2) return 0;
        let done = 0;
        for (let i = 0; i < this.cp && i < this.segLens.length; i++) done += this.segLens[i];
        const a = pts[this.cp], b = pts[Math.min(pts.length - 1, this.cp + 1)];
        const seg = this.segLens[this.cp] || 1;
        const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
        const t = ((Car.p[0] - a.x) * dx + (Car.p[2] - a.z) * dz + (Car.p[1] - a.y) * dy) / (seg * seg || 1);
        return Math.min(1, (done + Math.max(0, Math.min(1, t)) * seg) / this.pathLen);
    },

    placeAt(cp) {
        const d = cp <= 0 ? this.spawn : this.cps[cp - 1];
        const p = this._pt(d);
        Car.reset(p.x, p.y, p.z, p.yaw);
        Car.frozen = this.state !== 'ride';
        Look.seatRider();
        Look.place();
        Cam.yaw = p.yaw; Cam.lookT = 99; Cam.ty = p.y + 130; Cam.snap();
    },

    // -------------------------------------------------------------------------------------------
    // Флаги, финиш, монеты
    // -------------------------------------------------------------------------------------------

    _buildMarkers(app) {
        const view = app.location.view, scene = view.scene;
        for (const f of this.flags) { try { World3D.removeObject(view, f.root); f.root.dispose(false, true); f.pad.dispose(); f.tex.dispose(); } catch (e) { /* уже */ } }
        this.flags = [];
        if (this.finishGate) { try { World3D.removeObject(view, this.finishGate); } catch (e) { /* уже */ } this.finishGate = null; }
        if (this.coinMesh) { try { World3D.removeObject(view, this.coinMesh); } catch (e) { /* уже */ } this.coinMesh = null; }
        const red = new BABYLON.StandardMaterial('flag-red', scene); red.diffuseColor = BABYLON.Color3.FromHexString('#ff3b4e'); red.backFaceCulling = false;
        const green = new BABYLON.StandardMaterial('flag-green', scene); green.diffuseColor = BABYLON.Color3.FromHexString('#4fd64a'); green.backFaceCulling = false; green.emissiveColor = new BABYLON.Color3(0.08, 0.25, 0.08);
        const white = new BABYLON.StandardMaterial('flag-pole', scene); white.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.97);
        const ring = new BABYLON.StandardMaterial('flag-ring', scene); ring.diffuseColor = BABYLON.Color3.FromHexString('#ff3b4e'); ring.emissiveColor = BABYLON.Color3.FromHexString('#ff3b4e').scale(0.5); ring.disableLighting = false;
        const flagGold = new BABYLON.StandardMaterial('flag-gold', scene); flagGold.diffuseColor = BABYLON.Color3.FromHexString('#ffc21a'); flagGold.specularColor = new BABYLON.Color3(0.7, 0.6, 0.3); flagGold.emissiveColor = BABYLON.Color3.FromHexString('#5a3800');
        const dark = new BABYLON.StandardMaterial('flag-base', scene); dark.diffuseColor = BABYLON.Color3.FromHexString('#2b2766');
        const padTex = new BABYLON.DynamicTexture('cp-pad-tex', { width: 256, height: 256 }, scene, true);
        const pctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (padTex.getContext()));
        const rg = pctx.createRadialGradient(128, 128, 60, 128, 128, 128);
        rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.72, 'rgba(255,240,120,0.15)'); rg.addColorStop(0.88, 'rgba(255,230,90,0.85)'); rg.addColorStop(0.94, 'rgba(255,255,255,0.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        pctx.fillStyle = rg; pctx.fillRect(0, 0, 256, 256);
        padTex.hasAlpha = true; padTex.update(true);
        const pad = new BABYLON.StandardMaterial('flag-pad', scene);
        pad.diffuseTexture = padTex; pad.useAlphaFromDiffuseTexture = true; pad.emissiveColor = new BABYLON.Color3(1, 1, 1); pad.disableLighting = true;
        pad.backFaceCulling = false; pad.metadata = { toon: false }; pad.zOffset = -2;
        const lampMat = (hex, k) => { const m = new BABYLON.StandardMaterial('cp-lamp-' + hex, scene); m.diffuseColor = BABYLON.Color3.FromHexString(hex); m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(k); m.metadata = { toon: false }; return m; };
        this._flagMats = { red: lampMat('#ff2d44', 0.9), green: lampMat('#b6ff3b', 0.9), dim: lampMat('#3a1418', 0.2), white, ring, gold: flagGold, dark, pad, flagRed: red, flagGreen: green };
        this.cps.forEach((d, i) => this.flags.push(this._makeFlag(view, d, i)));
        if (this.finish) {
            const p = this._pt(this.finish);
            const gate = new BABYLON.Mesh('finish', scene);
            const rr = Math.max(250, (Array.isArray(this.finish.scale) ? Number(this.finish.scale[0]) : 6) * 100);
            const w = Math.max(1300, Math.min(1900, rr * 1.9)), hgt = 560;
            const post = new BABYLON.StandardMaterial('fin-post', scene); post.diffuseColor = BABYLON.Color3.FromHexString('#ffd600');
            const dark = new BABYLON.StandardMaterial('fin-dark', scene); dark.diffuseColor = BABYLON.Color3.FromHexString('#1c2030');
            for (const s of [-1, 1]) {
                const c = BABYLON.MeshBuilder.CreateBox('fin-col', { width: 70, height: hgt, depth: 70 }, scene);
                c.material = post; c.parent = gate; c.position.set(0, hgt / 2, s * w / 2);
                const foot = BABYLON.MeshBuilder.CreateBox('fin-foot', { width: 130, height: 40, depth: 130 }, scene);
                foot.material = dark; foot.parent = gate; foot.position.set(0, 20, s * w / 2);
            }
            const banner = BABYLON.MeshBuilder.CreateBox('fin-banner', { width: 24, height: 150, depth: w + 70 }, scene);
            banner.material = dark; banner.parent = gate; banner.position.set(0, hgt - 75, 0);
            const tex = new BABYLON.DynamicTexture('fin-tex', { width: 1024, height: 128 }, scene, true);
            const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
            ctx.save(); ctx.translate(1024, 0); ctx.scale(-1, 1);   // плоскость показывает текстуру отражённой — рисуем зеркально
            for (let x = 0; x < 64; x++) for (let y = 0; y < 8; y++) { ctx.fillStyle = (x + y) % 2 ? '#12141c' : '#ffffff'; ctx.fillRect(x * 16, y * 16, 16, 16); }
            ctx.fillStyle = 'rgba(18,20,28,0.85)'; ctx.fillRect(312, 20, 400, 88);
            ctx.font = '64px ' + this._font(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffd600'; ctx.fillText('FINISH', 512, 66);
            ctx.restore();
            tex.update(true);
            const bm = new BABYLON.StandardMaterial('fin-ban', scene); bm.diffuseTexture = tex; bm.backFaceCulling = true; bm.emissiveColor = new BABYLON.Color3(0.25, 0.25, 0.25);
            // две полосы спина к спине: надпись читается с обеих сторон, а не зеркально
            for (const side of [-1, 1]) {
                const pl = BABYLON.MeshBuilder.CreatePlane('fin-ban-face', { width: w + 70, height: 150 }, scene);
                pl.material = bm; pl.parent = gate; pl.position.set(side * 13, hgt - 75, 0); pl.rotation.y = -side * Math.PI / 2;
            }
            gate.position.set(p.x, p.y, p.z);
            gate.rotation.y = -p.yaw;
            World3D.addObject(view, gate, 'prop', { outline: false });
            this.finishGate = gate;
        }
        // монеты — одна пачка инстансов
        const gold = new BABYLON.StandardMaterial('coin-gold', scene);
        gold.diffuseColor = BABYLON.Color3.FromHexString('#ffc21a'); gold.emissiveColor = BABYLON.Color3.FromHexString('#7a4a00'); gold.specularColor = new BABYLON.Color3(0.6, 0.5, 0.2);
        const coin = BABYLON.MeshBuilder.CreateCylinder('coin', { diameter: 56, height: 10, tessellation: 24 }, scene);
        coin.rotation.z = Math.PI / 2;
        coin.bakeCurrentTransformIntoVertices();
        coin.material = gold;
        coin.isPickable = false;
        if (this.coins.length) {
            const mats = new Float32Array(16 * this.coins.length);
            coin.thinInstanceSetBuffer('matrix', mats, 16, false);
            coin.thinInstanceRefreshBoundingInfo(false);
        }
        World3D.addObject(view, coin, 'prop', { outline: false, ink: false, castShadow: false });
        coin.alwaysSelectAsActiveMesh = true;
        this.coinMesh = coin;
    },

    _refreshFlags() {
        this.flags.forEach((f, i) => {
            const on = i < this.cp;
            if (f.on !== on) { f.on = on; this._paintFlag(f, on); }
            f.pad.setEnabled(!on);
        });
    },

    // Чекпоинт — гоночная арка над дорогой: две опоры с полосами, перекладина с табло номера и ряд огней
    // (красные — ещё не взят, следующий мигает; взят — зелёные с галочкой), светящийся круг-зона на плите.
    _makeFlag(view, d, i) {
        const scene = view.scene, p = this._pt(d);
        const M = this._flagMats;
        const root = new BABYLON.Mesh('cp-' + (i + 1), scene);
        const rr = Math.max(150, (Array.isArray(d.scale) ? Number(d.scale[0]) : 5) * 100);
        const half = Math.max(560, Math.min(780, rr * 1.25)), H = 470;
        if (!M.stripe) {
            const st = new BABYLON.DynamicTexture('cp-stripe', { width: 64, height: 256 }, scene, true);
            const c = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (st.getContext()));
            for (let y = 0; y < 8; y++) { c.fillStyle = y % 2 ? '#12141c' : '#ffd600'; c.fillRect(0, y * 32, 64, 32); }
            st.update(true);
            const m = new BABYLON.StandardMaterial('cp-post', scene); m.diffuseTexture = st; M.stripe = m;
            const beam = new BABYLON.StandardMaterial('cp-beam', scene); beam.diffuseColor = BABYLON.Color3.FromHexString('#1c2030'); M.beam = beam;
        }
        for (const s of [-1, 1]) {
            const post = BABYLON.MeshBuilder.CreateBox('cp-post', { width: 46, height: H, depth: 46 }, scene);
            post.material = M.stripe; post.parent = root; post.position.set(0, H / 2, s * half);
        }
        const beam = BABYLON.MeshBuilder.CreateBox('cp-beam', { width: 40, height: 60, depth: half * 2 + 60 }, scene);
        beam.material = M.beam; beam.parent = root; beam.position.set(0, H - 10, 0);
        // табло с номером — с обеих сторон перекладины
        const tex = new BABYLON.DynamicTexture('cp-tex-' + i, { width: 256, height: 128 }, scene, true);
        const mat = new BABYLON.StandardMaterial('cp-sign-' + i, scene);
        mat.diffuseTexture = tex; mat.emissiveColor = new BABYLON.Color3(0.55, 0.55, 0.55); mat.backFaceCulling = true; mat.specularColor = new BABYLON.Color3(0, 0, 0);
        // две таблички спина к спине (односторонние): с любой стороны надпись читается, а не зеркально
        const signs = [];
        for (const side of [-1, 1]) {
            const sign = BABYLON.MeshBuilder.CreatePlane('cp-sign', { width: 300, height: 150 }, scene);
            sign.material = mat; sign.parent = root; sign.position.set(side * 22, H + 60, 0); sign.rotation.y = -side * Math.PI / 2;
            signs.push(sign);
        }
        const backing = BABYLON.MeshBuilder.CreateBox('cp-sign-back', { width: 40, height: 156, depth: 306 }, scene);
        backing.material = M.beam; backing.parent = root; backing.position.set(0, H + 60, 0);
        // огни на перекладине
        const lamps = [];
        const n = 6;
        for (let k = 0; k < n; k++) {
            const lamp = BABYLON.MeshBuilder.CreateSphere('cp-lamp', { diameter: 34, segments: 8 }, scene);
            lamp.parent = root; lamp.position.set(-24, H - 10, (k - (n - 1) / 2) * (half * 1.7 / n));
            lamp.material = M.red; lamps.push(lamp);
        }
        // круг-зона на плите
        const r = rr * 0.55;
        const pad = BABYLON.MeshBuilder.CreateDisc('cp-pad', { radius: r, tessellation: 48 }, scene);
        pad.material = M.pad; pad.rotation.x = Math.PI / 2; pad.position.set(p.x, p.y + 3, p.z); pad.isPickable = false;
        pad.renderingGroupId = World3D.LAYER.OVERLAY;
        root.position.set(p.x, p.y, p.z);
        root.rotation.y = -p.yaw;   // перекладина поперёк дороги (локальная X — по ходу)
        World3D.addObject(view, root, 'prop', { outline: false });
        for (const m of root.getChildMeshes(false)) m.isPickable = false;
        const f = { root, pad, tex, signs, lamps, n: i + 1, on: null, wave: Math.random() * 6, raise: 0 };
        this._paintFlag(f, false);
        return f;
    },

    /** Шрифт игры для надписей на текстурах (тот же, что у интерфейса: CSS-переменная --bo-font). */
    _font() {
        let f = '';
        try { f = getComputedStyle(document.documentElement).getPropertyValue('--bo-font').trim(); } catch (e) { /* без DOM */ }
        return f || "'Arial Black', sans-serif";
    },

    _paintFlag(f, on) {
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (f.tex.getContext()));
        const w = 256, h = 128;
        ctx.save();
        ctx.translate(w, 0); ctx.scale(-1, 1);   // \u043f\u043b\u043e\u0441\u043a\u043e\u0441\u0442\u044c \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0442\u0435\u043a\u0441\u0442\u0443\u0440\u0443 \u043e\u0442\u0440\u0430\u0436\u0451\u043d\u043d\u043e\u0439 \u2014 \u0440\u0438\u0441\u0443\u0435\u043c \u0437\u0435\u0440\u043a\u0430\u043b\u044c\u043d\u043e, \u0447\u0442\u043e\u0431\u044b \u0447\u0438\u0442\u0430\u043b\u043e\u0441\u044c
        ctx.fillStyle = '#12141c'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = on ? '#b6ff3b' : '#ffd600'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.font = '84px ' + this._font();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = on ? '#b6ff3b' : '#ffffff';
        ctx.fillText(on ? '\u2714' : String(f.n), w / 2, h / 2 + 4);
        ctx.restore();
        f.tex.update(true);
        const M = this._flagMats;
        for (const l of f.lamps) l.material = on ? M.green : M.red;
        if (on) f.raise = 1;
    },

    // Следующий чекпоинт мигает огнями; взятый — короткий «прыжок» табло.
    _waveFlags(dt) {
        const M = this._flagMats;
        this.flags.forEach((f, i) => {
            f.wave += dt * 6;
            if (f.raise > 0) { f.raise = Math.max(0, f.raise - dt * 1.6); const k = 1 + 0.35 * Math.sin(f.raise * Math.PI); for (const sg of f.signs) sg.scaling.set(k, k, 1); }
            if (i === this.cp && !f.on) {
                const blink = Math.sin(f.wave) > 0;
                f.lamps.forEach((l, k) => { l.material = (k % 2 === 0) === blink ? M.red : M.dim; });
            }
        });
    },

    _updateCoins(t) {
        const mesh = this.coinMesh;
        if (!mesh || !this.coins.length) return;
        const buf = mesh._thinInstanceDataStorage && mesh._thinInstanceDataStorage.matrixData;
        const arr = buf || new Float32Array(16 * this.coins.length);
        const m = BABYLON.Matrix.Identity();
        const ang = t * 3;
        const q = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, ang);
        const one = new BABYLON.Vector3(1, 1, 1), zero = new BABYLON.Vector3(0, 0, 0);
        for (const c of this.coins) {
            const bob = Math.sin(t * 2.2 + c.i) * 8;
            BABYLON.Matrix.ComposeToRef(c.taken ? zero : one, q, new BABYLON.Vector3(c.x, c.y + bob, c.z), m);
            m.copyToArray(arr, c.i * 16);
        }
        mesh.thinInstanceBufferUpdated('matrix');
    },

    // -------------------------------------------------------------------------------------------
    // Меню и заезд
    // -------------------------------------------------------------------------------------------

    worldsInfo() {
        return GAME_WORLDS.filter(w => this.app.maps.some(m => m.id === w.id)).map(w => {
            const r = this.save.worlds[w.id];
            const total = this.app.location.map.id === w.id ? this.cps.length : (r.total || 0);
            return { n: w.n, id: w.id, locked: w.n > this.save.unlocked, needN: w.n - 1, done: r.done, best: r.best, cp: r.cp, total,
                frac: total ? r.cp / (total + 1) : 0 };
        });
    },

    toMenu(first) {
        this.state = 'menu';
        Car.frozen = true;
        Platform.gameplay(false);
        Hud.closeOverlay();
        Pause.set('manual', false);
        Hud.show('menu');
        Hud.renderWorlds(this.worldsInfo(), this.selected);
        const r = this.save.worlds[this.worldDef(this.selected).id];
        Hud.setPlayLabel(r.cp > 0 && !r.done ? 'menu.continue' : 'menu.play');
        Hud.setCoins(Shop.coins);
        Cam.setMode('menu');
        Input.clearContext('jump');
        Input.configure({ controls: false });
        this.placeAt(this.worldOfMap() === this.selected ? this.rec().cp : this.cp);
        Cam.showcase();
        for (const h of Object.values(this.loops)) if (h) h.set(0, null);
        Sound.music('assets/sounds/music-menu.ogg');
        this._menuHot();
        if (!first || !this.save.tutorialDone) { /* подарок дня — после туториала или при следующем входе */ }
        if (this.save.tutorialDone) Tutorial.whenIdle(() => { if (this.state === 'menu') gameMeta().onMenu(); });
    },

    _menuHot() {
        try { Hud.setHot('daily', typeof DailyGift !== 'undefined' && DailyGift.view && DailyGift.view().canClaim); } catch (e) { /* нет данных */ }
        try { Hud.setHot('wheel', typeof Wheel !== 'undefined' && Wheel.status && Wheel.status().free); } catch (e) { /* нет данных */ }
    },

    selectWorld(n) {
        if (!GAME_WORLDS.some(w => w.n === n)) return;
        this.selected = n;
        const r = this.save.worlds[this.worldDef(n).id];
        Hud.renderWorlds(this.worldsInfo(), n);
        Hud.setPlayLabel(r.cp > 0 && !r.done ? 'menu.continue' : 'menu.play');
    },

    async play() {
        if (this._starting || this.selected > this.save.unlocked) return;
        this._starting = true;
        try {
            const w = this.worldDef(this.selected);
            const r = this.save.worlds[w.id];
            if (r.done && r.cp >= 0 && this.state === 'menu' && r.cp === 0) { /* новый заход по пройденному миру */ }
            if (this.app.location.map.id !== w.id && this.app.maps.some(m => m.id === w.id)) {
                await this.app.loadMap(w.id, {
                    label: Lang.t('world.n', { n: w.n }) + ' · ' + Lang.t('world.' + w.n),
                    prepare: async (app) => { await this._prepareWorld(app); await Look._queue; },
                });
            }
            if (this.save.sel !== w.n) { this.save.sel = w.n; this.persist(); }   // следующий заход — с этого мира
            this.startRide();
        } finally { this._starting = false; }
    },

    startRide() {
        if (gameMeta().isOpen()) gameMeta().close();
        const r = this.rec();
        this.state = 'ride';
        this.runTime = r.time; this.deaths = r.deaths; this.runCoins = r.runCoins;
        this.cp = Math.min(r.cp, this.cps.length);
        Course.applyBroken(r.brk);
        this.placeAt(this.cp);
        Car.frozen = false;
        Hud.show('hud');
        Cam.setMode('chase'); Cam.snap();
        Platform.gameplay(true);
        Input.configure({ controls: true });
        Input.setContext({ id: 'jump', label: Lang.t('input.action.jump'), icon: 'assets/ui/icons/jump-arrow.webp', action: 'jump' });
        Sound.music(this.worldDef(this.world).music);
        Hud.setCoins(Shop.coins);
        this._refreshHud();
        for (const b of Bots.list) Bots._place(b, Bots._nearIndex(Bots.list.indexOf(b)));   // игроки рядом со стартом заезда
        if (this.world === 1) Tutorial.autoStart();
        if (typeof Telemetry !== 'undefined') Telemetry.progress('started', 'world_' + this.world, { checkpoint: this.cp });
    },

    pause(on) {
        if (on) {
            if (this.state !== 'ride' && this.state !== 'dead') return;
            Pause.set('manual', true);
            Platform.gameplay(false);
            Hud.showPause({
                resume: () => this.pause(false),
                garage: () => { Hud.closeOverlay(); gameMeta().open('garage'); },
                settings: () => { Hud.closeOverlay(); gameMeta().open('settings'); },
                restart: () => this.restartWorld(),
                menu: () => this.exitToMenu(),
            });
        } else {
            if (this._offer) { this._offerDone(false); return; }   // Esc на предложении — как отказ без рекламы
            Hud.closeOverlay();
            Pause.set('manual', false);
            if (this.state === 'ride') Platform.gameplay(true);
        }
    },

    restartWorld() {
        const r = this.rec();
        r.cp = 0; r.time = 0; r.deaths = 0; r.taken = []; r.runCoins = 0; r.brk = [];
        for (const c of this.coins) c.taken = false;
        this.persist();
        Hud.closeOverlay();
        Pause.set('manual', false);
        this._refreshFlags();
        this.startRide();
    },

    exitToMenu() {
        this._saveRun();
        this._submitScore();
        if (Tutorial.roundCounts()) Platform.ads.roundEnded(false);
        Hud.closeOverlay();
        Pause.set('manual', false);
        Platform.ads.next(() => this.toMenu(false));
    },

    _saveRun() {
        const r = this.rec();
        if (this.state === 'finish') return;
        r.time = this.runTime; r.deaths = this.deaths; r.cp = this.cp; r.runCoins = this.runCoins;
        r.maxCp = Math.max(r.maxCp, this.cp); r.total = this.cps.length;
        r.taken = this.coins.filter(c => c.taken).map(c => c.i);
        r.brk = Course.brokenList();
        this.persist();
    },

    _submitScore() {
        let score = 0;
        for (const w of GAME_WORLDS) { const r = this.save.worlds[w.id]; score += (r.maxCp | 0) + (r.done ? 25 : 0); }
        try { Platform.submitScore(score); } catch (e) { /* нет лидерборда */ }
    },

    // -------------------------------------------------------------------------------------------
    // Кадр
    // -------------------------------------------------------------------------------------------

    update(dt) {
        const app = this.app;
        if (!app) return;
        Course.update(dt);
        const look = Input.consumeLook();
        Cam.wheel(Input.consumeWheel ? Input.consumeWheel() : 0);
        if (this.state !== 'ride') Cam.look(look.dx, look.dy, 'touch');
        if (this.state === 'ride') {
            const m = Input.move();
            const jump = Input.pressed('jump');
            Cam.look(look.dx, look.dy, 'touch');
            const y0 = Car.yaw, p0x = Car.p[0], p0z = Car.p[2];
            Car.step(dt, { throttle: m.y, steer: m.x, jump, trick: Input.down('jump') });
            if (Car.trk.on) this.tutTrick = true;
            if (Tutorial.active) { this.tutDist += Math.hypot(Car.p[0] - p0x, Car.p[2] - p0z); this.tutYaw += Math.abs(Car.yaw - y0); }
            if (this.state === 'ride') {
                this.runTime += dt;
                this._checkpoints();
                this._pickCoins();
                this._checkFinish();
            }
        } else if (this.state === 'dead') {
            Car.step(dt, {});   // упавшая машина летит вниз (вид)
            this.deadT -= dt;
            if (this.deadT <= 0) this._respawn();
        } else if (this.state === 'menu') {
            Car.frozen = true;
        }
        Bots.update(dt, this.state === 'ride');
        Look.update(dt, this.state === 'finish' ? 'cheer' : this.state === 'ride' ? 'ride' : 'menu');
        this._updateCoins(Course.time);
        this._waveFlags(dt);
        if (this._ramT > 0) { this._ramT -= dt; if (this._ramT <= 0) this.ramCombo = 0; }
        if (this._flagMats) this._flagMats.pad.alpha = 0.75 + 0.25 * Math.sin(Course.time * 3);
        this._sound(dt);
        if (this.state === 'ride' || this.state === 'dead') this._refreshHud();
        if (this.rocketFx) {
            this.rocketFx.setRate(Car.boost > 0 && this.state === 'ride' ? 70 : 0);
            if (Car.boost <= 0 && this._rocketWas) { this._rocketWas = false; Hud.refreshAds(0); }
        }
        if (Car.boost > 0) Hud.refreshAds(Car.boost);
        this._saveT += dt;
        if (this._saveT > 20 && this.state === 'ride') { this._saveT = 0; this._saveRun(); }
    },

    _refreshHud() {
        Hud.setTime(this.runTime, this.deaths, this.rec().best);
        Hud.setSpeed(this.state === 'ride' ? Car.vf : 0);
        Hud.setProgress(this.progress(), this.cp);
    },

    _checkpoints() {
        const next = this.cps[this.cp];
        if (!next) return;
        const p = this._pt(next);
        const r = Math.max(150, (Array.isArray(next.scale) ? Number(next.scale[0]) : 3) * 100);
        if (Math.hypot(Car.p[0] - p.x, Car.p[2] - p.z) < r && Math.abs(Car.p[1] - p.y) < 320) this.reachCheckpoint(this.cp + 1, true);
    },

    reachCheckpoint(n, reward) {
        const wasMax = this.rec().maxCp;
        this.cp = n;
        this._refreshFlags();
        const isNew = n > wasMax;
        if (isNew) Platform.analytics('checkpoint_reached', { world: this.world, checkpoint: n });
        if (reward && isNew) {
            const k = typeof COINS_PER_CHECKPOINT !== 'undefined' ? COINS_PER_CHECKPOINT : 5;
            Shop.addCoins(k, { save: false });
            this.runCoins += k;
            Hud.toast(Lang.t('toast.coins', { n: k }), true);
        }
        Hud.toast(Lang.t('toast.cp', { n }));
        Sound.play('assets/sounds/checkpoint.ogg', { volume: 0.8 });
        const f = this.flags[n - 1];
        if (f && this.app.fx) this.app.fx.play('checkpoint', f.root.position.add(new BABYLON.Vector3(0, 420, 0)));
        Tutorial.complete('cp');
        this._saveRun();
    },

    _pickCoins() {
        const bx = Car.p[0], by = Car.p[1] + 70, bz = Car.p[2];
        const R = typeof COIN_PICKUP_RADIUS !== 'undefined' ? COIN_PICKUP_RADIUS : 300;
        for (const c of this.coins) {
            if (c.taken) continue;
            const dx = c.x - bx, dz = c.z - bz;
            if (dx * dx + dz * dz > R * R || Math.abs(c.y - by) > R) continue;
            c.taken = true;
            Shop.addCoins(1, { save: false });
            this.runCoins += 1;
            Sound.play('assets/sounds/coin.ogg', { volume: 0.55, rate: 0.95 + Math.random() * 0.15 });
            if (this.app.fx) this.app.fx.play('coin', new BABYLON.Vector3(c.x, c.y, c.z));
        }
    },

    _checkFinish() {
        const f = this.finish;
        if (!f) return;
        const p = this._pt(f);
        const r = Math.max(250, (Array.isArray(f.scale) ? Number(f.scale[0]) : 4) * 100);
        if (Math.hypot(Car.p[0] - p.x, Car.p[2] - p.z) < r && Math.abs(Car.p[1] - p.y) < 350) this._finishWorld();
    },

    _finishWorld() {
        this.state = 'finish';
        Car.frozen = true;
        Platform.gameplay(false);
        Input.clearContext('jump');
        const r = this.rec();
        const time = this.runTime;
        const record = !r.best || time < r.best;
        if (record) r.best = time;
        const bonus = typeof COINS_PER_FINISH !== 'undefined' ? COINS_PER_FINISH : 50;
        Shop.addCoins(bonus, { save: false });
        const coins = this.runCoins + bonus;
        r.done = true; r.maxCp = Math.max(r.maxCp, this.cps.length); r.total = this.cps.length;
        r.cp = 0; r.time = 0; r.deaths = 0; r.taken = []; r.runCoins = 0; r.brk = [];
        const deaths = this.deaths;
        if (this.world >= this.save.unlocked && this.world < GAME_WORLDS.length) this.save.unlocked = this.world + 1;
        this.persist();
        this._submitScore();
        if (typeof Telemetry !== 'undefined') Telemetry.progress('completed', 'world_' + this.world);
        Platform.ads.roundEnded(true);
        Sound.play('assets/sounds/win.ogg', { volume: 0.9 });
        setTimeout(() => Sound.play('synth:horn', { volume: 0.5 }), 350);
        if (this.app.fx) this.app.fx.play('finish', new BABYLON.Vector3(Car.p[0], Car.p[1] + 260, Car.p[2]));
        Cam.setMode('finish');
        const nextN = this.world + 1;
        const hasNext = GAME_WORLDS.some(w => w.n === nextN) && this.app.maps.some(m => m.id === this.worldDef(nextN).id);
        setTimeout(() => {
            Hud.show('none');
            Hud.showFinish({ n: this.world, time, best: r.best, coins, deaths, record, all: !hasNext }, {
                next: hasNext ? () => Platform.ads.next(() => { Hud.closeOverlay(); this.selected = nextN; this.save.sel = nextN; this.play(); }) : null,
                again: () => Platform.ads.next(() => { Hud.closeOverlay(); for (const c of this.coins) c.taken = false; this._refreshFlags(); this.startRide(); }),
                menu: () => Platform.ads.next(() => { Hud.closeOverlay(); this.cp = 0; for (const c of this.coins) c.taken = false; Course.applyBroken([]); this._refreshFlags(); this.toMenu(false); }),
            });
        }, 1400);
    },

    _die(reason) {
        if (this.state !== 'ride') return;
        this.state = 'dead';
        this.deaths++;
        this.deadT = reason === 'fall' ? 1.0 : 1.5;
        Sound.play('assets/sounds/oof.ogg', { volume: 0.8 });
        if (reason !== 'fall' && reason !== 'stuck') {
            // разбилась (перевернулась, лава): дым и вспышка, водитель вылетает через крышу
            Look.crash(reason);
            Look.launchRider();
            Sound.play('assets/sounds/crash-boom.wav', { volume: 0.55 });
            Cam.shake(18, 0.35);
        }
        Hud.toast(Lang.t('toast.fall'), true);
    },

    _respawn() {
        if (this._maybeOffer()) return;          // сначала предложение (игра на паузе), респаун — после закрытия
        this.state = 'ride';
        this.placeAt(this.cp);
        Car.frozen = false;
        Hud.flash(0.55, 450);
    },

    // ---------------------------------------------------------------------------------------------
    // Предложение после падения: иногда показать вещь из Гаража (за рекламу или монеты). «Нет, спасибо» —
    // межстраничная реклама, если площадка её даёт, но не чаще чем на каждое OFFER_AD_EVERY-е предложение.
    // ---------------------------------------------------------------------------------------------
    _offerDeaths: 0, _offerAt: -1e9, _offersNoAd: 0, /** @type {any} */ _offer: null,

    _maybeOffer() {
        const U = 'undefined';
        const every = typeof OFFER_EVERY_FALLS !== U ? OFFER_EVERY_FALLS : 3;
        const gap = typeof OFFER_MIN_SECONDS !== U ? OFFER_MIN_SECONDS : 60;
        this._offerDeaths++;
        if (this._offer || Tutorial.active || this._offerDeaths < every) return false;
        if (performance.now() - this._offerAt < gap * 1000) return false;
        const it = this._offerItem();
        if (!it) return false;
        this._offerDeaths = 0;
        this._offerAt = performance.now();
        this._offer = { id: it.id };
        Pause.set('manual', true);
        Platform.gameplay(false);
        this._drawOffer();
        return true;
    },

    // Вещь, которую видно в игре: не своя, не эксклюзив; за рекламу (если площадка даёт) или по карману.
    _offerItem() {
        if (typeof Shop === 'undefined' || !Shop.items) return null;
        const ads = typeof Ads !== 'undefined' && Ads.supported();
        const pool = Shop.items().filter(it => !it.default && !it.exclusive && !Shop.owns(it.id) && it.price
            && ((it.price.ads && ads) || (it.price.coins && it.price.coins <= Shop.coins)));
        if (!pool.length) return null;
        const w = { legendary: 3, epic: 3, rare: 2, common: 1 };
        let total = 0;
        for (const it of pool) total += w[it.rarity] || 1;
        let r = Math.random() * total;
        for (const it of pool) { r -= w[it.rarity] || 1; if (r <= 0) return it; }
        return pool[0];
    },

    _drawOffer() {
        const o = this._offer;
        if (!o) return;
        const it = Shop.item(o.id);
        const card = Shop.card(o.id) || {};
        const name = Shop.name ? Shop.name(o.id) : o.id;
        const need = Shop.need ? Shop.need(o.id) : 0, prog = Shop.progress ? Shop.progress(o.id) : 0;
        const rar = Lang.t('offer.r.' + (it.rarity || 'common'));
        const html = `<h2>${Lang.t('offer.title')}</h2>
          <div class="offer-item r-${it.rarity || 'common'}"><img class="offer-img" alt="" src="${HUD_ICON.star}"><div class="offer-nm">${name}</div><div class="offer-rar">${rar}</div></div>`;
        const btns = [];
        if (it.price.ads) {
            const left = Ads.cooldownLeft();
            btns.push({ key: left > 0 ? 'offer.wait' : 'offer.watch', params: { a: prog, b: need, n: left }, icon: HUD_ICON.ad, color: 'var(--bo-orange)',
                off: left > 0 || Ads.busy(), keep: true, fn: () => this._offerWatch() });
        } else {
            btns.push({ key: 'offer.buy', params: { n: it.price.coins }, icon: HUD_ICON.coin, fn: () => this._offerBuy() });
        }
        btns.push({ key: 'offer.no', color: 'var(--bo-purple)', fn: () => this._offerNo() });
        Hud.overlay(html, btns);
        if (typeof GameLook !== 'undefined' && GameLook.thumb) GameLook.thumb(o.id).then((url) => {
            const img = /** @type {HTMLImageElement} */ (document.querySelector('#bo-over .offer-img'));
            if (url && img && this._offer === o) img.src = url;
        });
        if (!this._offerTick) this._offerTick = Ads.on(() => { if (this._offer && Hud.overlayOpen()) this._drawOffer(); });
        void card;
    },
    /** @type {any} */ _offerTick: null,

    async _offerWatch() {
        const o = this._offer;
        if (!o || !Ads.ready()) return;
        const r = await Shop.watchAd(o.id);
        if (this._offer !== o) return;
        if (r && r.ok && Shop.owns(o.id)) { Shop.equip(o.id); this._offerDone(true); return; }
        this._drawOffer();   // засчитан один просмотр из нескольких — прогресс и пауза между рекламой видны на кнопке
    },

    _offerBuy() {
        const o = this._offer;
        if (!o) return;
        const r = Shop.buy(o.id);
        if (r && r.ok) { Shop.equip(o.id); this._offerDone(true); }
        else this._drawOffer();
    },

    async _offerNo() {
        const every = typeof OFFER_AD_EVERY !== 'undefined' ? OFFER_AD_EVERY : 2;
        this._offersNoAd++;
        Hud.closeOverlay();
        if (this._offersNoAd >= every && Platform.interstitialSupported()) {
            this._offersNoAd = 0;
            try { await Platform.interstitial(); } catch (e) { /* реклама не пришла — дальше без неё */ }
        }
        this._offerDone(false);
    },

    _offerDone(got) {
        this._offer = null;
        Hud.closeOverlay();
        Pause.set('manual', false);
        if (got) { Hud.toast(Lang.t('offer.got')); Sound.play('assets/sounds/reward.ogg', { volume: 0.8 }); this.persist(); }
        if (this.state === 'dead') {
            this.state = 'ride';
            this.placeAt(this.cp);
            Car.frozen = false;
            Hud.flash(0.55, 450);
            Platform.gameplay(true);
        }
    },

    // -------------------------------------------------------------------------------------------
    // Награды за рекламу в заезде
    // -------------------------------------------------------------------------------------------

    async skipStage() {
        if (this.state !== 'ride' || !Ads.ready()) return;
        const wasPaused = Pause.has('manual');
        void wasPaused;
        const ok = await Ads.rewarded('skip-stage');
        if (!ok) { Hud.toast(Lang.t('toast.adFail'), true); return; }
        if (this.state !== 'ride') return;
        if (this.cp < this.cps.length) {
            this.reachCheckpoint(this.cp + 1, false);
            this.placeAt(this.cp);
            Car.frozen = false;
            Hud.toast(Lang.t('toast.skip'), true);
        } else if (this.finish) {
            const p = this._pt(this.finish);
            Car.reset(p.x, p.y, p.z, p.yaw);
            Look.seatRider(); Cam.snap();
        }
    },

    async rocket() {
        if (this.state !== 'ride' || Car.boost > 0 || !Ads.ready()) return;
        const ok = await Ads.rewarded('rocket');
        if (!ok) { Hud.toast(Lang.t('toast.adFail'), true); return; }
        const sec = typeof CAR_BOOST_SECONDS !== 'undefined' ? CAR_BOOST_SECONDS : 45;
        Car.boost = sec;
        this._rocketWas = true;
        Hud.toast(Lang.t('toast.rocket', { n: sec }), true);
        Sound.play('assets/sounds/boost.ogg', { volume: 0.9 });
        if (!this.rocketFx && this.app.fx) {
            this.rocketFx = this.app.fx.create({
                texture: 'assets/fx/flame.webp', rate: 0, capacity: 160, life: [0.15, 0.35], size: [40, 80], speed: [60, 160],
                follow: () => { const q = Car.point(-235, 42, 0); return new BABYLON.Vector3(q[0], q[1], q[2]); },
                direction: [[-0.4, -0.2, -0.4], [0.4, 0.4, 0.4]], colorGradient: [[0, '#fff3a0', 1], [0.4, '#ff8a1c', 0.9], [1, '#ff3b1c', 0]],
                sizeGradient: [[0, 1], [1, 0.3]],
            });
        }
    },

    // -------------------------------------------------------------------------------------------
    // Связи: HUD, Мета, машина, туториал
    // -------------------------------------------------------------------------------------------

    // Только Playables (просьба модерации площадки): межстраничная реклама на КАЖДОЕ нажатие кнопки
    // интерфейса — меню, Гараж, окна, пауза, результат, туториал. Показывать ли объявление, решает SDK
    // (requestInterstitialAd ничего не гарантирует). Не трогаем кнопки rewarded-рекламы (на них иконка
    // рекламы: «Этап», «Ракета», «За рекламу», x2, вращение за рекламу) и игровое управление (стик,
    // кнопка прыжка). Пока идёт показ, новый запрос не уходит (Platform._adBusy), поэтому кнопки перехода
    // с собственной рекламой (Platform.ads.next) не дают двойного показа. Локально: ?uiads&mockads.
    _initUiAds() {
        if (typeof document === 'undefined') return;
        const on = String(GAME_PLATFORM) === 'playables' || (typeof location !== 'undefined' && /[?&]uiads\b/.test(location.search));
        if (!on) return;
        document.addEventListener('click', (e) => {
            const t = /** @type {any} */ (e.target);
            const el = t && t.closest ? t.closest('button, [role="button"], .bo-btn') : null;
            if (!el || el.disabled) return;
            if (el.closest('.lory-input-layer, #loading-screen')) return;     // управление машиной и экран загрузки
            if (el.querySelector('img[src*="ad-video"]')) return;              // rewarded: своя реклама
            if (Platform._adBusy || !Platform.interstitialSupported()) return;
            Platform.interstitial();
        }, true);
    },

    _bindHud() {
        Hud.on.play = () => this.play();
        Hud.on.selectWorld = (n) => this.selectWorld(n);
        Hud.on.meta = (name) => gameMeta().open(name);
        Hud.on.pause = () => this.pause(true);
        Hud.on.skip = () => this.skipStage();
        Hud.on.rocket = () => this.rocket();
    },

    /** Мета-окна просят камеру на машину (Гараж) или обратно. */
    setView(mode) {
        if (mode === 'garage') Cam.setMode('garage');
        else Cam.setMode(this.state === 'menu' ? 'menu' : 'chase');
    },

    onMetaClosed() {
        this.setView('menu');
        if (this.state === 'menu') { Hud.show('menu'); Hud.renderWorlds(this.worldsInfo(), this.selected); Hud.setCoins(Shop.coins); this._menuHot(); }
        else if (Pause.has('manual')) this.pause(true);
    },

    howToPlay() {
        if (gameMeta().isOpen()) gameMeta().close();
        if (this.state === 'menu') {
            this.selected = 1;
            this.play().then(() => Tutorial.start({ replay: true }));
        } else {
            this.pause(false);
            Tutorial.start({ replay: true });
        }
    },

    _bindCar() {
        Car.on.die = (reason) => this._die(reason);
        Car.on.jump = () => Sound.play('assets/sounds/jump.ogg', { volume: 0.55 });
        Car.on.land = (v) => {
            if (v > 700) {
                Sound.play('assets/sounds/land.ogg', { volume: Math.min(1, v / 2200) });
                if (this.app.fx && v > 1100) this.app.fx.play('landdust', new BABYLON.Vector3(Car.p[0], Car.p[1] + 6, Car.p[2]));
                if (v > 1600) Cam.shake(Math.min(12, v / 250), 0.2);
            }
        };
        Car.on.climb = () => Sound.play('assets/sounds/land.ogg', { volume: 0.45, rate: 1.2 });
        Car.on.ram = (info) => this._ram(info);
        Car.on.trick = (t) => this._trick(t);
        Car.on.bonk = (v) => { Sound.play('assets/sounds/metal-hit.ogg', { volume: Math.min(0.9, 0.35 + v / 3000) }); Cam.shake(Math.min(14, 4 + v / 300), 0.2); };
        Car.on.hit = () => { Sound.play('assets/sounds/hit.ogg', { volume: 0.9 }); Cam.shake(16, 0.3); };
        let padT = 0;
        Car.on.pad = (kind) => {
            const now = performance.now();
            if (now - padT < 500) return;
            padT = now;
            Sound.play(kind === 'jump' ? 'assets/sounds/spring.ogg' : 'assets/sounds/boost.ogg', { volume: 0.7 });
            if (kind === 'boost') Hud.toast(Lang.t('toast.boost'), true);
        };
    },

    // -------------------------------------------------------------------------------------------
    // Таран и трюки
    // -------------------------------------------------------------------------------------------

    /** Трак задел разрушаемое препятствие: сносим, монеты, потеря скорости (броня снижает), обломки, звук. true — снесено. */
    _ram(info) {
        const p = info && info.piece;
        if (this.state !== 'ride' || !p || !p.brk || p.brk.state !== 'idle') return false;
        const kind = p.brk.kind;
        const U = 'undefined';
        const crush = info.mode === 'top' && kind === 'car';
        const q = info.q || p.O;
        Course.shatter(p, { car: Car, q, mode: info.mode, crush });
        const base = kind === 'wall' ? (typeof RAM_COINS_WALL !== U ? RAM_COINS_WALL : 5) : kind === 'car' ? (typeof RAM_COINS_CAR !== U ? RAM_COINS_CAR : 6) : (typeof RAM_COINS_CRATE !== U ? RAM_COINS_CRATE : 2);
        let coins = Number.isFinite(p.prm.coins) ? Math.max(0, p.prm.coins | 0) : base;
        if (crush) coins += typeof RAM_CRUSH_BONUS !== U ? RAM_CRUSH_BONUS : 12;
        if (coins > 0) { Shop.addCoins(coins, { save: false }); this.runCoins += coins; }
        const lossBase = kind === 'wall' ? (typeof RAM_LOSS_WALL !== U ? RAM_LOSS_WALL : 0.11) : kind === 'car' ? (typeof RAM_LOSS_CAR !== U ? RAM_LOSS_CAR : 0.08) : (typeof RAM_LOSS_CRATE !== U ? RAM_LOSS_CRATE : 0.05);
        const armor = Math.max(0, Math.min(0.95, (this.save.tune.armor | 0) * (typeof TUNE_ARMOR_STEP !== U ? TUNE_ARMOR_STEP : 0.15)));
        const loss = info.mode === 'top' && kind !== 'car' ? lossBase * 0.4 : lossBase;
        const k = 1 - loss * (1 - armor);
        Car.v[0] *= k; Car.v[2] *= k;
        this.save.stats.rams++;
        this.ramCombo++; this._ramT = 2.2;
        const label = crush ? Lang.t('ram.crush') : this.ramCombo > 2 ? Lang.t('ram.combo', { n: this.ramCombo }) : Lang.t('ram.smash');
        Hud.trick(label, coins > 0 ? '+' + coins : '', crush ? 'crush' : 'ram');
        const pt = new BABYLON.Vector3(q[0], q[1], q[2]);
        if (this.app.fx) this.app.fx.play(kind === 'wall' ? 'ramwall' : 'ram', pt);
        const sp = Math.min(1, Math.hypot(Car.v[0], Car.v[2]) / 2000);
        Sound.play(kind === 'crate' ? 'assets/sounds/hit.ogg' : 'assets/sounds/crash-boom.wav', { volume: 0.5 + 0.4 * sp, rate: kind === 'wall' ? 0.8 : 1 + Math.random() * 0.2 });
        if (kind !== 'crate') Sound.play('assets/sounds/metal-hit.ogg', { volume: 0.5, rate: 0.7 + Math.random() * 0.2 });
        Cam.shake(crush ? 7 : 5 + 7 * sp, 0.22);
        Tutorial.complete('ram');
        this._saveT = Math.max(this._saveT, 15);
        return true;
    },

    /** Чистая посадка после сальто и/или бочки: монеты, буст (в GameCar), надпись трюка. */
    _trick(t) {
        if (this.state !== 'ride') return;
        const U = 'undefined';
        const flips = t.flips | 0, rolls = t.rolls | 0;
        let coins = flips * (typeof TRICK_COINS_FLIP !== U ? TRICK_COINS_FLIP : 14) + rolls * (typeof TRICK_COINS_ROLL !== U ? TRICK_COINS_ROLL : 10);
        if (flips > 0 && rolls > 0) coins += typeof TRICK_COMBO_COINS !== U ? TRICK_COMBO_COINS : 12;
        Shop.addCoins(coins, { save: false });
        this.runCoins += coins;
        this.save.stats.tricks++;
        const mult = (n) => n > 1 ? (n === 2 ? Lang.t('trick.double') + ' ' : n === 3 ? Lang.t('trick.triple') + ' ' : Lang.t('trick.many', { n }) + ' ') : '';
        let name;
        if (flips > 0 && rolls > 0) name = Lang.t('trick.combo');
        else if (flips > 0) name = mult(flips) + Lang.t(t.back ? 'trick.back' : 'trick.front');
        else name = mult(rolls) + Lang.t('trick.roll');
        Hud.trick(name, '+' + coins, 'trick');
        Hud.toast(Lang.t('toast.trickBoost'), true);
        if (this.app.fx) this.app.fx.play('trickland', new BABYLON.Vector3(Car.p[0], Car.p[1] + 30, Car.p[2]));
        Sound.play('assets/sounds/reward.ogg', { volume: 0.75 });
        Sound.play('assets/sounds/boost.ogg', { volume: 0.5, rate: 1.15 });
        Cam.shake(4, 0.15);
        Tutorial.complete('trick');
        if (typeof Platform.analytics === 'function') Platform.analytics('trick_landed', { world: this.world, flips, rolls });
    },

    /** Тюнинг: инфо по улучшению ('susp' | 'motor' | 'armor') для Гаража. */
    tuneInfo(key) {
        const U = 'undefined';
        const max = typeof TUNE_MAX_LEVEL !== U ? TUNE_MAX_LEVEL : 5;
        const lvl = this.save.tune[key] | 0;
        const base = typeof TUNE_PRICE_BASE !== U ? TUNE_PRICE_BASE : 120, grow = typeof TUNE_PRICE_GROWTH !== U ? TUNE_PRICE_GROWTH : 1.75;
        const price = lvl >= max ? 0 : Math.round(base * Math.pow(grow, lvl) / 10) * 10;
        const step = key === 'susp' ? (typeof TUNE_JUMP_STEP !== U ? TUNE_JUMP_STEP : 0.07) : key === 'motor' ? (typeof TUNE_SPEED_STEP !== U ? TUNE_SPEED_STEP : 0.04) : (typeof TUNE_ARMOR_STEP !== U ? TUNE_ARMOR_STEP : 0.15);
        return { key, level: lvl, max, price, step, maxed: lvl >= max, canBuy: lvl < max && Shop.coins >= price };
    },

    /** Купить следующий уровень улучшения за монеты. { ok, reason?, level? } */
    tuneBuy(key) {
        const i = this.tuneInfo(key);
        if (i.maxed) return { ok: false, reason: 'max' };
        if (Shop.coins < i.price) return { ok: false, reason: 'noCoins', missing: i.price - Shop.coins };
        Shop.spend(i.price, { reason: 'tune', save: false });
        this.save.tune[key] = i.level + 1;
        Car.tune = this.save.tune;
        this.persist();
        Platform.analytics('tune_bought', { key, level: i.level + 1 });
        return { ok: true, level: i.level + 1 };
    },

    _initTutorial() {
        Tutorial.init({
            app: this.app,
            steps: [
                { id: 'ride', title: 'tut.ride.t', hint: { keyboard: 'tut.ride.keyboard', touch: 'tut.ride.touch', pad: 'tut.ride.touch' }, keys: { keyboard: ['forward'] },
                    icons: { touch: ['stick'] }, target: { touch: '@stick' }, check: () => Math.min(1, this.tutDist / 600), onEnter: () => { this.tutDist = 0; } },
                { id: 'steer', title: 'tut.steer.t', hint: { keyboard: 'tut.steer.keyboard', touch: 'tut.steer.touch', pad: 'tut.steer.touch' }, keys: { keyboard: ['left', 'right'] },
                    icons: { touch: ['stick'] }, target: { touch: '@stick' }, check: () => Math.min(1, this.tutYaw / 1.4), onEnter: () => { this.tutYaw = 0; } },
                { id: 'hop', title: 'tut.hop.t', hint: { keyboard: 'tut.hop.keyboard', touch: 'tut.hop.touch', pad: 'tut.hop.keyboard' }, keys: { keyboard: ['jump'], pad: ['jump'] },
                    target: { touch: '@context' }, action: 'jump' },
                { id: 'trick', title: 'tut.trick.t', hint: { keyboard: 'tut.trick.keyboard', touch: 'tut.trick.touch', pad: 'tut.trick.keyboard' }, keys: { keyboard: ['jump', 'forward', 'left'], pad: ['jump'] },
                    target: { touch: '@context' }, event: 'trick', check: () => (this.tutTrick ? 1 : 0), onEnter: () => { this.tutTrick = false; } },
                { id: 'ram', title: 'tut.ram.t', hint: 'tut.ram.h', event: 'ram', skipIf: () => !Course.hasBreakables(),
                    world: () => { const b = Course.nearestBreakable(Car.p[0], Car.p[2], Math.cos(Car.yaw), Math.sin(Car.yaw)); return b ? { x: b.x, y: b.z, h: b.y + 220 } : null; } },
                { id: 'cp', title: 'tut.cp.t', hint: 'tut.cp.h', event: 'cp', skipIf: () => this.cp > 0,
                    world: () => { const d = this.cps[this.cp]; if (!d) return null; const p = this._pt(d); return { x: p.x, y: p.z, h: p.y + 260 }; } },
            ],
            state: () => this.save, field: 'tutorialDone', persist: () => this.persist(),
            onFinish: () => { /* игра уже идёт: ограничений обучения нет */ },
            css: `.lory-tut{font-family:var(--bo-font)!important}`,
        });
    },

    _registerFx() {
        const fx = this.app.fx;
        if (!fx) return;
        fx.register('checkpoint', [
            { texture: 'assets/fx/confetti-color.webp', blend: 'standard', burst: 40, capacity: 50, life: [0.8, 1.6], size: [14, 26], speed: [250, 520], spin: [-6, 6], gravity: [0, -900, 0], direction: [[-1, 0.6, -1], [1, 1.4, 1]] },
            { texture: 'assets/fx/sparkle-4pt.webp', burst: 14, capacity: 20, life: [0.3, 0.7], size: [30, 60], speed: [40, 140], color: '#fff6a0' },
        ]);
        fx.register('ram', [
            { texture: 'assets/fx/dust-puff.webp', blend: 'standard', burst: 12, capacity: 16, life: [0.5, 1.0], size: [70, 150], speed: [120, 420], direction: [[-1, 0.2, -1], [1, 1, 1]], alpha: 0.75, color: '#b7a58c' },
            { texture: 'assets/fx/spark-streak.webp', burst: 14, capacity: 18, life: [0.15, 0.4], size: [14, 30], speed: [300, 800], gravity: [0, -1400, 0], direction: [[-1, 0.2, -1], [1, 1.2, 1]], color: '#ffd27a' },
            { texture: 'assets/fx/flash-star.webp', burst: 1, capacity: 2, life: [0.08, 0.14], size: [140, 200], speed: [0, 10], color: '#fff2c4' },
        ]);
        fx.register('ramwall', [
            { texture: 'assets/fx/smoke-puff.webp', blend: 'standard', burst: 16, capacity: 20, life: [0.7, 1.4], size: [100, 210], speed: [140, 460], direction: [[-1, 0.2, -1], [1, 1, 1]], alpha: 0.7, color: '#8f949b' },
            { texture: 'assets/fx/spark-streak.webp', burst: 20, capacity: 24, life: [0.15, 0.45], size: [14, 32], speed: [320, 900], gravity: [0, -1400, 0], direction: [[-1, 0.2, -1], [1, 1.2, 1]], color: '#ffc46b' },
        ]);
        fx.register('trickland', [
            { texture: 'assets/fx/sparkle-big.webp', burst: 10, capacity: 14, life: [0.4, 0.9], size: [60, 120], speed: [120, 380], direction: [[-1, 0.6, -1], [1, 1.4, 1]], color: '#ffe36b' },
            { texture: 'assets/fx/shockwave-ring.webp', burst: 1, capacity: 2, life: [0.35, 0.5], size: [260, 340], speed: [0, 5], color: '#ffb02e' },
            { texture: 'assets/fx/dust-puff.webp', blend: 'standard', burst: 10, capacity: 14, life: [0.4, 0.8], size: [60, 120], speed: [120, 320], direction: [[-1, 0.1, -1], [1, 0.5, 1]], alpha: 0.7, color: '#c9b8a0' },
        ]);
        fx.register('coin', [
            { texture: 'assets/fx/coin-sparkle.webp', burst: 6, capacity: 10, life: [0.25, 0.5], size: [24, 46], speed: [40, 120], color: '#ffe36b' },
        ]);
        fx.register('landdust', [
            { texture: 'assets/fx/dust-puff.webp', blend: 'standard', burst: 10, capacity: 14, life: [0.4, 0.8], size: [40, 80], speed: [80, 220], direction: [[-1, 0.1, -1], [1, 0.4, 1]], alpha: 0.8 },
        ]);
        fx.register('finish', [
            { texture: 'assets/fx/confetti-color.webp', blend: 'standard', burst: 120, capacity: 140, life: [1.2, 2.4], size: [16, 30], speed: [300, 800], spin: [-6, 6], gravity: [0, -700, 0], direction: [[-1, 0.5, -1], [1, 1.6, 1]] },
            { delay: 0.1, texture: 'assets/fx/rainbow-star.webp', blend: 'standard', burst: 30, capacity: 40, life: [0.8, 1.6], size: [24, 44], speed: [200, 500], gravity: [0, -400, 0] },
        ]);
    },

    // Звуки машины — синтез без файлов: мотор (вспышки в цилиндрах; обороты — скорость воспроизведения,
    // нагрузка — громкость), визг шин (тон с вибрато + шум), шум качения и ветер — от скорости.
    _initSound() {
        const R = 22050;
        let seed = 12345;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const noise = (seconds, color) => {
            const n = Math.floor(R * seconds), out = new Float32Array(n);
            let b0 = 0, b1 = 0, last = 0;
            for (let i = 0; i < n; i++) {
                const w = rnd() * 2 - 1;
                if (color === 'brown') { last = (last + 0.02 * w) / 1.02; out[i] = last * 3.2; }
                else { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; out[i] = (b0 + b1 + w * 0.18) * 0.18; }
            }
            const fade = Math.floor(R * 0.05);   // бесшовный цикл
            for (let i = 0; i < fade; i++) { const k = i / fade; out[i] = out[i] * k + out[n - fade + i] * (1 - k); }
            return Sound.makeBuffer(out.subarray(0, n - fade), R);
        };
        // мотор монстр-трака (V8: низкий рокот, грубые вспышки): 45 тактов в секунду ровно (490 отсчётов на такт) — цикл без шва; хвосты вспышек заворачиваются в начало
        const engine = () => {
            const f0 = 45, per = R / f0, n = R, out = new Float32Array(n);
            for (let k = 0; k < f0; k++) {
                const t0 = k * per + Math.round((rnd() - 0.5) * 4), amp = 0.8 + rnd() * 0.4, len = Math.floor(per * 2.2);
                for (let i = 0; i < len; i++) {
                    const t = i / R, env = Math.exp(-t * 30);
                    out[(t0 + i + n) % n] += amp * env * (Math.sin(6.2832 * 72 * t) * 0.7 + Math.sin(6.2832 * 148 * t) * 0.3 + Math.sin(6.2832 * 36 * t) * 0.35 + (rnd() * 2 - 1) * 0.32);
                }
            }
            for (let i = 0; i < n; i++) { const ph = (i % per) / per; out[i] += (1 - 2 * ph) * 0.2 + Math.sin(6.2832 * ph) * 0.4 + Math.sin(6.2832 * ph * 2) * 0.12; }
            let mx = 1e-6;
            for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(out[i]));
            for (let i = 0; i < n; i++) out[i] *= 0.8 / mx;
            return Sound.makeBuffer(out, R);
        };
        // визг шин: тон 1150 Гц с вибрато 6 Гц (целое число периодов в секунде) + немного шума
        const screech = () => {
            const n = R, out = new Float32Array(n);
            let ph = 0, lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / R;
                ph += 6.2832 * (1150 + 60 * Math.sin(6.2832 * 6 * t)) / R;
                lp += ((rnd() * 2 - 1) - lp) * 0.35;
                out[i] = Math.sin(ph) * 0.45 + Math.sin(ph * 2.01) * 0.12 + lp * 0.25;
            }
            const fade = Math.floor(R * 0.04);
            for (let i = 0; i < fade; i++) { const k = i / fade; out[i] = out[i] * k + out[n - fade + i] * (1 - k); }
            return Sound.makeBuffer(out.subarray(0, n - fade), R);
        };
        // клаксон: два тона (как у легковушки), 0.7 с с мягкими краями
        const horn = () => {
            const n = Math.floor(R * 0.7), out = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const t = i / R, env = Math.min(1, t / 0.02) * Math.min(1, (0.7 - t) / 0.08);
                const sq = (f) => (Math.sin(6.2832 * f * t) > 0 ? 1 : -1) * 0.5 + Math.sin(6.2832 * f * t) * 0.5;
                out[i] = (sq(392) * 0.5 + sq(494) * 0.5) * env * 0.35;
            }
            return Sound.makeBuffer(out, R);
        };
        // хлопок выхлопа: короткий шумовой удар с низким «бум»
        const pop = () => {
            const n = Math.floor(R * 0.22), out = new Float32Array(n);
            let lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / R, env = Math.exp(-t * 32);
                lp += ((rnd() * 2 - 1) - lp) * 0.25;
                out[i] = (lp * 0.8 + Math.sin(6.2832 * 70 * t) * Math.exp(-t * 18) * 0.9) * env;
            }
            return Sound.makeBuffer(out, R);
        };
        try {
            const pb = pop();
            if (pb) Sound.putBuffer('pop', pb);
            const hb = horn();
            if (hb) Sound.putBuffer('horn', hb);
            const bufs = { roll: noise(2, 'brown'), wind: noise(3, 'pink'), engine: engine(), screech: screech() };
            for (const [name, buf] of Object.entries(bufs)) {
                if (!buf) continue;
                Sound.putBuffer(name, buf);
                this.loops[name] = Sound.loop('synth:' + name, { volume: 0 });
            }
        } catch (e) { console.warn('Синтез звука:', e); }
    },

    _sound(dt) {
        void dt;
        const sp = Math.abs(Car.vf), riding = this.state === 'ride';
        const L = this.loops;
        if (L.engine) L.engine.set(riding ? 0.16 + 0.2 * Math.abs(Car.throttle) + (Car.boost > 0 ? 0.08 : 0) : 0, 0.55 + Car.rpm * 1.75);
        const squeal = riding && Car.grounded && sp > 250 ? Math.max(0, Math.min(1, (Car.slip - 0.3) * 2.2)) : 0;
        if (L.screech) L.screech.set(squeal * 0.3, 0.92 + Math.min(0.2, sp / 12000));
        if (L.roll) L.roll.set(riding && Car.grounded ? Math.min(0.28, sp / 7000) : 0, 0.7 + Math.min(1.2, sp / 2600) * 0.6);
        if (L.wind) L.wind.set(riding ? Math.min(0.4, Math.max(0, (Math.hypot(Car.v[0], Car.v[1], Car.v[2]) - 900) / 5000)) : 0, 1);
    },
};
