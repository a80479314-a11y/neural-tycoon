import { CONFIG } from './config.js';

const state = {
  money: 20,
  lifetime: 0,
  keys: 0,
  owned: {},
  purchased: {},
  debuffUntil: 0,
  // Контракты
  contractOffer: null, // {target, reward, acceptUntil}
  contractActive: null, // {target, reward, progress, endsAt}
  lastOfferTime: 0,
  // Менеджеры
  managers: {}
};

// Инициализация owned и purchased
CONFIG.buildings.forEach(b => { state.owned[b.id] = 0; });
CONFIG.upgrades.forEach(u => { state.purchased[u.id] = false; });
CONFIG.managers.forEach(m => { state.managers[m.id] = false; });

// Единая функция множителей
function getMultipliers() {
  const buildingMult = {};
  CONFIG.buildings.forEach(b => { buildingMult[b.id] = 1; });
  
  let globalMult = 1 + state.keys * 0.1;
  
  CONFIG.upgrades.forEach(u => {
    if (!state.purchased[u.id]) return;
    if (u.mult) {
      Object.keys(u.mult).forEach(bid => {
        buildingMult[bid] *= u.mult[bid];
      });
    }
    if (u.global) globalMult *= u.global;
  });
  
  // Дебафф серого шлюза
  if (state.debuffUntil > Date.now()) {
    globalMult *= 0.5;
  }
  
  return { buildingMult, globalMult };
}

function formatNumber(num) {
  if (num < 1000) return Math.floor(num).toString();
  if (num < 1e6) {
    const val = num / 1e3;
    return (Number.isInteger(val) ? val : val.toFixed(1)) + ' тыс';
  }
  if (num < 1e9) {
    const val = num / 1e6;
    return (Number.isInteger(val) ? val : val.toFixed(1)) + ' млн';
  }
  if (num < 1e12) {
    const val = num / 1e9;
    return (Number.isInteger(val) ? val : val.toFixed(1)) + ' млрд';
  }
  const val = num / 1e12;
  return (Number.isInteger(val) ? val : val.toFixed(1)) + ' трлн';
}

function getIncome() {
  const { buildingMult, globalMult } = getMultipliers();
  let income = 0;
  CONFIG.buildings.forEach(b => {
    income += state.owned[b.id] * b.rate * buildingMult[b.id];
  });
  return income * globalMult;
}

function getBuildingPrice(building) {
  return Math.ceil(building.cost * Math.pow(CONFIG.costGrowth, state.owned[building.id]));
}

function isUpgradeVisible(upgrade) {
  if (!upgrade.req) return true;
  return Object.keys(upgrade.req).every(bid => state.owned[bid] >= upgrade.req[bid]);
}

function updateHUD() {
  const balanceEl = document.querySelector('[data-hud="balance"]');
  const incomeEl = document.querySelector('[data-hud="income"]');
  const keysEl = document.querySelector('[data-hud="keys"]');
  
  if (balanceEl) balanceEl.textContent = formatNumber(state.money);
  if (incomeEl) incomeEl.textContent = '+' + formatNumber(getIncome()) + '/s';
  if (keysEl) keysEl.textContent = state.keys.toString();
}

// Рендер магазина (ОДИН раз)
function renderShop() {
  const shopEl = document.getElementById('shop');
  if (!shopEl) return;
  
  CONFIG.buildings.forEach(building => {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.buildingId = building.id;
    
    item.innerHTML = `
      <div class="item__header">
        <span class="item__name">${building.name}</span>
        <span class="item__count" data-count="${building.id}">0</span>
      </div>
      <div class="item__desc">${building.desc}</div>
      <div class="item__row">
        <span class="item__price" data-price="${building.id}">${formatNumber(building.cost)}</span>
        <button class="item__buy" data-buy="${building.id}">Купить</button>
      </div>
    `;
    
    shopEl.appendChild(item);
  });
  
  // Обработчики покупки
  shopEl.addEventListener('click', (e) => {
    const buyBtn = e.target.closest('[data-buy]');
    if (!buyBtn) return;
    
    const id = buyBtn.dataset.buy;
    const building = CONFIG.buildings.find(b => b.id === id);
    if (!building) return;
    
    const price = getBuildingPrice(building);
    if (state.money >= price) {
      state.money -= price;
      state.owned[id]++;
      placeBuildingOnMap(id);
      updateShop();
      updateUpgrades();
      updateHUD();
    }
  });
}

// Обновление магазина (каждый тик)
function updateShop() {
  CONFIG.buildings.forEach(building => {
    const item = document.querySelector(`[data-building-id="${building.id}"]`);
    if (!item) return;
    
    const price = getBuildingPrice(building);
    const canAfford = state.money >= price;
    
    const countEl = item.querySelector(`[data-count="${building.id}"]`);
    if (countEl) countEl.textContent = state.owned[building.id].toString();
    
    const priceEl = item.querySelector(`[data-price="${building.id}"]`);
    if (priceEl) priceEl.textContent = formatNumber(price);
    
    const buyBtn = item.querySelector(`[data-buy="${building.id}"]`);
    if (buyBtn) buyBtn.disabled = !canAfford;
    
    if (canAfford) {
      item.classList.remove('item--disabled');
    } else {
      item.classList.add('item--disabled');
    }
  });
}

// Рендер апгрейдов (ОДИН раз)
function renderUpgrades() {
  const upgradesEl = document.getElementById('upgrades');
  if (!upgradesEl) return;
  
  CONFIG.upgrades.forEach(upgrade => {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.upgradeId = upgrade.id;
    item.style.display = 'none';
    
    item.innerHTML = `
      <div class="item__header">
        <span class="item__name">${upgrade.name}</span>
      </div>
      <div class="item__desc">${upgrade.desc}</div>
      <div class="item__row">
        <span class="item__price" data-upgrade-price="${upgrade.id}">${formatNumber(upgrade.cost)}</span>
        <button class="item__buy" data-buy-upgrade="${upgrade.id}">Купить</button>
      </div>
    `;
    
    upgradesEl.appendChild(item);
  });
  
  // Обработчики покупки апгрейдов
  upgradesEl.addEventListener('click', (e) => {
    const buyBtn = e.target.closest('[data-buy-upgrade]');
    if (!buyBtn || buyBtn.disabled) return;
    
    const id = buyBtn.dataset.buyUpgrade;
    const upgrade = CONFIG.upgrades.find(u => u.id === id);
    if (!upgrade || state.purchased[id]) return;
    
    if (state.money >= upgrade.cost) {
      state.money -= upgrade.cost;
      state.purchased[id] = true;
      updateUpgrades();
      updateHUD();
    }
  });
}

// Обновление апгрейдов (каждый тик)
function updateUpgrades() {
  CONFIG.upgrades.forEach(upgrade => {
    const item = document.querySelector(`[data-upgrade-id="${upgrade.id}"]`);
    if (!item) return;
    
    const visible = isUpgradeVisible(upgrade);
    const purchased = state.purchased[upgrade.id];
    
    // Видимость
    item.style.display = visible ? '' : 'none';
    
    if (!visible) return;
    
    const buyBtn = item.querySelector(`[data-buy-upgrade="${upgrade.id}"]`);
    
    if (purchased) {
      // Куплен — зелёная рамка, кнопка "✓ ГОТОВО"
      item.classList.add('item--purchased');
      item.classList.remove('item--disabled');
      if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.textContent = '✓ Готово';
        buyBtn.classList.add('item__buy--done');
      }
    } else {
      // Не куплен
      item.classList.remove('item--purchased');
      const canAfford = state.money >= upgrade.cost;
      if (buyBtn) {
        buyBtn.disabled = !canAfford;
        buyBtn.textContent = 'Купить';
        buyBtn.classList.remove('item__buy--done');
      }
      if (canAfford) {
        item.classList.remove('item--disabled');
      } else {
        item.classList.add('item--disabled');
      }
    }
  });
}

// Тик игры (100ms)
setInterval(() => {
  const dt = 0.1;
  const income = getIncome();
  const earned = income * dt;
  state.money += earned;
  state.lifetime += earned;
  updateHUD();
  updateShop();
  updateUpgrades();
  updateContractOffer();
  updateContractActive();
  tryOfferContract();
}, 100);

// Тик менеджеров (5s)
setInterval(tickManagers, 5000);

// ========== Контракты ==========
function renderContractOffer() {
  const contractsEl = document.getElementById('contracts');
  if (!contractsEl) return;
  
  // Очищаем
  contractsEl.innerHTML = '';
  
  if (!state.contractOffer) return;
  
  const offer = state.contractOffer;
  const timeLeft = Math.max(0, Math.ceil((offer.acceptUntil - Date.now()) / 1000));
  
  const item = document.createElement('div');
  item.className = 'item';
  item.innerHTML = `
    <div class="item__header">
      <span class="item__name">Оффер контракта</span>
    </div>
    <div class="item__desc">Обеспечить ${formatNumber(offer.target)} дохода за ${CONFIG.contracts.duration}s. Награда: ${formatNumber(offer.reward)}</div>
    <div class="contract__timer">Принять через: ${timeLeft}s</div>
    <div class="item__row">
      <button class="item__buy" data-contract-accept>ПРИНЯТЬ</button>
    </div>
  `;
  
  contractsEl.appendChild(item);
  
  // Обработчик принятия
  const acceptBtn = item.querySelector('[data-contract-accept]');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (!state.contractOffer) return;
      
      // Активируем контракт
      state.contractActive = {
        target: state.contractOffer.target,
        reward: state.contractOffer.reward,
        progress: 0,
        endsAt: Date.now() + CONFIG.contracts.duration * 1000
      };
      state.contractOffer = null;
      
      showToast(`Контракт принят: ${formatNumber(state.contractActive.target)} за ${CONFIG.contracts.duration}s`, 'info');
      renderContractActive();
    });
  }
}

function renderContractActive() {
  const contractsEl = document.getElementById('contracts');
  if (!contractsEl) return;
  
  // Очищаем
  contractsEl.innerHTML = '';
  
  if (!state.contractActive) return;
  
  const contract = state.contractActive;
  const timeLeft = Math.max(0, Math.ceil((contract.endsAt - Date.now()) / 1000));
  const progressPct = Math.min(100, (contract.progress / contract.target) * 100);
  
  const item = document.createElement('div');
  item.className = 'item';
  item.innerHTML = `
    <div class="item__header">
      <span class="item__name">Активный контракт</span>
    </div>
    <div class="item__desc">Прогресс: ${formatNumber(contract.progress)} / ${formatNumber(contract.target)}</div>
    <div class="contract__progress-bar">
      <div class="contract__progress-fill" style="width:${progressPct}%"></div>
    </div>
    <div class="contract__timer">Осталось: ${timeLeft}s</div>
  `;
  
  contractsEl.appendChild(item);
}

function updateContractOffer() {
  if (!state.contractOffer) return;
  
  // Проверяем протухание
  if (Date.now() > state.contractOffer.acceptUntil) {
    state.contractOffer = null;
    const contractsEl = document.getElementById('contracts');
    if (contractsEl) contractsEl.innerHTML = '';
  } else {
    renderContractOffer();
  }
}

function updateContractActive() {
  if (!state.contractActive) return;
  
  const contract = state.contractActive;
  const income = getIncome();
  const dt = 0.1; // 100ms тик
  
  // Накапливаем прогресс
  contract.progress += income * dt;
  
  // Проверяем успех
  if (contract.progress >= contract.target) {
    state.money += contract.reward;
    showToast(`Контракт выполнен: +${formatNumber(contract.reward)}`, 'success');
    state.contractActive = null;
    const contractsEl = document.getElementById('contracts');
    if (contractsEl) contractsEl.innerHTML = '';
    return;
  }
  
  // Проверяем провал
  if (Date.now() > contract.endsAt) {
    showToast('Контракт просрочен', 'muted');
    state.contractActive = null;
    const contractsEl = document.getElementById('contracts');
    if (contractsEl) contractsEl.innerHTML = '';
    return;
  }
  
  renderContractActive();
}

function tryOfferContract() {
  // Проверяем условия
  if (state.lifetime < CONFIG.contracts.firstOfferAt) return;
  if (state.contractOffer || state.contractActive) return;
  
  const now = Date.now();
  if (now - state.lastOfferTime < CONFIG.contracts.offerEvery * 1000) return;
  
  // Создаём оффер
  const tps = getIncome();
  const target = Math.ceil(Math.max(tps, 1) * CONFIG.contracts.duration * CONFIG.contracts.pressure + 50);
  const reward = Math.ceil(target * CONFIG.contracts.rewardRate);
  
  state.contractOffer = {
    target,
    reward,
    acceptUntil: now + CONFIG.contracts.acceptWindow * 1000
  };
  state.lastOfferTime = now;
  
  renderContractOffer();
}

// ========== Менеджеры ==========
function renderManagers() {
  const managersEl = document.getElementById('managers');
  if (!managersEl) return;
  
  CONFIG.managers.forEach(manager => {
    const building = CONFIG.buildings.find(b => b.id === manager.for);
    if (!building) return;
    
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.managerId = manager.id;
    
    item.innerHTML = `
      <div class="item__header">
        <span class="item__name">${manager.name}</span>
      </div>
      <div class="item__desc">Авто-покупает «${building.name}» каждые 5s при балансе >= цены ×2</div>
      <div class="item__row">
        <span class="item__price">${formatNumber(manager.cost)}</span>
        <button class="item__buy" data-hire-manager="${manager.id}">НАНЯТЬ</button>
      </div>
    `;
    
    managersEl.appendChild(item);
  });
  
  // Обработчики найма
  managersEl.addEventListener('click', (e) => {
    const hireBtn = e.target.closest('[data-hire-manager]');
    if (!hireBtn || hireBtn.disabled) return;
    
    const id = hireBtn.dataset.hireManager;
    const manager = CONFIG.managers.find(m => m.id === id);
    if (!manager || state.managers[id]) return;
    
    if (state.money >= manager.cost) {
      state.money -= manager.cost;
      state.managers[id] = true;
      updateManagers();
      updateHUD();
    }
  });
}

function updateManagers() {
  CONFIG.managers.forEach(manager => {
    const item = document.querySelector(`[data-manager-id="${manager.id}"]`);
    if (!item) return;
    
    const hired = state.managers[manager.id];
    const buyBtn = item.querySelector(`[data-hire-manager="${manager.id}"]`);
    
    if (hired) {
      item.classList.add('item--purchased');
      item.classList.remove('item--disabled');
      if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.textContent = '✓ НАНЯТ';
        buyBtn.classList.add('item__buy--done');
      }
    } else {
      item.classList.remove('item--purchased');
      const canAfford = state.money >= manager.cost;
      if (buyBtn) {
        buyBtn.disabled = !canAfford;
      }
      if (canAfford) {
        item.classList.remove('item--disabled');
      } else {
        item.classList.add('item--disabled');
      }
    }
  });
}

function tickManagers() {
  CONFIG.managers.forEach(manager => {
    if (!state.managers[manager.id]) return;
    
    const building = CONFIG.buildings.find(b => b.id === manager.for);
    if (!building) return;
    
    const price = getBuildingPrice(building);
    const requiredMoney = price * 2;
    
    if (state.money >= requiredMoney) {
      state.money -= price;
      state.owned[building.id]++;
      placeBuildingOnMap(building.id);
      updateShop();
      updateHUD();
    }
  });
}

// ========== Карта ==========
const MAP_SIZE = 7;
const TILE_SIZE = 60;
const MAX_CLONES = 5;

// Спиральный порядок от центра
function getSpiralOrder() {
  const center = Math.floor(MAP_SIZE / 2);
  const order = [];
  
  // Центр пропускаем (там ядро)
  for (let ring = 1; ring <= center; ring++) {
    // Верхняя сторона
    for (let c = center - ring; c <= center + ring; c++) {
      order.push([center - ring, c]);
    }
    // Правая сторона
    for (let r = center - ring + 1; r <= center + ring; r++) {
      order.push([r, center + ring]);
    }
    // Нижняя сторона
    for (let c = center + ring - 1; c >= center - ring; c--) {
      order.push([center + ring, c]);
    }
    // Левая сторона
    for (let r = center + ring - 1; r > center - ring; r--) {
      order.push([r, center - ring]);
    }
  }
  
  return order;
}

const spiralOrder = getSpiralOrder();
let nextTileIndex = 0;
const mapBuildings = []; // {type, tileIndex, count}

function renderMap() {
  const surface = document.getElementById('mapSurface');
  if (!surface) return;
  
  const center = Math.floor(MAP_SIZE / 2);
  
  // Генерируем плитки
  for (let row = 0; row < MAP_SIZE; row++) {
    for (let col = 0; col < MAP_SIZE; col++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.style.left = (col * TILE_SIZE) + 'px';
      tile.style.top = (row * TILE_SIZE) + 'px';
      
      // Центральная плитка — ядро
      if (row === center && col === center) {
        tile.classList.add('tile--core');
        tile.innerHTML = `
          <div class="cube-wrapper" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotateZ(-45deg) rotateX(-60deg);">
            <div class="cube__beam"></div>
            <div class="cube-scene">
              <div class="cube">
                <div class="cube__face cube__face--top"></div>
                <div class="cube__face cube__face--bottom"></div>
                <div class="cube__face cube__face--front"></div>
                <div class="cube__face cube__face--back"></div>
                <div class="cube__face cube__face--left"></div>
                <div class="cube__face cube__face--right"></div>
              </div>
            </div>
            <div class="cube__ring"></div>
          </div>
        `;
      }
      
      surface.appendChild(tile);
    }
  }
}

function placeBuildingOnMap(buildingId) {
  // Проверяем лимит клонов
  const existing = mapBuildings.find(b => b.type === buildingId);
  
  if (existing && existing.count >= MAX_CLONES) {
    // Обновляем счётчик
    existing.count++;
    updateBuildingCounter(buildingId);
    return;
  }
  
  if (existing) {
    existing.count++;
    updateBuildingCounter(buildingId);
    return;
  }
  
  // Размещаем новый объект
  if (nextTileIndex >= spiralOrder.length) return; // Нет свободных плиток
  
  const [row, col] = spiralOrder[nextTileIndex];
  const tileIndex = nextTileIndex;
  nextTileIndex++;
  
  mapBuildings.push({type: buildingId, tileIndex, count: 1});
  
  // Создаём DOM элемент
  const surface = document.getElementById('mapSurface');
  if (!surface) return;
  
  const building = document.createElement('div');
  building.className = `building building--${buildingId}`;
  building.dataset.buildingType = buildingId;
  building.style.left = (col * TILE_SIZE) + 'px';
  building.style.top = (row * TILE_SIZE) + 'px';
  
  surface.appendChild(building);
}

function updateBuildingCounter(buildingId) {
  const existing = mapBuildings.find(b => b.type === buildingId);
  if (!existing) return;
  
  const buildingEl = document.querySelector(`[data-building-type="${buildingId}"]`);
  if (!buildingEl) return;
  
  // Удаляем старый счётчик если есть
  const oldCounter = buildingEl.querySelector('.building__counter');
  if (oldCounter) oldCounter.remove();
  
  // Добавляем новый счётчик если count > 1
  if (existing.count > 1) {
    const counter = document.createElement('div');
    counter.className = 'building__counter';
    counter.textContent = existing.count;
    buildingEl.appendChild(counter);
  }
}

// Инициализация
renderMap();
renderShop();
renderUpgrades();
renderManagers();

// ========== Система событий ==========
let toastTimeout = null;

function showToast(text, type) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  
  // Очищаем предыдущий таймер
  if (toastTimeout) clearTimeout(toastTimeout);
  
  // Обновляем содержимое и класс
  toastEl.textContent = text;
  toastEl.className = 'toast toast--' + type;
  toastEl.style.display = 'block';
  
  // Авто-скрытие через 4s
  toastTimeout = setTimeout(() => {
    toastEl.style.display = 'none';
  }, 4000);
}

function showStamp() {
  const stampEl = document.getElementById('stamp');
  if (!stampEl) return;
  
  // Показываем штамп с анимацией
  stampEl.style.display = 'flex';
  stampEl.classList.remove('stamp--animate');
  // Форсируем reflow для перезапуска анимации
  void stampEl.offsetWidth;
  stampEl.classList.add('stamp--animate');
  
  // Скрываем через 2.4s
  setTimeout(() => {
    stampEl.style.display = 'none';
    stampEl.classList.remove('stamp--animate');
  }, 2400);
}

function triggerEvent() {
  // События только после lifetime >= 500
  if (state.lifetime < 500) return;
  
  // Шанс 55%
  if (Math.random() > 0.55) return;
  
  // Проверяем Verifier
  if (state.purchased.ver) {
    // Зелёный тост + штамп
    showToast('Серый шлюз заблокирован: ZERO SPOOFING', 'success');
    showStamp();
  } else {
    // Красный тост + дебафф
    showToast('Серый шлюз перехватывает трафик: −50% дохода на 20s', 'danger');
    state.debuffUntil = Date.now() + 20000; // 20 секунд
  }
}

// Таймер событий: каждые 45 секунд
setInterval(triggerEvent, 45000);
