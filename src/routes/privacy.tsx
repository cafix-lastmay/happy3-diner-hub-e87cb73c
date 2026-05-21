import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

const SUPPORT_EMAIL = "[Your Email Here]";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Dine Smart Deal" },
      {
        name: "description",
        content:
          "How Dine Smart Deal collects, uses, and protects your data — bilingual (English / Arabic).",
      },
      { property: "og:title", content: "Privacy Policy — Dine Smart Deal" },
      {
        property: "og:description",
        content:
          "Bilingual privacy policy for the Dine Smart Deal cafeteria management and smart-ordering app.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>

        {/* ============= ENGLISH ============= */}
        <article
          dir="ltr"
          className="prose prose-sm max-w-none dark:prose-invert"
        >
          <h1>Privacy Policy</h1>
          <p>
            <em>Last updated: 2026</em>
          </p>
          <p>
            This Privacy Policy explains how <strong>Dine Smart Deal</strong>{" "}
            ("we", "our", "the app") collects, uses, and protects your
            information when you use our cafeteria management and smart-ordering
            platform.
          </p>

          <h2>1. Information We Collect</h2>
          <ul>
            <li>
              <strong>Account information</strong>: your name and email address,
              used to create and secure your account.
            </li>
            <li>
              <strong>Order history</strong>: items ordered, totals, table, and
              timestamps — used to deliver and improve the service.
            </li>
            <li>
              <strong>Optional contact details</strong>: phone, WhatsApp, and
              address you choose to provide.
            </li>
            <li>
              <strong>Device push tokens</strong>: a device identifier from
              Apple (APNs) or Google (FCM) used solely to deliver service
              notifications.
            </li>
          </ul>

          <h2>2. Camera Use</h2>
          <p>
            The camera is used <strong>only</strong> for scanning table QR
            codes. <strong>No images, photos, or video are ever captured,
            stored, transmitted, or analyzed.</strong> The QR scanner reads the
            code on-device in real time and immediately discards the frame.
          </p>

          <h2>3. Where Your Data Is Stored</h2>
          <p>
            Your data is securely managed through{" "}
            <strong>Supabase</strong>, our backend infrastructure provider. Data
            is encrypted in transit (HTTPS) and at rest, and access is
            restricted by Row-Level Security policies so each user can only
            access data that belongs to them.
          </p>

          <h2>4. We Do Not Sell Your Data</h2>
          <p>
            We <strong>never sell</strong> your personal data to third parties.
            We do not share your data for advertising. Limited operational
            sharing is restricted to the providers strictly required to run the
            service (Supabase for backend, Apple/Google for push delivery).
          </p>

          <h2>5. Your Right to Delete Your Account</h2>
          <p>
            You can permanently delete your account at any time from{" "}
            <strong>Settings → Account → Delete Account</strong>. This removes
            your personal account information from our systems. Operational
            records that the cafeteria is legally required to retain (e.g.
            invoices) may be kept in anonymized form.
          </p>

          <h2>6. Notifications</h2>
          <p>
            You may disable push notifications at any time from your device
            settings or the in-app notification preferences screen.
          </p>

          <h2>7. Children</h2>
          <p>
            The app is intended for business use and is not directed at
            children under 13.
          </p>

          <h2>8. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. Continued use of the
            app after changes constitutes acceptance of the updated policy.
          </p>

          <h2>9. Contact</h2>
          <p>
            For privacy questions or to request data access or deletion, contact
            us at: <strong>{SUPPORT_EMAIL}</strong>
          </p>
        </article>

        <hr className="my-10 border-border" />

        {/* ============= ARABIC ============= */}
        <article
          dir="rtl"
          lang="ar"
          className="prose prose-sm max-w-none dark:prose-invert text-right"
        >
          <h1>سياسة الخصوصية</h1>
          <p>
            <em>آخر تحديث: 2026</em>
          </p>
          <p>
            توضح سياسة الخصوصية هذه كيف يقوم تطبيق{" "}
            <strong>Dine Smart Deal</strong> ("نحن"، "التطبيق") بجمع معلوماتك
            واستخدامها وحمايتها عند استخدام منصتنا لإدارة الكافيتيريا والطلب
            الذكي.
          </p>

          <h2>1. المعلومات التي نجمعها</h2>
          <ul>
            <li>
              <strong>معلومات الحساب</strong>: الاسم والبريد الإلكتروني
              لإنشاء حسابك وتأمينه.
            </li>
            <li>
              <strong>سجل الطلبات</strong>: العناصر المطلوبة، الإجماليات،
              الطاولة، والتوقيت — لتقديم الخدمة وتحسينها.
            </li>
            <li>
              <strong>بيانات تواصل اختيارية</strong>: رقم الهاتف، الواتساب،
              والعنوان إن اخترت إدخالها.
            </li>
            <li>
              <strong>معرّفات الإشعارات</strong>: مُعرّف جهاز من Apple (APNs)
              أو Google (FCM) لإرسال إشعارات الخدمة فقط.
            </li>
          </ul>

          <h2>2. استخدام الكاميرا</h2>
          <p>
            تُستخدم الكاميرا <strong>فقط</strong> لمسح رموز QR الخاصة
            بالطاولات.{" "}
            <strong>
              لا يتم التقاط أو تخزين أو إرسال أو تحليل أي صور أو مقاطع فيديو
              إطلاقًا.
            </strong>{" "}
            يقرأ الماسح الرمز مباشرة على الجهاز ثم يتخلص من الإطار فورًا.
          </p>

          <h2>3. مكان تخزين البيانات</h2>
          <p>
            تتم إدارة بياناتك بأمان عبر <strong>Supabase</strong>، وهي البنية
            التحتية لخادمنا. البيانات مشفّرة أثناء النقل (HTTPS) وأثناء التخزين،
            والوصول مُقيّد بسياسات أمان على مستوى الصفوف (RLS) بحيث يصل كل
            مستخدم فقط إلى بياناته الخاصة.
          </p>

          <h2>4. نحن لا نبيع بياناتك</h2>
          <p>
            نحن <strong>لا نبيع</strong> بياناتك الشخصية لأي طرف ثالث، ولا
            نشاركها لأغراض إعلانية. تقتصر المشاركة على مزوّدي الخدمة الضروريين
            لتشغيل التطبيق فقط (Supabase للخادم، وApple / Google لإرسال
            الإشعارات).
          </p>

          <h2>5. حقّك في حذف الحساب</h2>
          <p>
            يمكنك حذف حسابك نهائيًا في أي وقت من{" "}
            <strong>الإعدادات ← الحساب ← حذف الحساب</strong>. سيؤدي ذلك إلى
            إزالة بيانات حسابك الشخصية من أنظمتنا. قد يتم الاحتفاظ ببعض السجلات
            التشغيلية (مثل الفواتير) بشكل مجهول الهوية إذا اقتضى القانون ذلك.
          </p>

          <h2>6. الإشعارات</h2>
          <p>
            يمكنك تعطيل الإشعارات في أي وقت من إعدادات جهازك أو من شاشة تفضيلات
            الإشعارات داخل التطبيق.
          </p>

          <h2>7. الأطفال</h2>
          <p>
            التطبيق مُخصّص للاستخدام التجاري وغير موجّه للأطفال دون سن 13 عامًا.
          </p>

          <h2>8. التغييرات على هذه السياسة</h2>
          <p>
            قد نقوم بتحديث هذه السياسة من حين لآخر. استمرار استخدامك للتطبيق
            بعد التحديث يُعدّ موافقة على السياسة المُحدّثة.
          </p>

          <h2>9. التواصل</h2>
          <p>
            لأي استفسار حول الخصوصية أو لطلب الوصول إلى بياناتك أو حذفها، تواصل
            معنا على: <strong>{SUPPORT_EMAIL}</strong>
          </p>
        </article>
      </div>
      <Footer />
    </div>
  );
}
