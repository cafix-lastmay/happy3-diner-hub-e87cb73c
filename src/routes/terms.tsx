import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

const SUPPORT_EMAIL = "[Your Email Here]";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Dine Smart Deal" },
      {
        name: "description",
        content:
          "Terms governing the use of the Dine Smart Deal cafeteria management and smart-ordering platform — bilingual (English / Arabic).",
      },
      { property: "og:title", content: "Terms of Service — Dine Smart Deal" },
      {
        property: "og:description",
        content:
          "Bilingual terms of service for cafeterias, staff, marketers, and customers using Dine Smart Deal.",
      },
    ],
  }),
});

function TermsPage() {
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
          <h1>Terms of Service</h1>
          <p>
            <em>Last updated: 2026</em>
          </p>

          <h2>1. The Service</h2>
          <p>
            <strong>Dine Smart Deal</strong> is a platform for cafeteria
            management and smart ordering. It provides cafeteria owners,
            managers, and staff with tools to manage menus, tables, shifts, and
            payments, and lets customers place orders by scanning a table QR
            code.
          </p>

          <h2>2. Acceptance</h2>
          <p>
            By creating an account or using the app you agree to these Terms.
            If you do not agree, please do not use the service.
          </p>

          <h2>3. Accounts &amp; Order Accuracy</h2>
          <p>
            You are responsible for keeping your credentials secure and for all
            activity under your account. <strong>You are solely responsible for
            the accuracy of the orders you place</strong> — including items,
            quantities, customizations, and any notes you submit. Please review
            your order before confirming.
          </p>

          <h2>4. Role of the App vs. the Cafeteria</h2>
          <p>
            Dine Smart Deal is a <strong>tool for ordering and operations
            only</strong>. The cafeteria you order from is solely responsible
            for the <strong>quality, preparation, hygiene, fulfillment, and
            delivery</strong> of food and beverages. We do not prepare or
            handle any food and are not a party to the transaction between you
            and the cafeteria.
          </p>

          <h2>5. Acceptable Use</h2>
          <p>
            You agree not to misuse the service. In particular, you must not:
          </p>
          <ul>
            <li>
              Abuse, manipulate, or attempt to bypass the QR scanning system
              (e.g., generating fake table QR codes, mass-spamming orders, or
              using QR tokens not assigned to your visit).
            </li>
            <li>
              Abuse the referral / marketer program through fake accounts,
              self-referrals, or any artificial inflation of the hierarchy.
            </li>
            <li>
              Attempt unauthorized access to other users' data or to the
              backend.
            </li>
            <li>Use the service to violate any applicable law.</li>
          </ul>
          <p>
            Violations may result in <strong>warning, suspension, or permanent
            termination</strong> of your account and forfeiture of any pending
            commissions or balances tied to the abuse.
          </p>

          <h2>6. Payments &amp; Points</h2>
          <p>
            Recharge points purchased by cafeterias are non-refundable except
            as required by law. Marketer commissions are governed by the
            commission rules in effect at the time of each transaction.
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            The service is provided <em>"as is"</em> and <em>"as available"</em>
            . To the maximum extent permitted by law, Dine Smart Deal is{" "}
            <strong>not liable for any indirect, incidental, special, or
            consequential damages</strong>, nor for losses arising from:
          </p>
          <ul>
            <li>
              <strong>Technical interruptions</strong> — including but not
              limited to server downtime, network outages, push-notification
              delays, third-party provider failures (e.g., Supabase, FCM,
              APNs), planned maintenance, or force-majeure events.
            </li>
            <li>
              Errors in food preparation, fulfillment, or delivery, which
              remain the sole responsibility of the cafeteria.
            </li>
            <li>
              Unauthorized access caused by your failure to keep your
              credentials secure.
            </li>
          </ul>
          <p>
            Our aggregate liability to you for any claim related to the service
            shall not exceed the total amount you paid to use the service in
            the 12 months preceding the claim.
          </p>

          <h2>8. Termination</h2>
          <p>
            We may suspend or terminate accounts that violate these Terms. You
            may stop using the service and delete your account at any time from{" "}
            <strong>Settings → Account → Delete Account</strong>.
          </p>

          <h2>9. Changes</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            app after changes constitutes acceptance of the updated Terms.
          </p>

          <h2>10. Contact</h2>
          <p>
            For questions about these Terms, contact us at:{" "}
            <strong>{SUPPORT_EMAIL}</strong>
          </p>
        </article>

        <hr className="my-10 border-border" />

        {/* ============= ARABIC ============= */}
        <article
          dir="rtl"
          lang="ar"
          className="prose prose-sm max-w-none dark:prose-invert text-right"
        >
          <h1>شروط الخدمة</h1>
          <p>
            <em>آخر تحديث: 2026</em>
          </p>

          <h2>1. الخدمة</h2>
          <p>
            <strong>Dine Smart Deal</strong> هي منصّة لإدارة الكافيتيريا
            والطلب الذكي. توفّر لأصحاب الكافيتيريات والمديرين والموظفين أدوات
            لإدارة القوائم والطاولات والورديات والمدفوعات، وتتيح للعملاء تقديم
            الطلبات عبر مسح رمز QR الخاص بالطاولة.
          </p>

          <h2>2. الموافقة</h2>
          <p>
            بإنشائك حسابًا أو استخدامك للتطبيق فأنت توافق على هذه الشروط. إذا
            لم توافق، يُرجى عدم استخدام الخدمة.
          </p>

          <h2>3. الحسابات ودقّة الطلبات</h2>
          <p>
            أنت مسؤول عن الحفاظ على سرّية بيانات حسابك وعن جميع الأنشطة التي
            تتم من خلاله.{" "}
            <strong>
              تتحمّل وحدك مسؤولية دقّة الطلبات التي تقدّمها
            </strong>{" "}
            — بما يشمل العناصر والكميات والإضافات وأي ملاحظات تُدخلها. يُرجى
            مراجعة الطلب قبل تأكيده.
          </p>

          <h2>4. دور التطبيق مقابل دور الكافيتيريا</h2>
          <p>
            Dine Smart Deal هو <strong>أداة للطلب والتشغيل فقط</strong>.
            تتحمّل الكافيتيريا التي تطلب منها وحدها مسؤولية{" "}
            <strong>
              جودة الطعام وإعداده ونظافته وتجهيزه وتوصيله
            </strong>
            . نحن لا نُحضّر أو نتعامل مع أي طعام، ولسنا طرفًا في المعاملة
            بينك وبين الكافيتيريا.
          </p>

          <h2>5. الاستخدام المقبول</h2>
          <p>توافق على عدم إساءة استخدام الخدمة، وعلى وجه الخصوص:</p>
          <ul>
            <li>
              عدم العبث بنظام مسح رموز QR أو محاولة الالتفاف عليه (مثل توليد
              رموز طاولات وهمية، أو إرسال طلبات مزيّفة بكميات كبيرة، أو استخدام
              رموز لا تخصّ زيارتك).
            </li>
            <li>
              عدم إساءة استخدام برنامج الإحالة / المسوّقين عبر حسابات وهمية أو
              إحالات ذاتية أو أي تضخيم مصطنع للهرم.
            </li>
            <li>
              عدم محاولة الوصول غير المصرّح به إلى بيانات مستخدمين آخرين أو إلى
              الخادم.
            </li>
            <li>عدم استخدام الخدمة لمخالفة أي قانون ساري المفعول.</li>
          </ul>
          <p>
            قد تؤدي المخالفات إلى{" "}
            <strong>تحذير، أو إيقاف مؤقت، أو إنهاء دائم</strong> للحساب، إلى
            جانب مصادرة أي عمولات أو أرصدة معلّقة مرتبطة بالإساءة.
          </p>

          <h2>6. المدفوعات والنقاط</h2>
          <p>
            نقاط الشحن التي تشتريها الكافيتيريا غير قابلة للاسترداد إلا حيث
            يستوجب القانون ذلك. وتخضع عمولات المسوّقين لقواعد العمولات
            السارية وقت كل معاملة.
          </p>

          <h2>7. حدود المسؤولية</h2>
          <p>
            تُقدَّم الخدمة <em>"كما هي"</em> و<em>"وفقًا لتوفّرها"</em>. وإلى
            أقصى حدّ يُجيزه القانون، فإن Dine Smart Deal{" "}
            <strong>
              غير مسؤول عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية
            </strong>
            ، ولا عن أي خسائر ناتجة عن:
          </p>
          <ul>
            <li>
              <strong>الانقطاعات التقنية</strong> — بما في ذلك على سبيل المثال
              لا الحصر توقّف الخادم، انقطاع الشبكة، تأخر إشعارات الدفع،
              إخفاقات مزوّدي الخدمات الخارجية (مثل Supabase وFCM وAPNs)،
              الصيانة المخطّط لها، أو الظروف القاهرة.
            </li>
            <li>
              الأخطاء في إعداد الطعام أو تجهيزه أو توصيله، فهي على مسؤولية
              الكافيتيريا وحدها.
            </li>
            <li>
              الوصول غير المصرّح به الناتج عن إخفاقك في الحفاظ على سرّية بيانات
              حسابك.
            </li>
          </ul>
          <p>
            لا تتجاوز مسؤوليتنا التراكمية تجاهك عن أي مطالبة متعلّقة بالخدمة
            إجمالي المبلغ الذي دفعته لاستخدام الخدمة خلال الـ 12 شهرًا
            السابقة للمطالبة.
          </p>

          <h2>8. الإنهاء</h2>
          <p>
            يحق لنا إيقاف أو إنهاء الحسابات التي تخالف هذه الشروط. يمكنك
            التوقّف عن استخدام الخدمة وحذف حسابك في أي وقت من{" "}
            <strong>الإعدادات ← الحساب ← حذف الحساب</strong>.
          </p>

          <h2>9. التغييرات</h2>
          <p>
            قد نقوم بتحديث هذه الشروط من حين لآخر. استمرار استخدامك للتطبيق
            بعد التحديث يُعدّ موافقة على الشروط المُحدّثة.
          </p>

          <h2>10. التواصل</h2>
          <p>
            لأي استفسار حول هذه الشروط، تواصل معنا على:{" "}
            <strong>{SUPPORT_EMAIL}</strong>
          </p>
        </article>
      </div>
      <Footer />
    </div>
  );
}
