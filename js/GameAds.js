// GameAds.js — rewarded-реклама игры с паузой между просмотрами (AD_COOLDOWN_SEC, ~18 с).
// Все награды за рекламу (Гараж, подарок x2, колесо, ракета, пропуск этапа) идут через Ads.rewarded:
// награда — только по true от Platform.rewarded; после успешного просмотра следующий доступен через
// паузу. Кнопки показывают «Через N с» по Ads.cooldownLeft(); подписка Ads.on(fn) — раз в секунду,
// пока идёт пауза, и при смене состояния.

/** @satisfies {Record<string, any>} */
const Ads = {
    _until: 0,
    _busy: false,
    /** @type {Array<() => void>} */
    _subs: [],
    _timer: 0,

    /** Площадка умеет rewarded (нет — кнопки «за рекламу» прячутся). */
    supported() {
        try { return typeof Platform === 'undefined' || typeof Platform.rewardedSupported !== 'function' || Platform.rewardedSupported() !== false; }
        catch (e) { return true; }
    },
    /** Секунд до следующего просмотра (0 — можно). */
    cooldownLeft() { return Math.max(0, Math.ceil((this._until - Date.now()) / 1000)); },
    busy() { return this._busy; },
    /** Можно ли прямо сейчас просить рекламу. */
    ready() { return this.supported() && !this._busy && this.cooldownLeft() === 0; },

    /** Просмотр за награду: true — засчитан (награду выдаёт вызывающий, один раз). */
    async rewarded(id) {
        if (!this.ready()) return false;
        this._busy = true;
        this._emit();
        let ok = false;
        try { ok = (await Platform.rewarded(id)) === true; } catch (e) { ok = false; }
        this._busy = false;
        if (ok) {
            const sec = typeof AD_COOLDOWN_SEC !== 'undefined' ? AD_COOLDOWN_SEC : 18;
            this._until = Date.now() + sec * 1000;
            this._tick();
        }
        this._emit();
        return ok;
    },

    /** @param {() => void} fn @returns {() => void} */
    on(fn) {
        this._subs.push(fn);
        return () => { const i = this._subs.indexOf(fn); if (i >= 0) this._subs.splice(i, 1); };
    },
    _emit() { for (const fn of this._subs.slice()) { try { fn(); } catch (e) { console.warn('Ads:', e); } } },
    _tick() {
        if (this._timer) return;
        this._timer = setInterval(() => {
            this._emit();
            if (!this.cooldownLeft()) { clearInterval(this._timer); this._timer = 0; this._emit(); }
        }, 1000);
    },
};
