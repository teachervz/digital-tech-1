// =====================================================================
// صفحة البداية: تسجيل الدخول + مكتبة الدروس (الوحدات ← الدروس)
// يجب اختيار الفصل قبل بدء أي درس، لأن القرعة والنقاط ونتائج بليكرز مرتبطة به.
// =====================================================================
(async function () {
  const { ar, esc, modal } = UI;
  const app = document.getElementById('app');
  const classKey = () => 'tq_class_' + (DB.user ? DB.user.id : '');

  const u = await DB.getSession();
  if (!u) { renderLogin(); return; }
  renderLibrary();
  // تحديث البيانات من الخادم في الخلفية ثم إعادة الرسم
  if (DB.MODE === 'cloud' && navigator.onLine) DB.pullAll().then(ok => { if (ok) renderLibrary(); });

  // ------------------------------------------------------------------
  // تسجيل الدخول
  // ------------------------------------------------------------------
  function renderLogin() {
    const demo = DB.MODE === 'demo';
    app.innerHTML = `
      <div class="login-page"><div class="login-card">
        <div class="brand"><span class="brand-mark">✦</span> التقنية الرقمية ١-١</div>
        <h1>أهلًا بكِ معلمتنا 👋</h1>
        <p class="muted">سجّلي الدخول لبدء العروض التفاعلية ومتابعة فصولك.</p>
        ${demo ? `<div class="demo-note">🧪 <b>وضع تجريبي:</b> لم تُضبط إعدادات Firebase بعد (js/config.js)، لذلك تُحفظ البيانات في هذا المتصفح فقط. يمكنك الدخول بأي بريد.</div>` : ''}
        <form id="login-form" novalidate>
          <div class="field"><label for="f-email">البريد الإلكتروني</label><input class="input ltr" id="f-email" type="email" autocomplete="email" placeholder="name@example.com"></div>
          <div class="field"><label for="f-pass">كلمة المرور</label><input class="input ltr" id="f-pass" type="password" autocomplete="current-password" placeholder="••••••"></div>
          <p class="err" id="f-err" hidden></p>
          <p class="muted small" id="f-info" hidden></p>
          <button class="btn primary" style="width:100%;padding:.8em" id="f-go">دخول</button>
        </form>
        ${demo ? '' : `<p class="small" style="text-align:center;margin:14px 0 0"><a href="#" id="f-forgot">نسيت كلمة المرور؟</a></p>
        <p class="muted small" style="text-align:center;margin:6px 0 0">الحسابات تُنشئها مسؤولة النظام. لا يوجد تسجيل ذاتي.</p>`}
      </div></div>`;
    const form = app.querySelector('#login-form');
    const err = app.querySelector('#f-err');
    const info = app.querySelector('#f-info');
    const go = app.querySelector('#f-go');
    const emailIn = form.querySelector('#f-email');
    form.onsubmit = async e => {
      e.preventDefault();
      err.hidden = true; info.hidden = true;
      const email = emailIn.value.trim();
      const pass = form.querySelector('#f-pass').value;
      if (!demo) {
        if (!/^\S+@\S+\.\S+$/.test(email)) return showErr('اكتبي بريدًا إلكترونيًا صحيحًا.');
        if (pass.length < 6) return showErr('كلمة المرور يجب أن تكون ٦ أحرف على الأقل.');
        if (!navigator.onLine) return showErr('لا يوجد اتصال بالإنترنت. تحتاجين الاتصال لأول دخول.');
      }
      go.disabled = true; go.textContent = '… لحظة';
      let res;
      try { res = await DB.signIn(email, pass); }
      catch (ex) { res = { error: 'تعذّر الاتصال بالخادم. حاولي مرة أخرى.' }; }
      go.disabled = false; go.textContent = 'دخول';
      if (res.error) return showErr(res.error);
      // العودة للصفحة التي طُلبت قبل الدخول (صفحات التطبيق فقط)
      const next = UI.qs('next');
      if (next && /^(admin|dashboard|presentation)\.html([?#].*)?$/.test(next)) { location.href = next; return; }
      renderLibrary();
    };
    const forgot = app.querySelector('#f-forgot');
    if (forgot) forgot.onclick = async e => {
      e.preventDefault();
      err.hidden = true; info.hidden = true;
      const email = emailIn.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { showErr('اكتبي بريدك الإلكتروني أولًا ثم اضغطي «نسيت كلمة المرور؟».'); emailIn.focus(); return; }
      const r = await DB.resetPassword(email);
      if (r.error) return showErr(r.error);
      info.textContent = 'إن كان البريد مسجّلًا فستصلك رسالة لتعيين كلمة مرور جديدة. تحققي من البريد غير الهام أيضًا.';
      info.hidden = false;
    };
    function showErr(m) { err.textContent = m; err.hidden = false; }
  }

  // ------------------------------------------------------------------
  // المكتبة
  // ------------------------------------------------------------------
  function renderLibrary() {
    const profile = DB.getProfile();
    const classes = DB.listClasses();
    let classId = DB.ls.get(classKey(), null);
    if (classId && !classes.some(c => c.id === classId)) classId = null;

    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">✦</span> التقنية الرقمية ١-١</div>
        <span class="spacer"></span>
        <span id="badge"></span>
        <a class="btn sm" href="dashboard.html">📊 لوحة المعلمة</a>
        ${DB.MODE === 'cloud' && DB.isAdmin() ? '<a class="btn sm" href="admin.html">👑 إدارة المعلمات</a>' : ''}
        <button class="btn sm ghost" id="logout">خروج</button>
      </header>
      <main class="wrap">
        <section class="hero">
          <div>
            <h1>مرحبًا ${esc(profile.full_name || 'معلمتنا')} 👋</h1>
            <p>${esc(LESSONS.book)}</p>
          </div>
          <div class="class-picker">
            <label for="cls">الفصل:</label>
            <span class="class-dot" id="cls-dot"></span>
            ${classes.length ? `<select class="input" id="cls">
              <option value="">— اختاري الفصل —</option>
              ${classes.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)} (${ar(c.student_count)} طالبة)</option>`).join('')}
            </select>` : `<a class="btn sm primary" href="dashboard.html#classes">➕ أضيفي فصولك أولًا</a>`}
          </div>
        </section>
        <div id="units"></div>
      </main>`;

    UI.mountStatusBadge(app.querySelector('#badge'));
    app.querySelector('#logout').onclick = async () => { await DB.signOut(); renderLogin(); };
    const sel = app.querySelector('#cls');
    const dot = app.querySelector('#cls-dot');
    const paintDot = () => { const c = classes.find(x => x.id === classId); dot.style.background = c ? c.color : 'var(--line)'; };
    paintDot();
    if (sel) sel.onchange = () => { classId = sel.value || null; DB.ls.set(classKey(), classId); paintDot(); drawUnits(); };

    function drawUnits() {
      const box = app.querySelector('#units');
      box.innerHTML = LESSONS.units.map((u, ui) => `
        <section class="unit-card" data-theme="${u.theme}">
          <div class="unit-head">
            <div class="unit-icon" ${u.cover.icon.length > 2 ? 'style="font-size:1.35rem"' : ''}>${esc(u.cover.icon)}</div>
            <div>
              <div class="unit-kicker">${esc(u.cover.kicker)} · ص ${ar(u.page)}</div>
              <h2 class="unit-title">${esc(u.title)}</h2>
              <div class="unit-tag">${esc(u.cover.tagline)}</div>
            </div>
          </div>
          <div class="lesson-grid">
            ${u.lessons.map((l, li) => {
              const done = classId && DB.isTaught(classId, l.id);
              return `<button class="lesson-card" data-lesson="${l.id}">
                ${done ? '<span class="taught">✔️ تم تدريسه</span>' : ''}
                <span class="lesson-num">الدرس ${ar(li + 1)}</span>
                <span class="lesson-name">${esc(l.title)}</span>
                <span class="lesson-meta"><span>ص ${ar(l.page)} · ${ar(l.slides.length + 1)} شريحة</span><span class="lesson-go">ابدئي ←</span></span>
              </button>`;
            }).join('')}
          </div>
        </section>`).join('');
      box.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => start(b.dataset.lesson));
    }
    drawUnits();

    async function start(lessonId) {
      let cid = classId;
      if (!cid) {
        if (!classes.length) {
          const go = await modal({
            title: 'اختيار الفصل',
            body: '<p>القرعة والنقاط ونتائج بليكرز مرتبطة بفصل محدد، لذا أضيفي فصولك وطالباتك أولًا من لوحة المعلمة.</p>',
            actions: [{ label: 'الذهاب إلى لوحة المعلمة', kind: 'primary', value: true }, { label: 'إلغاء', value: false }],
          });
          if (go) location.href = 'dashboard.html#classes';
          return;
        }
        cid = await modal({
          title: 'اختاري الفصل قبل بدء الدرس',
          body: `<div class="field"><label for="m-cls">الفصل</label><select class="input" id="m-cls">
            ${classes.map(c => `<option value="${c.id}">${esc(c.name)} (${ar(c.student_count)} طالبة)</option>`).join('')}</select></div>`,
          actions: [{ label: 'ابدئي العرض ▶', kind: 'primary', value: m => m.querySelector('#m-cls').value }, { label: 'إلغاء', value: null }],
        });
        if (!cid) return;
        classId = cid; DB.ls.set(classKey(), cid);
      }
      location.href = `presentation.html?lesson=${encodeURIComponent(lessonId)}&class=${encodeURIComponent(cid)}`;
    }
  }

  window.addEventListener('pageshow', e => { if (e.persisted && DB.user) renderLibrary(); });
})();
