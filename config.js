export const CONFIG = {
  clickPower: 1,
  costGrowth: 1.15,
  buildings: [
    {id:'bpe',  name:'Токенизатор (BPE)',      desc:'Режет слова и код на суб-токены.',        cost:15,     rate:0.5},
    {id:'attn', name:'Матрицы Attention',       desc:'Сопоставляют каждый токен со всеми.',     cost:120,    rate:5},
    {id:'gpu',  name:'GPU-кластер',             desc:'Вычислительная плотность пайплайнов.',    cost:1400,   rate:32},
    {id:'inf',  name:'Вероятностный инференс',  desc:'Выбирает вероятное продолжение строки.',  cost:16000,  rate:210},
    {id:'ver',  name:'Model Verifier',          desc:'Блокирует серые шлюзы и подмены.',        cost:200000, rate:1500}
  ]
};
