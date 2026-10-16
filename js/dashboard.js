// =====================================================================
// لوحة المعلمة: نظرة عامة، الملف الشخصي، الفصول، الطالبات، تقدّم الدروس،
// استيراد بيانات الفصول، بليكرز، والتصدير. كل حفظ يُظهر "تم الحفظ ✓".
// =====================================================================
(async function () {
  const { ar, en, esc, el, toast, saved, modal, confirmBox } = UI;
  const user = await DB.requireAuth();
  if (!user) return;

  const SECTIONS = [
    ['overview', '🏠', 'نظرة عامة'],
    ['profile', '👩‍🏫', 'الملف الشخصي'],
    ['classes', '🏫', 'الفصول'],
    ['students', '👭', 'الطالبات'],
    ['progress', '📚', 'تقدّم الدروس'],
    ['import', '📥', 'استيراد بيانات الفصول'],
    ['plickers', '📊', 'بليكرز'],
    ['export', '📤', 'التصدير'],
  ];
  // المسؤولة تعرض لوحة معلمة (للعرض فقط): لا استيراد ولا تعديل
  const VIEW = DB.viewing;
  if (VIEW) SECTIONS.splice(SECTIONS.findIndex(s => s[0] === 'import'), 1);
  const side = document.getElementById('side');
  const main = document.getElementById('main');
  const LESSONS_ALL = UI.lessonIndex();
  let section = (location.hash.slice(1) || 'overview');
  if (!SECTIONS.some(s => s[0] === section)) section = 'overview';
  const state = { studentClass: '', search: '', progressClass: '', plkClass: '', importPreview: null };

  UI.mountStatusBadge(document.getElementById('badge'));
  if (VIEW) {
    const name = DB.getProfile().full_name || VIEW.full_name || VIEW.email;
    document.title = `لوحة ${name} – عرض المسؤولة`;
    document.querySelector('.dash').before(el(`<div class="view-banner">👁️ تعرضين لوحة المعلمة: <b>${esc(name)}</b> <span class="pill">للعرض فقط</span>
      <span class="grow"></span><a class="btn sm" href="admin.html">→ العودة لإدارة المعلمات</a></div>`));
    // تعطيل كل أدوات التعديل، مع إبقاء الفلاتر والتصدير والطباعة
    const ALLOW = '#f-cls, #f-q, #pg-cls, #plk-cls, #x-all, #x-q, #x-p, #exp-q, #print, [data-a="students"]';
    const lock = () => {
      main.querySelectorAll('button, input, select, textarea').forEach(x => { if (!x.matches(ALLOW)) { x.disabled = true; x.title = 'للعرض فقط'; } });
      main.querySelectorAll('a[href^="presentation.html"], a[href="#import"], a[href="#profile"]').forEach(a => { a.hidden = true; });
    };
    new MutationObserver(lock).observe(main, { childList: true, subtree: true });
  }
  document.getElementById('logout').onclick = async () => { await DB.signOut(); location.href = 'index.html'; };

  side.innerHTML = SECTIONS.map(([id, ic, label]) => `<button data-s="${id}"><span class="ic">${ic}</span>${label}</button>`).join('');
  side.querySelectorAll('[data-s]').forEach(b => b.onclick = () => go(b.dataset.s));
  addEventListener('hashchange', () => { const s = location.hash.slice(1); if (s && s !== section && SECTIONS.some(x => x[0] === s)) go(s); });

  function go(s) {
    section = s;
    try { history.replaceState(null, '', '#' + s); } catch (e) { /* تجاهل */ }
    render();
  }
  function render() {
    side.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === section));
    VIEWS[section]();
    main.scrollTop = 0;
  }

  // إعادة الرسم بعد وصول بيانات أحدث من الخادم (دون مقاطعة الكتابة)
  DB.onData(() => {
    if (document.querySelector('.modal-back')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    if (['overview', 'classes', 'students', 'progress', 'plickers'].includes(section)) render();
  });

  // ---------------- أدوات ----------------
  const title = (t, actions) => `<div class="panel-title"><h2>${t}</h2><div class="row">${actions || ''}</div></div>`;
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
  const lessonById = id => LESSONS_ALL.find(x => x.lesson.id === id);
  const classOptions = (sel, withAll) => (withAll ? `<option value="">كل الفصول</option>` : '') +
    DB.listClasses().map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  function bars(rows, empty) {
    if (!rows.length) return `<p class="muted">${empty}</p>`;
    return `<div class="bars">${rows.map(r => `<div class="bar-row" data-tip="${esc(r.tip || '')}">
      <span title="${esc(r.label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${r.value}%;${r.color ? 'background:' + r.color : ''}"></div></div>
      <span class="bar-val">${ar(r.value)}٪</span></div>`).join('')}</div>`;
  }
  // تلميح المخططات عند مرور الفأرة
  let tipEl = null;
  main.addEventListener('mousemove', e => {
    const row = e.target.closest('.bar-row[data-tip]');
    if (!row || !row.dataset.tip) { if (tipEl) { tipEl.remove(); tipEl = null; } return; }
    if (!tipEl) { tipEl = el('<div class="chart-tip"></div>'); document.body.appendChild(tipEl); }
    tipEl.textContent = row.dataset.tip;
    tipEl.style.left = (e.clientX + 14) + 'px'; tipEl.style.top = (e.clientY + 14) + 'px';
  });
  main.addEventListener('mouseleave', () => { if (tipEl) { tipEl.remove(); tipEl = null; } });

  const VIEWS = {};

  // =================================================================
  // نظرة عامة
  // =================================================================
  VIEWS.overview = () => {
    const classes = DB.listClasses();
    const students = DB.listStudents();
    const prog = DB.listProgress();
    const resp = DB.getPlickersResponses();
    const acc = pct(resp.filter(r => r.is_correct).length, resp.length);
    const p = DB.getProfile();

    // أفضل الطالبات في كل فصل (النقاط + الإجابات الصحيحة)
    const tops = classes.map(c => {
      const st = DB.getStudentStats(c.id).map(s => Object.assign(s, { score: s.total_points + s.correct_answers }))
        .filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      return `<div class="class-tile" style="--c:${c.color}"><h4>${esc(c.name)}</h4>
        ${st.length ? `<ol style="margin:8px 0 0;padding-inline-start:1.2em">${st.map((s, i) => `<li>${['🥇', '🥈', '🥉'][i]} ${esc(s.full_name)} <span class="pill">${ar(s.total_points)} نقطة · ${ar(s.correct_answers)} صحيحة</span></li>`).join('')}</ol>`
          : '<p class="muted small">لا توجد مشاركات بعد. استخدمي القرعة 🎲 في العرض.</p>'}</div>`;
    }).join('');

    // دقة بليكرز لكل درس
    const perLesson = LESSONS_ALL.map(x => {
      const r = resp.filter(y => y.lesson_id === x.lesson.id);
      return r.length ? { label: x.lesson.title, value: pct(r.filter(y => y.is_correct).length, r.length), tip: `${ar(r.length)} إجابة` } : null;
    }).filter(Boolean);

    // تقدّم كل فصل
    const perClass = classes.map(c => {
      const n = prog.filter(r => r.class_id === c.id).length;
      return { label: c.name, value: pct(n, LESSONS_ALL.length), tip: `${ar(n)} من ${ar(LESSONS_ALL.length)} درسًا`, color: c.color };
    });

    main.innerHTML = title(VIEW ? `لوحة ${esc(p.full_name || VIEW.full_name || '')} 📊` : `مرحبًا ${esc(p.full_name || 'معلمتنا')} 👋`) + `
      ${!VIEW && (!p.full_name || !p.school_name) ? `<div class="card" style="border-inline-start:6px solid var(--warn)">✍️ أكملي <a href="#profile">ملفك الشخصي</a> ليظهر اسمك واسم مدرستك في شريحة الترحيب.</div>` : ''}
      <div class="stats">
        <div class="stat"><div class="k">🏫 الفصول</div><div class="v">${ar(classes.length)}</div></div>
        <div class="stat"><div class="k">👭 الطالبات</div><div class="v">${ar(students.length)}</div></div>
        <div class="stat"><div class="k">📚 دروس منجزة (كل الفصول)</div><div class="v">${ar(prog.length)}</div></div>
        <div class="stat"><div class="k">📊 دقة بليكرز العامة</div><div class="v">${resp.length ? ar(acc) + '٪' : '—'}</div></div>
      </div>
      <div class="card"><h3>🏆 المتميزات في كل فصل</h3>${classes.length ? `<div class="class-tiles">${tops}</div>` : '<p class="muted">أضيفي فصولك أولًا من قسم الفصول أو الاستيراد.</p>'}</div>
      <div class="card"><h3>📊 دقة بليكرز لكل درس</h3>${bars(perLesson, 'لم تُسجَّل نتائج بليكرز بعد.')}</div>
      <div class="card"><h3>📚 نسبة الدروس المنجزة لكل فصل</h3>${bars(perClass, 'لا توجد فصول بعد.')}</div>`;
  };

  // =================================================================
  // الملف الشخصي
  // =================================================================
  VIEWS.profile = () => {
    const p = DB.getProfile();
    const terms = ['الفصل الدراسي الأول', 'الفصل الدراسي الثاني', 'الفصل الدراسي الثالث'];
    main.innerHTML = title('الملف الشخصي 👩‍🏫') + `
      <form class="card" id="pf" style="max-width:720px">
        <div class="field"><label for="p-name">اسم المعلمة</label><input class="input" id="p-name" value="${esc(p.full_name || '')}" placeholder="اكتبي اسمك كما يظهر للطالبات"></div>
        <div class="field"><label for="p-school">المدرسة</label><input class="input" id="p-school" value="${esc(p.school_name || '')}"></div>
        <div class="field"><label for="p-subj">المادة</label><input class="input" id="p-subj" value="${esc(p.subject || 'التقنية الرقمية ١-١')}"></div>
        <div class="row">
          <div class="field grow"><label for="p-year">العام الدراسي</label><input class="input" id="p-year" value="${esc(p.academic_year || '')}" placeholder="مثال: ١٤٤٨هـ"></div>
          <div class="field grow"><label for="p-term">الفصل الدراسي</label><select class="input" id="p-term">
            <option value="">—</option>${terms.map(t => `<option ${t === p.term ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>
        <p class="muted small">البريد الإلكتروني: <span class="ltr">${esc(DB.user.email || '')}</span></p>
        <button class="btn primary">💾 حفظ</button>
      </form>
      ${DB.MODE === 'demo' ? `<div class="card" style="max-width:720px"><h3>🧪 الوضع التجريبي</h3>
        <p class="muted">البيانات محفوظة في هذا المتصفح فقط. لتفعيل الحفظ السحابي اتبعي خطوات Firebase في ملف project-overview.md.</p></div>` : ''}`;
    main.querySelector('#pf').onsubmit = e => {
      e.preventDefault();
      DB.saveProfile({
        full_name: main.querySelector('#p-name').value.trim(), school_name: main.querySelector('#p-school').value.trim(),
        subject: main.querySelector('#p-subj').value.trim(), academic_year: main.querySelector('#p-year').value.trim(),
        term: main.querySelector('#p-term').value,
      });
      saved();
    };
  };

  // =================================================================
  // الفصول
  // =================================================================
  const swatches = sel => `<div class="swatches">${IE.COLORS.map(c => `<button type="button" class="swatch ${c === sel ? 'on' : ''}" style="background:${c}" data-c="${c}" aria-label="لون"></button>`).join('')}</div>`;
  async function classForm(c) {
    let color = c ? c.color : IE.COLORS[DB.listClasses().length % IE.COLORS.length];
    return modal({
      title: c ? 'تعديل الفصل' : 'إضافة فصل',
      body: `<div class="field"><label for="c-name">اسم الفصل</label><input class="input" id="c-name" value="${esc(c ? c.name : '')}" placeholder="مثال: أول ثانوي ١"></div>
        <div class="field"><label>اللون</label>${swatches(color)}</div><p class="err" id="c-err" hidden></p>`,
      onOpen(m) {
        m.querySelectorAll('.swatch').forEach(s => s.onclick = () => { color = s.dataset.c; m.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === s)); });
        m.querySelector('#c-name').onkeydown = e => { if (e.key === 'Enter') m.querySelector('.modal-actions .primary').click(); };
      },
      actions: [{ label: 'حفظ', kind: 'primary', value: m => {
        const name = m.querySelector('#c-name').value.trim();
        const err = m.querySelector('#c-err');
        if (!name) { err.textContent = 'اكتبي اسم الفصل.'; err.hidden = false; return undefined; }
        if (DB.listClasses().some(x => x.id !== (c && c.id) && IE.norm(x.name) === IE.norm(name))) { err.textContent = 'يوجد فصل بهذا الاسم.'; err.hidden = false; return undefined; }
        return { name, color };
      } }, { label: 'إلغاء', value: null }],
    });
  }
  VIEWS.classes = () => {
    const classes = DB.listClasses();
    main.innerHTML = title('الفصول 🏫', `<button class="btn primary" id="add-c">➕ إضافة فصل</button><a class="btn" href="#import">📥 استيراد من Excel</a>`) +
      (classes.length ? `<div class="class-tiles">${classes.map(c => {
        const taught = DB.listProgress(c.id).length;
        return `<div class="class-tile" style="--c:${c.color}">
          <div class="row"><span class="class-dot" style="background:${c.color}"></span><h4 class="grow">${esc(c.name)}</h4></div>
          <p class="muted" style="margin:.4em 0">👭 ${ar(c.student_count)} طالبة · 📚 ${ar(taught)} درسًا منجزًا</p>
          <div class="row">
            <button class="btn sm" data-a="students" data-id="${c.id}">👭 الطالبات</button>
            <button class="btn sm" data-a="edit" data-id="${c.id}">✏️ تعديل</button>
            <button class="btn sm ghost" data-a="del" data-id="${c.id}">🗑️ حذف</button>
          </div></div>`;
      }).join('')}</div>` : `<div class="card"><p class="muted">لا توجد فصول بعد. أضيفي فصلًا أو استوردي ملف الطالبات.</p></div>`);
    main.querySelector('#add-c').onclick = async () => {
      const v = await classForm(null); if (!v) return;
      DB.createClass(v); saved(); render();
    };
    main.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const c = DB.listClasses().find(x => x.id === b.dataset.id); if (!c) return;
      if (b.dataset.a === 'students') { state.studentClass = c.id; go('students'); }
      else if (b.dataset.a === 'edit') { const v = await classForm(c); if (v) { DB.updateClass(c.id, v); saved(); render(); } }
      else if (b.dataset.a === 'del') {
        if (await confirmBox('حذف الفصل', `سيتم حذف «${c.name}» و${ar(c.student_count)} طالبة مع كل نقاطهن ونتائج بليكرز وتقدّم الدروس. لا يمكن التراجع.`, 'حذف نهائي', true)) {
          DB.deleteClass(c.id); saved(); render();
        }
      }
    });
  };

  // =================================================================
  // الطالبات
  // =================================================================
  async function studentForm(s) {
    const classes = DB.listClasses();
    if (!classes.length) { toast('أضيفي فصلًا أولًا', 'err'); return null; }
    const cid = s ? s.class_id : (state.studentClass || classes[0].id);
    return modal({
      title: s ? 'تعديل بيانات الطالبة' : 'إضافة طالبة',
      body: `<div class="field"><label for="s-name">اسم الطالبة</label><input class="input" id="s-name" value="${esc(s ? s.full_name : '')}"></div>
        <div class="row">
          <div class="field grow"><label for="s-cls">الفصل</label><select class="input" id="s-cls">${classOptions(cid)}</select></div>
          <div class="field" style="width:170px"><label for="s-card">رقم بطاقة بليكرز</label><input class="input" id="s-card" inputmode="numeric" value="${s && s.plickers_card_number ? s.plickers_card_number : ''}" placeholder="تلقائي"></div>
        </div>
        <div class="field"><label for="s-notes">ملاحظات</label><textarea class="input" id="s-notes" style="min-height:80px">${esc(s && s.notes || '')}</textarea></div>
        <p class="err" id="s-err" hidden></p>`,
      actions: [{ label: 'حفظ', kind: 'primary', value: m => {
        const err = m.querySelector('#s-err');
        const fail = t => { err.textContent = t; err.hidden = false; return undefined; };
        const full_name = m.querySelector('#s-name').value.trim();
        const class_id = m.querySelector('#s-cls').value;
        const raw = en(m.querySelector('#s-card').value.trim());
        const notes = m.querySelector('#s-notes').value.trim() || null;
        if (!full_name) return fail('اكتبي اسم الطالبة.');
        let card = null;
        if (raw) {
          card = parseInt(raw, 10);
          if (!(card > 0)) return fail('رقم البطاقة يجب أن يكون عددًا موجبًا.');
          if (DB.listStudents(class_id).some(x => x.plickers_card_number === card && (!s || x.id !== s.id))) return fail('رقم البطاقة مستخدم لطالبة أخرى في هذا الفصل.');
        }
        return { full_name, class_id, plickers_card_number: card, notes };
      } }, { label: 'إلغاء', value: null }],
    });
  }
  VIEWS.students = () => {
    const classes = DB.listClasses();
    if (state.studentClass && !classes.some(c => c.id === state.studentClass)) state.studentClass = '';
    main.innerHTML = title('الطالبات 👭', `<button class="btn primary" id="add-s">➕ إضافة طالبة</button>`) + `
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <select class="input" id="f-cls" style="width:auto;min-width:200px">${classOptions(state.studentClass, true)}</select>
          <input class="input grow" id="f-q" placeholder="🔍 ابحثي بالاسم…" value="${esc(state.search)}" style="min-width:180px">
        </div>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>البطاقة</th><th>اسم الطالبة</th>${state.studentClass ? '' : '<th>الفصل</th>'}<th>النقاط</th><th>صحيحة</th><th>اختيرت بالقرعة</th><th>دقة بليكرز</th><th>ملاحظات</th><th></th>
        </tr></thead><tbody id="s-body"></tbody></table></div>
      </div>`;
    const body = main.querySelector('#s-body');
    const cname = new Map(classes.map(c => [c.id, c]));
    function rows() {
      const q = IE.norm(state.search);
      const list = DB.getStudentStats(state.studentClass || null).filter(s => !q || IE.norm(s.full_name).includes(q));
      body.innerHTML = list.length ? list.map(s => {
        const c = cname.get(s.class_id);
        return `<tr>
          <td><span class="pill">${ar(s.plickers_card_number || '–')}</span></td>
          <td><b>${esc(s.full_name)}</b></td>
          ${state.studentClass ? '' : `<td><span class="class-dot" style="background:${c ? c.color : '#ccc'}"></span> ${esc(c ? c.name : '')}</td>`}
          <td>${ar(s.total_points)}</td><td>${ar(s.correct_answers)}</td><td>${ar(s.times_picked)}</td>
          <td>${s.plickers_accuracy == null ? '<span class="muted">—</span>' : `<span class="pill ${s.plickers_accuracy >= 70 ? 'good' : s.plickers_accuracy >= 40 ? 'warn' : 'bad'}">${ar(Math.round(s.plickers_accuracy))}٪</span>`}</td>
          <td class="small muted" style="max-width:220px">${esc(s.notes || '')}</td>
          <td style="white-space:nowrap"><button class="icon-btn" data-a="edit" data-id="${s.student_id}" aria-label="تعديل">✏️</button><button class="icon-btn" data-a="del" data-id="${s.student_id}" aria-label="حذف">🗑️</button></td>
        </tr>`;
      }).join('') : `<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">${classes.length ? 'لا توجد طالبات مطابقة.' : 'أضيفي فصلًا ثم طالباته، أو استوردي ملف Excel.'}</td></tr>`;
      body.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
        const st = DB.listStudents().find(x => x.id === b.dataset.id); if (!st) return;
        if (b.dataset.a === 'edit') {
          const v = await studentForm(st); if (!v) return;
          if (!v.plickers_card_number) v.plickers_card_number = v.class_id === st.class_id && st.plickers_card_number ? st.plickers_card_number : DB.nextCardNumber(v.class_id);
          DB.updateStudent(st.id, v); saved(); rows();
        } else if (await confirmBox('حذف الطالبة', `سيتم حذف «${st.full_name}» مع نقاطها ونتائجها.`, 'حذف', true)) {
          DB.deleteStudent(st.id); saved(); rows();
        }
      });
    }
    rows();
    main.querySelector('#f-cls').onchange = e => { state.studentClass = e.target.value; VIEWS.students(); };
    main.querySelector('#f-q').oninput = e => { state.search = e.target.value; rows(); };
    main.querySelector('#add-s').onclick = async () => {
      const v = await studentForm(null); if (!v) return;
      DB.createStudent(v); saved(); rows();
    };
  };

  // =================================================================
  // تقدّم الدروس
  // =================================================================
  VIEWS.progress = () => {
    const classes = DB.listClasses();
    if (!classes.length) { main.innerHTML = title('تقدّم الدروس 📚') + '<div class="card muted">أضيفي فصولك أولًا.</div>'; return; }
    if (!classes.some(c => c.id === state.progressClass)) state.progressClass = classes[0].id;
    const cid = state.progressClass;
    const done = new Map(DB.listProgress(cid).map(p => [p.lesson_id, p]));
    main.innerHTML = title('تقدّم الدروس 📚', `<select class="input" id="pg-cls" style="width:auto;min-width:200px">${classOptions(cid)}</select>`) + `
      <div class="stats"><div class="stat"><div class="k">المنجز في هذا الفصل</div><div class="v">${ar(done.size)} / ${ar(LESSONS_ALL.length)}</div></div></div>
      ${LESSONS.units.map(u => `<div class="card"><h3>${esc(u.cover.icon)} ${esc(u.cover.kicker)}: ${esc(u.title)}</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th style="width:60px">تم</th><th>الدرس</th><th style="width:80px">الصفحة</th><th style="width:170px">تاريخ التدريس</th><th>ملاحظات</th><th style="width:90px"></th></tr></thead><tbody>
        ${u.lessons.map(l => {
          const p = done.get(l.id);
          return `<tr data-l="${l.id}">
            <td><input type="checkbox" data-a="chk" ${p ? 'checked' : ''} aria-label="تم تدريس ${esc(l.title)}" style="width:20px;height:20px"></td>
            <td><b>${esc(l.title)}</b></td><td>${ar(l.page)}</td>
            <td><input type="date" class="input" data-a="date" value="${p ? esc(p.taught_on) : ''}" ${p ? '' : 'disabled'}></td>
            <td><input class="input" data-a="notes" value="${esc(p && p.notes || '')}" placeholder="${p ? 'ملاحظة…' : ''}" ${p ? '' : 'disabled'}></td>
            <td><a class="btn sm" href="presentation.html?lesson=${l.id}&class=${cid}">▶ عرض</a></td></tr>`;
        }).join('')}</tbody></table></div></div>`).join('')}`;
    main.querySelector('#pg-cls').onchange = e => { state.progressClass = e.target.value; VIEWS.progress(); };
    main.querySelectorAll('tr[data-l]').forEach(tr => {
      const lid = tr.dataset.l;
      const chk = tr.querySelector('[data-a="chk"]'), date = tr.querySelector('[data-a="date"]'), notes = tr.querySelector('[data-a="notes"]');
      chk.onchange = () => {
        if (chk.checked) { const p = DB.markTaught(cid, lid); date.value = p.taught_on; date.disabled = notes.disabled = false; notes.placeholder = 'ملاحظة…'; }
        else { DB.unmarkTaught(cid, lid); date.value = ''; notes.value = ''; date.disabled = notes.disabled = true; notes.placeholder = ''; }
        saved();
        main.querySelector('.stat .v').textContent = `${ar(DB.listProgress(cid).length)} / ${ar(LESSONS_ALL.length)}`;
      };
      date.onchange = () => { if (date.value) { DB.markTaught(cid, lid, date.value); saved(); } };
      notes.onchange = () => { DB.markTaught(cid, lid, date.value, notes.value.trim() || null); saved(); };
    });
  };

  // =================================================================
  // استيراد بيانات الفصول
  // =================================================================
  VIEWS.import = () => {
    const classes = DB.listClasses();
    main.innerHTML = title('استيراد بيانات الفصول 📥') + `
      <div class="card">
        <h3>١) رفع ملف Excel أو CSV</h3>
        <p class="muted">الأعمدة المطلوبة: <b>${IE.HEAD.join(' | ')}</b> (رقم البطاقة اختياري ويُرقَّم تلقائيًا إن تُرك فارغًا). الفصول غير الموجودة تُنشأ تلقائيًا.</p>
        <div class="row" style="margin-bottom:14px"><button class="btn" id="tpl">⬇️ تنزيل القالب (قالب_الطالبات.xlsx)</button></div>
        <label class="dropzone" id="dz">
          <div style="font-size:2.2rem">📄</div>
          <b>اسحبي الملف هنا أو انقري للاختيار</b>
          <div class="muted small">xlsx أو xls أو csv</div>
          <input type="file" id="file" accept=".xlsx,.xls,.csv" hidden>
        </label>
        <div id="preview"></div>
      </div>
      <div class="card">
        <h3>٢) لصق الأسماء في فصل</h3>
        <p class="muted">انسخي عمود الأسماء من أي مكان والصقيه هنا (اسم في كل سطر).</p>
        <div class="row" style="margin-bottom:10px">
          <select class="input" id="pt-cls" style="width:auto;min-width:200px">${classes.length ? classOptions(classes[0].id) : ''}<option value="__new">➕ فصل جديد…</option></select>
          <input class="input" id="pt-new" placeholder="اسم الفصل الجديد" style="width:220px" ${classes.length ? 'hidden' : ''}>
        </div>
        <textarea class="input" id="pt-text" placeholder="نورة محمد&#10;سارة عبدالله&#10;…"></textarea>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="pt-go">➕ إضافة الأسماء</button><span class="muted small" id="pt-msg"></span></div>
      </div>`;
    main.querySelector('#tpl').onclick = IE.downloadTemplate;
    const dz = main.querySelector('#dz'), file = main.querySelector('#file');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
    file.onchange = () => { if (file.files[0]) handle(file.files[0]); file.value = ''; };

    async function handle(f) {
      if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { toast('الملف يجب أن يكون xlsx أو xls أو csv', 'err'); return; }
      let rows;
      try { rows = await IE.readFile(f); } catch (e) { toast('تعذّرت قراءة الملف. تأكدي أنه ملف Excel صالح.', 'err'); return; }
      if (!rows) return;
      if (!rows.length) { toast('لم نجد بيانات في الملف', 'err'); return; }
      state.importPreview = IE.validate(rows);
      showPreview();
    }
    function showPreview() {
      const box = main.querySelector('#preview');
      const v = state.importPreview;
      if (!v) { box.innerHTML = ''; return; }
      const label = { ok: '<span class="pill good">✓ صالحة</span>', warn: '<span class="pill warn">⚠️ مكررة</span>', bad: '<span class="pill bad">✕ خطأ</span>' };
      box.innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
        <h3>معاينة قبل الحفظ</h3>
        <div class="row" style="margin-bottom:12px">
          <span class="pill good">✓ صالحة: ${ar(v.counts.ok)}</span>
          <span class="pill warn">⚠️ مكررة: ${ar(v.counts.warn)}</span>
          <span class="pill bad">✕ أخطاء: ${ar(v.counts.bad)}</span>
          ${v.newClasses.length ? `<span class="pill">🏫 فصول جديدة: ${v.newClasses.map(esc).join('، ')}</span>` : ''}
        </div>
        <div class="table-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>#</th><th>اسم الفصل</th><th>اسم الطالبة</th><th>رقم البطاقة</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>
          ${v.items.map(i => `<tr class="${i.status === 'ok' ? '' : i.status}"><td>${ar(i.n)}</td><td>${esc(i.className) || '<span class="err">—</span>'}${i.isNewClass && i.status !== 'bad' ? ' <span class="pill">جديد</span>' : ''}</td><td>${esc(i.name) || '<span class="err">—</span>'}</td><td>${i.card ? ar(i.card) : '<span class="muted">تلقائي</span>'}</td><td>${label[i.status]}</td><td class="small">${esc(i.msg)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="row" style="margin-top:14px">
          ${v.counts.warn ? `<label class="row small" style="gap:6px"><input type="checkbox" id="inc-warn"> استيراد المكررات أيضًا</label>` : ''}
          <span class="grow"></span>
          <button class="btn" id="cancel-imp">إلغاء</button>
          <button class="btn primary" id="do-imp">✓ تأكيد الحفظ</button>
        </div>`;
      const btn = box.querySelector('#do-imp'), inc = box.querySelector('#inc-warn');
      const paint = () => { const n = v.counts.ok + (inc && inc.checked ? v.counts.warn : 0); btn.textContent = `✓ تأكيد حفظ ${ar(n)} طالبة`; btn.disabled = !n; };
      if (inc) inc.onchange = paint; paint();
      box.querySelector('#cancel-imp').onclick = () => { state.importPreview = null; showPreview(); };
      btn.onclick = () => {
        const r = IE.commit(v.items, { includeWarn: inc && inc.checked });
        state.importPreview = null; saved();
        box.innerHTML = `<div class="card" style="background:var(--good-bg);box-shadow:none;margin-top:16px">✅ تمت إضافة ${ar(r.students)} طالبة${r.classes ? ` وإنشاء ${ar(r.classes)} فصل جديد` : ''}. <a href="#students">عرض الطالبات</a></div>`;
      };
    }
    showPreview();

    const ptCls = main.querySelector('#pt-cls'), ptNew = main.querySelector('#pt-new');
    if (!classes.length) ptCls.value = '__new';
    ptCls.onchange = () => { ptNew.hidden = ptCls.value !== '__new'; };
    main.querySelector('#pt-go').onclick = () => {
      const text = main.querySelector('#pt-text').value;
      const msg = main.querySelector('#pt-msg');
      let cid = ptCls.value;
      if (!text.trim()) { toast('الصقي الأسماء أولًا', 'err'); return; }
      if (cid === '__new') {
        const name = ptNew.value.trim();
        if (!name) { toast('اكتبي اسم الفصل الجديد', 'err'); return; }
        const ex = DB.listClasses().find(c => IE.norm(c.name) === IE.norm(name));
        cid = ex ? ex.id : DB.createClass({ name, color: IE.COLORS[DB.listClasses().length % IE.COLORS.length] }).id;
      }
      const v = IE.pasteNames(cid, text);
      const r = IE.commit(v.items);
      saved();
      main.querySelector('#pt-text').value = '';
      msg.textContent = `أُضيفت ${ar(r.students)} طالبة${v.counts.warn ? ` · تم تجاهل ${ar(v.counts.warn)} اسمًا مكررًا` : ''}.`;
      if (ptCls.value === '__new') VIEWS.import();
    };
  };

  // =================================================================
  // بليكرز
  // =================================================================
  VIEWS.plickers = () => {
    const classes = DB.listClasses();
    if (state.plkClass && !classes.some(c => c.id === state.plkClass)) state.plkClass = '';
    const resp = DB.getPlickersResponses(state.plkClass ? { class_id: state.plkClass } : {});
    const nQ = LESSONS_ALL.reduce((a, x) => a + x.lesson.slides.filter(s => s.type === 'plickers').length, 0);
    main.innerHTML = title('بليكرز 📊', `<button class="btn" id="exp-q">⬇️ تصدير أسئلة بليكرز</button><button class="btn" id="print">🖨️ طباعة بطاقات توزيع</button>`) + `
      <div class="card">
        <h3>كيف يعمل وضع بليكرز؟</h3>
        <ol class="muted" style="margin:0;padding-inline-start:1.3em">
          <li>صدّري الأسئلة من الزر أعلاه وانسخيها إلى موقع Plickers (${ar(nQ)} سؤالًا جاهزًا، كلها بأربعة خيارات A–D).</li>
          <li>اطبعي ورقة التوزيع لتعرف كل طالبة رقم بطاقتها.</li>
          <li>في العرض، عند شريحة بليكرز: ترفع الطالبات البطاقات وتمسحين الفصل بتطبيق Plickers على الجوال.</li>
          <li>اضغطي «📝 تسجيل النتائج» وسجّلي حرف كل طالبة، فتظهر نسبة الصواب والمفهوم الخاطئ الشائع.</li>
        </ol>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">دقة الإجابات لكل درس</h3>
          <select class="input" id="plk-cls" style="width:auto;min-width:200px">${classOptions(state.plkClass, true)}</select></div>
        ${bars(LESSONS_ALL.map(x => {
          const r = resp.filter(y => y.lesson_id === x.lesson.id);
          return r.length ? { label: x.lesson.title, value: pct(r.filter(y => y.is_correct).length, r.length), tip: `${ar(r.length)} إجابة` } : null;
        }).filter(Boolean), 'لم تُسجَّل نتائج بعد لهذا الاختيار.')}
      </div>
      <div class="card"><h3>تفاصيل الأسئلة</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الدرس</th><th>السؤال</th><th>الإجابات</th><th>الصواب</th><th>أكثر خيار خاطئ</th></tr></thead><tbody>
        ${(() => {
          const qmap = UI.plickersIndex();
          const rows = [];
          qmap.forEach(({ q, lesson }, id) => {
            const r = resp.filter(y => y.question_id === id);
            if (!r.length) return;
            const wrong = {}; r.filter(y => !y.is_correct).forEach(y => { wrong[y.answer] = (wrong[y.answer] || 0) + 1; });
            const w = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
            const p = pct(r.filter(y => y.is_correct).length, r.length);
            rows.push(`<tr><td class="small">${esc(lesson.title)}</td><td>${esc(q.question)}</td><td>${ar(r.length)}</td>
              <td><span class="pill ${p >= 70 ? 'good' : p >= 40 ? 'warn' : 'bad'}">${ar(p)}٪</span></td>
              <td class="small">${w ? `${w[0]} (${ar(w[1])})` : '—'}</td></tr>`);
          });
          return rows.join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">لا توجد نتائج بعد.</td></tr>';
        })()}
        </tbody></table></div></div>`;
    main.querySelector('#plk-cls').onchange = e => { state.plkClass = e.target.value; VIEWS.plickers(); };
    main.querySelector('#exp-q').onclick = exportQuestionsDialog;
    main.querySelector('#print').onclick = printDialog;
  };

  async function exportQuestionsDialog() {
    const v = await modal({
      title: 'تصدير أسئلة بليكرز',
      body: `<div class="field"><label for="eq-l">الدرس</label><select class="input" id="eq-l"><option value="">كل الدروس</option>
        ${LESSONS.units.map(u => `<optgroup label="${esc(u.cover.kicker)}: ${esc(u.title)}">${u.lessons.map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('')}</optgroup>`).join('')}</select></div>
        <p class="muted small">ملف النص مرتّب للنسخ المباشر إلى موقع Plickers، وملف CSV يُفتح في Excel.</p>`,
      actions: [
        { label: '📄 ملف نص', kind: 'primary', value: m => ({ l: m.querySelector('#eq-l').value, f: 'txt' }) },
        { label: '📊 ملف CSV', value: m => ({ l: m.querySelector('#eq-l').value, f: 'csv' }) },
        { label: 'إلغاء', value: null }],
    });
    if (v) IE.exportPlickersQuestions(v.l || null, v.f);
  }
  async function printDialog() {
    const classes = DB.listClasses();
    if (!classes.length) { toast('أضيفي فصولك أولًا', 'err'); return; }
    const ids = await modal({
      title: 'طباعة بطاقات التوزيع',
      body: `<p class="muted">اختاري الفصول (كل فصل في صفحة مستقلة):</p>${classes.map(c => `<label class="row" style="padding:.3em 0"><input type="checkbox" value="${c.id}" checked> ${esc(c.name)} <span class="muted small">(${ar(c.student_count)} طالبة)</span></label>`).join('')}`,
      actions: [{ label: '🖨️ طباعة', kind: 'primary', value: m => [...m.querySelectorAll('input:checked')].map(i => i.value) }, { label: 'إلغاء', value: null }],
    });
    if (ids && ids.length) IE.printCards(ids);
  }

  // =================================================================
  // التصدير
  // =================================================================
  VIEWS.export = () => {
    const classes = DB.listClasses();
    main.innerHTML = title('التصدير 📤') + `
      <div class="card">
        <h3>📗 تقرير Excel شامل</h3>
        <p class="muted">ملف واحد يحتوي الأوراق التالية:</p>
        <ul class="muted">
          <li><b>بيانات المعلمة</b>: الاسم والمدرسة والمادة والعام والفصل الدراسي.</li>
          <li><b>ورقة لكل فصل</b> (${ar(classes.length)}): رقم البطاقة، الاسم، النقاط، الإجابات الصحيحة، مرات الاختيار، دقة بليكرز، الملاحظات.</li>
          <li><b>الدروس المنجزة</b>: الفصل والدرس وتاريخ التدريس.</li>
          <li><b>نتائج بليكرز</b>: كل إجابة مسجّلة مع صحتها.</li>
        </ul>
        <button class="btn primary" id="x-all">⬇️ تصدير Excel</button>
      </div>
      <div class="card"><h3>📊 بليكرز</h3><div class="row">
        <button class="btn" id="x-q">⬇️ تصدير أسئلة بليكرز</button>
        <button class="btn" id="x-p">🖨️ طباعة بطاقات توزيع</button></div></div>`;
    main.querySelector('#x-all').onclick = () => { IE.exportWorkbook(); };
    main.querySelector('#x-q').onclick = exportQuestionsDialog;
    main.querySelector('#x-p').onclick = printDialog;
  };

  render();
})();
