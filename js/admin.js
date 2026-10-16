// =====================================================================
// صفحة المسؤولة: إضافة حسابات المعلمات، تعديلها، إيقافها أو تفعيلها، وإرسال رابط كلمة المرور
// لا يوجد تسجيل ذاتي في التطبيق؛ كل حساب معلمة تُنشئه المسؤولة من هنا.
// =====================================================================
(async function () {
  const { ar, esc, toast, saved, modal, confirmBox, fmtDate } = UI;
  const main = document.getElementById('main');
  const user = await DB.requireAuth();
  if (!user) return;
  UI.mountStatusBadge(document.getElementById('badge'));
  document.getElementById('logout').onclick = async () => { await DB.signOut(); location.href = 'index.html'; };

  if (DB.MODE !== 'cloud') {
    main.innerHTML = `<div class="card"><h3>🧪 الوضع التجريبي</h3><p class="muted">إدارة حسابات المعلمات تحتاج ربط Firebase في js/config.js.</p></div>`;
    return;
  }
  if (!DB.isAdmin()) {
    main.innerHTML = `<div class="card"><h3>⛔ هذه الصفحة لمسؤولة النظام فقط</h3><p class="muted">بريدك غير مسجّل كمسؤولة. <a href="index.html">العودة إلى مكتبة الدروس</a></p></div>`;
    return;
  }

  let staff = [];
  const summaries = {}; // uid → ملخص بيانات المعلمة (فصول، طالبات، دروس، بليكرز)
  let search = '';
  const EMAIL_RE = /^\S+@\S+\.\S+$/;
  // كلمة مرور مؤقتة سهلة القراءة (بلا أحرف متشابهة مثل l و 1 و O و 0)
  function tempPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let p = '';
    const rnd = new Uint32Array(10);
    try { crypto.getRandomValues(rnd); } catch (e) { for (let i = 0; i < 10; i++) rnd[i] = Math.random() * 1e9; }
    for (let i = 0; i < 10; i++) p += chars[rnd[i] % chars.length];
    return p;
  }

  async function load() {
    main.innerHTML = '<div class="card muted">… جارٍ تحميل قائمة المعلمات</div>';
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      staff = await Promise.race([DB.listStaff(), timeout]);
    }
    catch (e) {
      const code = (e && (e.code || e.message)) || '';
      const hint = /permission/.test(code) ? 'Firebase رفض الطلب: انشري آخر نسخة من firestore.rules، وتأكدي أن بريد الدخول الحالي مكتوب فيها كمسؤولة.'
        : /timeout|unavailable|offline/.test(code) ? 'لا يوجد رد من Firebase: تأكدي من الإنترنت، ومن فتح الصفحة عبر http://localhost وليس file://.'
        : 'تأكدي من الإنترنت، ومن نشر firestore.rules وأن بريدك مكتوب فيها كمسؤولة.';
      main.innerHTML = `<div class="card"><h3>تعذّر تحميل القائمة</h3><p class="muted">${esc(hint)}</p>
        <p class="small ltr" style="text-align:right">رمز الخطأ: <code>${esc(code)}</code> · الحساب الحالي: <code>${esc(DB.user && DB.user.email || '')}</code></p>
        <button class="btn" id="retry">إعادة المحاولة</button></div>`;
      main.querySelector('#retry').onclick = load;
      return;
    }
    render();
    loadSummaries();
  }

  // ملخص بيانات كل معلمة (يُحمَّل بعد ظهور القائمة)
  async function loadSummaries() {
    await Promise.all(staff.map(async s => {
      try { summaries[s.id] = await DB.teacherSummary(s.id); } catch (e) { summaries[s.id] = { error: true }; }
    }));
    if (!main.querySelector('#rows')) return;
    rows();
    const all = Object.values(summaries).filter(x => !x.error);
    const tot = main.querySelector('#tot-students');
    if (tot) tot.textContent = ar(all.reduce((a, x) => a + x.students, 0));
  }
  function summaryCell(s) {
    const x = summaries[s.id];
    if (!x) return '<span class="muted small">… جارٍ التحميل</span>';
    if (x.error) return '<span class="muted small">تعذّر التحميل</span>';
    if (!x.classes) return '<span class="muted small">لا توجد فصول بعد</span>';
    return `<span class="small" style="white-space:nowrap">🏫 ${ar(x.classes)} فصول · 👭 ${ar(x.students)} طالبة<br>📚 ${ar(x.taught)} دروس منجزة · 📊 ${x.plkPct == null ? '—' : ar(x.plkPct) + '٪'} بليكرز</span>`;
  }

  function render() {
    const active = staff.filter(s => s.active).length;
    main.innerHTML = `
      <div class="panel-title"><h2>إدارة حسابات المعلمات 👑</h2></div>
      <div class="stats">
        <div class="stat"><div class="k">👩‍🏫 كل المعلمات</div><div class="v">${ar(staff.length)}</div></div>
        <div class="stat"><div class="k">✅ حسابات مفعّلة</div><div class="v">${ar(active)}</div></div>
        <div class="stat"><div class="k">⏸️ حسابات موقوفة</div><div class="v">${ar(staff.length - active)}</div></div>
        <div class="stat"><div class="k">👭 كل الطالبات</div><div class="v" id="tot-students">…</div></div>
      </div>

      <form class="card" id="add" novalidate>
        <h3>➕ إضافة معلمة</h3>
        <div class="row">
          <div class="field grow"><label for="a-name">اسم المعلمة</label><input class="input" id="a-name" placeholder="كما يظهر للطالبات"></div>
          <div class="field grow"><label for="a-school">المدرسة</label><input class="input" id="a-school"></div>
        </div>
        <div class="row">
          <div class="field grow"><label for="a-email">البريد الإلكتروني</label><input class="input ltr" id="a-email" type="email" placeholder="name@example.com"></div>
          <div class="field grow"><label for="a-pass">كلمة مرور مؤقتة</label>
            <div class="row" style="flex-wrap:nowrap"><input class="input ltr" id="a-pass" value="${tempPassword()}"><button type="button" class="btn sm" id="a-gen" title="توليد كلمة مرور">🎲</button></div></div>
        </div>
        <p class="err" id="a-err" hidden></p>
        <button class="btn primary" id="a-go">إنشاء الحساب</button>
        <div id="a-done"></div>
      </form>

      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0">قائمة المعلمات</h3>
          <input class="input" id="q" placeholder="🔍 ابحثي بالاسم أو البريد…" value="${esc(search)}" style="max-width:280px">
        </div>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>المعلمة</th><th>المدرسة</th><th>بياناتها</th><th>الحالة</th><th></th>
        </tr></thead><tbody id="rows"></tbody></table></div>
        <p class="muted small" style="margin:12px 0 0">لحذف حساب نهائيًا: أوقفيه هنا، ثم احذفيه من Firebase console → Authentication → Users.</p>
      </div>`;

    const form = main.querySelector('#add'), err = main.querySelector('#a-err'), go = main.querySelector('#a-go');
    main.querySelector('#a-gen').onclick = () => { main.querySelector('#a-pass').value = tempPassword(); };
    form.onsubmit = async e => {
      e.preventDefault();
      err.hidden = true;
      const full_name = main.querySelector('#a-name').value.trim();
      const school_name = main.querySelector('#a-school').value.trim();
      const email = main.querySelector('#a-email').value.trim().toLowerCase();
      const password = main.querySelector('#a-pass').value.trim();
      const fail = m => { err.textContent = m; err.hidden = false; };
      if (!full_name) return fail('اكتبي اسم المعلمة.');
      if (!EMAIL_RE.test(email)) return fail('اكتبي بريدًا إلكترونيًا صحيحًا.');
      if (password.length < 6) return fail('كلمة المرور يجب أن تكون ٦ أحرف على الأقل.');
      if (staff.some(s => s.email === email)) return fail('هذه المعلمة موجودة في القائمة.');
      go.disabled = true; go.textContent = '… جارٍ الإنشاء';
      const r = await DB.createTeacher({ full_name, email, password, school_name });
      go.disabled = false; go.textContent = 'إنشاء الحساب';
      if (r.error) return fail(r.error);
      staff.push(r.staff);
      saved();
      render();
      showCredentials(r.staff, password);
    };
    main.querySelector('#q').oninput = e => { search = e.target.value; rows(); };
    rows();
  }

  // بيانات الدخول لإرسالها للمعلمة
  function showCredentials(s, password) {
    const link = location.href.replace(/admin\.html.*$/, 'index.html');
    const text = `أهلًا ${s.full_name} 🌷\nتم إنشاء حسابك في منصة التقنية الرقمية-١.\nرابط الدخول: ${link}\nالبريد: ${s.email}\nكلمة المرور المؤقتة: ${password}\nعند أول دخول ستختارين كلمة مرور خاصة بكِ.`;
    const box = main.querySelector('#a-done');
    box.innerHTML = `<div class="card" style="background:var(--good-bg);box-shadow:none;margin:16px 0 0">
      <b>✅ تم إنشاء حساب ${esc(s.full_name)}</b>
      <p class="small muted" style="margin:6px 0">أرسلي لها بيانات الدخول التالية (لن تظهر كلمة المرور مرة أخرى):</p>
      <pre style="white-space:pre-wrap;text-align:right;background:#fff;padding:12px;border-radius:12px;margin:0 0 10px;font-family:var(--font-body)">${esc(text)}</pre>
      <button type="button" class="btn sm" id="copy">📋 نسخ الرسالة</button></div>`;
    box.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast('تم النسخ ✓'); }
      catch (e) { toast('تعذّر النسخ، انسخيها يدويًا', 'err'); }
    };
  }

  function rows() {
    const body = main.querySelector('#rows');
    const q = search.trim().toLowerCase();
    const list = staff.filter(s => !q || String(s.full_name || '').toLowerCase().includes(q) || String(s.email || '').includes(q));
    body.innerHTML = list.length ? list.map(s => `<tr>
        <td><b>${esc(s.full_name || '')}</b><div class="small muted ltr" style="text-align:right">${esc(s.email || '')}</div>
          ${s.created_at ? `<div class="small muted">أُضيفت ${esc(fmtDate(s.created_at))}</div>` : ''}</td>
        <td>${esc(s.school_name || '')}</td>
        <td>${summaryCell(s)}</td>
        <td>${s.active ? '<span class="pill good">مفعّل</span>' : '<span class="pill bad">موقوف</span>'}${s.active && s.must_change_password ? '<br><span class="pill warn" title="ما زالت تستخدم كلمة المرور المؤقتة">لم تدخل بعد</span>' : ''}</td>
        <td style="white-space:nowrap">
          <a class="btn sm primary" href="dashboard.html?teacher=${encodeURIComponent(s.id)}">📊 عرض اللوحة</a>
          <button class="btn sm" data-a="edit" data-id="${s.id}" title="تعديل الاسم والمدرسة">✏️</button>
          <button class="btn sm" data-a="reset" data-id="${s.id}" title="إرسال رابط تعيين كلمة مرور جديدة">🔑</button>
          <button class="btn sm ${s.active ? 'ghost' : ''}" data-a="toggle" data-id="${s.id}">${s.active ? '⏸️ إيقاف' : '▶ تفعيل'}</button>
        </td></tr>`).join('')
      : `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">${staff.length ? 'لا توجد نتائج مطابقة.' : 'لم تُضف أي معلمة بعد.'}</td></tr>`;
    body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, staff.find(s => s.id === b.dataset.id)));
  }

  async function act(a, s) {
    if (!s) return;
    if (a === 'edit') {
      const v = await modal({
        title: 'تعديل بيانات المعلمة',
        body: `<div class="field"><label for="e-name">الاسم</label><input class="input" id="e-name" value="${esc(s.full_name || '')}"></div>
          <div class="field"><label for="e-school">المدرسة</label><input class="input" id="e-school" value="${esc(s.school_name || '')}"></div>
          <p class="muted small">البريد الإلكتروني لا يمكن تغييره من هنا.</p><p class="err" id="e-err" hidden></p>`,
        actions: [{ label: 'حفظ', kind: 'primary', value: m => {
          const full_name = m.querySelector('#e-name').value.trim();
          if (!full_name) { const e = m.querySelector('#e-err'); e.textContent = 'اكتبي الاسم.'; e.hidden = false; return undefined; }
          return { full_name, school_name: m.querySelector('#e-school').value.trim() };
        } }, { label: 'إلغاء', value: null }],
      });
      if (!v) return;
      const r = await DB.updateStaff(s.id, v);
      if (r.error) return toast(r.error, 'err');
      Object.assign(s, v); saved(); rows();
    } else if (a === 'toggle') {
      const stop = s.active;
      const ok = await confirmBox(stop ? 'إيقاف الحساب' : 'تفعيل الحساب',
        stop ? `لن تتمكن ${s.full_name} من الدخول أو الوصول لبياناتها حتى تعيدي تفعيل الحساب. بياناتها لا تُحذف.` : `ستتمكن ${s.full_name} من الدخول مرة أخرى.`,
        stop ? 'إيقاف' : 'تفعيل', stop);
      if (!ok) return;
      const r = await DB.updateStaff(s.id, { active: !stop });
      if (r.error) return toast(r.error, 'err');
      s.active = !stop; saved(); render();
    } else if (a === 'reset') {
      const ok = await confirmBox('إرسال رابط كلمة المرور', `سيُرسَل إلى ${s.email} رابط لتعيين كلمة مرور جديدة.`, 'إرسال');
      if (!ok) return;
      const r = await DB.resetPassword(s.email);
      if (r.error) return toast(r.error, 'err');
      toast('تم إرسال الرابط ✓');
    }
  }

  load();
})();
