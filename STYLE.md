# Neural Tycoon — Visual Style Guide

---

ПАЛИТРА: --bg:#05030a; --primary:#a855f7; --deep:#7c3aed; --violet:#c084fc;
--line:rgba(190,120,255,.35); --green:#46f79a; --text:#f4eefc; --muted:#bfa8d8.
ШРИФТЫ: Oswald (заголовки, uppercase, 500–700) + Manrope (текст 400/600/800), Google Fonts.
GLASS-КОМПОНЕНТ: bg rgba(24,16,32,.78); border 1px var(--line); radius 14–20px;
backdrop-filter blur(12–14px); box-shadow 0 0 20–60px rgba(124,58,237,.2–.45).
ПОЛ: неоновая сетка, perspective(900px) rotateX(64deg), клетка 80px,
линии 2px rgba(168,85,247,.28), анимация движения к зрителю, radial-mask к краям.
ИЗОМЕТРИЯ: CSS 3D preserve-3d, rotateX(-28deg) rotateY(45deg); грани полупрозрачные
с inset-glow; верхняя грань светлее; вокруг drop-shadow фиолетовый.
ЦИФРЫ: крупные счётчики — outline (-webkit-text-stroke:1px rgba(233,213,255,.45), color transparent).
КНОПКИ: pill radius 999px; buy-кнопки gradient var(--deep)→var(--primary) + glow.
АКЦЕНТ УСПЕХА: var(--green) только для штампов/тостов успеха.
ЗАПРЕТ: другие оттенки, светлые фоны, serif-шрифты, плоский material-design.

---
