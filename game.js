import { CONFIG } from './config.js';

const state = {
  money: 20,
  lifetime: 0,
  keys: 0,
  owned: {},
  purchased: {},
  debuffUntil: 0
};

// Инициализация owned и purchased
CONFIG.buildings.forEach(b => { state.owned[b.id] = 0; });
CONFIG.upgrades.forEach(u => { state.purchased[u.id] = false; });

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
}, 100);

// Инициализация
renderShop();
renderUpgrades();

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
