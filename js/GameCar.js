// GameCar.js — физика монстр-трака: «лучевая» машина на четырёх огромных колёсах с мягкой подвеской (raycast vehicle).
// Тело — твёрдое тело с полным поворотом (кватернион) и угловой скоростью: крен, тангаж и рысканье
// получаются сами из сил подвески и шин. Каждое колесо ищет опору лучом вдоль «низа» машины
// (Course.ray), пружина-демпфер давит вдоль оси подвески, стабилизаторы гасят крен. Шины — импульсы в
// пятне контакта: продольная сила (газ полным приводом, тормоз, накат, удержание на месте) и боковая
// (гасит занос), обе в пределах круга трения μ·N — на скорости и на льду машину сносит. Прижимная сила
// растёт со скоростью. В полёте — лёгкое управление (руль поворачивает, газ/тормоз — нос), машина
// выравнивается к горизонту. Кузов и колёса — сферы против стен, столбов, молотов и балок; маленькую
// ступень колесо переезжает, ступень повыше машина «запрыгивает» сама, если жать газ (аркада).
// Состояние — в координатах Babylon (x, y вверх, z); числа — константы CAR_* (Constants.js).
// Монстр-физика (RESKIN): геометрия у каждого трака своя — radius колеса, колея, база, высота центра масс и
// сферы кузова берутся из метаданных модели (setGeom(CAR_MODELS[id])); подвеска мягкая с большим ходом, колесо
// переезжает невысокие преграды по радиусу, прыжок выше. Тюнинг игрока (tune.susp / motor / armor, 0..5) —
// множители прыжка, скорости и (в Game) потери скорости при таране. Трюки: за полёт копится поворот
// вокруг оси «вправо» (сальто) и «вперёд» (бочка); в воздухе при зажатом «прыжке» (input.trick) стик
// вращает трак; чистая посадка на колёса даёт on.trick({ flips, rolls, air }).
// Разрушаемые препятствия (col.brk): колесо или кузов, задевшие их, зовут on.ram(...) — решает Game.

const CAR_HALF_BASE = 135;      // px: от середины до оси колеса (запасное значение, если в метаданных модели нет базы)
const CAR_HALF_TRACK = 80;      // px: от оси машины до центра колеса (запасное значение)
const CAR_WHEEL_R = 36;         // px: радиус колеса «обычной» машины — опорный для масштаба (у траков 60–75, из метаданных)
const CAR_COM_H = 55;           // px: центр масс над землёй в покое у обычной машины (у трака — выше, setGeom)
const CAR_INERTIA_ROLL = 9000;  // px²: момент инерции (на единицу массы) — крен, вокруг оси «вперёд»
const CAR_INERTIA_YAW = 26000;  // px²: рысканье, вокруг оси «вверх»
const CAR_INERTIA_PITCH = 24000; // px²: тангаж, вокруг оси «вправо»
const CAR_FORCE_H = 0.55;       // доля высоты центра масс, на которой действуют силы шин (меньше крен и опрокидывание)
const CAR_DRIVE_FRONT = 0.4;    // доля тяги на передние колёса (полный привод)

/**
 * Геометрия физики одного трака из метаданных модели (CAR_MODELS, метры Blender -> px). Запасные числа — «обычная»
 * машина с колесом 36 px. Сферы кузова: [вперёд, вверх над землёй, вправо, радиус] (px, в покое) — днище высоко над
 * землёй (под ним проходят колёса), свесы — повыше (угол въезда на трамплин).
 */
function carGeometry(meta) {
    const m = meta || {};
    const R = Math.max(30, Math.min(110, (Number(m.wheelRadius) || CAR_WHEEL_R / 100) * 100));
    const s = R / CAR_WHEEL_R;
    const len = Math.max(300, Math.min(520, (Number(m.length) || 4.4) * 100));
    const wid = Math.max(170, Math.min(230, (Number(m.width) || 1.95) * 100));
    const hgt = Math.max(110, Math.min(330, (Number(m.height) || 1.5) * 100));
    const tire = (Number(m.tireWidth) || 0.26) * 100;
    const halfBase = Math.max(110, Math.min(170, (Number(m.wheelBase) || 0) * 50 || CAR_HALF_BASE));
    const halfTrack = Math.max(60, Math.min(110, (Number(m.track) || 0) * 50 || (wid / 2 - tire / 2 - 4)));
    const comH = CAR_COM_H + (R - CAR_WHEEL_R) * 1.3;
    const bottom = Math.max(46, R * 1.25);           // днище кузова над землёй
    const r = 44, ex = Math.max(60, len / 2 - r * 0.8), ez = Math.max(24, wid / 2 - r * 0.9);
    const lo = bottom + r, hi = Math.max(lo + 20, hgt * 0.78);
    const spheres = [
        [-ex, lo + 14, -ez, r], [-ex * 0.35, lo, -ez, r + 4], [ex * 0.35, lo, -ez, r + 4], [ex, lo + 14, -ez, r],
        [-ex, lo + 14, ez, r], [-ex * 0.35, lo, ez, r + 4], [ex * 0.35, lo, ez, r + 4], [ex, lo + 14, ez, r],
        [-ex * 0.2, hi, 0, r + 2], [ex * 0.25, hi, 0, r + 2],
    ];
    const travel = typeof CAR_SUSP_TRAVEL !== 'undefined' ? CAR_SUSP_TRAVEL : 22;
    return {
        R, s, halfBase, halfTrack, comH, spheres,
        suspRest: Math.max(30, travel + 14),
        inertia: 0.5 + 0.5 * s * s,
        mountY: 0,
    };
}

/** Поворот вектора (x, y, z) кватернионом q = [x, y, z, w] (v' = q v q*). */
function carRot(q, x, y, z, out) {
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    out[0] = x + qw * tx + (qy * tz - qz * ty);
    out[1] = y + qw * ty + (qz * tx - qx * tz);
    out[2] = z + qw * tz + (qx * ty - qy * tx);
    return out;
}

/** Новая машина со своим состоянием (игрок и боты едут на одной физике). */
function createCar() {
    const G0 = carGeometry(null);
    const wheel = (fx, sz, front) => ({
        fx, sz, front, contact: false, comp: 0, prevComp: 0, susp: G0.suspRest, load: 0,
        n: [0, 1, 0], /** @type {any} */ col: null, q: [0, 0, 0], spin: 0, rate: 0, slip: 0, gy: 0,
    });
    return {
    /** Геометрия трака (carGeometry): радиус колеса, колея, высота центра масс, сферы кузова. */
    G: G0,
    /** Тюнинг игрока (уровни 0..5): подвеска (прыжок), мотор (скорость), броня (потеря скорости при таране — в Game). */
    tune: { susp: 0, motor: 0, armor: 0 },
    /** Игрок вращает трак в воздухе (зажатый «прыжок»): включает управление трюками. */
    trickCtl: false,
    trk: { pitch: 0, roll: 0, on: false, active: 0 },
    /** @type {any} */ trickPending: null,
    surge: 0, trickRel: false, ramCool: 0,
    // p — начало модели (земля посередине между осями в покое), c — центр масс; q — поворот, w — угловая скорость (мир)
    p: [0, 0, 0], c: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],
    f: [1, 0, 0], u: [0, 1, 0], r: [0, 0, 1],
    yaw: 0, pitch: 0, roll: 0, steer: 0, vf: 0, rpm: 0, gear: 1, throttle: 0, braking: false,
    wheels: [wheel(-G0.halfBase, -G0.halfTrack, false), wheel(-G0.halfBase, G0.halfTrack, false),
        wheel(G0.halfBase, -G0.halfTrack, true), wheel(G0.halfBase, G0.halfTrack, true)],   // RL, RR, FL, FR
    contacts: 0, grounded: false, airTime: 0, groundTime: 0, coyote: 0, jumpBuf: 0, jumpLock: 0,
    lastGroundY: 0, landSpeed: 0, slip: 0, flipT: 0, sideT: 0, stuckT: 0, bodyTouch: false,
    boost: 0, padBoost: 0, stun: 0, hitCool: 0, bonkCool: 0, climbCool: 0, visLift: 0,
    ice: false, dead: false, deadReason: '', frozen: false, isBot: false,
    /** @type {number[] | null} */ _lastN: null,
    _a: [0, 0, 0], _b: [0, 0, 0],
    /** @type {Record<string, (...a: any[]) => void>} */
    on: {},

    cfg() {
        const U = 'undefined';
        return {
            g: typeof CAR_GRAVITY !== U ? CAR_GRAVITY : 3200,
            vmax: typeof CAR_MAX_SPEED !== U ? CAR_MAX_SPEED : 2600,
            accel: typeof CAR_ACCEL !== U ? CAR_ACCEL : 1900,
            brake: typeof CAR_BRAKE !== U ? CAR_BRAKE : 4200,
            rev: typeof CAR_REVERSE_SPEED !== U ? CAR_REVERSE_SPEED : 700,
            coast: typeof CAR_COAST_DECEL !== U ? CAR_COAST_DECEL : 280,
            drag: typeof CAR_AIR_DRAG !== U ? CAR_AIR_DRAG : 0.1,
            jump: typeof CAR_JUMP_SPEED !== U ? CAR_JUMP_SPEED : 1300,
            steerLow: (typeof CAR_STEER_LOW_DEG !== U ? CAR_STEER_LOW_DEG : 34) * Math.PI / 180,
            steerHigh: (typeof CAR_STEER_HIGH_DEG !== U ? CAR_STEER_HIGH_DEG : 8) * Math.PI / 180,
            steerResp: typeof CAR_STEER_RESPONSE !== U ? CAR_STEER_RESPONSE : 8,
            mu: typeof CAR_GRIP !== U ? CAR_GRIP : 1.55,
            iceMu: typeof CAR_ICE_GRIP !== U ? CAR_ICE_GRIP : 0.22,
            latStiff: typeof CAR_LATERAL_STIFF !== U ? CAR_LATERAL_STIFF : 0.85,
            downforce: typeof CAR_DOWNFORCE !== U ? CAR_DOWNFORCE : 0.00012,
            sag: typeof CAR_SUSP_SAG !== U ? CAR_SUSP_SAG : 11,
            damp: typeof CAR_SUSP_DAMP !== U ? CAR_SUSP_DAMP : 0.55,
            travel: typeof CAR_SUSP_TRAVEL !== U ? CAR_SUSP_TRAVEL : 22,
            droop: typeof CAR_SUSP_DROOP !== U ? CAR_SUSP_DROOP : 14,
            antiroll: typeof CAR_ANTIROLL !== U ? CAR_ANTIROLL : 0.6,
            step: typeof CAR_STEP_UP !== U ? CAR_STEP_UP : 30,
            climbMax: typeof CAR_CLIMB_MAX !== U ? CAR_CLIMB_MAX : 80,
            airYaw: typeof CAR_AIR_YAW !== U ? CAR_AIR_YAW : 2.2,
            airPitch: typeof CAR_AIR_PITCH !== U ? CAR_AIR_PITCH : 2.5,
            airLevel: typeof CAR_AIR_LEVEL !== U ? CAR_AIR_LEVEL : 7,
            upright: typeof CAR_UPRIGHT !== U ? CAR_UPRIGHT : 9,
            coyote: typeof CAR_COYOTE_SEC !== U ? CAR_COYOTE_SEC : 0.12,
            buffer: typeof CAR_JUMP_BUFFER_SEC !== U ? CAR_JUMP_BUFFER_SEC : 0.16,
            boostSpeed: typeof CAR_BOOST_SPEED !== U ? CAR_BOOST_SPEED : 3600,
            fallDepth: typeof CAR_FALL_DEPTH !== U ? CAR_FALL_DEPTH : 900,
            knock: typeof CAR_KNOCKBACK !== U ? CAR_KNOCKBACK : 1300,
            trickPitch: typeof CAR_TRICK_PITCH !== U ? CAR_TRICK_PITCH : 5.4,
            trickRoll: typeof CAR_TRICK_ROLL !== U ? CAR_TRICK_ROLL : 5.8,
        };
    },

    /** Геометрия по метаданным модели (CAR_MODELS[id]): зовут вид машины (CarView.setCar) и боты. */
    setGeom(meta) {
        const G = this.G = carGeometry(meta);
        const [a, b, c, d] = this.wheels;
        a.fx = b.fx = -G.halfBase; c.fx = d.fx = G.halfBase;
        a.sz = c.sz = -G.halfTrack; b.sz = d.sz = G.halfTrack;
        for (const w of this.wheels) w.susp = G.suspRest;
        this.c[1] = this.p[1] + G.comH;
    },

    /** Множители тюнинга: 0..5 уровней -> прыжок, скорость, разгон. */
    tuneK() {
        const t = this.tune || { susp: 0, motor: 0, armor: 0 };
        const U = 'undefined';
        const j = typeof TUNE_JUMP_STEP !== U ? TUNE_JUMP_STEP : 0.07, v = typeof TUNE_SPEED_STEP !== U ? TUNE_SPEED_STEP : 0.04, a = typeof TUNE_ACCEL_STEP !== U ? TUNE_ACCEL_STEP : 0.06;
        return { jump: 1 + j * (t.susp | 0), speed: 1 + v * (t.motor | 0), accel: 1 + a * (t.motor | 0) };
    },

    /** Поставить машину на точку (x, h, z) с курсом yaw (рад, курс карты) — старт и чекпоинт. */
    reset(x, h, z, yaw) {
        this.yaw = yaw || 0;
        const half = -this.yaw / 2;
        this.q = [0, Math.sin(half), 0, Math.cos(half)];
        this._axes();
        this.p = [x, h + 1, z];
        this.c = [x, h + 1 + this.G.comH, z];
        this.v = [0, 0, 0]; this.w = [0, 0, 0];
        this.pitch = 0; this.roll = 0; this.steer = 0; this.vf = 0; this.rpm = 0; this.gear = 1; this.throttle = 0; this.braking = false;
        const c = this.cfg();
        for (const w of this.wheels) { w.contact = false; w.comp = w.prevComp = c.sag; w.susp = this.G.suspRest; w.load = 0; w.col = null; w.rate = 0; w.slip = 0; w.gy = h; }
        this.contacts = 0; this.grounded = false; this.airTime = 0; this.groundTime = 0; this.coyote = 0; this.jumpBuf = 0; this.jumpLock = 0;
        this.lastGroundY = h; this.stun = 0; this.hitCool = 0; this.padBoost = 0; this.dead = false; this.deadReason = ''; this.ice = false;
        this.slip = 0; this.flipT = 0; this.sideT = 0; this.stuckT = 0; this.visLift = 0; this.bodyTouch = false; this._lastN = null;
        this.trk.pitch = this.trk.roll = 0; this.trk.on = false; this.trk.active = 0; this.trickPending = null; this.surge = 0; this.trickRel = false; this.ramCool = 0;
    },

    _axes() {
        carRot(this.q, 1, 0, 0, this.f);
        carRot(this.q, 0, 1, 0, this.u);
        carRot(this.q, 0, 0, 1, this.r);
    },

    /** Точка машины (вперёд, вверх над землёй в покое, вправо) -> мир. */
    point(fx, uy, rz, out) {
        const f = this.f, u = this.u, r = this.r, C = this.c, uu = uy - this.G.comH;
        out = out || [0, 0, 0];
        out[0] = C[0] + f[0] * fx + u[0] * uu + r[0] * rz;
        out[1] = C[1] + f[1] * fx + u[1] * uu + r[1] * rz;
        out[2] = C[2] + f[2] * fx + u[2] * uu + r[2] * rz;
        return out;
    },

    // Обратный момент инерции в мировых осях, применённый к вектору t (результат — в out).
    _iinv(tx, ty, tz, out) {
        const f = this.f, u = this.u, r = this.r;
        const k = this.G.inertia;
        const a = (tx * f[0] + ty * f[1] + tz * f[2]) / (CAR_INERTIA_ROLL * k);
        const b = (tx * u[0] + ty * u[1] + tz * u[2]) / (CAR_INERTIA_YAW * k);
        const d = (tx * r[0] + ty * r[1] + tz * r[2]) / (CAR_INERTIA_PITCH * k);
        out[0] = f[0] * a + u[0] * b + r[0] * d;
        out[1] = f[1] * a + u[1] * b + r[1] * d;
        out[2] = f[2] * a + u[2] * b + r[2] * d;
        return out;
    },

    /** Импульс J (на единицу массы) в точке P мира: меняет скорость и вращение. */
    _impulse(P, jx, jy, jz) {
        const C = this.c, rx = P[0] - C[0], ry = P[1] - C[1], rz = P[2] - C[2];
        this.v[0] += jx; this.v[1] += jy; this.v[2] += jz;
        const t = this._iinv(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, this._a);
        this.w[0] += t[0]; this.w[1] += t[1]; this.w[2] += t[2];
    },

    /** Скорость точки P мира (поступательная + вращение). */
    _velAt(P, out) {
        const C = this.c, w = this.w, rx = P[0] - C[0], ry = P[1] - C[1], rz = P[2] - C[2];
        out[0] = this.v[0] + w[1] * rz - w[2] * ry;
        out[1] = this.v[1] + w[2] * rx - w[0] * rz;
        out[2] = this.v[2] + w[0] * ry - w[1] * rx;
        return out;
    },

    /** Обратная «эффективная масса» точки P вдоль единичного направления d. */
    _invMass(P, dx, dy, dz) {
        const C = this.c, rx = P[0] - C[0], ry = P[1] - C[1], rz = P[2] - C[2];
        const cx = ry * dz - rz * dy, cy = rz * dx - rx * dz, cz = rx * dy - ry * dx;
        const t = this._iinv(cx, cy, cz, this._b);
        return 1 + cx * t[0] + cy * t[1] + cz * t[2];
    },

    /** Напрямую из ввода: { throttle -1..1, steer -1..1, jump: нажат в этом кадре }; hz — частота подшагов физики. */
    step(dt, input, hz) {
        if (this.frozen) return;
        if (this.dead) { if (this.deadReason === 'fall') this._ballistic(dt); return; }
        const c = this.cfg();
        const tk = this.tuneK();
        c.jump *= tk.jump; c.vmax *= tk.speed; c.boostSpeed *= tk.speed; c.accel *= tk.accel;
        // трюки: управление вращением — только когда «прыжок» зажат уже ПОСЛЕ отрыва (быстрое нажатие на взлёте не крутит трак)
        this.trickCtl = false;
        if (this.grounded) this.trickRel = false;
        else if (!input.trick) this.trickRel = true;
        if (input.trick && this.trickRel && !this.grounded && !this.isBot) this.trickCtl = true;
        this.surge = Math.max(0, this.surge - dt);
        this.ramCool = Math.max(0, this.ramCool - dt);
        if (input.jump) this.jumpBuf = c.buffer;
        this.jumpBuf = Math.max(0, this.jumpBuf - dt);
        this.jumpLock = Math.max(0, this.jumpLock - dt);
        this.stun = Math.max(0, this.stun - dt);
        this.hitCool = Math.max(0, this.hitCool - dt);
        this.bonkCool = Math.max(0, this.bonkCool - dt);
        this.climbCool = Math.max(0, this.climbCool - dt);
        this.visLift *= Math.exp(-14 * dt);
        this.padBoost = Math.max(0, this.padBoost - dt);
        this.boost = Math.max(0, this.boost - dt);
        const ctl = this.stun > 0 ? 0.25 : 1;
        const thr = Math.max(-1, Math.min(1, input.throttle || 0)) * ctl;
        const str = Math.max(-1, Math.min(1, input.steer || 0)) * (this.stun > 0 ? 0.4 : 1);
        this.throttle = thr;

        // Прыжок «гидравликой»: с колёс или сразу после края (coyote), нажатие чуть раньше — тоже.
        if (this.jumpBuf > 0 && (this.contacts >= 2 || this.coyote > 0) && this.jumpLock <= 0 && this.stun <= 0 && this.u[1] > 0.5) {
            const vg = this._groundVel();
            this.v[1] = Math.max(this.v[1], vg[1]) + c.jump;
            // нос чуть вверх
            this.w[0] += this.r[0] * 0.5; this.w[1] += this.r[1] * 0.5; this.w[2] += this.r[2] * 0.5;
            this.jumpBuf = 0; this.coyote = 0; this.jumpLock = 0.16;
            for (const w of this.wheels) w.contact = false;
            this.grounded = false; this.contacts = 0;
            if (this.on.jump) this.on.jump();
        }

        const n = Math.min(8, Math.max(1, Math.ceil(dt * (hz || 240))));
        const h = dt / n;
        for (let i = 0; i < n; i++) { this._sub(h, c, thr, str); if (this.dead) return; }

        if (this.grounded) { this.coyote = c.coyote; this.airTime = 0; this.groundTime += dt; }
        else { this.coyote = Math.max(0, this.coyote - dt); this.airTime += dt; this.groundTime = 0; }
        this._trickTick(dt);

        // Падение с трассы: ниже последней опоры и под нами пусто.
        if (!this.grounded && this.v[1] < 0) {
            if (this.p[1] < this.lastGroundY - c.fallDepth) {
                const hit = Course.rayDown(this.c[0], this.c[1], this.c[2], 2400, 0.3);
                if (!hit || this.p[1] < this.lastGroundY - 3600) this._die('fall');
            }
            if (this.p[1] < Course.minTop - 2600) this._die('fall');
        }
        // Перевернулась: на крыше — сразу, на боку и почти стоит — через секунду (вернётся на чекпоинт).
        const sp = Math.hypot(this.v[0], this.v[1], this.v[2]);
        if (this.u[1] < -0.25 && (this.bodyTouch || this.contacts > 0 || sp < 250)) this.flipT += dt; else this.flipT = 0;
        if (this.u[1] < 0.45 && this.bodyTouch && sp < 350) this.sideT += dt; else this.sideT = Math.max(0, this.sideT - dt * 2);
        // Повисла на краю или застряла боком в ступени: стоит, жмут газ — через 2.5 с вернём на чекпоинт.
        if (sp < 60 && Math.abs(this.throttle) > 0.3 && (this.contacts < 3 || this.u[1] < 0.8) && this.bodyTouch) this.stuckT += dt; else this.stuckT = 0;
        if (this.flipT > 0.35 || this.sideT > 1.1) this._die('crash');
        else if (this.stuckT > 2.5) this._die('stuck');
    },

    // Трюк засчитывается, когда после посадки трак ещё 0.45 с жив и стоит на колёсах (посадка на крышу — авария, трюка нет).
    _trickTick(dt) {
        const tp = this.trickPending;
        if (!tp) return;
        tp.t -= dt;
        if (!this.grounded && tp.t > 0.2) { /* подскочил после посадки — ждём */ }
        if (this.u[1] < 0.35 && tp.t < 0.35) { this.trickPending = null; return; }
        if (tp.t > 0) return;
        this.trickPending = null;
        if (this.u[1] > 0.55 && !this.dead) {
            this.surge = Math.max(this.surge, typeof TRICK_BOOST_SEC !== 'undefined' ? TRICK_BOOST_SEC : 1.6);
            const f = this.f, add = typeof TRICK_BOOST_KICK !== 'undefined' ? TRICK_BOOST_KICK : 260;
            this.v[0] += f[0] * add; this.v[2] += f[2] * add;
            if (this.on.trick) this.on.trick({ flips: tp.flips, rolls: tp.rolls, back: tp.back, air: tp.air });
        }
    },

    // Итог полёта при касании земли: сколько полных оборотов сделал трак (сальто — вокруг «вправо», бочка — вокруг «вперёд»).
    _trickLand() {
        const T = this.trk;
        const turn = Math.PI * 2, part = typeof TRICK_MIN_TURN !== 'undefined' ? TRICK_MIN_TURN : 0.78;
        const flips = Math.floor(Math.abs(T.pitch) / turn + (1 - part)), rolls = Math.floor(Math.abs(T.roll) / turn + (1 - part));
        const air = this.airTime;
        const res = { flips, rolls, back: T.pitch > 0, air, t: 0.45 };
        T.pitch = 0; T.roll = 0; T.on = false; T.active = 0;
        if ((flips > 0 || rolls > 0) && this.u[1] > 0.35 && air > 0.3) this.trickPending = res;
        else this.trickPending = null;
    },

    _die(reason) {
        if (this.dead) return;
        this.trickPending = null;
        this.dead = true;
        this.deadReason = reason;
        if (this.on.die) this.on.die(reason);
    },

    // Упала с трассы: дальше просто летит вниз и кувыркается (вид, пока игра не вернёт на чекпоинт).
    _ballistic(dt) {
        const v = this.v, C = this.c, W = this.w, q = this.q;
        v[1] -= this.cfg().g * dt;
        C[0] += v[0] * dt; C[1] += v[1] * dt; C[2] += v[2] * dt;
        const qx = q[0], qy = q[1], qz = q[2], qw = q[3], h = dt;
        q[0] += 0.5 * h * (W[0] * qw + W[1] * qz - W[2] * qy);
        q[1] += 0.5 * h * (W[1] * qw + W[2] * qx - W[0] * qz);
        q[2] += 0.5 * h * (W[2] * qw + W[0] * qy - W[1] * qx);
        q[3] += 0.5 * h * (-W[0] * qx - W[1] * qy - W[2] * qz);
        const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
        this._axes();
        this._pose();
    },

    _groundVel() {
        let vx = 0, vy = 0, vz = 0, k = 0;
        for (const w of this.wheels) if (w.contact && w.col && w.col.dynamic) { const pv = Course.pointVel(w.col, w.q); vx += pv[0]; vy += pv[1]; vz += pv[2]; k++; }
        return k ? [vx / k, vy / k, vz / k] : [0, 0, 0];
    },

    _sub(h, c, thr, str) {
        this._axes();
        const f = this.f, u = this.u, r = this.r, v = this.v, C = this.c;
        const G = this.G, R = G.R, SR = G.suspRest;
        const sMax = SR + c.sag;                         // пружина без нагрузки
        const sMin = SR - c.travel;                      // упор отбойника
        const kW = c.g / (4 * c.sag);                    // жёсткость колеса: в покое 4 пружины держат вес
        const cW = 2 * c.damp * Math.sqrt(c.g / c.sag) / 4;
        const mountY = R + SR;                           // крепление над землёй в покое

        // ---- руль: угол по вводу, меньше на скорости; возврат к центру быстрее
        const vfNow = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
        const sp01 = Math.min(1, Math.abs(vfNow) / c.vmax);
        const maxSteer = c.steerLow + (c.steerHigh - c.steerLow) * sp01;
        const want = str * maxSteer;
        const resp = (Math.abs(want) < Math.abs(this.steer) ? 1.6 : 1) * c.steerResp;
        this.steer += (want - this.steer) * Math.min(1, resp * h);

        // ---- подвеска: луч от крепления вдоль -u
        let contacts = 0, ice = false;
        const wasGrounded = this.grounded;
        const M = [0, 0, 0];
        for (const w of this.wheels) {
            this.point(w.fx, mountY, w.sz, M);
            w.prevComp = w.comp;
            let hit = null;
            if (this.jumpLock <= 0 || v[1] < 0) hit = Course.ray(M[0], M[1], M[2], -u[0], -u[1], -u[2], sMax + c.droop + R + 2);
            if (hit && (hit.n[0] * u[0] + hit.n[1] * u[1] + hit.n[2] * u[2]) < 0.35) hit = null;   // стена под колесом — не опора
            // разрушаемое под колесом: игрок давит его (сверху — сплющивает), бот проезжает «призраком»; опорой оно не бывает
            if (hit && hit.col.brk) { if (!this.isBot && hit.col.enabled !== false) this._ram(hit.col, 'top', [M[0] - u[0] * hit.t, M[1] - u[1] * hit.t, M[2] - u[2] * hit.t]); hit = null; }
            if (hit && hit.t - R < sMax + (w.contact ? c.droop : 0)) {
                const s = Math.max(sMin - 6, hit.t - R);
                w.contact = true; w.susp = s; w.comp = sMax - s; w.n = hit.n; w.col = hit.col;
                w.q[0] = M[0] - u[0] * hit.t; w.q[1] = M[1] - u[1] * hit.t; w.q[2] = M[2] - u[2] * hit.t;
                w.gy = w.q[1];
            } else {
                w.contact = false; w.col = null; w.comp = 0;
                w.susp += (sMax - w.susp) * Math.min(1, 18 * h);   // колесо провисает (вид)
            }
            if (w.contact) contacts++;
        }
        // стабилизаторы: разница сжатий слева/справа на оси
        const ar = [0, 0, 0, 0];
        for (const [a, b] of [[0, 1], [2, 3]]) {
            const A = this.wheels[a], B = this.wheels[b];
            if (A.contact && B.contact) { const d = (A.comp - B.comp) * kW * c.antiroll; ar[a] += d; ar[b] -= d; }
        }
        let wi = 0;
        let nx = 0, ny = 0, nz = 0;
        for (const w of this.wheels) {
            const i = wi++;
            if (!w.contact) { w.load = 0; continue; }
            const col = w.col;
            if (col.kill) { this._die('kill'); return; }
            if (col.ice) ice = true;
            if (col.piece && col.piece.prm.role === 'fall' && !this.isBot) Course.touch(col);   // плиты роняет только игрок
            // резкий наезд на излом (въезд на трамплин, край ступени): лишняя скорость «в опору» гасится неупругим
            // импульсом по нормали в пятне — скорость поворачивает вдоль поверхности, пружина не копит удар
            {
                const nn = w.n, vp = this._velAt(w.q, this._b);
                if (col.dynamic) { const pv = Course.pointVel(col, w.q); vp[0] -= pv[0]; vp[1] -= pv[1]; vp[2] -= pv[2]; }
                const vn = vp[0] * nn[0] + vp[1] * nn[1] + vp[2] * nn[2];
                const vcut = 220 + 300 * (G.s - 1);   // у трака подвеска гасит больше удара — «мёртвой» посадки нет
                if (vn < -vcut) { const j = -(vn + vcut) / this._invMass(w.q, nn[0], nn[1], nn[2]); this._impulse(w.q, nn[0] * j, nn[1] * j, nn[2] * j); }
            }
            const cv = (w.comp - w.prevComp) / h;
            let F = kW * w.comp + cW * Math.max(-350, Math.min(350, cv)) + ar[i];   // демпфер ограничен: на изломах не «выстреливает»
            F = Math.max(0, Math.min(F, c.g * 4));
            w.load = F;
            this.point(w.fx, mountY, w.sz, M);
            // пружина давит по нормали опоры (на склоне — перпендикулярно склону, без «торможения» стойкой)
            const sn = w.n;
            this._impulse(M, sn[0] * F * h, sn[1] * F * h, sn[2] * F * h);
            // отбойник: колесо «упёрлось» — гасим скорость в опору в этой точке, выталкиваем по чуть-чуть
            if (w.susp < sMin) {
                const nn = w.n;
                const vp = this._velAt(w.q, this._b);
                const vn = vp[0] * nn[0] + vp[1] * nn[1] + vp[2] * nn[2];
                if (vn < 0) { const j = -vn / this._invMass(w.q, nn[0], nn[1], nn[2]) * 0.9; this._impulse(w.q, nn[0] * j, nn[1] * j, nn[2] * j); }
                const over = Math.min(4, sMin - w.susp);
                C[0] += u[0] * over; C[1] += u[1] * over; C[2] += u[2] * over;
                w.susp += over;
            }
            nx += w.n[0]; ny += w.n[1]; nz += w.n[2];
            if (col.boost && thr >= -0.2) {
                const bx = col.ax[0], bz = col.ax[2], bl = Math.hypot(bx, bz) || 1;
                const along = v[0] * bx / bl + v[2] * bz / bl;
                if (along < col.boost) { const k = Math.min(1, 6 * h) * (col.boost - along); v[0] += bx / bl * k; v[2] += bz / bl * k; }
                this.padBoost = 1.4;
                if (this.on.pad) this.on.pad('boost');
            }
            if (col.jump && this.jumpLock <= 0) {
                v[1] = Math.max(v[1], col.jump);
                this.jumpLock = 0.25;
                for (const x of this.wheels) x.contact = false;
                contacts = 0;
                if (this.on.pad) this.on.pad('jump');
                break;
            }
        }
        // Аркадный трамплин: оторвались от наклонной опоры (не прыжком) — вертикальная скорость как у идеального
        // вылета с этого уклона (v·tgθ по ходу), без «клевка» носом на кромке и без лишнего подброса подвеской.
        if (contacts === 0 && this._lastN && this.jumpLock <= 0) {
            const N = this._lastN, up = -(N[0] * v[0] + N[2] * v[2]) / Math.max(0.5, N[1]);
            if (up > 150) v[1] = Math.max(up * 0.97, Math.min(v[1], up * 1.08 + 120));
            this._lastN = null;
        }
        this.contacts = contacts;
        this.grounded = contacts > 0 && this.jumpLock <= 0;
        this.ice = ice;
        if (this.grounded && !wasGrounded) {
            this.landSpeed = -v[1];
            if (!this.isBot) this._trickLand();
            if (this.on.land) this.on.land(this.landSpeed);
        }

        // ---- прижимная сила: растёт со скоростью (по оси подвески)
        if (this.grounded) {
            const df = c.downforce * vfNow * vfNow;
            v[0] -= u[0] * df * h; v[1] -= u[1] * df * h; v[2] -= u[2] * df * h;
        }

        // ---- шины: продольная и боковая сила в пятне контакта (последовательные импульсы)
        const vmax = this.boost > 0 || this.surge > 0 ? c.boostSpeed : c.vmax;
        const mu = (ice ? c.iceMu : 1) * c.mu;
        let slipSum = 0;
        let braking = false;
        if (this.grounded) {
            const curve = 1 - Math.pow(Math.min(1, Math.abs(vfNow) / vmax), 1.6);
            const driveA = c.accel * (this.boost > 0 || this.surge > 0 ? 1.35 : 1) * Math.max(0.12, curve);
            const PA = [0, 0, 0], vp = [0, 0, 0];
            for (const w of this.wheels) {
                if (!w.contact) continue;
                const nn = w.n;
                // направление колеса: передние повёрнуты рулём; проекция на плоскость опоры
                const st = w.front ? this.steer : 0, cs = Math.cos(st), sn = Math.sin(st);
                let fx = f[0] * cs + r[0] * sn, fy = f[1] * cs + r[1] * sn, fz = f[2] * cs + r[2] * sn;
                const fd = fx * nn[0] + fy * nn[1] + fz * nn[2];
                fx -= nn[0] * fd; fy -= nn[1] * fd; fz -= nn[2] * fd;
                const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
                const sx = fy * nn[2] - fz * nn[1], sy = fz * nn[0] - fx * nn[2], sz = fx * nn[1] - fy * nn[0];   // вправо
                // точка приложения — пятно контакта, поднятое к центру масс (меньше крен)
                const lift = G.comH * CAR_FORCE_H;
                PA[0] = w.q[0] + u[0] * lift; PA[1] = w.q[1] + u[1] * lift; PA[2] = w.q[2] + u[2] * lift;
                this._velAt(w.q, vp);
                if (w.col && w.col.dynamic) { const pv = Course.pointVel(w.col, w.q); vp[0] -= pv[0]; vp[1] -= pv[1]; vp[2] -= pv[2]; }
                const vl = vp[0] * fx + vp[1] * fy + vp[2] * fz;
                const vs = vp[0] * sx + vp[1] * sy + vp[2] * sz;
                const share = (w.front ? CAR_DRIVE_FRONT : 1 - CAR_DRIVE_FRONT) / 2;
                const mL = this._invMass(PA, fx, fy, fz);
                let jl = 0;
                if (thr > 0.05) {
                    if (vl < -40) { jl = Math.min(-vl / mL, c.brake * 0.25 * thr * h); braking = true; }            // ехали назад — тормоз
                    else if (vl < vmax * thr) jl = driveA * thr * share * h;
                } else if (thr < -0.05) {
                    if (vl > 40) { jl = -Math.min(vl / mL, c.brake * 0.25 * -thr * h); braking = true; }              // тормоз
                    else if (vl > -c.rev * -thr) jl = -c.accel * 0.7 * -thr * share * h;                               // назад
                } else {
                    // накат: торможение двигателем, на малой скорости — удержание (стоит на склоне и на плите)
                    if (Math.abs(vl) < 70) jl = -vl / mL * 0.5;
                    else jl = -Math.sign(vl) * Math.min(Math.abs(vl) / mL, c.coast * 0.25 * h);
                }
                if (vl > vmax * 1.02 && this.padBoost <= 0 && thr >= 0) jl = Math.min(jl, -(vl - vmax) * 0.25 * Math.min(1, 3 * h));   // свыше предела — плавно к нему
                // боковое сцепление: погасить боковую скорость пятна (доля latStiff за подшаг)
                const mS = this._invMass(PA, sx, sy, sz);
                let js = -vs / mS * c.latStiff;
                // круг трения
                const cap = mu * Math.max(w.load, c.g * 0.05) * h;
                const tot = Math.hypot(jl, js);
                let slip = 0;
                if (tot > cap) { const k = cap / tot; slip = 1 - k; jl *= k; js *= k; }
                slipSum += slip + Math.min(1, Math.abs(vs) / 900);
                w.slip = Math.max(slip, Math.min(1, Math.abs(vs) / 600));
                this._impulse(PA, fx * jl + sx * js, fy * jl + sy * js, fz * jl + sz * js);
                // вращение колеса (вид): по скорости пятна, пробуксовка на газу с места
                const spinBoost = thr > 0.5 && Math.abs(vl) < 500 && slip > 0.2 ? 18 * thr : 0;
                w.rate = vl / R + spinBoost;
            }
            this.vf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
            // мягкая стабилизация (аркада): машина стремится встать на колёса — «вверх» к нормали опоры
            const nl = Math.hypot(nx, ny, nz) || 1;
            this._upright(c.upright * (contacts < 4 ? 1.6 : 0.3) * h, nx / nl, ny / nl, nz / nl);
            this.lastGroundY = Infinity;
            for (const w of this.wheels) if (w.contact) this.lastGroundY = Math.min(this.lastGroundY, w.gy);
            this._lastN = [nx / nl, ny / nl, nz / nl];
            if (this.trickPending === null) { this.trk.pitch = 0; this.trk.roll = 0; this.trk.on = false; }
        } else {
            // ---- полёт: сопротивление воздуха, руль поворачивает, газ/тормоз — нос, выравнивание к горизонту
            const k = Math.max(0, 1 - c.drag * h);
            v[0] *= k; v[2] *= k;
            this.vf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
            for (const w of this.wheels) { w.rate *= Math.max(0, 1 - 0.6 * h); if (thr > 0.3) w.rate += (thr * 30 - w.rate) * Math.min(1, 3 * h); w.slip = 0; }
            const W = this.w;
            const wr = W[0] * r[0] + W[1] * r[1] + W[2] * r[2], wf = W[0] * f[0] + W[1] * f[1] + W[2] * f[2];
            const T = this.trk;
            if (this.trickCtl) {
                // трюк: стик вращает трак — W/S сальто (нос вниз/вверх), A/D бочка; выравнивания к горизонту нет
                const kk = Math.min(1, 7 * h);
                const dP = (-thr * c.trickPitch - wr) * kk, dR = (str * c.trickRoll - wf) * kk;
                W[0] += r[0] * dP + f[0] * dR; W[1] += r[1] * dP + f[1] * dR; W[2] += r[2] * dP + f[2] * dR;
                T.on = true;
            } else {
                // рысканье вокруг вертикали мира
                const wy = W[1];
                W[1] += (-str * c.airYaw - wy) * Math.min(1, 3 * h);   // +ω по вертикали уменьшает курс: руль вправо — минус
                // тангаж от газа/тормоза вокруг оси «вправо»
                const wantR = -thr * c.airPitch * 0.35;
                const dr = (wantR - wr) * Math.min(1, 1.5 * h) * 0.5;
                W[0] += r[0] * dr; W[1] += r[1] * dr; W[2] += r[2] * dr;
                // начатый оборот (больше трети) трак доводит сам: посадка на колёса, а не на крышу
                const kk = Math.min(1, 5 * h);
                const cp = Math.abs(T.pitch) > 2.3 && Math.abs(T.pitch) < 5.9, cr = Math.abs(T.roll) > 2.3 && Math.abs(T.roll) < 5.9;
                if (cp) { const d = (Math.sign(T.pitch) * 4.4 - wr) * kk; W[0] += r[0] * d; W[1] += r[1] * d; W[2] += r[2] * d; }
                if (cr) { const d = (Math.sign(T.roll) * 4.8 - wf) * kk; W[0] += f[0] * d; W[1] += f[1] * d; W[2] += f[2] * d; }
                if (!cp && !cr) this._upright(c.airLevel * h, 0, 1, 0, true);
            }
            T.pitch += (W[0] * r[0] + W[1] * r[1] + W[2] * r[2]) * h;
            T.roll += (W[0] * f[0] + W[1] * f[1] + W[2] * f[2]) * h;
        }
        this.slip = slipSum / 4;
        this.braking = braking;

        v[1] -= c.g * h;
        // угловая скорость — без «вечного» вращения: лёгкое затухание и предел
        const W = this.w;
        const damp = Math.max(0, 1 - (this.grounded ? 1.2 : 0.4) * h);
        W[0] *= damp; W[1] *= damp; W[2] *= damp;
        const wl = Math.hypot(W[0], W[1], W[2]);
        if (wl > 14) { W[0] *= 14 / wl; W[1] *= 14 / wl; W[2] *= 14 / wl; }

        // ---- интегрирование: центр масс и поворот (q += ½·ω⊗q·h)
        C[0] += v[0] * h; C[1] += v[1] * h; C[2] += v[2] * h;
        const q = this.q, qx = q[0], qy = q[1], qz = q[2], qw = q[3], wx = W[0], wyy = W[1], wz = W[2];
        q[0] += 0.5 * h * (wx * qw + wyy * qz - wz * qy);
        q[1] += 0.5 * h * (wyy * qw + wz * qx - wx * qz);
        q[2] += 0.5 * h * (wz * qw + wx * qy - wyy * qx);
        q[3] += 0.5 * h * (-wx * qx - wyy * qy - wz * qz);
        const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
        this._axes();

        // колёса: угол поворота (вид)
        for (const w of this.wheels) w.spin = (w.spin + w.rate * h) % (Math.PI * 200);

        this._collide(c, thr);
        this._pose();
    },

    // Момент, поворачивающий ось «вверх» машины к цели (tx, ty, tz): на опоре — к её нормали, в полёте — к
    // вертикали, наклонённой по траектории (нос чуть вверх на взлёте, вниз к посадке). Только крен и тангаж.
    _upright(k, tx, ty, tz, air) {
        const u = this.u, W = this.w, f = this.f, r = this.r;
        if (air) {
            const v = this.v, hs = Math.max(300, Math.hypot(v[0], v[2]));
            const a = Math.max(-0.35, Math.min(0.35, Math.atan2(v[1], hs) * 0.35));
            const fh = Math.hypot(f[0], f[2]) || 1;
            tx = -f[0] / fh * Math.sin(a); ty = Math.cos(a); tz = -f[2] / fh * Math.sin(a);
        }
        // ось поворота u -> t: u × t
        const ax = u[1] * tz - u[2] * ty, ay = u[2] * tx - u[0] * tz, az = u[0] * ty - u[1] * tx;
        const kf = ax * f[0] + ay * f[1] + az * f[2], kr = ax * r[0] + ay * r[1] + az * r[2];
        const tilt = Math.hypot(kf, kr);
        if (!air && tilt < 0.04) return;   // ровно стоит — подвеска справится сама
        const wf = W[0] * f[0] + W[1] * f[1] + W[2] * f[2], wr = W[0] * r[0] + W[1] * r[1] + W[2] * r[2];
        const s = air ? 2.2 : Math.min(1, (tilt - 0.04) * 4);
        const dmp = air ? 0.55 : 0.15;
        const df = kf * k * s - wf * k * dmp, dr = kr * k * s - wr * k * dmp;
        W[0] += f[0] * df + r[0] * dr; W[1] += f[1] * df + r[1] * dr; W[2] += f[2] * df + r[2] * dr;
    },

    // Курс, тангаж, крен (для камеры, ботов, вида) и начало модели из центра масс.
    _pose() {
        const f = this.f, u = this.u, C = this.c;
        this.yaw = Math.atan2(f[2], f[0]);
        this.pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
        this.roll = Math.asin(Math.max(-1, Math.min(1, this.r[1])));
        const ch = this.G.comH;
        this.p[0] = C[0] - u[0] * ch; this.p[1] = C[1] - u[1] * ch; this.p[2] = C[2] - u[2] * ch;
        // обороты двигателя (звук, вид): по скорости и передаче
        const sp = Math.abs(this.vf), vmax = 2600;
        const gears = [0, 380, 820, 1300, 1850, 2400, 99999];
        let g = 1; while (g < 6 && sp > gears[g]) g++;
        const lo = gears[g - 1], hi = Math.min(gears[g], vmax * 1.4);
        const t = Math.max(0, Math.min(1, (sp - lo) / Math.max(1, hi - lo)));
        const free = !this.grounded || this.slip > 0.5;
        const target = free && Math.abs(this.throttle) > 0.2 ? 0.75 + 0.25 * Math.abs(this.throttle) : 0.18 + 0.82 * t * (g === 1 ? 1 : 0.85) + (g > 1 ? 0.15 : 0);
        this.gear = g;
        this.rpm += (Math.min(1, target) - this.rpm) * 0.08;
    },

    // Сферы кузова и колёс против стен и препятствий.
    _collide(c, thr) {
        const v = this.v, C = this.c;
        this.bodyTouch = false;
        const S = [0, 0, 0];
        const G = this.G, R = G.R, stepUp = c.step * G.s;
        /** @type {Array<[number, number, number, number, boolean]>} */
        const list = [];
        for (const s of G.spheres) list.push([s[0], s[1], s[2], s[3], false]);
        for (const w of this.wheels) list.push([w.fx, R + (G.suspRest - w.susp), w.sz, R - 3, true]);
        for (const s of list) {
            this.point(s[0], s[1], s[2], S);
            const sx = S[0], sy = S[1], sz = S[2], isWheel = s[4], rad = s[3];
            Course.sphere(sx, sy, sz, rad, (hit) => {
                if (this.dead) return;
                const col = hit.col, n = hit.n;
                if (col.kill) { this._die('kill'); return; }
                if (col.hazard) { this._hit(hit, c); return; }
                if (col.brk) { if (this.isBot || col.enabled === false || this._ram(col, 'side', hit.q)) return; }   // разрушаемое: игрок сносит, бот проезжает насквозь
                if (isWheel && n[1] > 0.3) return;                                                   // опора — дело лучей
                if (isWheel && hit.q[1] < sy - rad + stepUp) return;                                 // невысокий бортик колесо переезжает (большое — повыше)
                if (!isWheel && n[1] > 0.6) this.bodyTouch = true;
                // аркадный «заезд» на ступень: колесо или перед упёрлись в ступень, едем на неё — машина запрыгивает
                if (!col.wall && Math.abs(n[1]) < 0.6 && (isWheel || s[0] > 0) && (thr > 0.05 || this.vf > 300) && this.climbCool <= 0 && this.u[1] > 0.8
                    && (n[0] * this.f[0] + n[2] * this.f[2]) < -0.3 && this._climb(sx, sz, isWheel ? sy - rad - 3 : this.p[1], rad)) return;
                C[0] += n[0] * hit.depth; C[1] += n[1] * hit.depth; C[2] += n[2] * hit.depth;
                const Q = hit.q;
                const cv = col.dynamic ? Course.pointVel(col, Q) : [0, 0, 0];
                const vp = this._velAt(Q, [0, 0, 0]);
                const rx = vp[0] - cv[0], ry = vp[1] - cv[1], rz = vp[2] - cv[2];
                const rel = rx * n[0] + ry * n[1] + rz * n[2];
                if (rel < 0) {
                    const e = isWheel ? 0.05 : 0.15;
                    const jn = -rel * (1 + e) / this._invMass(Q, n[0], n[1], n[2]);
                    // трение кузова о стену — немного гасит скольжение вдоль
                    let tx = rx - n[0] * rel, ty = ry - n[1] * rel, tz = rz - n[2] * rel;
                    const tl = Math.hypot(tx, ty, tz);
                    let jt = 0;
                    if (tl > 1) { tx /= tl; ty /= tl; tz /= tl; jt = Math.min(tl / this._invMass(Q, tx, ty, tz), jn * 0.25); }
                    this._impulse(Q, n[0] * jn - tx * jt, n[1] * jn - ty * jt, n[2] * jn - tz * jt);
                    if (-rel > 800 && Math.abs(n[1]) < 0.6 && this.bonkCool <= 0) {
                        this.bonkCool = 0.4;
                        if (this.on.bonk) this.on.bonk(-rel);
                    }
                }
            });
            if (this.dead) return;
        }
    },

    // Ступень впереди сферы (x, z): верх опоры не выше CAR_CLIMB_MAX над низом колёс (bottom) — машина
    // «запрыгивает» ровно на неё (физика — сразу, вид — плавно через visLift).
    _climb(x, z, bottom, rad) {
        const c = this.cfg();
        const cm = c.climbMax * this.G.s;
        const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
        const ahead = rad + 30;
        const hit = Course.rayDown(x + fx * ahead, bottom + cm + 30, z + fz * ahead, cm + 30, 0.7);
        if (!hit || hit.col.wall || hit.col.kill) return false;
        const rise = hit.y - bottom;
        if (rise < c.step * this.G.s * 0.5 || rise > cm) return false;
        const lift = rise + 4;
        this.c[1] += lift; this.p[1] += lift;
        this.visLift += lift;
        if (this.v[1] < 0) this.v[1] = 0;
        const along = this.v[0] * fx + this.v[2] * fz;
        const need = Math.max(450, Math.min(900, along));
        if (along < need) { this.v[0] += fx * (need - along); this.v[2] += fz * (need - along); }
        this.w[0] *= 0.3; this.w[1] *= 0.3; this.w[2] *= 0.3;
        this.climbCool = 0.18;
        if (this.on.climb) this.on.climb(rise);
        return true;
    },

    // Удар молотом или балкой: отброс по нормали удара + скорость препятствия, закрутка, короткое оглушение.
    _hit(hit, c) {
        if (this.hitCool > 0) return;
        this.hitCool = 0.45;
        const vh = Course.pointVel(hit.col, hit.q);
        let hx = hit.n[0], hz = hit.n[2];
        let l = Math.hypot(hx, hz);
        if (l < 0.2) { hx = vh[0]; hz = vh[2]; l = Math.hypot(hx, hz); }
        if (l < 1e-3) { hx = -Math.cos(this.yaw); hz = -Math.sin(this.yaw); l = 1; }
        hx /= l; hz /= l;
        const sp = Math.hypot(vh[0], vh[2]);
        const k = c.knock + Math.min(900, sp * 0.5);
        this.v[0] = this.v[0] * 0.3 + hx * k + vh[0] * 0.25;
        this.v[2] = this.v[2] * 0.3 + hz * k + vh[2] * 0.25;
        this.v[1] = Math.max(this.v[1], 0) + 700;
        this.c[0] += hit.n[0] * hit.depth; this.c[1] += Math.max(0, hit.n[1]) * hit.depth; this.c[2] += hit.n[2] * hit.depth;
        this.stun = 0.6;
        this.jumpLock = 0.15;
        for (const w of this.wheels) w.contact = false;
        this.grounded = false;
        this.w[1] += (Math.random() - 0.5) * 5;
        if (this.on.hit) this.on.hit(k);
    },

    // Разрушаемое препятствие (col.brk): Game решает, сломалось ли (true — коллайдер выключен, едем дальше).
    // mode: 'side' (кузов или колесо сбоку) | 'top' (колесо наехало сверху — сплющивание).
    _ram(col, mode, q) {
        if (this.ramCool > 0 && mode === 'top' && !col.piece) return false;
        const hit = this.on.ram ? this.on.ram({ col, piece: col.piece, mode, q, speed: Math.hypot(this.v[0], this.v[2]), vy: this.v[1], car: this }) : false;
        return !!hit;
    },

    /** Скорость по ходу, px/с. */
    speed() { return Math.hypot(this.v[0], this.v[2]); },
    };
}

/** Машина игрока. */
const Car = createCar();
