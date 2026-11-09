// GameHud.js — интерфейс заезда и меню «шоу монстр-траков»: стальные плашки с клёпками и предупреждающими полосами.
// В заезде: табло времени и падений (слева сверху), дорожка прогресса с траком и флажками чекпоинтов (сверху по центру),
// монеты и пауза (справа сверху), цифровой спидометр с сегментной шкалой (слева снизу), кнопки «за рекламу» (пропуск
// этапа, ракета), всплывающие надписи и большой баннер трюка/тарана по центру. Меню: логотип-вывеска по центру,
// выбор мира и «Поехали!» слева внизу, колонка плит-кнопок (Гараж, Подарок, Колесо, Рекорды, Настройки) справа.
// Пауза, экран финиша. Раскладка заезда — HudLayout (без наложений на любом экране), тексты — HUD_TEXT в LANG_STRINGS
// (en по умолчанию, ru). Решения принимает Game; Hud только рисует и передаёт нажатия (Hud.on.<имя>).

const HUD_ICON = {
    coin: 'assets/ui/icons/coin.webp', timer: 'assets/ui/icons/timer.webp', skull: 'assets/ui/icons/skull.webp',
    pause: 'assets/ui/icons/pause.webp', play: 'assets/ui/icons/play.webp', skip: 'assets/ui/icons/skip.webp',
    rocket: 'assets/ui/icons/lightning.webp', ad: 'assets/ui/icons/ad-video.webp', lock: 'assets/ui/icons/lock.webp',
    shop: 'assets/ui/icons/shop.webp', gift: 'assets/ui/icons/gift.webp', wheel: 'assets/ui/icons/prize-wheel.webp',
    trophy: 'assets/ui/icons/trophy.webp', settings: 'assets/ui/icons/settings.webp', home: 'assets/ui/icons/home.webp',
    restart: 'assets/ui/icons/restart.webp', star: 'assets/ui/icons/star.webp', check: 'assets/ui/icons/check.webp',
    question: 'assets/ui/icons/question.webp', arrow: 'assets/ui/icons/arrow-right.webp', crown: 'assets/ui/icons/crown.webp',
};

// Спидометр: скорость Game отдаёт в px/с (2600 px/с — полный газ ≈ 156 км/ч), шкала — до HUD_KMH_MAX (Constants.js).
const hudKmhMax = () => (typeof HUD_KMH_MAX !== 'undefined' ? HUD_KMH_MAX : 220);
const HUD_SEGS = 16;

// Трак-маркер на полосе прогресса (вид сбоку, большие колёса).
const HUD_CAR_MARK = '<svg viewBox="0 0 80 40" aria-hidden="true"><g stroke="#07080a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M18 17h8l4-8q1-3 5-3h14q3 0 5 3l5 8h3q4 0 4 4v4q0 2-2 2H17q-2 0-2-2v-5q0-4 3-4z" fill="#ff7a1a"/><path d="M31 17l3-7h8v7zM46 10h3q2 0 4 3l3 4H46z" fill="#b6e6ff" stroke-width="2"/><circle cx="22" cy="29" r="9" fill="#16181c"/><circle cx="22" cy="29" r="3.6" fill="#d9dee6" stroke-width="2"/><circle cx="58" cy="29" r="9" fill="#16181c"/><circle cx="58" cy="29" r="3.6" fill="#d9dee6" stroke-width="2"/></g></svg>';

// Обложки миров для карточки выбора (иллюстрации; новые — по docs/CODEX-IMAGEGEN-PROMPT.md, пока файлы прежние).
const HUD_WORLD_ART = ['assets/ui/worlds/world-1.webp', 'assets/ui/worlds/world-2.webp', 'assets/ui/worlds/world-3.webp'];

const HUD_TEXT = {
    ru: {
        'game.title1': 'Monster Truck', 'game.title2': 'Sky Obby',
        'world.1': 'Свалка в облаках', 'world.2': 'Порт контейнеров', 'world.3': 'Литейный цех',
        'world.n': 'Арена {n}', 'world.locked': 'Пройди арену {n}', 'world.best': 'Рекорд {t}', 'world.noBest': 'Ещё не пройдена',
        'world.cp': 'Чекпоинт {a}/{b}',
        'menu.play': 'Поехали!', 'menu.continue': 'Продолжить', 'menu.garage': 'Гараж', 'menu.daily': 'Подарок',
        'menu.wheel': 'Колесо', 'menu.records': 'Рекорды', 'menu.settings': 'Настройки', 'menu.howto': 'Как играть',
        'hud.progress': 'Трасса {p}%', 'hud.kmh': 'км/ч', 'hud.skip': 'Этап', 'hud.rocket': 'Ракета', 'hud.ad': 'За рекламу',
        'hud.wait': '{n} с', 'hud.rocketOn': 'Ракета {n} с',
        'toast.cp': 'Чекпоинт {n}!', 'toast.coins': '+{n}', 'toast.fall': 'Авария!', 'toast.boost': 'Ускорение!',
        'toast.knock': 'Врезался в {name}!', 'toast.rocket': 'Ракета на {n} с!', 'toast.skip': 'Этап пропущен', 'toast.adFail': 'Реклама сейчас недоступна',
        'toast.trickBoost': 'Буст за трюк!',
        'ram.smash': 'Таран!', 'ram.combo': 'Таран ×{n}!', 'ram.crush': 'Сплющил!',
        'trick.front': 'Сальто вперёд', 'trick.back': 'Сальто назад', 'trick.roll': 'Бочка', 'trick.combo': 'Сальто + бочка',
        'trick.double': 'Двойное', 'trick.triple': 'Тройное', 'trick.many': '{n}×',
        'pause.title': 'Пауза', 'pause.resume': 'Продолжить', 'pause.restart': 'Арена заново', 'pause.menu': 'В меню',
        'finish.title': 'Арена пройдена!', 'finish.time': 'Время', 'finish.best': 'Рекорд', 'finish.coins': 'Монеты',
        'finish.deaths': 'Аварии', 'finish.record': 'Новый рекорд!', 'finish.next': 'Дальше', 'finish.again': 'Ещё раз',
        'finish.menu': 'В меню', 'finish.all': 'Все арены пройдены!',
        'offer.title': 'Слетел с трассы? Покажи класс!', 'offer.watch': 'За рекламу {a}/{b}', 'offer.wait': 'Реклама через {n} с',
        'offer.buy': 'Купить за {n}', 'offer.no': 'Нет, спасибо', 'offer.got': 'Новая вещь надета!',
        'offer.r.common': 'Обычная', 'offer.r.rare': 'Редкая', 'offer.r.epic': 'Эпическая', 'offer.r.legendary': 'Легендарная',
        'tut.ride.t': 'Жми на газ', 'tut.ride.keyboard': 'Держи {keys}, чтобы разогнать трак', 'tut.ride.touch': 'Двигай джойстик вверх — трак поедет',
        'tut.steer.t': 'Рули', 'tut.steer.keyboard': '{keys} — поворот руля', 'tut.steer.touch': 'Джойстик влево и вправо — поворот руля',
        'tut.hop.t': 'Прыжок', 'tut.hop.keyboard': 'Нажми {keys} — подвеска подбросит трак', 'tut.hop.touch': 'Нажми кнопку прыжка справа — трак подпрыгнет',
        'tut.trick.t': 'Трюки в воздухе', 'tut.trick.keyboard': 'В прыжке отпусти и зажми {keys}: вперёд/назад — сальто, влево/вправо — бочка. Чистая посадка — монеты и буст!',
        'tut.trick.touch': 'В прыжке зажми кнопку прыжка и двигай джойстик: вверх/вниз — сальто, влево/вправо — бочка. Чистая посадка — монеты и буст!',
        'tut.ram.t': 'Таран', 'tut.ram.h': 'Ящики, стены и старые машины разлетаются от удара — за это монеты. Машину можно сплющить, наехав сверху — бонус больше!',
        'tut.cp.t': 'Доедь до флажка', 'tut.cp.h': 'Флажок — чекпоинт: если слетишь с трассы, вернёшься к нему. Цель — финиш арены!',
    },
    en: {
        'game.title1': 'Monster Truck', 'game.title2': 'Sky Obby',
        'world.1': 'Cloud Scrapyard', 'world.2': 'Container Port', 'world.3': 'Foundry',
        'world.n': 'Arena {n}', 'world.locked': 'Finish arena {n}', 'world.best': 'Best {t}', 'world.noBest': 'Not finished yet',
        'world.cp': 'Checkpoint {a}/{b}',
        'menu.play': 'Drive!', 'menu.continue': 'Continue', 'menu.garage': 'Garage', 'menu.daily': 'Gift',
        'menu.wheel': 'Wheel', 'menu.records': 'Records', 'menu.settings': 'Settings', 'menu.howto': 'How to play',
        'hud.progress': 'Track {p}%', 'hud.kmh': 'km/h', 'hud.skip': 'Stage', 'hud.rocket': 'Rocket', 'hud.ad': 'Watch ad',
        'hud.wait': '{n} s', 'hud.rocketOn': 'Rocket {n} s',
        'toast.cp': 'Checkpoint {n}!', 'toast.coins': '+{n}', 'toast.fall': 'Wreck!', 'toast.boost': 'Boost!',
        'toast.knock': 'Bumped into {name}!', 'toast.rocket': 'Rocket for {n} s!', 'toast.skip': 'Stage skipped', 'toast.adFail': 'Ad is not available now',
        'toast.trickBoost': 'Trick boost!',
        'ram.smash': 'Smash!', 'ram.combo': 'Smash x{n}!', 'ram.crush': 'Crushed!',
        'trick.front': 'Front flip', 'trick.back': 'Back flip', 'trick.roll': 'Barrel roll', 'trick.combo': 'Flip + roll',
        'trick.double': 'Double', 'trick.triple': 'Triple', 'trick.many': '{n}x',
        'pause.title': 'Paused', 'pause.resume': 'Resume', 'pause.restart': 'Restart arena', 'pause.menu': 'Menu',
        'finish.title': 'Arena cleared!', 'finish.time': 'Time', 'finish.best': 'Best', 'finish.coins': 'Coins',
        'finish.deaths': 'Wrecks', 'finish.record': 'New record!', 'finish.next': 'Next', 'finish.again': 'Again',
        'finish.menu': 'Menu', 'finish.all': 'All arenas cleared!',
        'offer.title': 'Fell off? Show some style!', 'offer.watch': 'Watch ad {a}/{b}', 'offer.wait': 'Ad in {n} s',
        'offer.buy': 'Buy for {n}', 'offer.no': 'No, thanks', 'offer.got': 'New item equipped!',
        'offer.r.common': 'Common', 'offer.r.rare': 'Rare', 'offer.r.epic': 'Epic', 'offer.r.legendary': 'Legendary',
        'tut.ride.t': 'Hit the gas', 'tut.ride.keyboard': 'Hold {keys} to speed up the truck', 'tut.ride.touch': 'Push the joystick up to drive',
        'tut.steer.t': 'Steer', 'tut.steer.keyboard': '{keys} — turn the wheel', 'tut.steer.touch': 'Joystick left and right to steer',
        'tut.hop.t': 'Jump', 'tut.hop.keyboard': 'Press {keys} — the suspension will launch the truck', 'tut.hop.touch': 'Tap the jump button on the right to hop',
        'tut.trick.t': 'Air tricks', 'tut.trick.keyboard': 'In the air, release then hold {keys}: forward/back — flip, left/right — barrel roll. Land clean for coins and a boost!',
        'tut.trick.touch': 'In the air, hold the jump button and use the joystick: up/down — flip, left/right — barrel roll. Land clean for coins and a boost!',
        'tut.ram.t': 'Smash things', 'tut.ram.h': 'Crates, walls and old cars blow apart when you ram them — you get coins. Land on a car to crush it for a bigger bonus!',
        'tut.cp.t': 'Reach the flag', 'tut.cp.h': 'A flag is a checkpoint: fall off the track and you return to it. Reach the finish of the arena!',
    },
};
(() => {
    if (typeof LANG_STRINGS === 'undefined') return;
    for (const lang of Object.keys(HUD_TEXT)) {
        const dst = LANG_STRINGS[lang] || (LANG_STRINGS[lang] = {});
        for (const [k, v] of Object.entries(HUD_TEXT[lang])) if (!(k in dst)) dst[k] = v;
    }
})();

const HUD_CSS = `
#bo-hud, #bo-menu, #bo-over { position: fixed; inset: 0; pointer-events: none; font-family: var(--bo-font); font-weight: 400; color: #fff; user-select: none; }
#bo-hud { z-index: 20; } #bo-menu { z-index: 30; } #bo-over { z-index: 40; }
#bo-hud [data-hl], #bo-hud .hud-blk { pointer-events: auto; }
#bo-hud.off, #bo-menu.off, .bo-hide { display: none !important; }
body.meta-open #bo-menu, body.meta-open #bo-hud { display: none !important; }
.hud-k { font-size: calc(16px * var(--hl-k, 1)); }
/* плашки HUD: стальной щиток с четырьмя клёпками и тёмным окошком с цифрами */
.hud-plate { isolation: isolate; display: flex; align-items: center; gap: .45em; padding: .35em .9em .35em .7em; text-shadow: var(--bo-outline-thin); white-space: nowrap; box-sizing: border-box; }
.hud-plate::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: .35em; border: .14em solid var(--bo-ink);
  background: var(--bo-rivet) left .28em top .28em / .55em .55em no-repeat, var(--bo-rivet) right .28em top .28em / .55em .55em no-repeat, var(--bo-rivet) left .28em bottom .28em / .55em .55em no-repeat, var(--bo-rivet) right .28em bottom .28em / .55em .55em no-repeat, var(--bo-carbon);
  background-color: #23272e; box-shadow: inset 0 0 0 .1em rgba(255,255,255,.3), 0 .22em 0 var(--bo-ink), 0 .3em .6em rgba(0,0,0,.45); }
.hud-plate img { width: 1.8em; height: 1.8em; object-fit: contain; flex: none; }
#hud-time, #hud-coins, #hud-pause, #hud-progress, #hud-actions, #hud-speed, #hud-trick { position: fixed; }
#hud-time { flex-direction: column; align-items: stretch; gap: .15em; padding: .4em .9em .4em 1em; }
#hud-time .row { display: flex; align-items: center; gap: .4em; }
#hud-time .t { font-size: 1.5em; letter-spacing: .04em; font-variant-numeric: tabular-nums; color: var(--bo-yellow); text-shadow: 0 0 .5em rgba(255,196,0,.55), 0 .08em 0 var(--bo-ink); }
#hud-time .s { font-size: .9em; opacity: .96; } #hud-time img { width: 1.5em; height: 1.5em; }
#hud-time .d { color: #ff7d66; } #hud-time .b { color: var(--bo-sky); font-size: .85em; }
#hud-coins .n { font-size: 1.5em; min-width: 2.2em; text-align: right; font-variant-numeric: tabular-nums; color: var(--bo-yellow); text-shadow: 0 0 .45em rgba(255,196,0,.5), 0 .08em 0 var(--bo-ink); }
#hud-pause { isolation: isolate; width: 3.2em; height: 3.2em; padding: 0; border: 0; background: none; display: grid; place-items: center; cursor: pointer; transition: transform .08s; }
#hud-pause::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: .4em; border: .14em solid var(--bo-ink);
  background: var(--bo-rivet) left .25em top .25em / .5em .5em no-repeat, var(--bo-rivet) right .25em bottom .25em / .5em .5em no-repeat, linear-gradient(180deg, rgba(255,255,255,.4), rgba(0,0,0,.3)), var(--bo-orange);
  box-shadow: inset 0 0 0 .1em rgba(255,255,255,.34), 0 .25em 0 var(--bo-ink); transition: box-shadow .08s; }
#hud-pause:active { transform: translateY(.18em); }
#hud-pause:active::before { box-shadow: inset 0 0 0 .1em rgba(255,255,255,.34), 0 .07em 0 var(--bo-ink); }
#hud-pause img { width: 1.9em; height: 1.9em; filter: drop-shadow(0 1px 0 rgba(5,6,10,.6)); }
/* прогресс трассы — грунтовая дорога: трак едет по стальному жёлобу, жёлтые столбики чекпоинтов, шахматный финиш */
#hud-progress { display: flex; flex-direction: column; gap: .3em; align-items: stretch; }
#hud-progress .lbl { display: flex; justify-content: space-between; gap: .6em; font-size: .78em; letter-spacing: .06em; text-transform: uppercase; text-shadow: var(--bo-outline-thin); padding: 0 .5em; white-space: nowrap; }
#hud-progress .lbl .w { overflow: hidden; text-overflow: ellipsis; } #hud-progress .lbl .p { color: var(--bo-yellow); flex: none; }
#hud-progress .bar { position: relative; height: 1.3em; margin: 0 1.2em 0 .5em; border-radius: .2em; border: .14em solid var(--bo-ink);
  background: linear-gradient(180deg, #14161a, #2a2f37); box-shadow: 0 0 0 .1em #8b94a1, 0 .24em 0 .1em var(--bo-ink); }
#hud-progress .bar::before { content: ''; position: absolute; left: 0; right: 1.2em; top: 50%; height: .16em; margin-top: -.08em; z-index: 1;
  background: repeating-linear-gradient(90deg, rgba(255,196,0,.8) 0 .6em, transparent .6em 1.2em); }
#hud-progress .bar::after { content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 1.2em; z-index: 1; border-left: .1em solid var(--bo-ink);
  background-color: #fff; background-image: linear-gradient(45deg, var(--bo-ink) 25%, transparent 25%, transparent 75%, var(--bo-ink) 75%), linear-gradient(45deg, var(--bo-ink) 25%, transparent 25%, transparent 75%, var(--bo-ink) 75%);
  background-size: .6em .6em; background-position: 0 0, .3em .3em; }
#hud-progress .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%; transition: width .35s; z-index: 0;
  background: repeating-linear-gradient(-45deg, rgba(255,122,26,.85) 0 .45em, rgba(255,196,0,.85) .45em .9em); }
#hud-progress .tick { position: absolute; top: -.3em; bottom: -.3em; width: .16em; z-index: 2; background: rgba(255,255,255,.5); }
#hud-progress .tick::after { content: ''; position: absolute; top: 0; left: 100%; width: .5em; height: .45em; background: inherit; clip-path: polygon(0 0, 100% 50%, 0 100%); }
#hud-progress .tick.on { background: var(--bo-green); box-shadow: 0 0 .5em rgba(143,214,52,.85); }
#hud-progress .me { position: absolute; top: 50%; width: 2.9em; height: 1.45em; margin: -.9em 0 0 -1.45em; z-index: 3; transition: left .35s; filter: drop-shadow(0 .12em 0 rgba(5,6,10,.7)); }
#hud-progress .me svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* спидометр: цифровое табло и сегментная шкала от зелёного к красному */
#hud-speed { flex-direction: column; align-items: stretch; gap: .25em; padding: .35em .8em .45em; }
#hud-speed .row { display: flex; align-items: baseline; justify-content: space-between; gap: .6em; }
#hud-speed .n { font-size: 2.3em; min-width: 2.3em; text-align: right; font-variant-numeric: tabular-nums; color: #fff; text-shadow: 0 0 .5em rgba(255,196,0,.55), 0 .06em 0 var(--bo-ink); line-height: 1; }
#hud-speed .u { font-size: .8em; letter-spacing: .12em; text-transform: uppercase; color: var(--bo-yellow); }
#hud-speed .segs { display: grid; grid-template-columns: repeat(${HUD_SEGS}, 1fr); gap: .14em; height: .8em; }
#hud-speed .segs i { background: #0d0f12; border-radius: .08em; box-shadow: inset 0 0 0 .08em rgba(255,255,255,.1); }
#hud-speed .segs i.on { background: var(--bo-green); box-shadow: 0 0 .4em rgba(143,214,52,.7); }
#hud-speed .segs i.on.m { background: var(--bo-yellow); box-shadow: 0 0 .4em rgba(255,196,0,.7); }
#hud-speed .segs i.on.h { background: var(--bo-red); box-shadow: 0 0 .4em rgba(232,50,30,.8); }
#hud-speed.hot .n { color: #ffd0a8; text-shadow: 0 0 .5em rgba(255,122,26,.95), 0 .06em 0 var(--bo-ink); }
.hud-act { display: flex; flex-direction: column; gap: .8em; align-items: flex-end; }
.hud-act .bo-btn { font-size: 1em; min-height: 0; padding: .4em .8em .65em .6em; flex-direction: row; gap: .35em; }
.hud-act .bo-btn img.i { width: 2em; height: 2em; }
.hud-act .bo-btn .tx { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.05; }
.hud-act .bo-btn .tx small { font: 600 .66em var(--bo-text); opacity: .95; display: flex; align-items: center; gap: .25em; text-transform: none; }
.hud-act .bo-btn .tx small img { width: 1.25em; height: 1.25em; }
#hud-toast { font-family: var(--bo-font); position: fixed; left: 50%; top: calc(var(--hl-progress-y, 10px) + var(--hl-progress-h, 50px) + 14px); transform: translateX(-50%); text-align: center; pointer-events: none; z-index: 25; }
#hud-toast .t { font-size: clamp(22px, 4.4vw, 38px); text-transform: uppercase; letter-spacing: .01em; text-shadow: var(--bo-outline); color: var(--bo-yellow); animation: bo-pop .9s ease-out both; white-space: nowrap; }
#hud-toast .t.s { font-size: clamp(14px, 2.6vw, 20px); color: #fff; text-shadow: var(--bo-outline-thin), 2px 3px 0 var(--bo-ink); }
@keyframes bo-pop { 0% { transform: scale(.4); opacity: 0; } 18% { transform: scale(1.14); opacity: 1; } 30% { transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
/* баннер трюка и тарана: крупная надпись по центру над трасой */
#hud-trick { left: 50%; top: 26%; transform: translateX(-50%); text-align: center; pointer-events: none; z-index: 26; width: 90vw; }
#hud-trick .b { display: inline-flex; flex-direction: column; align-items: center; gap: .1em; animation: bo-banner 1.7s ease-out both; }
#hud-trick .n { font-size: clamp(28px, 7vw, 66px); line-height: 1; text-transform: uppercase; color: #fff; -webkit-text-stroke: 0; letter-spacing: .02em;
  text-shadow: -2px -2px 0 var(--bo-ink), 2px -2px 0 var(--bo-ink), -2px 2px 0 var(--bo-ink), 3px 3px 0 var(--bo-ink), 5px 5px 0 var(--k, #ff7a1a), 6px 6px 0 var(--bo-ink), 0 12px 18px rgba(0,0,0,.55); }
#hud-trick .c { margin-top: .3em; padding: .08em .7em .12em; font-size: clamp(18px, 3.6vw, 32px); color: var(--bo-dark); background: var(--bo-hazard); border: .1em solid var(--bo-ink); border-radius: .2em; text-shadow: none; box-shadow: 0 .12em 0 var(--bo-ink); }
#hud-trick .c i { font-style: normal; display: inline-block; background: #ffc400; padding: 0 .35em; border-radius: .15em; }
#hud-trick .b.trick { --k: #3fc7ff; } #hud-trick .b.crush { --k: #e8321e; } #hud-trick .b.ram { --k: #ff7a1a; }
@keyframes bo-banner { 0% { transform: scale(.3) rotate(-6deg); opacity: 0; } 12% { transform: scale(1.18) rotate(2deg); opacity: 1; } 22% { transform: scale(1) rotate(0); } 78% { opacity: 1; } 100% { opacity: 0; transform: translateY(-26px) scale(.96); } }
#hud-flash { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 26; transition: opacity .25s; }
/* ---- главное меню: вывеска по центру, арена и «Поехали!» слева внизу, плиты-кнопки справа — размеры от меньшей стороны экрана ---- */
#bo-menu { --u: min(1vh, 1.7vw); --pad: max(10px, calc(var(--u) * 2.2)); }
#bo-menu > * { pointer-events: auto; position: absolute; }
/* логотип: вывеска на цепях — «MONSTER TRUCK» на стальной плите, «SKY OBBY» на жёлто-чёрной ленте */
.menu-logo { left: 50%; top: calc(var(--pad) + env(safe-area-inset-top)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; isolation: isolate; pointer-events: none !important; }
.menu-logo .a { position: relative; padding: .12em .7em .2em; font: 400 clamp(20px, calc(var(--u) * 6.4), 62px)/1 var(--bo-font); text-transform: uppercase; color: #fff; letter-spacing: .02em; white-space: nowrap; border: .09em solid var(--bo-ink); border-radius: .14em;
  background: var(--bo-rivet) left .14em top .14em / .2em .2em no-repeat, var(--bo-rivet) right .14em top .14em / .2em .2em no-repeat, var(--bo-rivet) left .14em bottom .14em / .2em .2em no-repeat, var(--bo-rivet) right .14em bottom .14em / .2em .2em no-repeat, var(--bo-carbon); background-color: #23272e;
  box-shadow: inset 0 0 0 .06em rgba(255,255,255,.35), 0 .09em 0 .06em var(--bo-ink), 0 .3em .6em rgba(0,0,0,.5);
  text-shadow: -.04em -.04em 0 var(--bo-ink), .04em -.04em 0 var(--bo-ink), .06em .06em 0 var(--bo-ink), .1em .1em 0 var(--bo-orange), .14em .14em 0 var(--bo-ink); }
.menu-logo .b { position: relative; margin-top: calc(var(--u) * .5); padding: .1em 1.6em .14em; font: 400 clamp(13px, calc(var(--u) * 3.4), 32px)/1.1 var(--bo-font); letter-spacing: .38em; text-transform: uppercase; color: var(--bo-dark); background: var(--bo-hazard); background-color: #ffc400;
  border: .12em solid var(--bo-ink); border-radius: .2em; box-shadow: 0 .14em 0 var(--bo-ink); }
.menu-logo .b span { display: block; padding: .02em .6em .06em; background: #ffc400; border-radius: .12em; }
.menu-coins { right: calc(var(--pad) + env(safe-area-inset-right)); top: calc(var(--pad) + env(safe-area-inset-top)); font-size: clamp(13px, calc(var(--u) * 2.6), 20px); }
.menu-side { right: calc(var(--pad) + env(safe-area-inset-right)); top: calc(var(--pad) + env(safe-area-inset-top) + clamp(52px, calc(var(--u) * 11), 110px)); bottom: calc(var(--pad) + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; justify-content: center; gap: clamp(10px, calc(var(--u) * 1.9), 18px); }
.menu-side .bo-btn { --c: var(--bo-purple); font-size: clamp(11px, calc(var(--u) * 2.2), 16px); min-height: 0; height: clamp(34px, calc(var(--u) * 7.8), 54px); padding: 0 1em .1em .55em; justify-content: flex-start; gap: .55em;
  min-width: clamp(120px, calc(var(--u) * 26), 186px); }
.menu-side .bo-btn img { width: clamp(24px, calc(var(--u) * 5.6), 40px); height: clamp(24px, calc(var(--u) * 5.6), 40px); filter: drop-shadow(0 2px 0 rgba(5,6,10,.55)); }
.menu-side .bo-btn .dot { position: absolute; top: -8px; left: -6px; width: 15px; height: 15px; border-radius: 50%; background: var(--bo-red); border: 3px solid var(--bo-ink); box-shadow: 0 0 8px rgba(232,50,30,.9); display: none; }
.menu-side .bo-btn.hot .dot { display: block; }
.menu-main { left: calc(var(--pad) + env(safe-area-inset-left)); bottom: calc(var(--pad) + env(safe-area-inset-bottom)); width: clamp(250px, calc(var(--u) * 54), 440px);
  display: flex; flex-direction: column; align-items: stretch; gap: clamp(10px, calc(var(--u) * 2), 18px); font-size: clamp(12px, calc(var(--u) * 2.3), 17px); }
.wsel { display: flex; align-items: stretch; gap: .6em; padding-right: 4px; }
.wsel .arr { flex: none; width: 2.5em; height: 3.8em; align-self: center; padding: 0; min-height: 0; --c: var(--bo-purple); font-size: 1em; }
.wsel .arr::after { display: none; }
.wsel .arr img { width: 1.4em; height: 1.4em; filter: drop-shadow(0 2px 0 rgba(5,6,10,.55)); } .wsel .arr.l img { transform: scaleX(-1); }
.wsel .arr.is-off { visibility: hidden; }
/* карточка арены — «афиша шоу»: стальная рамка с клёпками, окно с видом, номер-шильдик, дорожный прогресс */
.wcard { --c: var(--bo-yellow); position: relative; isolation: isolate; flex: 1; min-width: 0; padding: 5px; text-align: left; color: #e9edf3; container-type: inline-size; border-radius: 7px; border: 3px solid var(--bo-ink);
  background: linear-gradient(135deg, var(--c), #6a717c 45%, var(--c)); box-shadow: 0 5px 0 var(--bo-ink), 0 10px 18px rgba(0,0,0,.45); }
.wcard::before { content: ''; position: absolute; inset: 5px; z-index: -1; border-radius: 4px; background: var(--bo-carbon); background-color: #23272e; box-shadow: inset 0 0 0 2px rgba(0,0,0,.5); }
.wcard .view { position: relative; aspect-ratio: 2.1 / 1; overflow: hidden; background: #0b0c0f; border: 2px solid var(--bo-ink); border-radius: 3px; }
.wcard .view img.img { position: absolute; left: 0; top: 0; width: 106.4%; max-width: none; margin: -11.1% 0 0 -3.2%; display: block; pointer-events: none; }
.wcard .view::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 28%; background: linear-gradient(180deg, transparent, rgba(5,6,10,.6)); pointer-events: none; }
.wcard .view .plain { position: absolute; inset: 0; background: linear-gradient(135deg, var(--c), #14161a); opacity: .6; }
.wcard .dots { position: absolute; right: .5em; top: .45em; display: flex; gap: .25em; z-index: 2; }
.wcard .dots i { width: .8em; height: .8em; border-radius: 50%; background: rgba(255,255,255,.4); border: 2px solid rgba(5,6,10,.7); }
.wcard .dots i.on { background: var(--bo-yellow); }
.wcard .done { position: absolute; left: .45em; top: .4em; width: 1.9em; height: 1.9em; display: none; z-index: 2; filter: drop-shadow(0 2px 0 rgba(5,6,10,.8)); }
.wcard.finished .done { display: block; }
.wcard .lock { position: absolute; inset: 0; z-index: 3; display: none; flex-direction: column; align-items: center; justify-content: center; gap: .3em; text-align: center; font-size: .86em; padding: 0 .5em; text-shadow: var(--bo-outline-thin);
  background: rgba(5,6,10,.66); border-bottom: .5em solid transparent; border-image: var(--bo-hazard) 1; }
.wcard.locked .lock { display: flex; }
.wcard .lock img { width: 2.6em; height: 2.6em; }
.wcard.locked .view img.img { filter: grayscale(.8) brightness(.6); }
.wcard .info { position: relative; display: flex; align-items: center; gap: .6em; padding: .5em .4em .35em .3em; }
.wcard .num { flex: none; display: grid; place-items: center; min-width: 1.9em; padding: .05em .3em; font: 400 1.25em/1.1 var(--bo-font); background: linear-gradient(180deg, #ffd24a, #ffb000); color: var(--bo-dark); border: .12em solid var(--bo-ink); border-radius: .25em; box-shadow: 0 .1em 0 var(--bo-ink); text-shadow: none; }
.wcard .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1em; line-height: 1.12; }
.wcard .nm { font-size: .95em; text-transform: uppercase; color: #fff; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-shadow: var(--bo-outline-thin); line-height: 1.05; }
.wcard .meta { font: 600 .74em var(--bo-text); color: #aab4c4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wcard .pbar { margin-top: .2em; height: .6em; border: 2px solid var(--bo-ink); border-radius: 2px; background: #0d0f12; overflow: hidden; }
.wcard .pbar i { display: block; height: 100%; background: repeating-linear-gradient(-45deg, var(--bo-orange) 0 .45em, var(--bo-yellow) .45em .9em); }
.wcard .code { display: none; }
.menu-play { --c: var(--bo-orange); font-size: 1.7em; min-height: 0; padding: .35em .9em .55em; letter-spacing: .06em; text-transform: uppercase; }
.menu-play img { width: 1.2em; height: 1.2em; }
@media (orientation: portrait) {
  #bo-menu { --u: min(0.75vh, 1.45vw); }
  .menu-logo .a { font-size: clamp(16px, 6vw, 34px); }
  .menu-coins { top: calc(var(--pad) + env(safe-area-inset-top) + clamp(78px, 21vw, 110px)); font-size: 13px; }
  .menu-side { top: auto; right: auto; left: 50%; transform: translateX(-50%); bottom: calc(var(--pad) + env(safe-area-inset-bottom) + min(92vw, 420px) * 0.616 + 7em);
    flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 10px; width: min(96vw, 520px); }
  .menu-side .bo-btn { min-width: 0; height: auto; flex-direction: column; justify-content: center; padding: .35em .2em .5em; gap: .15em; width: calc((100% - 40px) / 5); font-size: clamp(8px, 2.2vw, 12px); }
  .menu-main { left: 50%; right: auto; transform: translateX(-50%); width: min(92vw, 420px); }
}
/* ---- оверлеи: пауза, финиш ---- */
#bo-over { display: none; align-items: center; justify-content: center; background: radial-gradient(110% 90% at 50% 40%, rgba(10,11,14,.55), rgba(4,5,8,.88)); pointer-events: auto; padding: 14px; box-sizing: border-box; }
#bo-over.on { display: flex; }
.over-panel { --hc: var(--bo-yellow); width: min(430px, 94vw); max-height: 94vh; overflow: auto; scrollbar-width: thin; scrollbar-color: #6b7482 #0b0c0f; padding: 4px 4px 22px; text-align: center; }
.over-panel .band { height: 16px; border-bottom: 3px solid var(--bo-ink); margin-bottom: 2px; border-radius: 4px 4px 0 0; }
.over-panel .band.bo-hazard { background: var(--bo-hazard); }
.over-panel h2 { margin: 12px 8px 6px; font: 400 clamp(26px, 5.6vh, 40px)/1.05 var(--bo-font); text-transform: uppercase; color: var(--bo-yellow); text-shadow: var(--bo-outline); }
.over-panel .sub { font: 700 15px var(--bo-text); margin-bottom: 10px; color: #b9c2d0; text-transform: uppercase; letter-spacing: .06em; }
.over-btns { display: flex; flex-direction: column; gap: 18px; padding: 8px 28px 0; }
.over-btns .bo-btn { font-size: 19px; }
.over-btns .row { display: flex; gap: 16px; } .over-btns .row .bo-btn { flex: 1; font-size: 15px; padding: .5em .6em .7em; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 4px 24px 14px; }
.stat { position: relative; background: #0d0f12; border: 2px solid var(--bo-ink); border-left: 6px solid var(--bo-yellow); border-radius: 3px; padding: 6px 8px 6px 10px; box-shadow: 0 3px 0 var(--bo-ink), inset 0 0 0 1px rgba(255,255,255,.12); text-align: left; }
.stat:nth-child(2) { border-left-color: var(--bo-sky); } .stat:nth-child(3) { border-left-color: var(--bo-orange); } .stat:nth-child(4) { border-left-color: var(--bo-red); }
.stat b { display: block; font: 700 11px var(--bo-text); letter-spacing: .1em; text-transform: uppercase; color: #9aa6b8; } .stat span { font-size: 20px; display: inline-flex; align-items: center; gap: 4px; color: #fff; font-variant-numeric: tabular-nums; }
.stat span img { width: 22px; height: 22px; }
.rec { display: inline-block; margin: 0 0 10px; padding: 4px 14px; background: var(--bo-yellow); color: var(--bo-dark); border: 3px solid var(--bo-ink); border-radius: 4px; text-transform: uppercase; letter-spacing: .05em;
  box-shadow: 3px 3px 0 var(--bo-red); transform: rotate(-3deg); animation: bo-pop 1.6s both; animation-iteration-count: 1; }
@media (max-height: 430px) { .over-panel h2 { margin: 6px 0 2px; } .stats { gap: 6px; padding-bottom: 8px; } .stat span { font-size: 16px; } .over-btns { gap: 12px; } .over-btns .bo-btn { font-size: 15px; min-height: 38px; } }
/* предложение после падения */
.offer-item { position: relative; margin: 2px 26px 14px; padding: 10px 10px 8px; background-color: #0d0f12; background-image: var(--bo-carbon); border: 2px solid rgba(255,255,255,.3); border-radius: 4px; box-shadow: 0 4px 0 var(--bo-ink); }
.offer-item.r-rare { border-color: var(--bo-sky); box-shadow: 0 4px 0 var(--bo-ink), 0 0 16px rgba(63,199,255,.35); } .offer-item.r-epic { border-color: var(--bo-orange); box-shadow: 0 4px 0 var(--bo-ink), 0 0 16px rgba(255,122,26,.4); }
.offer-item.r-legendary { border-color: var(--bo-yellow); box-shadow: 0 4px 0 var(--bo-ink), 0 0 22px rgba(255,196,0,.55); }
.offer-img { width: clamp(90px, 22vh, 150px); height: clamp(90px, 22vh, 150px); object-fit: contain; display: block; margin: 0 auto; }
.offer-nm { font-size: 19px; color: #fff; text-transform: uppercase; } .offer-rar { font: 700 13px var(--bo-text); color: #9aa6b8; letter-spacing: .08em; text-transform: uppercase; }
/* сенсорный джойстик и кнопка прыжка в стиле игры */
.lory-ctx { font-family: var(--bo-font) !important; font-weight: 400 !important; border: 3px solid rgba(255,255,255,.75) !important; background: var(--bo-orange) !important;
  box-shadow: 0 0 0 2px var(--bo-ink), 0 6px 0 2px var(--bo-ink) !important; text-shadow: var(--bo-outline-thin); }
.lory-ctx-icon img { filter: drop-shadow(0 2px 0 rgba(5,6,10,.6)); }
.lory-stick { border: 3px solid rgba(255,255,255,.7) !important; background: radial-gradient(circle, rgba(255,196,0,.22) 0 40%, rgba(20,22,26,.55) 41%) !important; box-shadow: 0 0 0 2px var(--bo-ink) !important; }
.lory-stick.idle { opacity: .55 !important; }
.lory-stick i { background: var(--bo-yellow) !important; border: 3px solid var(--bo-ink); box-sizing: border-box; opacity: 1 !important; }
`;

/** @satisfies {Record<string, any>} */
const Hud = {
    /** @type {Record<string, (...a: any[]) => void>} */ on: {},
    /** @type {Record<string, HTMLElement>} */ el: {},
    _cpTotal: 0,
    _speedShown: -1,
    _coinsShown: -1,
    _toastTimer: 0,

    init() {
        const st = document.createElement('style');
        st.id = 'bo-hud-css'; st.textContent = HUD_CSS;
        document.head.appendChild(st);
        const I = HUD_ICON;
        const hud = this._div('bo-hud', '', document.body);
        hud.className = 'off';
        hud.innerHTML = `
          <div id="hud-time" class="hud-plate hud-k"><div class="row"><img src="${I.timer}" alt=""><span class="t">00:00.00</span></div>
            <div class="row s"><img src="${I.skull}" alt=""><span class="d">0</span><span class="b"></span></div></div>
          <div id="hud-progress" class="hud-k"><div class="lbl"><span class="w"></span><span class="p"></span></div><div class="bar"><div class="fill"></div><div class="ticks"></div><div class="me">${HUD_CAR_MARK}</div></div></div>
          <div id="hud-coins" class="hud-plate hud-k"><img src="${I.coin}" alt=""><span class="n">0</span></div>
          <button id="hud-pause" class="hud-k" type="button" aria-label="pause"><img src="${I.pause}" alt=""></button>
          <div id="hud-actions" class="hud-act hud-k">
            <button class="bo-btn" id="hud-skip" type="button" style="--c: var(--bo-sky)"><img class="i" src="${I.skip}" alt=""><span class="tx"><span data-t="hud.skip"></span><small><img src="${I.ad}" alt=""><span class="w"></span></small></span></button>
            <button class="bo-btn" id="hud-rocket" type="button" style="--c: var(--bo-orange)"><img class="i" src="${I.rocket}" alt=""><span class="tx"><span class="rl" data-t="hud.rocket"></span><small><img src="${I.ad}" alt=""><span class="w"></span></small></span></button>
          </div>
          <div id="hud-speed" class="hud-plate hud-k"><div class="row"><span class="n">0</span><span class="u" data-t="hud.kmh"></span></div><div class="segs">${'<i></i>'.repeat(HUD_SEGS)}</div></div>
          <div id="hud-trick" class="hud-k"></div>`;
        this._div('hud-toast', '', document.body);
        this._div('hud-flash', '', document.body);
        const menu = this._div('bo-menu', '', document.body);
        menu.className = 'off';
        menu.innerHTML = `
          <div class="menu-logo"><span class="a" data-t="game.title1"></span><span class="b"><span data-t="game.title2"></span></span></div>
          <div class="menu-coins hud-plate"><img src="${I.coin}" alt=""><span class="n">0</span></div>
          <div class="menu-side">
            <button class="bo-btn" data-m="garage" type="button" style="--c: var(--bo-orange)"><img src="${I.shop}" alt=""><span data-t="menu.garage"></span><i class="dot"></i></button>
            <button class="bo-btn" data-m="daily" type="button" style="--c: var(--bo-green)"><img src="${I.gift}" alt=""><span data-t="menu.daily"></span><i class="dot"></i></button>
            <button class="bo-btn" data-m="wheel" type="button" style="--c: var(--bo-sky)"><img src="${I.wheel}" alt=""><span data-t="menu.wheel"></span><i class="dot"></i></button>
            <button class="bo-btn" data-m="records" type="button" style="--c: var(--bo-yellow)"><img src="${I.trophy}" alt=""><span data-t="menu.records"></span><i class="dot"></i></button>
            <button class="bo-btn" data-m="settings" type="button" style="--c: var(--bo-purple)"><img src="${I.settings}" alt=""><span data-t="menu.settings"></span><i class="dot"></i></button>
          </div>
          <div class="menu-main"><div class="wsel"><button class="bo-btn arr l" type="button" aria-label="prev"><img src="${I.arrow}" alt=""></button><div class="wcard"></div><button class="bo-btn arr r" type="button" aria-label="next"><img src="${I.arrow}" alt=""></button></div>
            <button class="bo-btn menu-play" type="button"><img src="${I.play}" alt=""><span data-t="menu.play"></span></button></div>`;
        const over = this._div('bo-over', '', document.body);
        void over;
        for (const k of ['hud', 'menu', 'over']) this.el[k] = /** @type {HTMLElement} */ (document.getElementById('bo-' + k));
        this.el.toast = /** @type {HTMLElement} */ (document.getElementById('hud-toast'));
        this.el.flash = /** @type {HTMLElement} */ (document.getElementById('hud-flash'));
        Lang.apply();
        const click = (sel, fn) => { const e = document.querySelector(sel); if (e) e.addEventListener('click', (ev) => { ev.stopPropagation(); this._click(); fn(ev); }); };
        click('#hud-pause', () => this.on.pause && this.on.pause());
        click('#hud-skip', () => this.on.skip && this.on.skip());
        click('#hud-rocket', () => this.on.rocket && this.on.rocket());
        click('.menu-play', () => this.on.play && this.on.play());
        click('.wsel .arr.l', () => this.on.selectWorld && this.on.selectWorld(this._sel - 1));
        click('.wsel .arr.r', () => this.on.selectWorld && this.on.selectWorld(this._sel + 1));
        for (const b of Array.from(menu.querySelectorAll('[data-m]'))) b.addEventListener('click', (ev) => { ev.stopPropagation(); this._click(); if (this.on.meta) this.on.meta(/** @type {HTMLElement} */ (b).dataset.m); });
        // кнопки HUD не отдают нажатие игре и камере
        for (const id of ['hud-pause', 'hud-skip', 'hud-rocket']) {
            const e = document.getElementById(id);
            if (e) for (const t of ['pointerdown', 'pointerup', 'touchstart']) e.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true });
        }
        HudLayout.block('time', { dock: 'tl', w: 180, h: 70, el: '#hud-time', order: 0 });
        HudLayout.block('pause', { dock: 'tr', w: 52, h: 52, el: '#hud-pause', order: -1, min: 44 });
        HudLayout.block('coins', { dock: 'tr', w: 128, h: 46, el: '#hud-coins', order: 0 });
        HudLayout.block('progress', { dock: 'tc', w: 420, h: 50, fill: true, maxW: 560, el: '#hud-progress' });
        HudLayout.block('actions', { dock: 'mr', w: 150, h: 128, el: '#hud-actions', visible: () => this._actionsVisible() });
        HudLayout.block('speed', { dock: 'bl', w: 170, h: 78, el: '#hud-speed' });
        if (typeof Ads !== 'undefined') Ads.on(() => this.refreshAds());
        this.refreshAds();
    },

    _actionsVisible() { return !this.el.hud.classList.contains('off') && (typeof Ads === 'undefined' || Ads.supported()); },

    _div(id, cls, parent) {
        const d = document.createElement('div');
        d.id = id; if (cls) d.className = cls;
        parent.appendChild(d);
        return d;
    },

    _click() { try { Sound.play('assets/sounds/click.ogg', { volume: 0.6 }); } catch (e) { /* звук не обязателен */ } },

    show(which) {
        this.el.hud.classList.toggle('off', which !== 'hud');
        this.el.menu.classList.toggle('off', which !== 'menu');
        HudLayout.refresh();
    },

    fmt(sec) {
        if (sec == null || !Number.isFinite(sec)) return '--:--';
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60), c = Math.floor((sec * 100) % 100);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
    },

    setTime(sec, deaths, best) {
        const t = this.el.hud.querySelector('#hud-time .t'), d = this.el.hud.querySelector('#hud-time .d'), b = this.el.hud.querySelector('#hud-time .b');
        if (t) t.textContent = this.fmt(sec);
        if (d) d.textContent = String(deaths);
        if (b) b.textContent = best ? '  ★ ' + this.fmt(best) : '';
    },

    setCoins(n) {
        if (n === this._coinsShown) return;
        this._coinsShown = n;
        for (const e of Array.from(document.querySelectorAll('#hud-coins .n, .menu-coins .n'))) e.textContent = String(n);
    },

    /** px/с -> км/ч (2600 px/с — полный газ — это 156 км/ч). */
    kmh(pxs) { return Math.round(Math.abs(pxs) * (typeof HUD_KMH_PER_PXS !== 'undefined' ? HUD_KMH_PER_PXS : 0.06)); },

    /** Скорость в px/с -> км/ч на цифрах и сегментной шкале (зелёные, жёлтые, красные). */
    setSpeed(pxs) {
        const kmh = this.kmh(pxs);
        if (kmh === this._speedShown) return;
        this._speedShown = kmh;
        const box = /** @type {HTMLElement} */ (this.el.hud.querySelector('#hud-speed'));
        if (!box) return;
        const n = box.querySelector('.n'); if (n) n.textContent = String(kmh);
        const frac = Math.min(1, kmh / hudKmhMax());
        const on = Math.round(frac * HUD_SEGS);
        const segs = box.querySelectorAll('.segs i');
        segs.forEach((e, i) => { e.className = i < on ? 'on' + (i >= HUD_SEGS * 0.8 ? ' h' : i >= HUD_SEGS * 0.55 ? ' m' : '') : ''; });
        box.classList.toggle('hot', frac > 0.82);
    },

    setWorld(n, total) {
        this._cpTotal = total;
        const w = this.el.hud.querySelector('#hud-progress .w'); if (w) w.textContent = Lang.t('world.n', { n }) + ' · ' + Lang.t('world.' + n);
        const ticks = this.el.hud.querySelector('#hud-progress .ticks');
        if (ticks) { ticks.innerHTML = ''; for (let i = 1; i < total; i++) { const t = document.createElement('i'); t.className = 'tick'; t.style.left = (i / total * 100) + '%'; ticks.appendChild(t); } }
    },

    setProgress(frac, cp) {
        const p = Math.max(0, Math.min(1, frac));
        const fill = /** @type {HTMLElement} */ (this.el.hud.querySelector('#hud-progress .fill')); if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
        const me = /** @type {HTMLElement} */ (this.el.hud.querySelector('#hud-progress .me')); if (me) me.style.left = (p * 100).toFixed(1) + '%';
        const lbl = this.el.hud.querySelector('#hud-progress .p'); if (lbl) lbl.textContent = Lang.t('hud.progress', { p: Math.floor(p * 100) });
        const ticks = this.el.hud.querySelectorAll('#hud-progress .tick');
        ticks.forEach((t, i) => t.classList.toggle('on', i < cp));
    },

    toast(text, small) {
        const box = this.el.toast;
        const t = document.createElement('div');
        t.className = 't' + (small ? ' s' : '');
        t.textContent = text;
        box.appendChild(t);
        setTimeout(() => t.remove(), 950);
        while (box.children.length > 3) box.firstChild.remove();
    },

    /** Большой баннер трюка или тарана по центру: title — «Сальто назад», sub — «+14», kind: trick | ram | crush. */
    trick(title, sub, kind) {
        const box = this.el.hud.querySelector('#hud-trick');
        if (!box) return;
        box.innerHTML = '';
        const b = document.createElement('div');
        b.className = 'b ' + (kind || 'trick');
        const n = document.createElement('span'); n.className = 'n'; n.textContent = title;
        b.appendChild(n);
        if (sub) { const c = document.createElement('span'); c.className = 'c'; c.innerHTML = `<img src="${HUD_ICON.coin}" alt="" style="width:1em;height:1em;vertical-align:-.12em"> <i></i>`; (/** @type {HTMLElement} */ (c.querySelector('i'))).textContent = sub; b.appendChild(c); }
        box.appendChild(b);
        const mine = b;
        setTimeout(() => { if (mine.parentNode === box) mine.remove(); }, 1750);
    },

    flash(alpha, ms) {
        const f = this.el.flash;
        f.style.transition = 'none'; f.style.opacity = String(alpha || 0.7);
        requestAnimationFrame(() => { f.style.transition = 'opacity ' + ((ms || 400) / 1000) + 's'; f.style.opacity = '0'; });
    },

    /** Кнопки «за рекламу» в HUD: подпись, кулдаун, активная ракета. */
    refreshAds(rocketLeft) {
        if (rocketLeft != null) this._rocketLeft = rocketLeft;
        const left = typeof Ads !== 'undefined' ? Ads.cooldownLeft() : 0;
        const busy = typeof Ads !== 'undefined' && Ads.busy();
        for (const id of ['hud-skip', 'hud-rocket']) {
            const b = /** @type {HTMLButtonElement} */ (document.getElementById(id));
            if (!b) continue;
            const w = b.querySelector('small .w');
            const active = id === 'hud-rocket' && this._rocketLeft > 0;
            const off = left > 0 || busy || active;
            b.classList.toggle('is-off', off);
            if (w) w.textContent = active ? Lang.t('hud.wait', { n: Math.ceil(this._rocketLeft) }) : left > 0 ? Lang.t('hud.wait', { n: left }) : Lang.t('hud.ad');
        }
    },
    _rocketLeft: 0,

    /** Карточки миров в меню. worlds: [{ n, id, locked, needN, done, best, frac, cp, total }] */
    _sel: 1,
    /** Карточка выбранного мира и стрелки. worlds: [{ n, id, locked, needN, done, best, frac, cp, total }] */
    renderWorlds(worlds, selected) {
        const card = this.el.menu.querySelector('.wcard');
        if (!card) return;
        const w = worlds.find(x => x.n === selected) || worlds[0];
        if (!w) { card.innerHTML = ''; return; }
        this._sel = w.n;
        const colors = ['var(--bo-yellow)', 'var(--bo-orange)', 'var(--bo-sky)'];
        const art = HUD_WORLD_ART[w.n - 1];
        card.className = 'wcard' + (w.locked ? ' locked' : '') + (w.done ? ' finished' : '');
        card.style.setProperty('--c', colors[(w.n - 1) % 3]);
        const meta = w.cp > 0 && !w.done ? Lang.t('world.cp', { a: w.cp, b: w.total }) : w.best ? Lang.t('world.best', { t: this.fmt(w.best) }) : Lang.t('world.noBest');
        const dots = worlds.map(x => `<i class="${x.n === w.n ? 'on' : ''}"></i>`).join('');
        const pct = Math.round((w.done ? 1 : w.frac) * 100);
        card.innerHTML = `<div class="view">${art ? `<img class="img" src="${art}" alt="">` : '<div class="plain"></div>'}<div class="dots">${dots}</div><img class="done" src="${HUD_ICON.check}" alt="">
              <div class="lock"><img src="${HUD_ICON.lock}" alt=""><span>${Lang.t('world.locked', { n: w.needN })}</span></div></div>
            <div class="info"><span class="num">${w.n}</span><div class="txt"><span class="nm">${Lang.t('world.' + w.n)}</span><span class="meta">${meta}</span><div class="pbar"><i style="width:${pct}%"></i></div></div></div>`;
        const idx = worlds.indexOf(w);
        const l = this.el.menu.querySelector('.wsel .arr.l'), r = this.el.menu.querySelector('.wsel .arr.r');
        if (l) l.classList.toggle('is-off', idx <= 0);
        if (r) r.classList.toggle('is-off', idx >= worlds.length - 1);
        const play = this.el.menu.querySelector('.menu-play');
        if (play) play.classList.toggle('is-off', !!w.locked);
    },

    setPlayLabel(key) { const s = this.el.menu.querySelector('.menu-play span'); if (s) s.textContent = Lang.t(key); },
    setHot(name, on) { const b = this.el.menu.querySelector('[data-m="' + name + '"]'); if (b) b.classList.toggle('hot', !!on); },

    // ---- оверлеи ----
    /** opts.band: 'hazard' (по умолчанию) | 'checker' — лента сверху панели (шахматка — только у финиша). */
    overlay(html, buttons, opts) {
        const o = this.el.over;
        const band = opts && opts.band === 'checker' ? 'bo-checker' : 'bo-hazard';
        o.innerHTML = `<div class="over-panel bo-panel"><div class="band ${band}"></div>${html}<div class="over-btns"></div></div>`;
        const box = o.querySelector('.over-btns');
        for (const row of buttons) {
            const holder = Array.isArray(row) ? Object.assign(document.createElement('div'), { className: 'row' }) : box;
            if (Array.isArray(row)) box.appendChild(holder);
            for (const b of Array.isArray(row) ? row : [row]) {
                const btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'bo-btn';
                btn.style.setProperty('--c', b.color || 'var(--bo-green)');
                btn.innerHTML = (b.icon ? `<img class="bo-ico" src="${b.icon}" alt="">` : '') + `<span>${Lang.t(b.key, b.params)}</span>`;
                if (b.off) btn.classList.add('is-off');
                let done = false;
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (done || btn.classList.contains('is-off')) return;
                    if (!b.keep) done = true;
                    this._click(); b.fn();
                });
                holder.appendChild(btn);
            }
        }
        o.classList.add('on');
    },
    closeOverlay() { this.el.over.classList.remove('on'); this.el.over.innerHTML = ''; },
    overlayOpen() { return this.el.over.classList.contains('on'); },

    showPause(h) {
        this.overlay(`<h2>${Lang.t('pause.title')}</h2>`, [
            { key: 'pause.resume', icon: HUD_ICON.play, fn: h.resume },
            [{ key: 'menu.garage', icon: HUD_ICON.shop, color: 'var(--bo-orange)', fn: h.garage }, { key: 'menu.settings', icon: HUD_ICON.settings, color: 'var(--bo-purple)', fn: h.settings }],
            [{ key: 'pause.restart', icon: HUD_ICON.restart, color: 'var(--bo-sky)', fn: h.restart }, { key: 'pause.menu', icon: HUD_ICON.home, color: 'var(--bo-red)', fn: h.menu }],
        ]);
    },

    showFinish(d, h) {
        const rec = d.record ? `<div class="rec">${Lang.t('finish.record')}</div>` : '';
        const html = `<h2>${Lang.t('finish.title')}</h2><div class="sub">${Lang.t('world.n', { n: d.n })} · ${Lang.t('world.' + d.n)}</div>${rec}
          <div class="stats"><div class="stat"><b>${Lang.t('finish.time')}</b><span>${this.fmt(d.time)}</span></div>
          <div class="stat"><b>${Lang.t('finish.best')}</b><span>${this.fmt(d.best)}</span></div>
          <div class="stat"><b>${Lang.t('finish.coins')}</b><span><img src="${HUD_ICON.coin}" alt="">+${d.coins}</span></div>
          <div class="stat"><b>${Lang.t('finish.deaths')}</b><span><img src="${HUD_ICON.skull}" alt="">${d.deaths}</span></div></div>
          ${d.all ? `<div class="sub">${Lang.t('finish.all')}</div>` : ''}`;
        const btns = [];
        if (h.next) btns.push({ key: 'finish.next', icon: HUD_ICON.arrow, fn: h.next });
        btns.push([{ key: 'finish.again', icon: HUD_ICON.restart, color: 'var(--bo-sky)', fn: h.again }, { key: 'finish.menu', icon: HUD_ICON.home, color: 'var(--bo-purple)', fn: h.menu }]);
        this.overlay(html, btns, { band: 'checker' });
    },
};

// Пикабу Игры: название только по-русски — вывеска меню.
if (String(GAME_PLATFORM) === 'pikabu' && typeof LANG_STRINGS !== 'undefined') for (const c of Object.keys(LANG_STRINGS)) Object.assign(/** @type {Record<string, Record<string, string>>} */ (LANG_STRINGS)[c], { 'game.title1': 'Грузовик в небе', 'game.title2': 'полоса препятствий' });
