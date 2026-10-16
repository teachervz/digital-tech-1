// =====================================================================
// مشغّل الشرائح: يقرأ الدرس من data/lessons.js ويرسم كل شريحة حسب نوعها (type)
// التنقل: → أو Space = التالي | ← = السابق | ت أو c = تصفيق | ق أو n = قرعة | Esc = المكتبة
// لا ينتقل العرض تلقائيًا أبدًا؛ المعلمة هي من تتحكم في التنقل.
// =====================================================================
(async function () {
  const { ar, en, esc, el, toast, saved, qs } = UI;
  const LAT = ['A', 'B', 'C', 'D'];
  const LET = ['أ', 'ب', 'ج', 'د'];

  const user = await DB.requireAuth();
  if (!user) return;

  // ---------- الدرس والفصل ----------
  const lessonId = qs('lesson');
  const found = UI.lessonIndex().find(x => x.lesson.id === lessonId);
  if (!found) { location.href = 'index.html'; return; }
  const { unit, lesson } = found;
  const classId = qs('class') || null;
  const cls = classId ? DB.getClass(classId) : null;
  const profile = DB.getProfile();

  document.body.dataset.theme = unit.theme;
  document.title = `${lesson.title} – ${unit.title}`;
  UI.mountStatusBadge(document.getElementById('badge'));
  const pclass = document.getElementById('pclass');
  if (cls) { pclass.hidden = false; pclass.textContent = '👭 ' + cls.name; }

  // كل درس يبدأ بغلاف الوحدة السينمائي
  const slides = [{ type: 'cover' }].concat(lesson.slides);
  const plkSlides = slides.filter(s => s.type === 'plickers');

  const stage = document.getElementById('stage');
  const fx = document.getElementById('fx');
  let cur = -1;
  let api = {};        // واجهة الشريحة الحالية (مثل next للكشف التدريجي)
  let cleanups = [];   // مؤقتات تُلغى عند مغادرة الشريحة

  // ------------------------------------------------------------------
  // تكبير المسرح ليملأ الشاشة بنسبة 16:9 دون أشرطة تمرير
  // ------------------------------------------------------------------
  const scale = () => Math.min(innerWidth / 1600, innerHeight / 900);
  function fitStage() { document.documentElement.style.setProperty('--s', scale()); }
  addEventListener('resize', fitStage);
  fitStage();

  // ------------------------------------------------------------------
  // الأصوات (Web Audio API – بدون ملفات خارجية)
  // ------------------------------------------------------------------
  let actx = null;
  function ac() {
    try {
      if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tones(freqs, { type = 'sine', step = 0.12, len = 0.22, vol = 0.18 } = {}) {
    const c = ac(); if (!c) return;
    freqs.forEach((f, i) => {
      const t = c.currentTime + i * step;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + len + 0.05);
    });
  }
  const successTone = () => tones([523.25, 659.25, 783.99, 1046.5], { step: 0.1, len: 0.3 });
  const wrongTone = () => tones([311, 262], { type: 'triangle', step: 0.16, len: 0.25, vol: 0.12 });
  const doneTone = () => tones([880, 660, 880], { type: 'square', step: 0.18, len: 0.15, vol: 0.06 });
  const tick = () => tones([1400], { type: 'square', len: 0.03, vol: 0.03 });

  // تصفيق: مجموعة نقرات ضوضاء قصيرة متتابعة تشبه تصفيق الفصل
  function applauseSound() {
    const c = ac(); if (!c) return;
    const dur = 2.4, sr = c.sampleRate;
    const buf = c.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let k = 0; k < 90; k++) {
      const t0 = Math.pow(Math.random(), 1.4) * (dur - 0.4);
      const start = Math.floor(t0 * sr), len = Math.floor(0.025 * sr), amp = 0.25 + Math.random() * 0.5;
      for (let j = 0; j < len && start + j < d.length; j++) d[start + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len / 4));
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.7;
    const g = c.createGain(); const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.08);
    g.gain.setValueAtTime(0.6, t + dur - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(c.destination); src.start();
  }

  // ------------------------------------------------------------------
  // المؤثرات البصرية: التصفيق والقصاصات الملونة
  // ------------------------------------------------------------------
  function clap() {
    applauseSound();
    for (let i = 0; i < 16; i++) {
      const s = el('<span class="clap">👏</span>');
      s.style.left = (8 + Math.random() * 84) + '%';
      s.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      s.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
      s.style.animationDelay = (Math.random() * 0.7) + 's';
      fx.appendChild(s); setTimeout(() => s.remove(), 3300);
    }
  }
  function confetti(n = 70) {
    const st = getComputedStyle(document.body);
    const colors = [st.getPropertyValue('--accent'), st.getPropertyValue('--accent-2'), st.getPropertyValue('--good'), '#ffffff', '#f472b6'].map(c => c.trim()).filter(Boolean);
    for (let i = 0; i < n; i++) {
      const c = el('<span class="confetti"></span>');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
      c.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      c.style.animationDelay = (Math.random() * 0.35) + 's';
      fx.appendChild(c); setTimeout(() => c.remove(), 2800);
    }
  }
  const GOOD_MSG = 'أحسنتِ! 👏 إجابة صحيحة';
  const BAD_MSG = 'حاولي مرة أخرى 💜';
  function celebrate(fb, msg) {
    confetti(); successTone();
    if (fb) { fb.className = 'feedback good'; fb.textContent = msg || GOOD_MSG; }
  }
  function oops(fb, node) {
    wrongTone();
    if (fb) { fb.className = 'feedback bad'; fb.textContent = BAD_MSG; }
    if (node) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }
  }

  // ------------------------------------------------------------------
  // أدوات بناء الشرائح
  // ------------------------------------------------------------------
  // نص مع إبراز الوسوم البرمجية مثل <h1> بخط الشيفرة
  const fmt = t => esc(t).replace(/&lt;[^&\n]{1,60}?&gt;/g, m => `<span class="ic">${m}</span>`);
  const head = (title, chip) => `<div class="s-head seq"><h2 class="s-title">${esc(title || '')}</h2>${chip ? `<span class="s-chip">${esc(chip)}</span>` : ''}</div>`;
  const guide = g => g ? `<details class="guide"><summary>🧑‍🏫 دليل المعلمة</summary><div class="g-body">
      <div><b>طريقة التطبيق:</b> ${esc(g.how)}</div><div><b>الوقت:</b> ${esc(g.time)}</div><div><b>المواد:</b> ${esc(g.materials)}</div></div></details>` : '';
  const flag = s => s.review ? '<div class="review-flag">⚠️ يُرجى مراجعة المعلمة</div>' : '';
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function shuffledIdx(n) {
    const base = [...Array(n).keys()];
    if (n < 2) return base;
    let s; do { s = shuffle(base); } while (s.every((v, i) => v === i));
    return s;
  }
  const STICKY = ['#fff3a6', '#ffd6e7', '#c9f2ff', '#d9ffc9', '#e9dcff', '#ffe2c4'];
  function sticky(text, i) {
    const s = el(`<div class="sticky">${fmt(text)}</div>`);
    s.style.setProperty('--sticky', STICKY[i % STICKY.length]);
    s.style.setProperty('--rot', (Math.random() * 4 - 2).toFixed(1) + 'deg');
    return s;
  }

  // تلوين بسيط لشيفرة HTML
  function highlight(code) {
    const re = /(<!--[\s\S]*?-->)|(<\/?[\w!]+)|("[^"\n]*")|(\s[\w-]+(?==))|(\/?>)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const t = esc(m[0]);
      out += m[1] ? `<span class="cm">${t}</span>` : m[2] || m[5] ? `<span class="tg">${t}</span>` : m[3] ? `<span class="st">${t}</span>` : `<span class="at">${t}</span>`;
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }
  const looksLikeCode = t => /<\/?[a-z!][^>]*>/i.test(t) && t.length > 30;

  // مؤقت دائري قابل لإعادة الاستخدام
  const timerHTML = (label) => `<div class="timer seq"><div class="ring"><svg viewBox="0 0 230 230"><circle class="tr-bg" cx="115" cy="115" r="100"/><circle class="tr-fg" cx="115" cy="115" r="100"/></svg><div class="tr-num"></div></div>
      <div class="stack"><div class="timer-ctrl"><button class="sbtn sm" data-t="go">▶ ابدئي</button><button class="sbtn sm ghost" data-t="reset">↺ إعادة</button></div>${label ? `<div class="lesson-page-badge">${esc(label)}</div>` : ''}</div></div>`;
  const fmtTime = s => s >= 60 ? ar(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`) : ar(s);
  function makeTimer(root, seconds, onDone) {
    const C = 2 * Math.PI * 100;
    const fg = root.querySelector('.tr-fg'), num = root.querySelector('.tr-num'), go = root.querySelector('[data-t="go"]');
    fg.style.strokeDasharray = C;
    let total = seconds, left = seconds, iv = null;
    const draw = () => { num.textContent = fmtTime(left); fg.style.strokeDashoffset = C * (1 - left / total); root.classList.toggle('done', left === 0); };
    const stop = () => { clearInterval(iv); iv = null; go.textContent = left === 0 ? '▶ ابدئي' : '▶ تابعي'; };
    const start = () => {
      if (left === 0) { left = total; draw(); }
      iv = setInterval(() => {
        left = Math.max(0, left - 1); draw();
        if (left === 0) { stop(); doneTone(); if (onDone) onDone(); }
      }, 1000);
      go.textContent = '⏸ إيقاف';
    };
    go.onclick = () => (iv ? stop() : start());
    root.querySelector('[data-t="reset"]').onclick = () => { stop(); left = total; draw(); go.textContent = '▶ ابدئي'; };
    cleanups.push(() => clearInterval(iv));
    draw();
    return { set(sec) { stop(); total = left = sec; draw(); go.textContent = '▶ ابدئي'; }, start, stop };
  }

  // زر كشف إجابة داخل بطاقة
  function wireReveal(node) {
    node.querySelectorAll('[data-reveal]').forEach(b => b.onclick = () => {
      const box = b.parentElement.querySelector('.qa-a, .reveal-box, .box-out');
      if (box) { box.hidden = false; b.hidden = true; }
    });
  }
  const qaHTML = (q, a, i) => `<div class="panel qa seq" style="--i:${i}"><div class="qa-q">${fmt(q)}</div><button class="sbtn sm ghost" data-reveal>👁️ الإجابة</button><div class="qa-a" hidden>${fmt(a)}</div></div>`;

  // الوسائط البصرية (جدول، ألوان RGB، طبقات، شيفرة، وضعية الجلوس)
  function visualHTML(v) {
    if (!v) return '';
    if (v.kind === 'table') return `<table class="vtable"><tr>${v.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${v.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    if (v.kind === 'layers') return `<div class="layers">${v.items.map(i => `<div>${esc(i)}</div>`).join('')}</div>`;
    if (v.kind === 'code') return `<pre class="code">${highlight(v.value)}</pre>`;
    if (v.kind === 'rgb') return `<div class="panel mixer" data-mixer><div class="mx-prev"></div><div class="mx-sl">
        <label style="color:#ff5d73">R <input type="range" min="0" max="255" value="255" data-c="r"></label>
        <label style="color:#3ddc84">G <input type="range" min="0" max="255" value="200" data-c="g"></label>
        <label style="color:#5aa9ff">B <input type="range" min="0" max="255" value="0" data-c="b"></label>
        <div class="mx-val"></div></div></div>`;
    if (v.kind === 'posture') return `<div class="panel posture"><svg viewBox="0 0 640 440" role="img" aria-label="رسم توضيحي للجلسة الصحيحة أمام الحاسب">
        <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)">
          <rect x="70" y="120" width="150" height="100" rx="10"/><path d="M145 220v40M110 262h70"/>
          <path d="M40 262h300M60 262v150M320 262v150"/>
          <circle cx="430" cy="110" r="32"/><path d="M430 142v120M430 180l-80 50M350 230l-25 25M430 262h-70M360 262v130M360 392h-40"/>
          <path d="M470 170v220M470 262h-40M470 390h-50M500 390h-60" style="color:var(--ink-2)" stroke="var(--ink-3)"/>
        </g>
        <g stroke="var(--accent-2)" stroke-width="3" stroke-dasharray="8 8"><path d="M220 112H398"/><path d="M228 300h150"/></g>
        <text x="309" y="96" text-anchor="middle">أعلى الشاشة عند مستوى العين</text>
        <text x="303" y="330" text-anchor="middle">مسافة مناسبة</text>
        <text x="560" y="210" text-anchor="middle">ظهر مستقيم</text><text x="560" y="238" text-anchor="middle">ومسنود</text>
        <text x="250" y="425" text-anchor="middle">القدمان على الأرض</text>
      </svg></div>`;
    return '';
  }
  function mountVisual(node) {
    const mx = node.querySelector('[data-mixer]');
    if (mx) {
      const ins = [...mx.querySelectorAll('input')];
      const paint = () => {
        const [r, g, b] = ins.map(i => +i.value);
        mx.querySelector('.mx-prev').style.background = `rgb(${r},${g},${b})`;
        mx.querySelector('.mx-val').textContent = `RGB(${r}, ${g}, ${b})`;
      };
      ins.forEach(i => i.oninput = paint); paint();
    }
    // تصغير الشيفرة إن كانت أعرض من مكانها
    node.querySelectorAll('pre.code').forEach(pre => {
      let f = 26;
      while (pre.scrollWidth > pre.clientWidth + 1 && f > 15) { f -= 1; pre.style.fontSize = f + 'px'; }
    });
  }

  // ------------------------------------------------------------------
  // السحب والإفلات (بالفأرة أو اللمس) + بديل النقر: اختاري البطاقة ثم مكانها
  // ------------------------------------------------------------------
  function enableDrag(root, onDrop) {
    let sel = null;
    const clearOver = () => root.querySelectorAll('.over').forEach(z => z.classList.remove('over'));
    root.addEventListener('pointerdown', e => {
      const chip = e.target.closest('.chip');
      if (!chip || chip.classList.contains('ok') || !root.contains(chip)) return;
      e.preventDefault();
      const s = scale(), sr = stage.getBoundingClientRect(), cr = chip.getBoundingClientRect();
      const offX = (e.clientX - cr.left) / s, offY = (e.clientY - cr.top) / s;
      const sx = e.clientX, sy = e.clientY;
      let ghost = null;
      const move = ev => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = chip.cloneNode(true); ghost.classList.remove('sel'); ghost.classList.add('ghost');
          ghost.style.width = cr.width / s + 'px';
          stage.appendChild(ghost); chip.style.opacity = '.35';
        }
        ghost.style.left = ((ev.clientX - sr.left) / s - offX) + 'px';
        ghost.style.top = ((ev.clientY - sr.top) / s - offY) + 'px';
        clearOver();
        const z = zoneAt(ev); if (z) z.classList.add('over');
      };
      const up = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        clearOver();
        if (!ghost) { // نقرة: تحديد البطاقة
          if (sel === chip) { chip.classList.remove('sel'); sel = null; }
          else { if (sel) sel.classList.remove('sel'); sel = chip; chip.classList.add('sel'); }
          return;
        }
        ghost.remove(); chip.style.opacity = '';
        const z = zoneAt(ev);
        if (z) { if (sel) sel.classList.remove('sel'); sel = null; onDrop(chip, z); }
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    root.addEventListener('click', e => {
      if (e.target.closest('.chip')) return;
      const z = e.target.closest('[data-zone]');
      if (z && sel && root.contains(z)) { const c = sel; sel.classList.remove('sel'); sel = null; onDrop(c, z); }
    });
    function zoneAt(ev) {
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      const z = t && t.closest('[data-zone]');
      return z && root.contains(z) ? z : null;
    }
  }
  function rejectChip(chip) { chip.classList.remove('no'); void chip.offsetWidth; chip.classList.add('no'); setTimeout(() => chip.classList.remove('no'), 500); wrongTone(); }

  // ------------------------------------------------------------------
  // قرعة الأسماء 🎲 (لا يتكرر الاسم حتى تُختار كل الطالبات)
  // ------------------------------------------------------------------
  let drawEl = null, spinning = false, picked = null;
  const drawKey = () => 'tq_drawn_' + classId;
  function openDraw() {
    if (!cls) { toast('اختاري فصلًا من المكتبة أولًا لاستخدام القرعة', 'err'); return; }
    if (!DB.listStudents(classId).length) { toast('لا توجد طالبات في هذا الفصل بعد – أضيفيهن من لوحة المعلمة', 'err'); return; }
    if (!drawEl) {
      drawEl = el(`<div class="draw-back"><div class="draw-box">
        <h3>🎲 قرعة الأسماء – ${esc(cls.name)}</h3>
        <div class="draw-name">…</div>
        <div class="draw-acts" data-after hidden>
          <button class="sbtn sm" data-a="point">+١ نقطة</button>
          <button class="sbtn sm" data-a="correct">إجابة صحيحة ✓</button>
        </div>
        <div class="draw-acts" style="margin-top:18px">
          <button class="sbtn sm" data-a="again">🎲 سحب جديد</button>
          <button class="sbtn sm ghost" data-a="reset">↺ إعادة القرعة</button>
          <button class="sbtn sm ghost" data-a="close">✕ إغلاق</button>
        </div>
        <div class="draw-info"></div></div></div>`);
      drawEl.addEventListener('mousedown', e => { if (e.target === drawEl) closeDraw(); });
      drawEl.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'close') closeDraw();
        else if (a === 'again') spin();
        else if (a === 'reset') { DB.ls.set(drawKey(), []); toast('بدأت جولة قرعة جديدة لكل الطالبات'); updateInfo(); }
        else if ((a === 'point' || a === 'correct') && picked) {
          DB.addParticipation({ student_id: picked.id, class_id: classId, lesson_id: lesson.id, type: a, value: 1 });
          b.disabled = true; saved();
          if (a === 'correct') { confetti(40); successTone(); }
        }
      });
      document.body.appendChild(drawEl);
    }
    spin();
  }
  function closeDraw() { if (drawEl) { drawEl.remove(); drawEl = null; } spinning = false; picked = null; }
  function updateInfo(poolLeft) {
    if (!drawEl) return;
    const all = DB.listStudents(classId);
    const drawn = new Set(DB.ls.get(drawKey(), []));
    const left = poolLeft != null ? poolLeft : all.filter(s => !drawn.has(s.id)).length;
    drawEl.querySelector('.draw-info').textContent = `تبقّى ${ar(left)} من ${ar(all.length)} طالبة في هذه الجولة`;
  }
  function spin() {
    if (spinning || !drawEl) return;
    const all = DB.listStudents(classId);
    let drawn = new Set(DB.ls.get(drawKey(), []).filter(id => all.some(s => s.id === id)));
    let pool = all.filter(s => !drawn.has(s.id));
    if (!pool.length) { drawn = new Set(); pool = all; toast('اختيرت كل الطالبات – بدأت جولة جديدة'); }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const nameEl = drawEl.querySelector('.draw-name');
    const after = drawEl.querySelector('[data-after]');
    after.hidden = true; after.querySelectorAll('button').forEach(b => b.disabled = false);
    spinning = true; picked = null;
    nameEl.className = 'draw-name spin';
    let delay = 45, steps = 0;
    const src = pool.length > 1 ? pool : all;
    (function step() {
      if (!drawEl) return;
      nameEl.textContent = src[Math.floor(Math.random() * src.length)].full_name;
      tick();
      steps++; delay *= 1.11;
      if (steps < 26) { setTimeout(step, delay); return; }
      nameEl.textContent = pick.full_name;
      nameEl.className = 'draw-name land';
      tones([660, 990], { step: 0.09, len: 0.2 });
      drawn.add(pick.id); DB.ls.set(drawKey(), [...drawn]);
      DB.addParticipation({ student_id: pick.id, class_id: classId, lesson_id: lesson.id, type: 'picked', value: 1 });
      picked = pick; spinning = false; after.hidden = false;
      updateInfo(pool.length - 1);
    })();
  }

  // ------------------------------------------------------------------
  // أنواع الشرائح: كل دالة ترجع { cls, html, mount(node) }
  // mount قد ترجع { next() } للكشف التدريجي قبل الانتقال للشريحة التالية
  // ------------------------------------------------------------------
  const R = {};

  R.cover = () => ({
    cls: 'cover',
    html: `<div class="c-icon seq" ${unit.cover.icon.length > 2 ? 'style="font-size:96px"' : ''}>${esc(unit.cover.icon)}</div>
      <div class="c-kicker seq">${esc(unit.cover.kicker)}</div>
      <h1 class="c-title seq">${esc(unit.title)}</h1>
      <div class="c-tag seq">${esc(unit.cover.tagline)}</div>`,
  });

  R.welcome = () => ({
    cls: 'center welcome',
    html: `<span class="s-chip seq">${esc(unit.cover.kicker)} · ${esc(unit.title)}</span>
      <h1 class="w-lesson seq">${esc(lesson.title)}</h1>
      <div class="w-meta seq">
        ${profile.full_name ? `<span>👩‍🏫 ${esc(profile.full_name)}</span>` : ''}
        ${profile.school_name ? `<span>🏫 ${esc(profile.school_name)}</span>` : ''}
        ${cls ? `<span>👭 ${esc(cls.name)}</span>` : ''}
        <span>📖 الكتاب ص ${ar(lesson.page)}</span>
      </div>`,
  });

  R.warmup = s => ({
    html: head(s.title || 'تنشيط سريع', '🔥 تهيئة') + `<div class="s-body"><div class="grid2">
        <div class="panel seq center" style="display:flex;flex-direction:column;gap:26px">
          <div class="s-big" style="font-size:46px">من ستبدأ المراجعة اليوم؟ 🎯</div>
          <button class="sbtn" data-draw>🎲 قرعة الأسماء</button>
        </div>
        <div class="stack">${(s.review || []).map((r, i) => qaHTML(r.q, r.a, i)).join('')}</div>
      </div></div>`,
    mount(node) { wireReveal(node); node.querySelector('[data-draw]').onclick = openDraw; },
  });

  R.objectives = () => ({
    html: head('أهداف الدرس 🎯', 'في نهاية الدرس ستكونين قادرة على') +
      `<div class="s-body"><div class="objectives">${lesson.objectives.map(o => `<div class="obj panel seq">${fmt(o)}</div>`).join('')}</div></div>`,
  });

  R.hook = s => ({
    html: head(s.title || 'ماذا تتوقعين؟ 🤔', '💭 لحظة تفكير') + `<div class="s-body center">
        <div class="s-big seq">${fmt(s.question)}</div>
        <div style="margin-top:36px" class="seq"><button class="sbtn" data-reveal>✨ اكشفي</button><div class="panel reveal-box" hidden>${fmt(s.reveal)}</div></div>
      </div>`,
    mount(node) {
      wireReveal(node);
      const btn = node.querySelector('[data-reveal]');
      return { next() { if (btn.hidden) return false; btn.click(); return true; } };
    },
  });

  R.content = s => {
    const pts = `<ul class="points" ${s.reveal ? 'data-reveal-list' : ''}>${s.points.map(p => `<li class="${s.reveal ? 'hidden-pt' : 'seq'}">${fmt(p)}</li>`).join('')}</ul>`;
    const vis = visualHTML(s.visual);
    return {
      html: head(s.title, s.reveal ? '👆 انقري لكشف النقاط' : '') + `<div class="s-body">
          ${vis ? `<div class="grid2" style="align-items:center"><div>${pts}</div><div class="seq">${vis}</div></div>` : pts}
          ${s.note ? `<div class="note seq">💡 ${fmt(s.note)}</div>` : ''}
        </div>`,
      mount(node) {
        mountVisual(node);
        const list = node.querySelector('[data-reveal-list]');
        if (!list) return;
        const reveal = () => {
          const li = list.querySelector('.hidden-pt'); if (!li) return false;
          li.classList.remove('hidden-pt'); li.classList.add('shown'); return true;
        };
        list.style.cursor = 'pointer';
        list.onclick = reveal;
        return { next: reveal };
      },
    };
  };

  R.flipcards = s => {
    const n = s.cards.length;
    const cols = n === 4 ? 2 : Math.min(n, 3);
    return {
      html: head(s.title, s.strategy ? '🃏 ' + s.strategy : '') + guide(s.guide) +
        `<div class="flips" style="--cols:${cols}">${s.cards.map(c => `<div class="flip seq" tabindex="0"><div class="flip-in">
          <div class="flip-face flip-front"><div class="fi">${esc(c.icon || '❓')}</div><div class="ft">${fmt(c.front)}</div></div>
          <div class="flip-face flip-back">${fmt(c.back)}</div></div></div>`).join('')}</div>`,
      mount(node) { node.querySelectorAll('.flip').forEach(f => f.onclick = () => { f.classList.toggle('on'); tick(); }); },
    };
  };

  R.dragdrop = s => {
    const fb = '<div class="feedback"></div>';
    if (s.mode === 'order') {
      const order = shuffledIdx(s.steps.length);
      return {
        html: head(s.title, '🔢 ' + (s.strategy || 'الترتيب')) + guide(s.guide) + `<div class="s-body">
            <p class="muted seq" style="font-size:26px;margin:0 0 14px">انقري على الخطوات بالترتيب الصحيح</p>
            <div class="order-list">${order.map(i => `<div class="order-item seq" data-i="${i}"><span class="on">؟</span><span>${fmt(s.steps[i])}</span></div>`).join('')}</div>${fb}</div>`,
        mount(node) {
          let next = 0;
          const f = node.querySelector('.feedback');
          node.querySelectorAll('.order-item').forEach(it => it.onclick = () => {
            if (it.classList.contains('done')) return;
            if (+it.dataset.i === next) {
              it.classList.add('done'); it.querySelector('.on').textContent = ar(next + 1); next++; tick();
              if (next === s.steps.length) celebrate(f);
            } else { it.classList.remove('no'); void it.offsetWidth; it.classList.add('no'); oops(f); }
          });
        },
      };
    }
    if (s.mode === 'match') {
      const order = shuffledIdx(s.pairs.length);
      return {
        html: head(s.title, '🧩 ' + (s.strategy || 'المطابقة')) + guide(s.guide) + `<div class="s-body dd">
            <div class="dd-pool seq">${order.map(i => `<span class="chip" data-key="${i}">${fmt(s.pairs[i].b)}</span>`).join('')}</div>
            <div class="match">${s.pairs.map((p, i) => `<div class="m-left seq">${esc(p.a)}</div><div class="m-slot seq" data-zone="${i}"></div>`).join('')}</div>${fb}</div>`,
        mount(node) {
          const f = node.querySelector('.feedback');
          let left = s.pairs.length;
          enableDrag(node.querySelector('.dd'), (chip, zone) => {
            if (chip.dataset.key === zone.dataset.zone && !zone.children.length) {
              zone.appendChild(chip); chip.classList.add('ok'); tick();
              if (--left === 0) celebrate(f); else f.textContent = '';
            } else { rejectChip(chip); f.className = 'feedback bad'; f.textContent = BAD_MSG; }
          });
        },
      };
    }
    // التصنيف sort
    const items = shuffle(s.items.map((it, i) => Object.assign({ i }, it)));
    return {
      html: head(s.title, '🗂️ ' + (s.strategy || 'التصنيف')) + guide(s.guide) + `<div class="s-body dd">
          <div class="dd-pool seq">${items.map(it => `<span class="chip" data-key="${it.cat}">${fmt(it.text)}</span>`).join('')}</div>
          <div class="buckets" style="--cols:${s.categories.length}">${s.categories.map((c, i) => `<div class="bucket seq" data-zone="${i}"><h4>${esc(c)}</h4><div class="chips"></div></div>`).join('')}</div>${fb}</div>`,
      mount(node) {
        const f = node.querySelector('.feedback');
        let left = s.items.length;
        enableDrag(node.querySelector('.dd'), (chip, zone) => {
          if (chip.dataset.key === zone.dataset.zone) {
            zone.querySelector('.chips').appendChild(chip); chip.classList.add('ok'); tick();
            if (--left === 0) celebrate(f); else f.textContent = '';
          } else { rejectChip(chip); f.className = 'feedback bad'; f.textContent = BAD_MSG; }
        });
      },
    };
  };

  R.mcq = s => ({
    html: `<div class="s-head seq"><span class="s-chip">🧠 اختاري الإجابة الصحيحة</span></div>
      <div class="q-text seq">${fmt(s.question)}</div>
      <div class="opts">${s.options.map((o, i) => `<button class="opt seq" data-i="${i}"><span class="ol">${LET[i]}</span><span>${fmt(o)}</span></button>`).join('')}</div>
      <div class="feedback"></div><div class="explain"></div>`,
    mount(node) {
      const f = node.querySelector('.feedback'); let done = false;
      node.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (done) return;
        if (+b.dataset.i === s.answer) {
          done = true; b.classList.add('right'); celebrate(f);
          if (s.explain) node.querySelector('.explain').textContent = s.explain;
        } else { b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); oops(f); }
      });
    },
  });

  R.truefalse = s => ({
    html: head(s.title || 'صح أم خطأ؟', '✔️ ✖️') + `<div class="s-body"><div class="tf-list">${s.statements.map((t, i) => `
        <div class="tf seq" data-i="${i}"><div class="tt">${fmt(t.text)}<span class="tx"></span></div>
          <button data-v="1" aria-label="صح">✔️</button><button data-v="0" aria-label="خطأ">✖️</button></div>`).join('')}</div>
        <div class="feedback"></div></div>`,
    mount(node) {
      const f = node.querySelector('.feedback'); let left = s.statements.length;
      node.querySelectorAll('.tf').forEach(row => {
        const t = s.statements[+row.dataset.i];
        row.querySelectorAll('button').forEach(b => b.onclick = () => {
          if (row.classList.contains('ok')) return;
          row.querySelectorAll('button').forEach(x => x.classList.remove('picked'));
          b.classList.add('picked');
          if ((b.dataset.v === '1') === t.answer) {
            row.classList.remove('no'); row.classList.add('ok');
            row.querySelector('.tx').textContent = t.explain || '';
            if (--left === 0) celebrate(f); else { successTone(); confetti(18); f.className = 'feedback good'; f.textContent = GOOD_MSG; }
          } else {
            row.classList.add('no'); oops(f, row);
            row.querySelector('.tx').textContent = BAD_MSG;
          }
        });
      });
    },
  });

  R.brainstorm = s => ({
    html: head(s.title || 'عصف ذهني ⚡', '⚡ عصف ذهني') + guide(s.guide) + `<div class="s-body">
        <div class="prompt seq">${fmt(s.prompt)}</div>
        <div class="bs-input seq"><input placeholder="اكتبي فكرة واضغطي Enter…" aria-label="فكرة جديدة"><button class="sbtn sm">➕ إضافة</button>${s.seeds && s.seeds.length ? '<button class="sbtn sm ghost" data-seeds>💡 أمثلة مقترحة</button>' : ''}</div>
        <div class="stickies"></div></div>`,
    mount(node) {
      const box = node.querySelector('.stickies'), inp = node.querySelector('.bs-input input');
      let n = 0;
      const add = t => { t = String(t).trim(); if (t) box.appendChild(sticky(t, n++)); };
      node.querySelector('.bs-input .sbtn').onclick = () => { add(inp.value); inp.value = ''; inp.focus(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { add(inp.value); inp.value = ''; } };
      const sb = node.querySelector('[data-seeds]');
      if (sb) sb.onclick = () => { s.seeds.forEach(add); sb.hidden = true; };
    },
  });

  R.tps = s => {
    const ph = [['think', '🤔', 'فكّري', s.think || 60], ['pair', '👭', 'زاوجي', s.pair || 90], ['share', '📢', 'شاركي', s.share || 90]];
    return {
      html: head(s.title || 'فكّري – زاوجي – شاركي', '🤝 فكّري – زاوجي – شاركي') + guide(s.guide) + `<div class="s-body">
          <div class="prompt seq">${fmt(s.prompt)}</div>
          <div class="phases seq">${ph.map((p, i) => `<div class="phase ${i === 0 ? 'on' : ''}" data-p="${i}"><span class="pi">${p[1]}</span>${p[2]} · ${fmtTime(p[3])}${p[3] < 60 ? ' ث' : ' د'}</div>`).join('')}</div>
          ${timerHTML()}</div>`,
      mount(node) {
        let k = 0;
        const phases = [...node.querySelectorAll('.phase')];
        const setPhase = i => { k = i; phases.forEach((p, j) => p.classList.toggle('on', j === i)); t.set(ph[i][3]); };
        const t = makeTimer(node.querySelector('.timer'), ph[0][3], () => { if (k < 2) setPhase(k + 1); });
        phases.forEach((p, i) => p.onclick = () => setPhase(i));
      },
    };
  };

  R.plickers = s => {
    const k = plkSlides.indexOf(s) + 1;
    return {
      html: `<div class="s-head seq"><span class="s-chip">📊 سؤال بليكرز ${ar(k)} من ${ar(plkSlides.length)}</span><span class="s-chip">ارفعي بطاقتك 🪪</span></div>
        <div class="plk-q seq">${fmt(s.question)}</div>
        <div class="plk-opts">${s.options.map((o, i) => `<div class="plk-opt seq" data-l="${LAT[i]}"><span class="L">${LAT[i]}<small>${LET[i]}</small></span><span>${fmt(o)}</span></div>`).join('')}</div>
        <div class="plk-bar seq">
          <span class="plk-mini-timer"></span>
          <button class="sbtn sm" data-a="timer">▶ العدّ التنازلي</button>
          <button class="sbtn sm ghost" data-a="reveal">👁️ كشف الإجابة</button>
          <button class="sbtn sm" data-a="record">📝 تسجيل النتائج</button>
          <span class="plk-sum"></span>
        </div>`,
      mount(node) {
        const T = s.seconds || 30; let left = T, iv = null;
        const tm = node.querySelector('.plk-mini-timer'), tb = node.querySelector('[data-a="timer"]');
        const draw = () => { tm.textContent = fmtTime(left); };
        draw();
        tb.onclick = () => {
          if (iv) { clearInterval(iv); iv = null; tb.textContent = '▶ تابعي'; return; }
          if (left === 0) left = T;
          tb.textContent = '⏸ إيقاف';
          iv = setInterval(() => { left--; draw(); if (left <= 0) { clearInterval(iv); iv = null; tb.textContent = '▶ العدّ التنازلي'; doneTone(); } }, 1000);
        };
        cleanups.push(() => clearInterval(iv));
        node.querySelector('[data-a="reveal"]').onclick = () => {
          const o = node.querySelector(`.plk-opt[data-l="${s.answer}"]`);
          o.classList.toggle('correct');
          if (o.classList.contains('correct')) successTone();
        };
        const sum = node.querySelector('.plk-sum');
        const refresh = () => {
          const r = cls ? Plickers.summary(classId, lesson.id, s.id) : null;
          sum.textContent = r && r.n ? `✓ سُجّلت ${ar(r.n)} إجابة · ${ar(r.pct)}٪ صحيحة` : '';
        };
        const open = results => Plickers.open({ classId, lessonId: lesson.id, q: s, results, onSaved: refresh });
        node.querySelector('[data-a="record"]').onclick = () => open(false);
        sum.onclick = () => open(true);
        refresh();
      },
    };
  };

  R.challenge = s => {
    const code = s.answer && looksLikeCode(s.answer);
    return {
      html: head(s.title || 'تحدّي الدقيقة ⏱️', '⏱️ تحدٍّ') + `<div class="s-body">
          <div class="prompt seq">${fmt(s.prompt)}</div>
          <div class="grid2" style="align-items:center">${timerHTML()}
            <div class="seq">${s.answer ? `<button class="sbtn ghost" data-reveal>👁️ الإجابة النموذجية</button>
              <div class="reveal-box" hidden>${code ? `<pre class="code">${highlight(s.answer.replace(/></g, '>\n<'))}</pre>` : `<div class="panel">${fmt(s.answer)}</div>`}</div>` : ''}</div>
          </div></div>`,
      mount(node) { makeTimer(node.querySelector('.timer'), s.seconds || 60); wireReveal(node); mountVisual(node); },
    };
  };

  R.nationalValue = s => ({
    html: head(s.title, '🇸🇦 قيمة وطنية') + `<div class="s-body value-card">
        <div class="panel scn-text seq">${fmt(s.scenario)}</div>
        <div class="reflect seq">💭 ${fmt(s.reflect)}</div></div>` + flag(s),
  });

  R.religiousValue = s => ({
    html: head(s.value, '🕌 قيمة دينية') + `<div class="s-body value-card">
        ${s.quote ? `<div class="quote seq">${esc(s.quote)}${s.ref ? `<span class="quote-ref">${esc(s.ref)}</span>` : ''}</div>` : ''}
        ${s.text ? `<div class="scn-text seq">${fmt(s.text)}</div>` : ''}
        <div class="reflect seq">💭 ${fmt(s.reflect)}</div></div>` + flag(s),
  });

  R.review = s => ({
    html: head(s.title || 'خلاصة الدرس', '📌 مراجعة') + `<div class="s-body"><ul class="points">${s.points.map(p => `<li class="seq">${fmt(p)}</li>`).join('')}</ul></div>`,
  });

  R.exitTicket = s => ({
    html: head('بطاقة الخروج 🎟️', '✍️ قبل أن تغادري') + `<div class="s-body">
        <div class="grid3">${s.prompts.map((p, i) => `<div class="panel seq" style="font-size:30px;font-weight:700"><span class="s-chip" style="font-size:20px;margin-bottom:10px">${ar(i + 1)}</span><div>${fmt(p)}</div></div>`).join('')}</div>
        <div class="seq" style="margin-top:30px">
          <div class="prompt" style="text-align:center;font-size:34px;margin-bottom:14px">🚦 إشارة المرور: كيف تقيّمين فهمك؟</div>
          <div class="traffic">
            <button data-k="g"><span class="lt" style="background:#22c55e"></span>فهمت تمامًا<span class="count">٠</span></button>
            <button data-k="y"><span class="lt" style="background:#facc15"></span>أحتاج مراجعة<span class="count">٠</span></button>
            <button data-k="r"><span class="lt" style="background:#ef4444"></span>لم أفهم بعد<span class="count">٠</span></button>
          </div></div></div>`,
    mount(node) {
      node.querySelectorAll('.traffic button').forEach(b => {
        let n = 0;
        b.onclick = () => { n++; b.querySelector('.count').textContent = ar(n); b.classList.add('on'); tick(); };
        b.oncontextmenu = e => { e.preventDefault(); n = Math.max(0, n - 1); b.querySelector('.count').textContent = ar(n); };
      });
    },
  });

  R.closing = s => {
    const taught = cls && DB.isTaught(classId, lesson.id);
    return {
      cls: 'center closing',
      html: `<div class="c-msg seq">${esc(s.message)}</div><div class="c-sub seq">${esc(s.sub || '')}</div>
        <div class="acts seq">
          ${cls ? `<button class="sbtn" data-a="done" ${taught ? 'disabled' : ''}>${taught ? '✔️ الدرس مسجّل كمُنجز' : '✓ سجّلي الدرس كمُنجز لهذا الفصل'}</button>` : ''}
          <button class="sbtn ghost" data-a="clap">👏 تصفيق ختامي</button>
          <button class="sbtn ghost" data-a="home">🏠 مكتبة الدروس</button>
        </div>`,
      mount(node) {
        const d = node.querySelector('[data-a="done"]');
        if (d) d.onclick = () => { DB.markTaught(classId, lesson.id); saved(); d.textContent = '✔️ الدرس مسجّل كمُنجز'; d.disabled = true; confetti(); };
        node.querySelector('[data-a="clap"]').onclick = clap;
        node.querySelector('[data-a="home"]').onclick = goHome;
      },
    };
  };

  R.mysterybox = s => ({
    html: head(s.title, '🎁 ' + (s.strategy || 'الصندوق الغامض')) + guide(s.guide) + `<div class="s-body">
        <div class="boxes" style="flex:none">${s.boxes.map((b, i) => `<button class="mbox seq" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
        <div class="panel box-out" hidden></div></div>`,
    mount(node) {
      const out = node.querySelector('.box-out');
      node.querySelectorAll('.mbox').forEach(b => b.onclick = () => {
        b.classList.add('used');
        out.hidden = false;
        out.innerHTML = `<b>${esc(s.boxes[+b.dataset.i].label)} ·</b> ${fmt(s.boxes[+b.dataset.i].content)}`;
        out.style.animation = 'none'; void out.offsetWidth; out.style.animation = '';
        tones([523, 784], { step: 0.08 });
      });
    },
  });

  R.tictactoe = s => ({
    html: head(s.title, '❌⭕ ' + (s.strategy || 'إكس-أو')) + guide(s.guide) + `<div class="s-body"><div style="display:flex;gap:44px;flex:1;min-height:0">
        <div class="ttt seq" style="width:480px">${s.cells.map((c, i) => `<button data-i="${i}">${ar(i + 1)}</button>`).join('')}</div>
        <div class="ttt-side seq">
          <div class="score"><span>❌ فريق X: <b data-s="x">٠</b></span><span>⭕ فريق O: <b data-s="o">٠</b></span></div>
          <div class="panel stack" data-q><div class="ttt-q muted">اختاري مربعًا لعرض سؤاله</div></div>
          <div class="feedback" style="margin-top:0"></div>
          <button class="sbtn sm ghost" data-a="reset" style="align-self:flex-start">↺ جولة جديدة</button>
        </div></div></div>`,
    mount(node) {
      const cells = [...node.querySelectorAll('.ttt button')];
      const qBox = node.querySelector('[data-q]'), f = node.querySelector('.feedback');
      const score = { x: 0, o: 0 };
      let board = Array(9).fill(null), over = false;
      const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      cells.forEach(b => b.onclick = () => {
        const i = +b.dataset.i; if (board[i] || over) return;
        cells.forEach(x => x.style.outline = ''); b.style.outline = '4px solid var(--accent)';
        const c = s.cells[i];
        qBox.innerHTML = `<div class="ttt-q">${fmt(c.q)}</div><button class="sbtn sm ghost" data-reveal>👁️ الإجابة</button><div class="qa-a" hidden>${fmt(c.a)}</div>
          <div class="row"><button class="sbtn sm" data-t="x">❌ أصاب فريق X</button><button class="sbtn sm" data-t="o">⭕ أصاب فريق O</button><button class="sbtn sm ghost" data-t="">لم يُجب أحد</button></div>`;
        wireReveal(qBox);
        qBox.querySelectorAll('[data-t]').forEach(t => t.onclick = () => {
          b.style.outline = '';
          const team = t.dataset.t;
          qBox.innerHTML = '<div class="ttt-q muted">اختاري مربعًا آخر</div>';
          if (!team) return;
          board[i] = team; b.textContent = team === 'x' ? 'X' : 'O'; b.classList.add(team); successTone();
          if (lines.some(l => l.every(j => board[j] === team))) {
            over = true; score[team]++;
            node.querySelector(`[data-s="${team}"]`).textContent = ar(score[team]);
            celebrate(f, `🏆 فاز فريق ${team === 'x' ? 'X' : 'O'}!`);
          } else if (board.every(Boolean)) { over = true; f.className = 'feedback'; f.textContent = 'تعادل! 🤝'; }
        });
      });
      node.querySelector('[data-a="reset"]').onclick = () => {
        board = Array(9).fill(null); over = false; f.textContent = '';
        cells.forEach((b, i) => { b.textContent = ar(i + 1); b.className = ''; b.style.outline = ''; });
        qBox.innerHTML = '<div class="ttt-q muted">اختاري مربعًا لعرض سؤاله</div>';
      };
    },
  });

  R.fourcorners = s => {
    const marks = ['🔴', '🔵', '🟢', '🟡'];
    return {
      html: head(s.title, '🏁 ' + (s.strategy || 'الأركان الأربعة')) + guide(s.guide) + `<div class="s-body">
          <div class="prompt seq">${fmt(s.question)}</div>
          <div class="corners">${s.corners.map((c, i) => `<div class="corner seq" data-i="${i}"><span class="cn">${marks[i]}</span><span>${fmt(c)}</span></div>`).join('')}</div>
          <div class="seq" style="margin-top:22px;text-align:center">${s.answer != null ? '<button class="sbtn" data-a="reveal">👁️ كشف الإجابة</button>' : '<span class="s-chip">💬 سؤال رأي: لا توجد إجابة خاطئة</span>'}</div>
          <div class="feedback" style="margin-top:10px"></div></div>`,
      mount(node) {
        const b = node.querySelector('[data-a="reveal"]');
        if (b) b.onclick = () => { node.querySelector(`.corner[data-i="${s.answer}"]`).classList.add('right'); b.hidden = true; celebrate(node.querySelector('.feedback'), 'الركن الصحيح ✓'); };
      },
    };
  };

  R.escape = s => ({
    html: head(s.title, '🔐 ' + (s.strategy || 'غرفة الهروب')) + guide(s.guide) + `<div class="s-body">
        <div class="scn-text seq" style="font-size:30px">${fmt(s.story)}</div>
        <div class="locks seq">${s.locks.map((l, i) => `<div class="lock ${i === 0 ? 'cur' : ''}">🔒</div>`).join('')}</div>
        <div class="panel seq" data-box>
          <div class="prompt" style="font-size:36px;margin:0" data-q></div>
          <div class="esc-in"><input aria-label="الإجابة" placeholder="اكتبي الإجابة هنا"><button class="sbtn" data-a="try">افتحي 🔑</button><button class="sbtn ghost" data-a="hint">💡 تلميح</button></div>
          <div class="esc-hint"></div>
        </div></div>`,
    mount(node) {
      const locks = [...node.querySelectorAll('.lock')];
      const q = node.querySelector('[data-q]'), inp = node.querySelector('.esc-in input'), hint = node.querySelector('.esc-hint'), box = node.querySelector('[data-box]');
      let k = 0;
      const norm = t => en(String(t)).toLowerCase().replace(/[\s‏‎]+/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      const show = () => { q.innerHTML = `القفل ${ar(k + 1)}: ${fmt(s.locks[k].q)}`; inp.value = ''; hint.textContent = ''; };
      const tryIt = () => {
        if (norm(inp.value) === norm(s.locks[k].answer)) {
          locks[k].classList.remove('cur'); locks[k].classList.add('open'); locks[k].textContent = '🔓';
          successTone(); k++;
          if (k === s.locks.length) { box.innerHTML = `<div class="esc-final">${fmt(s.final || '🎉 تم الهروب!')}</div>`; confetti(120); applauseSound(); return; }
          locks[k].classList.add('cur'); show();
        } else { oops(null, box); hint.textContent = BAD_MSG; }
      };
      node.querySelector('[data-a="try"]').onclick = tryIt;
      inp.onkeydown = e => { if (e.key === 'Enter') tryIt(); };
      node.querySelector('[data-a="hint"]').onclick = () => { hint.textContent = '💡 ' + (s.locks[k].hint || 'لا يوجد تلميح'); };
      show();
    },
  });

  R.kwl = s => {
    const cols = [['k', 'K', 'ماذا أعرف؟'], ['w', 'W', 'ماذا أريد أن أعرف؟'], ['l', 'L', 'ماذا تعلّمت؟']];
    return {
      html: head(s.title, '📋 ' + (s.strategy || 'جدول KWL')) + guide(s.guide) +
        `<div class="kwl">${cols.map(c => `<div class="kwl-col seq" data-c="${c[0]}"><h4>${c[1]}<small>${c[2]}</small></h4><div class="stack" style="gap:10px"></div><input placeholder="➕ أضيفي واضغطي Enter" aria-label="${c[2]}"></div>`).join('')}</div>`,
      mount(node) {
        let n = 0;
        node.querySelectorAll('.kwl-col').forEach(col => {
          const box = col.querySelector('.stack');
          (s[col.dataset.c] || []).forEach(t => box.appendChild(sticky(t, n++)));
          const inp = col.querySelector('input');
          inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) { box.appendChild(sticky(inp.value.trim(), n++)); inp.value = ''; } };
        });
      },
    };
  };

  R.hotseat = s => ({
    html: head(s.title, '🔥 ' + (s.strategy || 'الكرسي الساخن')) + guide(s.guide) + `<div class="s-body">
        <div class="panel hs-role seq">🪑 ${fmt(s.role)}</div>
        <div class="hs-list">${s.questions.map(q => `<div class="panel" hidden>❓ ${fmt(q)}</div>`).join('')}</div>
        <div class="seq" style="margin-top:20px"><button class="sbtn sm" data-a="next">❓ السؤال التالي</button></div></div>`,
    mount(node) {
      const btn = node.querySelector('[data-a="next"]');
      const reveal = () => {
        const q = node.querySelector('.hs-list [hidden]'); if (!q) return false;
        q.hidden = false; q.style.animation = 'popIn .3s ease both'; tick();
        if (!node.querySelector('.hs-list [hidden]')) btn.hidden = true;
        return true;
      };
      btn.onclick = reveal;
      return { next: reveal };
    },
  });

  R.scenario = s => ({
    html: head(s.title, '🤔 ' + (s.strategy || 'ماذا ستفعلين؟')) + guide(s.guide) + `<div class="s-body">
        <div class="panel scn-text seq" style="margin-bottom:22px">${fmt(s.scenario)}</div>
        <div class="opts" style="grid-template-columns:1fr">${s.options.map((o, i) => `<button class="opt seq" data-i="${i}" style="font-size:30px;padding:16px 24px"><span class="ol">${LET[i]}</span><span>${fmt(o.text)}</span></button>`).join('')}</div>
        <div class="explain" style="margin-top:18px;font-size:30px;font-weight:700"></div></div>`,
    mount(node) {
      const ex = node.querySelector('.explain');
      node.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const o = s.options[+b.dataset.i];
        ex.textContent = o.feedback || '';
        if (o.best) { b.classList.add('right'); ex.style.color = 'var(--good)'; confetti(); successTone(); }
        else { b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); ex.style.color = 'var(--ink-2)'; wrongTone(); }
      });
    },
  });

  R.numberedheads = s => ({
    html: head(s.title, '🔢 ' + (s.strategy || 'الرؤوس المرقمة')) + guide(s.guide) + `<div class="s-body">
        <div class="prompt seq">${fmt(s.question)}</div>
        <div class="grid3" style="align-items:center">
          ${timerHTML('⏳ وقت التشاور')}
          <div class="seq stack" style="align-items:center"><div class="nh-num">؟</div><button class="sbtn sm" data-a="num">🎲 رقم عشوائي (١–٤)</button></div>
          <div class="seq">${s.answer ? `<button class="sbtn ghost" data-reveal>👁️ الإجابة</button><div class="panel reveal-box" hidden>${fmt(s.answer)}</div>` : ''}</div>
        </div></div>`,
    mount(node) {
      makeTimer(node.querySelector('.timer'), s.seconds || 120);
      wireReveal(node);
      const num = node.querySelector('.nh-num');
      node.querySelector('[data-a="num"]').onclick = () => {
        let i = 0; num.classList.add('spin');
        const iv = setInterval(() => {
          num.textContent = ar(1 + Math.floor(Math.random() * 4)); tick();
          if (++i > 14) { clearInterval(iv); num.classList.remove('spin'); tones([660, 990], { step: 0.09 }); }
        }, 70);
        cleanups.push(() => clearInterval(iv));
      };
    },
  });

  R.mindmap = s => ({
    html: head(s.title, '🗺️ ' + (s.strategy || 'خريطة ذهنية')) + guide(s.guide) + `<div class="s-body">
        <div class="mind seq"><svg></svg></div>
        <div class="mind-tip">انقري على المركز لكشف الفروع، وعلى أي فرع لكشف تفاصيله</div></div>`,
    mount(node) {
      const mind = node.querySelector('.mind'), svg = mind.querySelector('svg');
      const W = mind.offsetWidth, H = mind.offsetHeight, cx = W / 2, cy = H / 2;
      const order = []; // ترتيب الكشف: فرع ثم أبناؤه
      const mk = (cls, text, x, y) => { const n = el(`<div class="mnode ${cls}">${fmt(text)}</div>`); n.style.left = x + 'px'; n.style.top = y + 'px'; mind.appendChild(n); return n; };
      const line = (x1, y1, x2, y2) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        p.setAttribute('d', `M${x1} ${y1} Q${mx + (y2 - y1) * 0.12} ${my - (x2 - x1) * 0.12} ${x2} ${y2}`);
        p.style.transition = 'opacity .3s'; p.style.opacity = 0; svg.appendChild(p); return p;
      };
      const center = mk('center', s.center, cx, cy);
      const nb = s.branches.length;
      s.branches.forEach((b, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / nb + (nb === 2 ? Math.PI / 2 : 0);
        const bx = cx + Math.cos(a) * W * 0.24, by = cy + Math.sin(a) * H * 0.3;
        const bl = line(cx, cy, bx, by), bn = mk('branch hidden', b.label, bx, by);
        const kids = (b.children || []).map((c, j, arr) => {
          const ca = a + (j - (arr.length - 1) / 2) * 0.42;
          const x = cx + Math.cos(ca) * W * 0.4, y = cy + Math.sin(ca) * H * 0.42;
          return { line: line(bx, by, x, y), node: mk('leaf hidden', c, x, y) };
        });
        order.push({ line: bl, node: bn });
        kids.forEach(k => order.push(k));
        bn.onclick = () => { kids.forEach(show); tick(); };
      });
      function show(it) { it.node.classList.remove('hidden'); it.line.style.opacity = 1; }
      const reveal = () => { const it = order.find(o => o.node.classList.contains('hidden')); if (!it) return false; show(it); tick(); return true; };
      center.onclick = () => { const it = order.find(o => o.node.classList.contains('branch') && o.node.classList.contains('hidden')); if (it) { show(it); tick(); } else reveal(); };
      return { next: reveal };
    },
  });

  R.strategy = s => ({
    html: head(s.title, '🧭 ' + (s.name || 'استراتيجية')) + guide(s.guide) + `<div class="s-body">
        <div class="${s.cards && s.cards.length ? 'grid2' : ''}">
          <div class="panel seq"><ol class="steps">${(s.steps || []).map(t => `<li>${fmt(t)}</li>`).join('')}</ol></div>
          ${s.cards && s.cards.length ? `<div class="s-cards">${s.cards.map(c => `<div class="s-card seq">${fmt(c)}</div>`).join('')}</div>` : ''}
        </div></div>`,
  });

  R.observe = s => {
    const wide = s.visual && s.visual.kind === 'table';
    const qs_ = `<div class="stack">${(s.questions || []).map((q, i) => qaHTML(q.q, q.a, i)).join('')}</div>`;
    return {
      html: head(s.title, '🔍 ' + (s.strategy || 'لاحظي واكتشفي')) + guide(s.guide) + `<div class="s-body">
          ${wide ? `<div class="seq" style="margin-bottom:24px">${visualHTML(s.visual)}</div>${qs_}`
                 : `<div class="grid2" style="align-items:start"><div class="seq">${visualHTML(s.visual)}</div>${qs_}</div>`}</div>`,
      mount(node) { wireReveal(node); mountVisual(node); },
    };
  };

  R.unknown = s => ({ cls: 'center', html: `<div class="s-big">⚠️ نوع شريحة غير معروف: ${esc(s.type)}</div><p class="muted">راجعي data/lessons.js</p>` });

  // ------------------------------------------------------------------
  // عرض الشريحة والتنقل
  // ------------------------------------------------------------------
  const progress = document.getElementById('progress');
  const counter = document.getElementById('counter');

  function show(i, dir) {
    if (i < 0 || i >= slides.length || i === cur) return;
    cleanups.forEach(fn => { try { fn(); } catch (e) { /* تجاهل */ } });
    cleanups = []; api = {};
    const s = slides[i];
    const r = (R[s.type] || R.unknown)(s);
    const node = el(`<section class="slide ${r.cls || ''}">${r.html}</section>`);
    node.querySelectorAll('.seq').forEach((e, k) => { if (!e.style.getPropertyValue('--i')) e.style.setProperty('--i', k); });
    const old = stage.querySelector('.slide:not(.leave)');
    if (old) { old.classList.add('leave'); setTimeout(() => old.remove(), 300); }
    node.classList.add('enter'); if (dir < 0) node.classList.add('back');
    stage.appendChild(node);
    if (r.mount) api = r.mount(node) || {};
    fitSlide(node);
    cur = i;
    counter.textContent = `${ar(i + 1)} / ${ar(slides.length)}`;
    progress.style.width = ((i + 1) / slides.length * 100) + '%';
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* تجاهل */ }
  }

  // إن زاد المحتوى عن مساحة الشريحة نصغّره قليلًا بدل ظهور أشرطة التمرير
  function fitSlide(node) {
    const parts = [...node.children].filter(c => !c.matches('.guide, .review-flag'));
    const run = () => {
      let z = 1;
      parts.forEach(p => { p.style.zoom = ''; });
      while (node.scrollHeight > node.clientHeight + 2 && z > 0.62) { z -= 0.04; parts.forEach(p => { p.style.zoom = z; }); }
    };
    run();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (node.isConnected) run(); });
  }

  function next() { if (api.next && api.next()) return; show(cur + 1, 1); }
  function prev() { show(cur - 1, -1); }
  function goHome() { location.href = 'index.html'; }
  function toggleFs() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { toast('ملء الشاشة غير مدعوم في هذا المتصفح', 'err'); }
  }
  function plickersButton() {
    const s = slides[cur];
    if (s.type === 'plickers') { Plickers.open({ classId, lessonId: lesson.id, q: s }); return; }
    const k = slides.findIndex((x, j) => x.type === 'plickers' && j > cur);
    const j = k >= 0 ? k : slides.findIndex(x => x.type === 'plickers');
    if (j >= 0) show(j, j > cur ? 1 : -1); else toast('لا توجد أسئلة بليكرز في هذا الدرس', 'err');
  }

  document.getElementById('b-prev').onclick = prev;
  document.getElementById('b-next').onclick = next;
  document.getElementById('b-clap').onclick = clap;
  document.getElementById('b-draw').onclick = openDraw;
  document.getElementById('b-plk').onclick = plickersButton;
  document.getElementById('b-fs').onclick = toggleFs;
  document.getElementById('b-home').onclick = goHome;

  // لوحة المفاتيح
  document.addEventListener('keydown', e => {
    if (document.querySelector('.modal-back')) return; // النافذة الحوارية تتعامل مع مفاتيحها
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (Plickers.isOpen()) return Plickers.close();
      if (drawEl) return closeDraw();
      if (inField) return e.target.blur();
      return goHome();
    }
    if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (drawEl) {
      if (k === 'ق' || k.toLowerCase() === 'n' || k === ' ') { e.preventDefault(); spin(); }
      return;
    }
    if (Plickers.isOpen()) return;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); prev(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); }
    else if (k === 'Home') { e.preventDefault(); show(0, -1); }
    else if (k === 'End') { e.preventDefault(); show(slides.length - 1, 1); }
    else if (k === 'ت' || k.toLowerCase() === 'c') { e.preventDefault(); clap(); }
    else if (k === 'ق' || k.toLowerCase() === 'n') { e.preventDefault(); openDraw(); }
  });
  // بعد النقر على زر نُزيل التركيز حتى لا يضغطه مفتاح المسافة مرة أخرى
  document.addEventListener('click', e => {
    const b = e.target.closest('button, summary');
    if (b && !b.closest('.modal-back, .plk-panel')) setTimeout(() => b.blur(), 0);
  });

  // إخفاء شريط التحكم والتلميح بعد ٣ ثوانٍ دون حركة للفأرة
  const controls = document.getElementById('controls'), hint = document.getElementById('hint');
  let hideT = null;
  function wake() {
    controls.classList.remove('hide'); hint.classList.remove('hide');
    clearTimeout(hideT);
    hideT = setTimeout(() => {
      if (controls.matches(':hover')) return wake();
      controls.classList.add('hide'); hint.classList.add('hide');
    }, 3000);
  }
  ['mousemove', 'pointerdown', 'touchstart'].forEach(ev => addEventListener(ev, wake, { passive: true }));
  wake();

  // البداية (أو آخر شريحة من رابط الصفحة #رقم)
  const start = Math.min(Math.max((parseInt(location.hash.slice(1), 10) || 1) - 1, 0), slides.length - 1);
  show(start, 1);
})();
