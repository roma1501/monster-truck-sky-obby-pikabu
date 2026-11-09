// Constants.js — ВСЕ числа игры на Lory Engine: земля, камера, рендер, звук. Грузится
// ПЕРВЫМ: остальные модули читают эти глобалы. Правит редактор (_utils/editor): сервер
// патчит только строки `const ИМЯ = <число>;` — значения держать числовыми
// литералами (цвета — 0xRRGGBB), формулу редактор не тронет. Карты (размер, рельеф,
// объекты) — в Maps.js.
const ENGINE_NAME = 'Lory Engine';
const ENGINE_VERSION = '1.30';
const GAME_MODE = '3d';              // '3d' | '2d': renderer selected before boot
const WORLD2D_WIDTH = 960;            // logical viewport width (world pixels)
const WORLD2D_HEIGHT = 540;            // logical viewport height
const WORLD2D_PIXEL_RATIO = 2;         // maximum device pixel ratio
const WORLD2D_SMOOTH = 0;              // 1 — сглаживание картинок (мягкая графика), 0 — пиксель-арт
const WORLD2D_LETTERBOX = 0x101923;    // цвет полей вокруг логической сцены (0xRRGGBB)
const LOADING_TIMEOUT_MS = 45000;    // ожидание готовности шейдеров/текстур; при ошибке — повтор
const LOADING_PAINT_MS = 1000;       // ожидание кадра экрана загрузки; кадров нет (скрытая вкладка, фоновый iframe) — дальше по таймеру
const FX_MAX_SYSTEMS = 48;           // одновременно живые слои частиц
const FX_MAX_PARTICLES = 6000;       // общий бюджет ёмкости систем на ПК
const FX_MOBILE_SCALE = 0.55;        // плотность и бюджет частиц на мобильных
const GAME_ID = 'monster-truck-sky-obby';          // латиница, цифры, -: имя архива dist/<GAME_ID>-<платформа>-<версия>.zip и ключей сохранений
const GAME_TITLE = 'Грузовик в небе: полоса препятствий';     // название игры: заголовок вкладки браузера
const GAME_VERSION = '1.0.0';         // версия билда: ?v= у скриптов (tools/build.mjs) и имя архива
const GAME_PLATFORM = 'pikabu';          // 'web' | 'yandex' | 'playables' | 'playgama' | 'telegram' | 'crazygames' | 'android' | 'test' — сборка ставит свою (build.bat <платформа>)
const GAME_LANG = 'ru';               // язык интерфейса: по умолчанию английский (русский — через Platform / LANG_AUTO); сборка playgama ставит en; Lang.js
// Название игры по площадке: { <сборка>: 'Название' } — сборка ставит его в GAME_TITLE, <title> и заставку загрузки
// (tools/platforms.mjs platformTitle).
/** @type {Record<string, string>} */
const GAME_TITLES = { playgama: 'Monster Truck Sky Obby', pikabu: 'Грузовик в небе: полоса препятствий' };

// Шим localStorage: в sandbox-iframe и при запрете данных сайта прямой доступ бросает SecurityError.
// Все обращения к хранилищу — только через Store.
/** @satisfies {Record<string, any>} */
const Store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* нечего удалять */ }
    },
    // Разбор JSON без падения: битое значение = как будто сохранения нет.
    getJSON(key, fallback = null) {
        const raw = Store.get(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            console.warn('Store: повреждённое значение "' + key + '", сбрасываю.');
            Store.remove(key);
            return fallback;
        }
    }
};

// Телефон или планшет: user agent, iPad под видом Mac, тач на небольшом экране.
const IS_MOBILE = (() => {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1366 &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024;
    const isiPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return userAgentMobile || isiPad || (hasTouchScreen && isSmallScreen);
})();

// --- ЗЕМЛЯ (Terrain3D.js). Размер, текстура и рельеф — у каждой карты свои (Maps.js).
// Единицы мира — px: x вправо, y вниз по карте, высота вверх (скилл world3d, §Координаты). ---
const GROUND_TILE_SIZE = 512;           // px мира на один повтор текстуры земли
const TERRAIN_CELL = 8;                 // px: шаг сетки террейна (мобильные — не мельче 12)
const TERRAIN_MAX_CELLS = 250000;       // клеток сетки террейна не больше: у огромной карты шаг растёт сам (трассы в небе на 60 000 px)

// --- ЗВУК (Sound.js): громкость 0..1; выключенный звук игрок сохраняет сам (Store) ---
const SOUND_VOLUME = 0.8;               // эффекты
const MUSIC_VOLUME = 0.5;               // музыка

// --- ЯЗЫК (Lang.js) ---
const LANG_AUTO = 0;                    // 1 — язык платформы, если он есть в словаре; 0 — всегда GAME_LANG

// --- ПЛАТФОРМА И ТЕЛЕМЕТРИЯ (Platform.js, Telemetry.js) ---
const PLATFORM_SAVE_GZIP_MIN = 32768;   // знаков JSON сохранения, с которых облачная запись сжимается gzip (0 — не сжимать)
const TELEMETRY_WINDOW_MS = 30000;      // окно performance_sample: один агрегированный сэмпл примерно за столько мс активной игры
const TELEMETRY_TARGET_FPS = 60;        // целевой FPS игры для сэмпла (target_fps)
const TELEMETRY_MIN_FRAMES = 30;        // меньше кадров в окне — сэмпл не отправляется
const TELEMETRY_MAX_FRAMES = 8192;      // буфер кадров окна: заполнился — окно закрывается раньше
const TELEMETRY_MAX_FRAME_MS = 5000;    // кадр дольше — это разрыв (пауза, фон), а не «застывший кадр»: не считается

// --- ПЛАТФОРМЫ: Telegram Mini App и Android-обёртка (PlatformTelegram.js, PlatformAndroid.js) ---
const TELEGRAM_LANDSCAPE_ONLY = 1;      // Telegram: 1 — игра только альбомная: в портрете поверх всего картинка «Поверните устройство» и пауза; 0 — любая ориентация
const TELEGRAM_BG_COLOR = 0x101c22;     // Telegram: цвет шапки и фона Mini App (0xRRGGBB), как у экрана загрузки
const PLATFORM_ANDROID_BRIDGE = 'AndroidAds'; // Android: имя Java-интерфейса нативной обёртки (addJavascriptInterface); строка — редактор её не трогает

// --- КАМЕРА (CameraControl.js): цель на карте, азимут, наклон и зум. Зум —
// экранных px на мировой px в точке взгляда; расстояние выводится из него. ---
const CAMERA_FOV_DEG = 52;              // вертикальный угол обзора
const CAMERA_AZIMUTH_DEG = -90;         // куда смотрит камера по карте: −90 — север вверх, 0 — восток вверх
const CAMERA_PITCH_DEG = 57;            // наклон к земле: 90 — строго сверху, меньше — больше перспективы
const CAMERA_ZOOM = 1;                  // стартовый зум: ПК и планшеты
const CAMERA_ZOOM_MOBILE = 0.7;         // стартовый зум: телефоны (большая сторона экрана < 1024)
const CAMERA_ZOOM_MIN = 0.5;            // дальше колесо и щипок не отводят (ниже — в кадр попадёт край земли)
const CAMERA_ZOOM_MAX = 3;              // ближе не приближают
const CAMERA_ZOOM_WHEEL_STEP = 0.12;    // доля зума за один щелчок колеса
const CAMERA_ZOOM_LERP = 0.18;          // сглаживание зума: доля остатка за кадр
const CAMERA_FOLLOW_LERP = 0.05;        // слежение за объектом (follow): доля остатка за кадр
const CAMERA_PAN_KEY_SPEED = 900;       // WASD и стрелки: экранных px/с
const CAMERA_ORBIT = 1;                 // вращение камеры игроком (ПКМ): 0 — ориентация фиксирована, 1 — можно
const CAMERA_ORBIT_DEG_PER_PX = 0.3;    // градусов поворота на экранный px драга
const CAMERA_ORBIT_PITCH_MIN_DEG = 35;  // ниже к земле не опускается (предел поднимается и сам — край земли не в кадре)
const CAMERA_ORBIT_PITCH_MAX_DEG = 88;  // выше — почти строго сверху

// --- РЕНДЕР (World3D.js): свет, тени, небо, материалы, toon и контур. Читает
// World3D.cfg(), редактор применяет правки к живой сцене. ---
// Солнце одно на весь мир. Азимут — КУДА падает тень по карте (0 — вправо, 90 — вниз).
const WORLD3D_SUN_AZIMUTH_DEG = 32;
const WORLD3D_SUN_ELEVATION_DEG = 41;   // высота солнца над горизонтом
const WORLD3D_SUN_INTENSITY = 0.8;      // сила солнца (с небом в сумме ~1.0 на ровной земле — краска текстуры без изменений)
const WORLD3D_SUN_COLOR = 0xffedc7;     // цвет солнца
const WORLD3D_SKYLIGHT_INTENSITY = 0.45; // рассеянный свет неба (полусферический источник)
const WORLD3D_SKYLIGHT_COLOR = 0xb1d8f7; // цвет света неба (грани, смотрящие вверх)
const WORLD3D_GROUNDLIGHT_COLOR = 0xc2c7ad; // подсветка снизу (отражение от земли)
const WORLD3D_SKY_COLOR = 0x9fe6f4;     // цвет неба и тумана
const WORLD3D_FOG_DENSITY = 0.00008;    // экспоненциальный туман к горизонту (0 — выключить)
// Тени: один цвет на все (красит toon-плагин, Babylon даёт только видимость солнца)
const WORLD3D_SHADOW_COLOR = 0x0f3a4d;  // цвет тени
const WORLD3D_SHADOW_STRENGTH = 0.52;    // сила тени 0..1: поверхность в тени умножается на смесь белого и цвета тени
const WORLD3D_SHADOW_SOFT = 2;          // край: 0 — жёсткий (под toon), 1..3 — PCF низкое/среднее/высокое (мобильные — не выше 1)
const WORLD3D_SHADOW_MAP = 1024;        // размер карты теней (мобильные — вдвое меньше); правка пересоздаёт карту
const WORLD3D_SHADOW_RADIUS = 1400;      // px: ПРЕДЕЛ полуразмера ортокадра теней; сам кадр ужимается по объектам в кадре
const WORLD3D_SHADOW_BIAS = 0.001;     // смещение глубины против «акне» (полосы тени на освещённых гранях)
const WORLD3D_SHADOW_NORMAL_BIAS = 0.8; // смещение вдоль нормали против «акне» (полосы и «пила» на гранях под острым углом к солнцу), в текселях карты теней сверх радиуса сглаживания края (его прибавляет движок)
// Материалы по группам (блик — доля 0..1, размер — показатель степени: больше — блик мельче)
const WORLD3D_GROUND_SPECULAR = 0;      // блик земли (0 — матовая)
const WORLD3D_GROUND_SPEC_POWER = 1;    // размер блика земли
const WORLD3D_OUTER_TINT = 1;           // яркость земли ЗА краем локации (меньше 1 — граница локации видна)
const WORLD3D_PROP_SPECULAR = 0.05;     // блик окружения (группа 'prop')
const WORLD3D_PROP_SPEC_POWER = 7;     // размер блика окружения
const WORLD3D_ACTOR_SPECULAR = 0;       // блик главных объектов (группа 'actor'); под toon — яркость «зайчика»
const WORLD3D_ACTOR_SPEC_POWER = 23;    // размер блика главных объектов
// Toon-шейдер (LoryToonPlugin): свет всех источников (солнце + небо, с тенью) квантуется в ступени
const WORLD3D_TOON = 1;                 // 1 — toon-затенение и обводка силуэта, 0 — обычное плавное без обводки
const WORLD3D_TOON_BANDS = 4;           // ступеней света (2..6)
const WORLD3D_TOON_SOFT = 0.02;         // мягкость границы ступени (0 — резко, 0.5 — почти плавно)
const WORLD3D_TOON_LOW = 0.48;          // яркость самой тёмной ступени (доля от полной)
const WORLD3D_TOON_GROUND = 1;          // 1 — ступени и на земле, 0 — земля затеняется плавно
const WORLD3D_TOON_SPEC = 0.25;            // сила блика-«зайчика» (0 — без блика)
const WORLD3D_TOON_SPEC_SIZE = 0.075;    // порог блика (меньше — крупнее пятно)
const WORLD3D_TOON_RIM = 0.28;           // светлый ободок по краю силуэта объектов (0 — нет)
const WORLD3D_TOON_RIM_WIDTH = 0.24;    // ширина ободка
// Контур рёбер (EdgesRenderer): рёбра, изломанные круче порога
const WORLD3D_TOON_INK = 2;             // 0 — нет, 1 — главные объекты, 2 — и окружение
const WORLD3D_TOON_INK_WIDTH = 25;      // толщина линии (≈ мировых px × 100; тоньше с удалением камеры)
const WORLD3D_TOON_INK_COLOR = 0x171717; // цвет чернил: контур рёбер и обводка силуэта
const WORLD3D_TOON_INK_ANGLE = 40;      // °: ребро рисуется, если грани изломаны круче
const WORLD3D_TOON_INK_MAX_TRIS = 20000; // часть модели тяжелее (треугольников) — без контура рёбер; 0 — без предела
// Обводка внешнего силуэта: постэффект (HighlightLayer, isStroke), толщина — в экранных px
const WORLD3D_TOON_OUTLINE = 2;         // 0 — нет, 1 — главные объекты, 2 — и окружение (только при WORLD3D_TOON = 1)
const WORLD3D_TOON_OUTLINE_ACTOR_WIDTH = 1.5;   // экранных px: обводка главных объектов
const WORLD3D_TOON_OUTLINE_PROP_WIDTH = 1;  // экранных px: обводка окружения (его в кадре много — тоньше)

// ================================================================================================
// 1.30 · СИСТЕМЫ ИГРЫ (systems-b): магазин косметики (Shop.js), Daily Gift (DailyGift.js), колесо
// фортуны (Wheel.js). Модули опт-ин и чисто логические: цены, награды и секторы — данные игры
// (Shop.init / DailyGift.init / Wheel.init), здесь — лимиты и правила пользователя.
// ================================================================================================
const REWARDED_RETRY_SEC = 4;           // с: после неудачного/закрытого rewarded тот же запрос не повторяется (кнопка «реклама недоступна»)
// Shop.validate(): правило каталога — вкладки, предметы, доля валюты и рекламы
const SHOP_TABS_MIN = 5;                // вкладок в магазине: не меньше
const SHOP_TABS_MAX = 6;                // ...и не больше
const SHOP_ITEMS_MIN = 20;              // предметов во вкладке: не меньше
const SHOP_ITEMS_MAX = 50;              // ...и не больше
const SHOP_COINS_SHARE = 35;            // доля предметов за валюту во вкладке, % (остальные — за рекламу)
const SHOP_SHARE_TOLERANCE = 10;        // допуск доли, процентных пунктов
const SHOP_ADS_MIN = 1;                 // просмотров рекламы на предмет: не меньше
const SHOP_ADS_MAX = 7;                 // ...и не больше
// Daily Gift
const DAILY_CYCLE_DAYS = 7;             // дней в круге (1..6 — награды из данных игры, последний — эксклюзивный скин)
const DAILY_FALLBACK_COINS = 600;       // последний день, когда все эксклюзивные скины уже есть: крупная награда валютой
const DAILY_DUP_COINS = 50;             // предмет награды дня уже есть у игрока — вместо него столько валюты
// Колесо фортуны
const WHEEL_AD_SPINS_PER_DAY = 3;       // дополнительных вращений за рекламу в день (бесплатное — одно в календарный день)
const WHEEL_TURNS = 6;                  // полных оборотов диска до выпавшего сектора
const WHEEL_SPIN_SEC = 5.5;             // рекомендуемая длительность анимации, с (по ней Wheel.pendingSpin().stale)
const WHEEL_LAND_SPREAD = 0.32;         // где внутри сектора встанет указатель: ± доля сектора от его центра (не у самой границы)
const WHEEL_DUP_COINS = 75;             // сектор с уже имеющимся предметом: столько валюты вместо него
// --- Rig.js и Nav.js (world-a): риги и навигация. Ниже — только они ---
const RIG_FADE = 0.15;                  // с: переход между клипами рига по умолчанию (rig.play({ fade }) переопределяет)
const NAV_CELL = 50;                    // px: клетка сетки путей Nav.path (мельче — точнее и дороже)
const NAV_STEP_PX = 12;                 // px: перепад высот, который юнит берёт шагом (ступень), сверх уклона
const NAV_SLOPE = 1.6;                  // допустимый уклон: px высоты на px пути (пандус и арка моста проходимы, стенка помоста — нет)
// ===== 1.30: ВВОД, РАСКЛАДКА HUD, ОБУЧЕНИЕ (systems-a) =====================================
// Модули opt-in: Input.js, HudLayout.js, Tutorial.js. Игра, которая их не зовёт, живёт как в 1.20.
// --- ВВОД (Input.js): мышь, касания, геймпад ---
const INPUT_POINTER_LOCK = 1;           // 1 — в режиме mouse:'lock' захватывать курсор (pointer lock); 0 — всегда ПКМ-драг (iframe без allow-pointer-lock)
const INPUT_LOOK_CLAMP_PX = 200;        // выброс movementX/Y мыши обрезается до этого значения за событие (Chromium при захвате курсора)
const INPUT_MOUSE_LOOK_SCALE = 1;       // множитель взгляда мыши (px мыши -> px взгляда)
const INPUT_TOUCH_LOOK_SCALE = 1.35;    // множитель взгляда свайпом по правой половине экрана
const INPUT_PAD_LOOK_SPEED = 1250;      // px взгляда в секунду при полном отклонении правого стика геймпада
const INPUT_PAD_DEADZONE = 0.2;         // мёртвая зона стиков геймпада (0..1)
const INPUT_STICK_RADIUS = 64;          // экранных px хода сенсорного стика (на маленьком экране — меньше)
const INPUT_STICK_DEADZONE = 0.12;      // мёртвая зона сенсорного стика (0..1)
const INPUT_STICK_ZONE = 0.5;           // касание левее этой доли ширины экрана ведёт стик, правее — взгляд
const INPUT_ACTION_BUTTON_SIZE = 76;    // px: диаметр контекстной кнопки на телефоне

// --- РАСКЛАДКА HUD (HudLayout.js): режимы по размеру окна, поля, зазоры ---
const HUDLAYOUT_MARGIN = 10;            // px: поле от края безопасной области (при масштабе 1)
const HUDLAYOUT_GAP = 8;                // px: зазор между блоками (при масштабе 1)
const HUDLAYOUT_SCALE_MIN = 0.55;       // масштаб блоков не опускается ниже (дальше — переполнение)
const HUDLAYOUT_SCALE_MAX = 1.25;       // и не поднимается выше
const HUDLAYOUT_LOW_HEIGHT = 420;       // альбомное окно ниже этого (640×360, 568×320, iframe с рекламной полосой) — режим low
const HUDLAYOUT_WIDE_HEIGHT = 540;      // альбомное окно выше этого и шире WIDE_WIDTH — режим wide, иначе land
const HUDLAYOUT_WIDE_WIDTH = 820;       // см. WIDE_HEIGHT
const HUDLAYOUT_REFRESH_SEC = 0.3;      // период пересчёта по содержимому (меняется текст, блок показан/скрыт)

// --- ОБУЧЕНИЕ (Tutorial.js) ---
const TUTORIAL_STEP_DELAY = 0.7;        // с: «галочка» после выполненного шага перед следующим
const TUTORIAL_MOVE_SECONDS = 1.2;      // с: шаг-заготовка «идти» — сколько секунд игрок двигается
const TUTORIAL_LOOK_PIXELS = 260;       // px: шаг-заготовка «осмотреться» — сколько взгляда набрать
const TUTORIAL_FINAL_SECONDS = 2.5;     // с: сколько висит финальная фраза после прохождения (0 — без неё)
// ============================================================================================
// --- ЖИВАЯ ВОДА (LiveWater3D.js): волны Герстнера, рябь, берег, плавучесть. Области воды —
// маркеры карты water (круг радиуса scale[0]·100 px, уровень = земля в центре + h) или
// areas игры. Префикс LIVEWATER_, а не WATER_: WATER_* — плоская вода Terrain3D. ---
const LIVEWATER_QUALITY = 0;            // 0 — авто (ПК высокое, телефоны среднее), 1 — низкое, 2 — среднее, 3 — высокое
const LIVEWATER_WAVE_HEIGHT = 10;       // px: высота самой крупной волны (остальные ниже)
const LIVEWATER_WAVE_LENGTH = 1300;     // px: длина самой крупной волны
const LIVEWATER_WAVE_COUNT = 4;         // волн в сумме (1..6; низкое качество — не больше 3)
const LIVEWATER_WAVE_DIR_DEG = 20;      // °: куда бегут крупные волны по карте (0 — вправо, 90 — вниз)
const LIVEWATER_WAVE_SPREAD_DEG = 90;   // °: разброс направлений остальных волн
const LIVEWATER_WAVE_SPEED = 1;         // множитель скорости волн (0 — стоячая вода)
const LIVEWATER_WAVE_FADE = 140;        // px глубины: на меньшей волны затухают к берегу и не лезут на сушу
const LIVEWATER_STEEPNESS = 0.55;       // острота гребней 0..0.95 (выше — заворачиваются петлёй)
const LIVEWATER_RIPPLE_HEIGHT = 26;     // px: высота ряби при единичном всплеске
const LIVEWATER_RIPPLE_SPEED = 680;     // px/с: скорость кругов по воде
const LIVEWATER_RIPPLE_DAMP = 0.986;    // затухание ряби за шаг: ближе к 1 — круги живут дольше
const LIVEWATER_RIPPLE_CELL = 32;       // px: клетка сетки ряби (телефоны и низкое качество — крупнее)
const LIVEWATER_AMBIENT = 1.5;          // случайных капель в секунду (0 — гладь; низкое качество — без капель)
const LIVEWATER_GRID = 160;             // делений меша по большей стороне на высоком качестве (телефоны — ×0.7)
const LIVEWATER_SHALLOW_COLOR = 0x47d6dd; // цвет мелководья
const LIVEWATER_DEEP_COLOR = 0x137fa6;  // цвет глубины
const LIVEWATER_SKY_COLOR = 0x4f9fe8;   // отражение неба: зенит
const LIVEWATER_HORIZON_COLOR = 0xd4f1fd; // отражение неба: у горизонта
const LIVEWATER_FOAM_COLOR = 0xf7fcff;  // цвет пены
const LIVEWATER_DEPTH_FULL = 260;       // px: глубина, на которой вода становится «глубокой» (цвет, прозрачность)
const LIVEWATER_ALPHA_SHALLOW = 0.6;    // непрозрачность у самого берега 0..1 (на глубине — 1)
const LIVEWATER_FOAM = 1;               // сила пены 0..1 (прибой, гребни, рябь); 0 — без пены
const LIVEWATER_FOAM_WIDTH = 70;        // px: ширина прибоя у берега и препятствий
const LIVEWATER_GLINT = 1;              // блик солнца на воде (0 — нет)
const LIVEWATER_TOON = 1;               // 1 — ступени и жёсткая пена, когда включён toon мира; 0 — вода всегда плавная
const LIVEWATER_FLOAT_SPRING = 26;      // плавучесть: жёсткость пружины к поверхности
const LIVEWATER_FLOAT_DAMP = 5;         // плавучесть: затухание качки
const LIVEWATER_FLOAT_MAX = 24;         // плавающих предметов на воду
const LIVEWATER_BUDGET_MS = 2;          // мс на кадр на шаги ряби: исчерпан — оставшиеся шаги пропускаются
// ============================================================================
// 1.30 — МИР (ветка world-b): зоны земли и вода, декор, тени, уровни графики, камера,
// небо. Числа — литералами, редактор правит их (schema.js). Блок целиком — отдельный:
// при слиянии веток сохранить его как есть.
// ============================================================================

// --- ЗЕМЛЯ: зоны, покраска и вода по маркерам карты (Terrain3D.js, скилл world3d) ---
const TERRAIN_ZONE_BLEND = 0.35;        // zone-flat: ширина плавного перехода за кромкой — доля меньшей полуоси (внутри земля ровная)
const TERRAIN_PAINT_TEXEL = 12;         // покраска земли: мировых px на пиксель карты красок (телефоны — вдвое грубее)
const TERRAIN_PAINT_MAX = 2048;         // покраска земли: предел стороны карты красок, px (телефоны — не больше 1024)
const TERRAIN_PAINT_SOFT = 0.3;         // покраска земли: мягкий край — доля меньшей полуоси зоны
const TERRAIN_PAINT_DETAIL = 0.5;       // покраска земли: сколько рисунка тайла травы (по светлоте) остаётся поверх краски, 0..1
const WATER_SHALLOW_COLOR = 0x62dcd8;   // вода: цвет мелководья
const WATER_DEEP_COLOR = 0x2a78d0;      // вода: цвет глубины
const WATER_ALPHA_SHALLOW = 0.42;       // вода: непрозрачность у берега 0..1
const WATER_ALPHA_DEEP = 0.9;           // вода: непрозрачность на глубине 0..1
const WATER_DEPTH_FULL = 260;           // вода: глубина (px), на которой цвет и прозрачность становятся «глубокими»
const WATER_WAVE_SPEED = 1;             // вода: скорость волн и бликов (0 — стоячая)
const WATER_FOAM = 1;                   // вода: пена у берега 0..1

// --- ДЕКОР (Location3D.js): батчинг — игра, opts.batchDecor ---
const DECOR_BATCH_OUTLINE = 0;          // обводка силуэта у инстансов декора: 0 нет (остаётся контур рёбер), 1 только ПК, 2 везде; тон обводки один на меш — вдали видны «призраки» контура

// --- ТЕНИ И ЗЕМЛЯ ПОД TOON (World3D.js) ---
const WORLD3D_SHADOWS = 1;              // 1 — тени есть, 0 — нет (нет прохода карты теней и выборок в шейдерах)
const WORLD3D_SHADOW_CULL = 1;          // 1 — в карту теней рисуются только кастеры, задевающие ортокадр солнца (меньше draw calls), 0 — все
const WORLD3D_SHADOW_CULL_PAD = 160;    // px: запас к кадру теней при отсечении кастеров (мягкий край, смещение по нормали)
const WORLD3D_SHADOW_MIN_SIZE = 4;      // px: меши с радиусом габарита меньше (мелочь) тень не отбрасывают — меньше draw calls; 0 — все
const WORLD3D_TOON_GROUND_BANDS = 0;    // ступеней света на земле (0 — как у объектов): на склонах гор крупные тёмные пятна дробятся на мелкие шаги
const WORLD3D_TOON_GROUND_SOFT = -1;    // мягкость границ ступеней земли (отрицательное — как у объектов)
const WORLD3D_TOON_GROUND_LOW = -1;     // яркость самой тёмной ступени земли: склон, отвёрнутый от солнца, не чернеет (отрицательное — как у объектов)

// --- КАМЕРА (CameraControl.js) ---
const CAMERA_EDGE_GUARD = 1;            // 1 — наклон не такой, чтобы край земли за картой попал в кадр; 0 — можно смотреть в горизонт (вид от третьего лица: край прячут туман и кольцо земли)

// --- УРОВНИ ГРАФИКИ (Quality.js): низкий / средний / высокий. Уровень — по устройству, игрок может выбрать свой (Store) ---
const QUALITY_AUTO = 1;                 // 1 — уровень по устройству (если игрок не выбрал сам), 0 — всегда QUALITY_DEFAULT
const QUALITY_DEFAULT = 2;              // уровень без автоопределения: 0 низкий, 1 средний, 2 высокий
const QUALITY_DECOR_LOW = 0.25;         // доля декора (деревья, кусты из папки декора), которая остаётся: низкий (убирается ~75%)
const QUALITY_DECOR_MEDIUM = 0.5;       // средний (убирается ~50%)
const QUALITY_DECOR_HIGH = 0.7;         // высокий (убирается ~30%)
const QUALITY_SHADOWS_LOW = 0;          // тени: 0 — нет, 1 — облегчённые (карта теней мельче), 2 — полные
const QUALITY_SHADOWS_MEDIUM = 1;
const QUALITY_SHADOWS_HIGH = 2;
const QUALITY_SHADOW_LITE_SCALE = 0.5;  // облегчённые тени: размер карты теней — эта доля от WORLD3D_SHADOW_MAP
const QUALITY_OUTLINE_LOW = 0;          // контур и обводка: 0 — нет, 1 — главные объекты, 2 — как в WORLD3D_TOON_OUTLINE / _INK
const QUALITY_OUTLINE_MEDIUM = 1;
const QUALITY_OUTLINE_HIGH = 2;
const QUALITY_DPR_LOW = 1.25;           // потолок плотности пикселей рендера (пикселей на CSS px): низкий
const QUALITY_DPR_MEDIUM = 1.5;
const QUALITY_DPR_HIGH = 2;
const QUALITY_PIXELS_LOW = 0.55;        // телефоны и планшеты: бюджет кадра, мегапикселей — низкий
const QUALITY_PIXELS_MEDIUM = 0.85;
const QUALITY_PIXELS_HIGH = 1.4;
const QUALITY_SCALE_MIN = 0.87;         // рендер не мельче этой доли CSS-разрешения: ниже картинка мылится

// --- НЕБО И ВРЕМЯ СУТОК (Sky3D.js): день — это константы WORLD3D_SUN_* / _SKY*, ночь и сумерки — отсюда ---
const SKY_CYCLE_SECONDS = 480;          // секунд на сутки; 0 — время стоит на SKY_START_HOUR
const SKY_START_HOUR = 11;              // час суток при запуске (0..24)
const SKY_SUNRISE_HOUR = 6;             // час восхода
const SKY_SUNSET_HOUR = 18;             // час заката
const SKY_TWILIGHT_HOURS = 1.5;         // длительность рассвета и сумерек, часов
const SKY_SUN_SWEEP_DEG = 140;          // на сколько градусов за день поворачивается направление тени
const SKY_SUN_MIN_ELEVATION_DEG = 8;    // высота солнца у горизонта: ниже не опускается (тени не тянутся в бесконечность)
const SKY_MOON_ELEVATION_DEG = 38;      // высота лунного света ночью
const SKY_TWILIGHT_SUN_COLOR = 0xffa464; // цвет света на восходе и закате
const SKY_TWILIGHT_SKY_COLOR = 0xf0a37c; // цвет неба и тумана на восходе и закате
const SKY_NIGHT_SKY_COLOR = 0x0c1630;   // цвет неба и тумана ночью
const SKY_NIGHT_SUN_COLOR = 0xa8b8ea;   // цвет лунного света
const SKY_NIGHT_SUN_INTENSITY = 0.5;    // сила лунного света (у солнца — WORLD3D_SUN_INTENSITY)
const SKY_NIGHT_SKYLIGHT_COLOR = 0x8d9fd6; // цвет света неба ночью
const SKY_NIGHT_SKYLIGHT_INTENSITY = 0.55; // сила света неба ночью (форма предметов должна читаться)
const SKY_NIGHT_GROUNDLIGHT_COLOR = 0x3f4a68; // подсветка снизу ночью
const SKY_NIGHT_SHADOW = 0.5;           // сила тени ночью — доля дневной
const SKY_NIGHT_FOG = 1.6;              // густота тумана ночью — во сколько раз гуще дневной
const SKY_WEATHER_FADE = 6;             // секунд на плавную смену погоды

// ============================================================================
// MONSTER TRUCK SKY OBBY — числа игры (трак, камера погони, награды). Литералы: их правит редактор.
// ============================================================================
const CAR_GRAVITY = 3200;               // px/с²: гравитация
const CAR_MAX_SPEED = 2600;             // px/с: предел скорости на газу (≈156 км/ч на спидометре)
const CAR_ACCEL = 1900;                 // px/с²: разгон с места (падает к пределу скорости)
const CAR_BRAKE = 4200;                 // px/с²: тормоз (S)
const CAR_REVERSE_SPEED = 700;          // px/с: задний ход
const CAR_COAST_DECEL = 280;            // px/с²: накат без газа (торможение двигателем)
const CAR_AIR_DRAG = 0.1;               // 1/с: сопротивление воздуха в полёте
const CAR_JUMP_SPEED = 1300;            // px/с: прыжок «гидравликой» (Пробел)
const CAR_STEER_LOW_DEG = 34;           // °: угол руля на малой скорости
const CAR_STEER_HIGH_DEG = 10;          // °: угол руля на полной скорости (между — линейно по скорости)
const CAR_STEER_RESPONSE = 8;           // 1/с: как быстро руль догоняет ввод
const CAR_GRIP = 1.3;                  // коэффициент трения шин (круг трения μ·N)
const CAR_ICE_GRIP = 0.22;              // доля сцепления на льду
const CAR_LATERAL_STIFF = 0.85;         // доля боковой скорости пятна, которую шина гасит за подшаг (меньше — больше заноса)
const CAR_DOWNFORCE = 0.00012;          // прижим: доп. ускорение = k·v² (на 2600 px/с ≈ +25% веса)
const CAR_SUSP_SAG = 26;                // px: просадка подвески под весом (жёсткость пружин)
const CAR_SUSP_DAMP = 0.34;             // доля критического демпфирования амортизаторов
const CAR_SUSP_TRAVEL = 50;             // px: ход сжатия до отбойника
const CAR_SUSP_DROOP = 30;              // px: колесо ещё касается, если опора ниже покоя на столько
const CAR_ANTIROLL = 0.45;               // стабилизатор поперечной устойчивости (доля жёсткости пружины)
const CAR_STEP_UP = 30;                 // px: бортик, который колесо переезжает без прыжка (у трака умножается на радиус колеса / 36)
const CAR_CLIMB_MAX = 80;               // px: ступень, на которую трак сам «запрыгивает», если жать газ (умножается на радиус колеса / 36)
const CAR_AIR_YAW = 2.2;                // рад/с: поворот в полёте рулём
const CAR_AIR_PITCH = 2.5;              // рад/с: наклон носа в полёте (W/S)
const CAR_AIR_LEVEL = 7;                // 1/с²: выравнивание в полёте к горизонту
const CAR_UPRIGHT = 9;                  // 1/с²: на опоре — стремление встать на колёса (аркада)
const CAR_COYOTE_SEC = 0.12;            // с: прыжок ещё можно нажать после края платформы
const CAR_JUMP_BUFFER_SEC = 0.16;       // с: нажатие прыжка чуть раньше приземления засчитывается
const CAR_BOOST_SPEED = 3600;           // px/с: скорость с ускорителем (ракета)
const CAR_BOOST_SECONDS = 45;           // с: длительность ракеты за рекламу
const CAR_FALL_DEPTH = 900;             // px: ниже опоры рядом на столько — падение и возврат на чекпоинт
const CAR_KNOCKBACK = 1300;             // px/с: отброс от молота и балки
// --- МОНСТР-ТРАК: трюки, таран, тюнинг (GameCar.js, Game.js) ---
const CAR_TRICK_PITCH = 5.4;            // рад/с: сальто в воздухе при зажатом «прыжке» (W/S)
const CAR_TRICK_ROLL = 5.8;             // рад/с: бочка в воздухе при зажатом «прыжке» (A/D)
const TRICK_MIN_TURN = 0.78;            // доля оборота, которая уже считается целым (посадка с запасом)
const TRICK_BOOST_SEC = 1.6;            // с: короткий буст после чистого трюка
const TRICK_BOOST_KICK = 260;           // px/с: толчок вперёд при чистой посадке трюка
const TRICK_COINS_FLIP = 14;            // монет за сальто (за каждый оборот)
const TRICK_COINS_ROLL = 10;            // монет за бочку (за каждый оборот)
const TRICK_COMBO_COINS = 12;           // монет сверху за сальто с бочкой за один прыжок
const RAM_LOSS_CRATE = 0.05;            // доля скорости, теряемая на ящике (до брони)
const RAM_LOSS_WALL = 0.11;             // ...на стене из блоков
const RAM_LOSS_CAR = 0.08;              // ...на старой машине
const RAM_COINS_CRATE = 2;              // монет за ящик (если в имени объекта нет coins=N)
const RAM_COINS_WALL = 5;               // монет за стену
const RAM_COINS_CAR = 6;                // монет за машину
const RAM_CRUSH_BONUS = 12;             // доп. монет, если машину сплющили, наехав сверху
const RAM_DEBRIS_LIFE = 3.4;            // с: обломки лежат, потом тают
const TUNE_MAX_LEVEL = 5;               // уровней у каждого улучшения
const TUNE_PRICE_BASE = 120;            // монет за 1-й уровень; каждый следующий дороже
const TUNE_PRICE_GROWTH = 1.75;         // во сколько раз растёт цена уровня
const TUNE_JUMP_STEP = 0.08;            // «Подвеска»: +доля к скорости прыжка за уровень
const TUNE_SPEED_STEP = 0.04;           // «Мотор»: +доля к пределу скорости за уровень
const TUNE_ACCEL_STEP = 0.06;           // «Мотор»: +доля к разгону за уровень
const TUNE_ARMOR_STEP = 0.15;           // «Броня»: −доля потери скорости при таране за уровень
const DRIVER_SCALE = 0.78;              // масштаб водителя в машине
const CAMERA_CHASE_DIST = 980;          // px: камера погони — расстояние за машиной
const CAMERA_CHASE_HEIGHT = 380;        // px: высота камеры над машиной
const CAMERA_CHASE_FOV = 62;            // °: угол обзора камеры погони (растёт на скорости)
const HUD_KMH_PER_PXS = 0.06;           // км/ч на спидометре за 1 px/с скорости
const HUD_KMH_MAX = 220;                // км/ч: конец шкалы спидометра
const CAM_RETURN_SEC = 1.5;             // с: после осмотра камерой она сама возвращается за машину
const CAMERA_FAR = 32000;               // px: дальность прорисовки
const AD_COOLDOWN_SEC = 18;             // с: пауза между просмотрами рекламы за награду
const COINS_PER_CHECKPOINT = 5;         // монет за новый чекпоинт
const COINS_PER_FINISH = 50;            // монет за финиш мира
const BOT_COUNT = 6;                    // ботов-игроков рядом с игроком (ПК)
const BOT_COUNT_MOBILE = 4;             // ...на телефоне (низкая графика — не больше 3)
const BOT_KNOCK_SPEED = 700;            // px/с: удар быстрее — бота отбрасывает и закручивает, медленнее — расталкиваются
const BOT_SPAWN_SHIELD = 3;             // с: после появления бота сбить нельзя (мигает)
const BOT_SKIP_AFTER = 5;               // бот упал столько раз подряд на одном участке — «пропускает этап» (как игрок за рекламу)
const BOT_SKILL_MIN = 0.55;             // умение ботов: скорость и точность прыжков (0..1), от
const BOT_SKILL_MAX = 0.95;             // ...до
const OFFER_EVERY_FALLS = 3;            // предложение вещи после падения: не раньше чем через столько падений
const OFFER_MIN_SECONDS = 60;           // ...и не чаще чем раз в столько секунд
const OFFER_AD_EVERY = 2;               // «Нет, спасибо» даёт межстраничную рекламу на каждое такое по счёту предложение
const COIN_PICKUP_RADIUS = 340;         // px: радиус подбора монеты вокруг машины (по высоте — столько же)

