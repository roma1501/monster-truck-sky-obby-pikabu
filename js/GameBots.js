// GameBots.js — боты, похожие на живых игроков: едут на той же физике машины (createCar), сами
// проходят трассу по маршруту карты (маркеры route-N: точка на линии езды, scale[0] — доля скорости,
// scale[1] — действие: 1 едем, 2 прыжок здесь, 3 приземление), ошибаются по своему умению, падают и
// возвращаются на свой чекпоинт, доезжают до финиша. У каждого — своя машина, покраска, диски, скин
// водителя, ник (на языке игры) и табличка над машиной. Машины толкаются: удар игрока быстрее
// BOT_KNOCK_SPEED закручивает и отбрасывает бота; медленно — просто расталкиваются. Ботов держим рядом
// с игроком: отставший далеко бот «выходит», а рядом «заходит» новый (как в живом сервере). Дальних
// ботов не считаем.

const BOT_NAMES = {
    ru: ['Таран', 'Гусеница', 'Грязнуля', 'Крушила', 'Кексик', 'Молния', 'ДимаПро', 'Сашка_2013', 'Котлетка', 'Нитро',
        'Турбо', 'Монстрик', 'Драйвер', 'Рыжик', 'Бублик', 'Скорость', 'Ниндзя', 'Зайка', 'Гонщик77', 'Тимоха',
        'Громила', 'Кирюха', 'Пельмешка', 'Оладушек', 'Вася_Ракета', 'Булыжник', 'Колян', 'Мармеладка', 'Шторм', 'Пломбир'],
    en: ['MudKing', 'Crusher', 'BigWheels', 'Burnout', 'Turbo', 'Biscuit', 'Smashy', 'MaxPro', 'Rocket_Ray', 'Noodle',
        'Gravel', 'Nova', 'Bolt', 'Sprinkles', 'Ziggy', 'Comet', 'Pixel', 'Muffin', 'Blaze', 'Skippy',
        'TireBiter', 'JunkJumper', 'Dozer', 'RustyRick', 'Boulder', 'NitroNate', 'FlipMaster', 'Wrecker', 'AirTime', 'Thunder'],
};

const BOTS_CSS = `
#bo-tags { position: fixed; inset: 0; pointer-events: none; z-index: 15; overflow: hidden; font-family: var(--bo-font); }
#bo-tags .tag { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; white-space: nowrap; color: #fff; font-size: 15px;
  padding: 1px 8px 2px; border-radius: 9px; background: rgba(27,18,64,.55); text-shadow: var(--bo-outline-thin); will-change: transform; }
#bo-tags .tag.off { display: none; }
body.meta-open #bo-tags { display: none; }
`;

/** @satisfies {Record<string, any>} */
const Bots = {
    /** @type {any} */ app: null,
    /** @type {any[]} */ list: [],
    /** @type {any[]} */ route: [],
    /** @type {number[]} */ cpRoute: [],
    /** @type {HTMLElement | null} */ tags: null,
    _names: [],
    _gen: 0,

    init(app) {
        this.app = app;
        const st = document.createElement('style');
        st.id = 'bo-bots-css'; st.textContent = BOTS_CSS;
        document.head.appendChild(st);
        const box = document.createElement('div');
        box.id = 'bo-tags';
        document.body.appendChild(box);
        this.tags = box;
    },

    count() {
        const U = 'undefined';
        const n = IS_MOBILE ? (typeof BOT_COUNT_MOBILE !== U ? BOT_COUNT_MOBILE : 4) : (typeof BOT_COUNT !== U ? BOT_COUNT : 6);
        const q = typeof Quality !== 'undefined' && Quality.level != null ? Number(Quality.level) : 2;
        return Math.max(0, q <= 0 ? Math.min(n, 3) : n);
    },

    // ---------------------------------------------------------------------------------------------
    // Маршрут мира
    // ---------------------------------------------------------------------------------------------

    /** Под экраном загрузки мира: маршрут из маркеров, привязка чекпоинтов, новые боты. */
    async build(app, cps, spawn, finish) {
        this.clear();
        const loc = app.location;
        const num = (d) => { const m = /-(\d+)$/.exec(String(d.name)); return m ? Number(m[1]) : 0; };
        const pt = (d) => ({ x: Number(d.x) || 0, y: Number(d.h) || 0, z: Number(d.y) || 0,
            yaw: ((Array.isArray(d.rot) ? Number(d.rot[1]) : Number(d.rot)) || 0) * Math.PI / 180,
            s: Array.isArray(d.scale) ? Math.max(0.3, Math.min(1, Number(d.scale[0]) || 1)) : 1,
            f: Array.isArray(d.scale) ? Math.round(Number(d.scale[1]) || 1) : 1 });
        let route = loc.markers('route').slice().sort((a, b) => num(a) - num(b)).map(pt);
        if (route.length < 8) route = this._fallbackRoute([spawn].concat(cps, finish ? [finish] : []).filter(Boolean).map(pt));
        this.route = route;
        // какой точке маршрута соответствует каждый чекпоинт (ближайшая по порядку)
        this.cpRoute = [];
        let from = 0;
        for (const d of cps) {
            const p = pt(d);
            let best = from, bd = Infinity;
            for (let i = from; i < route.length; i++) {
                const dd = (route[i].x - p.x) ** 2 + (route[i].z - p.z) ** 2 + ((route[i].y - p.y) * 2) ** 2;
                if (dd < bd) { bd = dd; best = i; }
            }
            this.cpRoute.push(best);
            from = best;
        }
        this._mapHazards();
        const n = this.count();
        const jobs = [];
        for (let i = 0; i < n; i++) jobs.push(this._spawn(i));
        await Promise.all(jobs);
    },

    // Опасности у точек маршрута: высокие балки, молоты (выждать момент), движущиеся плиты (дождаться плиту).
    _mapHazards() {
        const R = this.route;
        this.haz = R.map(() => null);
        for (const p of Course.pieces) {
            if (!p.dynamic || !p.base) continue;
            const O = p.base.O;
            const isSpin = p.type === 'spinner' && p.sy > 55;          // низкую перепрыгивают
            const isHammer = p.type === 'hammer';
            const isMove = p.prm.role === 'move';
            if (!isSpin && !isHammer && !isMove) continue;
            const reach = isSpin ? p.sx / 2 + 320 : isHammer ? p.sy + p.sx / 2 + 320 : Math.max(p.sx, p.sz) / 2 + 40;   // + полмашины: нос под балкой раньше центра
            for (let i = 0; i < R.length; i++) {
                const q = R[i];
                if (Math.hypot(q.x - O[0], q.z - O[2]) > reach || Math.abs(q.y - O[1]) > 600) continue;
                (this.haz[i] || (this.haz[i] = [])).push({ p, kind: isSpin ? 'spin' : isHammer ? 'hammer' : 'move' });
            }
        }
        // зоны балок и молотов: от первой до последней задетой точки маршрута (въезд — с запасом на 1 точку раньше)
        /** @type {any[]} */
        const zones = [];
        for (let i = 0; i < R.length; i++) for (const h of this.haz[i] || []) {
            if (h.kind === 'move') continue;
            const z = zones.find(q => q.p === h.p && i - q.i1 <= 2);
            if (z) z.i1 = i; else zones.push({ p: h.p, h, i0: i, i1: i });
        }
        this.zones = zones;
    },

    // Проскочит ли бот зону целиком, если поедет сейчас: прибытие к каждой точке зоны по разгону до vz.
    _zoneClear(b, z) {
        const R = this.route, B = b.car;
        const a = (typeof CAR_ACCEL !== 'undefined' ? CAR_ACCEL : 1900) * 0.7, vz = 1800;
        let v = Math.max(0, B.vf), prev = { x: B.p[0], z: B.p[2] }, t = 0;
        const t0 = Course.time;
        for (let j = b.ri; j <= z.i1 + 1 && j < R.length; j++) {
            const q = R[j];
            const d = Math.hypot(q.x - prev.x, q.z - prev.z), yaw = Math.atan2(q.z - prev.z, q.x - prev.x);
            // отрезок — мелкими шагами (~120 px): машина длинная, балка между точками маршрута не проскочит мимо проверки
            const n = Math.max(1, Math.ceil(d / 120));
            for (let k = 1; k <= n; k++) {
                const dd = d / n;
                const v2 = Math.min(vz, Math.sqrt(v * v + 2 * a * dd));
                t += dd / Math.max(120, (v + v2) / 2);
                v = v2;
                const s = { x: prev.x + (q.x - prev.x) * k / n, z: prev.z + (q.z - prev.z) * k / n };
                for (const dtw of [-0.18, 0, 0.18]) if (this._danger(z.h, s, t0 + t + dtw, yaw)) return false;
            }
            prev = q;
        }
        return true;
    },

    // Расстояние между отрезками a1-a2 и b1-b2 на плоскости (x, z).
    _segDist(a1x, a1z, a2x, a2z, b1x, b1z, b2x, b2z) {
        const pt = (px, pz, sx, sz, ex, ez) => {
            const vx = ex - sx, vz = ez - sz, L = vx * vx + vz * vz;
            const u = L > 1e-9 ? Math.max(0, Math.min(1, ((px - sx) * vx + (pz - sz) * vz) / L)) : 0;
            return Math.hypot(px - (sx + vx * u), pz - (sz + vz * u));
        };
        const cr = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        const d1 = cr(a1x, a1z, a2x, a2z, b1x, b1z), d2 = cr(a1x, a1z, a2x, a2z, b2x, b2z);
        const d3 = cr(b1x, b1z, b2x, b2z, a1x, a1z), d4 = cr(b1x, b1z, b2x, b2z, a2x, a2z);
        if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
        return Math.min(pt(a1x, a1z, b1x, b1z, b2x, b2z), pt(a2x, a2z, b1x, b1z, b2x, b2z), pt(b1x, b1z, a1x, a1z, a2x, a2z), pt(b2x, b2z, a1x, a1z, a2x, a2z));
    },

    // Опасность h для машины с центром q и курсом yaw в момент трассы t (те же формулы, что у Course._pose).
    // Машина — отрезок ±240 px по курсу (корпус 450) шириной ~200.
    _danger(h, q, t, yaw) {
        const p = h.p, B = p.base;
        const cy = Math.cos(yaw || 0), sy = Math.sin(yaw || 0);
        const c1x = q.x - cy * 240, c1z = q.z - sy * 240, c2x = q.x + cy * 240, c2z = q.z + sy * 240;
        if (h.kind === 'spin') {
            const rpm = p.anim && Number(p.anim.speed) > 0 ? Number(p.anim.speed) : 12;
            const ang = rpm / 60 * Math.PI * 2 * (p.anim && p.anim.dir === 'cw' ? -1 : 1) * t;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const dx = B.ax[0] * ca - B.az[0] * sa, dz = B.ax[2] * ca - B.az[2] * sa;   // направление балки
            const hl = p.sx / 2;
            const d = this._segDist(c1x, c1z, c2x, c2z, B.O[0] - dx * hl, B.O[2] - dz * hl, B.O[0] + dx * hl, B.O[2] + dz * hl);
            return d < Math.max(16, p.sz / 2) + 150;
        }
        if (h.kind === 'hammer') {
            const T = Math.max(0.5, p.prm.t || 2.6), A = (p.prm.a || 70) * Math.PI / 180;
            const phi = A * Math.sin(2 * Math.PI * (t / T + (p.prm.ph || 0)));
            const L = p.sy, lat = L * Math.sin(phi), low = L * (1 - Math.cos(phi));
            const hx = B.O[0] + B.az[0] * lat, hz = B.O[2] + B.az[2] * lat;
            // боёк — отрезок поперёк качания (вдоль оси x молота) длиной sz
            const bx = B.ax[0] * p.sz / 2, bz = B.ax[2] * p.sz / 2;
            const d = this._segDist(c1x, c1z, c2x, c2z, hx - bx, hz - bz, hx + bx, hz + bz);
            return low < 220 && d < p.sx / 2 + 150;
        }
        // движущаяся плита: опасно, если в этот момент точка q (на плите в базовой позе) не лежит на плите
        // с запасом в полмашины — плита уехала (паром вдоль хода), сместилась вбок или лифт не на нашей высоте
        const T = Math.max(0.3, p.prm.t || 4), sv = Math.sin(2 * Math.PI * (t / T + (p.prm.ph || 0)));
        const dx = (p.prm.x || 0) * sv, dy = (p.prm.y || 0) * sv, dz = (p.prm.z || 0) * sv;
        const O = [B.O[0] + dx * B.ax[0] + dy * B.ay[0] + dz * B.az[0], B.O[1] + dx * B.ax[1] + dy * B.ay[1] + dz * B.az[1], B.O[2] + dx * B.ax[2] + dy * B.ay[2] + dz * B.az[2]];
        const rx = q.x - O[0], rz = q.z - O[2];
        const lx = rx * B.ax[0] + rz * B.ax[2], lz = rx * B.az[0] + rz * B.az[2];
        const covered = Math.abs(lx) <= p.sx / 2 - 200 && Math.abs(lz) <= p.sz / 2 - 130 && (q.y == null || Math.abs(O[1] - q.y) < 90);
        return !covered;
    },

    /** Впереди опасно в момент прибытия: вернуть true — притормозить и выждать. */
    _hazardAhead(b) {
        const R = this.route, B = b.car;
        if (!this.haz) return false;
        const v = Math.max(500, Math.abs(B.vf));
        let dist = 0, prev = { x: B.p[0], z: B.p[2] };
        for (let j = b.ri; j < Math.min(R.length, b.ri + 8); j++) {
            const q = R[j];
            dist += Math.hypot(q.x - prev.x, q.z - prev.z);
            prev = q;
            if (dist > 1500) break;
            const hs = this.haz[j];
            if (!hs) continue;
            if (dist < 150) return false;                              // уже в зоне — только вперёд
            const tau = dist / v, t = Course.time, yaw = Math.atan2(q.z - (R[j - 1] || q).z, q.x - (R[j - 1] || q).x) || B.yaw;
            for (const h of hs) {
                if (h.kind === 'move' && B.wheels.some(w => w.contact && w.col && w.col.piece === h.p)) continue;   // уже на этой плите
                if (h.kind === 'move') {
                    // плиту ждём у точки перед ней: впрыгнуть, когда подъедет к базе
                    if (dist < 700 && (this._danger(h, q, t + tau, yaw) || this._danger(h, q, t + tau + 0.35, yaw))) return true;
                } else if (this._danger(h, q, t + tau - 0.15, yaw) || this._danger(h, q, t + tau, yaw) || this._danger(h, q, t + tau + 0.3, yaw)) return true;
            }
        }
        return false;
    },

    // Без маркеров маршрута: прямые между чекпоинтами, точки через ~450 px (боты будут чаще падать).
    _fallbackRoute(pts) {
        const out = [];
        for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i], b = pts[i + 1];
            const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 450));
            const yaw = Math.atan2(b.z - a.z, b.x - a.x);
            for (let k = 0; k < n; k++) { const t = k / n; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw, s: 0.8, f: 1 }); }
        }
        if (pts.length) out.push(Object.assign({}, pts[pts.length - 1], { s: 0.6, f: 1 }));
        return out;
    },

    clear() {
        for (const b of this.list) this._dispose(b);
        this.list = [];
    },

    _dispose(b) {
        try { if (b.view) b.view.dispose(); } catch (e) { /* уже */ }
        if (b.tag) b.tag.remove();
    },

    // ---------------------------------------------------------------------------------------------
    // Боты: вид, имя, место
    // ---------------------------------------------------------------------------------------------

    _name() {
        const lang = typeof Lang !== 'undefined' && Lang.code === 'ru' ? 'ru' : 'en';
        const list = BOT_NAMES[lang];
        if (!this._names.length) this._names = list.slice().sort(() => Math.random() - 0.5);
        return this._names.pop();
    },

    _pick(tab, filter) {
        if (typeof SHOP_ITEMS === 'undefined') return null;
        const pool = SHOP_ITEMS.filter(it => it.tab === tab && (!filter || filter(it)));
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    },

    async _spawn(i) {
        const view = this.app.location.view;
        const carItem = this._pick('cars', it => !it.exclusive) || { model: LOOK_DEFAULT_CAR, color: 0x2f7fe0 };
        const skin = this._pick('skins', it => !it.exclusive);
        const paint = Math.random() < 0.35 ? this._pick('paint', it => !it.exclusive && it.paint) : null;
        const rims = Math.random() < 0.4 ? this._pick('rims', it => !it.exclusive && it.model) : null;
        const cv = new CarView(view, 'bot-car');
        await cv.setCar(carItem);
        await cv.setDriver();
        if (paint) cv.setPaint(paint.paint);
        cv.setSkin((skin && skin.look) || { skin: 0xf3c8a8, shirt: 0x3e7bfa, arms: 0x3e7bfa, pants: 0x2a2f45, hair: 'spiky', hairColor: 0x3b2a1a, face: 'smile', acc: [] });
        if (rims) await cv.setRims(rims);
        const b = {
            car: createCar(), view: cv, name: this._name(), skill: 0, ri: 0, cpRi: 0, state: 'ride', deadT: 0, waitT: 0, wait: 0,
            jumpedAt: -1, far: 0, cheerT: 0, noise: Math.random() * 10, gen: ++this._gen, tag: null,
        };
        const tag = document.createElement('div');
        tag.className = 'tag off';
        tag.textContent = b.name;
        if (this.tags) this.tags.appendChild(tag);
        b.tag = tag;
        b.car.isBot = true;
        b.car.setGeom(lookCarRaw(carItem && carItem.model));
        b.car.on.die = (reason) => this._die(b, reason);
        this._place(b, this._nearIndex(i));
        this.list.push(b);
    },

    /** Точка маршрута рядом с игроком: свой чекпоинт игрока ±, ближние — с небольшой задержкой старта. */
    _nearIndex(i) {
        const cp = typeof Game !== 'undefined' ? Game.cp : 0;
        const pick = Math.max(0, Math.min(this.cpRoute.length, cp + Math.floor(Math.random() * 3) - 1));
        let ri = pick <= 0 ? 0 : this.cpRoute[pick - 1];
        // ботов на одной точке разводим по маршруту на пару десятков точек вперёд
        ri = Math.min(this.route.length - 2, ri + 3 + (i % 3) * 3 + Math.floor(Math.random() * 4));   // не ближе ~1300 px к игроку
        return Math.max(0, ri);
    },

    _place(b, ri) {
        const R = this.route;
        if (!R.length) return;
        ri = this._safeIndex(Math.max(0, Math.min(R.length - 1, ri)));
        const p = R[ri], nx = R[Math.min(R.length - 1, ri + 1)];
        const yaw = nx !== p ? Math.atan2(nx.z - p.z, nx.x - p.x) : p.yaw;
        b.car.reset(p.x, p.y, p.z, yaw);
        b.ri = ri;
        b.cpRi = Math.max(ri, b.cpRi && this.cpRoute.includes(b.cpRi) && b.cpRi <= ri ? b.cpRi : ri);
        b.state = 'ride';
        b.far = 0;
        b.skill = (typeof BOT_SKILL_MIN !== 'undefined' ? BOT_SKILL_MIN : 0.55) + Math.random() * ((typeof BOT_SKILL_MAX !== 'undefined' ? BOT_SKILL_MAX : 0.95) - (typeof BOT_SKILL_MIN !== 'undefined' ? BOT_SKILL_MIN : 0.55));
        b.waitT = 0.4 + Math.random() * 2.5;   // как живой игрок: стартует не сразу
        b.view.seatDriver();
        b.view.setVisible(true);
        b.invT = typeof BOT_SPAWN_SHIELD !== 'undefined' ? BOT_SPAWN_SHIELD : 3;   // после появления сбить нельзя
        b.stuckT = 0; b.bestD = Infinity; b.turnT = 0; b.waited = 0; b.recklessT = 0; b.jumpedAt = -1; b.backT = 0; b.backFor = -1; b.backN = 0;
        b.rash = Math.random() < (1 - b.skill) * 0.5;   // торопыга: не выжидает препятствия (как неопытный игрок)
        b.reckless = b.rash;
        this._pose(b);
    },

    // Точка маршрута, под которой есть опора (назад по маршруту до первой такой, иначе — старт).
    _safeIndex(ri) {
        const R = this.route;
        for (let i = ri; i >= 0; i--) {
            const p = R[i], hit = Course.rayDown(p.x, p.y + 60, p.z, 140);
            if (hit && Math.abs(hit.y - p.y) < 40 && !hit.col.kill && !hit.col.dynamic) return i;
        }
        return 0;
    },

    /** Бот «перезаходит» рядом с игроком под новым ником. */
    _rejoin(b) {
        b.name = this._name();
        if (b.tag) b.tag.textContent = b.name;
        this._place(b, this._nearIndex(Math.floor(Math.random() * 3)));
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр
    // ---------------------------------------------------------------------------------------------

    update(dt, playerRiding) {
        const R = this.route;
        if (!R.length || !this.list.length) return;
        const P = Car.p;
        for (const b of this.list) {
            const B = b.car;
            const dx = B.p[0] - P[0], dz = B.p[2] - P[2], d2 = dx * dx + dz * dz;
            // далеко от игрока — «выходит», рядом заходит новый
            if (d2 > 20000 * 20000) { b.far += dt; if (b.far > 6) this._rejoin(b); }
            else b.far = 0;
            const near = d2 < 12000 * 12000;
            b.view.setVisible(near || b.state === 'dead');
            if (!near) { if (b.tag) b.tag.classList.add('off'); continue; }
            if (b.state === 'ride') this._drive(b, dt, d2 < 5000 * 5000 ? 180 : 90);
            else if (b.state === 'dead') {
                b.deadT -= dt;
                B.step(dt, {});                                     // упавшая машина летит вниз (вид)
                if (b.deadT < 0.35 && b.car.deadReason === 'fall') b.view.car.root.setEnabled(false);
                if (b.deadT <= 0) {
                    // как живой игрок: застрял на одном участке — «пропускает этап» до следующего чекпоинта
                    const tries = typeof BOT_SKIP_AFTER !== 'undefined' ? BOT_SKIP_AFTER : 5;
                    b.fails = b.lastCp === b.cpRi ? (b.fails || 0) + 1 : 1;
                    b.lastCp = b.cpRi;
                    if (b.fails >= tries) {
                        const next = this.cpRoute.find(ci => ci > b.cpRi);
                        b.fails = 0;
                        if (next != null) { b.cpRi = next; b.lastCp = next; }
                    }
                    this._place(b, b.cpRi);
                }
            } else if (b.state === 'finish') {
                b.cheerT -= dt;
                B.step(dt, { throttle: 0, steer: 0, jump: false }, 60);
                if (b.cheerT <= 0) this._rejoin(b);
            }
            if (b.invT > 0) {
                b.invT -= dt;
                b.view.setAlpha(b.invT > 0 ? (Math.floor(b.invT * 8) % 2 ? 0.35 : 0.85) : 1);
            }
            if (playerRiding && b.state === 'ride') this._touchPlayer(b);
            this._pose(b, dt);
            this._tag(b, Math.sqrt(d2));
        }
        if (playerRiding) this._touchBots();
    },

    // Автопилот: руль на точку впереди, скорость по точке маршрута и умению, прыжок у точек отрыва.
    _drive(b, dt, hz) {
        const R = this.route, B = b.car;
        if (b.waitT > 0) { b.waitT -= dt; B.step(dt, { throttle: 0, steer: 0, jump: false }, hz); return; }
        const d2 = (i) => (R[i].x - B.p[0]) ** 2 + (R[i].z - B.p[2]) ** 2;
        const ri0 = b.ri;
        while (b.ri < R.length - 1 && (d2(b.ri + 1) < d2(b.ri) || d2(b.ri) < 160 * 160)) b.ri++;
        if (b.ri !== ri0) { b.bestD = Infinity; b.stuckT = 0; }
        // чекпоинт бота — последняя пройденная привязанная точка
        for (const ci of this.cpRoute) if (ci <= b.ri && ci > b.cpRi) b.cpRi = ci;
        if (b.ri >= R.length - 2 && d2(R.length - 1) < 600 * 600) {
            b.state = 'finish'; b.cheerT = 3.5;
            return;
        }
        const dn = Math.sqrt(d2(Math.min(R.length - 1, b.ri + 1)));
        if (dn < b.bestD - 60) { b.bestD = dn; b.stuckT = 0; } else b.stuckT += dt;
        if (b.stuckT > 4 || (B.u[1] < 0.3 && B.groundTime === 0 && B.airTime > 3)) { b.bestD = Infinity; this._place(b, b.cpRi); return; }
        let ti = b.ri;
        const look = 300 + Math.max(0, B.vf) * 0.22;
        while (ti < R.length - 1 && d2(ti) < look * look) ti++;
        let T = R[ti];
        // на движущейся/вращающейся опоре перед прыжком — цель с поправкой на её скорость (снесёт в полёте)
        const vg = B.grounded && B.wheels.some(w => w.contact && w.col && w.col.dynamic) ? B._groundVel() : null;
        const jk = R.slice(b.ri, b.ri + 3).findIndex(q => q.f === 2);
        if (vg && jk >= 0) {
            const L = R[Math.min(R.length - 1, b.ri + jk + 1)], air = 0.8;
            T = { x: L.x - vg[0] * air, z: L.z - vg[2] * air, y: L.y, s: R[ti].s, f: 1, yaw: 0 };
        } else if (vg) {
            // едем по диску/плите: опора уносит — целимся с упреждением на время до точки
            const tt = Math.hypot(T.x - B.p[0], T.z - B.p[2]) / Math.max(400, Math.abs(B.vf));
            T = { x: T.x - vg[0] * tt, z: T.z - vg[2] * tt, y: T.y, s: Math.max(R[ti].s, 0.85), f: 1, yaw: 0 };
        }
        b.aim = T;
        // руль: на цель от передней оси (машина поворачивает передними колёсами)
        const fx0 = Math.cos(B.yaw), fz0 = Math.sin(B.yaw);
        const want = Math.atan2(T.z - (B.p[2] + fz0 * 135), T.x - (B.p[0] + fx0 * 135));
        let a = want - B.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > 1.6) b.turnT += dt; else b.turnT = 0;
        if (b.turnT > 2.2) { this._place(b, b.cpRi); return; }   // цель позади — не кружить на месте
        b.noise += dt * 0.7;
        const wobble = Math.sin(b.noise * 2.3) * (1 - b.skill) * 0.2;
        // гасим рысканье, чтобы не раскачиваться
        const yawRate = B.w[1] * -1;
        const steer = Math.max(-1, Math.min(1, a * 2.4 + wobble - yawRate * 0.12));
        const vmax = typeof CAR_MAX_SPEED !== 'undefined' ? CAR_MAX_SPEED : 2600;
        const onMove = B.grounded && B.wheels.some(w => w.contact && w.col && w.col.dynamic);
        const target = Math.max(450, vmax * (onMove ? 0.6 : Math.min(R[b.ri].s, R[ti].s + 0.15)) * (0.72 + 0.28 * b.skill));
        // скорость под прыжок: долететь от точки отрыва до точки приземления, а не перелететь островок
        const g = typeof CAR_GRAVITY !== 'undefined' ? CAR_GRAVITY : 3200, vj = typeof CAR_JUMP_SPEED !== 'undefined' ? CAR_JUMP_SPEED : 1300;
        let tgt = target;
        for (let k = Math.max(0, b.ri - 1); k <= Math.min(R.length - 2, b.ri + 4); k++) {
            if (R[k].f !== 2 || b.jumpedAt === k) continue;
            const wantV = this._jumpSpeed(R[k], R[k + 1]);
            tgt = Math.min(Math.max(tgt, wantV * 0.95), wantV * (0.98 + 0.06 * Math.sin(b.noise + k)));
            break;
        }
        // поворот впереди: чем круче, тем медленнее (иначе вынесет с дорожки)
        {
            let turn = 0, prevYaw = B.yaw, dist = 0, prev = { x: B.p[0], z: B.p[2] };
            const span = 500 + Math.max(0, B.vf) * 0.45;
            for (let k = b.ri; k < Math.min(R.length - 1, b.ri + 10) && dist < span; k++) {
                const q = R[k + 1], y = Math.atan2(q.z - R[k].z, q.x - R[k].x);
                dist += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q;
                let dy = y - prevYaw; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)));
                turn = Math.max(turn, dy);
            }
            const vc = vmax * Math.max(0.2, Math.min(1, 1.05 - turn / 1.6));
            tgt = Math.min(tgt, vc);
        }
        let throttle = B.vf < tgt - 150 ? 1 : (B.vf > tgt + 200 ? -0.8 : Math.max(0.15, Math.min(1, tgt / vmax)));
        if (Math.abs(a) > 0.9) throttle = Math.min(throttle, 0.3);
        b.hzT = (b.hzT || 0) - dt;
        const zone = (this.zones || []).find(z => z.i1 >= b.ri && z.i0 - b.ri <= 4);
        const inZone = zone && b.ri >= zone.i0;
        if (inZone) throttle = 1;                                   // в зоне балки — проскочить быстрее
        if (b.hzT <= 0) {
            b.hzT = 0.08;
            const near = zone && !inZone && d2(Math.max(0, zone.i0 - 1)) < 600 * 600;
            b.hzWait = !b.reckless && ((near && !this._zoneClear(b, zone)) || (!zone && this._hazardAhead(b)));
        }
        if (b.hzWait) {
            b.waited = (b.waited || 0) + dt;
            if (b.waited > 6) { b.reckless = true; b.recklessT = 2; }   // устал ждать — рискнёт
            throttle = B.vf > 150 ? -0.9 : 0; b.bestD = Infinity; b.stuckT = 0;
        } else b.waited = 0;
        if (b.recklessT > 0) { b.recklessT -= dt; if (b.recklessT <= 0) b.reckless = b.rash; }
        // разгон не удался (ждали препятствие, сели на паром медленно): тормозим до края, сдаём назад и разгоняемся снова
        if (b.backT > 0) {
            b.backT -= dt; b.stuckT = 0; b.bestD = Infinity;
            // сдаём назад только пока сзади есть плита: иначе трак (длиннее и тяжелее) уезжает с края задом
            const bx = Math.cos(B.yaw), bz = Math.sin(B.yaw);
            const behind = Course.rayDown(B.p[0] - bx * 420, B.p[1] + 160, B.p[2] - bz * 420, 420);
            if (!behind && B.vf < 200) { b.backT = 0; B.step(dt, { throttle: 0.3, steer: 0, jump: false }, hz); return; }
            B.step(dt, { throttle: B.vf > 60 ? -1 : -0.8, steer: -Math.max(-1, Math.min(1, a * 1.5)), jump: false }, hz);
            return;
        }
        // прыжок у точки отрыва (с ошибкой по умению); и как у человека — прыгнуть, если впереди обрыв
        let jump = false, ferryWait = false;
        for (let k = Math.max(0, b.ri - 2); k <= Math.min(R.length - 1, b.ri + 2); k++) {
            if (R[k].f !== 2 || b.jumpedAt === k) continue;
            const err = (1 - b.skill) * 60 * Math.sin(b.noise * 3.1 + k);
            const q = R[k], fx = Math.cos(B.yaw), fz = Math.sin(B.yaw);
            const ahead = (q.x - B.p[0]) * fx + (q.z - B.p[2]) * fz;          // >0 — точка ещё впереди
            let lead = 50 + Math.max(0, B.vf) * 0.035 + err;                    // прыгать чуть раньше края
            if (B.vf < 150 && b.stuckT > 0.5) lead += 220;                       // упёрлись бампером до точки (ступень) — прыгаем отсюда
            // слишком медленно для этого прыжка (и опора не уносит) — не прыгать: сдать назад и разогнаться
            if (!vg && B.contacts === 4 && Math.abs(B.pitch) < 0.08 && B.padBoost <= 0 && k + 1 < R.length && ahead > 40 && ahead < 420 && d2(k) < 600 * 600) {
                const need = this._jumpSpeed(R[k], R[k + 1]);
                if (b.backFor !== k) { b.backFor = k; b.backN = 0; }
                if (B.vf < Math.min(need * 0.78, 1150) && b.backN < 2) { b.backN++; b.backT = Math.min(1.6, 0.5 + (need - Math.max(0, B.vf)) / 1400); b.alignBrake = 0; break; }
            }
            if (d2(k) < 400 * 400 && ahead < lead && (B.contacts >= 2 || B.coyote > 0)) {
                // с парома, который несёт вбок быстро, не прыгаем — ждём, пока он замедлится у края хода
                if (vg && Math.hypot(vg[0], vg[2]) > 330 && ahead > -60) { ferryWait = true; break; }
                // прыгаем, только глядя на точку приземления; не довернул — тормозим у края и доворачиваем
                const L = b.aim && vg ? b.aim : (R[k + 1] || q), ly = Math.atan2(L.z - B.p[2], L.x - B.p[0]);
                let off = ly - B.yaw; off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
                const moving = !!vg;                                           // диск/движущаяся плита: стоять нельзя — снесёт
                if (off < (moving ? 0.5 : 0.25 + (1 - b.skill) * 0.12) || (moving && ahead < -40)) { jump = true; b.jumpedAt = k; }
                else if (!moving) b.alignBrake = 0.3;
                break;
            }
        }
        if (!jump && B.grounded && b.skill > 0.7 && Math.abs(a) < 0.25 && !R.slice(b.ri, b.ri + 3).some(q => q.f === 2)) {
            const fx = Math.cos(B.yaw), fz = Math.sin(B.yaw), ahead = 260 + Math.max(0, B.vf) * 0.15;
            const hit = Course.rayDown(B.p[0] + fx * ahead, B.p[1] + 140, B.p[2] + fz * ahead, 500);
            const nxt = R[Math.min(R.length - 1, b.ri + 1)];
            if (!hit && nxt.y > B.p[1] - 300) jump = true;
        }
        if (b.alignBrake > 0) { b.alignBrake -= dt; throttle = B.vf > 250 ? -1 : 0.25; }
        if (ferryWait) { throttle = B.vf > 80 ? -1 : 0; b.stuckT = 0; b.bestD = Infinity; }
        B.step(dt, { throttle, steer, jump }, hz);
    },

    /** Скорость, с которой прыжок из точки q долетает до точки приземления l (по баллистике прыжка). */
    _jumpSpeed(q, l) {
        const g = typeof CAR_GRAVITY !== 'undefined' ? CAR_GRAVITY : 3200, vj = typeof CAR_JUMP_SPEED !== 'undefined' ? CAR_JUMP_SPEED : 1300;
        const vmax = typeof CAR_MAX_SPEED !== 'undefined' ? CAR_MAX_SPEED : 2600;
        const L = Math.hypot(l.x - q.x, l.z - q.z), dh = l.y - q.y;
        const disc = vj * vj - 2 * g * Math.max(0, dh);
        const air = (vj + Math.sqrt(Math.max(0, disc))) / g;          // время полёта до высоты приземления
        return Math.max(500, Math.min(vmax, (L + 120) / Math.max(0.3, air)));
    },

    _die(b, reason) {
        if (b.state !== 'ride') return;
        b.state = 'dead';
        b.deadT = 1.3 + Math.random() * 0.8;
        if (reason !== 'fall' && reason !== 'stuck') b.view.launchDriver(b.car, b.kick);
        b.kick = null;
    },

    // Две машины как пары кругов (перед и зад): самое глубокое пересечение — нормаль и глубина.
    _overlap(A, B) {
        let best = null;
        const pts = (C) => { const fx = Math.cos(C.yaw), fz = Math.sin(C.yaw); return [[C.c[0] + fx * 120, C.c[2] + fz * 120], [C.c[0] - fx * 120, C.c[2] - fz * 120], [C.c[0], C.c[2]]]; };
        const pa = pts(A), pb = pts(B), r = 108;
        for (const a of pa) for (const q of pb) {
            const dx = q[0] - a[0], dz = q[1] - a[1], d = Math.hypot(dx, dz);
            if (d >= r * 2 || d < 1e-3) continue;
            const depth = r * 2 - d;
            if (!best || depth > best.depth) best = { nx: dx / d, nz: dz / d, depth };
        }
        return best;
    },

    // Удар машин: импульс по нормали (массы равны), раздвинуть; быстрый таран — бота закручивает и отбрасывает.
    _bump(A, B, knockB) {
        if (Math.abs(A.c[1] - B.c[1]) > 160) return null;
        const o = this._overlap(A, B);
        if (!o) return null;
        const { nx, nz, depth } = o;
        const rel = (A.v[0] - B.v[0]) * nx + (A.v[2] - B.v[2]) * nz;   // >0 — сближаются
        const push = depth * 0.5;
        A.c[0] -= nx * push; A.c[2] -= nz * push; B.c[0] += nx * push; B.c[2] += nz * push;
        A.p[0] -= nx * push; A.p[2] -= nz * push; B.p[0] += nx * push; B.p[2] += nz * push;
        if (rel > 0) {
            const j = rel * 0.6;
            A.v[0] -= nx * j; A.v[2] -= nz * j; B.v[0] += nx * j; B.v[2] += nz * j;
            // боковой удар закручивает
            const side = (nx * Math.sin(B.yaw) - nz * Math.cos(B.yaw));
            B.w[1] += side * Math.min(6, rel / 400) * (knockB ? 1.6 : 0.6);
            A.w[1] -= side * Math.min(3, rel / 800);
        }
        return { rel, nx, nz };
    },

    // Игрок толкает бота: быстрее BOT_KNOCK_SPEED — бот подлетает и крутится (может перевернуться).
    _touchPlayer(b) {
        const B = b.car, P = Car;
        const hit = this._bump(P, B, !(b.invT > 0));
        if (!hit) return;
        // удар: звук металла и искры в точке контакта (не чаще раза в 0.25 с на бота)
        if (hit.rel > 140 && (b.bumpT || 0) <= Course.time) {
            b.bumpT = Course.time + 0.25;
            const pt = [(P.c[0] + B.c[0]) / 2, Math.max(P.p[1], B.p[1]) + 60, (P.c[2] + B.c[2]) / 2];
            if (this.on.bump) this.on.bump(b, hit.rel, pt);
        }
        const knock = typeof BOT_KNOCK_SPEED !== 'undefined' ? BOT_KNOCK_SPEED : 700;
        if (hit.rel > knock && !(b.invT > 0) && (b.knockT || 0) <= Course.time) {
            b.knockT = Course.time + 1;
            B.v[0] += hit.nx * hit.rel * 0.5; B.v[2] += hit.nz * hit.rel * 0.5; B.v[1] += 700;
            B.w[0] += B.f[0] * (Math.random() - 0.5) * 6; B.w[2] += B.f[2] * (Math.random() - 0.5) * 6;
            B.stun = 0.8;
            b.kick = [hit.nx * hit.rel * 0.4, 0, hit.nz * hit.rel * 0.4];
            if (this.on.knock) this.on.knock(b);
        }
    },

    // Боты толкаются между собой (без таранов).
    _touchBots() {
        const L = this.list;
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
            const a = L[i], b = L[j];
            if (a.state !== 'ride' || b.state !== 'ride') continue;
            if (Math.abs(a.car.p[0] - b.car.p[0]) > 600 || Math.abs(a.car.p[2] - b.car.p[2]) > 600) continue;
            this._bump(a.car, b.car, false);
        }
    },
    /** @type {Record<string, (...a: any[]) => void>} */
    on: {},

    // Вид: машина и водитель по физике.
    _pose(b, dt) {
        if (!b.view) return;
        b.view.pose(b.car, dt, { menu: false });
        b.view.effects(b.car, dt, { bot: true, on: b.state === 'ride' });
    },

    /** После Rig.updateAll: ладони на руле, ступни на педалях. */
    ik() {
        for (const b of this.list) {
            if (b.state === 'dead' || !b.view || !b.view.car || !b.view.car.root.isEnabled()) continue;
            b.view.ik();
        }
    },

    _tag(b, dist) {
        const tag = b.tag, view = this.app.location.view;
        if (!tag) return;
        if (typeof Game !== 'undefined' && Game.state !== 'ride' && Game.state !== 'dead') { tag.classList.add('off'); return; }   // в меню — без табличек
        const B = b.car, fl = b.view.flying;
        const s = b.state === 'dead' && fl ? { x: fl.p[0], y: fl.p[2], h: fl.p[1] + 160 } : { x: B.p[0], y: B.p[2], h: B.p[1] + 230 };
        const pr = dist < 7000 ? view.projectToScreen(s.x, s.y, s.h) : null;
        if (!pr || !pr.visible || pr.behind) { tag.classList.add('off'); return; }
        tag.classList.remove('off');
        const k = Math.max(0.55, Math.min(1.15, 1300 / Math.max(400, dist)));
        tag.style.transform = `translate(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
    },
};
