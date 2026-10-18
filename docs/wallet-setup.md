# بطاقة رمز التقييم في المحفظة (Apple Wallet / Google Wallet)

الموظف المفعّل له «تقييم العميل» يفتح صفحة «تقييم العميل» ويضغط:
- **إضافة إلى Apple Wallet** (آيفون) → ملف `.pkpass` موقّع.
- **إضافة إلى Google Wallet** (أندرويد) → رابط «حفظ في المحفظة».

كلاهما يعرض اسم الموظف ومحطته ورقمه الوظيفي ورمز QR يفتح `/rate/<token>`.
الخدمتان (Edge Functions) تُنشران يدوياً مع `--no-verify-jwt` لأن الاستدعاء رابط مباشر من الجوال.
الأسرار تُحفظ في Supabase فقط، ولا تُرسل لأي أحد ولا تُكتب في الكود.

## أولاً: Apple Wallet
1. developer.apple.com ← Certificates, Identifiers & Profiles ← Identifiers ← زر + ← **Pass Type IDs** ← سجّل معرّفاً مثل `pass.com.nwbus.rating`.
2. افتح المعرّف ← **Create Certificate** ← يطلب CSR. ولّده على الماك:
   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr -subj "/CN=NWBUS Pass/O=NWBUS/C=SA"
   ```
   ارفع `pass.csr` ونزّل `pass.cer`.
3. حوّل الشهادة:
   ```bash
   openssl x509 -inform DER -in pass.cer -out pass-cert.pem
   ```
4. نزّل شهادة **Apple WWDR G4** من https://www.apple.com/certificateauthority/ ثم:
   ```bash
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
5. **Team ID**: من صفحة Membership في حساب المطور.
6. الأسرار:
   ```bash
   supabase secrets set APPLE_PASS_TYPE_ID="pass.com.nwbus.rating" APPLE_TEAM_ID="XXXXXXXXXX" \
     APPLE_PASS_CERT_PEM="$(cat pass-cert.pem)" APPLE_PASS_KEY_PEM="$(cat pass.key)" APPLE_WWDR_PEM="$(cat wwdr.pem)"
   ```
7. النشر: `supabase functions deploy wallet-apple --no-verify-jwt`

## ثانياً: Google Wallet
1. pay.google.com/business/console ← أنشئ ملف الأعمال ← **Google Wallet API** ← انسخ **Issuer ID**.
2. console.cloud.google.com ← مشروع ← فعّل **Google Wallet API** ← أنشئ **Service Account** ← Keys ← Add key ← JSON.
3. في Wallet Console ← Users ← أضف إيميل الـ Service Account كمستخدم (Developer).
4. الأسرار (من ملف JSON: `client_email` و`private_key`):
   ```bash
   supabase secrets set GOOGLE_WALLET_ISSUER_ID="3388000000000000000" \
     GOOGLE_WALLET_SA_EMAIL="wallet@xxxx.iam.gserviceaccount.com" \
     GOOGLE_WALLET_SA_PRIVATE_KEY="$(cat wallet-key.pem)"
   ```
   (`wallet-key.pem` = قيمة `private_key` من JSON كما هي بين BEGIN/END.)
5. النشر: `supabase functions deploy wallet-google --no-verify-jwt`
6. تنبيه: قبل اعتماد الإنتاج من Google، تعمل البطاقة لحسابات الاختبار فقط (Wallet Console ← Google Wallet API ← Test accounts). اطلب «Publishing access» لتعمل لكل الموظفين.

## ملاحظات
- الموقع الافتراضي `https://www.nwstation.com` (يتغير بسر `SITE_URL`).
- شعار Google يُجلب من `/wallet/icon-512.png` على الموقع.
- البطاقة تحمل بيانات وقت إنشائها؛ لو تغيّر اسم الموظف يعيد إضافتها.
- لو تغيّر رمز التقييم (token) لحساب، البطاقة القديمة تتوقف ويعاد إنشاؤها.
