// =====================================================================
// طبقة البيانات: Firebase (تسجيل الدخول + قاعدة Firestore) مع نسخة محلية
// الفكرة: نحتفظ بنسخة من بيانات المعلمة في المتصفح، فنقرأ منها دائمًا (سريع ويعمل دون إنترنت)،
// وكل تعديل يُطبَّق محليًا فورًا ثم يُرسل إلى Firestore. عند انقطاع الإنترنت تحفظ Firestore
// التعديلات في المتصفح وترسلها تلقائيًا عند عودة الاتصال.
// إذا لم تُضبط إعدادات config.js يعمل التطبيق في "الوضع التجريبي" (محلي فقط).
// ملاحظة خصوصية: لا نطبع أسماء الطالبات في وحدة التحكم (console) أبدًا.
//
// شكل البيانات في Firestore (مستندات قليلة وكبيرة لتوفير عدد القراءات في الخطة المجانية):
//   teachers/{uid}                         ← الملف الشخصي للمعلمة
//   teachers/{uid}/classes/{classId}       ← الفصل + طالباته + نقاطهن + الدروس المنجزة
//   teachers/{uid}/plickers/{classId}__{lessonId} ← إجابات بليكرز لفصل في درس
// =====================================================================
(function () {
  const TABLES = ['teachers', 'classes', 'students', 'participation', 'plickers_responses', 'lesson_progress'];
  const cfg = (window.APP_CONFIG && window.APP_CONFIG.FIREBASE) || {};
  const configured = !!(cfg.apiKey && cfg.projectId && !String(cfg.apiKey).startsWith('YOUR_'));
  const MODE = configured && window.firebase ? 'cloud' : 'demo';
  // بريد المسؤولة (أو أكثر) التي تضيف حسابات المعلمات – يجب أن يطابق القائمة في firestore.rules
  const ADMIN_EMAILS = ((window.APP_CONFIG && window.APP_CONFIG.ADMIN_EMAILS) || []).map(e => String(e).trim().toLowerCase());

  let auth = null, fs = null;
  if (MODE === 'cloud') {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    fs = firebase.firestore();
    // اتصال "long polling" بدل البث المباشر: يعمل في Safari وفي شبكات المدارس التي تحجب البث
    try { fs.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) { /* تجاهل */ }
    // حفظ نسخة Firestore في المتصفح ليعمل التطبيق دون إنترنت
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => { /* متصفح لا يدعمها: نعتمد على النسخة المحلية */ });
  }

  // ---------- أدوات التخزين الآمن (محاطة بـ try/catch) ----------
  const ls = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } },
  };

  function uuid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* بديل أدناه */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  const nowIso = () => new Date().toISOString();
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  // ---------- الحالة ----------
  let user = null;            // { id, email }
  let viewing = null;         // عند عرض المسؤولة للوحة معلمة: { uid, email, full_name } (للعرض فقط)
  const dataId = () => (viewing ? viewing.uid : user.id);
  let store = emptyStore();   // نسخة البيانات المحلية بشكل جداول
  let pending = 0;            // عمليات حفظ لم يؤكدها الخادم بعد
  const listeners = new Set();
  const dataListeners = new Set();

  function emptyStore() { const s = {}; TABLES.forEach(t => s[t] = []); return s; }
  const storeKey = () => `tq_store_v2_${user ? user.id : 'none'}`;
  function persist() { if (!viewing) ls.set(storeKey(), store); }
  function loadLocal() { store = viewing ? emptyStore() : Object.assign(emptyStore(), ls.get(storeKey(), {})); }

  // ---------- حالة الاتصال ----------
  function status() {
    if (MODE === 'demo') return 'demo';
    if (!navigator.onLine) return 'offline';
    return pending ? 'pending' : 'online';
  }
  function emit() { listeners.forEach(fn => { try { fn(status()); } catch (e) { /* تجاهل */ } }); }
  function onStatus(fn) { listeners.add(fn); fn(status()); return () => listeners.delete(fn); }
  // تُستدعى بعد وصول بيانات أحدث من الخادم
  function onData(fn) { dataListeners.add(fn); return () => dataListeners.delete(fn); }
  function emitData() { dataListeners.forEach(fn => { try { fn(); } catch (e) { /* تجاهل */ } }); }
  addEventListener('online', () => { emit(); pullAll(); });
  addEventListener('offline', emit);

  // ---------- المصادقة ----------
  let authReady = null;
  function waitAuth() {
    if (!authReady) authReady = new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
    return authReady;
  }
  async function getSession() {
    if (MODE === 'demo') {
      const s = ls.get('tq_demo_session', null);
      user = s ? { id: 'demo-teacher', email: s.email || 'demo@local' } : null;
    } else {
      const u = await waitAuth();
      user = u ? { id: u.uid, email: u.email } : null;
    }
    if (user) loadLocal();
    return user;
  }

  async function signIn(email, password) {
    if (MODE === 'demo') {
      ls.set('tq_demo_session', { email: email || 'demo@local' });
      await getSession();
      return { user };
    }
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      authReady = Promise.resolve(cred.user);
      user = { id: cred.user.uid, email: cred.user.email };
      const access = await checkAccess(true);
      if (!access.ok) { await signOut(); return { error: access.error }; }
      loadLocal();
      await pullAll();
      ensureProfile(access.staff);
      return { user, mustChange: !!access.mustChange };
    } catch (e) { return { error: translateAuthError(e) }; }
  }

  // نسيت كلمة المرور: يرسل Firebase رابط تعيين كلمة مرور جديدة إلى البريد
  async function resetPassword(email) {
    if (MODE === 'demo') return { error: 'غير متاح في الوضع التجريبي.' };
    try { auth.languageCode = 'ar'; await auth.sendPasswordResetEmail(email); return { ok: true }; }
    catch (e) { return { error: translateAuthError(e) }; }
  }

  // ---------- تغيير كلمة المرور المؤقتة عند أول دخول ----------
  async function changePassword(newPassword) {
    if (MODE !== 'cloud') return { ok: true };
    try { await auth.currentUser.updatePassword(newPassword); }
    catch (e) {
      if (/requires-recent-login/.test(e.code || '')) return { error: 'لأمان حسابك سجّلي الدخول مرة أخرى بكلمة المرور المؤقتة ثم غيّريها.', relogin: true };
      return { error: translateAuthError(e) };
    }
    // كلمة المرور تغيّرت فعلًا؛ نحفظ ذلك محليًا ثم نحدّث العلامة في الخادم
    ls.set(pwKey(), true);
    ls.set(staffKey(), { ok: true, mustChange: false });
    await clearMustChange();
    return { ok: true };
  }
  const pwKey = () => 'tq_pwchanged_' + (user ? user.id : '');
  async function clearMustChange() {
    try { await fs.collection('staff').doc(user.id).update({ must_change_password: false, password_changed_at: nowIso() }); ls.del(pwKey()); return true; }
    catch (e) { console.warn('تعذّر تحديث علامة تغيير كلمة المرور (تأكدي من نشر firestore.rules):', e && e.code || ''); return false; }
  }

  // ---------- صلاحية الدخول: المسؤولة، أو معلمة أضافتها المسؤولة وحسابها مفعّل ----------
  const isAdmin = () => MODE === 'demo' || !!(user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
  const staffKey = () => 'tq_staff_' + (user ? user.id : '');
  // strict = true: نرفض الدخول إن تعذّر التحقق (عند تسجيل الدخول). وإلا نعتمد على آخر نتيجة محفوظة (دون إنترنت)
  async function checkAccess(strict) {
    if (MODE === 'demo' || isAdmin()) return { ok: true, staff: null };
    try {
      const snap = await fs.collection('staff').doc(user.id).get();
      const staff = snap.exists ? snap.data() : null;
      const ok = !!(staff && staff.active);
      let mustChange = !!(ok && staff.must_change_password);
      // غيّرت كلمة المرور على هذا الجهاز لكن العلامة لم تُحدَّث في الخادم بعد: نسمح بالدخول ونعيد المحاولة
      if (mustChange && ls.get(pwKey(), false)) { mustChange = false; clearMustChange(); }
      ls.set(staffKey(), { ok, mustChange });
      return ok ? { ok, staff, mustChange } : { ok, error: staff ? 'تم إيقاف حسابك. تواصلي مع مسؤولة النظام.' : 'هذا الحساب غير مسجّل من قِبل مسؤولة النظام.' };
    } catch (e) {
      const c = ls.get(staffKey(), null);
      if (!strict && c && c.ok) return { ok: true, staff: null, mustChange: !!c.mustChange };
      return { ok: false, error: 'تعذّر التحقق من الحساب. تأكدي من الإنترنت ثم حاولي مرة أخرى.' };
    }
  }

  async function signOut() {
    if (MODE === 'demo') ls.del('tq_demo_session');
    else {
      try { await auth.signOut(); } catch (e) { /* تجاهل */ }
      ls.del(storeKey()); // لا نُبقي بيانات المعلمة على جهاز مشترك بعد الخروج
      authReady = Promise.resolve(null);
    }
    user = null; store = emptyStore();
  }

  function translateAuthError(err) {
    const c = (err && err.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    if (/invalid-email/.test(c)) return 'صيغة البريد الإلكتروني غير صحيحة.';
    if (/email-already-in-use/.test(c)) return 'هذا البريد مسجّل مسبقًا في Firebase.';
    if (/weak-password/.test(c)) return 'كلمة المرور قصيرة جدًا (٦ أحرف على الأقل).';
    if (/too-many-requests/.test(c)) return 'محاولات كثيرة. انتظري قليلًا ثم حاولي مرة أخرى.';
    if (/network-request-failed/.test(c)) return 'تعذّر الاتصال بالخادم. تأكدي من الإنترنت.';
    if (/operation-not-allowed|configuration-not-found/.test(c)) return 'تسجيل الدخول بالبريد غير مفعّل في Firebase (Authentication → Sign-in method).';
    return 'حدث خطأ أثناء الدخول. حاولي مرة أخرى.';
  }

  // تحويل الصفحة إلى صفحة الدخول إن لم توجد جلسة
  async function requireAuth() {
    const u = await getSession();
    // بعد الدخول نعود للصفحة المطلوبة (مثل admin.html)
    const back = 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash);
    if (!u) { location.href = back; return null; }
    if (MODE === 'cloud') {
      const access = await checkAccess(false);
      if (!access.ok) { await signOut(); location.href = back; return null; }
      if (access.mustChange) { location.href = 'index.html'; return null; }
      // المسؤولة تعرض لوحة معلمة: dashboard.html?teacher=<uid> (قراءة فقط)
      const tid = new URLSearchParams(location.search).get('teacher');
      if (tid && isAdmin() && tid !== user.id) {
        let st = {};
        try { const snap = await fs.collection('staff').doc(tid).get(); st = snap.exists ? snap.data() : {}; } catch (e) { /* تجاهل */ }
        viewing = { uid: tid, email: st.email || '', full_name: st.full_name || '' };
        store = emptyStore();
        await pullAll();
        return u;
      }
      // جهاز جديد بلا نسخة محلية: ننتظر البيانات (بحد أقصى ٨ ثوانٍ)، وإلا نحدّث في الخلفية
      if (!store.classes.length) await Promise.race([pullAll(), new Promise(r => setTimeout(r, 8000))]);
      else pullAll();
    }
    return u;
  }

  // ---------- مراجع Firestore ----------
  const tDoc = () => fs.collection('teachers').doc(dataId());
  const classCol = () => tDoc().collection('classes');
  const plkCol = () => tDoc().collection('plickers');
  const plkId = (cid, lid) => `${cid}__${lid}`;

  // ---------- تحميل كل البيانات من Firestore إلى الجداول المحلية ----------
  let pulling = null;
  function pullAll() {
    if (MODE !== 'cloud' || !user) return Promise.resolve(false);
    if (!pulling) pulling = doPull().finally(() => { pulling = null; });
    return pulling;
  }
  async function doPull() {
    try {
      const [tSnap, cSnap, pSnap] = await Promise.all([tDoc().get(), classCol().get(), plkCol().get()]);
      const fresh = emptyStore();
      if (tSnap.exists) fresh.teachers.push(Object.assign({ id: dataId() }, tSnap.data()));
      cSnap.forEach(d => {
        const c = d.data();
        fresh.classes.push({ id: d.id, name: c.name, grade: c.grade, color: c.color, created_at: c.created_at });
        Object.entries(c.students || {}).forEach(([sid, s]) => {
          fresh.students.push({ id: sid, class_id: d.id, full_name: s.full_name, plickers_card_number: s.plickers_card_number || null, notes: s.notes || null, created_at: s.created_at });
          Object.entries(s.part || {}).forEach(([lid, p]) => ['point', 'correct', 'picked'].forEach(type => {
            if (p[type]) fresh.participation.push({ id: `${sid}|${lid}|${type}`, student_id: sid, class_id: d.id, lesson_id: lid, type, value: p[type] });
          }));
        });
        Object.entries(c.progress || {}).forEach(([lid, p]) =>
          fresh.lesson_progress.push({ id: `${d.id}|${lid}`, class_id: d.id, lesson_id: lid, taught_on: p.taught_on, notes: p.notes || null }));
      });
      pSnap.forEach(d => {
        const p = d.data();
        Object.entries(p.answers || {}).forEach(([qid, byStudent]) => Object.entries(byStudent).forEach(([sid, r]) =>
          fresh.plickers_responses.push({ id: `${p.class_id}|${p.lesson_id}|${qid}|${sid}`, class_id: p.class_id, lesson_id: p.lesson_id, question_id: qid, student_id: sid, answer: r.a, is_correct: !!r.c, created_at: r.t })));
      });
      store = fresh; persist(); emit(); emitData();
      return true;
    } catch (e) {
      console.warn('تعذّرت مزامنة البيانات، سيتم استخدام النسخة المحلية.', e && e.code || '');
      return false;
    }
  }

  // ---------- الحفظ إلى Firestore ----------
  function track(p) {
    pending++; emit();
    p.catch(e => console.warn('تعذّر حفظ عملية في Firestore:', e && e.code || ''))
      .finally(() => { pending--; emit(); });
  }
  // مستند الفصل كاملًا (الفصل + الطالبات + النقاط + الدروس المنجزة)
  function syncClass(cid) {
    if (MODE !== 'cloud' || viewing) return;
    const c = store.classes.find(x => x.id === cid);
    if (!c) { track(classCol().doc(cid).delete()); return; }
    const students = {};
    store.students.filter(s => s.class_id === cid).forEach(s => {
      const part = {};
      store.participation.filter(p => p.student_id === s.id).forEach(p => {
        part[p.lesson_id] = part[p.lesson_id] || {};
        part[p.lesson_id][p.type] = (part[p.lesson_id][p.type] || 0) + (p.value || 0);
      });
      students[s.id] = { full_name: s.full_name, plickers_card_number: s.plickers_card_number || null, notes: s.notes || null, created_at: s.created_at || nowIso(), part };
    });
    const progress = {};
    store.lesson_progress.filter(p => p.class_id === cid).forEach(p => { progress[p.lesson_id] = { taught_on: p.taught_on, notes: p.notes || null }; });
    track(classCol().doc(cid).set({ name: c.name, grade: c.grade || 'أول ثانوي', color: c.color || '#7c5cff', created_at: c.created_at || nowIso(), students, progress }));
  }
  // مستند إجابات بليكرز لفصل في درس
  function syncPlk(cid, lid) {
    if (MODE !== 'cloud' || viewing) return;
    const rows = store.plickers_responses.filter(r => r.class_id === cid && r.lesson_id === lid);
    const ref = plkCol().doc(plkId(cid, lid));
    if (!rows.length) { track(ref.delete()); return; }
    const answers = {};
    rows.forEach(r => { (answers[r.question_id] = answers[r.question_id] || {})[r.student_id] = { a: r.answer, c: !!r.is_correct, t: r.created_at }; });
    track(ref.set({ class_id: cid, lesson_id: lid, answers }));
  }
  function syncProfile() {
    if (MODE !== 'cloud' || viewing) return;
    const p = Object.assign({}, store.teachers.find(t => t.id === dataId()));
    delete p.id;
    track(tDoc().set(p));
  }
  const lessonsOf = cid => [...new Set(store.plickers_responses.filter(r => r.class_id === cid).map(r => r.lesson_id))];

  // ---------- الملف الشخصي ----------
  function getProfile() {
    if (viewing) return store.teachers.find(t => t.id === viewing.uid) || { id: viewing.uid, full_name: viewing.full_name, school_name: '', subject: '', academic_year: '', term: '' };
    return (user && store.teachers.find(t => t.id === user.id)) || { id: user && user.id, full_name: '', school_name: '', subject: 'التقنية الرقمية ١-١', academic_year: '', term: '' };
  }
  function ensureProfile(staff) {
    if (!user || store.teachers.find(t => t.id === user.id)) return;
    staff = staff || {};
    store.teachers.push({ id: user.id, full_name: staff.full_name || '', school_name: staff.school_name || '', subject: 'التقنية الرقمية ١-١', academic_year: '', term: '', created_at: nowIso() });
    persist(); syncProfile();
  }
  function saveProfile(patch) {
    if (viewing) return getProfile();
    let row = store.teachers.find(t => t.id === user.id);
    if (!row) { row = { id: user.id, created_at: nowIso() }; store.teachers.push(row); }
    Object.assign(row, patch); persist(); syncProfile();
    return row;
  }

  // ---------- الفصول ----------
  function listClasses() {
    return store.classes.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .map(c => Object.assign({}, c, { student_count: store.students.filter(s => s.class_id === c.id).length }));
  }
  const getClass = id => store.classes.find(c => c.id === id) || null;
  function createClass({ name, color, grade }) {
    // وضع عرض المسؤولة: قراءة فقط
    if (viewing) return null;
    const row = { id: uuid(), name: name.trim(), color: color || '#7c5cff', grade: grade || 'أول ثانوي', created_at: nowIso() };
    store.classes.push(row); persist(); syncClass(row.id);
    return row;
  }
  function updateClass(id, patch) {
    if (viewing) return null;
    const row = getClass(id); if (!row) return null;
    Object.assign(row, patch); persist(); syncClass(id);
    return row;
  }
  function deleteClass(id) {
    if (viewing) return;
    const lessons = lessonsOf(id);
    store.classes = store.classes.filter(c => c.id !== id);
    store.students = store.students.filter(s => s.class_id !== id);
    ['participation', 'plickers_responses', 'lesson_progress'].forEach(t => store[t] = store[t].filter(r => r.class_id !== id));
    persist(); syncClass(id);
    lessons.forEach(lid => syncPlk(id, lid));
  }

  // ---------- الطالبات ----------
  function listStudents(classId) {
    return store.students.filter(s => !classId || s.class_id === classId)
      .sort((a, b) => (a.plickers_card_number || 9999) - (b.plickers_card_number || 9999) || a.full_name.localeCompare(b.full_name, 'ar'));
  }
  function nextCardNumber(classId) {
    const used = store.students.filter(s => s.class_id === classId).map(s => s.plickers_card_number || 0);
    return (used.length ? Math.max(...used) : 0) + 1;
  }
  function createStudent(row) {
    if (viewing) return null;
    if (!row.plickers_card_number) row.plickers_card_number = nextCardNumber(row.class_id);
    return bulkInsertStudents([row])[0];
  }
  function bulkInsertStudents(rows) {
    if (viewing) return [];
    // ترقيم بطاقات بليكرز تلقائيًا (١..ن لكل فصل) لمن لا تملك رقمًا
    const counters = {};
    const out = rows.map(r => {
      let n = r.plickers_card_number;
      if (!n) {
        if (!(r.class_id in counters)) counters[r.class_id] = nextCardNumber(r.class_id);
        n = counters[r.class_id]++;
      }
      return { id: uuid(), class_id: r.class_id, full_name: String(r.full_name).trim(), plickers_card_number: n, notes: r.notes || null, created_at: nowIso() };
    });
    store.students.push(...out); persist();
    [...new Set(out.map(s => s.class_id))].forEach(syncClass);
    return out;
  }
  function updateStudent(id, patch) {
    if (viewing) return null;
    const row = store.students.find(s => s.id === id); if (!row) return null;
    const oldClass = row.class_id;
    Object.assign(row, patch);
    if (patch.class_id && patch.class_id !== oldClass) {
      // نقل الطالبة لفصل آخر: تنتقل نقاطها معها
      store.participation.filter(p => p.student_id === id).forEach(p => { p.class_id = row.class_id; });
    }
    persist(); syncClass(row.class_id);
    if (oldClass !== row.class_id) syncClass(oldClass);
    return row;
  }
  function deleteStudent(id) {
    if (viewing) return;
    const row = store.students.find(s => s.id === id); if (!row) return;
    const lessons = [...new Set(store.plickers_responses.filter(r => r.student_id === id).map(r => r.lesson_id))];
    store.students = store.students.filter(s => s.id !== id);
    ['participation', 'plickers_responses'].forEach(t => store[t] = store[t].filter(r => r.student_id !== id));
    persist(); syncClass(row.class_id);
    lessons.forEach(lid => syncPlk(row.class_id, lid));
  }

  // ---------- المشاركة (تُخزَّن كعدّاد لكل طالبة في كل درس) ----------
  function addParticipation({ student_id, class_id, lesson_id, type, value }) {
    if (viewing) return null;
    const id = `${student_id}|${lesson_id}|${type}`;
    let row = store.participation.find(p => p.id === id);
    if (row) row.value += value == null ? 1 : value;
    else { row = { id, student_id, class_id, lesson_id, type, value: value == null ? 1 : value }; store.participation.push(row); }
    persist(); syncClass(class_id);
    return row;
  }

  // ---------- بليكرز ----------
  function getPlickersResponses(filter = {}) {
    return store.plickers_responses.filter(r =>
      (!filter.class_id || r.class_id === filter.class_id) &&
      (!filter.lesson_id || r.lesson_id === filter.lesson_id) &&
      (!filter.question_id || r.question_id === filter.question_id));
  }
  // answers: { student_id: 'A'|'B'|'C'|'D'|null }
  function savePlickersResponses({ class_id, lesson_id, question_id, correct, answers }) {
    if (viewing) return 0;
    let n = 0;
    Object.entries(answers).forEach(([student_id, answer]) => {
      const id = `${class_id}|${lesson_id}|${question_id}|${student_id}`;
      const old = store.plickers_responses.find(r => r.id === id);
      if (!answer) { if (old) store.plickers_responses = store.plickers_responses.filter(r => r !== old); return; }
      if (old) Object.assign(old, { answer, is_correct: answer === correct });
      else store.plickers_responses.push({ id, class_id, lesson_id, question_id, student_id, answer, is_correct: answer === correct, created_at: nowIso() });
      n++;
    });
    persist(); syncPlk(class_id, lesson_id);
    return n;
  }

  // ---------- تقدّم الدروس ----------
  function listProgress(classId) { return store.lesson_progress.filter(p => !classId || p.class_id === classId); }
  function isTaught(classId, lessonId) { return store.lesson_progress.some(p => p.class_id === classId && p.lesson_id === lessonId); }
  function markTaught(classId, lessonId, date, notes) {
    if (viewing) return store.lesson_progress.find(p => p.class_id === classId && p.lesson_id === lessonId) || { taught_on: '' };
    const old = store.lesson_progress.find(p => p.class_id === classId && p.lesson_id === lessonId);
    const row = old ? Object.assign(old, { taught_on: date || old.taught_on || today(), notes: notes === undefined ? old.notes : notes })
      : { id: `${classId}|${lessonId}`, class_id: classId, lesson_id: lessonId, taught_on: date || today(), notes: notes || null };
    if (!old) store.lesson_progress.push(row);
    persist(); syncClass(classId);
    return row;
  }
  function unmarkTaught(classId, lessonId) {
    if (viewing) return;
    store.lesson_progress = store.lesson_progress.filter(p => !(p.class_id === classId && p.lesson_id === lessonId));
    persist(); syncClass(classId);
  }

  // ---------- الإحصائيات ----------
  function getStudentStats(classId) {
    return listStudents(classId).map(s => {
      const part = store.participation.filter(p => p.student_id === s.id);
      const sum = type => part.filter(p => p.type === type).reduce((a, p) => a + (p.value || 0), 0);
      const resp = store.plickers_responses.filter(r => r.student_id === s.id);
      const pc = resp.filter(r => r.is_correct).length;
      return {
        student_id: s.id, class_id: s.class_id, full_name: s.full_name, plickers_card_number: s.plickers_card_number, notes: s.notes,
        total_points: sum('point'), correct_answers: sum('correct'), times_picked: sum('picked'),
        plickers_total: resp.length, plickers_correct: pc,
        plickers_accuracy: resp.length ? Math.round(1000 * pc / resp.length) / 10 : null,
      };
    });
  }

  // ---------- إدارة حسابات المعلمات (للمسؤولة فقط) ----------
  // ملاحظة: Firebase لا يسمح بإنشاء مستخدم آخر من المتصفح دون تبديل الجلسة،
  // لذلك ننشئ الحساب عبر نسخة ثانية مستقلة من Firebase فتبقى المسؤولة مسجّلة الدخول.
  function creatorAuth() {
    const app = firebase.apps.find(a => a.name === 'creator') || firebase.initializeApp(cfg, 'creator');
    const a = app.auth();
    try { a.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (e) { /* تجاهل */ }
    return a;
  }
  async function listStaff() {
    const snap = await fs.collection('staff').get();
    const out = [];
    snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
    return out.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ar'));
  }
  async function createTeacher({ full_name, email, password, school_name }) {
    if (MODE !== 'cloud') return { error: 'إضافة المعلمات تحتاج ربط Firebase.' };
    if (!navigator.onLine) return { error: 'تحتاجين اتصالًا بالإنترنت لإضافة معلمة.' };
    const a = creatorAuth();
    let cred;
    try { cred = await a.createUserWithEmailAndPassword(email, password); }
    catch (e) { return { error: translateAuthError(e) }; }
    const row = { full_name, email: email.toLowerCase(), school_name: school_name || '', active: true, must_change_password: true, created_at: nowIso(), created_by: user.email };
    try { await fs.collection('staff').doc(cred.user.uid).set(row); }
    catch (e) { return { error: 'أُنشئ الحساب لكن تعذّر تفعيله. تأكدي من نشر firestore.rules ومن بريد المسؤولة فيها.' }; }
    finally { try { await a.signOut(); } catch (e) { /* تجاهل */ } }
    return { staff: Object.assign({ id: cred.user.uid }, row) };
  }
  async function teacherSummary(uid) {
    const t = fs.collection('teachers').doc(uid);
    const [cSnap, pSnap] = await Promise.all([t.collection('classes').get(), t.collection('plickers').get()]);
    let classes = 0, students = 0, taught = 0, points = 0, total = 0, correct = 0;
    cSnap.forEach(d => {
      const c = d.data(); classes++;
      const st = Object.values(c.students || {}); students += st.length;
      taught += Object.keys(c.progress || {}).length;
      st.forEach(s => Object.values(s.part || {}).forEach(p => { points += p.point || 0; }));
    });
    pSnap.forEach(d => Object.values(d.data().answers || {}).forEach(q => Object.values(q).forEach(r => { total++; if (r.c) correct++; })));
    return { classes, students, taught, points, plkTotal: total, plkPct: total ? Math.round(100 * correct / total) : null };
  }
  async function updateStaff(uid, patch) {
    try { await fs.collection('staff').doc(uid).update(patch); return { ok: true }; }
    catch (e) { return { error: 'تعذّر الحفظ. تأكدي من الإنترنت.' }; }
  }

  window.DB = {
    MODE, uuid, today, ls,
    getSession, signIn, signOut, resetPassword, requireAuth, get user() { return user; },
    isAdmin, listStaff, createTeacher, updateStaff, teacherSummary, get viewing() { return viewing; }, changePassword, verifyAccess: () => checkAccess(false),
    onStatus, onData, status, pullAll, get pendingCount() { return pending; },
    getProfile, saveProfile,
    listClasses, getClass, createClass, updateClass, deleteClass,
    listStudents, createStudent, bulkInsertStudents, updateStudent, deleteStudent, nextCardNumber,
    addParticipation,
    getPlickersResponses, savePlickersResponses,
    listProgress, isTaught, markTaught, unmarkTaught,
    getStudentStats,
    get raw() { return store; },
  };
})();
