# Interactive Textbook Presentations + Teacher Dashboard

## Purpose

Every lesson of the first-secondary textbook **التقنية الرقمية ١-١** (Digital Technology 1-1, Secondary Tracks System, common first year) has been turned into an interactive classroom presentation. It comes with a teacher dashboard that tracks classes, students, participation and Plickers results in Firebase (Cloud Firestore).

- **Audience:** first-secondary (أول ثانوي) girls, aged 15–16, and their teacher.
- **Language:** the whole interface is Arabic and right-to-left. Code and file names are in English, and code comments are in Arabic.
- **Stack:** plain HTML, CSS and JavaScript, with no build step. Firebase (compat SDK `10.14.1`: app, auth, firestore) loads from gstatic.com, and SheetJS (`xlsx@0.18.5`) from the jsDelivr CDN.
- **Cost:** Firebase's free Spark plan is enough for one teacher, and free projects never pause.

## Features

- **Login only, no self sign-up:** teachers log in with email and password. Accounts are created by the admin on `admin.html`. The login page has "نسيت كلمة المرور؟" (forgot password), which emails a reset link. If `js/config.js` still holds placeholders, the app runs in a local **demo mode** and keeps data in the browser only.
- **Admin page (`admin.html`):** add teachers (name, school, email, temporary password), copy a ready-to-send welcome message with the login details, edit names, disable or re-enable accounts, and send password-reset links.
- **Lesson library:** each unit is a themed card containing its lessons. A class must be selected before a lesson starts, and lessons already taught to that class show ✔️.
- **Slide player:**
  - A fixed 1600×900 stage scales to any screen at 16:9, with no scrollbars. Dense slides shrink their content automatically to fit.
  - Each lesson opens with a cinematic unit cover.
  - The bottom control bar auto-hides; a progress bar and an Arabic-numeral counter show position.
  - Applause (👏) is generated with Web Audio and floats clap emojis.
  - The name draw (🎲) never repeats a student until everyone has been picked. After a pick the teacher can tap "+١ نقطة" (+1 point) or "إجابة صحيحة ✓" (correct answer).
  - Answer checking shows confetti and "أحسنتِ! 👏 إجابة صحيحة" for right answers, and a gentle shake with "حاولي مرة أخرى 💜" for wrong ones.
  - The player never advances on its own.
- **Interactive strategies:** each strategy slide has a collapsible teacher-guide card (دليل المعلمة) with how-to steps, time and materials. See [Learning strategies used](#learning-strategies-used).
- **Plickers mode:**
  - Question slides show options labelled A–D with Arabic letters.
  - The teacher records each student's answer on a grid, then sees an answer-distribution chart, the percentage correct, the most-chosen wrong answer, the common misconception and a re-teach tip.
- **Dashboard:**
  - Profile.
  - Classes, colour-tagged and showing student counts.
  - Students, with notes, card numbers and per-student stats.
  - Lesson progress per class, with dates and notes.
  - Import of class data from Excel/CSV or pasted names.
  - Plickers analytics.
  - Excel export.
- **Offline safety:**
  - A local cache, plus Firestore's offline persistence, which queues writes in the browser and syncs them when the connection returns.
  - A connection badge shows "متصل ✓" (online) or "غير متصل – سيتم الحفظ لاحقًا" (offline – will save later).

## Folder structure

| Path | Description |
|---|---|
| `index.html` | Login + lesson library (UI built by `js/library.js`) |
| `presentation.html` | Slide player shell (`?lesson=u1l2&class=<uuid>`, optional `#<slide number>`) |
| `dashboard.html` | Teacher dashboard shell |
| `admin.html` | Admin page for managing teacher accounts (built by `js/admin.js`) |
| `css/base.css` | Shared layout, controls, typography, player, dashboard and print styles |
| `css/themes.css` | One theme per unit as CSS custom properties: `[data-theme="unit-N"]` |
| `js/config.js` | Firebase web-app config (placeholders = demo mode) |
| `js/db.js` | Data layer: Firebase auth, Firestore sync, local cache, CRUD, stats (`window.DB`) |
| `js/ui.js` | Shared UI helpers: toasts, in-page modals, status badge, Arabic numerals, lesson index (`window.UI`) |
| `js/library.js` | Login form (login only + forgot password) and lesson library |
| `js/admin.js` | Admin page: add, edit, disable or enable teachers, send reset links |
| `js/app.js` | Slide engine: renderers per slide type, navigation, effects, sounds, name draw |
| `js/plickers.js` | Plickers recording panel + results chart (`window.Plickers`) |
| `js/dashboard.js` | Dashboard sections |
| `js/import-export.js` | Excel/CSV import + validation, Excel report, Plickers question export, card printing (`window.IE`) |
| `data/lessons.js` | **All lesson content** as a JS object (`window.LESSONS`) |
| `firestore.rules` | Firestore security rules: only the admin manages accounts; only active teachers added by the admin can use the app, each with her own data only |
| `book.pdf.pdf` | Source textbook |

## Firebase setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project** (Create a project). Google Analytics is not needed, so you can turn it off. The free **Spark** plan is enough; don't add billing.
2. **Login:** open **Build → Authentication → Get started → Sign-in method**, choose **Email/Password**, enable it and click **Save**.
3. **Database:** open **Build → Firestore Database → Create database**. Choose the location nearest to you (it can't be changed later) and start in **production mode**.
4. **Security rules:** in Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules` from this folder and click **Publish**. Without this step, every save is refused.
5. **Connect the app:** open **⚙️ Project settings → General → Your apps**, click the web icon **`</>`** and register an app (any nickname; skip Firebase Hosting). Copy the `firebaseConfig` values into `js/config.js`:
   ```js
   window.APP_CONFIG = {
     FIREBASE: {
       apiKey: 'AIza...',
       authDomain: 'my-project.firebaseapp.com',
       projectId: 'my-project',
       storageBucket: 'my-project.appspot.com',
       messagingSenderId: '1234567890',
       appId: '1:1234567890:web:abc123',
     },
   };
   ```
6. **Choose the admin email:** write it, in lowercase, in two places:
   - `js/config.js` → `ADMIN_EMAILS: ['you@example.com']`
   - `firestore.rules` → inside `isAdmin()`: `['you@example.com']`, then publish the rules again.
7. **Create the admin account:** go to **Authentication → Users → Add user** and enter the admin email and a password.
8. Open the app (see below) and log in as the admin. A **👑 إدارة المعلمات** (manage teachers) button appears in the top bar. Use it to add each teacher.

> **Why sign-up is blocked by the rules, not by Firebase:** Firebase's free plan can't switch off account creation on its own. So the security rules give no access to any account that the admin hasn't added (an active entry in `staff/{uid}`). Even if someone created an account outside the app, she would see the message "هذا الحساب غير مسجّل من قِبل مسؤولة النظام" (this account is not registered by the system admin) and could not read or write anything.

> The Firebase config values are not secrets; they only identify the project. The data is protected by the security rules in step 4.

## Hosting / running locally

The project runs from any static host (GitHub Pages, Netlify or Firebase Hosting). If you use your own domain, add it under **Authentication → Settings → Authorized domains**. Firebase login does not work reliably from a file opened directly (`file://`), so serve the folder locally instead:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Importing class data

Go to **Dashboard → استيراد بيانات الفصول**. Two methods are available.

**Excel or CSV upload.** Columns: `اسم الفصل | اسم الطالبة | رقم بطاقة بليكرز` (class name | student name | Plickers card number). The card number is optional. Download the ready-made template, **قالب_الطالبات.xlsx**, from the same page.

| اسم الفصل | اسم الطالبة | رقم بطاقة بليكرز |
|---|---|---|
| أول ثانوي ١ | … | 1 |

How the import treats the file:
- The header row is detected within the first 5 rows.
- If a sheet has no class column, the sheet name is used as the class (one sheet per class).
- The preview table flags rows before anything is saved:
  - **Errors** (empty name or missing class) are never imported.
  - **Duplicates** (in the file, or already in the class) are skipped unless you tick "استيراد المكررات أيضًا" (import duplicates too). Names are compared after normalising Arabic letter variants (أ/إ/آ→ا, ة→ه, ى→ي) and removing diacritics.
  - **Invalid or duplicate card numbers** are replaced by automatic numbering.
- On confirm, missing classes are created first, then students are inserted in bulk.
- Missing card numbers are assigned automatically as the lowest free numbers per class (1..n).

**Paste names.** Paste one name per line into an existing class, or into a new class.

## Dashboard and Excel export

- **نظرة عامة (Overview):**
  - Counts of classes, students, completed lessons and overall Plickers accuracy.
  - The top three students per class, by points plus correct answers.
  - Plickers accuracy per lesson.
  - The completion percentage per class.
- **الملف الشخصي (Profile):** name, school, subject, academic year and term. The welcome slide displays these.
- **الفصول (Classes):** add, rename, recolour and delete. Deleting a class cascades to its students and their results.
- **الطالبات (Students):** filter, search, add, edit and delete students, including their card number and notes, with stats per student.
- **تقدّم الدروس (Lesson progress):** a checkbox for each lesson per class, plus date and notes. The closing slide of every lesson also has a "mark as taught" button.
- **التصدير (Export):** one `.xlsx` file, right-to-left, with these sheets:
  - **بيانات المعلمة:** teacher data.
  - **One sheet per class:** card number, name, points, correct answers, times picked, Plickers totals and accuracy %, notes.
  - **الدروس المنجزة:** completed lessons.
  - **نتائج بليكرز:** Plickers results.

Every save shows "تم الحفظ ✓" (saved). Confirmations use in-page modals, never `alert` or `confirm`.

## Plickers workflow

Plickers has no public API, so this app works alongside the real Plickers app.

1. **Dashboard → بليكرز → تصدير أسئلة بليكرز.** Export the questions of one lesson or of all lessons, either as a text file ready to copy into plickers.com or as a CSV. Each question has exactly four options, A–D.
2. **طباعة بطاقات توزيع.** Print one page per class mapping each student to her card number.
3. **In the lesson:**
   1. On a Plickers slide, the question appears large with A/B/C/D (أ/ب/ج/د) and a countdown.
   2. Students raise their cards, and the teacher scans the class with the Plickers mobile app.
4. **Record results.** Press **📝 تسجيل النتائج**. Tap A–D for each student (tap again to clear), or use the "للجميع" (everyone) buttons to set the whole class at once. Then save. Results go to the class-and-lesson Plickers document in Firestore (one answer per student per question; saving again updates it).
5. **Review.** The results view shows:
   - a distribution bar chart, with the correct option in green;
   - the percentage correct;
   - the most-chosen wrong answer and the stored misconception;
   - a re-teach tip.

   The 📊 بليكرز button on the control bar jumps to the next Plickers slide, or opens the recording panel when you are already on one.

## Editing lessons (`data/lessons.js`)

The file starts with an Arabic guide for non-programmers. Its structure:

```
LESSONS.units[] → { id, title, page, theme, cover: { kicker, icon, tagline, motif }, lessons[] }
lessons[]       → { id: 'u1l2', title, page, objectives: [...], slides: [...] }
```

Example: edit a multiple-choice question and add a true/false slide.

```js
{ type: 'mcq', question: 'ما وحدة قياس سرعة المعالج؟', options: ['الهرتز', 'البايت', 'البكسل', 'الواط'], answer: 0, explain: 'تقاس بالهرتز (GHz).' },
{ type: 'truefalse', title: 'صح أم خطأ؟', statements: [
  { text: 'RAM ذاكرة دائمة.', answer: false, explain: 'RAM مؤقتة وتُفقد بانقطاع التيار.' },
] },
```

Rules:
- `answer` for `mcq` is a 0-based index. For `plickers` it is `'A'`–`'D'`.
- Escape `'` inside text as `\'`.
- Each Plickers question needs a unique `id`, for example `'u1l2-p4'`.
- Value slides carry `review: true`, which shows the "يُرجى مراجعة المعلمة" (please review, teacher) flag on screen.

## Slide types reference

Every lesson automatically starts with a unit cover slide (`cover`). Optional fields on any strategy slide: `strategy` (chip text) and `guide: { how, time, materials }` (the teacher-guide card).

| Type | Fields | Behaviour |
|---|---|---|
| `welcome` | – | Lesson title, unit, teacher name, school, class, book page |
| `warmup` | `title, review[{q,a}]` | Name-draw button + reveal-answer review questions |
| `objectives` | – (uses `lesson.objectives`) | Numbered objectives |
| `hook` | `title, question, reveal` | Big question; Next or button reveals the answer |
| `content` | `title, points[], reveal?, visual?, note?` | Points (progressive reveal with Next/click if `reveal: true`) + optional visual |
| `flipcards` | `title, cards[{icon,front,back}]` | 3D flip cards |
| `dragdrop` | `mode: 'match' \| 'sort' \| 'order'`, `pairs[{a,b}]` / `categories[] + items[{text,cat}]` / `steps[]` | Drag (mouse/touch) or tap-to-select then tap-target; instant feedback |
| `mcq` | `question, options[4], answer, explain?` | Confetti + tone when right, shake when wrong |
| `truefalse` | `title, statements[{text,answer,explain?}]` | ✔️/✖️ per statement |
| `brainstorm` | `title, prompt, seeds[]` | Type ideas → sticky notes; reveal suggested examples |
| `tps` | `title, prompt, think, pair, share` (seconds) | Think–Pair–Share phases with ring timer (auto-moves to next phase, not next slide) |
| `plickers` | `id, question, options[4], answer 'A'-'D', misconception, reteach, seconds?` | See Plickers workflow |
| `challenge` | `title, prompt, seconds, answer?` | Countdown ring + model answer |
| `nationalValue` | `title, scenario, reflect, review` | 🇸🇦 value with reflective question |
| `religiousValue` | `value, quote?, ref?, text, reflect, review` | 🕌 value; quote shown only if provided |
| `review` | `title, points[]` | Summary |
| `exitTicket` | `prompts[]` | Three prompts + traffic-light self-assessment counter (click +1, right-click −1) |
| `closing` | `message, sub` | Motivational close, "mark lesson taught", applause, back to library |
| `mysterybox` | `title, boxes[{label,content}]` | Gift boxes reveal content |
| `tictactoe` | `title, cells[9]{q,a}` | Two-team X/O with questions, win detection, score |
| `fourcorners` | `title, question, corners[4], answer \| null` | Reveal the right corner (or opinion mode when `null`) |
| `escape` | `title, story, locks[{q,answer,hint}], final` | Sequential locks; answers compared ignoring case/spaces/letter variants |
| `kwl` | `title, k[], w[], l[]` | Three columns; add notes live |
| `hotseat` | `title, role, questions[]` | Questions revealed one by one |
| `scenario` | `title, scenario, options[{text,feedback,best?}]` | "What would you do?" with feedback |
| `numberedheads` | `title, question, answer` | Discussion timer + random number 1–4 + answer reveal |
| `mindmap` | `title, center, branches[{label,children[]}]` | Radial map revealed branch by branch |
| `strategy` | `name, title, steps[], cards[]` | Generic strategy card (Jigsaw, Role Play, Gallery Walk, Snowball…) |
| `observe` | `title, visual, questions[{q,a}]` | Observe & Discover with reveal answers |

`visual.kind` can be:
- `table` (`head[]`, `rows[][]`)
- `rgb` (an interactive colour mixer)
- `layers` (`items[]`)
- `code` (`value`, with HTML syntax highlighting)
- `posture` (an ergonomics illustration)

## Keyboard shortcuts (player)

| Key | Action |
|---|---|
| → / Space / PageDown | Next (first reveals the next hidden point/question when the slide has a progressive reveal) |
| ← / PageUp | Previous |
| Home / End | First / last slide |
| ت or C | Applause 👏 |
| ق or N | Name draw 🎲 (inside the draw: draw again) |
| Esc | Close the open panel; otherwise return to the library |

The bottom bar holds: ← السابق (previous) | counter | التالي → (next) | 👏 | 🎲 | 📊 بليكرز | ⛶ ملء الشاشة (full screen) | 🏠. It hides after 3 s without mouse movement.

## Unit themes

| Unit | Theme | Palette | Motif | Transition |
|---|---|---|---|---|
| 1 – أساسيات علم أجهزة الحاسب (Computer basics) | `unit-1` | Deep navy + electric sky blue + amber | Circuit-board traces, `0101`/`1100` digits | Horizontal slide |
| 2 – العمل عبر الإنترنت (Working online) | `unit-2` | Light sky + indigo + pink (the only light theme) | Clouds and dashed connection nodes | Soft rise |
| 3 – التقنية والحياة (Technology and life) | `unit-3` | Dark emerald + mint + lime | Hexagon cells / neural nodes | Zoom |
| 4 – البرمجة بلغة HTML (Programming in HTML) | `unit-4` | Near-black violet + neon pink + green | `</>`, `{ }`, `<h1>` code glyphs | Rise |

To change a unit's colours, edit the variables inside its `[data-theme="unit-N"]` block in `css/themes.css`.

## Learning strategies used

The strategies rotate across lessons:
- Observe & Discover (لاحظي واكتشفي)
- Flip cards
- Numbered Heads (الرؤوس المرقمة)
- Drag-and-drop matching, sorting and ordering
- Mystery Box (الصندوق الغامض)
- Jigsaw (التعلم بالأقران)
- Four Corners (الأركان الأربعة)
- Role Play (لعب الأدوار)
- Tic-Tac-Toe (إكس-أو)
- "What would you do?" (ماذا ستفعلين؟)
- KWL
- Gallery Walk (جولة المعرض)
- Mini Escape Room (غرفة الهروب)
- Concept/Mind Map
- Snowball (كرة الثلج)
- Hot Seat (الكرسي الساخن)

Every lesson also includes:
- Brainstorming
- Think–Pair–Share
- MCQs and True/False
- 3 Plickers questions
- A one-minute challenge
- An exit ticket with Traffic Lights self-assessment (إشارة المرور)

## Units and lessons map

| Unit (book page) | Lesson | Book page | Slides (incl. cover) |
|---|---|---|---|
| **1. أساسيات علم أجهزة الحاسب (Computer basics, p. 12)** | u1l1 تمثيل البيانات (Data representation) | 13 | 26 |
| | u1l2 بُنية جهاز الحاسب (Computer architecture) | 26 | 25 |
| | u1l3 أنظمة التشغيل (Operating systems) | 35 | 24 |
| | u1l4 أساسيات الشبكات (Networking basics) | 47 | 25 |
| | u1l5 تقنية المعلومات والاتصالات والمجتمع (ICT and society) | 59 | 25 |
| **2. العمل عبر الإنترنت (Working online, p. 70)** | u2l1 العمل مع المستندات عبر الإنترنت (Working with online documents) | 71 | 24 |
| | u2l2 الاجتماعات عبر الإنترنت (Online meetings) | 79 | 24 |
| | u2l3 بث العرض التقديمي (Broadcasting a presentation) | 92 | 23 |
| | u2l4 إدارة الملاحظات (Managing notes) | 99 | 25 |
| | u2l5 الخرائط الذهنية (Mind maps) | 106 | 24 |
| **3. التقنية والحياة (Technology and life, p. 120)** | u3l1 المراقبة والتحكم (Monitoring and control) | 121 | 24 |
| | u3l2 الذكاء الاصطناعي (Artificial intelligence) | 128 | 25 |
| | u3l3 التقنيات الناشئة (Emerging technologies) | 136 | 24 |
| | u3l4 الصحة والبيئة (Health and the environment) | 145 | 24 |
| **4. البرمجة باستخدام لغة HTML (Programming with HTML, p. 158)** | u4l1 إنشاء موقع إلكتروني بلغة HTML (Building a website in HTML) | 159 | 26 |
| | u4l2 بنية المحتوى (Content structure) | 173 | 27 |
| | u4l3 إنشاء نموذج بلغة HTML (Building an HTML form) | 188 | 26 |

## Security notes

- Data is stored per teacher under `teachers/{uid}` in Firestore, with two subcollections:
  - `classes/{classId}`: the class with its students, their points and its lesson progress.
  - `plickers/{classId}__{lessonId}`: Plickers answers for one class in one lesson.
- `staff/{uid}` lists the teachers the admin added, with `active: true/false`. Only the admin (an email listed in `isAdmin()`) can create or change these entries; a teacher can read only her own.
- `firestore.rules` allows reading and writing `teachers/{uid}` only when `request.auth.uid` matches `{uid}` **and** the user is the admin or an active staff member. Every other path is refused.
- The admin creates accounts through a second, separate Firebase app instance, so her own session stays signed in. Accounts can't be deleted from the browser: disable them on the admin page, then delete them in **Authentication → Users** if needed.
- The Firebase web config in `js/config.js` is public by design. Never put a service-account key or Admin SDK credentials in the frontend.
- Student names are never written to the console.
- The name draw stores only student ids, not names, in `localStorage`.
- On a shared school computer, log out (خروج) at the end of the day: logging out also clears the local copy of the teacher's data in that browser.

## Offline behaviour

- **Reads:** every read comes from a local cache (`localStorage`, wrapped in try/catch), so lessons, the name draw and Plickers recording keep working when the internet drops.
- **Writes:** each write is applied locally first, then sent to Firestore. When the internet is down, Firestore keeps the write in the browser (IndexedDB) and sends it automatically when the connection returns, even after the page is reloaded.
- **Free-plan reads:** data is grouped into a few large documents (one per class, plus one per class and lesson for Plickers). Loading the app costs only a handful of reads, far below the free plan's 50,000 reads per day.
- **Two devices:** if the same class is edited on two devices at the same moment, the last save wins for that class.
- **Badge:** shows "متصل ✓" (online), "جارٍ الحفظ…" (saving), "غير متصل – سيتم الحفظ لاحقًا" (offline – will save later), or "وضع تجريبي (محلي)" (local demo mode).
- **Limitations:**
  - The very first login needs a connection.
  - The Firebase and SheetJS libraries come from a CDN and are normally kept in the browser cache. Excel import and export need SheetJS to have loaded.

## Content review checklist for the teacher

- Review every slide marked "يُرجى مراجعة المعلمة", that is, all national and religious value slides. Quranic verses and hadiths were chosen from well-known texts with references, but confirm the wording before teaching.
- Spot-check lesson content against the book, especially page numbers and examples.

## Future improvements

- A service worker to cache the app and the libraries for fully offline cold starts.
- An in-app lesson editor so content can be changed without editing `lessons.js`.
- Charts of a student's progress over time, and per-class comparison reports.
- Export of slides as PDF handouts.
- Shared lesson libraries between teachers, read-only through security rules.
