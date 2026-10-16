// =====================================================================
// أدوات واجهة مشتركة: رسائل التنبيه، النوافذ الحوارية، شارة الاتصال، الأرقام العربية
// (لا نستخدم alert أو confirm الخاصة بالمتصفح إطلاقًا)
// =====================================================================
(function () {
  const AR = '٠١٢٣٤٥٦٧٨٩';
  // تحويل الأرقام الإنجليزية إلى عربية: 12 → ١٢
  const ar = v => String(v).replace(/\d/g, d => AR[d]);
  // تحويل الأرقام العربية إلى إنجليزية (لقراءة مدخلات المستخدمة)
  const en = v => String(v == null ? '' : v).replace(/[٠-٩]/g, d => AR.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  // حماية النصوص قبل إدراجها في الصفحة
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  // ---------- رسالة سريعة ----------
  function toast(msg, kind) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = el('<div class="toast-wrap" role="status" aria-live="polite"></div>'); document.body.appendChild(wrap); }
    const t = el(`<div class="toast ${kind || 'ok'}">${esc(msg)}</div>`);
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }
  const saved = () => toast('تم الحفظ ✓');

  // ---------- نافذة حوارية عامة ----------
  // modal({ title, body (HTML), actions: [{label, kind, value}] }) → Promise بقيمة الزر
  function modal({ title, body, actions, wide, onOpen }) {
    return new Promise(resolve => {
      const m = el(`<div class="modal-back" role="dialog" aria-modal="true">
        <div class="modal ${wide ? 'wide' : ''}">
          <div class="modal-head"><h3>${esc(title || '')}</h3><button class="icon-btn modal-x" aria-label="إغلاق">✕</button></div>
          <div class="modal-body">${body || ''}</div>
          <div class="modal-actions"></div>
        </div></div>`);
      const box = m.querySelector('.modal-actions');
      (actions || [{ label: 'حسنًا', kind: 'primary', value: true }]).forEach(a => {
        const b = el(`<button class="btn ${a.kind || ''}">${esc(a.label)}</button>`);
        b.onclick = () => close(typeof a.value === 'function' ? a.value(m) : a.value);
        box.appendChild(b);
      });
      function close(v) {
        if (v === undefined) return; // زر يمنع الإغلاق (مثلاً عند خطأ في المدخلات)
        m.classList.add('out'); document.removeEventListener('keydown', onKey, true);
        setTimeout(() => m.remove(), 180); resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); } }
      m.querySelector('.modal-x').onclick = () => close(null);
      m.addEventListener('mousedown', e => { if (e.target === m) close(null); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(m);
      const first = m.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 50);
      if (onOpen) onOpen(m, close);
    });
  }
  const confirmBox = (title, text, okLabel, danger) => modal({
    title, body: `<p>${esc(text)}</p>`,
    actions: [{ label: okLabel || 'تأكيد', kind: danger ? 'danger' : 'primary', value: true }, { label: 'إلغاء', value: false }],
  });

  // ---------- شارة حالة الاتصال ----------
  function mountStatusBadge(target) {
    const b = el('<span class="net-badge" title="حالة الاتصال"></span>');
    (target || document.body).appendChild(b);
    DB.onStatus(st => {
      b.className = 'net-badge ' + st;
      b.textContent = st === 'demo' ? 'وضع تجريبي (محلي)' : st === 'offline' ? 'غير متصل – سيتم الحفظ لاحقًا'
        : st === 'pending' ? 'جارٍ الحفظ…' : 'متصل ✓';
    });
    return b;
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function qs(name) { return new URLSearchParams(location.search).get(name); }
  function fmtDate(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-arab', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return ar(d); } }

  // فهرس كل الدروس بالترتيب (من data/lessons.js)
  function lessonIndex() {
    const out = [];
    ((window.LESSONS && window.LESSONS.units) || []).forEach((u, ui) => u.lessons.forEach((l, li) =>
      out.push({ unit: u, lesson: l, unitNo: ui + 1, lessonNo: li + 1 })));
    return out;
  }
  // كل أسئلة بليكرز: question_id → { q, lesson, unit }
  function plickersIndex() {
    const map = new Map();
    lessonIndex().forEach(({ unit, lesson }) => lesson.slides.forEach(s => { if (s.type === 'plickers') map.set(s.id, { q: s, lesson, unit }); }));
    return map;
  }

  window.UI = { ar, en, esc, el, toast, saved, modal, confirmBox, mountStatusBadge, download, qs, fmtDate, lessonIndex, plickersIndex };
})();
