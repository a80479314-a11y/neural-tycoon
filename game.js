import { CONFIG } from './config.js';

const SAVE_KEY = 'neural_tycoon_save_v1';
const SAVE_VERSION = 1;

const state = {
  money: CONFIG.debug.enabled ? 1000000 : 20, // DEBUG_TOOL
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
  science: CONFIG.debug.enabled ? 1000 : 0, // DEBUG_TOOL
  scienceLifetime: 0,
  // Технологии
  tech: {},
  // Престиж
  prestiges: 0,
  get rank() { return this.prestiges; }
};

// Инициализация owned и purchased
CONFIG.buildings.forEach(b => { state.owned[b.id] = 0; });
CONFIG.upgrades.forEach(u => { state.purchased[u.id] = false; });
CONFIG.managers.forEach(m => { state.managers[m.id] = false; });
CONFIG.tech.forEach(t => { state.tech[t.id] = false; });

// ========== Система сохранений ==========
function saveGame() {
  try {
    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      money: state.money,
      science: state.science,
      scienceLifetime: state.scienceLifetime,
      lifetime: state.lifetime,
      keys: state.keys,
      prestiges: state.prestiges,
      owned: { ...state.owned },
      purchased: { ...state.purchased },
      managers: { ...state.managers },
      tech: { ...state.tech },
      questIndex: state.questIndex,
      contractsDone: state.contractsDone,
      contractOffer: state.contractOffer,
      contractActive: state.contractActive,
      lastOfferTime: state.lastOfferTime,
      debuffUntil: state.debuffUntil,
      // Сохраняем TPS для офлайн-прогресса
      tps: getIncome(),
      scienceTps: getScienceIncome()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    
    return data;
  } catch (e) {
    console.warn('Load failed:', e);
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

function applySaveData(data) {
  if (!data) return;
  
  state.money = data.money ?? 20;
  state.science = data.science ?? 0;
  state.scienceLifetime = data.scienceLifetime ?? 0;
  state.lifetime = data.lifetime ?? 0;
  state.keys = data.keys ?? 0;
  state.prestiges = data.prestiges ?? 0;
  state.questIndex = data.questIndex ?? 0;
  state.contractsDone = data.contractsDone ?? 0;
  state.lastOfferTime = data.lastOfferTime ?? 0;
  state.debuffUntil = data.debuffUntil ?? 0;
  
  // Восстанавливаем owned
  if (data.owned) {
    CONFIG.buildings.forEach(b => {
      state.owned[b.id] = data.owned[b.id] ?? 0;
    });
  }
  
  // Восстанавливаем purchased
  if (data.purchased) {
    CONFIG.upgrades.forEach(u => {
      state.purchased[u.id] = data.purchased[u.id] ?? false;
    });
  }
  
  // Восстанавливаем managers
  if (data.managers) {
    CONFIG.managers.forEach(m => {
      state.managers[m.id] = data.managers[m.id] ?? false;
    });
  }
  
  // Восстанавливаем tech
  if (data.tech) {
    CONFIG.tech.forEach(t => {
      state.tech[t.id] = data.tech[t.id] ?? false;
    });
  }
  
  // Восстанавливаем контракты
  state.contractOffer = data.contractOffer ?? null;
  state.contractActive = data.contractActive ?? null;
  
  // Восстанавливаем карту зданий на основе owned
  mapBuildings.length = 0;
  nextTileIndex = 0;
  CONFIG.buildings.forEach(b => {
    const count = state.owned[b.id] || 0;
    if (count > 0) {
      // Добавляем здание на карту с фиксированной позицией
      placeBuildingOnMap(b.id);
      // Устанавливаем количество клонов
      const building = mapBuildings.find(mb => mb.type === b.id);
      if (building) {
        building.count = count;
      }
    }
  });
  
  // Инициализируем соединения после восстановления карты
  initConnections();
}

function resetGame() {
  if (!window.confirm('Сбросить империю?')) return;
  
  localStorage.removeItem(SAVE_KEY);
  
  // Сбрасываем состояние
  state.money = CONFIG.debug.enabled ? 1000000 : 20; // DEBUG_TOOL
  state.science = CONFIG.debug.enabled ? 1000 : 0; // DEBUG_TOOL
  state.scienceLifetime = 0;
  state.lifetime = 0;
  state.keys = 0;
  state.prestiges = 0;
  state.questIndex = 0;
  state.contractsDone = 0;
  state.lastOfferTime = 0;
  state.debuffUntil = 0;
  state.contractOffer = null;
  state.contractActive = null;
  
  CONFIG.buildings.forEach(b => { state.owned[b.id] = 0; });
  CONFIG.upgrades.forEach(u => { state.purchased[u.id] = false; });
  CONFIG.managers.forEach(m => { state.managers[m.id] = false; });
  CONFIG.tech.forEach(t => { state.tech[t.id] = false; });
  
  // Обновляем UI
  updateHUD();
  updateShop();
  updateUpgrades();
  updateManagers();
  renderQuests();
  updateRankBadge();
  updatePrestigeButton();
  
  // Очищаем контракты
  const contractsEl = document.getElementById('contracts');
  if (contractsEl) contractsEl.innerHTML = '';
}

// ========== Офлайн-прогресс ==========
function calculateOfflineProgress(saveData) {
  if (!saveData || !saveData.timestamp) return null;
  
  const now = Date.now();
  const elapsed = now - saveData.timestamp;
  const elapsedSeconds = elapsed / 1000;
  
  // Показываем модалку только если прошло > 60 секунд
  if (elapsedSeconds < 60) return null;
  
  // Максимум 8 часов
  const maxOfflineSeconds = 8 * 60 * 60;
  const offlineSeconds = Math.min(elapsedSeconds, maxOfflineSeconds);
  
  // Эффективность 50%
  const efficiency = 0.5;
  
  const tps = saveData.tps ?? 0;
  const scienceTps = saveData.scienceTps ?? 0;
  
  const moneyEarned = tps * offlineSeconds * efficiency;
  const scienceEarned = scienceTps * offlineSeconds * efficiency;
  
  return {
    elapsedSeconds,
    offlineSeconds,
    moneyEarned,
    scienceEarned
  };
}

function showOfflineModal(offlineData) {
  if (!offlineData) return;
  
  // Начисляем доход сразу
  state.money += offlineData.moneyEarned;
  state.science += offlineData.scienceEarned;
  state.scienceLifetime += offlineData.scienceEarned;
  state.lifetime += offlineData.moneyEarned;
  
  // Форматируем время
  const hours = Math.floor(offlineData.elapsedSeconds / 3600);
  const minutes = Math.floor((offlineData.elapsedSeconds % 3600) / 60);
  
  let timeString = '';
  if (hours > 0) {
    timeString = `${hours}ч ${minutes}м`;
  } else {
    timeString = `${minutes}м`;
  }
  
  // Создаём модалку
  const modal = document.createElement('div');
  modal.className = 'offline-modal';
  modal.innerHTML = `
    <div class="offline-modal__content">
      <h2 class="offline-modal__title">ПОКА ТЕБЯ НЕ БЫЛО</h2>
      <p class="offline-modal__time">Отсутствовал: ${timeString}</p>
      <div class="offline-modal__rewards">
        <div class="offline-modal__reward">Сеть заработала: +${formatNumber(offlineData.moneyEarned)}$</div>
        <div class="offline-modal__reward">+${formatNumber(offlineData.scienceEarned)} науки</div>
      </div>
      <button class="offline-modal__btn" id="offline-modal-close">ЗАБРАТЬ</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Обработчик закрытия
  const closeBtn = modal.querySelector('#offline-modal-close');
  closeBtn.addEventListener('click', () => {
    modal.remove();
    updateHUD();
  });
}

// Получить стартовый капитал из ранг-наград
function getStartingMoney() {
  let startMoney = 20;
  CONFIG.rankRewards.forEach(r => {
    if (state.rank >= r.rank) {
      if (r.rank === 3) startMoney = 100;
      if (r.rank === 5) startMoney = 500;
    }
  });
  return startMoney;
}

// Получить множитель награды контрактов из ранг-наград
function getContractRewardMult() {
  let mult = 1;
  CONFIG.rankRewards.forEach(r => {
    if (state.rank >= r.rank) {
      if (r.rank === 1) mult *= 1.10;
      if (r.rank === 5) mult *= 1.25;
    }
  });
  return mult;
}

// Получить множитель дохода науки из ранг-наград
function getScienceIncomeMult() {
  let mult = 1;
  CONFIG.rankRewards.forEach(r => {
    if (state.rank >= r.rank) {
      if (r.rank === 2) mult *= 1.25;
    }
  });
  return mult;
}

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
  updatePrestigeButton();
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
    const finalReward = Math.ceil(contract.reward * getContractRewardMult());
    state.money += finalReward;
    state.science += 5;
    state.scienceLifetime += 5;
    state.contractsDone++;
    showToast(`Контракт выполнен: +${formatNumber(finalReward)}`, 'success');
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
function drawTile(i, j, highlight = false, hasBuilding = false) {
  const { x, y } = tileToScreen(i, j);
  
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 2);
  ctx.lineTo(x + TILE_W / 2, y);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.lineTo(x - TILE_W / 2, y);
  ctx.closePath();
  
  // Заливка для тайлов под зданиями
  if (hasBuilding) {
    ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
    ctx.fill();
  }
  
  // Подсветка при hover
  if (highlight) {
    ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
    ctx.fill();
  }
  
  // Контур ярче для тайлов под зданиями
  ctx.strokeStyle = hasBuilding ? 'rgba(190, 120, 255, 0.6)' : 'rgba(190, 120, 255, 0.35)';
  ctx.lineWidth = hasBuilding ? 1.5 : 1;
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

// Ауры типов зданий
const BUILDING_AURAS = {
  bpe: '#a855f7',
  attn: '#c084fc',
  gpu: '#8b5cf6',
  inf: '#e9d5ff',
  ver: '#46f79a'
};

// Отрисовка ауры под зданием
function drawBuildingAura(building) {
  const { x, y } = tileToScreen(building.i, building.j);
  const color = BUILDING_AURAS[building.type];
  if (!color) return;
  
  ctx.save();
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 30);
  gradient.addColorStop(0, color + '26'); // alpha 0.15
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Отрисовка зданий с узнаваемыми силуэтами
function drawBuilding(building) {
  const { x, y } = tileToScreen(building.i, building.j);
  const pulse = Math.sin(animTime * 3 + building.tileIndex) * 0.1 + 1;
  const scale = 0.85; // Масштаб объектов
  
  // Аура
  drawBuildingAura(building);
  
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
  
  switch (building.type) {
    case 'bpe': // Сканер-ворота с пульсирующими токенами
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      
      // Вертикальная пластина со щелью
      ctx.fillStyle = 'rgba(168, 85, 247, 0.5)';
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.8)';
      ctx.lineWidth = 1.5;
      
      // Левая пластина
      ctx.fillRect(x - 12, y - 35, 4, 35);
      ctx.strokeRect(x - 12, y - 35, 4, 35);
      
      // Правая пластина
      ctx.fillRect(x + 8, y - 35, 4, 35);
      ctx.strokeRect(x + 8, y - 35, 4, 35);
      
      // Пульсирующие токены в щели
      const tokenCount = 3;
      for (let i = 0; i < tokenCount; i++) {
        const offset = (animTime * 2 + i * 0.3) % 1;
        const tokenY = y - 35 + offset * 35;
        const tokenAlpha = Math.sin(offset * Math.PI) * 0.8;
        ctx.fillStyle = `rgba(233, 213, 255, ${tokenAlpha})`;
        ctx.beginPath();
        ctx.arc(x, tokenY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case 'attn': // Узел с орбитами
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(192, 132, 252, 0.8)';
      
      // Центральный узел
      ctx.fillStyle = 'rgba(192, 132, 252, 0.8)';
      ctx.beginPath();
      ctx.arc(x, y - 20, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Орбиты с точками
      const orbitCount = 4;
      for (let i = 0; i < orbitCount; i++) {
        const angle = (animTime * 0.5 + i * Math.PI / 2) % (Math.PI * 2);
        const orbitRadius = 18;
        const pointX = x + Math.cos(angle) * orbitRadius;
        const pointY = y - 20 + Math.sin(angle) * orbitRadius * 0.6;
        
        // Линия-орбита
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 20);
        ctx.lineTo(pointX, pointY);
        ctx.stroke();
        
        // Точка на орбите
        ctx.fillStyle = 'rgba(233, 213, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(pointX, pointY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case 'gpu': // Пирамида вероятностей
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
      ctx.fillStyle = 'rgba(139, 92, 246, 0.6)';
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.8)';
      ctx.lineWidth = 1.5;
      
      // Пирамида
      ctx.beginPath();
      ctx.moveTo(x, y - 45);
      ctx.lineTo(x + 18, y);
      ctx.lineTo(x - 18, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Пульсирующая вершина
      const vertexPulse = Math.sin(animTime * 4) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(233, 213, 255, ${vertexPulse})`;
      ctx.beginPath();
      ctx.arc(x, y - 45, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Горизонтальные штрихи-ступени
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.6)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const stepY = y - i * 10;
        const stepWidth = (i / 4) * 18;
        ctx.beginPath();
        ctx.moveTo(x - stepWidth, stepY);
        ctx.lineTo(x + stepWidth, stepY);
        ctx.stroke();
      }
      break;
      
    case 'inf': // Обелиск с молнией и лучом
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.8)';
      ctx.lineWidth = 1.5;
      
      // Обелиск
      ctx.beginPath();
      ctx.moveTo(x, y - 55);
      ctx.lineTo(x + 10, y - 45);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x - 10, y);
      ctx.lineTo(x - 10, y - 45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Символ молнии
      const lightningOpacity = Math.sin(animTime * 5) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(233, 213, 255, ${lightningOpacity})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 35);
      ctx.lineTo(x + 2, y - 30);
      ctx.lineTo(x - 2, y - 25);
      ctx.lineTo(x + 3, y - 20);
      ctx.stroke();
      
      // Тонкий луч вверх
      ctx.strokeStyle = `rgba(233, 213, 255, ${lightningOpacity * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 55);
      ctx.lineTo(x, y - 70);
      ctx.stroke();
      break;
      
    case 'ver': // Купол-щит с зелёной вспышкой
      ctx.shadowBlur = 25;
      ctx.shadowColor = 'rgba(70, 247, 154, 0.8)';
      
      // Купол
      ctx.fillStyle = 'rgba(70, 247, 154, 0.3)';
      ctx.strokeStyle = 'rgba(70, 247, 154, 0.8)';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.arc(x, y - 15, 20, Math.PI, 0);
      ctx.lineTo(x + 20, y);
      ctx.lineTo(x - 20, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Дуга-щит
      ctx.strokeStyle = 'rgba(70, 247, 154, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y - 15, 25, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      
      // Редкая зелёная вспышка-галочка
      const checkOpacity = Math.sin(animTime * 2) > 0.8 ? 1 : 0;
      if (checkOpacity > 0) {
        ctx.strokeStyle = `rgba(70, 247, 154, ${checkOpacity})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 15);
        ctx.lineTo(x - 2, y - 10);
        ctx.lineTo(x + 6, y - 20);
        ctx.stroke();
      }
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
    
    // Точки-спутники для клонов (до 5 точек по краю тайла)
    const satelliteCount = Math.min(building.count - 1, 5);
    const satelliteRadius = 25;
    const color = BUILDING_AURAS[building.type] || '#a855f7';
    
    for (let i = 0; i < satelliteCount; i++) {
      const angle = (i / satelliteCount) * Math.PI * 2 + animTime * 0.3;
      const satX = x + Math.cos(angle) * satelliteRadius;
      const satY = y + Math.sin(angle) * satelliteRadius * 0.6; // Изометрическое сжатие
      
      ctx.fillStyle = color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(satX, satY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.restore();
}

// Система линий-связей с пульсами
const connections = []; // {building, phase, speed, color}

function initConnections() {
  connections.length = 0;
  mapBuildings.forEach(building => {
    connections.push({
      building,
      phase: Math.random() * Math.PI * 2, // Разная фаза для каждого здания
      speed: 0.008 + Math.random() * 0.004, // Цикл 1.5-2с при 60fps
      color: BUILDING_AURAS[building.type] || '#a855f7'
    });
  });
}

function drawConnectionLines() {
  if (connections.length === 0) return;
  
  const center = Math.floor(MAP_SIZE / 2);
  const { x: coreX, y: coreY } = tileToScreen(center, center);
  
  connections.forEach(conn => {
    const { x: startX, y: startY } = tileToScreen(conn.building.i, conn.building.j);
    
    // Линия от центра тайла здания к центру тайла ядра
    ctx.strokeStyle = 'rgba(190, 120, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(coreX, coreY);
    ctx.stroke();
    
    // Пульс-точка, движущаяся по линии
    const progress = (Math.sin(animTime * conn.speed * 60 + conn.phase) + 1) / 2; // 0-1
    const currentX = startX + (coreX - startX) * progress;
    const currentY = startY + (coreY - startY) * progress;
    
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = conn.color;
    ctx.fillStyle = '#e9d5ff';
    ctx.beginPath();
    ctx.arc(currentX, currentY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// Проверка, находится ли тайл под зданием
function isTileUnderBuilding(i, j) {
  return mapBuildings.some(b => b.i === i && b.j === j);
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
      const hasBuilding = isTileUnderBuilding(obj.i, obj.j);
      drawTile(obj.i, obj.j, isHovered, hasBuilding);
    } else if (obj.type === 'core') {
      drawCore();
    } else if (obj.type === 'building') {
      drawBuilding(obj.building);
    }
  });
  
  // Отрисовка линий-связей поверх тайлов, но под зданиями
  drawConnectionLines();
}

// Фиксированные позиции для каждого типа здания (звезда на расстоянии 2 от центра)
const BUILDING_POSITIONS = {
  bpe: { i: 0, j: 2 },      // Север
  attn: { i: 2, j: 4 },     // Северо-восток
  gpu: { i: 4, j: 4 },      // Юго-восток
  inf: { i: 4, j: 2 },      // Юг
  ver: { i: 2, j: 0 }       // Юго-запад
};

// Размещение здания на карте (фиксированная позиция для каждого типа)
function placeBuildingOnMap(buildingId) {
  const existing = mapBuildings.find(b => b.type === buildingId);
  
  if (existing) {
    existing.count++;
    return;
  }
  
  const pos = BUILDING_POSITIONS[buildingId];
  if (!pos) return;
  
  mapBuildings.push({ 
    type: buildingId, 
    tileIndex: 0, 
    count: 1, 
    i: pos.i, 
    j: pos.j 
  });
  
  // Обновляем соединения
  initConnections();
}

// Система тултипов
let hoveredBuilding = null;
let touchTimer = null;

function getBuildingAtPosition(mx, my) {
  // Проверяем, находится ли курсор над зданием
  for (const building of mapBuildings) {
    const { x, y } = tileToScreen(building.i, building.j);
    const distance = Math.sqrt((mx - x) ** 2 + (my - (y - 20)) ** 2);
    if (distance < 25) { // Радиус здания ~20-25px
      return building;
    }
  }
  return null;
}

function showBuildingTooltip(building, clientX, clientY) {
  const tooltip = document.getElementById('building-tooltip');
  if (!tooltip) return;
  
  const buildingConfig = CONFIG.buildings.find(b => b.id === building.type);
  if (!buildingConfig) return;
  
  const { buildingMult } = getMultipliers();
  const incomePerUnit = buildingConfig.rate * (buildingMult[building.type] || 1);
  const totalIncome = incomePerUnit * building.count;
  
  tooltip.innerHTML = `
    <div class="building-tooltip__name">${buildingConfig.name}</div>
    <div class="building-tooltip__info">
      Кол-во: <strong>${building.count}</strong><br>
      Доход: <strong>+${formatNumber(totalIncome)}/с</strong>
    </div>
  `;
  
  // Позиционируем тултип рядом с курсором
  const stage = document.querySelector('.stage');
  const stageRect = stage.getBoundingClientRect();
  
  tooltip.style.display = 'block';
  tooltip.style.left = (clientX - stageRect.left + 20) + 'px';
  tooltip.style.top = (clientY - stageRect.top - 20) + 'px';
}

function hideBuildingTooltip() {
  const tooltip = document.getElementById('building-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Hover обработка
if (canvas) {
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / canvasScale;
    const my = (e.clientY - rect.top) / canvasScale;
    
    const tile = screenToTile(mx, my);
    
    if (tile.i >= 0 && tile.i < MAP_SIZE && tile.j >= 0 && tile.j < MAP_SIZE) {
      hoveredTile = tile;
    } else {
      hoveredTile = null;
    }
    
    // Проверяем hover над зданием
    const building = getBuildingAtPosition(mx, my);
    if (building) {
      hoveredBuilding = building;
      showBuildingTooltip(building, e.clientX, e.clientY);
    } else {
      hoveredBuilding = null;
      hideBuildingTooltip();
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    hoveredTile = null;
    hoveredBuilding = null;
    hideBuildingTooltip();
  });
  
  // Touch поддержка (долгое нажатие)
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const mx = (touch.clientX - rect.left) / canvasScale;
    const my = (touch.clientY - rect.top) / canvasScale;
    
    touchTimer = setTimeout(() => {
      const building = getBuildingAtPosition(mx, my);
      if (building) {
        hoveredBuilding = building;
        showBuildingTooltip(building, touch.clientX, touch.clientY);
      }
    }, 500); // 500ms для долгого нажатия
  });
  
  canvas.addEventListener('touchend', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    hoveredBuilding = null;
    hideBuildingTooltip();
  });
  
  canvas.addEventListener('touchmove', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    hoveredBuilding = null;
    hideBuildingTooltip();
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

// ========== Престиж ==========
function getPrestigeKeys() {
  const threshold = CONFIG.debug.enabled ? 1000 : 1e6; // DEBUG_TOOL
  if (state.lifetime < threshold) return 0;
  return Math.floor(Math.sqrt(state.lifetime / threshold));
}

function getNextRankReward() {
  const next = CONFIG.rankRewards.find(r => r.rank > state.rank);
  return next || null;
}

function updatePrestigeButton() {
  const pill = document.getElementById('prestige-pill');
  if (!pill) return;
  
  const keys = getPrestigeKeys();
  if (keys > 0) {
    pill.style.display = 'inline-block';
    pill.textContent = `⚡ ОРИГИНАЛЬНЫЙ СТЕК: +${keys} GWARP-ключей`;
  } else {
    pill.style.display = 'none';
  }
}

function openPrestigeModal() {
  const modal = document.getElementById('prestige-modal');
  if (!modal) return;
  
  const keys = getPrestigeKeys();
  const newRank = state.rank + 1;
  const nextReward = CONFIG.rankRewards.find(r => r.rank === newRank);
  
  const rewardsList = modal.querySelector('.prestige__rewards');
  if (rewardsList) {
    rewardsList.innerHTML = `
      <div class="prestige__reward-item">+${keys} GWARP-ключей (+${keys * 10}% к доходу)</div>
      <div class="prestige__reward-item">Ранг станет: <strong>${newRank}</strong></div>
      ${nextReward ? `<div class="prestige__reward-item">Награда ранга ${newRank}: ${nextReward.desc}</div>` : '<div class="prestige__reward-item prestige__reward-item--muted">Новых наград ранга нет</div>'}
    `;
  }
  
  modal.style.display = 'flex';
}

function closePrestigeModal() {
  const modal = document.getElementById('prestige-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

function confirmPrestige() {
  const keys = getPrestigeKeys();
  if (keys <= 0) return;
  
  // Сохраняем
  const savedKeys = state.keys + keys;
  const savedPrestiges = state.prestiges + 1;
  const savedQuestIndex = state.questIndex;
  const savedTech = { ...state.tech };
  const savedScience = state.science;
  const savedScienceLifetime = state.scienceLifetime;
  const savedContractsDone = state.contractsDone;
  
  // Сброс
  state.money = getStartingMoney();
  state.lifetime = 0;
  state.owned = {};
  CONFIG.buildings.forEach(b => { state.owned[b.id] = 0; });
  state.purchased = {};
  CONFIG.upgrades.forEach(u => { state.purchased[u.id] = false; });
  state.managers = {};
  CONFIG.managers.forEach(m => { state.managers[m.id] = false; });
  state.contractOffer = null;
  state.contractActive = null;
  state.lastOfferTime = 0;
  state.debuffUntil = 0;
  
  // Восстанавливаем
  state.keys = savedKeys;
  state.prestiges = savedPrestiges;
  state.questIndex = savedQuestIndex;
  state.tech = savedTech;
  state.science = savedScience;
  state.scienceLifetime = savedScienceLifetime;
  state.contractsDone = savedContractsDone;
  
  // Обновляем UI
  updateHUD();
  updateShop();
  updateUpgrades();
  updateManagers();
  renderQuests();
  updatePrestigeButton();
  updateRankBadge();
  
  // Очищаем контракты
  const contractsEl = document.getElementById('contracts');
  if (contractsEl) contractsEl.innerHTML = '';
  
  closePrestigeModal();
  showToast(`Оригинальный стек: +${keys} ключей, ранг ${state.rank}`, 'success');
}

function updateRankBadge() {
  const badge = document.getElementById('rank-badge');
  if (!badge) return;
  
  const rankValue = badge.querySelector('.rank-badge__value');
  if (rankValue) rankValue.textContent = state.rank;
  
  const nextRewardEl = document.getElementById('rank-rewards-line');
  if (nextRewardEl) {
    const next = getNextRankReward();
    if (next) {
      nextRewardEl.textContent = `НАГРАДЫ ЗА РАНГ: ${next.desc} (ранг ${next.rank})`;
    } else {
      nextRewardEl.textContent = 'НАГРАДЫ ЗА РАНГ: все получены';
    }
  }
}

// ========== Наука и Исследования ==========
function getScienceIncome() {
  const base = (state.owned.ver || 0) * 1.0 + (state.owned.inf || 0) * 0.2;
  return base * getScienceIncomeMult();
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

// Обновление высоты HUD для padding-top панели
function updateHudHeight() {
  const hud = document.querySelector('.hud');
  if (hud) {
    const hudHeight = hud.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--hud-h', hudHeight + 'px');
  }
}

// ResizeObserver для отслеживания изменений размера HUD
function initHudResizeObserver() {
  const hud = document.querySelector('.hud');
  if (hud && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      updateHudHeight();
    });
    observer.observe(hud);
  }
  // Первоначальное обновление
  updateHudHeight();
}

// Инициализация после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Загрузка сохранения
    const saveData = loadGame();
    if (saveData) {
      applySaveData(saveData);
      
      // Офлайн-прогресс
      const offlineData = calculateOfflineProgress(saveData);
      if (offlineData) {
        showOfflineModal(offlineData);
      }
    }
    
    initCanvas();
    animate();
    renderShop();
    renderUpgrades();
    renderManagers();
    renderQuests();
    updateRankBadge();
    updatePrestigeButton();
    updateHUD();
    initHudResizeObserver();
    
    // Автосейв каждые 5 секунд
    setInterval(saveGame, 5000);
    
    // Сохранение при скрытии вкладки
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveGame();
    });
    
    // Сохранение перед закрытием
    window.addEventListener('beforeunload', saveGame);
    
    // Обработчики оверлея
    const openBtn = document.getElementById('research-open');
    if (openBtn) openBtn.addEventListener('click', openResearchOverlay);
    
    const closeBtn = document.getElementById('research-close');
    if (closeBtn) closeBtn.addEventListener('click', closeResearchOverlay);
    
    // Обработчики престижа
    const prestigePill = document.getElementById('prestige-pill');
    if (prestigePill) prestigePill.addEventListener('click', openPrestigeModal);
    
    const prestigeConfirm = document.getElementById('prestige-confirm');
    if (prestigeConfirm) prestigeConfirm.addEventListener('click', confirmPrestige);
    
    const prestigeCancel = document.getElementById('prestige-cancel');
    if (prestigeCancel) prestigeCancel.addEventListener('click', closePrestigeModal);
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeResearchOverlay();
        closePrestigeModal();
      }
    });
    
    // ========== DEBUG TOOLS ========== // DEBUG_TOOL
    if (CONFIG.debug.enabled) { // DEBUG_TOOL
      console.log('[DEBUG] Debug mode enabled'); // DEBUG_TOOL
      
      // Создаём window.NT_DEBUG // DEBUG_TOOL
      window.NT_DEBUG = { // DEBUG_TOOL
        addMoney(n) { state.money += n; updateHUD(); }, // DEBUG_TOOL
        addScience(n) { state.science += n; updateHUD(); }, // DEBUG_TOOL
        setLifetime(n) { state.lifetime = n; updatePrestigeButton(); }, // DEBUG_TOOL
        finishCurrentQuest() { // DEBUG_TOOL
          if (state.questIndex >= CONFIG.quests.length) return; // DEBUG_TOOL
          const quest = CONFIG.quests[state.questIndex]; // DEBUG_TOOL
          if (quest.goal.type === 'own') state.owned[quest.goal.id] = quest.goal.n; // DEBUG_TOOL
          else if (quest.goal.type === 'hire') state.managers[quest.goal.id] = true; // DEBUG_TOOL
          else if (quest.goal.type === 'contracts') state.contractsDone = quest.goal.n; // DEBUG_TOOL
          else if (quest.goal.type === 'lifetime') state.lifetime = quest.goal.n; // DEBUG_TOOL
          completeQuest(); updateShop(); updateManagers(); renderQuests(); // DEBUG_TOOL
        }, // DEBUG_TOOL
        offerContractNow() { state.lastOfferTime = 0; tryOfferContract(); }, // DEBUG_TOOL
        triggerGrayGateway() { // DEBUG_TOOL
          if (state.purchased.ver) { // DEBUG_TOOL
            showToast('Серый шлюз заблокирован: ZERO SPOOFING', 'success'); // DEBUG_TOOL
            showStamp(); // DEBUG_TOOL
          } else { // DEBUG_TOOL
            showToast('Серый шлюз перехватывает трафик: −50% дохода на 20s', 'danger'); // DEBUG_TOOL
            state.debuffUntil = Date.now() + 20000; // DEBUG_TOOL
          } // DEBUG_TOOL
        }, // DEBUG_TOOL
        giveAllBuildings(n) { // DEBUG_TOOL
          CONFIG.buildings.forEach(b => { // DEBUG_TOOL
            state.owned[b.id] += n; // DEBUG_TOOL
            for (let i = 0; i < n; i++) placeBuildingOnMap(b.id); // DEBUG_TOOL
          }); // DEBUG_TOOL
          updateShop(); updateHUD(); // DEBUG_TOOL
        }, // DEBUG_TOOL
        unlockAllTech() { // DEBUG_TOOL
          CONFIG.tech.forEach(t => { state.tech[t.id] = true; }); // DEBUG_TOOL
        }, // DEBUG_TOOL
        prestigeNow() { // DEBUG_TOOL
          if (state.lifetime < 1000) state.lifetime = 1000; // DEBUG_TOOL
          openPrestigeModal(); // DEBUG_TOOL
        } // DEBUG_TOOL
      }; // DEBUG_TOOL
      
      // Создаём DOM элементы с data-debug для диагностики // DEBUG_TOOL
      const debugToggle = document.createElement('button'); // DEBUG_TOOL
      debugToggle.className = 'debug-toggle'; // DEBUG_TOOL
      debugToggle.setAttribute('data-debug', 'toggle'); // DEBUG_TOOL
      debugToggle.textContent = 'DBG'; // DEBUG_TOOL
      debugToggle.onclick = () => { // DEBUG_TOOL
        const panel = document.querySelector('.debug-panel'); // DEBUG_TOOL
        if (panel) panel.classList.toggle('debug-panel--collapsed'); // DEBUG_TOOL
      }; // DEBUG_TOOL
      document.body.appendChild(debugToggle); // DEBUG_TOOL
      
      const debugPanel = document.createElement('div'); // DEBUG_TOOL
      debugPanel.className = 'debug-panel debug-panel--collapsed'; // DEBUG_TOOL
      debugPanel.setAttribute('data-debug', 'panel'); // DEBUG_TOOL
      debugPanel.innerHTML = `
        <div class="debug-panel__title">DBG</div>
        <div class="debug-panel__grid">
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.addMoney(1000000)">+1M $</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.addScience(1000)">+1K sci</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.setLifetime(1000)">life=1K</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.finishCurrentQuest()">quest</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.offerContractNow()">contract</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.triggerGrayGateway()">gateway</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.giveAllBuildings(5)">+5 bld</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.unlockAllTech()">tech</button>
          <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.prestigeNow()">prestige</button>
        </div>
      `; // DEBUG_TOOL
      document.body.appendChild(debugPanel); // DEBUG_TOOL
      
      console.log('[DEBUG] Debug tools initialized'); // DEBUG_TOOL
    } // DEBUG_TOOL
  });
} else {
  // Загрузка сохранения
  const saveData = loadGame();
  if (saveData) {
    applySaveData(saveData);
    
    // Офлайн-прогресс
    const offlineData = calculateOfflineProgress(saveData);
    if (offlineData) {
      showOfflineModal(offlineData);
    }
  }
  
  initCanvas();
  animate();
  renderShop();
  renderUpgrades();
  renderManagers();
  renderQuests();
  updateRankBadge();
  updatePrestigeButton();
  updateHUD();
  initHudResizeObserver();
  
  // Автосейв каждые 5 секунд
  setInterval(saveGame, 5000);
  
  // Сохранение при скрытии вкладки
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
  });
  
    // Сохранение перед закрытием
    window.addEventListener('beforeunload', saveGame);
    
    // Кнопка сброса
    const resetBtn = document.querySelector('.btn-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetGame);
    
    const openBtn = document.getElementById('research-open');
    if (openBtn) openBtn.addEventListener('click', openResearchOverlay);  
  const closeBtn = document.getElementById('research-close');
  if (closeBtn) closeBtn.addEventListener('click', closeResearchOverlay);
  
  const prestigePill = document.getElementById('prestige-pill');
  if (prestigePill) prestigePill.addEventListener('click', openPrestigeModal);
  
  const prestigeConfirm = document.getElementById('prestige-confirm');
  if (prestigeConfirm) prestigeConfirm.addEventListener('click', confirmPrestige);
  
  const prestigeCancel = document.getElementById('prestige-cancel');
  if (prestigeCancel) prestigeCancel.addEventListener('click', closePrestigeModal);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeResearchOverlay();
      closePrestigeModal();
    }
  });
  
  // ========== DEBUG TOOLS ========== // DEBUG_TOOL
  if (CONFIG.debug.enabled) { // DEBUG_TOOL
    console.log('[DEBUG] Debug mode enabled'); // DEBUG_TOOL
    
    // Создаём window.NT_DEBUG // DEBUG_TOOL
    window.NT_DEBUG = { // DEBUG_TOOL
      addMoney(n) { state.money += n; updateHUD(); }, // DEBUG_TOOL
      addScience(n) { state.science += n; updateHUD(); }, // DEBUG_TOOL
      setLifetime(n) { state.lifetime = n; updatePrestigeButton(); }, // DEBUG_TOOL
      finishCurrentQuest() { // DEBUG_TOOL
        if (state.questIndex >= CONFIG.quests.length) return; // DEBUG_TOOL
        const quest = CONFIG.quests[state.questIndex]; // DEBUG_TOOL
        if (quest.goal.type === 'own') state.owned[quest.goal.id] = quest.goal.n; // DEBUG_TOOL
        else if (quest.goal.type === 'hire') state.managers[quest.goal.id] = true; // DEBUG_TOOL
        else if (quest.goal.type === 'contracts') state.contractsDone = quest.goal.n; // DEBUG_TOOL
        else if (quest.goal.type === 'lifetime') state.lifetime = quest.goal.n; // DEBUG_TOOL
        completeQuest(); updateShop(); updateManagers(); renderQuests(); // DEBUG_TOOL
      }, // DEBUG_TOOL
      offerContractNow() { state.lastOfferTime = 0; tryOfferContract(); }, // DEBUG_TOOL
      triggerGrayGateway() { // DEBUG_TOOL
        if (state.purchased.ver) { // DEBUG_TOOL
          showToast('Серый шлюз заблокирован: ZERO SPOOFING', 'success'); // DEBUG_TOOL
          showStamp(); // DEBUG_TOOL
        } else { // DEBUG_TOOL
          showToast('Серый шлюз перехватывает трафик: −50% дохода на 20s', 'danger'); // DEBUG_TOOL
          state.debuffUntil = Date.now() + 20000; // DEBUG_TOOL
        } // DEBUG_TOOL
      }, // DEBUG_TOOL
      giveAllBuildings(n) { // DEBUG_TOOL
        CONFIG.buildings.forEach(b => { // DEBUG_TOOL
          state.owned[b.id] += n; // DEBUG_TOOL
          for (let i = 0; i < n; i++) placeBuildingOnMap(b.id); // DEBUG_TOOL
        }); // DEBUG_TOOL
        updateShop(); updateHUD(); // DEBUG_TOOL
      }, // DEBUG_TOOL
      unlockAllTech() { // DEBUG_TOOL
        CONFIG.tech.forEach(t => { state.tech[t.id] = true; }); // DEBUG_TOOL
      }, // DEBUG_TOOL
      prestigeNow() { // DEBUG_TOOL
        if (state.lifetime < 1000) state.lifetime = 1000; // DEBUG_TOOL
        openPrestigeModal(); // DEBUG_TOOL
      } // DEBUG_TOOL
    }; // DEBUG_TOOL
    
    // Создаём DOM элементы с data-debug для диагностики // DEBUG_TOOL
    const debugToggle = document.createElement('button'); // DEBUG_TOOL
    debugToggle.className = 'debug-toggle'; // DEBUG_TOOL
    debugToggle.setAttribute('data-debug', 'toggle'); // DEBUG_TOOL
    debugToggle.textContent = 'DBG'; // DEBUG_TOOL
    debugToggle.onclick = () => { // DEBUG_TOOL
      const panel = document.querySelector('.debug-panel'); // DEBUG_TOOL
      if (panel) panel.classList.toggle('debug-panel--collapsed'); // DEBUG_TOOL
    }; // DEBUG_TOOL
    document.body.appendChild(debugToggle); // DEBUG_TOOL
    
    const debugPanel = document.createElement('div'); // DEBUG_TOOL
    debugPanel.className = 'debug-panel debug-panel--collapsed'; // DEBUG_TOOL
    debugPanel.setAttribute('data-debug', 'panel'); // DEBUG_TOOL
    debugPanel.innerHTML = `
      <div class="debug-panel__title">DBG</div>
      <div class="debug-panel__grid">
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.addMoney(1000000)">+1M $</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.addScience(1000)">+1K sci</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.setLifetime(1000)">life=1K</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.finishCurrentQuest()">quest</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.offerContractNow()">contract</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.triggerGrayGateway()">gateway</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.giveAllBuildings(5)">+5 bld</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.unlockAllTech()">tech</button>
        <button class="debug-panel__btn" data-debug="btn" onclick="NT_DEBUG.prestigeNow()">prestige</button>
      </div>
    `; // DEBUG_TOOL
    document.body.appendChild(debugPanel); // DEBUG_TOOL
    
    console.log('[DEBUG] Debug tools initialized'); // DEBUG_TOOL
  } // DEBUG_TOOL
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
