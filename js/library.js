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
  if (DB.MODE === 'cloud') {
    const acc = await DB.verifyAccess();
    if (!acc.ok) { await DB.signOut(); renderLogin(acc.error); return; }
    if (acc.mustChange) { renderChangePassword(); return; }
  }
  renderLibrary();
  // تحديث البيانات من الخادم في الخلفية ثم إعادة الرسم
  if (DB.MODE === 'cloud' && navigator.onLine) DB.pullAll().then(ok => { if (ok) renderLibrary(); });

  // ------------------------------------------------------------------
  // تسجيل الدخول
  // ------------------------------------------------------------------
  function renderLogin(message) {
    const demo = DB.MODE === 'demo';
    app.innerHTML = `
      <div class="login-page"><div class="login-card">
        <div class="brand"><span class="brand-mark">✦</span> التقنية الرقمية-١</div>
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
      if (res.mustChange) { renderChangePassword(); return; }
      // العودة للصفحة التي طُلبت قبل الدخول (صفحات التطبيق فقط)
      const next = UI.qs('next');
      if (next && /^(admin|dashboard|presentation)\.html([?#].*)?$/.test(next)) { location.href = next; return; }
      renderLibrary();
    };
    const forgot = app.querySelector('#f-forgot');
    if (forgot) forgot.onclick = e => { e.preventDefault(); renderForgot(emailIn.value.trim()); };
    function showErr(m) { err.textContent = m; err.hidden = false; }
    if (message) showErr(message);
  }

  // ------------------------------------------------------------------
  // أول دخول: المعلمة تختار كلمة مرور خاصة بدل المؤقتة
  // ------------------------------------------------------------------
  function renderChangePassword() {
    app.innerHTML = `
      <div class="login-page"><div class="login-card">
        <div class="brand"><span class="brand-mark">✦</span> التقنية الرقمية-١</div>
        <h1>أهلًا بكِ 🌷</h1>
        <p class="muted">هذا أول دخول لكِ. اختاري كلمة مرور خاصة بكِ بدل الكلمة المؤقتة التي وصلتكِ.</p>
        <form id="cp-form" novalidate>
          <div class="field"><label for="cp-new">كلمة المرور الجديدة</label><input class="input ltr" id="cp-new" type="password" autocomplete="new-password" placeholder="٨ أحرف على الأقل"></div>
          <div class="field"><label for="cp-again">تأكيد كلمة المرور</label><input class="input ltr" id="cp-again" type="password" autocomplete="new-password"></div>
          <label class="row small muted" style="gap:6px;margin:-4px 0 12px"><input type="checkbox" id="cp-show"> إظهار كلمة المرور</label>
          <p class="err" id="cp-err" hidden></p>
          <button class="btn primary" style="width:100%;padding:.8em" id="cp-go">حفظ والمتابعة</button>
        </form>
        <p class="small" style="text-align:center;margin:16px 0 0"><a href="#" id="cp-out">تسجيل الخروج</a></p>
      </div></div>`;
    const nw = app.querySelector('#cp-new'), again = app.querySelector('#cp-again');
    const err = app.querySelector('#cp-err'), go = app.querySelector('#cp-go');
    const fail = m => { err.textContent = m; err.hidden = false; };
    setTimeout(() => nw.focus(), 50);
    app.querySelector('#cp-show').onchange = e => { nw.type = again.type = e.target.checked ? 'text' : 'password'; };
    app.querySelector('#cp-out').onclick = async e => { e.preventDefault(); await DB.signOut(); renderLogin(); };
    app.querySelector('#cp-form').onsubmit = async e => {
      e.preventDefault();
      err.hidden = true;
      const p = nw.value;
      if (p.length < 8) return fail('كلمة المرور يجب أن تكون ٨ أحرف على الأقل.');
      if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/[0-9\u0660-\u0669]/.test(p)) return fail('استخدمي حروفًا وأرقامًا معًا.');
      if (p !== again.value) return fail('كلمتا المرور غير متطابقتين.');
      if (!navigator.onLine) return fail('لا يوجد اتصال بالإنترنت.');
      go.disabled = true; go.textContent = '… جارٍ الحفظ';
      const r = await DB.changePassword(p);
      go.disabled = false; go.textContent = 'حفظ والمتابعة';
      if (r.relogin) { await DB.signOut(); renderLogin(r.error); return; }
      if (r.error) return fail(r.error);
      UI.toast('تم حفظ كلمة المرور ✓');
      const next = UI.qs('next');
      if (next && /^(admin|dashboard|presentation)\.html([?#].*)?$/.test(next)) { location.href = next; return; }
      renderLibrary();
    };
  }

  // ------------------------------------------------------------------
  // نسيت كلمة المرور: شاشة مستقلة ترسل رابط تعيين كلمة مرور جديدة
  // ------------------------------------------------------------------
  function renderForgot(prefill) {
    app.innerHTML = `
      <div class="login-page"><div class="login-card">
        <div class="brand"><span class="brand-mark">✦</span> التقنية الرقمية-١</div>
        <h1>استعادة كلمة المرور 🔑</h1>
        <p class="muted">اكتبي بريدك الإلكتروني وسنرسل لكِ رابطًا لتعيين كلمة مرور جديدة.</p>
        <form id="forgot-form" novalidate>
          <div class="field"><label for="r-email">البريد الإلكتروني</label><input class="input ltr" id="r-email" type="email" autocomplete="email" placeholder="name@example.com" value="${esc(prefill || '')}"></div>
          <p class="err" id="r-err" hidden></p>
          <button class="btn primary" style="width:100%;padding:.8em" id="r-go">إرسال رابط الاستعادة</button>
        </form>
        <div id="r-done" hidden>
          <div class="card" style="background:var(--good-bg);box-shadow:none;margin:0">
            ✅ <b>تم الإرسال.</b> إن كان البريد مسجّلًا فستصلك خلال دقائق رسالة فيها رابط لتعيين كلمة مرور جديدة.
            <p class="small muted" style="margin:8px 0 0">لم تصلك؟ تحققي من مجلد البريد غير الهام (Spam)، وتأكدي أن البريد هو نفسه المسجّل لدى مسؤولة النظام.</p>
          </div>
        </div>
        <p class="small" style="text-align:center;margin:16px 0 0"><a href="#" id="r-back">→ العودة لتسجيل الدخول</a></p>
      </div></div>`;
    const form = app.querySelector('#forgot-form'), input = app.querySelector('#r-email');
    const err = app.querySelector('#r-err'), go = app.querySelector('#r-go');
    app.querySelector('#r-back').onclick = e => { e.preventDefault(); renderLogin(); };
    setTimeout(() => input.focus(), 50);
    form.onsubmit = async e => {
      e.preventDefault();
      err.hidden = true;
      const email = input.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'اكتبي بريدًا إلكترونيًا صحيحًا.'; err.hidden = false; return; }
      if (!navigator.onLine) { err.textContent = 'لا يوجد اتصال بالإنترنت.'; err.hidden = false; return; }
      go.disabled = true; go.textContent = '… جارٍ الإرسال';
      const r = await DB.resetPassword(email);
      go.disabled = false; go.textContent = 'إرسال رابط الاستعادة';
      if (r.error) { err.textContent = r.error; err.hidden = false; return; }
      form.hidden = true;
      app.querySelector('#r-done').hidden = false;
    };
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
        <div class="brand"><span class="brand-mark">✦</span> التقنية الرقمية-١</div>
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
            </select>` : `<span class="muted small">يمكنك عرض الدروس الآن، وأضيفي فصولك لاحقًا لتفعيل القرعة وبليكرز</span><a class="btn sm" href="dashboard.html#classes">➕ إضافة فصل</a>`}
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
      // لا توجد فصول بعد: يُفتح الدرس مباشرة (القرعة والنقاط وبليكرز تعمل بعد إضافة الفصول)
      if (!cid && classes.length) {
        cid = await modal({
          title: 'اختاري الفصل قبل بدء الدرس',
          body: `<div class="field"><label for="m-cls">الفصل</label><select class="input" id="m-cls">
            ${classes.map(c => `<option value="${c.id}">${esc(c.name)} (${ar(c.student_count)} طالبة)</option>`).join('')}</select></div>
            <p class="muted small">القرعة والنقاط ونتائج بليكرز تُحفظ لهذا الفصل.</p>`,
          actions: [
            { label: 'ابدئي العرض ▶', kind: 'primary', value: m => m.querySelector('#m-cls').value },
            { label: 'عرض بدون فصل', value: '' },
            { label: 'إلغاء', value: null }],
        });
        if (cid === null) return;
        if (cid) { classId = cid; DB.ls.set(classKey(), cid); }
      }
      location.href = `presentation.html?lesson=${encodeURIComponent(lessonId)}` + (cid ? `&class=${encodeURIComponent(cid)}` : '');
    }
  }

  window.addEventListener('pageshow', e => { if (e.persisted && DB.user) renderLibrary(); });
})();
