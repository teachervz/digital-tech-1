// =====================================================================
// وضع بليكرز: يعمل بجانب تطبيق Plickers الحقيقي (لا توجد واجهة برمجية عامة له)
// المعلمة تمسح البطاقات بتطبيق الجوال، ثم تسجّل إجابة كل طالبة هنا (A/B/C/D)
// فتُحفظ في جدول plickers_responses ويظهر توزيع الإجابات ونسبة الصواب.
// =====================================================================
(function () {
  const { ar, esc, el, toast, saved } = UI;
  const LAT = ['A', 'B', 'C', 'D'];
  const LET = ['أ', 'ب', 'ج', 'د'];
  let panel = null;
  const has = t => t && String(t).trim() && String(t).trim() !== '—';

  // ملخص نتائج سؤال: عدد الإجابات، نسبة الصواب، والتوزيع
  function summary(classId, lessonId, questionId) {
    const rows = DB.getPlickersResponses({ class_id: classId, lesson_id: lessonId, question_id: questionId });
    const dist = { A: 0, B: 0, C: 0, D: 0 };
    rows.forEach(r => { dist[r.answer] = (dist[r.answer] || 0) + 1; });
    const correct = rows.filter(r => r.is_correct).length;
    return { n: rows.length, correct, pct: rows.length ? Math.round(100 * correct / rows.length) : 0, dist };
  }

  function close() { if (panel) { panel.remove(); panel = null; } }
  const isOpen = () => !!panel;

  // open({ classId, lessonId, q: شريحة بليكرز, results: true لعرض النتائج مباشرة, onSaved })
  function open({ classId, lessonId, q, results, onSaved }) {
    const cls = classId && DB.getClass(classId);
    if (!cls) { toast('تسجيل نتائج بليكرز يحتاج فصلًا: أضيفي فصولك من لوحة المعلمة ثم اختاريه في المكتبة', 'err'); return; }
    const students = DB.listStudents(classId);
    if (!students.length) { toast('لا توجد طالبات في هذا الفصل بعد', 'err'); return; }
    close();

    // الإجابات الحالية (إن سبق التسجيل)
    const answers = {};
    students.forEach(s => { answers[s.id] = null; });
    DB.getPlickersResponses({ class_id: classId, lesson_id: lessonId, question_id: q.id })
      .forEach(r => { if (r.student_id in answers) answers[r.student_id] = r.answer; });

    panel = el(`<div class="plk-panel" role="dialog" aria-modal="true"><div class="plk-box">
      <div class="plk-top">
        <h3>📝 تسجيل نتائج بليكرز</h3><span class="pill">${esc(cls.name)}</span>
        <span class="grow"></span>
        <span class="small muted">للجميع:</span>
        ${LAT.map((L, i) => `<button class="btn sm" data-all="${L}">${L} · ${LET[i]}</button>`).join('')}
        <button class="btn sm ghost" data-all="">مسح الكل</button>
        <button class="icon-btn" data-a="close" aria-label="إغلاق">✕</button>
        <div style="flex-basis:100%" class="muted small">${esc(q.question)}</div>
      </div>
      <div data-view></div>
    </div></div>`);
    panel.addEventListener('mousedown', e => { if (e.target === panel) close(); });
    panel.querySelector('[data-a="close"]').onclick = close;
    panel.querySelectorAll('[data-all]').forEach(b => b.onclick = () => {
      students.forEach(s => { answers[s.id] = b.dataset.all || null; });
      if (!view.querySelector('.plk-grid')) showGrid(); else paintGrid();
    });
    document.body.appendChild(panel);
    const view = panel.querySelector('[data-view]');
    const counted = () => Object.values(answers).filter(Boolean).length;

    function showGrid() {
      view.innerHTML = `
        <div class="plk-grid">${students.map(s => `
          <div class="plk-st" data-id="${s.id}">
            <div class="nm"><span class="card-no">${ar(s.plickers_card_number || '–')}</span><span>${esc(s.full_name)}</span></div>
            <div class="abcd">${LAT.map(L => `<button data-l="${L}">${L}</button>`).join('')}</div>
          </div>`).join('')}</div>
        <div class="plk-foot">
          <button class="btn primary" data-a="save">💾 حفظ النتائج</button>
          <button class="btn" data-a="cancel">إلغاء</button>
          <span class="muted small" data-count></span>
          <span class="grow"></span>
          <span class="muted small">انقري الحرف مرة أخرى لإلغائه</span>
        </div>`;
      view.querySelectorAll('.plk-st').forEach(card => card.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
        const id = card.dataset.id;
        answers[id] = answers[id] === b.dataset.l ? null : b.dataset.l;
        paintGrid();
      }));
      view.querySelector('[data-a="cancel"]').onclick = close;
      view.querySelector('[data-a="save"]').onclick = save;
      paintGrid();
    }
    function paintGrid() {
      view.querySelectorAll('.plk-st').forEach(card => {
        const a = answers[card.dataset.id];
        card.classList.toggle('has', !!a);
        card.querySelectorAll('[data-l]').forEach(b => b.classList.toggle('on', b.dataset.l === a));
      });
      const c = view.querySelector('[data-count]');
      if (c) c.textContent = `تم إدخال ${ar(counted())} من ${ar(students.length)}`;
    }
    function save() {
      const existing = DB.getPlickersResponses({ class_id: classId, lesson_id: lessonId, question_id: q.id }).length;
      if (!counted() && !existing) { toast('لم تُدخلي أي إجابة بعد', 'err'); return; }
      DB.savePlickersResponses({ class_id: classId, lesson_id: lessonId, question_id: q.id, correct: q.answer, answers });
      saved();
      if (onSaved) onSaved();
      showResults();
    }

    function showResults() {
      const r = summary(classId, lessonId, q.id);
      const max = Math.max(1, ...LAT.map(L => r.dist[L]));
      const ci = LAT.indexOf(q.answer);
      const wrong = LAT.filter(L => L !== q.answer).sort((a, b) => r.dist[b] - r.dist[a])[0];
      view.innerHTML = `
        <div class="plk-result">
          <div class="row" style="justify-content:space-between">
            <h3 style="font-size:1.2rem">📊 توزيع الإجابات</h3>
            <span class="pill ${r.pct >= 70 ? 'good' : r.pct >= 40 ? 'warn' : 'bad'}" style="font-size:1rem">${ar(r.pct)}٪ إجابات صحيحة (${ar(r.correct)} من ${ar(r.n)})</span>
          </div>
          <div class="dist">${LAT.map(L => `<div class="col ${L === q.answer ? 'correct' : ''}"><span class="cnt">${ar(r.dist[L])}</span><div class="bar" style="height:0%" data-h="${(r.dist[L] / max) * 85}"></div></div>`).join('')}</div>
          <div class="dist-labels">${LAT.map((L, i) => `<span class="${L === q.answer ? 'ok' : ''}">${L} · ${LET[i]}${L === q.answer ? ' ✓' : ''}</span>`).join('')}</div>
          <p class="small muted" style="margin:10px 0 0">الإجابة الصحيحة: <b>${q.answer} (${LET[ci]})</b> – ${esc(q.options[ci] || '')}</p>
          ${r.pct < 100 && r.n ? `
            ${r.dist[wrong] ? `<div class="mis">⚠️ <b>أكثر إجابة خاطئة:</b> ${wrong} (${LET[LAT.indexOf(wrong)]}) – ${esc(q.options[LAT.indexOf(wrong)] || '')} · اختارتها ${ar(r.dist[wrong])} طالبة
              ${has(q.misconception) ? `<br><b>المفهوم الخاطئ الشائع:</b> ${esc(q.misconception)}` : ''}</div>` : ''}
            ${has(q.reteach) ? `<div class="tip">💡 <b>تلميح لإعادة الشرح:</b> ${esc(q.reteach)}</div>` : ''}` : r.n ? '<div class="tip">🎉 ممتاز! كل الطالبات أجبن إجابة صحيحة.</div>' : ''}
        </div>
        <div class="plk-foot">
          <button class="btn primary" data-a="close2">تم ✓</button>
          <button class="btn" data-a="edit">✏️ تعديل الإجابات</button>
        </div>`;
      requestAnimationFrame(() => view.querySelectorAll('.bar').forEach(b => { b.style.height = b.dataset.h + '%'; }));
      view.querySelector('[data-a="close2"]').onclick = close;
      view.querySelector('[data-a="edit"]').onclick = showGrid;
    }

    if (results && summary(classId, lessonId, q.id).n) showResults(); else showGrid();
  }

  window.Plickers = { open, close, isOpen, summary };
})();
