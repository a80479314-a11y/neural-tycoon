import { CONFIG } from './config.js';

const state = {
  money: 0,
  lifetime: 0,
  keys: 0,
  owned: {}
};

// Инициализация owned
CONFIG.buildings.forEach(b => {
  state.owned[b.id] = 0;
});

function globalMult() {
  return 1 + state.keys * 0.1;
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
  let income = 0;
  CONFIG.buildings.forEach(b => {
    income += state.owned[b.id] * b.rate;
  });
  return income * globalMult();
}

function getPrice(building) {
  return Math.ceil(building.cost * Math.pow(CONFIG.costGrowth, state.owned[building.id]));
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
    
    const price = getPrice(building);
    if (state.money >= price) {
      state.money -= price;
      state.owned[id]++;
      updateShop();
      updateHUD();
    }
  });
}

// Обновление магазина (каждый тик)
function updateShop() {
  CONFIG.buildings.forEach(building => {
    const item = document.querySelector(`[data-building-id="${building.id}"]`);
    if (!item) return;
    
    const price = getPrice(building);
    const canAfford = state.money >= price;
    
    // Обновляем количество
    const countEl = item.querySelector(`[data-count="${building.id}"]`);
    if (countEl) countEl.textContent = state.owned[building.id].toString();
    
    // Обновляем цену
    const priceEl = item.querySelector(`[data-price="${building.id}"]`);
    if (priceEl) priceEl.textContent = formatNumber(price);
    
    // Обновляем состояние кнопки
    const buyBtn = item.querySelector(`[data-buy="${building.id}"]`);
    if (buyBtn) buyBtn.disabled = !canAfford;
    
    // Обновляем приглушение карточки
    if (canAfford) {
      item.classList.remove('item--disabled');
    } else {
      item.classList.add('item--disabled');
    }
  });
}

// Тик игры (100ms)
setInterval(() => {
  const dt = 0.1; // 100ms = 0.1s
  const income = getIncome();
  const earned = income * dt;
  state.money += earned;
  state.lifetime += earned;
  updateHUD();
  updateShop();
}, 100);

// Клик по кубу
const cubeWrapper = document.querySelector('.cube-wrapper');
if (cubeWrapper) {
  cubeWrapper.addEventListener('click', () => {
    const earned = CONFIG.clickPower * globalMult();
    state.money += earned;
    state.lifetime += earned;
    updateHUD();
    updateShop();
  });
}

// Инициализация магазина при загрузке
renderShop();
