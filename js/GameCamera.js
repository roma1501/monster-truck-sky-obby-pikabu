// GameCamera.js — камера погони за машиной. В заезде камера сама плавно встаёт за машину по курсу
// (на заднем ходу — не разворачивается); игрок может осмотреться — перетаскиванием с зажатой левой
// кнопкой мыши или пальцем по правой половине экрана (левая — джойстик), через CAM_RETURN_SEC после
// этого камера возвращается за машину. Колесо мыши — ближе/дальше. Потеря фокуса, скрытая вкладка,
// пауза, отпускание пальца вне окна — перетаскивание сразу заканчивается, ничего не залипает. Камера не
// уходит сквозь плиты: луч от машины к камере (Course.ray) укорачивает дистанцию. В меню и Гараже —
// витрина: облёт вокруг машины пальцем/мышью, без авто-вращения.

/** @satisfies {Record<string, any>} */
const Cam = {
    /** @type {any} */ view: null,
    /** @type {'chase' | 'menu' | 'garage' | 'finish'} */ mode: 'chase',
    yaw: 0,              // куда смотрит камера по карте (рад): вперёд — (cos, sin)
    pitch: 0.42,         // наклон взгляда сверху (рад)
    zoom: 1,             // множитель дистанции (колесо)
    pos: null, tgt: null, ty: 0,
    fov: 62, shakeT: 0, shakeA: 0,
    snapNext: true,
    lookT: 99,           // с с последнего осмотра игроком
    /** @type {{ id: number, x: number, y: number } | null} */ drag: null,

    init(app) {
        this.view = app.location.view;
        const cam = app.camera;
        if (cam) cam.update = (dt) => this.update(dt);   // свой ракурс вместо обзорной камеры движка
        this.pos = new BABYLON.Vector3(0, 0, 0);
        this.tgt = new BABYLON.Vector3(0, 0, 0);
        this._bind(/** @type {HTMLCanvasElement} */ (document.getElementById('world3d')));
    },

    // Перетаскивание мышью (левая кнопка): свои обработчики, захват указателя, сброс на любой потере.
    _bind(canvas) {
        if (!canvas) return;
        const end = () => {
            if (this.drag && canvas.hasPointerCapture && canvas.hasPointerCapture(this.drag.id)) { try { canvas.releasePointerCapture(this.drag.id); } catch (e) { /* уже */ } }
            this.drag = null;
        };
        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;      // пальцы ведёт Input (правая половина — взгляд)
            if (typeof Input !== 'undefined' && Input.mouseTouch) return;  // Playables на ПК: мышь — как палец
            if (typeof Pause !== 'undefined' && Pause.active) return;
            this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
            try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* без захвата тоже работает */ }
        });
        canvas.addEventListener('pointermove', (e) => {
            const d = this.drag;
            if (!d || e.pointerId !== d.id) return;
            if ((e.buttons & 1) === 0) { end(); return; }                 // кнопку отпустили за окном
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            d.x = e.clientX; d.y = e.clientY;
            const lim = 120;                                              // выбросы (возврат на вкладку) — обрезать
            this.look(Math.max(-lim, Math.min(lim, dx)), Math.max(-lim, Math.min(lim, dy)), 'mouse');
        });
        for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(t, (e) => { if (this.drag && e.pointerId === this.drag.id) end(); });
        window.addEventListener('blur', end);
        window.addEventListener('lory-release-input', end);
        document.addEventListener('visibilitychange', () => { if (document.hidden) end(); });
        if (typeof Pause !== 'undefined' && Pause.onChange) Pause.onChange(() => { if (Pause.active) end(); });
    },

    setMode(mode) {
        if (mode === this.mode) return;
        const was = this.mode;
        this.mode = mode;
        // смена экрана (меню <-> заезд) — один раз удобный ракурс; дальше угол только у игрока
        if (mode === 'chase' && was !== 'finish') this.behind();
        if ((mode === 'menu' || mode === 'garage') && (was === 'chase' || was === 'finish')) this.showcase();
    },

    /** Витрина: машина в три четверти спереди-справа, чуть сверху (вход в меню и Гараж; дальше крутит игрок). */
    showcase() { this.yaw = Car.yaw + 0.85 + Math.PI; this.pitch = 0.22; this.zoom = 1; this.snapNext = true; },

    /** Поставить камеру за машину (старт мира, респаун). */
    behind() {
        const U = 'undefined';
        const h = typeof CAMERA_CHASE_HEIGHT !== U ? CAMERA_CHASE_HEIGHT : 250, d = typeof CAMERA_CHASE_DIST !== U ? CAMERA_CHASE_DIST : 560;
        this.yaw = Car.yaw; this.pitch = Math.atan2(h, d); this.snapNext = true; this.lookT = 99;
    },
    snap() { this.snapNext = true; },
    shake(amount, time) { this.shakeA = Math.max(this.shakeA, amount); this.shakeT = Math.max(this.shakeT, time || 0.3); },

    /** Взгляд игрока: px перетаскивания. */
    look(dx, dy, src) {
        if (!dx && !dy) return;
        const k = src === 'mouse' ? 0.0055 : 0.006;
        this.lookT = 0;
        this.yaw += dx * k;
        this.pitch = Math.max(-0.12, Math.min(1.2, this.pitch + dy * k * 0.8));
    },

    wheel(delta) {
        if (!delta) return;
        this.zoom = Math.max(0.55, Math.min(1.7, this.zoom * Math.exp(delta * 0.0012)));
    },

    update(dt) {
        dt = Math.min(0.1, Math.max(0, dt || 0));
        const view = this.view;
        if (!view) return;
        const cam = view.camera;
        const U = 'undefined';
        const dist0 = typeof CAMERA_CHASE_DIST !== U ? CAMERA_CHASE_DIST : 820;
        const fov0 = typeof CAMERA_CHASE_FOV !== U ? CAMERA_CHASE_FOV : 62;
        const b = Car;
        const snap = this.snapNext;
        this.snapNext = false;
        const k = (rate) => (snap ? 1 : 1 - Math.exp(-rate * dt));

        const cv = view.world && view.world.canvas;
        const portrait = cv ? cv.clientHeight > cv.clientWidth : false;
        const garage = this.mode === 'garage', menu = this.mode === 'menu';
        // в заезде камера сама встаёт за машину по курсу (после осмотра — через CAM_RETURN_SEC)
        this.lookT += dt;
        if (this.mode === 'chase' && !snap) {
            const back = typeof CAM_RETURN_SEC !== U ? CAM_RETURN_SEC : 1.5;
            const sp = Math.hypot(b.v[0], b.v[2]);
            if (this.lookT > back && sp > 120 && b.vf > -60) {
                // курс по скорости (в заносе камера смотрит туда, куда машина едет), на малой — по носу
                const vy = Math.atan2(b.v[2], b.v[0]), w = Math.min(1, (sp - 120) / 900);
                let dyv = vy - b.yaw; dyv = Math.atan2(Math.sin(dyv), Math.cos(dyv));
                const want = b.yaw + dyv * w * 0.6;
                let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
                const ramp = Math.min(1, (this.lookT - back) / 0.8);
                this.yaw += d * (1 - Math.exp(-(b.grounded ? 4.5 : 1.5) * ramp * dt));
                const h = typeof CAMERA_CHASE_HEIGHT !== U ? CAMERA_CHASE_HEIGHT : 300;
                const p0 = Math.atan2(h, dist0);
                this.pitch += (p0 - this.pitch) * (1 - Math.exp(-1.2 * ramp * dt));
            }
        }
        // цель — машина; по высоте сглажена (подвеска не трясёт кадр), падение догоняет быстро
        const ty = b.p[1] + (garage ? 90 : 130);
        this.ty += (ty - this.ty) * (snap ? 1 : 1 - Math.exp(-(ty < this.ty - 250 ? 12 : 8) * dt));
        let dist = dist0 * this.zoom;
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        const rx = -sy, rz = cy;                          // вправо на экране
        let goalTgt = new BABYLON.Vector3(b.p[0], this.ty, b.p[2]);
        if (menu || garage) {
            // витрина: машина с водителем целиком в свободной части экрана (Гараж — слева от панели
            // в альбоме, над ней в портрете; меню — между логотипом, кнопками и выбором мира)
            const W = (cv && cv.clientWidth) || 800, H = (cv && cv.clientHeight) || 600;
            let area = { x: 0, y: 0, w: W, h: H };
            if (garage && typeof Meta !== 'undefined' && Meta.freeArea) { const fa = Meta.freeArea(); if (fa && fa.w > 40 && fa.h > 40) area = fa; }
            else if (menu) area = portrait ? { x: 0, y: H * 0.12, w: W, h: H * 0.42 } : { x: W * 0.2, y: H * 0.08, w: W * 0.5, h: H * 0.8 };
            const vf = (garage ? 48 : 55) * Math.PI / 180, th = Math.tan(vf / 2), aspect = W / H;
            const tall = 330, wide = 560;                // габарит машины, px мира
            const dH = tall * H / (0.78 * area.h * 2 * th), dW = wide * W / (0.8 * area.w * 2 * th * aspect);
            dist = Math.max(300, dH, dW) * (menu ? this.zoom : 1);
            const halfH = dist * th, halfW = halfH * aspect;
            const fx = (area.x + area.w / 2) / W, fy = (area.y + area.h * 0.52) / H;
            const s = (fx - 0.5) * 2 * halfW, t = (0.5 - fy) * 2 * halfH;
            const c = { x: b.p[0], y: b.p[1] + 140, z: b.p[2] };
            goalTgt = new BABYLON.Vector3(c.x - rx * s, c.y - t * cp, c.z - rz * s);
            this.ty = b.p[1] + 130;
        }
        const back = [-cy * cp, sp, -sy * cp];
        let reach = dist;
        const hit = (Course.ray && !menu && !garage) ? Course.ray(goalTgt.x, goalTgt.y, goalTgt.z, back[0], back[1], back[2], dist, true) : null;
        if (hit) reach = Math.max(dist * 0.22, hit.t - 40);
        const goalPos = new BABYLON.Vector3(goalTgt.x + back[0] * reach, goalTgt.y + back[1] * reach, goalTgt.z + back[2] * reach);
        const fov = garage ? 48 : menu ? 55 : fov0 + 12 * Math.max(0, Math.min(1, (Math.abs(b.vf) - 1400) / 1600)) + (b.boost > 0 || b.padBoost > 0 ? 6 : 0);
        // позиция ровно по углу игрока (без запаздывания по углу — камера не «доворачивает» сама)
        const kp = k(this.mode === 'chase' ? 30 : 10);
        this.pos.x += (goalPos.x - this.pos.x) * kp; this.pos.y += (goalPos.y - this.pos.y) * kp; this.pos.z += (goalPos.z - this.pos.z) * kp;
        this.tgt.x += (goalTgt.x - this.tgt.x) * kp; this.tgt.y += (goalTgt.y - this.tgt.y) * kp; this.tgt.z += (goalTgt.z - this.tgt.z) * kp;
        this.fov += (fov - this.fov) * k(4);
        let sx = 0, syy = 0, sz = 0;
        if (this.shakeT > 0) {
            this.shakeT -= dt;
            const a = this.shakeA * Math.min(1, this.shakeT / 0.15);
            sx = (Math.random() * 2 - 1) * a; syy = (Math.random() * 2 - 1) * a * 0.6; sz = (Math.random() * 2 - 1) * a;
            if (this.shakeT <= 0) this.shakeA = 0;
        }
        cam.fov = this.fov * Math.PI / 180;
        cam.position.set(this.pos.x + sx, this.pos.y + syy, this.pos.z + sz);
        cam.setTarget(new BABYLON.Vector3(this.tgt.x + sx, this.tgt.y + syy, this.tgt.z + sz));
        view.fitShadowFrustum(b.p[0], b.p[2], b.p[1], 1500);
    },
};
