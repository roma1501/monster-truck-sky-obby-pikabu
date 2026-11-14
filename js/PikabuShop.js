// @ts-nocheck
// PikabuShop.js — магазин наборов за рубли (внутриигровые покупки Пикабу Игр, sdk.store).
// Работает только в сборке pikabu: ждёт Platform.sdk со store (его ставит адаптер PlatformPikabu) и список
// товаров из Студии (sdk.store.getProducts). Нет SDK (блокировщик, другая площадка) или товаров — кнопки нет.
// Игра описывает наборы в js/PikabuPacks.js: PikabuShop.setup({ packs, ready, visible, persist, button }).
//   pack: { id, type: 'consumable' | 'non_consumable', icon, name, desc, best?, noAds?, grant(), apply?() }
//   grant()  — начислить содержимое; один раз на покупку (purchaseId помнится в localStorage)
//   apply()  — для постоянных наборов: применить владение при каждом запуске (например, предметы)
//   noAds    — постоянный набор «Без рекламы»: межстраничная реклама не показывается (награды за рекламу остаются)
// Расходуемые: начисление -> сохранение игры -> sdk.store.consumePurchase. Неначисленные покупки (сеть оборвалась)
// подхватываются при следующем запуске через sdk.store.getPurchases. Пока окно открыто — Pause 'shop'.
const PikabuShop = {
    cfg: null,
    products: new Map(),
    owned: new Set(),
    ready: false,
    isOpen: false,
    busy: false,
    _el: null,
    _btn: null,
    _toastT: 0,

    setup(cfg) {
        if (this.cfg) return;
        this.cfg = cfg || { packs: [] };
        this._wrapAds();
        this._wait();
    },

    // cfg.sdk / cfg.pause / cfg.wrapAds / cfg.gameId — для игр не на Lory (свой адаптер платформы)
    sdk() {
        if (this.cfg && this.cfg.sdk) return this._safe(() => this.cfg.sdk(), null) || null;
        return (typeof Platform !== 'undefined' && Platform && Platform.sdk) || null;
    },
    store() { const s = this.sdk(); return s && s.store ? s.store : null; },
    noAds() { return (this.cfg && this.cfg.packs || []).some((p) => p.noAds && this.owned.has(p.id)); },
    packs() { return (this.cfg.packs || []).filter((p) => this.products.has(p.id)); },

    async _wait() {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 1200; i++) {             // до 10 минут: SDK и сохранение игры
            const gameReady = !this.cfg.ready || this._safe(() => this.cfg.ready(), false);
            if (this.store() && gameReady) break;
            if (i > 60 && !this.sdk()) return;         // 30 с без SDK — не Пикабу или SDK заблокирован
            await sleep(500);
        }
        const st = this.store();
        if (!st) return;
        try {
            const list = await st.getProducts();
            for (const p of list || []) this.products.set(String(p.id), p);
        } catch (e) { console.warn('PikabuShop: товары не загрузились', e); }
        if (!this.packs().length) return;            // товаров в Студии ещё нет — магазин не показываем
        await this._restore();
        this.ready = true;
        this._css();
        this._button();
        setInterval(() => this._sync(), 300);
        this._sync();
    },

    _safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } },

    /** Лучшие предметы движкового Shop, которые иначе открываются только рекламой: по редкости, по одному из разных
     *  вкладок (потом — остальные). Порядок стабилен (каталог игры), поэтому набор всегда выдаёт одно и то же. */
    shopTop(n) {
        if (typeof Shop === 'undefined' || !Shop.items) return [];
        const rank = { mythic: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
        const list = Shop.items().filter((it) => it.price && it.price.ads && !it.exclusive && !it.default)
            .map((it, i) => ({ it, i }))
            .sort((a, b) => (rank[b.it.rarity] || 0) - (rank[a.it.rarity] || 0) || (b.it.price.ads - a.it.price.ads) || a.i - b.i)
            .map((x) => x.it);
        const out = [], tabs = new Set();
        for (const it of list) if (out.length < n && !tabs.has(it.tab)) { out.push(it.id); tabs.add(it.tab); }
        for (const it of list) if (out.length < n && out.indexOf(it.id) < 0) out.push(it.id);
        return out;
    },
    /** Выдать предметы движкового Shop, которых ещё нет (без надевания поверх выбранного игроком). */
    shopGrant(ids) { if (typeof Shop !== 'undefined') for (const id of ids) if (!Shop.owns(id)) Shop.grant(id, { reason: 'pikabu' }); },

    // --- Покупки ---------------------------------------------------------------------------
    _key() { return 'pkbshop:' + ((this.cfg && this.cfg.gameId) || (typeof GAME_ID !== 'undefined' ? GAME_ID : 'game')) + ':granted'; },
    _grantedList() { try { return JSON.parse(localStorage.getItem(this._key()) || '[]') || []; } catch (e) { return []; } },
    _isGranted(id) { return this._grantedList().indexOf(id) >= 0; },
    _markGranted(id) {
        const list = this._grantedList();
        list.push(id);
        try { localStorage.setItem(this._key(), JSON.stringify(list.slice(-300))); } catch (e) { /* без localStorage — только сохранение игры */ }
    },
    _persist() { if (this.cfg.persist) this._safe(() => this.cfg.persist(), null); },

    async _restore() {
        const st = this.store();
        if (!st) return;
        let list = [];
        try { list = (await st.getPurchases()) || []; } catch (e) { console.warn('PikabuShop: список покупок не получен', e); return; }
        for (const p of list) await this._handle(p, false);
    },

    async _handle(purchase, fresh) {
        const pack = (this.cfg.packs || []).find((p) => p.id === purchase.productId);
        if (!pack) return;
        const key = String(purchase.purchaseId || purchase.productId);
        if (!this._isGranted(key)) {
            this._safe(() => pack.grant && pack.grant(), null);
            this._markGranted(key);
            this._persist();
            if (fresh) this._celebrate(pack);
        }
        if (purchase.isConsumable) {
            try { await this.store().consumePurchase(purchase.purchaseId); } catch (e) { console.warn('PikabuShop: consumePurchase', e); }
        } else {
            this.owned.add(pack.id);
            this._safe(() => pack.apply && pack.apply(), null);
        }
    },

    async buy(pack) {
        const st = this.store();
        if (!st || this.busy) return;
        if (pack.type === 'non_consumable' && this.owned.has(pack.id)) return;
        this.busy = true;
        this._buying = pack.id;
        this._render();
        try {
            const r = await st.purchase({ productId: pack.id, developerPayload: JSON.stringify({ pack: pack.id }) });
            if (r && r.success) await this._handle(r.purchase, true);
            else if (r && r.reason === 'NON_CONSUMABLE_ALREADY_OWNED') { await this._restore(); this._toast('Этот набор уже ваш'); }
            else if (r && r.reason && r.reason !== 'USER_CANCELLED') this._toast(r.reason === 'USER_UNAUTHORIZED' ? 'Для покупки войдите в аккаунт Пикабу' : 'Покупка не завершена');
        } catch (e) {
            console.warn('PikabuShop: покупка', e);
            this._toast('Покупка не завершена');
        } finally {
            this.busy = false;
            this._render();
        }
    },

    // --- «Без рекламы» ----------------------------------------------------------------------
    _wrapAds() {
        if (this.cfg.wrapAds) { this._safe(() => this.cfg.wrapAds(() => this.noAds()), null); return; }
        if (typeof Platform === 'undefined' || !Platform) return;
        const self = this;
        const wrap = (name, test) => {
            const orig = Platform[name];
            if (typeof orig !== 'function' || orig.__pkbShop) return;
            const f = function (...args) {
                if (self.noAds() && test(args)) return Promise.resolve(false);
                return orig.apply(this, args);
            };
            f.__pkbShop = true;
            Platform[name] = f;
        };
        wrap('interstitial', () => true);
        wrap('_showAd', (a) => a[0] === 'interstitial' || a[0] === 'fullscreen');
        // адаптер 1.20 подменяет interstitial при init — обернуть ещё раз, когда SDK появится
        const again = setInterval(() => { if (self.sdk()) { wrap('interstitial', () => true); clearInterval(again); } }, 500);
    },

    // --- Интерфейс --------------------------------------------------------------------------
    // Окно: баннер уникального набора (постоянный, не «Без рекламы») -> ряд наборов валюты по цене -> «Без рекламы».
    open() {
        if (!this.ready || this.isOpen) return;
        this.isOpen = true;
        this._pause(true);
        this._render();
        const list = this._el.querySelector('.pk-list');
        list.classList.add('pk-anim');                 // карточки выезжают только при открытии, не при перерисовке
        clearTimeout(this._animT);
        this._animT = setTimeout(() => list.classList.remove('pk-anim'), 900);
        this._el.classList.add('pk-show');
        this._seen();
        this._sync();
    },
    _pause(on) {
        if (this.cfg.pause) this._safe(() => this.cfg.pause(on), null);
        else if (typeof Pause !== 'undefined') this._safe(() => Pause.set('shop', on), null);
    },
    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this._el.classList.remove('pk-show');
        this._pause(false);
        this._sync();
    },

    _sync() {
        if (!this._btn) return;
        const vis = !this.isOpen && (!this.cfg.visible || this._safe(() => this.cfg.visible(), true));
        this._btn.style.display = vis ? '' : 'none';
    },
    _seenKey() { return this._key().replace(':granted', ':seen'); },
    _seen() {
        try { localStorage.setItem(this._seenKey(), '1'); } catch (e) { /* без localStorage */ }
        if (this._btn) this._btn.classList.remove('pk-new');
    },

    _button() {
        const b = document.createElement('button');
        b.id = 'pkbshop-btn';
        b.type = 'button';
        b.setAttribute('aria-label', 'Магазин наборов');
        b.innerHTML = '<span class="pk-bico"><span>🎁</span></span><span class="pk-blabel">Наборы</span><span class="pk-bdot">!</span>';
        let seen = false;
        try { seen = !!localStorage.getItem(this._seenKey()); } catch (e) { /* без localStorage */ }
        if (!seen) b.classList.add('pk-new');
        const pos = Object.assign({ corner: 'tr', x: 12, y: 70 }, this.cfg.button || {});
        b.style[pos.corner[0] === 't' ? 'top' : 'bottom'] = 'calc(' + pos.y + 'px + env(safe-area-inset-' + (pos.corner[0] === 't' ? 'top' : 'bottom') + ', 0px))';
        b.style[pos.corner[1] === 'l' ? 'left' : 'right'] = pos.x + 'px';
        const stop = (e) => e.stopPropagation();
        ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach((t) => b.addEventListener(t, stop));
        b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); this.open(); });
        document.body.appendChild(b);
        this._btn = b;

        const el = document.createElement('div');
        el.id = 'pkbshop';
        el.innerHTML = '<div class="pk-back"></div><div class="pk-panel" role="dialog" aria-label="Магазин наборов">' +
            '<div class="pk-glow pk-g1"></div><div class="pk-glow pk-g2"></div>' +
            '<div class="pk-head"><div class="pk-title"><span class="pk-tico">🎁</span><span><b>Магазин наборов</b><small>Бонусы для игры и поддержка автора</small></span></div>' +
            '<button type="button" class="pk-x" aria-label="Закрыть">✕</button></div>' +
            '<div class="pk-list"></div>' +
            '<div class="pk-foot"><span>🔒</span> Безопасная оплата через Пикабу · покупки сохраняются в аккаунте</div>' +
            '<div class="pk-win" aria-live="polite"></div></div>';
        ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'wheel', 'click', 'contextmenu']
            .forEach((t) => el.addEventListener(t, stop));
        el.querySelector('.pk-back').addEventListener('click', () => this.close());
        el.querySelector('.pk-x').addEventListener('click', () => this.close());
        el.querySelector('.pk-win').addEventListener('click', () => el.querySelector('.pk-win').classList.remove('pk-on'));   // «Получено!» закрывается по нажатию
        window.addEventListener('keydown', (e) => { if (this.isOpen && e.key === 'Escape') { e.stopPropagation(); this.close(); } }, true);
        document.body.appendChild(el);
        this._el = el;
    },

    _price(pack) {
        const prod = this.products.get(pack.id);
        return (prod && prod.formattedPrice) || ((prod ? Math.round(prod.price / 100) : '') + ' ₽');
    },
    _rub(pack) { const p = this.products.get(pack.id); return p ? Number(p.price) || 0 : 0; },
    _amount(pack) {
        const m = String(pack.desc || '').replace(/ /g, ' ').match(/\d[\d ]*/);
        return m ? Number(m[0].replace(/ /g, '')) || 0 : 0;
    },

    _card(pack, cls, extra) {
        const owned = pack.type === 'non_consumable' && this.owned.has(pack.id);
        const card = document.createElement('div');
        card.className = 'pk-card ' + cls + (owned ? ' pk-owned' : '') + (pack.best ? ' pk-best' : '');
        const tag = owned ? '<span class="pk-tag pk-tag-own">✓ Ваш</span>'
            : (pack.best ? '<span class="pk-tag">' + (pack.best === true ? 'Выгодно' : pack.best) + '</span>' : '');
        card.innerHTML = tag + (extra || '') +
            '<div class="pk-ico"><span></span></div>' +
            '<div class="pk-body"><div class="pk-name"></div><div class="pk-desc"></div></div>' +
            '<button type="button" class="pk-buy"></button>';
        card.querySelector('.pk-ico span').textContent = pack.icon || '🎁';
        card.querySelector('.pk-name').textContent = pack.name;
        card.querySelector('.pk-desc').textContent = pack.desc || '';
        const btn = card.querySelector('.pk-buy');
        if (owned) btn.textContent = 'Куплено';
        else if (this.busy && this._buying === pack.id) btn.innerHTML = '<span class="pk-spin"></span>';
        else btn.textContent = this._price(pack);
        btn.disabled = owned || this.busy;
        btn.setAttribute('aria-label', owned ? pack.name + ': куплено' : 'Купить «' + pack.name + '» за ' + this._price(pack));
        btn.addEventListener('click', () => this.buy(pack));
        return card;
    },

    _render() {
        if (!this._el) return;
        const list = this._el.querySelector('.pk-list');
        list.innerHTML = '';
        const packs = this.packs();
        const hero = packs.filter((p) => p.type === 'non_consumable' && !p.noAds);
        const noads = packs.filter((p) => p.noAds);
        const coins = packs.filter((p) => p.type !== 'non_consumable').sort((a, b) => this._rub(a) - this._rub(b));
        let i = 0;
        const add = (node) => { node.style.setProperty('--d', (i++ * 60) + 'ms'); return node; };
        for (const p of hero) list.appendChild(add(this._card(p, 'pk-hero', '<span class="pk-shine"></span>')));
        if (coins.length) {
            const row = document.createElement('div');
            row.className = 'pk-row';
            const a0 = this._amount(coins[0]), r0 = this._rub(coins[0]);
            const base = a0 && r0 ? a0 / r0 : 0;
            coins.forEach((p, k) => {
                let extra = '';
                const amt = this._amount(p), rub = this._rub(p);
                if (k > 0 && base && amt && rub) {
                    const bonus = Math.round((amt / rub / base - 1) * 100);
                    if (bonus >= 10) extra = '<span class="pk-bonus">+' + bonus + '% выгоды</span>';
                }
                row.appendChild(add(this._card(p, 'pk-tier pk-t' + Math.min(3, k + 1), extra)));
            });
            list.appendChild(row);
        }
        for (const p of noads) list.appendChild(add(this._card(p, 'pk-wide pk-noads')));
    },

    _celebrate(pack) {
        const w = this._el && this._el.querySelector('.pk-win');
        if (!w || !this.isOpen) { this._toast('Получено: ' + pack.name); return; }
        const a = (this.cfg.colors && this.cfg.colors[0]) || '#ffb020';
        const b = (this.cfg.colors && this.cfg.colors[1]) || '#ff4f8b';
        const pal = [a, b, '#ffd84a', '#5fe06a', '#4fc3ff', '#ffffff'];
        let conf = '';
        for (let k = 0; k < 48; k++) {
            const ang = Math.random() * Math.PI * 2, dist = 140 + Math.random() * 200;
            const x = Math.cos(ang) * dist * 1.4, y = Math.sin(ang) * dist - 60, r = Math.random() * 720 - 360;
            conf += '<i style="--x:' + x.toFixed(0) + 'px;--y:' + y.toFixed(0) + 'px;--r:' + r.toFixed(0) + 'deg;--c:' + pal[k % pal.length] +
                ';--t:' + (700 + Math.random() * 600).toFixed(0) + 'ms;--s:' + (0.6 + Math.random() * 0.8).toFixed(2) + '"></i>';
        }
        w.innerHTML = '<div class="pk-wbox"><div class="pk-wico"></div><b>Получено!</b><span></span></div><div class="pk-conf">' + conf + '</div>';
        w.querySelector('.pk-wico').textContent = pack.icon || '🎁';
        w.querySelector('.pk-wbox span').textContent = pack.name;
        w.classList.remove('pk-on');
        void w.offsetWidth;
        w.classList.add('pk-on');
        clearTimeout(this._winT);
        this._winT = setTimeout(() => w.classList.remove('pk-on'), 2000);
    },

    _toast(text) {
        let t = document.getElementById('pkbshop-toast');
        if (!t) { t = document.createElement('div'); t.id = 'pkbshop-toast'; document.body.appendChild(t); }
        t.textContent = text;
        t.classList.add('pk-show');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => t.classList.remove('pk-show'), 2600);
    },

    _css() {
        if (document.getElementById('pkbshop-css')) return;
        const a = (this.cfg.colors && this.cfg.colors[0]) || '#ffb020';
        const b = (this.cfg.colors && this.cfg.colors[1]) || '#ff4f8b';
        const s = document.createElement('style');
        s.id = 'pkbshop-css';
        s.textContent = PIKABU_SHOP_CSS.split('%A%').join(a).split('%B%').join(b);
        document.head.appendChild(s);
    },
};

// Оформление окна наборов (%A% / %B% — цвета игры из cfg.colors).
const PIKABU_SHOP_CSS = [
    '#pkbshop-btn,#pkbshop,#pkbshop-toast{--pa:%A%;--pb:%B%;font-family:"Trebuchet MS",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '#pkbshop-btn{position:fixed;z-index:2147482000;display:flex;align-items:center;gap:7px;height:42px;padding:0 15px 0 4px;border:2px solid rgba(255,255,255,.55);border-radius:999px;background:linear-gradient(135deg,var(--pa),var(--pb));color:#fff;font-weight:900;font-size:15px;letter-spacing:.2px;text-shadow:0 1px 2px rgba(0,0,0,.4);box-shadow:0 4px 0 rgba(0,0,0,.25),0 8px 22px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.45);cursor:pointer;animation:pkBob 3s ease-in-out infinite;-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none}',
    '#pkbshop-btn::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 48%,transparent 60%) -120% 0/250% 100% no-repeat;animation:pkSweep 3.2s ease-in-out infinite}',
    '#pkbshop-btn:hover{filter:brightness(1.08)}',
    '#pkbshop-btn:active{transform:translateY(2px) scale(.96)}',
    '#pkbshop-btn .pk-bico{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff7c8,#ffd23f 55%,#f59e0b);box-shadow:0 2px 0 rgba(0,0,0,.2),inset 0 -3px 0 rgba(0,0,0,.12)}',
    '#pkbshop-btn .pk-bico span{font-size:20px;line-height:1;animation:pkWig 3s ease-in-out infinite;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}',
    '#pkbshop-btn .pk-bdot{display:none;position:absolute;top:-7px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ff3b3b;border:2px solid #fff;font-size:12px;line-height:16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.35);animation:pkPop 1.6s ease-in-out infinite}',
    '#pkbshop-btn.pk-new .pk-bdot{display:block}',
    '@keyframes pkBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
    '@keyframes pkSweep{0%,55%{background-position:-120% 0}100%{background-position:220% 0}}',
    '@keyframes pkWig{0%,70%,100%{transform:rotate(0)}76%{transform:rotate(-14deg)}84%{transform:rotate(12deg)}92%{transform:rotate(-6deg)}}',
    '@keyframes pkPop{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',

    '#pkbshop{position:fixed;inset:0;z-index:2147482500;display:none;align-items:center;justify-content:center;color:#fff}',
    '#pkbshop.pk-show{display:flex}',
    '#pkbshop .pk-back{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(30,22,70,.55),rgba(6,6,18,.82));backdrop-filter:blur(4px);animation:pkFade .25s ease both}',
    '#pkbshop .pk-panel{position:relative;width:min(780px,calc(100vw - 20px));max-height:calc(100vh - 20px);display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(165deg,#2c2161 0%,#1c1840 55%,#141230 100%);border:2px solid rgba(255,255,255,.16);border-radius:26px;box-shadow:0 24px 70px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12);animation:pkIn .38s cubic-bezier(.2,1.4,.4,1) both}',
    '#pkbshop .pk-glow{position:absolute;width:340px;height:340px;border-radius:50%;filter:blur(70px);opacity:.38;pointer-events:none}',
    '#pkbshop .pk-g1{background:var(--pa);top:-150px;left:-90px}',
    '#pkbshop .pk-g2{background:var(--pb);bottom:-170px;right:-110px}',
    '#pkbshop .pk-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 12px 18px;background:linear-gradient(135deg,var(--pa),var(--pb));box-shadow:0 6px 18px rgba(0,0,0,.25)}',
    '#pkbshop .pk-head::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.09) 0 14px,transparent 14px 34px);pointer-events:none}',
    '#pkbshop .pk-title{position:relative;z-index:1;display:flex;align-items:center;gap:12px}',
    '#pkbshop .pk-tico{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;font-size:28px;background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)}',
    '#pkbshop .pk-title b{display:block;font-size:clamp(19px,3.4vw,25px);font-weight:900;text-shadow:0 2px 3px rgba(0,0,0,.35)}',
    '#pkbshop .pk-title small{display:block;margin-top:2px;font-size:13px;font-weight:700;opacity:.9}',
    '#pkbshop .pk-x{position:relative;z-index:1;width:40px;height:40px;flex:none;border:0;border-radius:13px;background:rgba(0,0,0,.25);color:#fff;font-size:19px;font-weight:900;cursor:pointer}',
    '#pkbshop .pk-x:hover{background:rgba(0,0,0,.4)}',
    '#pkbshop .pk-list{position:relative;display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto;-webkit-overflow-scrolling:touch}',
    '#pkbshop .pk-list>*{flex:none}',
    '#pkbshop .pk-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}',
    '#pkbshop .pk-card{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:16px 12px 12px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.04));border:2px solid rgba(255,255,255,.12);box-shadow:0 6px 16px rgba(0,0,0,.22);transition:transform .15s,border-color .15s}',
    '#pkbshop .pk-anim .pk-card{animation:pkUp .42s cubic-bezier(.2,1.2,.4,1) both;animation-delay:var(--d,0ms)}',
    '#pkbshop .pk-card:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.28)}',
    '#pkbshop .pk-ico{position:relative;display:grid;place-items:center;width:72px;height:72px;flex:none;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),rgba(255,255,255,.06) 60%,transparent 72%)}',
    '#pkbshop .pk-ico::before{content:"";position:absolute;inset:6px;border-radius:50%;background:conic-gradient(from 0deg,transparent,rgba(255,255,255,.18),transparent 30%,rgba(255,255,255,.12),transparent 60%);animation:pkSpin 9s linear infinite}',
    '#pkbshop .pk-ico span{position:relative;font-size:42px;line-height:1;filter:drop-shadow(0 4px 5px rgba(0,0,0,.4))}',
    '#pkbshop .pk-t2 .pk-ico span{font-size:48px}',
    '#pkbshop .pk-t3 .pk-ico{width:80px;height:80px}',
    '#pkbshop .pk-t3 .pk-ico span{font-size:56px}',
    '#pkbshop .pk-name{font-size:17px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,.3)}',
    '#pkbshop .pk-desc{font-size:13px;line-height:1.3;font-weight:600;opacity:.82}',
    '#pkbshop .pk-body{flex:1;display:flex;flex-direction:column;gap:4px}',
    '#pkbshop .pk-best{border-color:rgba(255,226,120,.75);background:linear-gradient(180deg,rgba(255,200,60,.2),rgba(255,255,255,.05));box-shadow:0 0 0 1px rgba(255,210,80,.35),0 10px 26px rgba(255,170,40,.22)}',
    '#pkbshop .pk-tag{position:absolute;top:-2px;right:12px;z-index:2;padding:4px 10px;border-radius:0 0 11px 11px;background:linear-gradient(135deg,var(--pa),var(--pb));font-size:12px;font-weight:900;letter-spacing:.3px;text-transform:uppercase;box-shadow:0 3px 8px rgba(0,0,0,.3)}',
    '#pkbshop .pk-tag-own{background:linear-gradient(135deg,#3fbf62,#1e8f45)}',
    '#pkbshop .pk-bonus{position:absolute;top:8px;left:8px;z-index:2;padding:3px 7px;border-radius:8px;background:#ffd84a;color:#4a2a00;font-size:11px;font-weight:900;box-shadow:0 2px 0 rgba(0,0,0,.2);transform:rotate(-4deg)}',
    '#pkbshop .pk-buy{position:relative;min-width:120px;min-height:44px;margin-top:6px;padding:8px 18px;border:0;border-radius:15px;overflow:hidden;background:linear-gradient(180deg,#6ff07a 0%,#36c24a 55%,#25a23a 100%);color:#fff;font:inherit;font-size:18px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,.35);box-shadow:0 4px 0 #17702a,0 8px 16px rgba(0,0,0,.25),inset 0 2px 0 rgba(255,255,255,.4);cursor:pointer;transition:transform .1s,filter .15s}',
    '#pkbshop .pk-buy::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:pkGleam 3.6s ease-in-out infinite;animation-delay:var(--d,0ms)}',
    '#pkbshop .pk-buy:hover{filter:brightness(1.08)}',
    '#pkbshop .pk-buy:active{transform:translateY(3px);box-shadow:0 1px 0 #17702a,0 4px 10px rgba(0,0,0,.25)}',
    '#pkbshop .pk-buy:disabled{cursor:default;filter:saturate(.5) brightness(.9)}',
    '#pkbshop .pk-buy:disabled::after{display:none}',
    '#pkbshop .pk-owned{opacity:.82}',
    '#pkbshop .pk-owned .pk-buy{background:linear-gradient(180deg,#6b6790,#4d4970);box-shadow:0 4px 0 #343152;filter:none}',
    '#pkbshop .pk-spin{display:inline-block;width:20px;height:20px;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;vertical-align:middle;animation:pkSpin .7s linear infinite}',

    '#pkbshop .pk-hero{flex-direction:row;text-align:left;gap:16px;padding:16px 18px;overflow:hidden;background:linear-gradient(120deg,rgba(255,255,255,.16),rgba(255,255,255,.05)),linear-gradient(120deg,var(--pa),var(--pb));border-color:rgba(255,255,255,.35)}',
    '#pkbshop .pk-hero::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,14,50,.15),rgba(20,14,50,.45));pointer-events:none}',
    '#pkbshop .pk-hero>*{position:relative}',
    '#pkbshop .pk-hero .pk-tag{position:absolute}',
    '#pkbshop .pk-hero .pk-ico{width:96px;height:96px;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.55),rgba(255,255,255,.14) 55%,transparent 72%)}',
    '#pkbshop .pk-hero .pk-ico span{font-size:62px;animation:pkFloat 2.6s ease-in-out infinite}',
    '#pkbshop .pk-hero .pk-name{font-size:22px}',
    '#pkbshop .pk-hero .pk-desc{font-size:14px;opacity:.95}',
    '#pkbshop .pk-hero .pk-buy{flex:none;min-width:130px;min-height:52px;font-size:21px}',
    '#pkbshop .pk-shine{position:absolute!important;inset:0;background:radial-gradient(circle at 12% 50%,rgba(255,255,255,.25),transparent 40%);pointer-events:none}',
    '#pkbshop .pk-hero .pk-tag{font-size:13px;background:linear-gradient(135deg,#ffd84a,#ff9f1a);color:#4a2a00}',
    '#pkbshop .pk-wide{flex-direction:row;text-align:left;gap:14px;padding:10px 14px}',
    '#pkbshop .pk-wide .pk-ico{width:54px;height:54px}',
    '#pkbshop .pk-wide .pk-ico span{font-size:32px}',
    '#pkbshop .pk-wide .pk-buy{flex:none;margin-top:0}',
    '#pkbshop .pk-noads{background:linear-gradient(90deg,rgba(255,80,80,.18),rgba(255,255,255,.04))}',

    '#pkbshop .pk-foot{position:relative;padding:4px 16px 14px;font-size:12px;font-weight:700;opacity:.62;text-align:center}',
    '#pkbshop .pk-win{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;background:rgba(10,8,30,.72);backdrop-filter:blur(2px)}',
    '#pkbshop .pk-win.pk-on{display:flex;animation:pkFade .2s ease both}',
    '#pkbshop .pk-wbox{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 34px;border-radius:24px;background:linear-gradient(160deg,var(--pa),var(--pb));box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,255,255,.4);animation:pkIn .45s cubic-bezier(.2,1.6,.4,1) both}',
    '#pkbshop .pk-wico{font-size:74px;line-height:1;filter:drop-shadow(0 6px 8px rgba(0,0,0,.35));animation:pkFloat 1.4s ease-in-out infinite}',
    '#pkbshop .pk-wbox b{font-size:30px;font-weight:900;text-shadow:0 2px 4px rgba(0,0,0,.35)}',
    '#pkbshop .pk-wbox span{font-size:16px;font-weight:800;opacity:.95}',
    '#pkbshop .pk-conf{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}',
    '#pkbshop .pk-conf i{position:absolute;width:10px;height:14px;border-radius:2px;background:var(--c);opacity:0;animation:pkConf calc(var(--t) + 700ms) cubic-bezier(.2,.8,.4,1) both}',
    '@keyframes pkConf{0%{transform:translate(0,0) rotate(0) scale(.3);opacity:1}35%{transform:translate(var(--x),var(--y)) rotate(calc(var(--r) / 2)) scale(var(--s));opacity:1}75%{opacity:1}100%{transform:translate(calc(var(--x) * 1.15),calc(var(--y) + 240px)) rotate(var(--r)) scale(var(--s));opacity:0}}',
    '@keyframes pkIn{0%{transform:scale(.86);opacity:0}100%{transform:scale(1);opacity:1}}',
    '@keyframes pkUp{0%{transform:translateY(16px);opacity:0}100%{transform:translateY(0);opacity:1}}',
    '@keyframes pkFade{0%{opacity:0}100%{opacity:1}}',
    '@keyframes pkFloat{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-6px) rotate(3deg)}}',
    '@keyframes pkSpin{to{transform:rotate(360deg)}}',
    '@keyframes pkGleam{0%,60%{left:-60%}100%{left:130%}}',

    '#pkbshop-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:2147483000;transform:translate(-50%,30px);opacity:0;pointer-events:none;padding:12px 20px;border-radius:16px;background:linear-gradient(135deg,rgba(32,26,70,.96),rgba(20,18,44,.96));border:2px solid rgba(255,255,255,.18);color:#fff;font-weight:800;font-size:16px;transition:all .25s;box-shadow:0 10px 26px rgba(0,0,0,.45)}',
    '#pkbshop-toast.pk-show{opacity:1;transform:translate(-50%,0)}',

    '@media (max-width:620px){' +
    '#pkbshop .pk-list{padding:10px;gap:9px}#pkbshop .pk-row{gap:7px}#pkbshop .pk-card{padding:12px 6px 9px;border-radius:16px}' +
    '#pkbshop .pk-ico{width:54px;height:54px}#pkbshop .pk-ico span{font-size:32px}#pkbshop .pk-t2 .pk-ico span{font-size:36px}' +
    '#pkbshop .pk-t3 .pk-ico{width:60px;height:60px}#pkbshop .pk-t3 .pk-ico span{font-size:40px}' +
    '#pkbshop .pk-name{font-size:14px}#pkbshop .pk-desc{font-size:11px}' +
    '#pkbshop .pk-buy{min-width:0;width:100%;min-height:38px;font-size:15px;padding:6px 8px}' +
    '#pkbshop .pk-hero{padding:12px;gap:10px;flex-wrap:wrap}#pkbshop .pk-hero .pk-ico{width:66px;height:66px}#pkbshop .pk-hero .pk-ico span{font-size:42px}' +
    '#pkbshop .pk-hero .pk-body{flex:1 1 150px}#pkbshop .pk-hero .pk-name{font-size:17px}#pkbshop .pk-hero .pk-desc{font-size:12px}' +
    '#pkbshop .pk-hero .pk-buy{flex:1 1 100%;min-height:44px;font-size:18px}#pkbshop .pk-wide .pk-buy{width:auto;min-width:90px}' +
    '#pkbshop .pk-bonus{font-size:10px;padding:2px 5px;top:58px;left:50%;transform:translateX(-50%) rotate(-3deg);white-space:nowrap}#pkbshop .pk-title small{display:none}#pkbshop .pk-tico{width:38px;height:38px;font-size:22px}' +
    '#pkbshop-btn{height:38px;font-size:13px;padding:0 12px 0 3px}#pkbshop-btn .pk-bico{width:30px;height:30px}#pkbshop-btn .pk-bico span{font-size:17px}}',
    '@media (max-height:520px){' +
    '#pkbshop .pk-head{padding:8px 10px 8px 14px}#pkbshop .pk-tico{width:34px;height:34px;font-size:20px}#pkbshop .pk-title small{display:none}' +
    '#pkbshop .pk-list{padding:10px;gap:8px}#pkbshop .pk-card{padding:10px 8px 8px;gap:4px}' +
    '#pkbshop .pk-ico{width:48px;height:48px}#pkbshop .pk-ico span{font-size:30px}#pkbshop .pk-t3 .pk-ico{width:52px;height:52px}#pkbshop .pk-t3 .pk-ico span{font-size:36px}' +
    '#pkbshop .pk-hero .pk-ico{width:60px;height:60px}#pkbshop .pk-hero .pk-ico span{font-size:40px}#pkbshop .pk-hero .pk-buy{min-height:44px;font-size:18px}' +
    '#pkbshop .pk-buy{min-height:36px;font-size:15px;margin-top:2px}#pkbshop .pk-foot{padding:2px 12px 8px}}',
    '@media (prefers-reduced-motion:reduce){#pkbshop *,#pkbshop-btn,#pkbshop-btn *{animation:none!important}}',
].join('\n');
