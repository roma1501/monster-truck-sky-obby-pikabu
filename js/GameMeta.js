// GameMeta.js — окна вне заезда: Гараж (магазин косметики), подарок дня, колесо фортуны, рекорды, настройки.
// Образ — «Мастерская монстр-траков»: стальные щиты с клёпками и жёлто-чёрными полосами, грязь, вкладки-плиты сверху окна,
// стенд с карточками-бирками, вкладка «Тюнинг» (Подвеска / Мотор / Броня за монеты), коробки подарка, колесо фортуны —
// огромный диск монстр-трака в шине, табло рекордов.
//
// ПУБЛИЧНЫЙ API (ядро игры — Game.js):
//   Meta.init(save, persist)  — один раз в Game.init ДО применения внешнего вида: подключает Shop, DailyGift и Wheel к
//                               единому сохранению (save.shop / save.daily / save.wheel); persist() пишет весь save.
//                               Shop.on для переодевания машины и водителя ядро вешает ПОСЛЕ Meta.init (Shop.init сбрасывает подписчиков).
//   Meta.open(name)           — 'garage' | 'daily' | 'wheel' | 'records' | 'settings'; Meta.close(); Meta.isOpen(); Meta.current()
//   Meta.onMenu()             — ядро зовёт, когда показано главное меню: подарок дня предлагается сам (не во время туториала)
//   Meta.badge(name)          — 0 | 1: красная точка на кнопках меню ('daily' — подарок готов, 'wheel' — есть бесплатное вращение)
//   Meta.icon(name)           — путь к значку интерфейса (coin, gift, wheel, trophy, settings, shop, ...) для кнопок меню
//   Meta.freeArea()           — свободная от окна область экрана в Гараже { x, y, w, h } (CSS px) или null: сюда ядро ставит машину
// Окна скрывают главное меню: при открытии на <body> ставится класс meta-open (ядро прячет меню и HUD).
// Зовёт ядро (защищённо): Game.setView('garage' | 'menu'), Game.howToPlay(), Game.onMetaClosed(), GameLook.thumb(id).
// Тексты — META_TEXT (ru / en), при загрузке дополняют LANG_STRINGS. Реклама — только через Ads (GameAds.js).
// Окна — не раунды: Platform.ads.roundEnded здесь не зовётся.

const META_TEXT = {
    ru: {
        'meta.close': 'Закрыть',
        'meta.garage': 'Гараж',
        'meta.daily': 'Подарок дня',
        'meta.wheel': 'Колесо фортуны',
        'meta.records': 'Рекорды',
        'meta.settings': 'Настройки',
        'meta.coins': 'Монеты',
        'meta.pick': 'Выберите предмет, чтобы примерить его',
        'meta.resetLook': 'Сбросить примерку',
        'meta.in': 'Через {n} с',
        'meta.noAds': 'Сейчас недоступно',
        'meta.bought': 'Куплено: {name}',
        'meta.unlocked': 'Открыто: {name}',
        'meta.adCounted': 'Просмотр засчитан: {a} из {b}',
        'meta.adFail': 'Реклама не показалась. Прогресс сохранён.',
        'meta.equipped': 'Надето: {name}',
        'meta.grand': 'Главный приз',
        'meta.dailyHint': 'Заходи каждый день: награды растут, а в седьмой день ждёт эксклюзив',
        'meta.noX2': 'Главный приз выдаётся один раз, без удвоения',
        'meta.today': 'Сегодня: {label}',
        'meta.got': 'Получено!',
        'meta.great': 'Отлично!',
        'meta.toGarage': 'В Гараж',
        'meta.wheelHint': 'Одно бесплатное вращение в день и дополнительные за рекламу',
        'meta.nice': 'Здорово!',
        'meta.prizeRecovered': 'Приз колеса получен: {label}',
        'meta.noPlayers': 'Пока нет лучших игроков',
        'meta.unavailable': 'Рекорды недоступны',
        'meta.login': 'Войдите в аккаунт',
        'meta.retry': 'Повторить',
        'meta.you': 'Вы',
        'meta.player': 'Игрок',
        'meta.points': 'Очки',
        'meta.sound': 'Звук',
        'meta.music': 'Музыка',
        'meta.graphics': 'Графика',
        'meta.on': 'Вкл',
        'meta.off': 'Выкл',
        'meta.q.auto': 'Авто',
        'meta.q.low': 'Низкое',
        'meta.q.medium': 'Среднее',
        'meta.q.high': 'Высокое',
        'meta.q.now': 'Сейчас: {name}',
        'meta.how': 'Как играть',
        'meta.tuning': 'Тюнинг',
        'meta.tuneHint': 'Улучшай трак за монеты: каждый уровень дороже предыдущего',
        'tune.susp': 'Подвеска', 'tune.susp.d': 'Выше прыжок: +{p}% за уровень',
        'tune.motor': 'Мотор', 'tune.motor.d': 'Быстрее и злее разгон: +{p}% скорости за уровень',
        'tune.armor': 'Броня', 'tune.armor.d': 'Меньше потеря скорости при таране: −{p}% за уровень',
        'tune.level': 'Ур. {a}/{b}', 'tune.max': 'Максимум', 'tune.buy': 'Улучшить',
        'tune.bought': 'Улучшено: {name}, уровень {n}',
    },
    en: {
        'meta.close': 'Close',
        'meta.garage': 'Garage',
        'meta.daily': 'Daily Gift',
        'meta.wheel': 'Wheel of Fortune',
        'meta.records': 'Records',
        'meta.settings': 'Settings',
        'meta.coins': 'Coins',
        'meta.pick': 'Pick an item to try it on',
        'meta.resetLook': 'Reset try-on',
        'meta.in': 'In {n} s',
        'meta.noAds': 'Not available right now',
        'meta.bought': 'Bought: {name}',
        'meta.unlocked': 'Unlocked: {name}',
        'meta.adCounted': 'Ad counted: {a} of {b}',
        'meta.adFail': 'The ad did not play. Your progress is saved.',
        'meta.equipped': 'Equipped: {name}',
        'meta.grand': 'Grand prize',
        'meta.dailyHint': 'Come back every day: rewards grow, and day 7 brings an exclusive',
        'meta.noX2': 'The grand prize is given once, with no doubling',
        'meta.today': 'Today: {label}',
        'meta.got': 'You got it!',
        'meta.great': 'Great!',
        'meta.toGarage': 'To the Garage',
        'meta.wheelHint': 'One free spin a day, plus extra spins for watching an ad',
        'meta.nice': 'Awesome!',
        'meta.prizeRecovered': 'Wheel prize received: {label}',
        'meta.noPlayers': 'No top players yet',
        'meta.unavailable': 'Records are unavailable',
        'meta.login': 'Sign in',
        'meta.retry': 'Try again',
        'meta.you': 'You',
        'meta.player': 'Player',
        'meta.points': 'Points',
        'meta.sound': 'Sound',
        'meta.music': 'Music',
        'meta.graphics': 'Graphics',
        'meta.on': 'On',
        'meta.off': 'Off',
        'meta.q.auto': 'Auto',
        'meta.q.low': 'Low',
        'meta.q.medium': 'Medium',
        'meta.q.high': 'High',
        'meta.q.now': 'Now: {name}',
        'meta.how': 'How to play',
        'meta.tuning': 'Tuning',
        'meta.tuneHint': 'Upgrade your truck with coins: every level costs more than the last',
        'tune.susp': 'Suspension', 'tune.susp.d': 'Higher jumps: +{p}% per level',
        'tune.motor': 'Engine', 'tune.motor.d': 'Faster and punchier: +{p}% speed per level',
        'tune.armor': 'Armor', 'tune.armor.d': 'Less speed lost when ramming: -{p}% per level',
        'tune.level': 'Lv {a}/{b}', 'tune.max': 'Maxed', 'tune.buy': 'Upgrade',
        'tune.bought': 'Upgraded: {name}, level {n}',
    },
};
// Тексты окон дополняют LANG_STRINGS, не затирая ключи игры.
if (typeof LANG_STRINGS !== 'undefined') {
    for (const code of Object.keys(META_TEXT)) {
        const dict = LANG_STRINGS[code];
        if (!dict) continue;
        for (const key of Object.keys(META_TEXT[code])) if (!(key in dict)) dict[key] = META_TEXT[code][key];
    }
}

// Значки интерфейса (готовый набор игры) и спрайты частиц для превью следов. Пути — только литералами.
const META_ICONS = {
    coin: 'assets/ui/icons/coin.webp',
    close: 'assets/ui/icons/close.webp',
    check: 'assets/ui/icons/check.webp',
    lock: 'assets/ui/icons/lock.webp',
    ad: 'assets/ui/icons/ad-video.webp',
    gift: 'assets/ui/icons/gift.webp',
    chest: 'assets/ui/icons/chest.webp',
    crown: 'assets/ui/icons/crown.webp',
    wheel: 'assets/ui/icons/prize-wheel.webp',
    trophy: 'assets/ui/icons/trophy.webp',
    settings: 'assets/ui/icons/settings.webp',
    shop: 'assets/ui/icons/shop.webp',
    question: 'assets/ui/icons/question.webp',
    restart: 'assets/ui/icons/restart.webp',
    timer: 'assets/ui/icons/timer.webp',
    star: 'assets/ui/icons/star.webp',
    starEmpty: 'assets/ui/icons/star-empty.webp',
    sparkles: 'assets/ui/icons/sparkles.webp',
    soundOn: 'assets/ui/icons/sound-on.webp',
    soundOff: 'assets/ui/icons/sound-off.webp',
    musicOn: 'assets/ui/icons/music-on.webp',
    musicOff: 'assets/ui/icons/music-off.webp',
    coinsPile: 'assets/ui/icons/coins-pile.webp',
    play: 'assets/ui/icons/play.webp',
};
const META_FX = {
    dust: 'assets/fx/dust-puff.webp',
    smoke: 'assets/fx/smoke-white.webp',
    bubble: 'assets/fx/bubble.webp',
    snow: 'assets/fx/snowflake.webp',
    sparkle: 'assets/fx/sparkle-4pt.webp',
    sparkleBig: 'assets/fx/sparkle-big.webp',
    chip: 'assets/fx/confetti-chip.webp',
    flame: 'assets/fx/flame.webp',
    flare: 'assets/fx/flare-gold.webp',
    soft: 'assets/fx/soft-circle.webp',
    star: 'assets/ui/icons/star.webp',
};

// Цвета редкостей (рамка карточки и ярлык). Порядок = ценность.
const META_RARITY = {
    common: { c: '#8d9ab5', n: 0 },
    uncommon: { c: '#b6ff3b', n: 1 },
    rare: { c: '#1ee3ff', n: 2 },
    epic: { c: '#ff6b1a', n: 3 },
    legendary: { c: '#ffd600', n: 4 },
};

// Значки вкладок, которых нет в наборе: рисуются здесь же (толстая обводка, как у остальных значков).
const META_SVG = {
    car: '<svg viewBox="0 0 220 130" aria-hidden="true"><g stroke="#07080a" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"><path d="M56 64h24l10-24q4-9 14-9h44q10 0 16 9l14 20h8q10 0 10 11v10q0 4-4 4H58q-4 0-4-4V74q0-8 2-10z" fill="#ff7a1a"/><path d="M94 62l8-19q2-5 8-5h18v24zM134 38h10q8 0 13 8l8 16h-31z" fill="#bfeaff" stroke-width="4.5"/><path d="M58 80h118" stroke="#ffc400" stroke-width="6"/><g><circle cx="66" cy="94" r="30" fill="#16181c"/><circle cx="66" cy="94" r="14" fill="#d9dee6" stroke-width="5"/></g><g><circle cx="168" cy="94" r="30" fill="#16181c"/><circle cx="168" cy="94" r="14" fill="#d9dee6" stroke-width="5"/></g></g></svg>',
    tune: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#07080a" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"><path d="M31 6a10 10 0 0 0-9 13L8 33a4.6 4.6 0 0 0 7 7l14-14a10 10 0 0 0 13-9l-6 5-6-2-2-6z" fill="#c4cbd6"/><circle cx="11.5" cy="36.5" r="2" fill="#6b7482" stroke-width="2"/><path d="M38 28l3 3M34 40l6-6" stroke="#ffc400" stroke-width="3"/></g></svg>',
    paint: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#05060a" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"><rect x="12" y="19" width="19" height="26" rx="4" fill="#ff4d5e"/><rect x="12" y="29" width="19" height="7" fill="#fff"/><path d="M14 19v-3a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v3Z" fill="#ffd23f"/><rect x="18.5" y="6" width="7" height="7" rx="1.5" fill="#fff"/><g stroke-width="2"><circle cx="31" cy="8" r="2.4" fill="#56c93a"/><circle cx="37" cy="12" r="2.1" fill="#3ec5ff"/><circle cx="38" cy="5" r="1.8" fill="#ffd23f"/></g></g></svg>',
    rim: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#05060a" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20" fill="#2a2a35" stroke-width="4"/><circle cx="24" cy="24" r="12.5" fill="#e8eef5" stroke-width="3.2"/><path d="M24 24V13M24 24l10.5-3.4M24 24l6.5 8.9M24 24l-6.5 8.9M24 24l-10.5-3.4" stroke-width="3.6" fill="none"/><circle cx="24" cy="24" r="4" fill="#ffd23f" stroke-width="2.6"/></g></svg>',
    skin: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#05060a" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"><rect x="9" y="12" width="30" height="29" rx="7" fill="#ffd23f"/><path d="M8 21v-5c0-7 7-10 16-10s16 3 16 10v5Z" fill="#ff4d5e"/><rect x="12" y="24" width="10" height="6" rx="2.5" fill="#05060a"/><rect x="26" y="24" width="10" height="6" rx="2.5" fill="#05060a"/><path d="M22 27h4M18 35q6 4 12 0" fill="none"/></g></svg>',
    trail: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#05060a" stroke-width="3.4" stroke-linejoin="round"><circle cx="10" cy="36" r="5.5" fill="#ffe3f3"/><circle cx="21" cy="30" r="8" fill="#ffb3de"/><circle cx="34" cy="21" r="10.5" fill="#ff7ac8"/><path d="M11 6l1.7 4 4 1.7-4 1.7L11 17.4 9.3 13.4 5.3 11.7l4-1.7Z" fill="#ffd23f" stroke-width="2.4"/></g></svg>',
};

// Как рисуется след в превью: спрайт-маска (окрашивается градиентом color -> color2) и число частиц.
const META_TRAIL = {
    dust: { sp: META_FX.dust, n: 6, a: 16, b: 32, op: 0.8 },
    smoke: { sp: META_FX.smoke, n: 5, a: 22, b: 40, op: 0.85 },
    bubbles: { sp: META_FX.bubble, n: 6, a: 13, b: 28, op: 0.95, scatter: true },
    snow: { sp: META_FX.snow, n: 8, a: 11, b: 22, op: 1, scatter: true },
    sparkle: { sp: META_FX.sparkle, n: 7, a: 14, b: 28, op: 1, rot: true },
    confetti: { sp: META_FX.chip, n: 10, a: 8, b: 14, op: 1, rot: true, scatter: true, twoTone: true },
    stars: { sp: META_FX.star, n: 6, a: 13, b: 26, op: 1, rot: true },
    magic: { sp: META_FX.sparkleBig, n: 6, a: 18, b: 32, op: 1, glow: true },
    fire: { sp: META_FX.flame, n: 5, a: 18, b: 38, op: 0.95 },
    twirl: { sp: META_FX.soft, n: 10, a: 8, b: 20, op: 1, spiral: true },
    flare: { sp: META_FX.flare, n: 4, a: 20, b: 42, op: 1, rot: true },
    rainbow: { rainbow: true },
};

/** @satisfies {Record<string, any>} */
const MetaKit = {
    _thumbs: new Map(),
    _thumbFail: new Map(),
    _thumbWait: [],
    _thumbBusy: false,

    /** Создать элемент: el('div', 'класс', { атрибут, style: {...}, text, onclick }, ...дети). Текст — только через text / строки-дети. */
    el(tag, cls, attrs, ...kids) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (attrs) {
            for (const k of Object.keys(attrs)) {
                const v = attrs[k];
                if (v == null || v === false) continue;
                if (k === 'style' && typeof v === 'object') { for (const p of Object.keys(v)) n.style.setProperty(p, String(v[p])); }
                else if (k === 'text') n.textContent = String(v);
                else if (k === 'html') n.innerHTML = String(v);   // только своя разметка (значки), не данные игрока
                else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
                else n.setAttribute(k, v === true ? '' : String(v));
            }
        }
        for (const kid of kids) {
            if (kid == null || kid === false) continue;
            n.append(typeof kid === 'object' && kid.nodeType ? kid : document.createTextNode(String(kid)));
        }
        return n;
    },

    /** Элемент внутри root по селектору (приведение типа для tsc). */
    q(root, sel) { return /** @type {HTMLElement} */ (root.querySelector(sel)); },

    t(key, params) { return typeof Lang !== 'undefined' ? Lang.t(key, params) : key; },

    /** Число с пробелами между разрядами. */
    num(n) {
        const v = Math.max(0, Math.floor(Number(n) || 0));
        try { return v.toLocaleString(typeof Lang !== 'undefined' && Lang.code === 'ru' ? 'ru-RU' : 'en-US'); } catch (e) { return String(v); }
    },

    /** 0xRRGGBB -> '#rrggbb'. */
    hex(n) { return '#' + (Math.max(0, Math.floor(Number(n) || 0)) & 0xffffff).toString(16).padStart(6, '0'); },

    /** Смесь двух цветов 0xRRGGBB: t = 0 — a, t = 1 — b. */
    mix(a, b, t) {
        const k = Math.max(0, Math.min(1, t));
        const ch = (c, s) => (c >> s) & 255;
        const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * k), g = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * k), bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * k);
        return (r << 16) | (g << 8) | bl;
    },

    /** Светлота цвета 0..1. */
    luma(c) { return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; },

    /** Детерминированное «случайное» 0..1 по номеру (чтобы превью не прыгало при перерисовке). */
    rnd(i, salt) { const x = Math.sin(i * 127.1 + (salt || 0) * 311.7 + 1.7) * 43758.5453; return x - Math.floor(x); },

    /** Значок набора как картинка. */
    ico(name, cls) {
        return MetaKit.el('img', 'meta-ico' + (cls ? ' ' + cls : ''), { src: META_ICONS[name] || '', alt: '', draggable: 'false' });
    },

    /** Свой SVG-значок вкладки (car, paint, rim, skin, trail). */
    svg(name, cls) { return MetaKit.el('span', 'meta-svg' + (cls ? ' ' + cls : ''), { html: META_SVG[name] || '' }); },

    /** Значок вкладки: свой SVG или значок набора. */
    tabIcon(name) { return META_SVG[name] ? MetaKit.svg(name, 'meta-tab-ico') : MetaKit.ico('sparkles', 'meta-tab-ico'); },

    /** Предметы вкладки/слота -> значок вкладки по данным вкладки. */
    tabOf(id) { return SHOP_TABS.find((t) => t.id === id) || null; },

    rarity(r) { return META_RARITY[r] || META_RARITY.common; },

    game() {
        // @ts-ignore — Game.js пишет основная сессия; без него (тесты, ранний вызов) окна работают сами
        return typeof Game !== 'undefined' ? /** @type {any} */ (Game) : null;
    },
    look() {
        // @ts-ignore — GameLook.js — модуль основной сессии: превью из игровых моделей
        return typeof GameLook !== 'undefined' ? /** @type {any} */ (GameLook) : null;
    },
    /** Вызвать метод ядра, если он есть (setView, howToPlay, onMetaClosed...). */
    callGame(name, ...args) {
        const g = MetaKit.game();
        if (!g || typeof g[name] !== 'function') return undefined;
        try { return g[name](...args); } catch (e) { console.warn('Meta: Game.' + name + ':', (e && e.message) || e); return undefined; }
    },

    // --------------------------------------------------------------------------------------------
    // Превью предметов
    // --------------------------------------------------------------------------------------------

    /** Цвет-заглушка предмета (пока нет картинки из игровой модели). */
    swatch(it) {
        if (it.look) return it.look.shirt;
        if (it.swatch != null) return it.swatch;
        if ('paint' in it) return it.paint ? it.paint.color : 0xdfe6ee;   // покраска: сама краска (заводская — светло-серая)
        if (it.color != null) return it.color;
        return 0x8aa0b8;
    },

    /** Превью предмета: картинка из игровой модели (подгружается) или аккуратная заглушка; след рисуется целиком здесь. */
    preview(it, cls) {
        const box = MetaKit.el('div', 'meta-prev' + (cls ? ' ' + cls : ''), { 'data-item': it.id });
        if (it.trail) { box.classList.add('is-trail'); box.append(MetaKit.trailPreview(it)); return box; }
        const tab = MetaKit.tabOf(it.tab);
        const fb = MetaKit.el('div', 'meta-fb', { style: { '--fc': MetaKit.hex(MetaKit.swatch(it)) } }, MetaKit.tabIcon(tab ? tab.icon : 'sparkles'));
        box.append(fb);
        box.setAttribute('data-thumb', it.id);
        return box;
    },

    /** Подставить картинки во всех [data-thumb] внутри root; готовые — сразу, остальные по очереди. */
    fillThumbs(root) {
        for (const n of /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('[data-thumb]')))) {
            const id = n.getAttribute('data-thumb');
            const url = MetaKit._thumbs.get(id);
            if (url) MetaKit.setThumb(n, url);
            else MetaKit._thumbWait.push({ id, node: n });
        }
        MetaKit._pump();
    },

    setThumb(node, url) {
        let img = /** @type {HTMLImageElement} */ (node.querySelector('img.meta-thumb'));
        if (!img) { img = /** @type {HTMLImageElement} */ (MetaKit.el('img', 'meta-thumb', { alt: '', draggable: 'false' })); node.append(img); }
        img.src = url;
        node.classList.add('has-img');
    },

    async _pump() {
        if (MetaKit._thumbBusy) return;
        MetaKit._thumbBusy = true;
        try {
            while (MetaKit._thumbWait.length) {
                const job = MetaKit._thumbWait.shift();
                if (!job.node.isConnected) continue;
                const url = MetaKit._thumbs.get(job.id) || await MetaKit.loadThumb(job.id);
                if (url && job.node.isConnected) MetaKit.setThumb(job.node, url);
            }
        } finally { MetaKit._thumbBusy = false; }
    },

    /** GameLook.thumb с кэшем; неудача не запоминается надолго (модели могли ещё грузиться). */
    async loadThumb(id) {
        const failed = MetaKit._thumbFail.get(id);
        if (failed && Date.now() - failed < 4000) return '';
        try {
            const L = MetaKit.look();
            if (L && typeof L.thumb === 'function') {
                const url = await L.thumb(id);
                if (url) { MetaKit._thumbs.set(id, url); return url; }
            }
        } catch (e) { /* без превью — заглушка */ }
        MetaKit._thumbFail.set(id, Date.now());
        return '';
    },

    /** Превью следа из спрайтов частиц: цепочка частиц от хвоста (color2) к голове (color). */
    trailPreview(it) {
        const spec = META_TRAIL[it.trail] || META_TRAIL.sparkle;
        const box = MetaKit.el('div', 'meta-trail');
        const c1 = it.color != null ? it.color : 0xffffff, c2 = it.color2 != null ? it.color2 : c1;
        if (spec.rainbow) {
            const pastel = MetaKit.luma(c1) > 0.72;
            const cols = pastel ? ['#ffb3c1', '#ffd2a8', '#fff0a8', '#b9f0b0', '#a8e4ff', '#cbb8ff'] : ['#ff4d5e', '#ff9f1c', '#ffd23f', '#56c93a', '#3ec5ff', '#7b4dff'];
            let d = '';
            cols.forEach((c, i) => { d += '<path d="M8 ' + (74 - i * 5) + ' Q38 ' + (30 - i * 5) + ' 92 ' + (46 - i * 5) + '" stroke="' + c + '"/>'; });
            box.append(MetaKit.el('span', 'meta-rb', { html: '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke-width="5.2" stroke-linecap="round">' + d + '</g></svg>' }));
            return box;
        }
        const n = spec.n;
        for (let i = 0; i < n; i++) {
            const u = n > 1 ? i / (n - 1) : 1;   // 0 — хвост, 1 — голова (справа)
            let x, y;
            if (spec.spiral) {
                const ang = u * Math.PI * 4.4 + 0.6, r = 6 + u * 30;
                x = 50 + Math.cos(ang) * r; y = 50 + Math.sin(ang) * r;
            } else {
                x = 12 + u * 76;
                y = 62 - u * 14 + Math.sin(u * Math.PI * 2.3 + 0.8) * 9;
                if (spec.scatter) { y += (MetaKit.rnd(i, 3) - 0.5) * 26; x += (MetaKit.rnd(i, 5) - 0.5) * 8; }
            }
            const s = spec.a + (spec.b - spec.a) * Math.pow(u, 0.8);
            const col = spec.twoTone ? (i % 2 ? c1 : c2) : MetaKit.mix(c2, c1, u);
            const rot = spec.rot ? Math.round(MetaKit.rnd(i, 9) * 80 - 40) : 0;
            if (spec.glow) box.append(MetaKit.el('i', 'meta-pt meta-pt-glow', { style: { left: x + '%', top: y + '%', width: s * 1.9 + '%', height: s * 1.9 + '%', background: MetaKit.hex(col), '--sp': 'url("' + META_FX.soft + '")' } }));
            box.append(MetaKit.el('i', 'meta-pt', {
                style: {
                    left: x + '%', top: y + '%', width: s + '%', height: s + '%', background: MetaKit.hex(col),
                    opacity: String(spec.op * (0.5 + 0.5 * u)), transform: 'translate(-50%,-50%) rotate(' + rot + 'deg)', '--sp': 'url("' + spec.sp + '")',
                },
            }));
        }
        return box;
    },

    /** Метка цены/состояния для карточки по модели Shop.card. */
    chip(c) {
        const E = MetaKit.el;
        if (c.state === 'equipped') return E('span', 'meta-chip is-eq', {}, MetaKit.ico('check'), MetaKit.t('shop.equipped'));
        if (c.state === 'owned') return E('span', 'meta-chip is-own', {}, MetaKit.t('shop.owned'));
        if (c.kind === 'coins') return E('span', 'meta-chip is-coin' + (c.affordable ? ' is-ok' : ''), {}, MetaKit.ico('coin'), MetaKit.num(c.price));
        if (c.kind === 'ads') {
            const row = E('span', 'meta-chip is-ads');
            for (let i = 0; i < c.need; i++) row.append(MetaKit.ico(i < c.progress ? 'star' : 'starEmpty', 'meta-pip'));
            return row;
        }
        if (c.kind === 'exclusive') return E('span', 'meta-chip is-ex', {}, MetaKit.ico('gift'), MetaKit.t('shop.exclusive.daily'));
        return E('span', 'meta-chip');
    },

    // --------------------------------------------------------------------------------------------
    // Мелочи интерфейса
    // --------------------------------------------------------------------------------------------

    /** Всплывающая подсказка сверху окна. */
    toast(text) {
        const host = Meta._toasts;
        if (!host || !text) return;
        const n = MetaKit.el('div', 'meta-toast', { role: 'status', text });
        host.append(n);
        while (host.children.length > 3) host.firstElementChild.remove();
        setTimeout(() => n.remove(), 2600);
    },

    /** Горсть конфетти: n цветных клочков вокруг точки внутри host. */
    confetti(host, n) {
        const cols = ['#ff2d55', '#ffd600', '#b6ff3b', '#1ee3ff', '#ff6b1a', '#ffffff', '#ff6b1a'];
        const layer = MetaKit.el('div', 'meta-confetti');
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
            layer.append(MetaKit.el('i', '', {
                style: { background: cols[i % cols.length], '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d - 40 + 'px', '--r': Math.round(Math.random() * 540 - 270) + 'deg', 'animation-delay': Math.random() * 0.12 + 's' },
            }));
        }
        host.append(layer);
        setTimeout(() => layer.remove(), 1500);
    },

    /** Подпись секунд ожидания рекламы: «Через 12 с». */
    waitText(sec) { return MetaKit.t('meta.in', { n: sec }); },

    /** Секунд до следующей рекламы: общая пауза между просмотрами (Ads) или своя пауза после неудачи (adWait). */
    adWait(extra) {
        const a = typeof Ads !== 'undefined' ? Ads.cooldownLeft() : 0;
        return Math.max(a, Number(extra) || 0);
    },
    adsOn() { return typeof Ads === 'undefined' ? true : Ads.supported(); },
    adsReady() { return typeof Ads === 'undefined' ? true : Ads.ready(); },
};
// Стили окон (вставляются один раз как <style id="meta-css">); классы с префиксом meta-, общие .bo-* — из index.html.
const META_CSS = `
.meta-root{position:fixed;inset:0;z-index:650;display:none;align-items:center;justify-content:center;
  --m-t:max(8px,env(safe-area-inset-top,0px),var(--lory-safe-top,0px));--m-r:max(8px,env(safe-area-inset-right,0px),var(--lory-safe-right,0px));
  --m-b:max(8px,env(safe-area-inset-bottom,0px),var(--lory-safe-bottom,0px));--m-l:max(8px,env(safe-area-inset-left,0px),var(--lory-safe-left,0px));
  padding:var(--m-t) var(--m-r) var(--m-b) var(--m-l);font:800 16px var(--bo-font);color:#e9eefc;
  -webkit-user-select:none;user-select:none;touch-action:manipulation;overscroll-behavior:contain}
.meta-root.is-open{display:flex}
.meta-root *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#5b6788 #0b0d15}
.meta-root [hidden],.meta-toasts [hidden]{display:none!important}
.meta-dim{position:absolute;inset:0;background:radial-gradient(120% 95% at 50% 38%,rgba(6,8,14,.5),rgba(4,5,9,.9)),repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 2px,transparent 2px 5px)}
.meta-root[data-win="garage"] .meta-dim{background:linear-gradient(90deg,rgba(4,5,9,0) 30%,rgba(4,5,9,.6))}
.meta-ico{width:1.2em;height:1.2em;object-fit:contain;display:inline-block;flex:none;pointer-events:none;-webkit-user-drag:none}
.meta-svg{display:inline-flex;align-items:center;justify-content:center;flex:none;pointer-events:none}
.meta-svg svg{width:100%;height:100%;display:block;overflow:visible}
.meta-win{position:relative;display:flex;flex-direction:column;width:min(var(--w,560px),100%);max-height:100%;min-height:0;animation:meta-in .22s ease-out}
@keyframes meta-in{from{transform:translateY(16px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes meta-fade{from{opacity:0}to{opacity:1}}
@keyframes meta-pop{0%{transform:scale(.7)}55%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes meta-bounce{0%,100%{transform:translateY(0)}45%{transform:translateY(-9%)}}
@keyframes meta-spin{to{transform:rotate(360deg)}}
/* шапка окна: цветная плита с наклонным краем под заголовок + hazard-лента */
.meta-bar{display:flex;align-items:center;gap:10px;padding:10px 12px 9px 16px;flex:none;
  background-color:#0d1019;background-image:linear-gradient(105deg,var(--hc,#ff6b1a) 0 74%,transparent 74.3%),var(--bo-carbon)}
.meta-garage{--hc:#ff6b1a}.meta-daily{--hc:#b6ff3b}.meta-wheelwin{--hc:#1ee3ff}.meta-rec{--hc:#ffd600}.meta-set{--hc:#ff6b1a}
.meta-ttl{margin:0;flex:1;min-width:0;font-size:clamp(20px,4.6vw,30px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:.3em}
@supports (color:oklch(from red l c h)){
  .meta-ttl{color:oklch(from var(--hc,#ff6b1a) clamp(.1,(.64 - l)*99,.98) 0 0);text-shadow:0 1px 0 oklch(from var(--hc,#ff6b1a) clamp(0,(l - .58)*99,1) 0 0/.45)}
}
.bo-btn.meta-x{--c:var(--bo-red);flex:none}
.meta-x .meta-ico{width:56%;height:56%}
.meta-ribbon{flex:none;height:11px;border-block:2px solid var(--bo-ink);background:var(--bo-hazard)}
.meta-body{flex:1;min-height:0;overflow:auto;overflow-x:hidden;overscroll-behavior:contain}
.meta-hint{margin:0;font-size:13px;line-height:1.25;color:#9aa8cc;text-align:center;font-weight:700}
.meta-bar-ico{width:34px;height:34px;filter:drop-shadow(0 2px 0 rgba(5,6,10,.6))}
.meta-crown{position:absolute;left:50%;top:-6%;width:52%;transform:translateX(-50%);z-index:4;object-fit:contain;filter:drop-shadow(0 2px 0 rgba(5,6,10,.7))}
.meta-rew-c{display:inline-flex;align-items:center;gap:3px}
.meta-lbl{display:block}
/* счётчик монет — тёмный дисплей со светящимися цифрами */
.meta-coins{position:relative;isolation:isolate;display:inline-flex;align-items:center;font-size:16px;flex:none;gap:6px;padding:3px 12px 3px 8px;color:var(--bo-yellow);background:none;border:0;box-shadow:none;border-radius:0;
  font-weight:900;letter-spacing:.04em;text-shadow:0 0 .5em rgba(255,214,0,.5),0 1px 0 var(--bo-ink);font-variant-numeric:tabular-nums}
.meta-coins::before{content:'';position:absolute;inset:0;z-index:-1;transform:skewX(-11deg);border-radius:4px;border:2px solid rgba(255,255,255,.38);background:#070910;box-shadow:0 0 0 2px var(--bo-ink),inset 0 0 10px rgba(255,214,0,.14)}
.meta-coins .meta-ico{width:24px;height:24px}
.meta-coins.is-bump{animation:meta-pop .35s}
.meta-toasts{position:fixed;left:0;right:0;top:0;z-index:660;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;
  padding:max(10px,env(safe-area-inset-top,0px),var(--lory-safe-top,0px)) 8px 0;font:800 16px var(--bo-font)}
.meta-toast{max-width:min(92vw,520px);padding:9px 16px 9px 14px;background:#0a0c13;color:#fff;border:2px solid rgba(255,255,255,.4);border-left:6px solid var(--bo-orange);border-radius:4px;box-shadow:0 5px 0 rgba(0,0,0,.45);
  font-size:14px;line-height:1.2;text-align:center;animation:meta-toast 2.6s ease-out forwards}
@keyframes meta-toast{0%{opacity:0;transform:translateY(-14px)}9%{opacity:1;transform:none}88%{opacity:1}100%{opacity:0}}
.meta-confetti{position:absolute;left:50%;top:42%;width:0;height:0;pointer-events:none;z-index:40}
.meta-confetti i{position:absolute;width:9px;height:14px;border:2px solid var(--bo-ink);border-radius:2px;transform:skewX(-14deg);animation:meta-conf 1.15s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes meta-conf{0%{transform:translate(0,0) rotate(0);opacity:1}80%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}

/* ---- превью предметов: «стенд» гаража с подсветкой и линией пола ---- */
.meta-prev{position:relative;width:100%;aspect-ratio:1;border-radius:4px;border:2px solid rgba(255,255,255,.16);display:grid;place-items:center;overflow:hidden;
  background:linear-gradient(180deg,transparent 80%,rgba(255,255,255,.1) 80% 81%,rgba(0,0,0,.28) 81%),radial-gradient(ellipse 85% 65% at 50% 108%,rgba(140,160,210,.4),transparent 72%),linear-gradient(180deg,#2b3252,#151929)}
.meta-prev[data-r="rare"]{background:linear-gradient(180deg,transparent 80%,rgba(255,255,255,.1) 80% 81%,rgba(0,0,0,.28) 81%),radial-gradient(ellipse 85% 65% at 50% 108%,rgba(30,227,255,.5),transparent 72%),linear-gradient(180deg,#1f3a52,#121a2c)}
.meta-prev[data-r="epic"]{background:linear-gradient(180deg,transparent 80%,rgba(255,255,255,.1) 80% 81%,rgba(0,0,0,.28) 81%),radial-gradient(ellipse 85% 65% at 50% 108%,rgba(255,107,26,.5),transparent 72%),linear-gradient(180deg,#46283a,#1a1524)}
.meta-prev[data-r="legendary"]{background:linear-gradient(180deg,transparent 80%,rgba(255,255,255,.12) 80% 81%,rgba(0,0,0,.28) 81%),radial-gradient(ellipse 80% 80% at 50% 90%,rgba(255,214,0,.62),transparent 74%),linear-gradient(180deg,#4a3d1c,#1c1810)}
.meta-prev.is-trail{background:repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 9px,transparent 9px 18px) 0 88%/100% 2px no-repeat,linear-gradient(135deg,#0b0d18,#1b2142)}
.meta-fb{width:66%;height:66%;border-radius:50%;background:var(--fc,#8aa0b8);border:3px solid var(--bo-ink);display:grid;place-items:center;box-shadow:inset 0 -7px 0 rgba(0,0,0,.2),inset 0 5px 0 rgba(255,255,255,.3)}
.meta-fb .meta-svg{width:62%;height:62%}.meta-fb .meta-ico{width:60%;height:60%}
.meta-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none}
.meta-prev.has-img .meta-fb{display:none}
.meta-lock{position:absolute;right:3px;bottom:3px;width:22px;height:22px;filter:drop-shadow(0 1px 0 rgba(5,6,10,.8))}
.meta-trail{position:absolute;inset:0}
.meta-pt{position:absolute;-webkit-mask-image:var(--sp);mask-image:var(--sp);-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center}
.meta-pt-glow{opacity:.55;filter:blur(1.5px)}
.meta-rb svg{position:absolute;inset:0;width:100%;height:100%}
.meta-chip{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-height:22px;padding:0 8px;border-radius:3px;border:2px solid var(--bo-ink);background:#e9eef8;color:var(--bo-dark);font-size:12px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 2px 0 var(--bo-ink)}
.meta-chip .meta-ico{width:16px;height:16px}
.meta-chip.is-coin{background:var(--bo-yellow)}.meta-chip.is-coin.is-ok{background:var(--bo-green)}
.meta-chip.is-ads{background:#232a44;color:#fff;padding:0 5px;gap:0;border-color:rgba(255,255,255,.4)}.meta-chip.is-ads .meta-pip{width:11px;height:11px}
.meta-chip.is-eq{background:var(--bo-green);color:var(--bo-dark)}
.meta-chip.is-own{background:#c3cde2}.meta-chip.is-ex{background:var(--bo-orange)}

/* ---- Гараж ---- */
.meta-garage{position:absolute;top:var(--m-t);bottom:var(--m-b);right:var(--m-r);width:min(calc(100% - var(--m-l) - var(--m-r)),clamp(360px,60vw,660px));
  max-height:none;flex-direction:row;align-items:stretch}
.meta-tabs{display:flex;flex-direction:column;gap:8px;padding-top:64px;margin-right:-7px;flex:none;position:relative;z-index:0}
.meta-tab{position:relative;width:64px;flex:0 1 66px;min-height:48px;max-height:76px;padding:0;border:0;background:var(--bo-ink);cursor:pointer;font:inherit;color:#fff;
  clip-path:polygon(0 18px,18px 0,100% 0,100% 100%,18px 100%,0 calc(100% - 18px));transition:transform .15s,filter .15s;filter:saturate(.8) brightness(.85)}
.meta-tab-in{position:absolute;inset:3px 0 3px 3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding-right:8px;
  background-color:var(--c);background-image:linear-gradient(180deg,rgba(255,255,255,.42) 0 40%,rgba(255,255,255,0) 40%),repeating-linear-gradient(45deg,rgba(0,0,0,.09) 0 2px,transparent 2px 4px),repeating-linear-gradient(-45deg,rgba(0,0,0,.09) 0 2px,transparent 2px 4px);
  clip-path:polygon(0 16px,16px 0,100% 0,100% 100%,16px 100%,0 calc(100% - 16px))}
.meta-tab.is-on{transform:translateX(-9px);filter:none}
.meta-tab-ico{width:30px;height:24px}.meta-tab-ico.meta-ico{width:26px;height:26px}
.meta-tab-lbl{font-size:10.5px;font-weight:900;line-height:1;color:#fff;text-shadow:var(--bo-outline-thin);max-width:100%;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.02em}
.meta-tab-cnt{font-size:9.5px;font-weight:800;line-height:1;color:#fff;text-shadow:var(--bo-outline-thin);opacity:.95}
@supports (color:oklch(from red l c h)){
  .meta-tab-lbl,.meta-tab-cnt{color:oklch(from var(--c) clamp(.1,(.64 - l)*99,.98) 0 0);text-shadow:none}
}
.meta-board{--cut:18px;--hc:#ff6b1a;flex:1;min-width:0;display:flex;flex-direction:column;position:relative;z-index:1}
.bo-btn.meta-reset{min-height:0;width:44px;height:44px;--c:#9aa7b5;font-size:18px}.meta-reset .meta-ico{width:60%;height:60%}
.meta-shelf{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;overflow-x:hidden;padding:20px 10px 14px;
  background-color:#0b0d15;background-image:radial-gradient(circle,rgba(255,255,255,.1) 0 2px,transparent 2.6px);background-size:18px 18px;border-bottom:2px solid rgba(255,255,255,.22)}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--cw,94px),1fr));gap:20px 10px;justify-items:center}
.meta-card{position:relative;display:flex;flex-direction:column;align-items:stretch;width:100%;max-width:130px;padding:0 0 6px;margin:0;font:inherit;color:#e9eefc;text-align:center;
  background-color:#1c2030;background-image:var(--bo-carbon);border:2px solid rgba(255,255,255,.22);border-radius:5px;box-shadow:0 4px 0 var(--bo-ink);cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s}
.meta-card::before{content:'';position:absolute;left:50%;top:-13px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#97a3bc);border:2px solid var(--bo-ink);z-index:2}
.meta-card:active{transform:translateY(2px);box-shadow:0 2px 0 var(--bo-ink)}
.meta-card.is-sel{transform:translateY(-5px);border-color:var(--bo-green);box-shadow:0 9px 0 var(--bo-ink),0 0 16px rgba(182,255,59,.6)}
.meta-card.is-sel::before{background:var(--bo-green)}
.meta-card.is-pop{animation:meta-pop .45s}
.meta-card-top{display:flex;align-items:center;justify-content:space-between;height:22px;margin-bottom:5px;padding:0 6px 0 0;border-bottom:3px solid var(--rc);font-size:11px;line-height:1}
.meta-card-top>span:first-child{align-self:stretch;display:flex;align-items:center;padding:0 7px 0 10px;background:#f4f6fb;color:var(--bo-dark);font-weight:900;letter-spacing:.04em;border-right:2px solid var(--bo-ink);border-radius:3px 0 6px 0;border-left:5px solid #1e4fd6}
.meta-rdots{display:flex;gap:2px}.meta-rdots i{width:5px;height:5px;border-radius:1px;transform:skewX(-20deg);background:var(--rc);box-shadow:0 0 0 1px var(--bo-ink)}
.meta-card .meta-prev{width:calc(100% - 10px);max-width:98px;margin:0 auto}
.meta-card-name{display:flex;align-items:center;justify-content:center;min-height:2.5em;padding:3px 4px 4px;font-size:11.5px;font-weight:800;line-height:1.1;overflow:hidden;color:#e9eefc}
.meta-card .meta-chip{align-self:center}
.meta-card.is-locked .meta-prev .meta-thumb,.meta-card.is-locked .meta-prev .meta-fb{filter:saturate(.75) brightness(.9)}
.meta-info{flex:none;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;min-height:68px;padding:10px 14px;background:#090b12;color:#fff;border-top:2px solid rgba(255,255,255,.18)}
.meta-info-name{font-size:16px;font-weight:900;line-height:1.1;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-transform:uppercase}
.meta-info-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:5px;font-size:12px;line-height:1.2;color:#aeb9d6;font-weight:700}
.meta-rar{display:inline-block;padding:2px 8px;border-radius:3px;border:2px solid var(--bo-ink);background:var(--rc);color:var(--bo-dark);font-size:11px;font-weight:900;line-height:1.1;text-transform:uppercase;letter-spacing:.04em}
.meta-act{min-width:140px;max-width:178px;min-height:50px;flex-direction:column;gap:1px;padding:.35em .9em;font-size:16px;line-height:1.05;text-align:center}
.meta-act .meta-act-s{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:1}
.meta-act .meta-ico{width:22px;height:22px}.meta-act .meta-act-s .meta-ico{width:16px;height:16px}
.meta-act-row{display:inline-flex;align-items:center;gap:6px}

/* ---- Подарок дня: контейнеры гаража с hazard-лентой ---- */
.meta-daily{--w:680px}
.meta-days{position:relative;display:grid;grid-template-columns:repeat(6,minmax(0,1fr)) minmax(0,1.55fr);gap:8px;padding:18px 12px 28px;align-items:end;
  background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 40%),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 2px,transparent 2px 24px)}
.meta-days::after{content:'';position:absolute;left:0;right:0;bottom:0;height:14px;border-top:3px solid var(--bo-ink);background:var(--bo-hazard)}
.meta-day{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;--bc:#1ee3ff}
.meta-day-n{font-size:11px;font-weight:900;line-height:1.2;padding:1px 7px;border:2px solid var(--bo-ink);border-radius:3px;background:#f4f6fb;color:var(--bo-dark);box-shadow:0 2px 0 var(--bo-ink);white-space:nowrap;text-transform:uppercase;letter-spacing:.04em;position:relative;z-index:6}
.meta-day.is-today .meta-day-n{background:var(--bo-yellow)}
.meta-box{position:relative;width:100%;max-width:84px;aspect-ratio:1;isolation:isolate}
.meta-box-body{position:absolute;left:5%;right:5%;top:34%;bottom:0;border:3px solid var(--bo-ink);border-radius:3px;background-color:var(--bc);
  background-image:linear-gradient(180deg,rgba(255,255,255,.34),rgba(255,255,255,0) 38%,rgba(0,0,0,.26)),repeating-linear-gradient(90deg,rgba(0,0,0,.2) 0 3px,transparent 3px 9px)}
.meta-box-lid{position:absolute;left:0;right:0;top:15%;height:24%;border:3px solid var(--bo-ink);border-radius:3px;background-color:var(--bc);
  background-image:linear-gradient(180deg,rgba(255,255,255,.45),rgba(255,255,255,.04)),repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 3px,transparent 3px 9px);transform-origin:0 100%;transition:transform .35s}
.meta-box-rib{position:absolute;left:41%;width:18%;top:15%;bottom:0;background:var(--bo-hazard);border-inline:3px solid var(--bo-ink);z-index:1}
.meta-box-bow{position:absolute;left:50%;top:27%;width:26%;height:20%;transform:translateX(-50%);z-index:2;border:3px solid var(--bo-ink);border-radius:3px;background:linear-gradient(180deg,#f2f5fb,#98a4bc);transition:opacity .2s}
.meta-box-bow::after{content:'';position:absolute;left:50%;top:50%;width:34%;height:34%;margin:-17% 0 0 -17%;border-radius:50%;background:var(--bo-ink)}
.meta-day.is-claimed .meta-box-lid{transform:translate(-3%,-62%) rotate(-24deg)}
.meta-day.is-claimed .meta-box-bow{opacity:0}
.meta-day.is-locked .meta-box{filter:grayscale(.6) brightness(.85)}
.meta-day.is-today .meta-box{animation:meta-bounce 1.1s ease-in-out infinite}
.meta-day.is-today .meta-box::before{content:'';position:absolute;inset:-8%;border-radius:50%;background:radial-gradient(circle,rgba(255,214,0,.8),rgba(255,214,0,0) 68%);z-index:-1}
.meta-tick{position:absolute;left:50%;top:60%;width:44%;height:44%;transform:translate(-50%,-50%);z-index:3;object-fit:contain;filter:drop-shadow(0 2px 0 rgba(5,6,10,.7))}
.meta-day.is-7{--bc:#ffd600}
.meta-day.is-7 .meta-box-bow{display:none}
.meta-day.is-7 .meta-box{max-width:116px}
.meta-day.is-7 .meta-box::after{content:'';position:absolute;inset:-14%;z-index:-2;background:conic-gradient(from 0deg,rgba(255,214,0,.0),rgba(255,214,0,.45),rgba(255,214,0,0) 25%,rgba(255,214,0,.45) 50%,rgba(255,214,0,0) 75%,rgba(255,214,0,.45),rgba(255,214,0,0));border-radius:50%;animation:meta-spin 6s linear infinite;-webkit-mask-image:radial-gradient(circle,#000 38%,transparent 70%);mask-image:radial-gradient(circle,#000 38%,transparent 70%)}
.meta-day-rew{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px 5px;min-height:28px;max-width:100%;padding:2px 7px;border:2px solid rgba(255,255,255,.28);border-radius:4px;background:#090b12;color:#fff;font-size:13px;font-weight:800;line-height:1.1;text-align:center}
.meta-day-rew .meta-ico{width:18px;height:18px}
.meta-mini{position:relative;width:30px;height:30px;flex:none}
.meta-mini .meta-prev{border-radius:5px;border-width:2px}
.meta-mini .meta-fb{width:80%;height:80%;border-width:2px}
.meta-day.is-7 .meta-day-rew{flex-direction:column;font-size:12px;border-color:var(--bo-yellow)}
.meta-day.is-7 .meta-mini{width:46px;height:46px}
.meta-claim{display:flex;flex-direction:column;align-items:center;gap:9px;padding:12px 14px 16px;text-align:center}
.meta-claim-line{margin:0;font-size:15px;line-height:1.25;overflow-wrap:anywhere;font-weight:800;color:#e9eefc}
.meta-claim-btns{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;width:100%}
.meta-claim-btns .bo-btn{flex:1 1 190px;max-width:290px;min-height:54px;font-size:18px;flex-direction:column;gap:1px;line-height:1.05;text-align:center}
.meta-claim-btns .meta-act-s{display:inline-flex;align-items:center;gap:4px;font-size:12px}
.meta-next{display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;color:var(--bo-sky);font-variant-numeric:tabular-nums;text-shadow:0 0 .5em rgba(30,227,255,.5)}
.meta-next .meta-ico{width:26px;height:26px}
.meta-got{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.meta-gotit{display:flex;align-items:center;gap:6px;padding:4px 12px 4px 8px;border:2px solid rgba(255,255,255,.3);border-radius:4px;background:#090b12;color:#fff;font-size:16px;animation:meta-pop .5s}
.meta-gotit .meta-ico{width:26px;height:26px}
.meta-gotit .meta-mini{width:40px;height:40px}
.meta-gotit.is-big{background:var(--bo-yellow);color:var(--bo-dark);border-color:var(--bo-ink);font-size:18px}

/* ---- Колесо фортуны: автомобильный диск в шине ---- */
.meta-wheelwin{--w:800px}
.meta-wbody{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:clamp(14px,3vw,34px);padding:12px 18px 18px;overflow:auto;overscroll-behavior:contain}
.meta-wheel{--ws:clamp(172px,calc(100vh - 150px),430px);--ws:clamp(172px,calc(100dvh - 150px),430px);position:relative;flex:none;width:var(--ws);height:var(--ws);margin-top:16px}
.meta-rim{position:absolute;inset:0;border-radius:50%;border:4px solid var(--bo-ink);box-shadow:0 7px 0 var(--bo-ink);
  background:radial-gradient(circle closest-side,#1d2133 0 93%,transparent 93.5%),repeating-conic-gradient(#4a5068 0 3.2deg,#10121a 3.2deg 7.2deg)}
.meta-rim::after{content:'';position:absolute;inset:4.4%;border-radius:50%;border:2px solid rgba(255,255,255,.3);pointer-events:none}
.meta-disc{position:absolute;inset:6%;border-radius:50%;border:4px solid var(--bo-ink);box-shadow:inset 0 0 0 4px #e8eef5,inset 0 0 0 7px var(--bo-ink);will-change:transform}
.meta-spoke{position:absolute;left:50%;top:0;width:calc(var(--ws)*.058);height:50%;margin-left:calc(var(--ws)*-.029);background:var(--bo-ink);transform-origin:50% 100%;transform:rotate(var(--a));
  clip-path:polygon(24% 0,76% 0,100% 100%,0 100%)}
.meta-spoke::after{content:'';position:absolute;inset:0 3px;background:linear-gradient(90deg,#8d99ad,#f6f9fd 50%,#8d99ad);clip-path:polygon(26% 0,74% 0,100% 100%,0 100%)}
.meta-sec{position:absolute;inset:0;transform:rotate(var(--a));pointer-events:none}
.meta-sec-in{position:absolute;left:50%;top:12%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1px;color:#fff;font-weight:900;text-shadow:var(--bo-outline-thin);
  font-size:calc(var(--ws)*.056);line-height:1}
.meta-sec-in.is-lite{color:var(--bo-dark);text-shadow:0 1px 0 rgba(255,255,255,.4)}
.meta-sec-in .meta-ico{width:calc(var(--ws)*.092);height:calc(var(--ws)*.092)}
.meta-sec-in .meta-mini{width:calc(var(--ws)*.112);height:calc(var(--ws)*.112)}
.meta-hub{position:absolute;left:50%;top:50%;width:19%;height:19%;transform:translate(-50%,-50%);border-radius:50%;border:4px solid var(--bo-ink);
  background:radial-gradient(circle at 35% 30%,#fff,#cfd7e2 55%,#98a4b5);box-shadow:0 3px 0 rgba(5,6,10,.5);pointer-events:none;z-index:2}
.meta-hub::after{content:'';position:absolute;inset:33%;border-radius:50%;background:var(--bo-orange);border:3px solid var(--bo-ink)}
.meta-nut{position:absolute;left:50%;top:50%;width:15%;height:15%;margin:-7.5% 0 0 -7.5%;border-radius:50%;border:2px solid var(--bo-ink);
  background:radial-gradient(circle at 35% 30%,#fff,#9aa6ba);transform:rotate(var(--a)) translateY(-215%)}
.meta-pointer{position:absolute;left:50%;top:-6%;width:12%;aspect-ratio:.82;z-index:3;transform:translateX(-50%);transform-origin:50% 14%;background:var(--bo-ink);clip-path:polygon(0 0,100% 0,100% 46%,50% 100%,0 46%)}
.meta-pointer::after{content:'';position:absolute;inset:5px 5px 7px;clip-path:polygon(0 0,100% 0,100% 46%,50% 100%,0 46%);
  background:linear-gradient(180deg,rgba(255,255,255,.3) 0 30%,transparent 30%),conic-gradient(var(--bo-red) 25%,#fff 0 50%,var(--bo-red) 0 75%,#fff 0) 0 0/8px 8px}
.meta-pointer.kick{animation:meta-kick .16s ease-out}
@keyframes meta-kick{0%{transform:translateX(-50%) rotate(0)}35%{transform:translateX(-50%) rotate(-17deg)}100%{transform:translateX(-50%) rotate(0)}}
.meta-wctl{display:flex;flex-direction:column;gap:14px;align-items:stretch;width:min(310px,100%);flex:0 1 auto;text-align:center}
.meta-wctl .bo-btn{min-height:56px;font-size:17px;line-height:1.08;flex-direction:column;gap:1px}
.meta-wctl .meta-act-s{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:1.1}
.meta-prize{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:14px;background:rgba(4,5,9,.72);animation:meta-fade .2s}
.meta-prize-card{--hc:#ffd600;position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;width:min(340px,100%);padding:21px 21px 23px;text-align:center;animation:meta-pop .45s}
.meta-prize-ttl{font-size:26px;line-height:1}
.meta-prize-big{display:flex;align-items:center;justify-content:center;gap:8px;min-height:84px;font-size:34px;font-weight:900;line-height:1;color:var(--bo-yellow);text-shadow:0 0 .5em rgba(255,214,0,.5),0 2px 0 var(--bo-ink)}
.meta-prize-big .meta-ico{width:68px;height:68px}
.meta-prize-big .meta-mini{width:96px;height:96px}
.meta-prize-lbl{margin:0;font-size:16px;line-height:1.25;color:#e9eefc}

/* ---- Рекорды: табло ---- */
.meta-rec{--w:560px}
.meta-recbody{display:flex;flex-direction:column;gap:10px;padding:12px 14px 20px;min-height:0;overflow:auto;overflow-x:hidden;overscroll-behavior:contain}
.meta-login{align-self:center;min-height:52px;font-size:18px;--c:var(--bo-sky)}
.meta-tbl{position:relative;border:2px solid rgba(255,255,255,.3);border-radius:4px;background:#070910;color:#fff;box-shadow:0 5px 0 var(--bo-ink);overflow:hidden;min-height:96px}
.meta-tblh{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8fa0c8;background:#141829;border-bottom:2px solid #000}
.meta-tblh span:first-child{width:44px;text-align:center}.meta-tblh span:nth-child(2){flex:1;padding-left:52px}
.meta-rows{max-height:min(48vh,380px);overflow:auto;overscroll-behavior:contain}
.meta-row{display:grid;grid-template-columns:44px 40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 12px;border-bottom:2px dashed rgba(255,255,255,.14)}
.meta-row:last-child{border-bottom:0}
.meta-row.is-me{background:rgba(255,214,0,.16)}
.meta-rank{min-width:40px;padding:3px 0;border:3px solid var(--bo-dark);border-radius:5px;background:#f4f6fb;color:var(--bo-dark);font-size:15px;font-weight:900;line-height:1.1;text-align:center;box-shadow:0 2px 0 rgba(0,0,0,.5)}
.meta-row.r1 .meta-rank{background:var(--bo-yellow)}.meta-row.r2 .meta-rank{background:#cfd8e6}.meta-row.r3 .meta-rank{background:#f0a15e}
.meta-ava{width:40px;height:40px;border-radius:50%;border:3px solid #fff;background:var(--ac,#5b6788);object-fit:cover;display:grid;place-items:center;font-size:17px;color:#fff;text-shadow:var(--bo-outline-thin);overflow:hidden}
.meta-name{min-width:0;font-size:16px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta-name small{margin-left:6px;padding:1px 6px;border-radius:3px;background:var(--bo-yellow);color:var(--bo-dark);font-size:11px;font-weight:900;vertical-align:1px;text-transform:uppercase}
.meta-score{font-size:18px;font-weight:900;color:var(--bo-yellow);white-space:nowrap;font-variant-numeric:tabular-nums;text-shadow:0 0 .5em rgba(255,214,0,.35)}
.meta-state{display:grid;place-items:center;gap:12px;padding:26px 16px;min-height:130px;text-align:center;font-size:16px;line-height:1.3}
.meta-spin{width:38px;height:38px;border:5px solid rgba(255,255,255,.2);border-top-color:var(--bo-orange);border-radius:50%;animation:meta-spin .8s linear infinite}

/* ---- Настройки ---- */
.meta-set{--w:480px}
.meta-setbody{display:grid;gap:14px;padding:14px 16px 20px;overflow:auto;overflow-x:hidden;overscroll-behavior:contain}
.meta-set-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:2px solid rgba(255,255,255,.2);border-left:5px solid var(--bo-orange);border-radius:4px;background:rgba(255,255,255,.05);box-shadow:0 4px 0 rgba(5,6,10,.6)}
.meta-set-row>.meta-ico{width:38px;height:38px}
.meta-set-lbl{flex:1;min-width:0;font-size:18px;font-weight:900;line-height:1.1;text-transform:uppercase}
.meta-set-lbl small{display:block;margin-top:3px;font-size:12px;font-weight:700;color:#9aa8cc;text-transform:none}
.meta-set-row.is-col{flex-direction:column;align-items:stretch;gap:10px;border-left-color:var(--bo-sky)}
.meta-set-head{display:flex;align-items:center;gap:12px}
.meta-set-row.is-dis{opacity:.5}
.meta-sw{position:relative;flex:none;width:78px;height:44px;padding:0;border:2px solid rgba(255,255,255,.5);border-radius:5px;background:#252b40;cursor:pointer;transition:background .15s;transform:skewX(-11deg);box-shadow:0 0 0 2px var(--bo-ink),0 4px 0 2px var(--bo-ink)}
.meta-sw::after{content:'';position:absolute;top:3px;left:3px;width:32px;height:34px;border-radius:3px;background:linear-gradient(180deg,#f4f7fc,#9ca8c0);border:2px solid var(--bo-ink);transition:transform .15s}
.meta-sw.is-on{background:var(--bo-green)}.meta-sw.is-on::after{transform:translateX(34px)}
.meta-sw[disabled]{cursor:default}
.meta-seg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;width:100%}
.meta-seg .bo-btn{--c:#5b6788;min-height:46px;padding:.3em .2em;font-size:14px}
.meta-seg .bo-btn::after{display:none}
.meta-seg .bo-btn.is-on{--c:var(--bo-sky)}
.meta-how{--c:var(--bo-orange);min-height:54px;font-size:18px;width:100%}
.meta-how .meta-ico{width:30px;height:30px}
.meta-ver{margin:0;text-align:center;font-size:11px;font-weight:700;color:#6f7ca4;letter-spacing:.05em}

/* ---- Портрет: Гараж — нижний лист, вкладки — флажки на верёвке ---- */
@media (orientation:portrait){
  .meta-root[data-win="garage"] .meta-dim{background:linear-gradient(180deg,rgba(4,5,9,0) 35%,rgba(4,5,9,.6))}
  .meta-garage{top:auto;left:var(--m-l);right:var(--m-r);width:auto;height:min(64%,600px);flex-direction:column}
  .meta-tabs{flex-direction:row;justify-content:center;gap:5px;padding:0 6px;margin:0;align-items:flex-end}
  .meta-tabs::before{content:'';position:absolute;left:3px;right:3px;top:7px;height:5px;border-radius:2px;background:var(--bo-hazard);border:1px solid var(--bo-ink)}
  .meta-tab{z-index:1}
  .meta-tab{flex:1 1 0;width:auto;max-width:92px;min-height:64px;max-height:none;
    clip-path:polygon(0 0,100% 0,100% calc(100% - 15px),50% 100%,0 calc(100% - 15px))}
  .meta-tab-in{inset:0 3px 6px 3px;padding:0 0 10px;clip-path:polygon(0 0,100% 0,100% calc(100% - 13px),50% 100%,0 calc(100% - 13px))}
  .meta-tab.is-on{transform:translateY(-6px)}
  .meta-info{grid-template-columns:minmax(0,1fr) auto}
  .meta-days{grid-template-columns:repeat(3,minmax(0,1fr))}
  .meta-day.is-7{grid-column:1/-1}
  .meta-day.is-7 .meta-box{max-width:120px}
}
@media (orientation:portrait) and (min-width:700px){
  .meta-days{grid-template-columns:repeat(6,minmax(0,1fr)) minmax(0,1.55fr)}
  .meta-day.is-7{grid-column:auto}
}
@media (orientation:portrait){
  .meta-wbody{flex-direction:column;padding-top:8px}
  .meta-wheel{--ws:min(calc(100vw - 60px),410px,calc(100vh - 400px));--ws:min(calc(100vw - 60px),410px,calc(100dvh - 400px));min-width:172px;min-height:172px}
}
@media (orientation:portrait) and (max-width:420px){
  .meta-row{grid-template-columns:40px 36px minmax(0,1fr) auto;gap:8px}
  .meta-tblh span:first-child{width:40px}.meta-tblh span:nth-child(2){padding-left:44px}
  .meta-ava{width:36px;height:36px}
  .meta-claim-btns{gap:12px}
}

/* ---- Низкий альбомный экран (640x360, 568x320, 800x360) ---- */
@media (max-height:430px) and (orientation:landscape){
  .meta-bar{padding:6px 8px 6px 12px;gap:8px}
  .meta-ttl{font-size:20px}
  .bo-btn.meta-x{width:44px;height:44px;font-size:20px}
  .bo-btn.meta-reset{width:44px;height:44px}
  .meta-ribbon{height:9px}
  .meta-tabs{padding-top:50px;gap:5px}
  .meta-tab{width:52px;flex-basis:52px;min-height:44px;max-height:56px}
  .meta-tab-lbl,.meta-tab-cnt{display:none}
  .meta-tab-in{padding-right:6px}
  .meta-tab-ico{width:28px}
  .meta-shelf{padding:16px 8px 10px}
  .meta-grid{--cw:80px;gap:18px 8px}
  .meta-card-name{font-size:10.5px;min-height:2.3em}
  .meta-chip.is-ads .meta-pip{width:9px;height:9px}
  .meta-info{min-height:0;padding:6px 12px;gap:4px 10px}
  .meta-info-name{font-size:14px;-webkit-line-clamp:1}
  .meta-info-sub{margin-top:3px}
  .meta-act{min-width:136px;min-height:44px;font-size:14px}
  .meta-days{padding:10px 10px 26px;gap:5px}
  .meta-box{max-width:62px}
  .meta-day.is-7 .meta-box{max-width:72px}
  .meta-day.is-7 .meta-day-rew{flex-direction:row;font-size:11px}
  .meta-day.is-7 .meta-mini{width:34px;height:34px}
  .meta-day-rew{font-size:11px;min-height:22px;padding:1px 4px}
  .meta-day-rew .meta-ico{width:14px;height:14px}
  .meta-day-n{font-size:10px}
  .meta-claim{padding:8px 12px 10px;gap:6px}
  .meta-claim-btns .bo-btn{min-height:46px;font-size:16px}
  .meta-wheel{--ws:clamp(150px,calc(100vh - 122px),430px);--ws:clamp(150px,calc(100dvh - 122px),430px);margin-top:12px}
  .meta-wbody{padding:6px 14px 10px}
  .meta-wctl .bo-btn{min-height:48px;font-size:15px}
  .meta-recbody{padding:8px 12px 14px;gap:8px}
  .meta-rows{max-height:calc(100vh - 150px)}
  .meta-row{padding:4px 10px}
  .meta-setbody{grid-template-columns:1fr 1fr;gap:10px;padding:10px 14px 16px}
  .meta-set-row{padding:7px 10px}
  .meta-set-row.is-col{grid-column:1/-1;flex-direction:row;align-items:center}
  .meta-set-row.is-col .meta-set-head{flex:0 0 auto}
  .meta-set-row.is-col .meta-seg{flex:1;min-width:0;width:auto;gap:10px}
  .meta-seg .bo-btn{font-size:13px;min-height:44px}
  .meta-how{grid-column:1/-1;min-height:48px}
  .meta-ver{display:none}
  .meta-set-lbl{font-size:16px}
  .meta-sw{width:68px;height:44px}.meta-sw::after{width:28px;height:34px}.meta-sw.is-on::after{transform:translateX(30px)}
}
@media (max-height:340px) and (orientation:landscape){
  .meta-claim .meta-hint{display:none}
  .meta-prize-card{padding:13px 17px 15px;gap:6px}
  .meta-prize-big{min-height:60px}.meta-prize-big .meta-mini{width:64px;height:64px}.meta-prize-big .meta-ico{width:48px;height:48px}
}
@media (prefers-reduced-motion:reduce){
  .meta-root *:not(.meta-disc){animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important}
}

/* ---- Monster Truck Sky Obby: стальной стиль окон (переопределения поверх базовых правил) ---- */
.meta-root{font:600 16px var(--bo-text);color:#e9edf3}
.meta-root *{scrollbar-color:#6b7482 #0b0c0f}
.meta-dim{background:radial-gradient(120% 95% at 50% 38%,rgba(8,9,12,.5),rgba(4,5,8,.9)),repeating-linear-gradient(45deg,rgba(255,255,255,.02) 0 3px,transparent 3px 9px)}
.meta-garage{--hc:#ff7a1a}.meta-daily{--hc:#8fd634}.meta-wheelwin{--hc:#3fc7ff}.meta-rec{--hc:#ffc400}.meta-set{--hc:#ff7a1a}
.meta-bar{background-color:#23272e;background-image:linear-gradient(100deg,var(--hc,#ff7a1a) 0 70%,transparent 70.3%),var(--bo-carbon)}
.meta-ttl{font-size:clamp(18px,4.2vw,28px)}
.meta-ribbon{height:12px}
.meta-coins{font-weight:400}
.meta-coins::before{transform:none;border-radius:4px;background:#0d0f12;border-color:rgba(255,255,255,.35);box-shadow:0 0 0 2px var(--bo-ink),inset 0 0 10px rgba(255,196,0,.14)}
.meta-sw{transform:none}
.meta-toast{border-left-color:var(--bo-yellow);background:#14161a;font:600 14px var(--bo-text)}
.meta-hint,.meta-card-name,.meta-info-sub,.meta-chip,.meta-tab-cnt,.meta-set-lbl small,.meta-claim-line,.meta-prize-lbl,.meta-day-rew,.meta-name,.meta-ver,.meta-tblh,.meta-state{font-family:var(--bo-text);font-weight:700}
.meta-card{background-color:#23272e;border:3px solid var(--bo-ink);border-radius:5px;box-shadow:0 4px 0 var(--bo-ink),inset 0 0 0 2px rgba(255,255,255,.14)}
.meta-card.is-sel{border-color:var(--bo-yellow);box-shadow:0 9px 0 var(--bo-ink),0 0 16px rgba(255,196,0,.55),inset 0 0 0 2px rgba(255,255,255,.14)}
.meta-card.is-sel::before{background:var(--bo-yellow)}
.meta-card-top>span:first-child{background:linear-gradient(180deg,#d6dbe2,#9aa2ad);font-family:var(--bo-font);font-weight:400}
.meta-shelf{background-color:#101216;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.025) 0 2px,transparent 2px 9px)}
.meta-info{background:#14161a}
.meta-info-name{font-weight:400}
.meta-rar{font-family:var(--bo-text);font-weight:800}
.meta-set-row{border-left-color:var(--bo-yellow)}
.meta-set-lbl{font-weight:400}
.meta-pointer::after{background:linear-gradient(180deg,rgba(255,255,255,.3) 0 30%,transparent 30%),conic-gradient(var(--bo-yellow) 25%,var(--bo-ink) 0 50%,var(--bo-yellow) 0 75%,var(--bo-ink) 0) 0 0/8px 8px}
/* вкладки Гаража: стальные плиты сверху окна; окно слева, трак справа (альбом) */
@media (orientation:landscape){
  .meta-root[data-win="garage"] .meta-dim{background:linear-gradient(270deg,rgba(4,5,8,0) 30%,rgba(4,5,8,.62))}
  .meta-garage{right:auto;left:var(--m-l);flex-direction:column}
  .meta-tabs{flex-direction:row;padding:0 8px;margin:0 0 -7px;gap:5px;align-items:flex-end}
  .meta-tab{width:auto;flex:1 1 0;max-width:118px;min-height:60px;max-height:none;clip-path:none;border-radius:9px 9px 0 0}
  .meta-tab-in{position:absolute;inset:3px 3px 0 3px;padding:0 0 8px;clip-path:none;border-radius:7px 7px 0 0}
  .meta-tab.is-on{transform:translateY(-7px)}
  .meta-board{z-index:1}
}
@media (max-height:430px) and (orientation:landscape){
  .meta-tabs{padding-top:0}
  .meta-tab{min-height:42px;max-height:46px;width:auto;flex-basis:0}
  .meta-tab-lbl,.meta-tab-cnt{display:none}
  .meta-tab-in{padding:0}
}
@media (orientation:portrait){
  .meta-tab{clip-path:none;border-radius:8px 8px 0 0;max-width:80px;min-height:56px}
  .meta-tab-in{clip-path:none;inset:3px 3px 0 3px;padding:0 0 4px;border-radius:6px 6px 0 0}
  .meta-tabs{padding:0 4px}
  .meta-tab-lbl{font-size:9px}
}
/* тюнинг: три строки с клёпками, штрихами уровня и кнопкой покупки */
.meta-tune{display:flex;flex-direction:column;gap:14px;padding:6px 4px}
.meta-tune-row{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;background:var(--bo-rivets),var(--bo-carbon);background-color:#23272e;border:3px solid var(--bo-ink);border-radius:6px;box-shadow:0 4px 0 var(--bo-ink),inset 0 0 0 2px rgba(255,255,255,.14)}
.meta-tune-ico{display:grid;place-items:center;width:54px;height:54px;border:3px solid var(--bo-ink);border-radius:8px;background:linear-gradient(180deg,#ffd24a,#ff9a1a)}
.meta-tune-ico .meta-svg{width:36px;height:36px}
.meta-tune-name{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-size:18px;text-transform:uppercase;color:#fff;text-shadow:var(--bo-outline-thin)}
.meta-tune-name small{font:700 12px var(--bo-text);color:var(--bo-yellow);text-shadow:none;letter-spacing:.04em}
.meta-pips{display:flex;gap:5px;margin:6px 0 5px}
.meta-pips i{width:26px;height:10px;border:2px solid var(--bo-ink);border-radius:2px;background:#0d0f12}
.meta-pips i.on{background:repeating-linear-gradient(-45deg,var(--bo-orange) 0 5px,var(--bo-yellow) 5px 10px);box-shadow:0 0 6px rgba(255,196,0,.5)}
.meta-tune-desc{font:600 13px/1.25 var(--bo-text);color:#aab4c4}
.meta-tune-buy{min-width:118px;flex-direction:column;gap:1px;padding:.35em .8em .6em;font-size:15px}
.meta-tune-buy .meta-act-s{display:inline-flex;align-items:center;gap:4px;font-size:13px}
@media (orientation:portrait){.meta-tune-row{grid-template-columns:auto minmax(0,1fr)}.meta-tune-buy{grid-column:1/-1}}
@media (max-height:430px) and (orientation:landscape){.meta-tune{gap:8px}.meta-tune-row{padding:7px 10px}.meta-tune-ico{width:42px;height:42px}.meta-tune-desc{display:none}}
`;
// ================================================================================================
// ГАРАЖ — магазин косметики: стенд с бирками-номерками, вкладки-флажки, примерка на машине и водителе
// ================================================================================================
/** @satisfies {Record<string, any>} */
const MetaGarage = {
    /** @type {any} */ el: {},
    tab: '',
    sel: '',
    busy: false,
    /** Примерка: слот -> id (по событиям Shop). @type {Record<string, string>} */ prev: {},
    _soon: false,
    _off: [],

    open(host) {
        const E = MetaKit.el, T = MetaKit.t;
        this.busy = false;
        this.prev = {};
        const tabs = Shop.tabs();
        if (!tabs.some((t) => t.id === this.tab) && this.tab !== 'tuning') this.tab = tabs[0] ? tabs[0].id : '';
        this.sel = this.tab === 'tuning' ? '' : this._equippedOf(this.tab);
        this.el = {};
        const el = this.el;
        el.win = E('section', 'meta-win meta-garage', { role: 'dialog', 'aria-modal': 'true', 'aria-label': T('meta.garage') });
        el.tabs = E('nav', 'meta-tabs', { role: 'tablist' });
        el.title = E('h2', 'meta-ttl bo-title', { text: T('meta.garage') });
        el.reset = E('button', 'bo-btn round meta-reset', { type: 'button', title: T('meta.resetLook'), 'aria-label': T('meta.resetLook') }, MetaKit.ico('restart'));
        el.coins = E('div', 'bo-bib meta-coins', {}, MetaKit.ico('coin'), E('b', '', { text: '0' }));
        el.close = E('button', 'bo-btn round meta-x', { type: 'button', 'aria-label': T('meta.close') }, MetaKit.ico('close'));
        el.grid = E('div', 'meta-grid', { role: 'list' });
        el.shelf = E('div', 'meta-shelf', {}, el.grid);
        el.info = E('footer', 'meta-info');
        const board = E('div', 'meta-board bo-panel', {},
            E('header', 'meta-bar', {}, el.title, el.reset, el.coins, el.close),
            E('div', 'meta-ribbon'), el.shelf, el.info);
        el.win.append(el.tabs, board);
        host.append(el.win);
        el.close.addEventListener('click', () => Meta.close());
        el.reset.addEventListener('click', () => { Shop.clearPreview(); this.sel = this.tab === 'tuning' ? '' : this._equippedOf(this.tab); this.refresh(); });
        el.tabs.addEventListener('click', (e) => {
            const b = /** @type {HTMLElement} */ (e.target).closest('.meta-tab');
            if (b) this.setTab(b.getAttribute('data-tab'));
        });
        el.grid.addEventListener('click', (e) => {
            const b = /** @type {HTMLElement} */ (e.target).closest('.meta-card');
            if (b) this.pick(b.getAttribute('data-id'));
        });
        this._off = [
            Shop.on((e) => this.onShop(e)),
            typeof Ads !== 'undefined' ? Ads.on(() => this.paintAction()) : () => {},
        ];
        this.refresh();
    },

    close() {
        for (const off of this._off) { try { off(); } catch (e) { /* уже снято */ } }
        this._off = [];
        Shop.clearPreview();
        this.prev = {};
        this.el = {};
    },

    _slotOf(tab) {
        const first = Shop.items(tab)[0];
        return first ? Shop.slotOf(first) : tab;
    },

    /** Что показать выбранным при входе во вкладку: примеряемое или надетое в её слоте. */
    _equippedOf(tab) {
        const slot = this._slotOf(tab);
        return (this.prev && this.prev[slot]) || Shop.equippedId(slot) || '';
    },

    setTab(id) {
        if (!id || id === this.tab) return;
        this.tab = id;
        this.sel = id === 'tuning' ? '' : this._equippedOf(id);
        this.refresh();
        if (this.el.shelf) this.el.shelf.scrollTop = 0;
    },

    pick(id) {
        if (!id) return;
        this.sel = id;
        Shop.preview(id);
        this.refresh();
        const b = this.el.grid && this.el.grid.querySelector('.meta-card.is-sel');
        if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },

    onShop(e) {
        if (!this.el.win) return;
        if (e.type === 'preview') { if (e.id) this.prev[e.slot] = e.id; else delete this.prev[e.slot]; }
        if (e.type === 'coins') { const c = this.el.coins; c.classList.remove('is-bump'); void c.offsetWidth; c.classList.add('is-bump'); }
        this.refreshSoon();
    },

    /** Несколько событий за раз (покупка = grant + coins + equip) — одна перерисовка. */
    refreshSoon() {
        if (this._soon) return;
        this._soon = true;
        Promise.resolve().then(() => { this._soon = false; this.refresh(); });
    },

    refresh() {
        if (!this.el.win) return;
        this.paintTabs();
        this.paintCoins();
        this.paintGrid();
        this.paintInfo();
        this.el.reset.hidden = !Object.keys(this.prev).length;
    },

    paintCoins() { MetaKit.q(this.el.coins, 'b').textContent = MetaKit.num(Shop.coins); },

    paintTabs() {
        const E = MetaKit.el;
        const box = this.el.tabs;
        box.replaceChildren();
        for (const t of Shop.tabs()) {
            const data = t.data || {};
            const on = t.id === this.tab;
            const b = E('button', 'meta-tab' + (on ? ' is-on' : ''), {
                type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', 'data-tab': t.id, 'aria-label': t.name + ' ' + t.owned + '/' + t.count,
                style: { '--c': MetaKit.hex(data.color != null ? data.color : 0x5b6788) },
            }, E('span', 'meta-tab-in', {}, MetaKit.tabIcon(data.icon), E('span', 'meta-tab-lbl', { text: t.name }), E('span', 'meta-tab-cnt', { text: t.owned + '/' + t.count })));
            box.append(b);
        }
        // вкладка тюнинга (не предметы магазина): уровни Подвески, Мотора и Брони
        const on = this.tab === 'tuning';
        const lv = this._tuneKeys.reduce((a, k) => a + (this._tune(k).level | 0), 0), mx = this._tuneKeys.reduce((a, k) => a + (this._tune(k).max | 0), 0);
        box.append(E('button', 'meta-tab' + (on ? ' is-on' : ''), {
            type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', 'data-tab': 'tuning', 'aria-label': MetaKit.t('meta.tuning'),
            style: { '--c': '#8fd634' },
        }, E('span', 'meta-tab-in', {}, MetaKit.svg('tune', 'meta-tab-ico'), E('span', 'meta-tab-lbl', { text: MetaKit.t('meta.tuning') }), E('span', 'meta-tab-cnt', { text: lv + '/' + mx }))));
    },

    _tuneKeys: ['susp', 'motor', 'armor'],
    _tune(key) {
        const g = MetaKit.game();
        return g && typeof g.tuneInfo === 'function' ? g.tuneInfo(key) : { key, level: 0, max: 5, price: 0, step: 0.05, maxed: false, canBuy: false };
    },

    paintGrid() {
        const E = MetaKit.el;
        const grid = this.el.grid;
        grid.replaceChildren();
        if (this.tab === 'tuning') {
            grid.className = 'meta-tune';
            for (const key of this._tuneKeys) grid.append(this.tuneRow(key));
            return;
        }
        grid.className = 'meta-grid';
        Shop.cards(this.tab).forEach((c, i) => grid.append(this.card(c, i)));
        MetaKit.fillThumbs(grid);
    },

    /** Строка улучшения: значок, название и описание, штрихи уровня, цена и кнопка. */
    tuneRow(key) {
        const E = MetaKit.el, T = MetaKit.t;
        const t = this._tune(key);
        const pips = E('span', 'meta-pips');
        for (let i = 0; i < t.max; i++) pips.append(E('i', i < t.level ? 'on' : ''));
        const btn = E('button', 'bo-btn meta-tune-buy', { type: 'button', 'data-key': key });
        if (t.maxed) { btn.disabled = true; btn.classList.add('is-off'); btn.style.setProperty('--c', '#8a96a8'); btn.append(E('span', '', { text: T('tune.max') })); }
        else {
            btn.style.setProperty('--c', t.canBuy ? 'var(--bo-orange)' : '#8a96a8');
            if (!t.canBuy) btn.classList.add('is-off');
            btn.append(E('span', 'meta-act-row', {}, E('span', '', { text: T('tune.buy') })), E('span', 'meta-act-s', {}, MetaKit.ico('coin'), MetaKit.num(t.price)));
            btn.addEventListener('click', () => this.tuneBuy(key));
        }
        const desc = T('tune.' + key + '.d', { p: Math.round(t.step * 100) });
        return E('div', 'meta-tune-row', { 'data-key': key }, E('span', 'meta-tune-ico', {}, MetaKit.svg('tune', 'meta-tab-ico')),
            E('div', 'meta-tune-txt', {}, E('div', 'meta-tune-name', {}, E('span', '', { text: T('tune.' + key) }), E('small', '', { text: T('tune.level', { a: t.level, b: t.max }) })), pips, E('div', 'meta-tune-desc', { text: desc })), btn);
    },

    tuneBuy(key) {
        const g = MetaKit.game();
        const r = g && typeof g.tuneBuy === 'function' ? g.tuneBuy(key) : null;
        if (r && r.ok) { MetaKit.toast(MetaKit.t('tune.bought', { name: MetaKit.t('tune.' + key), n: r.level })); MetaKit.confetti(this.el.win, 14); }
        else if (r && r.reason === 'noCoins') MetaKit.toast(MetaKit.t('shop.noCoins', { n: r.missing }));
        this.refresh();
    },

    card(c, i) {
        const E = MetaKit.el;
        const r = MetaKit.rarity(c.rarity);
        const prev = MetaKit.preview(c.item);
        prev.setAttribute('data-r', c.rarity);
        if (!c.owned) prev.append(MetaKit.ico('lock', 'meta-lock'));
        const dots = E('span', 'meta-rdots');
        for (let k = 0; k <= r.n; k++) dots.append(E('i'));
        return E('button', 'meta-card' + (c.id === this.sel ? ' is-sel' : '') + (c.equipped ? ' is-eq' : '') + (c.owned ? '' : ' is-locked'), {
            type: 'button', role: 'listitem', 'data-id': c.id, 'aria-pressed': c.id === this.sel ? 'true' : 'false',
            'aria-label': c.name + ', ' + (c.priceLabel || c.rarityLabel),
            style: { '--rc': r.c },
        }, E('span', 'meta-card-top', {}, E('span', '', { text: '№ ' + String(i + 1).padStart(2, '0') }), dots), prev,
        E('span', 'meta-card-name', { text: c.name }), MetaKit.chip(c));
    },

    paintInfo() {
        const E = MetaKit.el, T = MetaKit.t;
        const box = this.el.info;
        box.replaceChildren();
        this.el.act = null;
        if (this.tab === 'tuning') { box.append(E('div', 'meta-info-txt', {}, E('div', 'meta-info-name', { text: T('meta.tuning') }), E('div', 'meta-info-sub', { text: T('meta.tuneHint') }))); return; }
        const c = this.sel ? Shop.card(this.sel) : null;
        if (!c) { box.append(E('div', 'meta-info-name', { text: T('meta.pick') })); return; }
        const r = MetaKit.rarity(c.rarity);
        const sub = E('div', 'meta-info-sub', {}, E('span', 'meta-rar', { style: { '--rc': r.c }, text: c.rarityLabel }));
        // под названием: состояние; цена и прогресс просмотров — на кнопке и в подписи («За рекламу 2/5»)
        if (c.owned) sub.append(E('span', '', { text: c.priceLabel }));
        else if (c.kind === 'exclusive') sub.append(E('span', '', { text: T('daily.exclusiveHint') }));
        else if (c.kind === 'ads') sub.append(E('span', '', { text: MetaKit.adsOn() ? c.priceLabel : T('meta.noAds') }));
        else if (c.kind === 'coins' && c.hint) sub.append(E('span', '', { text: c.hint }));
        box.append(E('div', 'meta-info-txt', {}, E('div', 'meta-info-name', { text: c.name }), sub));
        if (c.action === 'none' || (c.action === 'watch' && !MetaKit.adsOn())) return;
        const btn = E('button', 'bo-btn meta-act', { type: 'button', 'data-act': c.action });
        btn.addEventListener('click', () => this.act());
        this.el.act = btn;
        this.fillAction(btn, c);
        box.append(btn);
    },

    /** Подпись, цвет и доступность главной кнопки по карточке; зовётся и при смене паузы рекламы (без перерисовки сетки). */
    fillAction(btn, c) {
        const E = MetaKit.el;
        let color = 'var(--bo-green)', main = c.actionLabel, sub = null, off = !c.enabled;
        if (c.action === 'unequip') color = '#8a96a8';
        else if (c.action === 'buy') {
            color = 'var(--bo-orange)';
            main = MetaKit.t('shop.buy');
            sub = E('span', 'meta-act-s', {}, MetaKit.ico('coin'), MetaKit.num(c.price));
        } else if (c.action === 'watch') {
            color = 'var(--bo-sky)';
            const wait = MetaKit.adWait(c.adWait);
            if (wait > 0) { off = true; main = MetaKit.waitText(wait); }
            else if (!MetaKit.adsReady()) off = true;
        }
        if (this.busy) off = true;
        btn.style.setProperty('--c', color);
        btn.disabled = off;
        btn.classList.toggle('is-off', off);
        btn.replaceChildren(...[E('span', 'meta-act-row', {}, c.action === 'watch' ? MetaKit.ico('ad') : null, main), sub].filter(Boolean));
    },

    paintAction() {
        const btn = this.el && this.el.act;
        if (!btn || !this.sel) return;
        const c = Shop.card(this.sel);
        if (c && c.action === btn.getAttribute('data-act')) this.fillAction(btn, c);
    },

    async act() {
        if (this.busy || !this.sel) return;
        const c = Shop.card(this.sel);
        if (!c || !c.enabled) return;
        if (c.action === 'watch' && (MetaKit.adWait(c.adWait) > 0 || !MetaKit.adsReady())) { this.paintAction(); return; }
        const id = c.id, action = c.action;
        this.busy = true;
        this.paintAction();
        let r = null;
        try { r = await Shop.act(id); } catch (e) { r = { ok: false, reason: 'error' }; }
        this.busy = false;
        if (Meta.current() !== 'garage' || !this.el.win) return;
        this.report(action, id, r);
        this.refresh();
        if (r && r.ok && (action === 'buy' || r.unlocked)) {
            const b = this.el.grid.querySelector('.meta-card[data-id="' + id + '"]');
            if (b) { b.classList.add('is-pop'); MetaKit.confetti(this.el.win, 22); }
        }
    },

    report(action, id, r) {
        const name = Shop.name(id);
        if (!r || !r.ok) {
            if (action === 'watch') MetaKit.toast(MetaKit.t('meta.adFail'));
            else if (r && r.reason === 'noCoins') MetaKit.toast(MetaKit.t('shop.noCoins', { n: r.missing }));
            return;
        }
        if (action === 'buy') MetaKit.toast(MetaKit.t('meta.bought', { name }));
        else if (action === 'watch') MetaKit.toast(r.unlocked ? MetaKit.t('meta.unlocked', { name }) : MetaKit.t('meta.adCounted', { a: r.progress, b: r.need }));
        else if (action === 'equip') MetaKit.toast(MetaKit.t('meta.equipped', { name }));
    },

    /** Свободная область экрана рядом с окном (куда ядро ставит машину): слева в альбоме, сверху в портрете. */
    freeArea() {
        const w = this.el && this.el.win;
        if (!w) return null;
        const r = w.getBoundingClientRect();
        const W = window.innerWidth, H = window.innerHeight;
        // вкладки-флажки торчат из окна: свободно только то, что левее/выше и их тоже
        const t = this.el.tabs ? this.el.tabs.getBoundingClientRect() : null;
        const left = Math.min(r.left, t && t.width ? t.left : r.left), top = Math.min(r.top, t && t.height ? t.top : r.top);
        if (r.width >= W * 0.92) return { x: 0, y: 0, w: W, h: Math.max(0, top) };
        // окно у левого края (альбом): свободно справа от него; у правого — слева
        if (r.left + r.width / 2 < W / 2) { const rr = Math.max(r.right, t && t.width ? t.right : r.right); return { x: rr, y: 0, w: Math.max(0, W - rr), h: H }; }
        return { x: 0, y: 0, w: Math.max(0, left), h: H };
    },
};

// ================================================================================================
// ПОДАРОК ДНЯ — семь клетчатых коробок на ленте финиша
// ================================================================================================
/** @satisfies {Record<string, any>} */
const MetaDaily = {
    /** @type {any} */ el: {},
    busy: false,
    got: null,
    _timer: 0,
    _can: false,
    _off: null,
    COLORS: ['#1ee3ff', '#ff6b1a', '#b6ff3b', '#ff2d55', '#8d9ab5', '#ffd600', '#ffd600'],

    open(host) {
        const E = MetaKit.el, T = MetaKit.t;
        this.busy = false;
        this.got = null;
        this.el = {};
        const el = this.el;
        el.win = E('section', 'meta-win meta-daily bo-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': T('meta.daily') });
        el.close = E('button', 'bo-btn round meta-x', { type: 'button', 'aria-label': T('meta.close') }, MetaKit.ico('close'));
        el.days = E('div', 'meta-days', { role: 'list' });
        el.claim = E('div', 'meta-claim');
        el.win.append(
            E('header', 'meta-bar', {}, MetaKit.ico('gift', 'meta-bar-ico'), E('h2', 'meta-ttl bo-title', { text: T('meta.daily') }), el.close),
            E('div', 'meta-ribbon'),
            E('div', 'meta-body', {}, el.days, el.claim));
        host.append(el.win);
        el.close.addEventListener('click', () => Meta.close());
        this._can = DailyGift.canClaim();
        this._off = typeof Ads !== 'undefined' ? Ads.on(() => this.patchX2()) : null;
        this._timer = window.setInterval(() => this.tick(), 1000);
        this.refresh();
    },

    close() {
        window.clearInterval(this._timer);
        this._timer = 0;
        if (this._off) this._off();
        this._off = null;
        this.el = {};
    },

    tick() {
        if (!this.el.win) return;
        const can = DailyGift.canClaim();
        if (can !== this._can) { this._can = can; this.got = null; this.refresh(); return; }
        if (this.el.next) this.el.next.textContent = DailyGift.status().nextLabel;
        this.patchX2();
    },

    refresh() {
        if (!this.el.win) return;
        const v = DailyGift.view();
        this.paintDays(v);
        this.paintClaim(v);
    },

    /** Награда в виде значков: монеты, предмет-превью, случайные предметы, эксклюзив. */
    rewardNodes(reward) {
        const E = MetaKit.el, out = [];
        const item = (id) => {
            const it = Shop.item(id);
            if (!it) return null;
            const m = E('span', 'meta-mini', { title: Shop.name(id) }, MetaKit.preview(it));
            return m;
        };
        if (reward.exclusive) { const m = item(reward.exclusive); if (m) out.push(m, E('span', '', { text: Shop.name(reward.exclusive) })); }
        if (reward.coins > 0) out.push(E('span', 'meta-rew-c', {}, MetaKit.ico(reward.big ? 'coinsPile' : 'coin'), MetaKit.num(reward.coins)));
        if (reward.item) { const m = item(reward.item); if (m) out.push(m); }
        if (reward.randomItems > 0) out.push(E('span', 'meta-rew-c', { title: DailyGift.t('reward.randomItem') }, MetaKit.ico('gift'), reward.randomItems > 1 ? '×' + reward.randomItems : null));
        return out;
    },

    paintDays(v) {
        const E = MetaKit.el;
        const box = this.el.days;
        box.replaceChildren();
        for (const d of v.days) {
            const last = d.exclusive;
            const day = E('div', 'meta-day is-' + d.state + (last ? ' is-7' : ''), { role: 'listitem', 'aria-label': d.dayLabel + ': ' + d.label, style: { '--bc': this.COLORS[d.day - 1] || this.COLORS[0] } });
            const box3 = E('div', 'meta-box', {}, E('div', 'meta-box-body'), E('div', 'meta-box-lid'), E('div', 'meta-box-rib'), E('div', 'meta-box-bow'));
            if (last) box3.append(MetaKit.ico('crown', 'meta-crown'));
            if (d.state === 'claimed') box3.append(MetaKit.ico('check', 'meta-tick'));
            if (d.state === 'locked') box3.append(MetaKit.ico('lock', 'meta-tick'));
            day.append(E('span', 'meta-day-n', { text: d.dayLabel }), box3,
                E('div', 'meta-day-rew', {}, ...this.rewardNodes(d.reward)));
            box.append(day);
        }
        MetaKit.fillThumbs(box);
    },

    paintClaim(v) {
        const E = MetaKit.el, T = MetaKit.t;
        const area = this.el.claim;
        area.replaceChildren();
        this.el.x2 = null;
        this.el.next = null;
        const today = v.days.find((d) => d.state === 'today');
        if (this.got) { this.paintGot(area, this.got); return; }
        if (today) {
            area.append(E('p', 'meta-claim-line', { text: T('meta.today', { label: today.label }) }));
            const btns = E('div', 'meta-claim-btns');
            const claim = E('button', 'bo-btn', { type: 'button' }, E('span', '', { text: v.claim.label }));
            claim.addEventListener('click', () => this.onClaim(false));
            btns.append(claim);
            if (v.x2.available && MetaKit.adsOn()) {
                const b = E('button', 'bo-btn', { type: 'button', style: { '--c': 'var(--bo-sky)' } });
                b.addEventListener('click', () => this.onClaim(true));
                this.el.x2 = b;
                this.fillX2(b, v);
                btns.append(b);
            }
            area.append(btns);
            const hint = today.exclusive ? T('meta.noX2') : (v.x2.hint || '');
            area.append(E('p', 'meta-hint', { text: hint || T('meta.dailyHint') }));
        } else {
            this.el.next = E('b', '', { text: v.nextLabel });
            area.append(E('div', 'meta-next', {}, MetaKit.ico('timer'), this.el.next), E('p', 'meta-hint', { text: T('meta.dailyHint') }));
        }
    },

    fillX2(b, v) {
        const E = MetaKit.el;
        const wait = MetaKit.adWait(v.x2.adWait);
        const off = !v.x2.enabled || !MetaKit.adsReady() || this.busy;
        b.disabled = off;
        b.classList.toggle('is-off', off);
        b.replaceChildren(E('span', 'meta-act-row', {}, MetaKit.ico('ad'), wait > 0 ? MetaKit.waitText(wait) : v.x2.label), E('span', 'meta-act-s', { text: v.x2.rewardLabel }));
    },

    patchX2() {
        const b = this.el && this.el.x2;
        if (b) this.fillX2(b, DailyGift.view());
    },

    paintGot(area, res) {
        const E = MetaKit.el, T = MetaKit.t;
        const list = E('div', 'meta-got');
        let hasItem = false;
        for (const g of res.got) {
            if (g.type === 'coins') {
                list.append(E('div', 'meta-gotit' + (g.big ? ' is-big' : ''), {}, MetaKit.ico(g.big ? 'coinsPile' : 'coin'), g.converted ? DailyGift.t('reward.dup', { n: g.amount }) : '+' + MetaKit.num(g.amount)));
            } else {
                const it = Shop.item(g.id);
                if (!it) continue;
                hasItem = true;
                list.append(E('div', 'meta-gotit' + (g.type === 'exclusive' ? ' is-big' : ''), {}, E('span', 'meta-mini', {}, MetaKit.preview(it)), Shop.name(g.id)));
            }
        }
        const btns = E('div', 'meta-claim-btns');
        if (hasItem) {
            const gb = E('button', 'bo-btn', { type: 'button', style: { '--c': 'var(--bo-orange)' } }, T('meta.toGarage'));
            gb.addEventListener('click', () => Meta.open('garage'));
            btns.append(gb);
        }
        const ok = E('button', 'bo-btn', { type: 'button' }, T('meta.great'));
        ok.addEventListener('click', () => Meta.close());
        btns.append(ok);
        area.append(E('div', 'meta-claim-line', { text: T('meta.got') }), list, btns);
        MetaKit.fillThumbs(list);
    },

    async onClaim(x2) {
        if (this.busy) return;
        if (x2 && (!MetaKit.adsReady() || MetaKit.adWait(0) > 0)) { this.patchX2(); return; }
        this.busy = true;
        this.patchX2();
        let r = null;
        try { r = x2 ? await DailyGift.claimX2() : DailyGift.claim(); } catch (e) { r = { ok: false, reason: 'error' }; }
        this.busy = false;
        if (Meta.current() !== 'daily' || !this.el.win) return;
        if (r && r.ok) {
            this.got = r;
            this._can = false;
            MetaKit.confetti(this.el.win, 30);
        } else if (r && r.reason === 'adFailed') MetaKit.toast(MetaKit.t('meta.adFail'));
        this.refresh();
    },
};
// ================================================================================================
// КОЛЕСО ФОРТУНЫ — автомобильный диск в шине: сектора между спицами, болты ступицы, указатель-флажок сверху
// ================================================================================================
/** @satisfies {Record<string, any>} */
const MetaWheel = {
    /** @type {any} */ el: {},
    angle: 0,
    busy: false,
    spinning: false,
    _timer: 0,
    _raf: 0,
    _lastSec: -1,
    _clock: 0,
    _off: null,

    open(host) {
        const E = MetaKit.el, T = MetaKit.t;
        this.busy = false;
        this.spinning = false;
        this.el = {};
        const el = this.el;
        el.win = E('section', 'meta-win meta-wheelwin bo-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': T('meta.wheel') });
        el.close = E('button', 'bo-btn round meta-x', { type: 'button', 'aria-label': T('meta.close') }, MetaKit.ico('close'));
        el.pointer = E('div', 'meta-pointer');
        el.disc = E('div', 'meta-disc');
        const hub = E('div', 'meta-hub');
        for (let i = 0; i < 5; i++) hub.append(E('i', 'meta-nut', { style: { '--a': i * 72 + 'deg' } }));   // пять болтов, как у настоящего диска
        const wheel = E('div', 'meta-wheel', {}, E('div', 'meta-rim', {}, el.disc), hub, el.pointer);
        el.free = E('button', 'bo-btn', { type: 'button' }, E('span', 'meta-lbl'));
        el.ad = E('button', 'bo-btn', { type: 'button', style: { '--c': 'var(--bo-sky)' } }, E('span', 'meta-act-row', {}, MetaKit.ico('ad'), E('span', 'meta-lbl')), E('span', 'meta-act-s'));
        el.hint = E('p', 'meta-hint');
        const ctl = E('div', 'meta-wctl', {}, E('p', 'meta-hint', { text: T('meta.wheelHint') }), el.free, el.ad, el.hint);
        el.win.append(
            E('header', 'meta-bar', {}, MetaKit.ico('wheel', 'meta-bar-ico'), E('h2', 'meta-ttl bo-title', { text: T('meta.wheel') }), el.close),
            E('div', 'meta-ribbon'),
            E('div', 'meta-wbody', {}, wheel, ctl));
        host.append(el.win);
        el.close.addEventListener('click', () => Meta.close());
        el.free.addEventListener('click', () => this.spin('free'));
        el.ad.addEventListener('click', () => this.spin('ad'));
        this.buildDisc();
        el.disc.style.transform = 'rotate(' + this.angle + 'deg)';
        this._off = typeof Ads !== 'undefined' ? Ads.on(() => this.paintCtl()) : null;
        this._clock = window.setInterval(() => this.paintCtl(), 1000);
        this.paintCtl();
        // Вращение, начатое раньше (окно закрыли посреди анимации, страницу перезагрузили): приз выдаётся один раз.
        const p = Wheel.pendingSpin();
        if (p) {
            this.angle = p.angle;
            el.disc.style.transform = 'rotate(' + p.angle + 'deg)';
            this.spinning = true;
            this._timer = window.setTimeout(() => this.settle(), 400);
        }
    },

    close() {
        window.clearInterval(this._clock);
        window.clearTimeout(this._timer);
        window.cancelAnimationFrame(this._raf);
        this._clock = this._timer = this._raf = 0;
        if (this._off) this._off();
        this._off = null;
        if (Wheel.state.pending) {   // закрыли посреди вращения: приз уже выбран — выдаём один раз и сообщаем
            const res = Wheel.finish();
            if (res && res.ok) MetaKit.toast(res.label);
        }
        this.spinning = false;
        this.el = {};
    },

    buildDisc() {
        const E = MetaKit.el;
        const secs = Wheel.sectors();
        const n = Math.max(1, secs.length), step = 360 / n;
        const disc = this.el.disc;
        disc.replaceChildren();
        const stops = secs.map((s, i) => MetaKit.hex(s.data && s.data.color != null ? s.data.color : 0x5b6788) + ' ' + i * step + 'deg ' + (i + 1) * step + 'deg').join(',');
        disc.style.background = 'radial-gradient(circle,rgba(255,255,255,.28) 0,rgba(255,255,255,0) 62%),conic-gradient(from ' + -step / 2 + 'deg,' + stops + ')';
        secs.forEach((s, i) => disc.append(E('i', 'meta-spoke', { style: { '--a': (i - 0.5) * step + 'deg' } })));
        secs.forEach((s, i) => {
            let inner;
            if (s.kind === 'item' && Shop.item(s.itemId)) inner = E('span', 'meta-mini', {}, MetaKit.preview(Shop.item(s.itemId)));
            else inner = E('span', '', {}, MetaKit.ico('coin'));
            const label = s.kind === 'item' ? null : E('span', '', { text: MetaKit.num(s.coins) });
            const col = s.data && s.data.color != null ? s.data.color : 0x5b6788;
            disc.append(E('div', 'meta-sec', { style: { '--a': i * step + 'deg' }, title: s.label }, E('div', 'meta-sec-in' + (MetaKit.luma(col) > 0.6 ? ' is-lite' : ''), {}, inner, label)));
        });
        MetaKit.fillThumbs(disc);
    },

    /** Подписи и доступность кнопок: только текст и disabled, без пересборки (нажатие не теряется). */
    paintCtl() {
        const el = this.el;
        if (!el.win) return;
        const s = Wheel.status();
        const sp = this.spinning || this.busy;
        const freeOff = !s.canSpinFree || sp;
        el.free.disabled = freeOff;
        el.free.classList.toggle('is-off', freeOff);
        MetaKit.q(el.free, '.meta-lbl').textContent = s.freeLabel;
        const wait = MetaKit.adWait(s.adWait);
        const needAd = s.banked === 0;
        const hide = (needAd && !MetaKit.adsOn()) || (s.adLeft === 0 && s.banked === 0);
        el.ad.hidden = hide;
        const adOff = sp || !s.canSpinAd || (needAd && (wait > 0 || !MetaKit.adsReady()));
        el.ad.disabled = adOff;
        el.ad.classList.toggle('is-off', adOff);
        MetaKit.q(el.ad, '.meta-lbl').textContent = needAd && wait > 0 ? MetaKit.waitText(wait) : s.adLabel;
        MetaKit.q(el.ad, '.meta-act-s').textContent = needAd && wait > 0 ? s.adLabel : '';
        el.hint.textContent = sp && this.spinning ? Wheel.t('wheel.spinning') : (s.hint || '');
        el.hint.hidden = !el.hint.textContent;
    },

    async spin(kind) {
        if (this.spinning || this.busy) return;
        this.busy = true;
        this.paintCtl();
        let r = null;
        try { r = kind === 'free' ? Wheel.spinFree() : await Wheel.spinAd(); } catch (e) { r = { ok: false, reason: 'error' }; }
        this.busy = false;
        if (Meta.current() !== 'wheel' || !this.el.win) { if (r && r.ok && Wheel.state.pending) Wheel.finish(); return; }
        if (!r || !r.ok) {
            if (r && r.reason === 'adFailed') MetaKit.toast(MetaKit.t('meta.adFail'));
            this.paintCtl();
            return;
        }
        this.animate(r);
    },

    animate(r) {
        const disc = this.el.disc;
        this.spinning = true;
        const target = Wheel.angleFrom(this.angle, r);
        this.angle = target;
        disc.style.transition = 'transform ' + r.durationMs + 'ms cubic-bezier(.12,.62,.13,1)';
        void disc.offsetWidth;
        disc.style.transform = 'rotate(' + target + 'deg)';
        this._lastSec = -1;
        this._raf = window.requestAnimationFrame(() => this.follow());
        this._timer = window.setTimeout(() => this.settle(), r.durationMs + 140);
        this.paintCtl();
    },

    /** Указатель-флажок щёлкает на каждой спице: угол диска читаем из его живого transform. */
    follow() {
        if (!this.spinning || !this.el.disc) return;
        try {
            const m = new DOMMatrixReadOnly(getComputedStyle(this.el.disc).transform);
            const sec = Wheel.sectorAt(Math.atan2(m.b, m.a) * 180 / Math.PI);
            if (this._lastSec >= 0 && sec !== this._lastSec) {
                const p = this.el.pointer;
                p.classList.remove('kick'); void p.offsetWidth; p.classList.add('kick');
            }
            this._lastSec = sec;
        } catch (e) { /* без матрицы указатель просто не щёлкает */ }
        this._raf = window.requestAnimationFrame(() => this.follow());
    },

    settle() {
        window.clearTimeout(this._timer);
        window.cancelAnimationFrame(this._raf);
        this._timer = this._raf = 0;
        if (!this.spinning) return;
        this.spinning = false;
        const res = Wheel.finish();
        this.paintCtl();
        if (res && res.ok && this.el.win) this.showPrize(res);
    },

    showPrize(res) {
        const E = MetaKit.el, T = MetaKit.t;
        const g = (res.got && res.got[0]) || { type: 'coins', amount: 0 };
        let big, label;
        if (g.type === 'item' && Shop.item(g.id)) {
            big = E('span', 'meta-mini', {}, MetaKit.preview(Shop.item(g.id)));
            label = res.label;
        } else {
            big = E('span', '', {}, MetaKit.ico('coin'), '+' + MetaKit.num(g.amount));
            label = g.converted ? Wheel.t('reward.dup', { n: g.amount }) : res.label;
        }
        const btns = E('div', 'meta-claim-btns');
        const close = () => pop.remove();
        if (g.type === 'item') {
            const gb = E('button', 'bo-btn', { type: 'button', style: { '--c': 'var(--bo-orange)' } }, T('meta.toGarage'));
            gb.addEventListener('click', () => Meta.open('garage'));
            btns.append(gb);
        }
        const ok = E('button', 'bo-btn', { type: 'button' }, T('meta.nice'));
        ok.addEventListener('click', close);
        btns.append(ok);
        const card = E('div', 'meta-prize-card bo-panel', {}, E('div', 'meta-prize-ttl bo-title', { text: Wheel.t('wheel.win') }), E('div', 'meta-prize-big', {}, big),
            E('p', 'meta-prize-lbl', { text: label }), btns);
        const pop = E('div', 'meta-prize', { role: 'alertdialog' }, card);
        this.el.win.append(pop);
        MetaKit.fillThumbs(card);
        MetaKit.confetti(card, 28);
    },
};

// ================================================================================================
// РЕКОРДЫ — табло с номерами мест
// ================================================================================================
/** @satisfies {Record<string, any>} */
const MetaRecords = {
    /** @type {any} */ el: {},
    /** @type {any} */ cache: null,
    token: 0,
    busy: false,
    PALETTE: ['#1ee3ff', '#ff6b1a', '#b6ff3b', '#ff2d55', '#ffd600', '#5b6788'],

    open(host) {
        const E = MetaKit.el, T = MetaKit.t;
        this.busy = false;
        this.el = {};
        const el = this.el;
        el.win = E('section', 'meta-win meta-rec bo-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': T('meta.records') });
        el.close = E('button', 'bo-btn round meta-x', { type: 'button', 'aria-label': T('meta.close') }, MetaKit.ico('close'));
        el.login = E('div', 'meta-loginslot');
        el.tbl = E('div', 'meta-tbl');
        el.win.append(
            E('header', 'meta-bar', {}, MetaKit.ico('trophy', 'meta-bar-ico'), E('h2', 'meta-ttl bo-title', { text: T('meta.records') }), el.close),
            E('div', 'meta-ribbon'),
            E('div', 'meta-recbody', {}, el.login, el.tbl));
        host.append(el.win);
        el.close.addEventListener('click', () => Meta.close());
        this.load(false);
    },

    close() { this.token++; this.el = {}; },

    canLogin() {
        try { return typeof Platform !== 'undefined' && Platform.canLogin() && !Platform.authorized(); } catch (e) { return false; }
    },

    paintLogin() {
        const E = MetaKit.el;
        const slot = this.el.login;
        slot.replaceChildren();
        if (!this.canLogin()) return;
        const b = E('button', 'bo-btn meta-login', { type: 'button', text: MetaKit.t('meta.login') });
        b.addEventListener('click', () => this.login(b));
        slot.append(b);
    },

    async login(btn) {
        if (this.busy) return;
        this.busy = true;
        btn.disabled = true;
        let ok = false;
        try { ok = await Platform.login(); } catch (e) { ok = false; }
        this.busy = false;
        if (!this.el.win) return;
        if (ok) { this.cache = null; MetaKit.callGame('onLogin'); }
        this.load(true);
    },

    async load(force) {
        const E = MetaKit.el, T = MetaKit.t;
        const my = ++this.token;
        const tbl = this.el.tbl;
        this.paintLogin();
        const now = Date.now();
        let list = null;
        if (!force && this.cache && now - this.cache.at < 60000) list = this.cache.list;
        else {
            tbl.replaceChildren(E('div', 'meta-state', {}, E('div', 'meta-spin'), E('span', '', { text: T('loading') })));
            try { list = typeof Platform !== 'undefined' ? await Platform.leaderboard({ avatarSize: 'medium' }) : null; } catch (e) { list = null; }
            if (list) this.cache = { at: now, list };
        }
        if (my !== this.token || !this.el.win) return;
        tbl.replaceChildren();
        if (!list) {
            const retry = E('button', 'bo-btn', { type: 'button', text: T('meta.retry'), style: { '--c': 'var(--bo-sky)' } });
            retry.addEventListener('click', () => this.load(true));
            tbl.append(E('div', 'meta-state', {}, E('span', '', { text: T('meta.unavailable') }), retry));
            return;
        }
        if (!list.length) { tbl.append(E('div', 'meta-state', {}, E('span', '', { text: T('meta.noPlayers') }))); return; }
        const rows = E('div', 'meta-rows', { role: 'list' });
        list.slice(0, 50).forEach((r, i) => rows.append(this.row(r, i)));
        tbl.append(E('div', 'meta-tblh', {}, E('span', '', { text: '№' }), E('span', '', { text: T('meta.player') }), E('span', '', { text: T('meta.points') })), rows);
    },

    row(r, i) {
        const E = MetaKit.el, T = MetaKit.t;
        const rank = Math.max(1, Math.floor(Number(r.rank) || i + 1));
        const name = String(r.name || '').trim() || T('meta.player');
        let ava;
        const url = r.avatar ? String(r.avatar) : '';
        if (/^https:\/\//i.test(url)) {
            ava = E('img', 'meta-ava', { src: url, alt: '', draggable: 'false', referrerpolicy: 'no-referrer', loading: 'lazy' });
            ava.addEventListener('error', () => ava.replaceWith(this.letter(name)));
        } else ava = this.letter(name);
        const nm = E('div', 'meta-name', {}, name);
        if (r.me) nm.append(E('small', '', { text: T('meta.you') }));
        return E('div', 'meta-row' + (r.me ? ' is-me' : '') + (rank <= 3 ? ' r' + rank : ''), { role: 'listitem' },
            E('div', 'meta-rank', { text: String(rank) }), ava, nm, E('div', 'meta-score', { text: MetaKit.num(r.score) }));
    },

    letter(name) {
        let h = 0;
        for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
        return MetaKit.el('div', 'meta-ava', { style: { '--ac': this.PALETTE[h % this.PALETTE.length] }, text: Array.from(name)[0].toUpperCase() });
    },
};

// ================================================================================================
// ЗВУК И МУЗЫКА — Sound.js глушит всё разом (setMuted); музыку отдельно выключаем через её громкость
// ================================================================================================
/** @satisfies {Record<string, any>} */
const MetaAudio = {
    musicOn: true,
    _patched: false,

    _key() { return (typeof GAME_ID !== 'undefined' ? GAME_ID : 'lory-game') + '.music'; },

    init() {
        this.musicOn = Store.get(this._key()) !== '0';
        if (this._patched || typeof Sound === 'undefined' || typeof Sound._volume !== 'function') return;
        this._patched = true;
        const orig = Sound._volume.bind(Sound);
        Sound._volume = (kind) => (kind === 'music' && !MetaAudio.musicOn ? 0 : orig(kind));
        this.apply();
    },

    apply() { if (typeof Sound !== 'undefined' && typeof Sound._sync === 'function') Sound._sync(); },

    setMusic(on) {
        this.musicOn = !!on;
        Store.set(this._key(), this.musicOn ? '1' : '0');
        this.apply();
    },
};

// ================================================================================================
// НАСТРОЙКИ — звук, музыка, качество графики, «Как играть»
// ================================================================================================
/** @satisfies {Record<string, any>} */
const MetaSettings = {
    /** @type {any} */ el: {},
    QUALITY: ['auto', 'low', 'medium', 'high'],

    open(host) {
        const E = MetaKit.el, T = MetaKit.t;
        this.el = {};
        const el = this.el;
        el.win = E('section', 'meta-win meta-set bo-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': T('meta.settings') });
        el.close = E('button', 'bo-btn round meta-x', { type: 'button', 'aria-label': T('meta.close') }, MetaKit.ico('close'));
        el.soundIco = MetaKit.ico('soundOn');
        el.soundSw = this.sw();
        el.soundState = E('small');
        el.musicIco = MetaKit.ico('musicOn');
        el.musicSw = this.sw();
        el.musicState = E('small');
        el.qNow = E('small');
        el.seg = E('div', 'meta-seg', { role: 'radiogroup', 'aria-label': T('meta.graphics') });
        for (const q of this.QUALITY) {
            const b = E('button', 'bo-btn', { type: 'button', role: 'radio', 'data-q': q, text: T('meta.q.' + q) });
            b.addEventListener('click', () => { Quality.set(q); this.paint(); });
            el.seg.append(b);
        }
        el.how = E('button', 'bo-btn meta-how', { type: 'button' }, MetaKit.ico('question'), T('meta.how'));
        el.musicRow = E('div', 'meta-set-row', {}, el.musicIco, E('div', 'meta-set-lbl', {}, T('meta.music'), el.musicState), el.musicSw);
        const body = E('div', 'meta-setbody', {},
            E('div', 'meta-set-row', {}, el.soundIco, E('div', 'meta-set-lbl', {}, T('meta.sound'), el.soundState), el.soundSw),
            el.musicRow,
            E('div', 'meta-set-row is-col', {}, E('div', 'meta-set-head', {}, MetaKit.ico('settings'), E('div', 'meta-set-lbl', {}, T('meta.graphics'), el.qNow)), el.seg),
            el.how,
            E('p', 'meta-ver', { text: (typeof GAME_TITLE !== 'undefined' ? GAME_TITLE : '') + (typeof GAME_VERSION !== 'undefined' ? ' v' + GAME_VERSION : '') }));
        el.win.append(
            E('header', 'meta-bar', {}, MetaKit.ico('settings', 'meta-bar-ico'), E('h2', 'meta-ttl bo-title', { text: T('meta.settings') }), el.close),
            E('div', 'meta-ribbon'), body);
        host.append(el.win);
        el.close.addEventListener('click', () => Meta.close());
        el.soundSw.addEventListener('click', () => { Sound.setMuted(!Sound.muted); this.paint(); });
        el.musicSw.addEventListener('click', () => { if (!Sound.muted) MetaAudio.setMusic(!MetaAudio.musicOn); this.paint(); });
        el.how.addEventListener('click', () => { Meta.close(); MetaKit.callGame('howToPlay'); });
        this.paint();
    },

    close() { this.el = {}; },

    sw() {
        const b = MetaKit.el('button', 'meta-sw', { type: 'button', role: 'switch' });
        return b;
    },

    paint() {
        const el = this.el, T = MetaKit.t;
        if (!el.win) return;
        const sound = !Sound.muted, music = sound && MetaAudio.musicOn;
        const set = (b, on) => { b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); };
        set(el.soundSw, sound);
        set(el.musicSw, music);
        el.musicSw.disabled = !sound;
        el.musicRow.classList.toggle('is-dis', !sound);
        el.soundState.textContent = sound ? T('meta.on') : T('meta.off');
        el.musicState.textContent = music ? T('meta.on') : T('meta.off');
        el.soundIco.src = META_ICONS[sound ? 'soundOn' : 'soundOff'];
        el.musicIco.src = META_ICONS[music ? 'musicOn' : 'musicOff'];
        const choice = Quality.choice;
        for (const b of /** @type {HTMLElement[]} */ (Array.from(el.seg.children))) {
            const on = b.getAttribute('data-q') === choice;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        el.qNow.textContent = T('meta.q.now', { name: T('meta.q.' + Quality.name) });
    },
};
// ================================================================================================
// Meta — рамка окон и публичный API для ядра игры
// ================================================================================================
/** @satisfies {Record<string, any>} */
const Meta = {
    /** @type {HTMLElement | null} */ _root: null,
    /** @type {HTMLElement | null} */ _toasts: null,
    _name: '',
    _save: null,
    _persist: null,
    _recovered: null,
    _keyOn: false,

    /**
     * Подключить магазин, подарок дня и колесо к единому сохранению игры. Зовётся один раз в Game.init
     * (повторно — после смены сохранения аккаунта). save.shop / save.daily / save.wheel правятся на месте.
     * @param {any} save @param {(reason?: string) => any} persist
     */
    init(save, persist) {
        this._save = save;
        this._persist = persist;
        const p = (why) => { try { return typeof persist === 'function' ? persist(why) : undefined; } catch (e) { console.warn('Meta: сохранение не удалось:', (e && e.message) || e); return undefined; } };
        const rewarded = (id) => (typeof Ads !== 'undefined' ? Ads.rewarded(id) : Platform.rewarded(id));
        const adsAvailable = () => MetaKit.adsOn();
        Shop.init({ tabs: SHOP_TABS, items: SHOP_ITEMS, state: save.shop, persist: p, rewarded, adsAvailable });
        save.shop = Shop.state;
        DailyGift.init({ rewards: DAILY_REWARDS, rewardsSink: Shop, state: save.daily, persist: p, rewarded, adsAvailable });
        save.daily = DailyGift.state;
        this._recovered = null;
        Wheel.init({
            sectors: WHEEL_SECTORS, rewardsSink: Shop, state: save.wheel, persist: p, rewarded, adsAvailable,
            // вращение, прерванное закрытием страницы, выдаётся прямо в init — сообщим игроку в меню
            onChange: (e) => { if (e.type === 'prize' && e.recovered) this._recovered = e; },
        });
        save.wheel = Wheel.state;
        /** @type {Array<[string, { ok: boolean, problems: any[] }]>} */
        const reports = [['каталог', Shop.validate()], ['подарок дня', DailyGift.validate()], ['колесо', Wheel.validate()]];
        for (const [name, rep] of reports) {
            if (!rep.ok) console.warn('Meta: проверка данных (' + name + '):', rep.problems);
        }
        MetaAudio.init();
        return this;
    },

    _wins() { return { garage: MetaGarage, daily: MetaDaily, wheel: MetaWheel, records: MetaRecords, settings: MetaSettings }; },

    /** Слой окон и слой подсказок создаются при первом открытии. */
    _ensureDom() {
        if (!document.getElementById('meta-css')) {
            const st = document.createElement('style');
            st.id = 'meta-css';
            st.textContent = META_CSS;
            document.head.append(st);
        }
        if (!this._root || !this._root.isConnected) {
            this._root = MetaKit.el('div', 'meta-root', { id: 'meta-root' });
            document.body.append(this._root);
        }
        if (!this._toasts || !this._toasts.isConnected) {
            this._toasts = MetaKit.el('div', 'meta-toasts', { 'aria-live': 'polite' });
            document.body.append(this._toasts);
        }
        if (!this._keyOn) {
            this._keyOn = true;
            // Esc закрывает окно раньше паузы игры (захват на window)
            window.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape' || !this._name) return;
                e.preventDefault();
                e.stopPropagation();
                this.close();
            }, true);
        }
    },

    /** @param {string} name 'garage' | 'daily' | 'wheel' | 'records' | 'settings' */
    open(name) {
        const win = this._wins()[name];
        if (!win || typeof document === 'undefined') return false;
        if (this._name === name) return true;
        this._ensureDom();
        const prev = this._name;
        if (prev) this._teardown(prev);
        const root = /** @type {HTMLElement} */ (this._root);
        this._name = name;
        root.dataset.win = name;
        root.replaceChildren();
        const dim = MetaKit.el('div', 'meta-dim');
        // тап мимо окна закрывает его (кроме Гаража и колеса во время вращения)
        if (name !== 'garage') dim.addEventListener('click', () => { if (!(name === 'wheel' && MetaWheel.spinning)) this.close(); });
        root.append(dim);
        root.classList.add('is-open');
        document.body.classList.add('meta-open');
        win.open(root);
        if (name === 'garage') MetaKit.callGame('setView', 'garage');
        else if (prev === 'garage') MetaKit.callGame('setView', 'menu');
        return true;
    },

    _teardown(name) {
        const win = /** @type {any} */ (this._wins())[name];
        try { win.close(); } catch (e) { console.warn('Meta: закрытие окна ' + name + ':', (e && e.message) || e); }
    },

    close() {
        if (!this._name) return;
        const name = this._name;
        this._teardown(name);
        this._name = '';
        const root = /** @type {HTMLElement} */ (this._root);
        root.classList.remove('is-open');
        root.replaceChildren();
        document.body.classList.remove('meta-open');
        if (name === 'garage') MetaKit.callGame('setView', 'menu');
        MetaKit.callGame('onMetaClosed');
    },

    isOpen() { return !!this._name; },
    current() { return this._name; },

    /** Показано главное меню: подарок дня предлагается сам (не во время туториала, раз в день) и сообщение о призе колеса. */
    onMenu() {
        if (this._name || typeof document === 'undefined') return;
        this._ensureDom();
        if (this._recovered) {
            const e = this._recovered;
            this._recovered = null;
            MetaKit.toast(MetaKit.t('meta.prizeRecovered', { label: e.label }));
        }
        if (DailyGift.shouldOffer()) {
            this.open('daily');
            DailyGift.markOffered();
        }
    },

    /** Красная точка на кнопке меню: 0 | 1. */
    badge(name) {
        if (name === 'daily') return DailyGift.badge();
        if (name === 'wheel') return Wheel.badge();
        return 0;
    },

    /** Значок для кнопок меню по имени окна или значка (garage, daily, wheel, records, settings, coin, ...). */
    icon(name) {
        const map = { garage: 'shop', daily: 'gift', wheel: 'wheel', records: 'trophy', settings: 'settings' };
        return META_ICONS[map[name] || name] || '';
    },

    /** Свободная область рядом с окном Гаража { x, y, w, h } в CSS px (или null): сюда ядро ставит машину. */
    freeArea() { return this._name === 'garage' ? MetaGarage.freeArea() : null; },
};
