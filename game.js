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
  if (num < 1e6) return (num / 1e3).toFixed(1) + ' тыс';
  if (num < 1e9) return (num / 1e6).toFixed(1) + ' млн';
  if (num < 1e12) return (num / 1e9).toFixed(1) + ' млрд';
  return (num / 1e12).toFixed(1) + ' трлн';
}

function getIncome() {
  let income = 0;
  CONFIG.buildings.forEach(b => {
    income += state.owned[b.id] * b.rate;
  });
  return income * globalMult();
}

function updateHUD() {
  const balanceEl = document.querySelector('[data-hud="balance"]');
  const incomeEl = document.querySelector('[data-hud="income"]');
  const keysEl = document.querySelector('[data-hud="keys"]');
  
  if (balanceEl) balanceEl.textContent = formatNumber(state.money);
  if (incomeEl) incomeEl.textContent = '+' + formatNumber(getIncome()) + '/s';
  if (keysEl) keysEl.textContent = state.keys.toString();
}

// Тик игры (100ms)
setInterval(() => {
  const dt = 0.1; // 100ms = 0.1s
  const income = getIncome();
  const earned = income * dt;
  state.money += earned;
  state.lifetime += earned;
  updateHUD();
}, 100);

// Клик по кубу
const cubeWrapper = document.querySelector('.cube-wrapper');
if (cubeWrapper) {
  cubeWrapper.addEventListener('click', () => {
    const earned = CONFIG.clickPower * globalMult();
    state.money += earned;
    state.lifetime += earned;
    updateHUD();
  });
}
