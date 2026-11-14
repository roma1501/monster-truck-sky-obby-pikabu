// @ts-nocheck
// PikabuPacks.js — наборы за рубли в сборке Пикабу Игр (js/PikabuShop.js). Цены и названия товаров — в Студии
// (каталог CSV: coins_s 19 ₽, coins_m 49 ₽, coins_l 99 ₽, starter 29 ₽, no_ads 59 ₽), здесь — что игрок получает.
// Валюта магазина — монеты (Shop.addCoins), предметы набора — лучшие «за рекламу» из каталога Shop.
PikabuShop.setup({
    colors: ['#00b0ff', '#7c4dff'],
    ready: () => !!(typeof Shop !== 'undefined' && Shop.state && Shop.items().length),
    visible: () => Game.state === 'menu',
    persist: () => Shop._save('pikabu'),
    button: { corner: 'tr', x: 12, y: 74 },
    packs: [
        { id: 'coins_s', type: 'consumable', icon: '🪙', name: 'Горсть монет', desc: '1 000 монет на грузовики, краски и диски', grant: () => Shop.addCoins(1000) },
        { id: 'coins_m', type: 'consumable', icon: '💰', name: 'Мешок монет', desc: '3 000 монет', grant: () => Shop.addCoins(3000) },
        { id: 'coins_l', type: 'consumable', icon: '🏆', name: 'Сундук монет', desc: '8 000 монет — хватит на самые дорогие предметы', best: true, grant: () => Shop.addCoins(8000) },
        {
            id: 'starter', type: 'non_consumable', icon: '🚚', name: 'Ледяной плуг', best: 'Один раз',
            desc: '1 500 монет, грузовик «Ледяной плуг», краска «Розовый хром» и диски «Аэро хром»',
            grant: () => Shop.addCoins(1500),
            apply: () => PikabuShop.shopGrant(['car_ghost', 'paint_chrome_rose', 'rim_aero_chrome']),
        },
        { id: 'no_ads', type: 'non_consumable', icon: '🚫', name: 'Без рекламы', desc: 'Убирает рекламу между заездами навсегда. Награды за рекламу остаются', noAds: true },
    ],
});
