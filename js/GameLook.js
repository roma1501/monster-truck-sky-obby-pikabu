// GameLook.js — как выглядят машина и водитель: риги из Blender (assets/models/cars/<id>.glb, rider.glb),
// косметика из Гаража (машина, покраска, диски, водитель-скин, след), анимация (колёса крутятся и
// поворачивают, подвеска ходит, руль крутится, фары горят, стоп-сигналы вспыхивают при торможении;
// водитель держит руль и жмёт педали — IK), дым из-под колёс в заносе, авария (дым, вспышка, водитель
// вылетает через крышу) и превью предметов для карточек Гаража (рендер игровой модели в картинку, кэш).
// CarView — вид одной машины с водителем: им пользуются и игрок (Look), и боты (GameBots).
// Нет файла модели — собирается запасная блочная машина кодом, игра не падает (инвариант 6).

const LOOK_RIDER = 'assets/models/rider.glb';
const LOOK_DEFAULT_CAR = 'assets/models/cars/hatch.glb';
// Узлы колёс по порядку колёс физики (GameCar: задние левое/правое, передние левое/правое).
const LOOK_HUBS = ['HubRL', 'HubRR', 'HubFL', 'HubFR'];
const LOOK_WHEELS = ['WheelRL', 'WheelRR', 'WheelFL', 'WheelFR'];
const LOOK_RIM_R = 0.36;          // м: радиус колеса-диска из assets/models/rims (docs/DESIGN.md §6.4)
const LOOK_STEER_RATIO = 2.6;     // во сколько раз руль крутится больше колёс (вид)
const LOOK_HIPS = [-20.5, 99.5, 0];   // px: таз водителя в rider.glb (поза покоя на седле), оси движка

// Следы за машиной: вид -> текстура и характер частиц.
const LOOK_TRAILS = {
    dust: { texture: 'assets/fx/dust-puff.webp', blend: 'standard', size: [36, 70], life: [0.5, 0.9], up: 60, alpha: 0.75 },
    sparkle: { texture: 'assets/fx/sparkle-4pt.webp', size: [20, 40], life: [0.35, 0.7], up: 90 },
    stars: { texture: 'assets/fx/rainbow-star.webp', blend: 'standard', size: [24, 40], life: [0.5, 0.9], up: 70, spin: [-3, 3], white: true },
    fire: { texture: 'assets/fx/flame.webp', size: [40, 72], life: [0.25, 0.5], up: 140 },
    smoke: { texture: 'assets/fx/smoke-puff.webp', blend: 'standard', size: [50, 100], life: [0.6, 1.1], up: 50, alpha: 0.7 },
    magic: { texture: 'assets/fx/plasma-orb.webp', size: [24, 46], life: [0.4, 0.8], up: 80 },
    bubbles: { texture: 'assets/fx/bubble.webp', blend: 'standard', size: [20, 42], life: [0.6, 1.2], up: 110, white: true },
    confetti: { texture: 'assets/fx/confetti-color.webp', blend: 'standard', size: [18, 32], life: [0.6, 1.1], up: 160, spin: [-6, 6], white: true },
    rainbow: { texture: 'assets/fx/soft-circle.webp', size: [30, 48], life: [0.5, 0.8], up: 20, rainbow: true },
    flare: { texture: 'assets/fx/flare-gold.webp', size: [30, 56], life: [0.3, 0.6], up: 60 },
    twirl: { texture: 'assets/fx/petal.webp', blend: 'standard', size: [18, 32], life: [0.7, 1.2], up: 90, spin: [-5, 5], white: true },
    snow: { texture: 'assets/fx/snowflake.webp', blend: 'standard', size: [18, 34], life: [0.7, 1.2], up: 40, spin: [-2, 2] },
};

/** Сырые метаданные модели трака (CAR_MODELS, метры Blender) по пути модели: для физики (GameCar.setGeom). */
function lookCarRaw(url) {
    const id = String(url || LOOK_DEFAULT_CAR).replace(/^.*\//, '').replace(/\.glb$/i, '');
    return (typeof CAR_MODELS !== 'undefined' && CAR_MODELS && CAR_MODELS[id]) || {};
}

/** Метаданные модели машины (CAR_MODELS, метры Blender) -> px движка (x вперёд, y вверх, z вправо). */
function lookCarMeta(url) {
    const id = String(url || LOOK_DEFAULT_CAR).replace(/^.*\//, '').replace(/\.glb$/i, '');
    const src = (typeof CAR_MODELS !== 'undefined' && CAR_MODELS && CAR_MODELS[id]) || {};
    const e = (a, d) => { const v = Array.isArray(a) && a.length >= 3 ? a : d; return [v[0] * 100, v[2] * 100, -v[1] * 100]; };
    const st = src.steering || {};
    const ax = e(st.axis, [-0.93, 0, 0.37]);
    const al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    return {
        id,
        wheelR: (Number(src.wheelRadius) || 0.36) * 100,
        hPoint: e(src.hPoint, [-0.3, 0.38, 0.42]),
        steerC: e(st.center, [-0.06, 0.38, 0.72]),
        steerAxis: [ax[0] / al, ax[1] / al, ax[2] / al],
        steerR: (Number(st.radius) || 0.16) * 100,
        pedals: e(src.pedals, [0.28, 0.38, 0.2]),
        exhausts: Array.isArray(src.exhausts) ? src.exhausts.map(p => e(p, p)) : [e(null, [-2.2, -0.45, 0.3])],   // пустой список — электромобиль, дыма нет
        length: (Number(src.length) || 4.4) * 100,
        height: (Number(src.height) || 1.45) * 100,
        color: src.color || '#2f7fe0',
    };
}

/** Следы шин: тёмные полосы на дороге под колёсами в заносе, при пробуксовке и резком торможении.
 *  Один общий меш на все машины (кольцевой буфер четырёхугольников), следы бледнеют и пропадают. */
const Skids = {
    /** @type {any} */ mesh: null,
    /** @type {any} */ view: null,
    N: 720, head: 0, t: 0, fadeT: 0, dirty: false,
    /** @type {Float32Array | null} */ pos: null,
    /** @type {Float32Array | null} */ col: null,
    /** @type {Float32Array | null} */ born: null,
    /** @type {Float32Array | null} */ base: null,
    /** @type {Map<string, any>} */ tracks: new Map(),
    LIFE: 12,                      // с: след виден столько, последние секунды бледнеет

    init(view) {
        if (this.mesh && this.view === view && !this.mesh.isDisposed()) return;
        this.view = view;
        const N = this.N, scene = view.scene;
        this.pos = new Float32Array(N * 12); this.col = new Float32Array(N * 16);
        this.born = new Float32Array(N).fill(-1e9); this.base = new Float32Array(N);
        const idx = new Uint32Array(N * 6);
        for (let i = 0; i < N; i++) { const v = i * 4, k = i * 6; idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2; idx[k + 3] = v + 1; idx[k + 4] = v + 3; idx[k + 5] = v + 2; }
        const mesh = new BABYLON.Mesh('skids', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.indices = idx;
        vd.normals = new Float32Array(N * 12).map((_, i) => (i % 3 === 1 ? 1 : 0));
        vd.applyToMesh(mesh, true);
        mesh.hasVertexAlpha = true;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.receiveShadows = false;
        const mat = new BABYLON.StandardMaterial('skids-mat', scene);
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        mat.zOffset = -4;
        mat.metadata = { toon: false };
        mesh.material = mat;
        this.mesh = mesh;
        this.tracks.clear();
    },

    /** Колесо key оставило след в точке q (мир) с нормалью опоры n, курсом f; strength 0..1 — насколько тёмный. */
    mark(key, q, n, f, width, strength) {
        if (!this.mesh) return;
        const tr = this.tracks.get(key);
        const lift = 1.4, p = [q[0] + n[0] * lift, q[1] + n[1] * lift, q[2] + n[2] * lift];
        if (!tr) { this.tracks.set(key, { p, t: this.t }); return; }
        const dx = p[0] - tr.p[0], dy = p[1] - tr.p[1], dz = p[2] - tr.p[2], d = Math.hypot(dx, dy, dz);
        if (d > 420 || this.t - tr.t > 0.3) { tr.p = p; tr.t = this.t; return; }   // прыжок или перерыв — новый отрезок
        if (d < 36) return;
        // поперечный вектор в плоскости опоры
        let sx = dy * n[2] - dz * n[1], sy = dz * n[0] - dx * n[2], sz = dx * n[1] - dy * n[0];
        const sl = Math.hypot(sx, sy, sz) || 1, w = width / 2;
        sx = sx / sl * w; sy = sy / sl * w; sz = sz / sl * w;
        const i = this.head, P = this.pos, C = this.col;
        this.head = (this.head + 1) % this.N;
        const o = i * 12;
        const a = tr.p, b = p;
        P[o] = a[0] - sx; P[o + 1] = a[1] - sy; P[o + 2] = a[2] - sz;
        P[o + 3] = a[0] + sx; P[o + 4] = a[1] + sy; P[o + 5] = a[2] + sz;
        P[o + 6] = b[0] - sx; P[o + 7] = b[1] - sy; P[o + 8] = b[2] - sz;
        P[o + 9] = b[0] + sx; P[o + 10] = b[1] + sy; P[o + 11] = b[2] + sz;
        const al = Math.max(0.15, Math.min(0.75, strength * 0.8));
        this.base[i] = al; this.born[i] = this.t;
        for (let k = 0; k < 4; k++) { const c = i * 16 + k * 4; C[c] = 0.05; C[c + 1] = 0.05; C[c + 2] = 0.06; C[c + 3] = al; }
        tr.p = p; tr.t = this.t;
        this.dirty = true;
        void f;
    },

    /** Колесо перестало оставлять след — следующий начнётся с новой точки. */
    lift(key) { this.tracks.delete(key); },

    /** Стереть все следы (смена мира). */
    clear() {
        if (!this.mesh) return;
        this.pos.fill(0); this.col.fill(0); this.born.fill(-1e9); this.tracks.clear(); this.head = 0;
        this.dirty = true;
    },

    update(dt) {
        if (!this.mesh) return;
        this.t += dt;
        this.fadeT += dt;
        if (this.fadeT > 0.25) {
            this.fadeT = 0;
            const C = this.col, fade = 3;
            for (let i = 0; i < this.N; i++) {
                const age = this.t - this.born[i];
                if (age < this.LIFE - fade || age > this.LIFE + 1) continue;
                const a = this.base[i] * Math.max(0, (this.LIFE - age) / fade);
                for (let k = 0; k < 4; k++) C[i * 16 + k * 4 + 3] = a;
                this.dirty = true;
            }
        }
        if (this.dirty) {
            this.dirty = false;
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this.pos);
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this.col);
        }
    },
};

/** Цвет 0xRRGGBB или '#rrggbb' -> Color3. */
function lookColor(c) {
    if (c == null) return null;
    const hex = typeof c === 'string' ? c : '#' + Number(c).toString(16).padStart(6, '0');
    return BABYLON.Color3.FromHexString(hex);
}

/** Запасной «риг» из кубиков: тот же интерфейс, что у RigInstance (то, чем пользуется CarView). */
class LookBlockRig {
    constructor(view, kind) {
        const scene = view.scene;
        this.view = view;
        this.root = new BABYLON.Mesh('block-' + kind, scene);
        /** @type {Map<string, any>} */ this.nodes = new Map();
        /** @type {Map<string, any>} */ this.parts = new Map();
        this._off = new Map();
        this._rest = new Map();
        this.speed = 1; this.disposed = false; this._clip = '';
        /** @param {string} name @param {any} parent @param {number} x @param {number} y @param {number} z */
        const node = (name, parent, x, y, z) => {
            const tn = new BABYLON.TransformNode(kind + ':' + name, scene);
            tn.parent = parent || this.root; tn.position.set(x, y, z);
            tn.rotationQuaternion = new BABYLON.Quaternion();
            this.nodes.set(name, tn); this._rest.set(name, [x, y, z]); return tn;
        };
        /** @param {string} name @param {any} parent @param {number} w @param {number} h @param {number} d @param {number} x @param {number} y @param {number} z @param {string} color @param {number} [alpha] */
        const box = (name, parent, w, h, d, x, y, z, color, alpha) => {
            const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
            const mat = new BABYLON.StandardMaterial(name + '-m', scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(color); mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            if (alpha != null) mat.alpha = alpha;
            m.material = mat; m.parent = parent; m.position.set(x, y, z); m.isPickable = false;
            m.metadata = { part: name };
            if (!this.parts.has(name)) this.parts.set(name, m);
            return m;
        };
        if (kind === 'car') {
            const body = node('Body', null, 0, 0, 0);
            box('Body', body, 440, 70, 190, 0, 118, 0, '#ffffff');
            box('BodyHood', body, 130, 16, 180, 150, 162, 0, '#ffffff');
            box('Glass', body, 190, 50, 172, -30, 196, 0, '#1e2a3a', 0.4);
            box('BodyRoof', body, 170, 8, 164, -40, 224, 0, '#ffffff');
            box('LightF', body, 6, 16, 150, 222, 126, 0, '#fff6d0');
            box('LightR', body, 6, 14, 150, -222, 130, 0, '#ff2a2a');
            box('Interior', body, 60, 30, 60, -30, 160, -38, '#2a2a33');
            const st = node('Steering', body, -6, 165, -38);
            box('Steering', st, 4, 30, 30, 0, 0, 0, '#222222');
            for (const [hub, wheel, x, z] of /** @type {Array<[string, string, number, number]>} */ ([['HubRL', 'WheelRL', -135, -90], ['HubRR', 'WheelRR', -135, 90], ['HubFL', 'WheelFL', 135, -90], ['HubFR', 'WheelFR', 135, 90]])) {
                const h = node(hub, body, x, 65, z);
                const w = node(wheel, h, 0, 0, 0);
                const t = BABYLON.MeshBuilder.CreateCylinder(wheel, { diameter: 130, height: 44, tessellation: 20 }, scene);
                t.rotation.x = Math.PI / 2; t.parent = w; t.isPickable = false; t.metadata = { part: wheel };
                const mat = new BABYLON.StandardMaterial(wheel + '-m', scene); mat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.12); t.material = mat;
                this.parts.set(wheel, t);
                box(wheel + 'Rim', w, 70, 70, 46, 0, 0, 0, '#d0d4dc');
            }
        } else {
            // R15-lite: бедро/голень/стопа, плечо/предплечье/кисть — позу конечностей ставит IK игры
            const hips = node('Hips', null, -20.5, 99.5, 0);
            const torso = node('Torso', hips, 0, 4, 0);
            box('Torso', torso, 30, 60, 58, 0, 30, 0, '#ffffff');
            const head = node('Head', torso, 0, 62, 0);
            box('Head', head, 40, 40, 40, 0, 20, 0, '#ffffff');
            box('Face_smile', head, 4, 10, 24, 21, 22, 0, '#111111');
            node('Hat', head, 0, 40, 0);
            for (const [side, z] of /** @type {Array<[string, number]>} */ ([['L', -38], ['R', 38]])) {
                const up = node('UpperArm_' + side, torso, 0, 54, z);
                box('UpperArm_' + side, up, 16, 30, 16, 0, -15, 0, '#ffffff');
                const lo = node('LowerArm_' + side, up, 0, -25, 0);
                box('LowerArm_' + side, lo, 15, 25, 15, 0, -12, 0, '#ffffff');
                node('Hand_' + side, lo, 0, -25, 0);
                const hl = node('UpperLeg_' + side, hips, 0, 0, z * 0.38);
                box('UpperLeg_' + side, hl, 24, 42, 24, 0, -21, 0, '#ffffff');
                const ll = node('LowerLeg_' + side, hl, 0, -42, 0);
                box('LowerLeg_' + side, ll, 22, 40, 22, 0, -20, 0, '#ffffff');
                box('ShoeBlock_' + side, ll, 34, 12, 24, 6, -38, 0, '#222222');
                node('Foot_' + side, ll, 0, -42, 0);
            }
        }
        World3D.addObject(view, this.root, 'actor');
    }
    offset(name, rx, ry, rz, px, py, pz) { this._off.set(name, [rx || 0, ry || 0, rz || 0, px || 0, py || 0, pz || 0]); }
    update() {
        for (const [name, r] of this._off) {
            const n = this.nodes.get(name), rest = this._rest.get(name);
            if (!n) continue;
            BABYLON.Quaternion.RotationYawPitchRollToRef(r[1], r[0], r[2], n.rotationQuaternion);
            if (rest) n.position.set(rest[0] + r[3], rest[1] + r[4], rest[2] + r[5]);
        }
        this._off.clear();
    }
    play(name) { this._clip = name; return true; }
    stop() { this._clip = ''; }
    has() { return false; }
    current() { return this._clip; }
    phase() { return 0; }
    setPartVisible(prefix, on) { for (const [name, m] of this.parts) if (name.startsWith(prefix)) m.setEnabled(!!on); }
    attach(nodeName, mesh) { mesh.parent = this.nodes.get(nodeName) || this.root; World3D.addObject(this.view, mesh, 'actor'); return mesh; }
    detach(mesh) { if (mesh && !mesh.isDisposed()) mesh.dispose(false, true); }
    dispose() { this.disposed = true; World3D.removeObject(this.view, this.root); }
}

/** Вид одной машины с водителем (игрок и боты). */
class CarView {
    constructor(view, name) {
        this.view = view;
        this.name = name || 'car';
        /** @type {any} */ this.car = null;
        /** @type {any} */ this.driver = null;
        /** @type {any} */ this.meta = lookCarMeta(null);
        /** @type {any[]} */ this.rims = [];
        /** @type {any[]} */ this._mats = [];
        this.paintColor = null;
        this.finish = 'gloss';
        this.carColor = 0x2f7fe0;
        this.rimScale = 1;
        this.flying = null;
        this.brakeOn = null;
        this.lightsOn = null;
        /** @type {any} */ this.lightMats = { f: [], r: [] };
        this.steerVis = 0;
        this.torsoT = 0;
        this.visible = true;
    }

    /** Машина (предмет slot car или null — по умолчанию). Водитель пересаживается в новую. */
    async setCar(item) {
        const url = (item && item.model) || LOOK_DEFAULT_CAR;
        const model = await Look._model(url);
        const old = this.car;
        const car = model ? Rig.create(model, this.view, { name: this.name }) : new LookBlockRig(this.view, 'car');
        car.root.rotationQuaternion = new BABYLON.Quaternion();
        this.car = car;
        this.meta = lookCarMeta(url);
        this.carColor = item && item.color != null ? item.color : Number('0x' + String(this.meta.color).replace('#', ''));
        this.rimScale = this.meta.wheelR / (LOOK_RIM_R * 100);
        // водитель сидит на кости старой машины: отцепить, иначе он удалится вместе с ней
        if (this.driver && !this.flying) this.driver.root.parent = null;
        for (const e of this.exFx || []) { try { e.h.stop(); } catch (er) { /* уже */ } }
        this.exFx = null;   // трубы у новой машины в других местах
        if (old) { this._dropRims(); old.dispose(); }
        this.rims = [];
        // гладкий кузов сам на себя тень не кладёт (иначе «акне» — полосы на краске); тень на трассу — есть
        for (const m of car.root.getChildMeshes(false)) m.receiveShadows = false;
        this._lights();
        this.repaint();
        if (this.driver) this.seatDriver();
        return car;
    }

    /** Водитель (rider.glb) — один раз; скин отдельно. */
    async setDriver() {
        if (this.driver) return this.driver;
        const model = await Look._model(LOOK_RIDER);
        this.driver = model ? Rig.create(model, this.view, { name: this.name + '-driver' }) : new LookBlockRig(this.view, 'rider');
        for (const m of this.driver.root.getChildMeshes(false)) m.receiveShadows = false;
        if (this.driver.stop) this.driver.stop('base', 0);
        this.seatDriver();
        return this.driver;
    }

    /** Покраска: paint — { color, finish } или null (заводской цвет машины). */
    setPaint(paint) {
        this.paintColor = paint && paint.color != null ? paint.color : null;
        this.finish = (paint && paint.finish) || 'gloss';
        this.repaint();
    }

    // Белые вершины частей Body — цвет краски (своя копия буфера: клоны рига делят геометрию).
    repaint() {
        const car = this.car;
        if (!car) return;
        const col = lookColor(this.paintColor != null ? this.paintColor : this.carColor) || new BABYLON.Color3(1, 1, 1);
        for (const [name, mesh] of car.parts) {
            if (!name.startsWith('Body')) continue;
            if (car instanceof LookBlockRig) { mesh.material.diffuseColor = col.clone(); this._finish(mesh.material); continue; }
            const kind = BABYLON.VertexBuffer.ColorKind;
            if (!mesh.metadata) mesh.metadata = {};
            if (!mesh.metadata.paint0) {
                const src = mesh.getVerticesData(kind);
                if (!src) continue;
                mesh.makeGeometryUnique();
                mesh.metadata.paint0 = Float32Array.from(src);
                // материалы части — свои (отделка краски: блеск, мат, металл, неон)
                const one = (m) => { const k = m.clone(m.name + '+paint'); this._mats.push(k); return k; };
                const mat = mesh.material;
                if (mat && mat.subMaterials) { const multi = new BABYLON.MultiMaterial(mat.name + '+paint', mesh.getScene()); multi.subMaterials = mat.subMaterials.map(m => (m ? one(m) : m)); mesh.material = multi; this._mats.push(multi); }
                else if (mat) mesh.material = one(mat);
            }
            const base = mesh.metadata.paint0, out = new Float32Array(base.length);
            for (let i = 0; i < base.length; i += 4) {
                const white = base[i] > 0.985 && base[i + 1] > 0.985 && base[i + 2] > 0.985;
                out[i] = white ? col.r : base[i]; out[i + 1] = white ? col.g : base[i + 1]; out[i + 2] = white ? col.b : base[i + 2]; out[i + 3] = base[i + 3];
            }
            mesh.setVerticesData(kind, out, false);
            const mat = mesh.material;
            if (mat && mat.subMaterials) for (const m of mat.subMaterials) { if (m && !/glass/i.test(m.name)) this._finish(m); }
            else if (mat) this._finish(mat);
        }
    }

    _finish(m) {
        const f = this.finish;
        const col = lookColor(this.paintColor != null ? this.paintColor : this.carColor) || new BABYLON.Color3(1, 1, 1);
        m.specularColor = f === 'matte' ? new BABYLON.Color3(0, 0, 0) : f === 'chrome' || f === 'metal' ? new BABYLON.Color3(0.9, 0.9, 0.9) : new BABYLON.Color3(0.35, 0.35, 0.35);
        m.specularPower = f === 'chrome' ? 128 : f === 'metal' ? 64 : 32;
        m.emissiveColor = f === 'neon' ? col.scale(0.45) : f === 'pearl' ? new BABYLON.Color3(0.12, 0.12, 0.14) : f === 'chrome' ? col.scale(0.18) : new BABYLON.Color3(0, 0, 0);
    }

    // Фары и фонари — свои материалы (светятся; стоп-сигналы ярче при торможении).
    _lights() {
        const car = this.car;
        this.lightMats = { f: [], r: [] };
        this.brakeOn = null; this.lightsOn = null;
        for (const [name, mesh] of car.parts) {
            const key = name.startsWith('LightF') ? 'f' : name.startsWith('LightR') ? 'r' : '';
            if (!key || !mesh.material) continue;
            const one = (m) => { const k = m.clone(m.name + '+lit'); k.metadata = Object.assign({}, k.metadata, { toon: false }); this._mats.push(k); this.lightMats[key].push(k); return k; };
            const mat = mesh.material;
            if (mat.subMaterials) { const multi = new BABYLON.MultiMaterial(mat.name + '+lit', mesh.getScene()); multi.subMaterials = mat.subMaterials.map(m => (m ? one(m) : m)); mesh.material = multi; this._mats.push(multi); }
            else mesh.material = one(mat);
        }
    }

    _setLights(brake) {
        if (this.brakeOn === brake && this.lightsOn) return;
        this.brakeOn = brake; this.lightsOn = true;
        for (const m of this.lightMats.f) m.emissiveColor = new BABYLON.Color3(0.85, 0.82, 0.7);
        for (const m of this.lightMats.r) m.emissiveColor = brake ? new BABYLON.Color3(1, 0.12, 0.08) : new BABYLON.Color3(0.45, 0.04, 0.03);
    }

    /** Диски: предмет slot rims (model, color, glow) или null — родные колёса машины. */
    async setRims(item) {
        this._dropRims();
        const car = this.car;
        if (!car) return;
        car.setPartVisible('Wheel', true);
        if (!item || !item.model) return;
        try {
            const model = await Model3D.load(item.model);
            if (this.car !== car) return;
            const c = lookColor(item.color);
            for (let i = 0; i < 4; i++) {
                const mesh = Model3D.build(model, this.view.scene, { name: 'rim' });
                if (c) for (const m of mesh.getChildMeshes(false)) this._tintWhite(m, c, !!item.glow);
                const right = i % 2 === 1;
                car.attach(LOOK_WHEELS[i], mesh, { space: 'local', rot: [0, right ? 180 : 0, 0], scale: this.rimScale });
                for (const m of [mesh].concat(mesh.getChildMeshes(false))) m.receiveShadows = false;
                this.rims.push(mesh);
            }
            car.setPartVisible('Wheel', false);
        } catch (e) { console.warn('Look: диски', item.model, e && e.message); }
    }

    _dropRims() {
        for (const m of this.rims) { try { if (this.car && this.car.detach) this.car.detach(m); else m.dispose(false, true); } catch (e) { /* уже */ } }
        this.rims = [];
    }

    // Белые вершины — цвет (диск), остальное как было; glow — светится.
    _tintWhite(mesh, c, glow) {
        const kind = BABYLON.VertexBuffer.ColorKind;
        const src = mesh.getVerticesData(kind);
        if (src) {
            const out = Float32Array.from(src);
            for (let i = 0; i < out.length; i += 4) if (out[i] > 0.985 && out[i + 1] > 0.985 && out[i + 2] > 0.985) { out[i] = c.r; out[i + 1] = c.g; out[i + 2] = c.b; }
            mesh.setVerticesData(kind, out, false);
        } else if (mesh.material) { const k = mesh.material.clone(mesh.material.name + '+rim'); k.diffuseColor = c.clone(); mesh.material = k; this._mats.push(k); }
        if (glow && mesh.material) { const k = mesh.material.clone(mesh.material.name + '+glow'); k.emissiveColor = c.scale(0.5); mesh.material = k; this._mats.push(k); }
    }

    /** Скин водителя: look { skin, shirt, arms, pants, hair, hairColor, face, acc[] }. */
    setSkin(L) {
        const r = this.driver;
        if (!r) return;
        L = L || { skin: 0xf3c8a8, shirt: 0xff6553, arms: 0xff6553, pants: 0x2e3a5e, hair: 'bacon', hairColor: 0x5b3521, face: 'smile', acc: ['headphones'] };
        Look._tint(r, 'Head', L.skin);
        Look._tint(r, 'Torso', L.shirt);
        for (const pre of ['Arm_', 'UpperArm_', 'LowerArm_']) Look._tint(r, pre, L.arms != null ? L.arms : L.shirt);
        for (const pre of ['Leg_', 'UpperLeg_', 'LowerLeg_']) Look._tint(r, pre, L.pants);
        Look._tint(r, 'Hand_', L.skin);
        r.setPartVisible('Hair_', false);
        if (L.hair) { r.setPartVisible('Hair_' + L.hair, true); Look._tint(r, 'Hair_' + L.hair, L.hairColor); }
        r.setPartVisible('Face_', false);
        r.setPartVisible('Face_' + (L.face || 'smile'), true);
        r.setPartVisible('Acc_', false);
        // в машине — только то, что не торчит сквозь кресло и крышу
        for (const a of L.acc || []) if (!/cape|jetpack|backpack/.test(a)) r.setPartVisible('Acc_' + a, true);
    }

    /** Водитель — на сиденье: таз в H-точке машины, масштаб DRIVER_SCALE. */
    seatDriver() {
        const r = this.driver, car = this.car;
        this.flying = null;
        if (!r || !car) return;
        const S = typeof DRIVER_SCALE !== 'undefined' ? DRIVER_SCALE : 0.8, H = this.meta.hPoint;
        r.root.parent = car.nodes.get('Body') || car.root;
        r.root.position.set(H[0] - LOOK_HIPS[0] * S, H[1] - LOOK_HIPS[1] * S, H[2] - LOOK_HIPS[2] * S);
        r.root.rotationQuaternion = new BABYLON.Quaternion();
        r.root.scaling.set(S, S, S);
        if (r.stop) r.stop('base', 0);
    }

    /** Водитель вылетает через крышу (авария): летит по инерции и кувыркается; car — физика машины. */
    launchDriver(car, kick) {
        const r = this.driver;
        if (!r || this.flying) return;
        const wp = r.root.getAbsolutePosition().clone();
        r.root.setParent(null);
        r.root.rotationQuaternion = r.root.rotationQuaternion || new BABYLON.Quaternion();
        const k = kick || [0, 0, 0];
        this.flying = { p: [wp.x, wp.y + 60, wp.z], v: [car.v[0] * 0.6 + k[0], Math.max(900, car.v[1] + 1000), car.v[2] * 0.6 + k[2]], spin: 0, yaw: car.yaw };
        if (r.has && r.has('crash')) r.play('crash', { fade: 0.1 });
    }

    /** Кадр: корень по физике машины, колёса, руль, огни, поза водителя. */
    pose(C, dt, opts) {
        const car = this.car;
        if (!car) return;
        const o = opts || {};
        car.root.position.set(C.p[0], C.p[1] - (C.visLift || 0), C.p[2]);
        car.root.rotationQuaternion.set(C.q[0], C.q[1], C.q[2], C.q[3]);
        const R = this.meta.wheelR;
        // кузов «живой» (только вид): крен наружу в повороте, клевок при торможении, присед при разгоне — пружина
        const k = dt ? Math.min(0.05, dt) : 0;
        if (k > 0) {
            let dyaw = C.yaw - (this._yawPrev == null ? C.yaw : this._yawPrev); dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
            const yawRate = dyaw / k, aLong = (C.vf - (this._vfBody == null ? C.vf : this._vfBody)) / k;
            this._yawPrev = C.yaw; this._vfBody = C.vf;
            const on = C.grounded ? 1 : 0;
            const wantR = on * Math.max(-0.07, Math.min(0.07, -C.vf * yawRate / 60000));
            const wantP = on * Math.max(-0.045, Math.min(0.04, aLong / 70000));
            const sp = this._bodySp || (this._bodySp = { r: 0, vr: 0, p: 0, vp: 0 });
            sp.vr += ((wantR - sp.r) * 140 - sp.vr * 15) * k; sp.r += sp.vr * k;
            sp.vp += ((wantP - sp.p) * 160 - sp.vp * 16) * k; sp.p += sp.vp * k;
            car.offset('Body', sp.r, 0, sp.p);
        }
        const bs = this._bodySp || { r: 0, p: 0 };
        for (let i = 0; i < 4; i++) {
            const w = C.wheels[i];
            // колесо на месте: убрать подъём/опускание точки ступицы от наклона кузова
            const comp = w.fx * Math.sin(bs.p) - w.sz * Math.sin(bs.r);
            const G = C.G || { suspRest: 30, R };
            const dy = Math.max(-34, Math.min(22, G.suspRest - w.susp)) - comp;
            car.offset(LOOK_HUBS[i], 0, w.front ? -C.steer : 0, 0, 0, dy, 0);
            car.offset(LOOK_WHEELS[i], 0, 0, -w.spin * G.R / R);
        }
        // руль: поворот вокруг оси колонки (углы Эйлера для offset)
        this.steerVis += (C.steer * LOOK_STEER_RATIO - this.steerVis) * Math.min(1, 14 * (dt || 0.016));
        const a = this.meta.steerAxis;
        const q = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(a[0], a[1], a[2]), this.steerVis);
        const e = q.toEulerAngles();
        car.offset('Steering', e.x, e.y, e.z);
        this._setLights(!!C.braking || (o.menu ? false : C.throttle < -0.1 && C.vf > 60));
        if (car instanceof LookBlockRig) car.update();
        const r = this.driver;
        if (r && !this.flying) {
            // корпус почти вертикально (в rider.glb он наклонён к рулю велосипеда), голова — по ходу и в поворот
            const lean = 0.56 + Math.max(-0.08, Math.min(0.08, -(C.vf - (this._vfPrev || 0)) / Math.max(1e-3, dt || 0.016) / 30000));
            this._vfPrev = C.vf;
            this.torsoT += (lean - this.torsoT) * Math.min(1, 6 * (dt || 0.016));
            r.offset('Torso', 0, -C.steer * 0.25, this.torsoT);
            if (r.nodes.has('Head')) r.offset('Head', 0, -C.steer * 0.9, -this.torsoT * 0.55);
            if (r instanceof LookBlockRig) r.update();
        }
        const fl = this.flying;
        if (fl && r && dt) {
            fl.v[1] -= 3200 * dt;
            fl.p[0] += fl.v[0] * dt; fl.p[1] += fl.v[1] * dt; fl.p[2] += fl.v[2] * dt;
            fl.spin += dt * 7;
            r.root.position.set(fl.p[0], fl.p[1], fl.p[2]);
            r.root.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(-fl.yaw, fl.spin * 0.6, fl.spin);
        }
    }

    /** Выхлоп, «стрельба» при сбросе газа и следы шин; opts.bot — бот (реже и тише), opts.on — едет. */
    effects(C, dt, opts) {
        const o = opts || {}, car = this.car, fx = Look.app && Look.app.fx;
        if (!car) return;
        const on = !!o.on && this.visible && !C.dead;
        // дым из труб: точки meta.exhausts в осях модели -> мир
        if (fx && !this.exFx) {
            this.exFx = [];
            const pts = this.meta.exhausts.slice(0, o.bot ? 1 : 2);
            for (const e of pts) {
                const local = new BABYLON.Vector3(e[0] - 6, e[1], e[2]);
                const h = fx.create({ texture: 'assets/fx/smoke-puff.webp', blend: 'standard', rate: 0, capacity: o.bot ? 30 : 70, life: [0.45, 1.0], size: [12, 26], speed: [20, 70],
                    follow: () => BABYLON.Vector3.TransformCoordinates(local, car.root.getWorldMatrix()),
                    direction: [[-0.35, 0.3, -0.35], [0.35, 0.8, 0.35]], gravity: [0, 70, 0],
                    colorGradient: [[0, '#d9dce6', 0.55], [0.5, '#b7bac6', 0.35], [1, '#a4a7b3', 0]], sizeGradient: [[0, 0.6], [1, 2.6]] });
                if (h) this.exFx.push({ h, local });
            }
        }
        if (this.exFx) {
            const thr = Math.max(0, C.throttle || 0), sp = Math.min(1, Math.abs(C.vf) / 2600);
            const rate = !on ? 0 : (o.bot ? 2 + 10 * thr : 4 + 40 * thr * (1 - 0.45 * sp) + (C.boost > 0 ? 12 : 0));
            for (const e of this.exFx) e.h.setRate(rate);
            // «стрельба» из трубы: резко отпустили газ на высоких оборотах
            const was = this._thrPrev || 0;
            this._thrPrev = thr;
            if (on && !o.bot && fx && was > 0.6 && thr < 0.15 && C.rpm > 0.55 && Math.abs(C.vf) > 900 && (this._popT || 0) <= 0) {
                this._popT = 1.2;
                for (const e of this.exFx) fx.play('backfire', BABYLON.Vector3.TransformCoordinates(e.local, car.root.getWorldMatrix()));
                if (Look.onBackfire) Look.onBackfire();
            }
            this._popT = Math.max(0, (this._popT || 0) - (dt || 0));
        }
        // следы шин: занос, пробуксовка с места, резкий тормоз
        const id = this.name + (this._uid || (this._uid = String(Math.random()).slice(2, 7)));
        for (let i = 0; i < 4; i++) {
            const w = C.wheels[i], key = id + i;
            const burn = !w.front && C.throttle > 0.6 && Math.abs(C.vf) < 650 && C.grounded;
            const brake = C.braking && Math.abs(C.vf) > 500;
            const s = Math.max(w.slip > 0.32 ? (w.slip - 0.25) * 1.6 : 0, burn ? 0.8 : 0, brake ? 0.55 : 0);
            if (on && w.contact && !(w.col && w.col.dynamic) && s > 0.12) Skids.mark(key, w.q, w.n, C.f, 26, s);
            else Skids.lift(key);
        }
    }

    /** После Rig.updateAll: ладони на руле, ступни на педалях. */
    ik() {
        const r = this.driver, car = this.car;
        if (!r || !car || this.flying || r.root.parent == null) return;
        const V = BABYLON.Vector3, N = r.nodes, M = this.meta;
        const S = typeof DRIVER_SCALE !== 'undefined' ? DRIVER_SCALE : 0.8;
        const body = car.nodes.get('Body') || car.root;
        const cw = (n) => { if (n.parent) cw(n.parent); n.computeWorldMatrix(true); };
        cw(body);
        const W = body.getWorldMatrix();
        const T = (p) => V.TransformCoordinates(new V(p[0], p[1], p[2]), W);
        const fwd = V.TransformNormal(new V(1, 0, 0), W).normalize(), up = V.TransformNormal(new V(0, 1, 0), W).normalize(), right = V.TransformNormal(new V(0, 0, 1), W).normalize();
        // хват на «9 и 3 часа», повёрнутый вместе с рулём вокруг оси колонки
        const ax = new V(M.steerAxis[0], M.steerAxis[1], M.steerAxis[2]);
        let lat = new V(0, 0, 1);
        lat = lat.subtract(ax.scale(V.Dot(lat, ax))).normalize();
        const rot = BABYLON.Quaternion.RotationAxis(ax, this.steerVis);
        const latR = lat.applyRotationQuaternion(rot);
        const grip = (side) => { const p = new V(M.steerC[0], M.steerC[1], M.steerC[2]).add(latR.scale(M.steerR * side)); return T([p.x, p.y, p.z]); };
        /** @type {Array<[string, number]>} */
        const sides = [['L', -1], ['R', 1]];
        for (const [s, side] of sides) {
            const foot = T([M.pedals[0], M.pedals[1], M.pedals[2] + side * 10]);
            const pole = fwd.add(up.scale(0.6)).add(right.scale(0.15 * side));
            if (N.has('LowerLeg_' + s)) Look._solve2(N.get('UpperLeg_' + s), N.get('LowerLeg_' + s), N.get('Foot_' + s), foot, pole, S);
            const hand = grip(side);
            const epole = up.scale(-0.7).add(right.scale(0.9 * side)).add(fwd.scale(-0.3));
            if (N.has('LowerArm_' + s)) Look._solve2(N.get('UpperArm_' + s), N.get('LowerArm_' + s), N.get('Hand_' + s), hand, epole, S);
        }
    }

    setVisible(on) {
        this.visible = !!on;
        if (this.car) this.car.root.setEnabled(!!on);
        if (this.driver && !this.flying) this.driver.root.setEnabled(!!on);
    }

    /** Прозрачность (мигание после появления бота). */
    setAlpha(a) {
        for (const rig of [this.car, this.driver]) if (rig) for (const m of rig.root.getChildMeshes(false)) m.visibility = a;
    }

    dispose() {
        this._dropRims();
        for (const e of this.exFx || []) { try { e.h.stop(); } catch (er) { /* уже */ } }
        this.exFx = null;
        try { if (this.driver) this.driver.dispose(); } catch (e) { /* уже */ }
        try { if (this.car) this.car.dispose(); } catch (e) { /* уже */ }
        for (const m of this._mats) { try { m.dispose(); } catch (e) { /* уже */ } }
        this._mats = [];
        this.car = null; this.driver = null;
    }
}

/** @satisfies {Record<string, any>} */
const Look = {
    /** @type {any} */ view: null,
    /** @type {any} */ app: null,
    /** @type {CarView | null} */ cv: null,
    /** @type {any} */ trail: null,
    trailKind: '',
    /** @type {any[]} */ _mats: [],
    /** @type {Record<string, string | null>} */ cur: {},
    /** @type {Record<string, any>} */ _models: {},
    _queue: Promise.resolve(),
    state: 'menu',
    visible: true,
    /** @type {any[]} */ smoke: [],
    /** @type {(() => void) | null} */ onBackfire: null,

    // совместимость: Game и Камера спрашивают Look.car / Look.rider
    get car() { return this.cv ? this.cv.car : null; },
    get rider() { return this.cv ? this.cv.driver : null; },
    get flying() { return this.cv ? this.cv.flying : null; },

    init(app) {
        this.view = app.location.view;
        this.app = app;
        this.cv = new CarView(this.view, 'car');
        Skids.init(this.view);
        const fx = app.fx;
        if (fx) {
            fx.register('backfire', [
                { texture: 'assets/fx/flame.webp', burst: 8, capacity: 10, life: [0.08, 0.18], size: [26, 48], speed: [120, 300], direction: [[-1, 0, -1], [1, 0.4, 1]], color: '#ffb347' },
                { texture: 'assets/fx/spark-streak.webp', burst: 6, capacity: 8, life: [0.1, 0.25], size: [10, 20], speed: [200, 420], gravity: [0, -600, 0], color: '#ffe08a' },
            ]);
            fx.register('carbump', [
                { texture: 'assets/fx/spark-streak.webp', burst: 22, capacity: 26, life: [0.15, 0.4], size: [14, 30], speed: [380, 900], gravity: [0, -1500, 0], direction: [[-1, 0.2, -1], [1, 1.2, 1]], color: '#ffe28a' },
                { texture: 'assets/fx/flash-star.webp', burst: 2, capacity: 3, life: [0.08, 0.14], size: [70, 120], speed: [0, 10], color: '#fff6d0' },
                { texture: 'assets/fx/smoke-puff.webp', blend: 'standard', burst: 5, capacity: 6, life: [0.5, 0.9], size: [40, 80], speed: [40, 120], color: '#9aa0ad', alpha: 0.6 },
            ]);
            fx.register('carcrash', [
                { texture: 'assets/fx/smoke-puff.webp', blend: 'standard', burst: 18, capacity: 24, life: [0.8, 1.6], size: [90, 180], speed: [80, 260], direction: [[-1, 0.4, -1], [1, 1.4, 1]], gravity: [0, 160, 0], alpha: 0.85, color: '#3a3440' },
                { texture: 'assets/fx/flame.webp', burst: 16, capacity: 20, life: [0.25, 0.55], size: [70, 140], speed: [120, 380], direction: [[-1, 0.3, -1], [1, 1.2, 1]] },
                { texture: 'assets/fx/spark-streak.webp', burst: 24, capacity: 30, life: [0.2, 0.5], size: [20, 44], speed: [400, 900], gravity: [0, -1200, 0], color: '#ffd27a' },
            ]);
        }
    },

    item(id) { return id && typeof Shop !== 'undefined' && Shop.item ? Shop.item(id) : null; },

    async _model(url) {
        if (!url) return null;
        if (!(url in this._models)) this._models[url] = Rig.load(url).catch((e) => { console.warn('Look: нет модели ' + url + ' — запасная', e && e.message); return null; });
        return this._models[url];
    },

    /** Надеть набор: look — Shop.look() (слот -> id предмета или null). Последовательно, без гонок. */
    apply(look) {
        this._queue = this._queue.then(() => this._apply(look || {})).catch((e) => console.warn('Look.apply:', e));
        return this._queue;
    },

    async _apply(look) {
        const def = (slot) => {
            const id = look[slot];
            if (id) return id;
            if (typeof SHOP_ITEMS === 'undefined') return null;
            const d = SHOP_ITEMS.find(it => it.slot === slot && it.default);
            return d ? d.id : null;
        };
        const cv = this.cv;
        const carId = def('car'), paintId = def('paint'), rimsId = def('rims'), skinId = def('skin'), trailId = look.trail || null;
        if (!cv.car || carId !== this.cur.car) {
            const carItem = this.item(carId);
            await cv.setCar(carItem);
            Car.setGeom(lookCarRaw(carItem && carItem.model));
            this.cur.car = carId; this.cur.rims = undefined; this.cur.paint = undefined;
            this.place();
        }
        if (!cv.driver) { await cv.setDriver(); this.cur.skin = undefined; }
        if (paintId !== this.cur.paint) { const it = this.item(paintId); cv.setPaint(it && it.paint ? it.paint : null); this.cur.paint = paintId; }
        if (skinId !== this.cur.skin) { const it = this.item(skinId); cv.setSkin(it && it.look); this.cur.skin = skinId; }
        if (rimsId !== this.cur.rims) { this.cur.rims = rimsId; await cv.setRims(this.item(rimsId)); this._rimFx(this.item(rimsId)); }
        if (trailId !== this.cur.trail) this._setTrail(trailId);
    },

    // Перекрасить части рига по префиксу имени: свой клон материала (общие материалы не трогаем).
    _tint(rig, prefix, color, emissive) {
        if (!rig || color == null) return;
        const c = lookColor(color);
        for (const [name, mesh] of rig.parts) {
            if (!name.startsWith(prefix)) continue;
            this._tintMesh(mesh, c, emissive);
        }
    },

    _tintMesh(mesh, c, emissive) {
        const one = (m) => {
            const k = m.clone(m.name + '+tint');
            k.diffuseColor = c.clone();
            if (emissive) k.emissiveColor = c.scale(0.55);
            this._mats.push(k);
            return k;
        };
        const mat = mesh.material;
        if (!mat) return;
        if (mat.subMaterials) {
            const multi = new BABYLON.MultiMaterial(mat.name + '+tint', mesh.getScene());
            multi.subMaterials = mat.subMaterials.map(m => (m ? one(m) : m));
            mesh.material = multi;
            this._mats.push(multi);
        } else mesh.material = one(mat);
    },

    // ---- эффекты дисков по редкости: rare — светящееся кольцо; epic — + искры из-под шины; legendary — + огонь по ободу
    /** @type {any} */ _wfx: null,

    _clearRimFx() {
        const w = this._wfx;
        if (!w) return;
        for (const e of w.emitters) { try { e.h.stop(); } catch (er) { /* уже */ } }
        for (const m of w.halos) { try { m.dispose(false, true); } catch (e) { /* уже */ } }
        this._wfx = null;
    },

    _rimFx(it) {
        this._clearRimFx();
        const tier = it && it.model ? ({ rare: 1, epic: 2, legendary: 3 }[it.rarity] || 0) : 0;
        const car = this.car, app = this.app;
        if (!tier || !car) return;
        const hex = '#' + Number(it.color != null ? it.color : 0xffd23f).toString(16).padStart(6, '0');
        const col = BABYLON.Color3.FromHexString(hex);
        const scene = this.view.scene;
        const w = this._wfx = { tier, halos: [], emitters: [], col, t: 0 };
        const V = BABYLON.Vector3;
        const R = this.cv.meta.wheelR;
        LOOK_WHEELS.forEach((name, i) => {
            const node = car.nodes.get(name);
            if (!node) return;
            const halo = BABYLON.MeshBuilder.CreateTorus('wheel-halo', { diameter: R * 2.1, thickness: [0, 4, 6, 9][tier], tessellation: 40 }, scene);
            const mat = new BABYLON.StandardMaterial('wheel-halo-m', scene);
            mat.disableLighting = true; mat.emissiveColor = col.clone(); mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.alpha = 0.55; mat.alphaMode = BABYLON.Engine.ALPHA_ADD; mat.backFaceCulling = false; mat.metadata = { toon: false };
            halo.material = mat; halo.parent = node; halo.rotation.x = Math.PI / 2; halo.isPickable = false;
            halo.position.z = (i % 2 ? 1 : -1) * 15;
            halo.renderingGroupId = World3D.LAYER.OVERLAY;
            w.halos.push(halo);
            if (!app || !app.fx || i < 2 && tier < 3) return;   // искры и огонь — у передних колёс (и задних у легендарных)
            const rimPt = (ang) => () => V.TransformCoordinates(new V(Math.cos(ang) * R * 0.9, Math.sin(ang) * R * 0.9, (i % 2 ? 1 : -1) * 16), node.getWorldMatrix());
            const ground = () => { const p = node.getAbsolutePosition(); return new V(p.x, p.y - R, p.z); };
            if (tier >= 2) {
                const spray = app.fx.create({ texture: 'assets/fx/spark-streak.webp', rate: 0, capacity: 90, life: [0.18, 0.4], size: [16, 34], speed: [220, 520],
                    follow: ground, direction: [[-1, 0.4, -0.3], [-0.6, 1, 0.3]], gravity: [0, -900, 0], colorGradient: [[0, '#ffffff', 1], [0.3, hex, 1], [1, hex, 0]] });
                if (spray) w.emitters.push({ h: spray, kind: 'spray' });
            }
            if (tier >= 3) {
                const fire = app.fx.create({ texture: 'assets/fx/flame.webp', rate: 0, capacity: 80, life: [0.18, 0.35], size: [20, 40], speed: [5, 30],
                    follow: rimPt(0), colorGradient: [[0, '#fff6c0', 1], [0.35, hex, 0.95], [1, hex, 0]], sizeGradient: [[0, 1], [1, 0.2]] });
                if (fire) w.emitters.push({ h: fire, kind: 'fire' });
            }
        });
    },

    _updateRimFx(dt, riding) {
        const w = this._wfx;
        if (!w) return;
        w.t += dt;
        const B = Car, sp = Math.min(1.6, Math.abs(B.vf) / 2600);
        const on = riding && this.visible;
        for (const h of w.halos) {
            h.material.alpha = (0.3 + 0.25 * Math.sin(w.t * (3 + w.tier))) * (0.55 + 0.45 * sp) * [0, 0.55, 0.8, 1][w.tier];
        }
        for (const e of w.emitters) {
            let rate = 0;
            if (e.kind === 'spray') rate = on && B.grounded && sp > 0.35 ? 30 + 50 * sp : 0;
            else if (e.kind === 'fire') rate = on ? 18 + 40 * sp : (this.state === 'menu' ? 8 : 0);
            e.h.setRate(rate);
        }
    },

    _setTrail(id) {
        if (this.trail) { this.trail.stop(); this.trail = null; }
        this.cur.trail = id;
        const it = this.item(id);
        const app = this.app;
        if (!it || !it.trail || !app || !app.fx) return;
        const T = LOOK_TRAILS[it.trail] || LOOK_TRAILS.sparkle;
        const hex = (h) => '#' + Number(h).toString(16).padStart(6, '0');
        const c1 = T.white ? '#ffffff' : hex(it.color != null ? it.color : 0xffffff), c2 = T.white ? '#ffffff' : hex(it.color2 != null ? it.color2 : it.color || 0xffffff);
        /** @type {any} */
        const opts = {
            texture: T.texture, rate: 0, capacity: 320, life: T.life, size: T.size, speed: [10, 40], blend: T.blend || 'additive',
            follow: () => this.trailPoint(), box: [[-40, 0, -40], [40, 12, 40]], direction: [[-0.3, 0.6, -0.3], [0.3, 1, 0.3]],
            gravity: [0, T.up || 40, 0], alpha: T.alpha || 1, spin: T.spin || [0, 0],
            colorGradient: T.rainbow
                ? [[0, '#ff4d5e', 1], [0.25, '#ffd23f', 1], [0.5, '#56c93a', 0.9], [0.75, '#3ec5ff', 0.7], [1, '#7b4dff', 0]]
                : [[0, c1, T.alpha || 1], [0.6, c2, (T.alpha || 1) * 0.8], [1, c2, 0]],
            sizeGradient: [[0, 0.6], [0.3, 1], [1, 0.4]],
        };
        this.trail = app.fx.create(opts);
        this.trailKind = it.trail;
    },

    /** Точка следа — за машиной между задними колёсами у земли. */
    trailPoint() {
        const q = Car.point(-180, 14, 0);
        return new BABYLON.Vector3(q[0], q[1], q[2]);
    },

    // Дым из-под задних колёс в заносе и при пробуксовке (не косметика — отклик физики).
    _smoke(on) {
        const app = this.app;
        if (!app || !app.fx) return;
        if (!this.smoke.length) {
            for (const i of [0, 1]) {
                const h = app.fx.create({ texture: 'assets/fx/smoke-white.webp', blend: 'standard', rate: 0, capacity: 120, life: [0.6, 1.2], size: [50, 110], speed: [20, 80],
                    follow: () => { const w = Car.wheels[i]; return new BABYLON.Vector3(w.q[0], w.q[1] + 10, w.q[2]); },
                    direction: [[-0.4, 0.5, -0.4], [0.4, 1, 0.4]], gravity: [0, 60, 0], alpha: 0.55, colorGradient: [[0, '#ffffff', 0.55], [1, '#dcdce6', 0]], sizeGradient: [[0, 0.5], [1, 1.4]] });
                if (h) this.smoke.push(h);
            }
        }
        this.smoke.forEach((h, k) => {
            const w = Car.wheels[k];
            const s = on && w.contact ? Math.max(0, Math.min(1, (w.slip - 0.35) * 2.5)) : 0;
            h.setRate(s * 60);
        });
    },

    // -----------------------------------------------------------------------------------------
    // Кадр
    // -----------------------------------------------------------------------------------------

    /** Поставить машину по физике (и сразу, без сглаживания). */
    place() {
        if (this.cv && this.cv.car) this.cv.pose(Car, 0, { menu: this.state === 'menu' });
    },

    update(dt, state) {
        const cv = this.cv;
        if (!cv || !cv.car) return;
        this.state = state;
        cv.pose(Car, dt, { menu: state === 'menu' });
        cv.effects(Car, dt, { on: state === 'ride' || state === 'menu' });
        Skids.update(dt);
        this._updateRimFx(dt, state === 'ride');
        this._smoke(state === 'ride' && Car.grounded && Math.abs(Car.vf) > 120);
        if (this.trail) {
            const sp = Math.abs(Car.vf);
            const on = state === 'ride' && this.visible && sp > 150 && (Car.grounded || Car.airTime < 0.6);
            this.trail.setRate(on ? Math.min(110, 14 + sp * 0.035) : 0);
        }
    },

    ik() { if (this.cv) this.cv.ik(); },

    // Двухзвенная IK: колено/локоть в плоскости цели и полюса; S — масштаб рига (длины костей в мире).
    _solve2(upper, lower, end, target, pole, S) {
        if (!upper || !lower || !end) return;
        const V = BABYLON.Vector3, k = S || 1;
        const a = lower.position.length() * k, b = end.position.length() * k;
        const rq = this._rest.get(upper);
        if (rq && upper.rotationQuaternion) upper.rotationQuaternion.copyFrom(rq);
        const cw = (n) => { if (n.parent) cw(n.parent); n.computeWorldMatrix(true); };
        cw(upper);
        const H = upper.getWorldMatrix().getTranslation();
        let d = V.Distance(target, H);
        const dir = target.subtract(H).normalize();
        d = Math.max(Math.abs(a - b) + 0.5, Math.min(a + b - 0.3, d));
        let pl = pole.subtract(dir.scale(V.Dot(pole, dir)));
        if (pl.lengthSquared() < 1e-6) pl = new V(0, 1, 0);
        pl.normalize();
        const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
        const sinA = Math.sqrt(1 - cosA * cosA);
        const K = H.add(dir.scale(a * cosA)).add(pl.scale(a * sinA));
        this._aim(upper, lower.position, K);
        this._aim(lower, end.position, H.add(dir.scale(d)));
    },

    _rest: new WeakMap(),

    // Повернуть кость так, чтобы направление на её ребёнка (в покое) смотрело в точку мира.
    _aim(node, childLocal, target) {
        const V = BABYLON.Vector3, Q = BABYLON.Quaternion;
        let rest = this._rest.get(node);
        if (!rest) { rest = node.rotationQuaternion ? node.rotationQuaternion.clone() : new Q(); this._rest.set(node, rest); }
        if (!node.rotationQuaternion) node.rotationQuaternion = new Q();
        node.rotationQuaternion.copyFrom(rest);
        const cw = (n) => { if (n.parent) cw(n.parent); n.computeWorldMatrix(true); };
        cw(node);
        const wm = node.getWorldMatrix();
        const origin = wm.getTranslation();
        const from = V.TransformNormal(childLocal, wm).normalize();
        const to = target.subtract(origin);
        if (to.lengthSquared() < 1e-6) return;
        to.normalize();
        const qw = new Q();
        Q.FromUnitVectorsToRef(from, to, qw);
        const pq = new Q();
        if (node.parent) node.parent.getWorldMatrix().decompose(undefined, pq);
        node.rotationQuaternion = Q.Inverse(pq).multiply(qw).multiply(pq).multiply(rest);
    },

    /** Авария: дым, огонь и искры у машины. */
    crash(reason) {
        void reason;
        const app = this.app;
        if (app && app.fx) app.fx.play('carcrash', new BABYLON.Vector3(Car.c[0], Car.c[1] + 40, Car.c[2]));
    },

    /** Водитель вылетает через крышу (авария, лава). */
    launchRider() { if (this.cv) this.cv.launchDriver(Car); },

    /** Вернуть водителя за руль (респаун). */
    seatRider() { if (this.cv) this.cv.seatDriver(); },

    setVisible(on) {
        this.visible = !!on;
        if (this.cv) this.cv.setVisible(on);
    },

    // -----------------------------------------------------------------------------------------
    // Превью предметов (карточки Гаража): своя маленькая сцена, рендер в картинку, кэш
    // -----------------------------------------------------------------------------------------

    /** @type {Record<string, Promise<string | null>>} */ _thumbs: {},
    /** @type {any} */ _ts: null,
    _thumbChain: Promise.resolve(),

    /** data URL превью предмета Гаража из игровой модели (null — не вышло). */
    thumb(id) {
        const key = id + '|' + (this.cur.car || '');
        const it = this.item(id);
        const k = it && (it.slot === 'paint' || it.slot === 'skin') ? key : id;   // покраска и водитель — на текущей машине
        if (!(k in this._thumbs)) {
            this._thumbs[k] = new Promise((resolve) => {
                this._thumbChain = this._thumbChain.then(() => this._renderThumb(id)).then(resolve, (e) => { console.warn('Look.thumb', id, e && e.message); resolve(null); });
            });
        }
        return this._thumbs[k];
    },

    _thumbScene() {
        if (this._ts) return this._ts;
        const engine = World3D.engine;
        const scene = new BABYLON.Scene(engine);
        scene.useRightHandedSystem = true;
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
        scene.autoClear = true;
        const hemi = new BABYLON.HemisphericLight('t-sky', new BABYLON.Vector3(0, 1, 0), scene);
        hemi.intensity = 0.8; hemi.groundColor = new BABYLON.Color3(0.55, 0.5, 0.65);
        const sun = new BABYLON.DirectionalLight('t-sun', new BABYLON.Vector3(-0.4, -0.8, 0.5), scene);
        sun.intensity = 0.7;
        const cam = new BABYLON.TargetCamera('t-cam', new BABYLON.Vector3(0, 0, 0), scene);
        cam.fov = 0.5; cam.minZ = 1; cam.maxZ = 5000;
        this._ts = { scene, cam };
        return this._ts;
    },

    async _renderThumb(id) {
        const it = this.item(id);
        if (!it) return null;
        const { scene, cam } = this._thumbScene();
        /** @type {any[]} */
        const roots = [];
        /** @type {any[]} */
        const mats = [];
        const paintRoot = (root, color) => {
            const c = lookColor(color);
            if (!c) return;
            for (const m of root.getChildMeshes(false)) {
                const part = m.metadata && m.metadata.part ? String(m.metadata.part) : '';
                if (!part.startsWith('Body')) continue;
                const src = m.getVerticesData(BABYLON.VertexBuffer.ColorKind);
                if (!src) { if (m.material) { const k = m.material.clone('t+p'); k.diffuseColor = c; m.material = k; mats.push(k); } continue; }
                const out = Float32Array.from(src);
                for (let i = 0; i < out.length; i += 4) if (out[i] > 0.985 && out[i + 1] > 0.985 && out[i + 2] > 0.985) { out[i] = c.r; out[i + 1] = c.g; out[i + 2] = c.b; }
                m.setVerticesData(BABYLON.VertexBuffer.ColorKind, out, false);
            }
        };
        const tint = (root, prefix, color) => {
            const c = lookColor(color);
            if (!c) return;
            for (const m of root.getChildMeshes(false)) {
                const part = m.metadata && m.metadata.part ? String(m.metadata.part) : '';
                if (!part.startsWith(prefix) || !m.material) continue;
                const one = (x) => { const k = x.clone(x.name + '+t'); k.diffuseColor = c.clone(); mats.push(k); return k; };
                if (m.material.subMaterials) { const mm = new BABYLON.MultiMaterial('t', scene); mm.subMaterials = m.material.subMaterials.map(one); m.material = mm; mats.push(mm); }
                else m.material = one(m.material);
            }
        };
        const show = (root, prefix, on) => { for (const m of root.getChildMeshes(false)) { const part = m.metadata && m.metadata.part ? String(m.metadata.part) : ''; if (part.startsWith(prefix)) m.setEnabled(on); } };
        let view = 'car';
        const slot = it.slot || it.tab;
        try {
            if (slot === 'car' || slot === 'paint') {
                const carItem = slot === 'car' ? it : this.item(this.cur.car);
                const url = (carItem && carItem.model) || LOOK_DEFAULT_CAR;
                const cm = await Model3D.load(url);
                const car = Model3D.build(cm, scene, { name: 't-car' });
                roots.push(car);
                const meta = lookCarMeta(url);
                const base = carItem && carItem.color != null ? carItem.color : meta.color;
                paintRoot(car, slot === 'paint' && it.paint && it.paint.color != null ? it.paint.color : base);
            } else if (slot === 'skin') {
                const rm = await Model3D.load(LOOK_RIDER);
                const rider = Model3D.build(rm, scene, { name: 't-rider' });
                roots.push(rider);
                const L = it.look || {};
                tint(rider, 'Head', L.skin); tint(rider, 'Torso', L.shirt); tint(rider, 'Hand_', L.skin);
                for (const pre of ['Arm_', 'UpperArm_', 'LowerArm_']) tint(rider, pre, L.arms != null ? L.arms : L.shirt);
                for (const pre of ['Leg_', 'UpperLeg_', 'LowerLeg_']) tint(rider, pre, L.pants);
                show(rider, 'Hair_', false); if (L.hair) { show(rider, 'Hair_' + L.hair, true); tint(rider, 'Hair_' + L.hair, L.hairColor); }
                show(rider, 'Face_', false); show(rider, 'Face_' + (L.face || 'smile'), true);
                show(rider, 'Acc_', false); for (const a of L.acc || []) show(rider, 'Acc_' + a, true);
                view = 'rider';
            } else if (slot === 'rims') {
                if (!it.model) return null;
                const m = await Model3D.load(it.model);
                const root = Model3D.build(m, scene, { name: 't-rim' });
                roots.push(root);
                const c = lookColor(it.color);
                if (c) for (const mm of root.getChildMeshes(false)) {
                    const src = mm.getVerticesData(BABYLON.VertexBuffer.ColorKind);
                    if (!src) continue;
                    const out = Float32Array.from(src);
                    for (let i = 0; i < out.length; i += 4) if (out[i] > 0.985 && out[i + 1] > 0.985 && out[i + 2] > 0.985) { out[i] = c.r; out[i + 1] = c.g; out[i + 2] = c.b; }
                    mm.setVerticesData(BABYLON.VertexBuffer.ColorKind, out, false);
                }
                view = 'rim';
            } else return null;
        } catch (e) {
            for (const r of roots) r.dispose(false, false);
            return null;
        }
        // кадр по габариту
        let min = new BABYLON.Vector3(Infinity, Infinity, Infinity), max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
        for (const root of roots) for (const m of root.getChildMeshes(false)) {
            if (!m.isEnabled() || !m.getTotalVertices()) continue;
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            min = BABYLON.Vector3.Minimize(min, bb.minimumWorld); max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
        }
        if (!Number.isFinite(min.x)) { for (const r of roots) r.dispose(false, false); return null; }
        const center = min.add(max).scale(0.5);
        const radius = Math.max(1, max.subtract(min).length() / 2);
        const dist = radius / Math.sin(cam.fov / 2) * (view === 'rider' ? 0.92 : 0.86);
        // сцена превью — правая система: «вперёд» модели +X, «вправо» −Z
        const dir = view === 'rim' ? new BABYLON.Vector3(0.2, 0.15, -1) : view === 'rider' ? new BABYLON.Vector3(0.9, 0.3, 0.6) : new BABYLON.Vector3(0.85, 0.42, 0.75);
        dir.normalize();
        cam.position = center.add(dir.scale(dist));
        cam.setTarget(center);
        await scene.whenReadyAsync();
        const url = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(World3D.engine, cam, { width: 192, height: 192 }, 'image/png', 1, true);
        for (const r of roots) r.dispose(false, false);
        for (const m of mats) m.dispose();
        return url || null;
    },
};
const GameLook = Look;
