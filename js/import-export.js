// =====================================================================
// الاستيراد والتصدير: قالب الطالبات، قراءة ملفات Excel/CSV، تصدير التقرير،
// تصدير أسئلة بليكرز، وطباعة بطاقات التوزيع. تعتمد على مكتبة SheetJS (XLSX).
// =====================================================================
(function () {
  const { ar, en, esc, toast, download } = UI;
  const HEAD = ['اسم الفصل', 'اسم الطالبة', 'رقم بطاقة بليكرز'];
  const COLORS = ['#2f6bff', '#e0457b', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#dc2626', '#db2777'];

  function needXLSX() {
    if (window.XLSX) return true;
    toast('تعذّر تحميل مكتبة Excel. تأكدي من الاتصال بالإنترنت ثم أعيدي تحميل الصفحة.', 'err');
    return false;
  }
  function newBook() { const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; return wb; }
  function addSheet(wb, name, rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
    ws['!views'] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(wb, name));
  }
  // أسماء الأوراق في Excel: ٣١ حرفًا كحد أقصى، بلا رموز ممنوعة، وغير مكررة
  function safeSheetName(wb, name) {
    let base = String(name).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'ورقة';
    let n = base, k = 2;
    while (wb.SheetNames.includes(n)) n = base.slice(0, 27) + ' (' + k++ + ')';
    return n;
  }

  // توحيد الاسم للمقارنة: إزالة التشكيل والتطويل وتوحيد الألف والتاء المربوطة والياء
  function norm(s) {
    return String(s == null ? '' : s).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------------
  // القالب
  // ------------------------------------------------------------------
  function downloadTemplate() {
    if (!needXLSX()) return;
    const wb = newBook();
    addSheet(wb, 'الطالبات', [HEAD, ['أول ثانوي ١', 'اكتبي اسم الطالبة هنا', 1], ['أول ثانوي ١', '', ''], ['أول ثانوي ٢', '', '']], [18, 32, 18]);
    addSheet(wb, 'تعليمات', [
      ['تعليمات تعبئة القالب'],
      ['١) اكتبي في كل صف: اسم الفصل، ثم اسم الطالبة.'],
      ['٢) رقم بطاقة بليكرز اختياري؛ إن تُرك فارغًا يُرقَّم تلقائيًا (١، ٢، ٣…) لكل فصل.'],
      ['٣) الفصول غير الموجودة تُنشأ تلقائيًا عند الاستيراد.'],
      ['٤) احذفي الصف التجريبي قبل الرفع.'],
      ['ملاحظة: يُقرأ أول ورقة فيها الأعمدة المطلوبة فقط، وتُتجاهل ورقة التعليمات.'],
    ], [80]);
    XLSX.writeFile(wb, 'قالب_الطالبات.xlsx');
  }

  // ------------------------------------------------------------------
  // قراءة الملف → صفوف { className, name, cardRaw }
  // ------------------------------------------------------------------
  async function readFile(file) {
    if (!needXLSX()) return null;
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    const wb = isCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const out = [];
    wb.SheetNames.forEach(sn => {
      if (/تعليمات/.test(sn)) return;
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
      if (!aoa.length) return;
      // البحث عن صف العناوين ضمن أول ٥ صفوف
      let hi = -1, map = null;
      for (let i = 0; i < Math.min(5, aoa.length); i++) {
        const m = mapHeader(aoa[i]);
        if (m.name >= 0) { hi = i; map = m; break; }
      }
      if (!map) map = { cls: 0, name: 1, card: 2 }; // بدون عناوين: الترتيب الافتراضي
      aoa.slice(hi + 1).forEach(r => {
        const name = clean(r[map.name]);
        const className = map.cls >= 0 ? clean(r[map.cls]) : clean(sn); // بلا عمود فصل: اسم الورقة هو الفصل
        const cardRaw = map.card >= 0 ? clean(r[map.card]) : '';
        if (!name && !(map.cls >= 0 && className) && !cardRaw) return; // صف فارغ
        out.push({ className, name, cardRaw });
      });
    });
    return out;
  }
  function mapHeader(row) {
    const m = { cls: -1, name: -1, card: -1 };
    row.forEach((h, i) => {
      const t = norm(h);
      if (!t) return;
      if (m.cls < 0 && /(فصل|الصف|شعبه|class)/.test(t)) m.cls = i;
      else if (m.card < 0 && /(بطاقه|بليكرز|card|plickers)/.test(t)) m.card = i;
      else if (m.name < 0 && /(اسم|الطالبه|name|student)/.test(t)) m.name = i;
    });
    return m;
  }

  // ------------------------------------------------------------------
  // التحقق قبل الحفظ
  // status: ok | warn (مكررة – تُتجاهل افتراضيًا) | bad (خطأ – لا تُحفظ)
  // ------------------------------------------------------------------
  function validate(rows) {
    const classes = DB.listClasses();
    const byNorm = new Map(classes.map(c => [norm(c.name), c]));
    const names = new Map();  // فصل → أسماء موجودة
    const cards = new Map();  // فصل → أرقام بطاقات مستخدمة
    classes.forEach(c => {
      const st = DB.listStudents(c.id);
      names.set(norm(c.name), new Set(st.map(s => norm(s.full_name))));
      cards.set(norm(c.name), new Set(st.map(s => s.plickers_card_number).filter(Boolean)));
    });
    const seen = new Set();
    const items = rows.map((r, i) => {
      const it = { n: i + 1, className: r.className, name: r.name, card: null, status: 'ok', msg: '' };
      const nc = norm(r.className);
      if (!r.name) { it.status = 'bad'; it.msg = 'اسم الطالبة فارغ'; return it; }
      if (!r.className) { it.status = 'bad'; it.msg = 'اسم الفصل مفقود'; return it; }
      it.isNewClass = !byNorm.has(nc);
      const key = nc + '|' + norm(r.name);
      if (seen.has(key)) { it.status = 'warn'; it.msg = 'مكررة في الملف'; }
      else if (names.has(nc) && names.get(nc).has(norm(r.name))) { it.status = 'warn'; it.msg = 'موجودة مسبقًا في هذا الفصل'; }
      seen.add(key);
      if (r.cardRaw) {
        const num = parseInt(en(r.cardRaw), 10);
        if (!(num > 0) || String(num) !== en(r.cardRaw).replace(/^0+/, '')) addMsg(it, 'رقم البطاقة غير صالح – سيُرقَّم تلقائيًا');
        else {
          if (!cards.has(nc)) cards.set(nc, new Set());
          if (cards.get(nc).has(num)) addMsg(it, 'رقم البطاقة مستخدم – سيُرقَّم تلقائيًا');
          else if (it.status === 'ok') { it.card = num; cards.get(nc).add(num); }
        }
      }
      return it;
    });
    const newClasses = [...new Set(items.filter(i => i.status !== 'bad' && i.isNewClass).map(i => i.className))];
    const counts = { ok: 0, warn: 0, bad: 0 };
    items.forEach(i => counts[i.status]++);
    return { items, newClasses, counts };
  }
  const addMsg = (it, m) => { it.msg = it.msg ? it.msg + '، ' + m : m; };

  // الحفظ: إنشاء الفصول الناقصة ثم إضافة الطالبات دفعة واحدة
  function commit(items, { includeWarn } = {}) {
    const take = items.filter(i => i.status === 'ok' || (includeWarn && i.status === 'warn'));
    const classMap = new Map(DB.listClasses().map(c => [norm(c.name), c.id]));
    let created = 0;
    take.forEach(i => {
      const nc = norm(i.className);
      if (!classMap.has(nc)) {
        const c = DB.createClass({ name: i.className, color: COLORS[(classMap.size) % COLORS.length] });
        classMap.set(nc, c.id); created++;
      }
    });
    // ترقيم البطاقات الناقصة: أول رقم غير مستخدم في الفصل
    const used = new Map();
    const usedFor = cid => {
      if (!used.has(cid)) used.set(cid, new Set(DB.listStudents(cid).map(s => s.plickers_card_number).filter(Boolean)));
      return used.get(cid);
    };
    take.forEach(i => { if (i.card) usedFor(classMap.get(norm(i.className))).add(i.card); });
    const rows = take.map(i => {
      const cid = classMap.get(norm(i.className));
      let card = i.card;
      if (!card) { const u = usedFor(cid); card = 1; while (u.has(card)) card++; u.add(card); }
      return { class_id: cid, full_name: i.name, plickers_card_number: card };
    });
    if (rows.length) DB.bulkInsertStudents(rows);
    return { students: rows.length, classes: created };
  }

  // لصق الأسماء (اسم في كل سطر) داخل فصل محدد
  function pasteNames(classId, text) {
    const cls = DB.getClass(classId);
    const lines = String(text).split(/\r?\n/).map(clean).filter(Boolean);
    return validate(lines.map(name => ({ className: cls.name, name, cardRaw: '' })));
  }

  // ------------------------------------------------------------------
  // تصدير التقرير الكامل إلى Excel
  // ------------------------------------------------------------------
  function exportWorkbook() {
    if (!needXLSX()) return;
    const p = DB.getProfile();
    const classes = DB.listClasses();
    const lessons = UI.lessonIndex();
    const lmap = new Map(lessons.map(x => [x.lesson.id, x]));
    const qmap = UI.plickersIndex();
    const cname = new Map(classes.map(c => [c.id, c.name]));
    const students = new Map(DB.listStudents().map(s => [s.id, s]));
    const wb = newBook();

    addSheet(wb, 'بيانات المعلمة', [
      ['البيان', 'القيمة'],
      ['اسم المعلمة', p.full_name || ''], ['المدرسة', p.school_name || ''], ['المادة', p.subject || ''],
      ['العام الدراسي', p.academic_year || ''], ['الفصل الدراسي', p.term || ''],
      ['البريد الإلكتروني', (DB.viewing ? DB.viewing.email : DB.user && DB.user.email) || ''],
      ['عدد الفصول', classes.length], ['عدد الطالبات', students.size],
      ['تاريخ التصدير', DB.today()],
    ], [22, 40]);

    classes.forEach(c => {
      const rows = [['رقم البطاقة', 'اسم الطالبة', 'مجموع النقاط', 'الإجابات الصحيحة', 'مرات الاختيار بالقرعة', 'إجابات بليكرز', 'الصحيحة في بليكرز', 'دقة بليكرز ٪', 'ملاحظات']];
      DB.getStudentStats(c.id).forEach(s => rows.push([s.plickers_card_number || '', s.full_name, s.total_points, s.correct_answers, s.times_picked, s.plickers_total, s.plickers_correct, s.plickers_accuracy == null ? '' : s.plickers_accuracy, s.notes || '']));
      addSheet(wb, c.name, rows, [12, 30, 13, 15, 18, 13, 16, 13, 30]);
    });

    const prog = [['الفصل', 'الوحدة', 'الدرس', 'صفحة الكتاب', 'تاريخ التدريس', 'ملاحظات']];
    DB.listProgress().slice().sort((a, b) => String(a.taught_on).localeCompare(String(b.taught_on))).forEach(r => {
      const l = lmap.get(r.lesson_id);
      prog.push([cname.get(r.class_id) || '', l ? l.unit.title : '', l ? l.lesson.title : r.lesson_id, l ? l.lesson.page : '', r.taught_on || '', r.notes || '']);
    });
    addSheet(wb, 'الدروس المنجزة', prog, [18, 34, 34, 12, 14, 30]);

    const plk = [['الفصل', 'الوحدة', 'الدرس', 'رقم السؤال', 'نص السؤال', 'رقم البطاقة', 'اسم الطالبة', 'الإجابة', 'الإجابة الصحيحة', 'النتيجة', 'التاريخ']];
    DB.getPlickersResponses().forEach(r => {
      const q = qmap.get(r.question_id), s = students.get(r.student_id);
      plk.push([cname.get(r.class_id) || '', q ? q.unit.title : '', q ? q.lesson.title : r.lesson_id, r.question_id, q ? q.q.question : '',
        s ? s.plickers_card_number || '' : '', s ? s.full_name : '', r.answer, q ? q.q.answer : '', r.is_correct ? 'صحيحة' : 'خاطئة', String(r.created_at || '').slice(0, 10)]);
    });
    addSheet(wb, 'نتائج بليكرز', plk, [16, 28, 28, 12, 50, 12, 28, 9, 14, 10, 12]);

    XLSX.writeFile(wb, `تقرير_الفصول_${DB.today()}.xlsx`);
  }

  // ------------------------------------------------------------------
  // تصدير أسئلة بليكرز (CSV أو نص جاهز للنسخ إلى موقع Plickers)
  // ------------------------------------------------------------------
  function exportPlickersQuestions(lessonId, format) {
    const list = UI.lessonIndex().filter(x => !lessonId || x.lesson.id === lessonId);
    const qs = [];
    list.forEach(x => x.lesson.slides.filter(s => s.type === 'plickers').forEach((s, k) => qs.push({ x, s, k: k + 1 })));
    if (!qs.length) { toast('لا توجد أسئلة بليكرز', 'err'); return; }
    const suffix = lessonId ? lessonId : 'كل_الدروس';
    if (format === 'csv') {
      const cell = v => '"' + String(v).replace(/"/g, '""') + '"';
      const lines = [['الوحدة', 'الدرس', 'رقم السؤال', 'السؤال', 'A', 'B', 'C', 'D', 'الإجابة الصحيحة'].map(cell).join(',')];
      qs.forEach(({ x, s, k }) => lines.push([x.unit.title, x.lesson.title, k, s.question, ...s.options, s.answer].map(cell).join(',')));
      download(`أسئلة_بليكرز_${suffix}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    } else {
      let out = '', last = null;
      qs.forEach(({ x, s, k }) => {
        if (last !== x.lesson.id) { out += `\n===== ${x.unit.cover.kicker} – ${x.lesson.title} (ص ${x.lesson.page}) =====\n\n`; last = x.lesson.id; }
        out += `${k}) ${s.question}\n` + s.options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n') + `\nالإجابة الصحيحة: ${s.answer}\n\n`;
      });
      download(`أسئلة_بليكرز_${suffix}.txt`, '﻿' + out.trim() + '\n');
    }
  }

  // ------------------------------------------------------------------
  // طباعة بطاقات التوزيع: كل طالبة ورقم بطاقتها لكل فصل
  // ------------------------------------------------------------------
  function printCards(classIds) {
    const area = document.getElementById('print-area');
    const p = DB.getProfile();
    area.innerHTML = classIds.map(id => {
      const c = DB.getClass(id); if (!c) return '';
      const st = DB.listStudents(id);
      return `<section><h2>بطاقات بليكرز – ${esc(c.name)}</h2>
        <p>${esc(p.full_name || '')} ${p.school_name ? '· ' + esc(p.school_name) : ''} · عدد الطالبات: ${ar(st.length)}</p>
        <table><thead><tr><th style="width:110px">رقم البطاقة</th><th>اسم الطالبة</th><th style="width:150px">الاستلام ✓</th></tr></thead>
        <tbody>${st.map(s => `<tr><td style="text-align:center;font-weight:700">${ar(s.plickers_card_number || '–')}</td><td>${esc(s.full_name)}</td><td></td></tr>`).join('')}</tbody></table></section>`;
    }).join('');
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }

  window.IE = { HEAD, COLORS, norm, downloadTemplate, readFile, validate, commit, pasteNames, exportWorkbook, exportPlickersQuestions, printCards };
})();
