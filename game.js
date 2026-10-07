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
  contractsDone: 0,
  // Менеджеры
  managers: {},
  // Квесты
  questIndex: 0,
  // Наука
  science: 0,
  scienceLifetime: 0,
  // Технологии
  tech: {}
};

// Инициализация owned и purchased
CONFIG.buildings.forEach(b => { state.owned[b.id] = 0; });
CONFIG.upgrades.forEach(u => { state.purchased[u.id] = false; });
CONFIG.managers.forEach(m => { state.managers[m.id] = false; });
CONFIG.tech.forEach(t => { state.tech[t.id] = false; });

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
  
  // Технологии
  CONFIG.tech.forEach(t => {
    if (!state.tech[t.id]) return;
    if (t.mult) {
      Object.keys(t.mult).forEach(bid => {
        buildingMult[bid] *= t.mult[bid];
      });
    }
    if (t.global) globalMult *= t.global;
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
  const scienceEl = document.querySelector('[data-hud="science"]');
  
  if (balanceEl) balanceEl.textContent = formatNumber(state.money);
  if (incomeEl) incomeEl.textContent = '+' + formatNumber(getIncome()) + '/s';
  if (keysEl) keysEl.textContent = state.keys.toString();
  if (scienceEl) scienceEl.textContent = formatNumber(state.science);
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
  
  // Наука
  const scienceEarned = getScienceIncome() * dt;
  state.science += scienceEarned;
  state.scienceLifetime += scienceEarned;
  
  updateHUD();
  updateShop();
  updateUpgrades();
  updateContractOffer();
  updateContractActive();
  tryOfferContract();
  completeQuest();
  renderQuests();
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
    state.science += 5;
    state.scienceLifetime += 5;
    state.contractsDone++;
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

// ========== Карта (Canvas 2D) ==========
const MAP_SIZE = 7;
const TILE_W = 96;
const TILE_H = 48;
const MAX_CLONES = 5;

const canvas = document.getElementById('map');
const ctx = canvas ? canvas.getContext('2d') : null;

let canvasWidth = 600;
let canvasHeight = 400;
let canvasScale = 1;
let hoveredTile = null;
let animTime = 0;

// Спиральный порядок от центра
function getSpiralOrder() {
  const center = Math.floor(MAP_SIZE / 2);
  const order = [];
  
  for (let ring = 1; ring <= center; ring++) {
    for (let c = center - ring; c <= center + ring; c++) {
      order.push([center - ring, c]);
    }
    for (let r = center - ring + 1; r <= center + ring; r++) {
      order.push([r, center + ring]);
    }
    for (let c = center + ring - 1; c >= center - ring; c--) {
      order.push([center + ring, c]);
    }
    for (let r = center + ring - 1; r > center - ring; r--) {
      order.push([r, center - ring]);
    }
  }
  
  return order;
}

const spiralOrder = getSpiralOrder();
let nextTileIndex = 0;
const mapBuildings = []; // {type, tileIndex, count, i, j}

// Изометрическая проекция
function tileToScreen(i, j) {
  const centerX = (canvasWidth / canvasScale) / 2;
  const centerY = (canvasHeight / canvasScale) / 2 - 50;
  const x = centerX + (i - j) * TILE_W / 2;
  const y = centerY + (i + j) * TILE_H / 2;
  return { x, y };
}

// Обратное преобразование (экран → тайл)
function screenToTile(sx, sy) {
  const centerX = (canvasWidth / canvasScale) / 2;
  const centerY = (canvasHeight / canvasScale) / 2 - 50;
  const dx = sx / canvasScale - centerX;
  const dy = sy / canvasScale - centerY;
  const i = (dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2;
  const j = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;
  return { i: Math.floor(i), j: Math.floor(j) };
}

// Инициализация canvas
function initCanvas() {
  if (!canvas) return;
  
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  // Если контейнер имеет нулевой размер, пробуем позже
  if (rect.width === 0 || rect.height === 0) {
    setTimeout(initCanvas, 100);
    return;
  }
  
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  
  // Рассчитываем масштаб для вписывания карты
  const fieldWidth = MAP_SIZE * TILE_W;
  canvasScale = Math.min(1, canvasWidth / fieldWidth);
  
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
  
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Сброс трансформации
  ctx.scale(dpr * canvasScale, dpr * canvasScale);
}

// Отрисовка ромбовидного тайла
function drawTile(i, j, highlight = false) {
  const { x, y } = tileToScreen(i, j);
  
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 2);
  ctx.lineTo(x + TILE_W / 2, y);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.lineTo(x - TILE_W / 2, y);
  ctx.closePath();
  
  if (highlight) {
    ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
    ctx.fill();
  }
  
  ctx.strokeStyle = 'rgba(190, 120, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Отрисовка ядра (изометрический куб)
function drawCore() {
  const center = Math.floor(MAP_SIZE / 2);
  const { x, y } = tileToScreen(center, center);
  
  const size = 36; // Увеличен на 20%
  const pulse = Math.sin(animTime * 2) * 0.1 + 1;
  
  // Радиальный ореол под кубом
  ctx.save();
  const haloGradient = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 60);
  haloGradient.addColorStop(0, 'rgba(124, 58, 237, 0.25)');
  haloGradient.addColorStop(1, 'rgba(124, 58, 237, 0)');
  ctx.fillStyle = haloGradient;
  ctx.beginPath();
  ctx.arc(x, y + 10, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  // Луч вверх (градиентный с glow)
  ctx.save();
  const beamGradient = ctx.createLinearGradient(x, y - size, x, y - size - 80);
  beamGradient.addColorStop(0, 'rgba(233, 213, 255, 0.9)');
  beamGradient.addColorStop(1, 'rgba(233, 213, 255, 0)');
  ctx.shadowBlur = 25;
  ctx.shadowColor = 'rgba(233, 213, 255, 0.8)';
  ctx.strokeStyle = beamGradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y - size - 80);
  ctx.stroke();
  ctx.restore();
  
  // Эллипс-кольцо под кубом
  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + size + 10, 35, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  
  // Куб (три видимые грани)
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = 'rgba(124, 58, 237, 0.6)';
  
  // Верхняя грань (светлая)
  ctx.fillStyle = 'rgba(233, 213, 255, 0.4)';
  ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - size * pulse);
  ctx.lineTo(x + size * pulse, y - size * 0.5 * pulse);
  ctx.lineTo(x, y);
  ctx.lineTo(x - size * pulse, y - size * 0.5 * pulse);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Левая грань
  ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
  ctx.beginPath();
  ctx.moveTo(x - size * pulse, y - size * 0.5 * pulse);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + size * pulse);
  ctx.lineTo(x - size * pulse, y + size * 0.5 * pulse);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Правая грань
  ctx.fillStyle = 'rgba(124, 58, 237, 0.2)';
  ctx.beginPath();
  ctx.moveTo(x + size * pulse, y - size * 0.5 * pulse);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + size * pulse);
  ctx.lineTo(x + size * pulse, y + size * 0.5 * pulse);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

// Отрисовка зданий
function drawBuilding(building) {
  const { x, y } = tileToScreen(building.i, building.j);
  const pulse = Math.sin(animTime * 3 + building.tileIndex) * 0.1 + 1;
  
  ctx.save();
  
  switch (building.type) {
    case 'bpe': // Пульсирующая сфера на ножке
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      
      // Ножка
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 20);
      ctx.stroke();
      
      // Сфера
      const radius = 10 * pulse;
      ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y - 25, radius, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'attn': // Сфера с линиями к соседям
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(192, 132, 252, 0.8)';
      
      // Линии к соседним тайлам
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
      ctx.lineWidth = 1.5;
      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      directions.forEach(([di, dj]) => {
        const ni = building.i + di;
        const nj = building.j + dj;
        if (ni >= 0 && ni < MAP_SIZE && nj >= 0 && nj < MAP_SIZE) {
          const { x: nx, y: ny } = tileToScreen(ni, nj);
          ctx.beginPath();
          ctx.moveTo(x, y - 25);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }
      });
      
      // Сфера
      ctx.fillStyle = 'rgba(192, 132, 252, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y - 25, 12, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'gpu': // Пирамида
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(192, 132, 252, 0.8)';
      ctx.fillStyle = 'rgba(192, 132, 252, 0.6)';
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.8)';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.moveTo(x, y - 40);
      ctx.lineTo(x + 15, y);
      ctx.lineTo(x - 15, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
      
    case 'inf': // Обелиск с молнией
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
      ctx.lineWidth = 1.5;
      
      // Обелиск
      ctx.beginPath();
      ctx.moveTo(x, y - 50);
      ctx.lineTo(x + 10, y - 40);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x - 10, y);
      ctx.lineTo(x - 10, y - 40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Молния
      const lightningOpacity = Math.sin(animTime * 5) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(192, 132, 252, ${lightningOpacity})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 50);
      ctx.lineTo(x - 3, y - 55);
      ctx.lineTo(x + 2, y - 60);
      ctx.stroke();
      break;
      
    case 'ver': // Купол-щит
      ctx.shadowBlur = 25;
      ctx.shadowColor = 'rgba(70, 247, 154, 0.8)';
      ctx.fillStyle = 'rgba(70, 247, 154, 0.3)';
      ctx.strokeStyle = 'rgba(70, 247, 154, 0.8)';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.arc(x, y - 15, 18, Math.PI, 0);
      ctx.lineTo(x + 18, y);
      ctx.lineTo(x - 18, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
  }
  
  // Счётчик клонов
  if (building.count > 1) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(24, 16, 32, 0.9)';
    ctx.strokeStyle = 'rgba(190, 120, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 20, y - 35, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(244, 238, 252, 1)';
    ctx.font = '600 12px Oswald';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(building.count.toString(), x + 20, y - 35);
  }
  
  ctx.restore();
}

// Основной цикл отрисовки
function renderMap() {
  if (!ctx) return;
  
  // Очистка (в логических координатах до масштабирования)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  
  // Собираем все объекты для сортировки
  const objects = [];
  
  // Тайлы
  for (let i = 0; i < MAP_SIZE; i++) {
    for (let j = 0; j < MAP_SIZE; j++) {
      objects.push({ type: 'tile', i, j, depth: i + j });
    }
  }
  
  // Ядро
  const center = Math.floor(MAP_SIZE / 2);
  objects.push({ type: 'core', i: center, j: center, depth: center + center });
  
  // Здания
  mapBuildings.forEach(b => {
    objects.push({ type: 'building', building: b, depth: b.i + b.j });
  });
  
  // Сортировка по глубине (painter's algorithm)
  objects.sort((a, b) => a.depth - b.depth);
  
  // Отрисовка
  objects.forEach(obj => {
    if (obj.type === 'tile') {
      const isHovered = hoveredTile && hoveredTile.i === obj.i && hoveredTile.j === obj.j;
      drawTile(obj.i, obj.j, isHovered);
    } else if (obj.type === 'core') {
      drawCore();
    } else if (obj.type === 'building') {
      drawBuilding(obj.building);
    }
  });
}

// Размещение здания на карте
function placeBuildingOnMap(buildingId) {
  const existing = mapBuildings.find(b => b.type === buildingId);
  
  if (existing && existing.count >= MAX_CLONES) {
    existing.count++;
    return;
  }
  
  if (existing) {
    existing.count++;
    return;
  }
  
  if (nextTileIndex >= spiralOrder.length) return;
  
  const [i, j] = spiralOrder[nextTileIndex];
  const tileIndex = nextTileIndex;
  nextTileIndex++;
  
  mapBuildings.push({ type: buildingId, tileIndex, count: 1, i, j });
}

// Hover обработка
if (canvas) {
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const tile = screenToTile(mx, my);
    
    if (tile.i >= 0 && tile.i < MAP_SIZE && tile.j >= 0 && tile.j < MAP_SIZE) {
      hoveredTile = tile;
    } else {
      hoveredTile = null;
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    hoveredTile = null;
  });
}

// Анимационный цикл
function animate() {
  animTime += 0.016; // ~60fps
  renderMap();
  requestAnimationFrame(animate);
}

// Resize handler
window.addEventListener('resize', () => {
  initCanvas();
});

// Orientation change handler
window.addEventListener('orientationchange', () => {
  setTimeout(initCanvas, 100);
});

// ========== Квесты ==========
function getQuestProgress(quest) {
  const goal = quest.goal;
  
  switch (goal.type) {
    case 'own':
      return Math.min(state.owned[goal.id] || 0, goal.n);
    case 'hire':
      return state.managers[goal.id] ? 1 : 0;
    case 'contracts':
      return Math.min(state.contractsDone, goal.n);
    case 'lifetime':
      return Math.min(Math.floor(state.lifetime), goal.n);
    default:
      return 0;
  }
}

function isQuestComplete(quest) {
  return getQuestProgress(quest) >= quest.goal.n;
}

function completeQuest() {
  if (state.questIndex >= CONFIG.quests.length) return;
  
  const quest = CONFIG.quests[state.questIndex];
  if (!isQuestComplete(quest)) return;
  
  state.money += quest.reward;
  
  // +10% от награды наукой
  const scienceReward = Math.floor(quest.reward * 0.1);
  state.science += scienceReward;
  state.scienceLifetime += scienceReward;
  
  showToast(`Квест выполнен: +${formatNumber(quest.reward)}`, 'success');
  state.questIndex++;
  renderQuests();
}

function renderQuests() {
  const questsEl = document.getElementById('quests');
  if (!questsEl) return;
  
  questsEl.innerHTML = '';
  
  // Все квесты пройдены
  if (state.questIndex >= CONFIG.quests.length) {
    const slot = document.createElement('div');
    slot.className = 'quest-slot quest-slot--complete';
    slot.innerHTML = '<div class="quest-slot__text">ВСЕ КВЕСТЫ ПРОЙДЕНЫ</div>';
    questsEl.appendChild(slot);
    return;
  }
  
  // Предыдущий квест (если есть)
  if (state.questIndex > 0) {
    const prevQuest = CONFIG.quests[state.questIndex - 1];
    const slot = document.createElement('div');
    slot.className = 'quest-slot quest-slot--done';
    slot.innerHTML = `
      <div class="quest-slot__label">Предыдущий</div>
      <div class="quest-slot__text">ВЫПОЛНЕНО</div>
    `;
    questsEl.appendChild(slot);
  }
  
  // Текущий квест
  const currentQuest = CONFIG.quests[state.questIndex];
  const progress = getQuestProgress(currentQuest);
  const progressPct = (progress / currentQuest.goal.n) * 100;
  
  const currentSlot = document.createElement('div');
  currentSlot.className = 'quest-slot quest-slot--current';
  currentSlot.innerHTML = `
    <div class="quest-slot__label">Текущий</div>
    <div class="quest-slot__text">${currentQuest.text}</div>
    <div class="quest-slot__progress-bar">
      <div class="quest-slot__progress-fill" style="width:${progressPct}%"></div>
    </div>
    <div class="quest-slot__stats">
      <span>${progress}/${currentQuest.goal.n}</span>
      <span class="quest-slot__reward">+${formatNumber(currentQuest.reward)}</span>
    </div>
  `;
  questsEl.appendChild(currentSlot);
  
  // Следующий квест (если есть)
  if (state.questIndex < CONFIG.quests.length - 1) {
    const nextQuest = CONFIG.quests[state.questIndex + 1];
    const slot = document.createElement('div');
    slot.className = 'quest-slot quest-slot--next';
    slot.innerHTML = `
      <div class="quest-slot__label">Следующий</div>
      <div class="quest-slot__text">🔒 ${nextQuest.text}</div>
    `;
    questsEl.appendChild(slot);
  }
}

// ========== Наука и Исследования ==========
function getScienceIncome() {
  return (state.owned.ver || 0) * 1.0 + (state.owned.inf || 0) * 0.2;
}

function isTechAvailable(techId) {
  const tech = CONFIG.tech.find(t => t.id === techId);
  if (!tech) return false;
  return tech.req.every(parentId => state.tech[parentId]);
}

function isTechPurchased(techId) {
  return state.tech[techId];
}

function buyTech(techId) {
  const tech = CONFIG.tech.find(t => t.id === techId);
  if (!tech) return;
  if (state.tech[techId]) return;
  if (!isTechAvailable(techId)) return;
  if (state.science < tech.cost) return;
  
  state.science -= tech.cost;
  state.tech[techId] = true;
  renderResearchOverlay();
  updateHUD();
}

function renderResearchOverlay() {
  const overlay = document.getElementById('research-overlay');
  if (!overlay) return;
  
  const content = overlay.querySelector('.research__content');
  if (!content) return;
  
  content.innerHTML = '';
  
  // SVG для линий
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'research__lines');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  content.appendChild(svg);
  
  // Позиции узлов (ручная раскладка дерева)
  const positions = {
    'r1': { x: 25, y: 15 },
    'r2': { x: 75, y: 15 },
    'c1': { x: 25, y: 35 },
    'c3': { x: 75, y: 35 },
    'c2': { x: 25, y: 55 },
    'c4': { x: 75, y: 55 },
    'f1': { x: 50, y: 75 }
  };
  
  // Рисуем линии
  CONFIG.tech.forEach(tech => {
    const pos = positions[tech.id];
    if (!pos) return;
    
    tech.req.forEach(parentId => {
      const parentPos = positions[parentId];
      if (!parentPos) return;
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', parentPos.x + '%');
      line.setAttribute('y1', parentPos.y + '%');
      line.setAttribute('x2', pos.x + '%');
      line.setAttribute('y2', pos.y + '%');
      line.setAttribute('stroke', 'rgba(190, 120, 255, 0.4)');
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    });
  });
  
  // Рисуем узлы
  CONFIG.tech.forEach(tech => {
    const pos = positions[tech.id];
    if (!pos) return;
    
    const node = document.createElement('div');
    node.className = 'research__node';
    
    const purchased = isTechPurchased(tech.id);
    const available = isTechAvailable(tech.id);
    const canAfford = state.science >= tech.cost;
    
    // 4 состояния узла
    if (purchased) {
      node.classList.add('research__node--purchased');
    } else if (available && canAfford) {
      node.classList.add('research__node--available');
    } else if (available && !canAfford) {
      node.classList.add('research__node--unaffordable');
    } else {
      node.classList.add('research__node--locked');
    }
    
    node.style.left = pos.x + '%';
    node.style.top = pos.y + '%';
    
    // Контент узла в зависимости от состояния
    let costHtml = '';
    let statusHtml = '';
    
    if (purchased) {
      statusHtml = '<div class="research__node-status">✓ ИЗУЧЕНО</div>';
    } else if (available) {
      if (canAfford) {
        costHtml = `<div class="research__node-cost">${tech.cost} 🔬</div>`;
      } else {
        const deficit = tech.cost - Math.floor(state.science);
        costHtml = `<div class="research__node-cost research__node-cost--unaffordable">${tech.cost} 🔬</div>`;
        costHtml += `<div class="research__node-deficit">не хватает ${deficit}</div>`;
      }
    } else {
      costHtml = `<div class="research__node-cost">${tech.cost} 🔬</div>`;
      statusHtml = '<div class="research__node-lock">🔒</div>';
    }
    
    node.innerHTML = `
      ${statusHtml}
      <div class="research__node-name">${tech.name}</div>
      ${costHtml}
      <div class="research__node-desc">${tech.desc}</div>
    `;
    
    // Обработчики кликов
    if (purchased) {
      // Куплен — клик игнорируется
    } else if (available && canAfford) {
      // Доступен и хватает — покупка
      node.addEventListener('click', () => buyTech(tech.id));
    } else if (available && !canAfford) {
      // Доступен, но не хватает — тост
      node.addEventListener('click', () => {
        showToast(`Недостаточно науки: есть ${formatNumber(state.science)} / нужно ${tech.cost}`, 'muted');
      });
    } else {
      // Заблокирован — клик игнорируется
    }
    
    content.appendChild(node);
  });
}

function openResearchOverlay() {
  const overlay = document.getElementById('research-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  
  // Обновляем строку состояния
  const statusEl = document.getElementById('research-status');
  if (statusEl) {
    const scienceIncome = getScienceIncome();
    statusEl.innerHTML = `<span class="research__status-label">Наука:</span> <span class="research__status-value">${formatNumber(state.science)}</span> <span class="research__status-income">(+${formatNumber(scienceIncome)}/с)</span>`;
  }
  
  renderResearchOverlay();
}

function closeResearchOverlay() {
  const overlay = document.getElementById('research-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
}

// Инициализация после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    animate();
    renderShop();
    renderUpgrades();
    renderManagers();
    renderQuests();
    
    // Обработчики оверлея
    const openBtn = document.getElementById('research-open');
    if (openBtn) openBtn.addEventListener('click', openResearchOverlay);
    
    const closeBtn = document.getElementById('research-close');
    if (closeBtn) closeBtn.addEventListener('click', closeResearchOverlay);
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeResearchOverlay();
    });
  });
} else {
  initCanvas();
  animate();
  renderShop();
  renderUpgrades();
  renderManagers();
  renderQuests();
  
  const openBtn = document.getElementById('research-open');
  if (openBtn) openBtn.addEventListener('click', openResearchOverlay);
  
  const closeBtn = document.getElementById('research-close');
  if (closeBtn) closeBtn.addEventListener('click', closeResearchOverlay);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeResearchOverlay();
  });
}

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
