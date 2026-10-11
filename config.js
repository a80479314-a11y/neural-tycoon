// Определение debug режима // DEBUG_TOOL
const isDebugMode = () => { // DEBUG_TOOL
  const urlParams = new URLSearchParams(window.location.search); // DEBUG_TOOL
  return !(urlParams.get('debug') === '0' || localStorage.getItem('nt_debug') === '0'); // DEBUG_TOOL
}; // DEBUG_TOOL

export const CONFIG = {
  debug: { enabled: isDebugMode() }, // DEBUG_TOOL
  clickPower: 1,
  costGrowth: 1.15,
  buildings: [
    {id:'bpe',  name:'Токенизация (BPE)',              desc:'Режет слова и код на суб-токены. Смысл кодируется координатами в векторном пространстве.',        cost:15,     rate:0.5},
    {id:'attn', name:'Матрицы Attention',               desc:'Сопоставляют каждый токен со всеми остальными, удерживая контекст всего файла.',                  cost:120,    rate:5},
    {id:'gpu',  name:'Вероятностный инференс',          desc:'Модель не думает как человек — выбирает математически наиболее вероятное продолжение строки.',    cost:1400,   rate:32},
    {id:'inf',  name:'Флагман GPT-6 Astra',             desc:'Прямой доступ без посредников и VPN: 2.5x быстрее за итерацию, черновик докручивается вторым промптом.',  cost:16000,  rate:210},
    {id:'ver',  name:'Model Verifier',                  desc:'100% GENUINE, ZERO SPOOFING: авто-бенчмарки и фингерпринты вскрывают серые шлюзы и даунгрейды.',  cost:200000, rate:1500}
  ],
  upgrades: [
    {id:'u1', name:'Оптимизация BPE',      desc:'Доход от «Токенизация (BPE)» ×2.',               cost:800,    req:{bpe:5},  mult:{bpe:2}},
    {id:'u2', name:'Flash-Attention',      desc:'Доход от «Матрицы Attention» ×2.',               cost:6000,   req:{attn:5}, mult:{attn:2}},
    {id:'u3', name:'Квантование FP8',      desc:'Доход от «Вероятностный инференс» ×2.',          cost:70000,  req:{gpu:5},  mult:{gpu:2}},
    {id:'u6', name:'Astra: 2.5x Speed',    desc:'Доход от «Флагман GPT-6 Astra» ×2.',             cost:250000, req:{inf:5},  mult:{inf:2}},
    {id:'u5', name:'Оригинальный стек',    desc:'Оригинальный стек без костылей: +25% ко всему доходу навсегда.', cost:500000, global:1.25}
  ],
  contracts: {
    firstOfferAt: 1000,
    offerEvery: 75,
    acceptWindow: 30,
    duration: 60,
    pressure: 1.25,
    rewardRate: 0.4
  },
  managers: [
    {id:'m_bpe',  for:'bpe',  name:'Архитектор BPE',        cost:1000},
    {id:'m_attn', for:'attn', name:'Оркестратор Attention',  cost:8000},
    {id:'m_gpu',  for:'gpu',  name:'Диспетчер инференса',    cost:90000},
    {id:'m_inf',  for:'inf',  name:'Оператор Astra',         cost:1200000},
    {id:'m_ver',  for:'ver',  name:'Verifier: авто-аудит',   cost:5000000}
  ],
  rankRewards: [
    {rank:1, desc:'Награда контрактов +10%'},
    {rank:2, desc:'Доход науки +25%'},
    {rank:3, desc:'Стартовый капитал 100'},
    {rank:5, desc:'Награда контрактов +25% и стартовый капитал 500'}
  ],
  tech: [
    {id:'r1', name:'Кэш токенов',        desc:'+25% к доходу Токенизации (BPE).',      cost:40,   req:[],        mult:{bpe:1.25}},
    {id:'r2', name:'Параллельные ветви', desc:'+25% к доходу Матриц Attention.',       cost:40,   req:[],        mult:{attn:1.25}},
    {id:'c1', name:'KV-кэш',             desc:'+25% к доходу Вероятностного инференса.',cost:120,  req:['r1'],    mult:{gpu:1.25}},
    {id:'c2', name:'Дистилляция',        desc:'+25% к доходу Флагмана Astra.',         cost:300,  req:['c1'],    mult:{inf:1.25}},
    {id:'c3', name:'Разреженное внимание',desc:'Ещё +25% к доходу Матриц Attention.',  cost:120,  req:['r2'],    mult:{attn:1.25}},
    {id:'c4', name:'Роутер MoE',         desc:'+10% ко всему доходу.',                 cost:400,  req:['c3'],    global:1.10},
    {id:'f1', name:'Ядро сингулярности', desc:'+25% ко всему доходу. Финал ветки.',    cost:1500, req:['c2','c4'],global:1.25}
  ],
  quests: [
    {id:'q1', text:'Запусти токенизацию: купи 1 BPE',        goal:{type:'own', id:'bpe', n:1},       reward:50},
    {id:'q2', text:'Нарасти нарезку: 5 BPE',                  goal:{type:'own', id:'bpe', n:5},       reward:200},
    {id:'q3', text:'Контекст важен: 1 Матрица Attention',     goal:{type:'own', id:'attn', n:1},      reward:400},
    {id:'q4', text:'Первый контракт: выполни любой',          goal:{type:'contracts', n:1},           reward:1000},
    {id:'q5', text:'Автоматизация: найми Архитектора BPE',    goal:{type:'hire', id:'m_bpe', n:1},    reward:2500},
    {id:'q6', text:'Масштаб: 5 Матриц Attention',             goal:{type:'own', id:'attn', n:5},      reward:5000},
    {id:'q7', text:'Переживи серый шлюз: купи Model Verifier',goal:{type:'own', id:'ver', n:1},       reward:50000},
    {id:'q8', text:'Путь к сингулярности: lifetime 1 млн',    goal:{type:'lifetime', n:1000000},      reward:250000}
  ]
};
