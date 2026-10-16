# PROJECT BRIEF: Interactive Textbook Presentation + Teacher Dashboard (Supabase)

> **Change (2026-10-16):** the database was switched from **Supabase to Firebase (Cloud Firestore)**, because the Supabase account had no free project slot left. Wherever this brief says Supabase, read Firebase. `supabase/schema.sql` and `seed.sql` are replaced by `firestore.rules`, and `js/supabase.js` by `js/db.js`. Setup steps are in project-overview.md.
> **Change (2026-10-16):** public sign-up was removed. Teacher accounts are created by an admin on `admin.html`, and the login page has login plus "forgot password" only. Firestore rules block any account the admin hasn't added.
> **Change (2026-10-16):** teachers can open any lesson without adding classes ("عرض بدون فصل"). A class is only needed for the name draw, points and Plickers recording.

## 0. CRITICAL LANGUAGE RULE
> **Status:** ✅ **DONE** – All UI, slides, messages and Excel headers are Arabic; every page is `dir="rtl" lang="ar"`; code comments are Arabic.

- These instructions are in English, but ALL user-facing content MUST be in Arabic:
  slide text, questions, answers, buttons, labels, messages, dashboard UI, alerts, and exported Excel headers.
- The whole interface must be RTL (dir="rtl", lang="ar").
- Code, variable names, and file names stay in English. Code comments should be in Arabic so the teacher can follow them.
- The only English file in the project is project-overview.md.

## 1. SOURCE MATERIAL
> **Status:** ⚠️ **DONE, NOT VERIFIED** – 4 units / 17 lessons in book order with page numbers, each its own presentation. Not yet checked against book.pdf for missing lessons or wrong pages.

- The full textbook is in this folder as `book.pdf`. It is a FIRST-SECONDARY (أول ثانوي) girls' textbook.
- Read the ENTIRE book: every unit, lesson, objective, activity, exercise, and key figure.
- Turn EVERY lesson into its own interactive presentation. Do not skip any lesson.
- Keep the book's order of units and lessons, and record the book's page number for each lesson.
- Do NOT copy book paragraphs onto slides. Summarize them into short phrases, then turn them into
  activities, questions, real-life scenarios, and challenges suited to 15–16-year-old girls.
- Write new and varied questions based on each lesson's content.

## 2. TECH STACK & STRUCTURE
> **Status:** ✅ **DONE** – Every file in the suggested structure exists (plus `js/library.js` for the login/library page). No build step; Firebase and SheetJS load from a CDN. `js/supabase.js` became `js/db.js`, and `supabase/` became `firestore.rules`.

- Use plain HTML + CSS + JavaScript only (no framework, no build step).
- Use Supabase as the database, through `@supabase/supabase-js` loaded from a CDN.
- Use SheetJS (xlsx) from a CDN for Excel import and export.
- The project must run by opening index.html, or from any static host (GitHub Pages or Netlify).

Suggested structure:
/index.html            → login + lesson library (units → lessons)
/dashboard.html        → teacher dashboard
/presentation.html     → slide player (?lesson=u1l2&class=<id>)
/css/base.css          → shared layout, controls, typography
/css/themes.css        → one distinct theme per unit (see §6)
/js/config.js          → SUPABASE_URL + SUPABASE_ANON_KEY (placeholders)
/js/supabase.js        → client + all database functions
/js/app.js             → slide engine, navigation, effects
/js/dashboard.js
/js/import-export.js   → Excel/CSV import and Excel export
/js/plickers.js        → Plickers mode (see §9)
/data/lessons.js       → ALL lesson content as a JS object (not fetched JSON)
/supabase/schema.sql   → tables, indexes, RLS policies
/supabase/seed.sql     → sample data for testing
/project-overview.md   → English documentation

## 3. SUPABASE DATABASE
### 3.1 Auth & Security
> **Status:** ⚠️ **BUILT, NOT TESTED LIVE** – Firebase email/password login; `firestore.rules` lets each teacher read and write only her own data; no secret keys in the frontend; no names in the console. Tested against a simulated Firestore, not yet against a real Firebase project (`js/config.js` still holds placeholders).

- The teacher signs in with Supabase Auth (email + password). Every page except login requires a session.
- Enable Row Level Security on ALL tables. Each table has a `teacher_id uuid references auth.users`
  column, and policies restrict select, insert, update, and delete to `auth.uid() = teacher_id`.
- Use ONLY the anon/public key in the frontend. Never use the service_role key.
- Student names are personal data: never log them to the console or expose them publicly.

### 3.2 Tables (write them in schema.sql)
> **Status:** ✅ **DONE (adapted to Firestore)** – The same data (teacher, classes, students, participation, Plickers responses, lesson progress) is stored in a few documents per teacher. Deleting a class also deletes its students and results, and the student stats are calculated in the app.

- teachers: id (= auth uid), full_name, school_name, subject, academic_year, term, created_at
- classes: id, teacher_id, name (e.g. "أول ثانوي ١"), grade (default "أول ثانوي"), color, created_at
- students: id, teacher_id, class_id, full_name, plickers_card_number (int, nullable), notes, created_at
- participation: id, teacher_id, student_id, class_id, lesson_id, type ('point' | 'correct' | 'picked'), value int, created_at
- plickers_responses: id, teacher_id, class_id, lesson_id, question_id, student_id, answer ('A'|'B'|'C'|'D'), is_correct, created_at
- lesson_progress: id, teacher_id, class_id, lesson_id, taught_on date, notes
- Add sensible indexes, cascade deletes from classes to students, and a view `student_stats`
  (total points, correct answers, times picked, Plickers accuracy %).

### 3.3 Uploading My Class Data (First Secondary)
> **Status:** ✅ **DONE + TESTED** – xlsx/csv upload with an Arabic preview and validation, auto-created classes, bulk insert, paste names, template download, automatic card numbers (14/14 automated checks passed).

- Build an "استيراد بيانات الفصول" page in the dashboard:
  • Upload .xlsx or .csv with columns: اسم الفصل | اسم الطالبة | رقم بطاقة بليكرز (optional).
  • Show an Arabic preview table before saving, with validation (empty names, duplicates, missing class).
  • On confirm: create missing classes automatically, then insert students in bulk.
  • Also allow pasting names (one per line) into a selected class.
- Provide a downloadable Arabic template file (قالب_الطالبات.xlsx) with the correct columns.
- Assign Plickers card numbers automatically (1..n per class) if they are not provided.

### 3.4 Offline Safety
> **Status:** ✅ **DONE** – localStorage cache, Firestore offline persistence (writes queued in the browser and sent on reconnect), status badge. ⚠️ Needs one live test on a real Firebase project.

- Cache the latest data in localStorage (wrapped in try/catch) so a presentation still works if
  the school internet drops. Queue writes made while offline and sync them when the connection returns.
- Show a small status badge: "متصل ✓" / "غير متصل – سيتم الحفظ لاحقًا".

## 4. TEACHER DASHBOARD (Arabic UI)
> **Status:** ✅ **DONE** – Profile, classes, students, lesson progress, stats cards and bar charts, Excel export with the required sheets, "تم الحفظ ✓" toasts, in-page modals.

- Teacher profile: name, school, subject, academic year, term.
- Classes: add, rename, delete, and colour-tag. Show the student count for each class.
- Students: add, edit, delete, notes, Plickers card number, and per-student stats.
- Lesson progress: mark lessons as taught per class, with date.
- Stats cards: number of classes, total students, top students per class, lessons completed,
  and Plickers accuracy per lesson. Use simple, clear charts.
- Export to Excel (.xlsx) with sheets: بيانات المعلمة | one sheet per class | الدروس المنجزة | نتائج بليكرز.
- "تم الحفظ ✓" toast on every save. Confirmations use in-page modals (never alert/confirm).

## 5. LESSON LIBRARY (index.html)
> **Status:** ✅ **DONE** – Themed unit cards, class selector required before starting, ✔️ on taught lessons.

- Units appear as large themed cards, each in its unit's own theme (§6), with the lesson cards inside.
- A class selector must be chosen before starting a lesson, because the name draw, points, and
  Plickers results are tied to the selected class.
- Show a ✔️ on lessons already taught for the selected class.

## 6. VISUAL DESIGN: EACH UNIT HAS ITS OWN IDENTITY
> **Status:** ✅ **DONE** – 4 distinct themes (palette, background pattern, transition), cinematic cover per unit, 16:9 auto-scaled stage with auto-fit so nothing scrolls.

- The design must be extremely attractive, modern, and polished, like a premium interactive
  learning app, not a basic web page.
- EVERY UNIT gets a distinct theme inspired by its topic: its own colour palette, background
  pattern or illustration motif, icon style, title decoration, and slide-transition style.
  Example: a networks unit uses connected nodes and blues; a programming unit uses code
  brackets and dark neon; a data unit uses grids and charts in teal.
- Keep a consistent skeleton across all units (same control bar, same reading layout) so only
  the "skin" changes. Define themes as CSS custom properties: [data-theme="unit-1"] { … }.
- Each unit opens with a cinematic cover slide in its theme.
- Typography: a clear Arabic font (Tajawal, Cairo, or IBM Plex Sans Arabic from Google Fonts),
  with very large titles and short text readable from the back of the classroom.
- Leave generous whitespace and never crowd a slide.
- Every slide is exactly 100% of the viewport, 16:9, with no scrollbars and no layout shift between
  slides. It must work on laptops, projectors, and smart boards.

## 7. SLIDE PLAYER BEHAVIOUR
> **Status:** ✅ **DONE** – Keys, transitions, counter + progress bar, auto-hiding control bar, corner hint, clap (Web Audio), name draw with no repeats + points saved, right/wrong feedback, never auto-advances, Esc returns to the library.

- Next: → (Right Arrow), Space, or the on-screen button. Previous: ← (Left Arrow) or the button.
- Prevent page scrolling on arrows and Space.
- Smooth Fade, Slide, and Zoom transitions, with elements appearing in sequence. Keep motion subtle.
- Show the slide counter "٥ / ٢٠" and a thin progress bar.
- Bottom control bar: ← السابق | رقم الشريحة | التالي → | 👏 | 🎲 | 📊 بليكرز | ⛶ ملء الشاشة | 🏠
  It auto-hides after 3 s without mouse movement and reappears on movement.
- Corner hint: "Space = التالي | ← → للتنقل | ت = تصفيق | ق = قرعة"
- Clap 👏: triggered ONLY by the button or the key "ت" (also accept "c"). Play a short applause
  sound generated with the Web Audio API (no external files), and float small 👏 icons upward
  until they fade. Never trigger it automatically.
- Name draw 🎲: triggered by the button or the key "ق" (also accept "n"). It spins or shuffles names
  from the selected class and lands on one name. Names do not repeat until everyone has been picked
  (with a reset button). After a pick, show "+١ نقطة" and "إجابة صحيحة ✓" buttons that save to Supabase.
- Questions: when an answer is right, show light confetti, play a success tone, and display
  "أحسنتِ! 👏 إجابة صحيحة". When it is wrong, play a gentle shake and display
  "حاولي مرة أخرى 💜". NEVER auto-advance; the teacher controls navigation.
- Escape returns to the library.

## 8. LESSON FLOW (every lesson)
> **Status:** ✅ **DONE** – All 17 lessons contain all 14 steps (checked automatically).

1. Welcome: lesson title, unit, teacher name, school (pulled from Supabase).
2. Warm-up: name draw + quick review of the previous lesson.
3. Objectives (short, measurable).
4. Hook: a provocative question, scenario, or "ماذا تتوقعين؟" moment linked to the girls' lives.
5. Core content, delivered through interactive strategies (§10), never plain reading.
6. 🇸🇦 National Value slide (§11).
7. 🕌 Religious Value slide (§11).
8. Brainstorm.
9. Think–Pair–Share with a timer.
10. Interactive MCQs + True/False.
11. 📊 Plickers check (§9).
12. One-minute challenge with a countdown.
13. Review / summary.
14. Exit ticket + motivational closing slide.

## 9. PLICKERS STRATEGY
> **Status:** ✅ **DONE** – 3 A–D questions per lesson, big question slide with countdown, recording grid, distribution chart, misconception + re-teach tip, question export, card print sheet.

- Plickers has no public API, so build a "Plickers Mode" that works alongside the real Plickers app:
  • Every lesson includes 3–5 Plickers-ready questions with EXACTLY 4 options labelled A, B, C, D
    (أ/ب/ج/د shown next to the Latin letters, since the physical cards use A–D).
  • Plickers slide: the question appears very large with the four options and a countdown, and the
    teacher scans the class with the Plickers mobile app.
  • A "تسجيل النتائج" panel shows a grid of the class's students (with their card numbers). The teacher
    taps A/B/C/D for each student, or marks the whole class quickly. Results save to plickers_responses.
  • After saving, show a bar chart of answer distribution and the percentage correct, then
    highlight a misconception and show a short re-teach tip.
  • Dashboard button: "تصدير أسئلة بليكرز" exports each lesson's Plickers questions as a text/CSV
    file, ready to copy into the Plickers website.
  • Dashboard button: "طباعة بطاقات توزيع" prints a sheet mapping each student to her card number per class.

## 10. LEARNING STRATEGIES (distinctive, engaging, EASY to apply)
> **Status:** ✅ **DONE** – 16+ strategies rotated across lessons, each with a collapsible "دليل المعلمة" card.

- Vary strategies across lessons; do not repeat the same pattern every time.
- Each strategy slide must include a small collapsible "دليل المعلمة" card: how to apply it, the time
  needed, and any materials. It must be doable in a normal classroom with no extra preparation.
Choose from (and rotate):
- Plickers, Think–Pair–Share, Brainstorming, Numbered Heads (الرؤوس المرقمة), Jigsaw (التعلم بالأقران),
  Four Corners (الأركان الأربعة), Hot Seat (الكرسي الساخن), Mystery Box (الصندوق الغامض),
  Gallery Walk (جولة المعرض), KWL chart, Snowball (كرة الثلج), Traffic Lights self-assessment
  (إشارة المرور), Mini Escape Room (غرفة الهروب), Role Play (لعب الأدوار), Concept/Mind Map,
  Tic-Tac-Toe review (إكس-أو), Exit Ticket (بطاقة الخروج), Observe & Discover (لاحظي واكتشفي),
  "What would you do?" real-life scenarios.
Interactive components: flip cards, reveal-on-click, drag-and-drop sorting and matching, timers,
progressive answer reveal, MCQ, and True/False.

## 11. NATIONAL & RELIGIOUS VALUES (every lesson)
> **Status:** ⚠️ **DONE, NEEDS TEACHER REVIEW** – Both slides exist in every lesson and are flagged "يُرجى مراجعة المعلمة". The teacher must confirm the wording of every verse and hadith.

- 🇸🇦 National value: connect the lesson naturally to Saudi identity, belonging, citizenship, digital
  citizenship, Saudi Vision 2030 programs, national achievements, or responsible technology use
  serving the homeland. Use a short scenario or question, not a lecture.
- 🕌 Religious value: connect the lesson to an Islamic value such as الأمانة, الإتقان, الصدق,
  حفظ الخصوصية, نفع الناس, or شكر النعمة. Use ONLY well-known, authentic Quran verses or hadiths with
  an accurate reference (surah and ayah number, or hadith source). If you are unsure of a text's
  authenticity or wording, state the value without a quote. NEVER invent or paraphrase a verse or hadith.
- Mark these slides with a small "يُرجى مراجعة المعلمة" flag in lessons.js so the teacher can review them.
- Each value slide ends with a quick reflective question for the students.

## 12. EASY CONTENT EDITING
> **Status:** ✅ **DONE** – All content is in `data/lessons.js` with an Arabic editing guide at the top; the player renders it automatically.

- All lesson content lives in /data/lessons.js:
  units[] → { id, title, theme, cover } → lessons[] → { id, title, page, objectives, slides[] }
- Each slide has a `type` (welcome, objectives, hook, content, flipcards, dragdrop, mcq, truefalse,
  brainstorm, tps, plickers, challenge, nationalValue, religiousValue, review, exitTicket, closing)
  plus its fields.
- Add an Arabic guide comment at the top of lessons.js explaining how to edit a question or add a
  slide without coding knowledge.
- The player renders slides automatically from this file.

## 13. project-overview.md (ENGLISH)
> **Status:** ✅ **DONE** – `project-overview.md` covers every item listed below.

Include: purpose; audience (first-secondary girls, book title); feature list; folder structure with
file descriptions; Supabase setup step by step (create project → run schema.sql → enable email auth
→ paste URL and anon key into config.js); how to import class data and the template columns; how to
use the dashboard and Excel export; Plickers workflow; how to edit lessons.js (with a code example);
slide types reference; keyboard shortcuts table; unit themes table; learning strategies used;
units and lessons map extracted from the book; security notes (RLS, anon key only); offline behaviour;
and future improvements.

## 14. DEFINITION OF DONE
> **Status:** ⚠️ **MOSTLY DONE** – see the mark on each item below.

- ⚠️ All lessons from book.pdf are converted, with each unit visually distinct. *(17 lessons converted, 4 distinct themes; not checked against the book yet)*
- ⚠️ Supabase schema with RLS, login, class import, the dashboard, and Excel export all work end to end. *(now Firebase; works in demo mode and against a simulated Firestore; not yet tested on a real Firebase project)*
- ✅ Plickers mode records and charts results. *(tested)*
- ✅ Every lesson has national + religious value slides and varied strategies with teacher guides. *(checked automatically)*
- ✅ No scrollbars, no console errors, and everything works with both mouse and keyboard. *(every slide of all 17 lessons stepped through in Chrome: 0 errors, 0 overflow)*
- ⚠️ Test the whole flow before delivering: log in → import classes → open a lesson → draw a name →
  Plickers → export Excel. *(done in demo mode; repeat once with your real Firebase config)*