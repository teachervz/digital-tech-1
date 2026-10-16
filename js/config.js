// =====================================================================
// إعدادات الاتصال بـ Firebase
// الصقي هنا إعدادات مشروعك من:
// Firebase console → ⚙️ Project settings → General → Your apps → تطبيق ويب </> → SDK setup and configuration → Config
// هذه القيم عامة بطبيعتها؛ حماية البيانات تتم عبر قواعد firestore.rules.
// إذا تُركت القيم كما هي، يعمل التطبيق في "الوضع التجريبي" وتُحفظ البيانات في هذا المتصفح فقط.
// =====================================================================
window.APP_CONFIG = {
  FIREBASE: {
    apiKey: 'AIzaSyBOJnScB5sJSdN_5bJ3uaDtqrbT7lpEkos',
    authDomain: 'teacher-a9ae2.firebaseapp.com',
    projectId: 'teacher-a9ae2',
    storageBucket: 'teacher-a9ae2.firebasestorage.app',
    messagingSenderId: '348935271437',
    appId: '1:348935271437:web:3d4c66d98f14414029d144',
  },
  // بريد المسؤولة التي تضيف حسابات المعلمات من صفحة admin.html
  // ⚠️ يجب أن يكون نفس البريد المكتوب في firestore.rules (دالة isAdmin)
  ADMIN_EMAILS: ['albeshriRehab@gmail.com'],
};
