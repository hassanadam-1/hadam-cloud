/**
 * Real email delivery via Resend (https://resend.com).
 *
 * Requires two environment variables:
 *   RESEND_API_KEY — from https://resend.com/api-keys
 *   FROM_EMAIL     — the sender address. Until you verify your own domain
 *                     with Resend, this MUST be "onboarding@resend.dev" —
 *                     and emails will only actually deliver to the same
 *                     address you used to sign up for your Resend account
 *                     (a Resend sandbox restriction, not a bug here). Once
 *                     you verify a real domain, set this to an address on
 *                     that domain (e.g. "orders@yourstore.com") and it'll
 *                     deliver to any real recipient.
 *
 * If these aren't set, sendEmail() logs a clear warning and does nothing —
 * it never throws, so a missing/misconfigured email setup can't break
 * checkout or any other flow that tries to send a notice.
 */

let warnedOnce = false;

/**
 * Wraps plain-text email body content as HTML with proper RTL direction
 * for Arabic. This is the actual missing piece for genuine Arabic email
 * formatting — plain text has no directionality markup at all, so
 * "localizing the text" alone was never going to produce correctly
 * right-to-left rendered emails; the email itself has to be HTML with an
 * explicit dir attribute.
 */
function wrapEmailHtml(text, lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const escaped = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withBreaks = escaped.replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><body style="font-family:Arial,sans-serif;direction:${dir};text-align:${align};max-width:560px;margin:0 auto;padding:20px;color:#222;">${withBreaks}</body></html>`;
}

async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) {
    if (!warnedOnce) {
      console.warn('[email] RESEND_API_KEY and/or FROM_EMAIL not set — real email delivery is disabled. Notifications are still logged in the app\'s own notification history.');
      warnedOnce = true;
    }
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const payload = { from, to, subject, text };
    if (html) payload.html = html; // only sent when a caller opts into HTML (e.g. for RTL Arabic content) — plain-text-only emails are unaffected
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] Resend API error:', res.status, data.message || JSON.stringify(data));
      return { sent: false, reason: data.message || `HTTP ${res.status}` };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    console.error('[email] Failed to reach Resend:', e.message);
    return { sent: false, reason: e.message };
  }
}

/**
 * Centralized email subject/body templates. Lives here (not duplicated in
 * server.js and lib/auth.js separately) specifically so both files share
 * one translation source for email content, per the project requirement
 * that templates shouldn't drift from each other. Frontend UI text has
 * its own separate i18n dictionaries (public/app.js, public-platform/app.js)
 * since those run in the browser, a genuinely different runtime context —
 * sharing one literal object across browser and Node.js isn't practical,
 * but keeping every backend email in exactly one place is.
 */
const EMAIL_I18N = {
  en: {
    verificationCodeSubject: 'Your Hadam verification code',
    verificationCodeBody: (code) => `Your verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
    orderConfirmationSubject: (storeName, orderId) => `Your order from ${storeName} — ${orderId}`,
    orderConfirmationBody: ({ customerName, customerEmail, orderId, date, total, itemsList, meetingLinks, pendingMeetingItems, hasDownload, orderUrl, storeName }) => {
      const meetingLinksText = meetingLinks.length ? `\n\nOnline meeting link(s):\n${meetingLinks.map(m => `- ${m.name}: ${m.link}`).join('\n')}` : '';
      const pendingMeetingText = pendingMeetingItems.length ? `\n\nMeeting link pending for: ${pendingMeetingItems.join(', ')} — we'll email it to you as soon as it's available.` : '';
      const accessLine = hasDownload ? `Your digital item(s) are ready to download here:\n${orderUrl}\n\n(Log in to your account on that page to access your download.)` : `You can view your order at any time here:\n${orderUrl}`;
      return `Hi ${customerName},\n\nThanks for your order! Your payment has been confirmed.\n\nOrder Number: ${orderId}\nCustomer: ${customerName} (${customerEmail})\nDate: ${date}\nTotal: $${total}\nPayment Status: Confirmed\n\nItems:\n${itemsList}${meetingLinksText}${pendingMeetingText}\n\n${accessLine}\n\n— ${storeName}`;
    },
    refundApprovedSubject: (itemName) => `Your refund request has been approved — ${itemName}`,
    refundApprovedBody: (itemName, orderUrl, storeName) => `Good news — your refund request for "${itemName}" has been approved.\n\nTo complete the refund, please confirm your refund payment method here: ${orderUrl}\n\n— ${storeName}`,
    refundRejectedSubject: (itemName) => `Your refund request was not approved — ${itemName}`,
    refundRejectedBody: (itemName, decisionReason) => `Your refund request for "${itemName}" was not approved.\n\nReason: ${decisionReason || '(no reason provided)'}\n\nIf you have questions, please contact us.`,
    refundCompletedCustomerSubject: (itemName) => `Your refund for ${itemName} has been completed`,
    refundCompletedCustomerBody: (itemName, last4, storeName) => `Hi,\n\nYour refund for "${itemName}" has been successfully processed.\n\nRefund method: card ending in ${last4}\n\n— ${storeName}`,
    refundCompletedStaffSubject: (itemName) => `Refund completed — ${itemName}`,
    refundCompletedStaffBody: (orderId, itemName, last4) => `A refund has been successfully processed.\n\nOrder: ${orderId}\nItem: ${itemName}\nRefund method: card ending in ${last4}\n\nThis was a simulated payment reversal.`,
    renewalConfirmedSubject: (servicesRenewed) => `Renewal confirmed — ${servicesRenewed}`,
    renewalConfirmedBody: (clientName, clientEmail, servicesRenewed, subscriptionStart, subscriptionEnd) => `A renewal payment has been confirmed.\n\nClient: ${clientName || '(not provided)'} (${clientEmail})\nService(s) renewed: ${servicesRenewed}\nPayment: Confirmed\nSubscription period: ${subscriptionStart} to ${subscriptionEnd}\n\nThis is an automated confirmation — no action needed unless something looks wrong.`,
    newContactMessageSubject: (name) => `New Contact form message from ${name}`,
    newContactMessageBody: (name, email, message) => `A new message was submitted through the Contact form.\n\nFrom: ${name} (${email})\n\nMessage:\n${message}\n\nView and manage all messages in the Superadmin dashboard.`,
    paymentReceivedSubject: (orderId) => `Payment received — Order ${orderId}`,
    paymentReceivedBody: (orderId, customerName, amount, date, itemsList) => `Order Number: ${orderId}\nCustomer Name: ${customerName}\nPayment Amount: $${amount}\nPayment Method: Card\nDate and Time: ${date}\nPayment Status: Success\n\nItems purchased:\n${itemsList}`,
    deliveryReminderSubject: (storeName) => `Reminder: please confirm your delivery from ${storeName}`,
    deliveryReminderBody: (itemName, orderUrl, storeName) => `Hi,\n\nJust a reminder — your order (${itemName}) was marked as delivered a few days ago, and we haven't heard back yet.\n\nPlease confirm you received it, or let us know if something's wrong: ${orderUrl}\n\n— ${storeName}`,
    refundRequestedSubject: (itemName) => `Refund requested — ${itemName}`,
    refundRequestedBody: (orderId, itemName, customerEmail, reason, requestedAt) => `A customer has requested a refund.\n\nOrder: ${orderId}\nItem: ${itemName}\nCustomer: ${customerEmail}\nReason given: ${reason || '(no reason provided)'}\nRequested: ${requestedAt}\n\nPlease review this request in the Fulfillment Queue.`,
    deliveryProblemSubject: (storeName) => `Delivery problem reported — ${storeName}`,
    deliveryProblemBody: (orderId, itemName, note) => `A customer reported a problem with a delivered item.\n\nOrder: ${orderId}\nItem: ${itemName}\nNote: ${note || '(no note provided)'}\n\nPlease review this order.`,
    marketplaceReceivedSubject: (businessName) => `We've received your Hadam Marketplace application — ${businessName}`,
    marketplaceReceivedBody: (ownerName, businessName) => `Hi ${ownerName},\n\nThank you for applying to join Hadam Marketplace with "${businessName}". Your application is now pending review by our team — you'll receive another email once it's been reviewed, and your listing will not appear publicly until then.\n\n— Hadam Marketplace`,
    marketplaceReviewSubject: (action, businessName) => ({
      approve: `Your Hadam Marketplace application has been approved — ${businessName}`,
      reject: `Update on your Hadam Marketplace application — ${businessName}`,
      request_more_info: `More information needed for your Hadam Marketplace application — ${businessName}`,
      suspend: `Your Hadam Marketplace listing has been suspended — ${businessName}`,
      reactivate: `Your Hadam Marketplace listing has been reactivated — ${businessName}`,
    })[action],
    marketplaceReviewBody: (action, businessName, ownerName, note) => ({
      approve: `Hi ${ownerName},\n\nGreat news — "${businessName}" has been approved and is now live on Hadam Marketplace.\n\n— Hadam Marketplace`,
      reject: `Hi ${ownerName},\n\nAfter review, we're unable to approve "${businessName}" for Hadam Marketplace at this time.${note ? `\n\nReason: ${note}` : ''}\n\n— Hadam Marketplace`,
      request_more_info: `Hi ${ownerName},\n\nWe need a bit more information to review "${businessName}" for Hadam Marketplace.${note ? `\n\nDetails: ${note}` : ''}\n\nPlease reply to this email with the requested details.\n\n— Hadam Marketplace`,
      suspend: `Hi ${ownerName},\n\n"${businessName}" has been suspended from Hadam Marketplace and is no longer publicly listed.${note ? `\n\nReason: ${note}` : ''}\n\n— Hadam Marketplace`,
      reactivate: `Hi ${ownerName},\n\n"${businessName}" has been reactivated and is now live on Hadam Marketplace again.\n\n— Hadam Marketplace`,
    })[action],
    deliveryMarkedSubject: (storeName) => `Your order from ${storeName} has been marked as delivered`,
    deliveryMarkedBody: (itemName, orderUrl, storeName) => `Hi,\n\nYour order has been marked as delivered.\n\nItem: ${itemName}\n\nPlease confirm you received your package: ${orderUrl}\n\nIf something's wrong — missing, damaged, or never arrived — you can report a problem from the same page instead.\n\n— ${storeName}`,
    meetingLinkAvailableSubject: (productName) => `Your meeting link for ${productName} is now available`,
    meetingLinkAvailableBody: (productName, meetingLink, storeName) => `Hi,\n\nThe meeting link for "${productName}" is now available:\n\n${meetingLink}\n\nSee you there!\n\n— ${storeName}`,
    renewalReminderSubject: (storeName, timeLabel) => `Your Hadam subscription for "${storeName}" expires ${timeLabel}`,
    renewalReminderBody: (adminName, storeName, plan, timeLabel, expiryDate) => `Hi ${adminName},\n\nYour store "${storeName}" (plan: ${plan}) is set to expire ${timeLabel}, on ${expiryDate}.\n\nRenew anytime from Admin → Store Settings to keep your store (and Marketplace listing, if applicable) running without interruption.\n\n— Hadam Marketplace`,
    renewedNoticeSubject: (storeName) => `Your Hadam subscription for "${storeName}" has been renewed`,
    renewedNoticeBody: (adminName, storeName, plan, expiryDate) => `Hi ${adminName},\n\nYour store "${storeName}" has been renewed as: ${plan}. Your new expiry date is ${expiryDate}.\n\nThank you for staying with Hadam Marketplace.\n\n— Hadam Marketplace`,
    expiredNoticeSubject: (storeName) => `Your Hadam subscription for "${storeName}" has expired`,
    expiredNoticeBody: (adminName, storeName, expiryDate) => `Hi ${adminName},\n\nYour store "${storeName}"'s subscription expired on ${expiryDate} without being renewed.\n\nYour store and data are safe — you can renew anytime from Admin → Store Settings to pick up right where you left off.\n\n— Hadam Marketplace`,
    storeContactReceivedSubject: (subject) => `New message from a customer — ${subject}`,
    storeContactReceivedBody: (customerName, customerEmail, subject, message) => `A customer submitted a message through your store's Contact form.\n\nFrom: ${customerName} (${customerEmail})\nSubject: ${subject}\n\nMessage:\n${message}\n\nYou can view and reply to this in your store's Support Messages panel.`,
    renewalTimeLabel1Month: 'in 1 month', renewalTimeLabel2Weeks: 'in 2 weeks', renewalTimeLabel1Week: 'in 1 week',
  },
  ar: {
    verificationCodeSubject: 'رمز التحقق الخاص بك في هدام',
    verificationCodeBody: (code) => `رمز التحقق الخاص بك هو: ${code}\n\nتنتهي صلاحية هذا الرمز خلال 10 دقائق. إذا لم تطلب هذا، يمكنك تجاهل هذا البريد الإلكتروني بأمان.`,
    orderConfirmationSubject: (storeName, orderId) => `طلبك من ${storeName} — ${orderId}`,
    orderConfirmationBody: ({ customerName, customerEmail, orderId, date, total, itemsList, meetingLinks, pendingMeetingItems, hasDownload, orderUrl, storeName }) => {
      const meetingLinksText = meetingLinks.length ? `\n\nرابط (روابط) الاجتماع عبر الإنترنت:\n${meetingLinks.map(m => `- ${m.name}: ${m.link}`).join('\n')}` : '';
      const pendingMeetingText = pendingMeetingItems.length ? `\n\nرابط الاجتماع قيد الانتظار لـ: ${pendingMeetingItems.join('، ')} — سنرسله إليك بالبريد الإلكتروني فور توفره.` : '';
      const accessLine = hasDownload ? `منتجاتك الرقمية جاهزة للتنزيل هنا:\n${orderUrl}\n\n(سجّل الدخول إلى حسابك في تلك الصفحة للوصول إلى تنزيلك.)` : `يمكنك عرض طلبك في أي وقت هنا:\n${orderUrl}`;
      return `مرحبًا ${customerName}،\n\nشكرًا لطلبك! تم تأكيد دفعتك.\n\nرقم الطلب: ${orderId}\nالعميل: ${customerName} (${customerEmail})\nالتاريخ: ${date}\nالإجمالي: $${total}\nحالة الدفع: مؤكدة\n\nالعناصر:\n${itemsList}${meetingLinksText}${pendingMeetingText}\n\n${accessLine}\n\n— ${storeName}`;
    },
    refundApprovedSubject: (itemName) => `تمت الموافقة على طلب استردادك — ${itemName}`,
    refundApprovedBody: (itemName, orderUrl, storeName) => `خبر سار — تمت الموافقة على طلب استرداد "${itemName}".\n\nلإتمام الاسترداد، يرجى تأكيد طريقة دفع الاسترداد هنا: ${orderUrl}\n\n— ${storeName}`,
    refundRejectedSubject: (itemName) => `لم تتم الموافقة على طلب استردادك — ${itemName}`,
    refundRejectedBody: (itemName, decisionReason) => `لم تتم الموافقة على طلب استرداد "${itemName}".\n\nالسبب: ${decisionReason || '(لم يُقدَّم سبب)'}\n\nإذا كانت لديك أسئلة، يرجى الاتصال بنا.`,
    refundCompletedCustomerSubject: (itemName) => `تم إكمال استرداد ${itemName}`,
    refundCompletedCustomerBody: (itemName, last4, storeName) => `مرحبًا،\n\nتمت معالجة استرداد "${itemName}" الخاص بك بنجاح.\n\nطريقة الاسترداد: بطاقة تنتهي بـ ${last4}\n\n— ${storeName}`,
    refundCompletedStaffSubject: (itemName) => `تم إكمال الاسترداد — ${itemName}`,
    refundCompletedStaffBody: (orderId, itemName, last4) => `تمت معالجة استرداد بنجاح.\n\nالطلب: ${orderId}\nالعنصر: ${itemName}\nطريقة الاسترداد: بطاقة تنتهي بـ ${last4}\n\nكان هذا عكس دفع محاكى.`,
    renewalConfirmedSubject: (servicesRenewed) => `تم تأكيد التجديد — ${servicesRenewed}`,
    renewalConfirmedBody: (clientName, clientEmail, servicesRenewed, subscriptionStart, subscriptionEnd) => `تم تأكيد دفعة تجديد.\n\nالعميل: ${clientName || '(غير متوفر)'} (${clientEmail})\nالخدمة (الخدمات) المُجدَّدة: ${servicesRenewed}\nالدفع: مؤكد\nفترة الاشتراك: من ${subscriptionStart} إلى ${subscriptionEnd}\n\nهذا تأكيد تلقائي — لا حاجة لأي إجراء ما لم يبدُ شيء غير صحيح.`,
    newContactMessageSubject: (name) => `رسالة جديدة من نموذج الاتصال من ${name}`,
    newContactMessageBody: (name, email, message) => `تم إرسال رسالة جديدة عبر نموذج الاتصال.\n\nمن: ${name} (${email})\n\nالرسالة:\n${message}\n\nاعرض جميع الرسائل وأدرها من لوحة المسؤول العام.`,
    paymentReceivedSubject: (orderId) => `تم استلام الدفعة — الطلب ${orderId}`,
    paymentReceivedBody: (orderId, customerName, amount, date, itemsList) => `رقم الطلب: ${orderId}\nاسم العميل: ${customerName}\nمبلغ الدفعة: $${amount}\nطريقة الدفع: بطاقة\nالتاريخ والوقت: ${date}\nحالة الدفع: نجحت\n\nالعناصر المشتراة:\n${itemsList}`,
    deliveryReminderSubject: (storeName) => `تذكير: يرجى تأكيد استلام طلبك من ${storeName}`,
    deliveryReminderBody: (itemName, orderUrl, storeName) => `مرحبًا،\n\nمجرد تذكير — تم تعليم طلبك (${itemName}) كمُسلَّم قبل بضعة أيام، ولم نسمع منك بعد.\n\nيرجى تأكيد استلامك له، أو إخبارنا إذا كان هناك خطأ ما: ${orderUrl}\n\n— ${storeName}`,
    refundRequestedSubject: (itemName) => `طلب استرداد — ${itemName}`,
    refundRequestedBody: (orderId, itemName, customerEmail, reason, requestedAt) => `طلب عميل استردادًا.\n\nالطلب: ${orderId}\nالعنصر: ${itemName}\nالعميل: ${customerEmail}\nالسبب المُقدَّم: ${reason || '(لم يُقدَّم سبب)'}\nتاريخ الطلب: ${requestedAt}\n\nيرجى مراجعة هذا الطلب في قائمة التنفيذ.`,
    deliveryProblemSubject: (storeName) => `تم الإبلاغ عن مشكلة في التسليم — ${storeName}`,
    deliveryProblemBody: (orderId, itemName, note) => `أبلغ عميل عن مشكلة في عنصر مُسلَّم.\n\nالطلب: ${orderId}\nالعنصر: ${itemName}\nملاحظة: ${note || '(لم تُقدَّم ملاحظة)'}\n\nيرجى مراجعة هذا الطلب.`,
    marketplaceReceivedSubject: (businessName) => `لقد استلمنا طلبك للانضمام إلى سوق هدام — ${businessName}`,
    marketplaceReceivedBody: (ownerName, businessName) => `مرحبًا ${ownerName}،\n\nشكرًا لتقديمك طلبًا للانضمام إلى سوق هدام باسم "${businessName}". طلبك الآن قيد المراجعة من فريقنا — ستصلك رسالة أخرى بمجرد مراجعته، ولن تظهر قائمتك علنًا حتى ذلك الحين.\n\n— سوق هدام`,
    marketplaceReviewSubject: (action, businessName) => ({
      approve: `تمت الموافقة على طلبك في سوق هدام — ${businessName}`,
      reject: `تحديث بشأن طلبك في سوق هدام — ${businessName}`,
      request_more_info: `معلومات إضافية مطلوبة لطلبك في سوق هدام — ${businessName}`,
      suspend: `تم تعليق قائمتك في سوق هدام — ${businessName}`,
      reactivate: `تمت إعادة تفعيل قائمتك في سوق هدام — ${businessName}`,
    })[action],
    marketplaceReviewBody: (action, businessName, ownerName, note) => ({
      approve: `مرحبًا ${ownerName}،\n\nخبر رائع — تمت الموافقة على "${businessName}" وهو الآن مباشر على سوق هدام.\n\n— سوق هدام`,
      reject: `مرحبًا ${ownerName}،\n\nبعد المراجعة، لا يمكننا الموافقة على "${businessName}" لسوق هدام في الوقت الحالي.${note ? `\n\nالسبب: ${note}` : ''}\n\n— سوق هدام`,
      request_more_info: `مرحبًا ${ownerName}،\n\nنحتاج معلومات إضافية لمراجعة "${businessName}" لسوق هدام.${note ? `\n\nالتفاصيل: ${note}` : ''}\n\nيرجى الرد على هذا البريد الإلكتروني بالتفاصيل المطلوبة.\n\n— سوق هدام`,
      suspend: `مرحبًا ${ownerName}،\n\nتم تعليق "${businessName}" من سوق هدام ولم يعد مُدرَجًا علنًا.${note ? `\n\nالسبب: ${note}` : ''}\n\n— سوق هدام`,
      reactivate: `مرحبًا ${ownerName}،\n\nتمت إعادة تفعيل "${businessName}" وهو الآن مباشر على سوق هدام مرة أخرى.\n\n— سوق هدام`,
    })[action],
    deliveryMarkedSubject: (storeName) => `تم تعليم طلبك من ${storeName} كمُسلَّم`,
    deliveryMarkedBody: (itemName, orderUrl, storeName) => `مرحبًا،\n\nتم تعليم طلبك كمُسلَّم.\n\nالعنصر: ${itemName}\n\nيرجى تأكيد استلامك للطرد: ${orderUrl}\n\nإذا كان هناك خطأ ما — مفقود، تالف، أو لم يصل أبدًا — يمكنك الإبلاغ عن مشكلة من نفس الصفحة بدلًا من ذلك.\n\n— ${storeName}`,
    meetingLinkAvailableSubject: (productName) => `رابط اجتماعك لـ ${productName} أصبح متاحًا الآن`,
    meetingLinkAvailableBody: (productName, meetingLink, storeName) => `مرحبًا،\n\nرابط الاجتماع لـ "${productName}" أصبح متاحًا الآن:\n\n${meetingLink}\n\nنراك هناك!\n\n— ${storeName}`,
    renewalReminderSubject: (storeName, timeLabel) => `ينتهي اشتراكك في هدام لـ "${storeName}" ${timeLabel}`,
    renewalReminderBody: (adminName, storeName, plan, timeLabel, expiryDate) => `مرحبًا ${adminName}،\n\nمن المقرر أن ينتهي متجرك "${storeName}" (الباقة: ${plan}) ${timeLabel}، بتاريخ ${expiryDate}.\n\nيمكنك التجديد في أي وقت من الإدارة ← إعدادات المتجر للحفاظ على تشغيل متجرك (وإدراجه في السوق، إن وُجد) دون انقطاع.\n\n— سوق هدام`,
    renewedNoticeSubject: (storeName) => `تم تجديد اشتراكك في هدام لـ "${storeName}"`,
    renewedNoticeBody: (adminName, storeName, plan, expiryDate) => `مرحبًا ${adminName}،\n\nتم تجديد متجرك "${storeName}" كـ: ${plan}. تاريخ انتهاء صلاحيتك الجديد هو ${expiryDate}.\n\nشكرًا لبقائك مع سوق هدام.\n\n— سوق هدام`,
    expiredNoticeSubject: (storeName) => `انتهت صلاحية اشتراكك في هدام لـ "${storeName}"`,
    expiredNoticeBody: (adminName, storeName, expiryDate) => `مرحبًا ${adminName}،\n\nانتهت صلاحية اشتراك متجرك "${storeName}" في ${expiryDate} دون تجديد.\n\nمتجرك وبياناتك آمنون — يمكنك التجديد في أي وقت من الإدارة ← إعدادات المتجر لمتابعة العمل من حيث توقفت.\n\n— سوق هدام`,
    storeContactReceivedSubject: (subject) => `رسالة جديدة من عميل — ${subject}`,
    storeContactReceivedBody: (customerName, customerEmail, subject, message) => `أرسل عميل رسالة عبر نموذج الاتصال في متجرك.\n\nمن: ${customerName} (${customerEmail})\nالموضوع: ${subject}\n\nالرسالة:\n${message}\n\nيمكنك عرض هذه الرسالة والرد عليها من لوحة رسائل الدعم في متجرك.`,
    renewalTimeLabel1Month: 'خلال شهر واحد', renewalTimeLabel2Weeks: 'خلال أسبوعين', renewalTimeLabel1Week: 'خلال أسبوع واحد',
  },
  fr: {
    verificationCodeSubject: 'Votre code de vérification Hadam',
    verificationCodeBody: (code) => `Votre code de vérification est : ${code}\n\nCe code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.`,
    orderConfirmationSubject: (storeName, orderId) => `Votre commande chez ${storeName} — ${orderId}`,
    orderConfirmationBody: ({ customerName, customerEmail, orderId, date, total, itemsList, meetingLinks, pendingMeetingItems, hasDownload, orderUrl, storeName }) => {
      const meetingLinksText = meetingLinks.length ? `\n\nLien(s) de réunion en ligne :\n${meetingLinks.map(m => `- ${m.name}: ${m.link}`).join('\n')}` : '';
      const pendingMeetingText = pendingMeetingItems.length ? `\n\nLien de réunion en attente pour : ${pendingMeetingItems.join(', ')} — nous vous l'enverrons par e-mail dès qu'il sera disponible.` : '';
      const accessLine = hasDownload ? `Votre/vos article(s) numérique(s) sont prêts à télécharger ici :\n${orderUrl}\n\n(Connectez-vous à votre compte sur cette page pour accéder à votre téléchargement.)` : `Vous pouvez consulter votre commande à tout moment ici :\n${orderUrl}`;
      return `Bonjour ${customerName},\n\nMerci pour votre commande ! Votre paiement a été confirmé.\n\nNuméro de commande : ${orderId}\nClient : ${customerName} (${customerEmail})\nDate : ${date}\nTotal : $${total}\nStatut du paiement : Confirmé\n\nArticles :\n${itemsList}${meetingLinksText}${pendingMeetingText}\n\n${accessLine}\n\n— ${storeName}`;
    },
    refundApprovedSubject: (itemName) => `Votre demande de remboursement a été approuvée — ${itemName}`,
    refundApprovedBody: (itemName, orderUrl, storeName) => `Bonne nouvelle — votre demande de remboursement pour "${itemName}" a été approuvée.\n\nPour finaliser le remboursement, veuillez confirmer votre mode de paiement de remboursement ici : ${orderUrl}\n\n— ${storeName}`,
    refundRejectedSubject: (itemName) => `Votre demande de remboursement n'a pas été approuvée — ${itemName}`,
    refundRejectedBody: (itemName, decisionReason) => `Votre demande de remboursement pour "${itemName}" n'a pas été approuvée.\n\nMotif : ${decisionReason || "(aucun motif fourni)"}\n\nSi vous avez des questions, veuillez nous contacter.`,
    refundCompletedCustomerSubject: (itemName) => `Votre remboursement pour ${itemName} a été effectué`,
    refundCompletedCustomerBody: (itemName, last4, storeName) => `Bonjour,\n\nVotre remboursement pour "${itemName}" a été traité avec succès.\n\nMode de remboursement : carte se terminant par ${last4}\n\n— ${storeName}`,
    refundCompletedStaffSubject: (itemName) => `Remboursement effectué — ${itemName}`,
    refundCompletedStaffBody: (orderId, itemName, last4) => `Un remboursement a été traité avec succès.\n\nCommande : ${orderId}\nArticle : ${itemName}\nMode de remboursement : carte se terminant par ${last4}\n\nIl s'agissait d'une annulation de paiement simulée.`,
    renewalConfirmedSubject: (servicesRenewed) => `Renouvellement confirmé — ${servicesRenewed}`,
    renewalConfirmedBody: (clientName, clientEmail, servicesRenewed, subscriptionStart, subscriptionEnd) => `Un paiement de renouvellement a été confirmé.\n\nClient : ${clientName || '(non fourni)'} (${clientEmail})\nService(s) renouvelé(s) : ${servicesRenewed}\nPaiement : Confirmé\nPériode d'abonnement : du ${subscriptionStart} au ${subscriptionEnd}\n\nCeci est une confirmation automatique — aucune action nécessaire sauf si quelque chose semble incorrect.`,
    newContactMessageSubject: (name) => `Nouveau message du formulaire de contact de ${name}`,
    newContactMessageBody: (name, email, message) => `Un nouveau message a été soumis via le formulaire de contact.\n\nDe : ${name} (${email})\n\nMessage :\n${message}\n\nConsultez et gérez tous les messages dans le tableau de bord Superadmin.`,
    paymentReceivedSubject: (orderId) => `Paiement reçu — Commande ${orderId}`,
    paymentReceivedBody: (orderId, customerName, amount, date, itemsList) => `Numéro de commande : ${orderId}\nNom du client : ${customerName}\nMontant du paiement : $${amount}\nMode de paiement : Carte\nDate et heure : ${date}\nStatut du paiement : Réussi\n\nArticles achetés :\n${itemsList}`,
    deliveryReminderSubject: (storeName) => `Rappel : veuillez confirmer votre livraison de ${storeName}`,
    deliveryReminderBody: (itemName, orderUrl, storeName) => `Bonjour,\n\nJuste un rappel — votre commande (${itemName}) a été marquée comme livrée il y a quelques jours, et nous n'avons pas encore de nouvelles de votre part.\n\nVeuillez confirmer que vous l'avez reçue, ou nous informer si quelque chose ne va pas : ${orderUrl}\n\n— ${storeName}`,
    refundRequestedSubject: (itemName) => `Remboursement demandé — ${itemName}`,
    refundRequestedBody: (orderId, itemName, customerEmail, reason, requestedAt) => `Un client a demandé un remboursement.\n\nCommande : ${orderId}\nArticle : ${itemName}\nClient : ${customerEmail}\nMotif indiqué : ${reason || "(aucun motif fourni)"}\nDemandé le : ${requestedAt}\n\nVeuillez examiner cette demande dans la File de traitement.`,
    deliveryProblemSubject: (storeName) => `Problème de livraison signalé — ${storeName}`,
    deliveryProblemBody: (orderId, itemName, note) => `Un client a signalé un problème avec un article livré.\n\nCommande : ${orderId}\nArticle : ${itemName}\nNote : ${note || "(aucune note fournie)"}\n\nVeuillez examiner cette commande.`,
    marketplaceReceivedSubject: (businessName) => `Nous avons bien reçu votre candidature Hadam Marketplace — ${businessName}`,
    marketplaceReceivedBody: (ownerName, businessName) => `Bonjour ${ownerName},\n\nMerci d'avoir postulé pour rejoindre Hadam Marketplace avec "${businessName}". Votre candidature est maintenant en attente d'examen par notre équipe — vous recevrez un autre e-mail une fois qu'elle aura été examinée, et votre annonce n'apparaîtra pas publiquement avant cela.\n\n— Hadam Marketplace`,
    marketplaceReviewSubject: (action, businessName) => ({
      approve: `Votre candidature Hadam Marketplace a été approuvée — ${businessName}`,
      reject: `Mise à jour concernant votre candidature Hadam Marketplace — ${businessName}`,
      request_more_info: `Informations supplémentaires nécessaires pour votre candidature Hadam Marketplace — ${businessName}`,
      suspend: `Votre annonce Hadam Marketplace a été suspendue — ${businessName}`,
      reactivate: `Votre annonce Hadam Marketplace a été réactivée — ${businessName}`,
    })[action],
    marketplaceReviewBody: (action, businessName, ownerName, note) => ({
      approve: `Bonjour ${ownerName},\n\nExcellente nouvelle — "${businessName}" a été approuvée et est maintenant en ligne sur Hadam Marketplace.\n\n— Hadam Marketplace`,
      reject: `Bonjour ${ownerName},\n\nAprès examen, nous ne sommes pas en mesure d'approuver "${businessName}" pour Hadam Marketplace pour le moment.${note ? `\n\nMotif : ${note}` : ''}\n\n— Hadam Marketplace`,
      request_more_info: `Bonjour ${ownerName},\n\nNous avons besoin d'un peu plus d'informations pour examiner "${businessName}" pour Hadam Marketplace.${note ? `\n\nDétails : ${note}` : ''}\n\nVeuillez répondre à cet e-mail avec les détails demandés.\n\n— Hadam Marketplace`,
      suspend: `Bonjour ${ownerName},\n\n"${businessName}" a été suspendue de Hadam Marketplace et n'est plus listée publiquement.${note ? `\n\nMotif : ${note}` : ''}\n\n— Hadam Marketplace`,
      reactivate: `Bonjour ${ownerName},\n\n"${businessName}" a été réactivée et est de nouveau en ligne sur Hadam Marketplace.\n\n— Hadam Marketplace`,
    })[action],
    deliveryMarkedSubject: (storeName) => `Votre commande chez ${storeName} a été marquée comme livrée`,
    deliveryMarkedBody: (itemName, orderUrl, storeName) => `Bonjour,\n\nVotre commande a été marquée comme livrée.\n\nArticle : ${itemName}\n\nVeuillez confirmer que vous avez reçu votre colis : ${orderUrl}\n\nSi quelque chose ne va pas — manquant, endommagé, ou jamais arrivé — vous pouvez signaler un problème depuis la même page.\n\n— ${storeName}`,
    meetingLinkAvailableSubject: (productName) => `Votre lien de réunion pour ${productName} est maintenant disponible`,
    meetingLinkAvailableBody: (productName, meetingLink, storeName) => `Bonjour,\n\nLe lien de réunion pour "${productName}" est maintenant disponible :\n\n${meetingLink}\n\nÀ bientôt !\n\n— ${storeName}`,
    renewalReminderSubject: (storeName, timeLabel) => `Votre abonnement Hadam pour "${storeName}" expire ${timeLabel}`,
    renewalReminderBody: (adminName, storeName, plan, timeLabel, expiryDate) => `Bonjour ${adminName},\n\nVotre boutique "${storeName}" (offre : ${plan}) doit expirer ${timeLabel}, le ${expiryDate}.\n\nRenouvelez à tout moment depuis Admin → Paramètres de la boutique pour que votre boutique (et votre annonce Marketplace, le cas échéant) continue de fonctionner sans interruption.\n\n— Hadam Marketplace`,
    renewedNoticeSubject: (storeName) => `Votre abonnement Hadam pour "${storeName}" a été renouvelé`,
    renewedNoticeBody: (adminName, storeName, plan, expiryDate) => `Bonjour ${adminName},\n\nVotre boutique "${storeName}" a été renouvelée en tant que : ${plan}. Votre nouvelle date d'expiration est le ${expiryDate}.\n\nMerci de rester fidèle à Hadam Marketplace.\n\n— Hadam Marketplace`,
    expiredNoticeSubject: (storeName) => `Votre abonnement Hadam pour "${storeName}" a expiré`,
    expiredNoticeBody: (adminName, storeName, expiryDate) => `Bonjour ${adminName},\n\nL'abonnement de votre boutique "${storeName}" a expiré le ${expiryDate} sans être renouvelé.\n\nVotre boutique et vos données sont en sécurité — vous pouvez renouveler à tout moment depuis Admin → Paramètres de la boutique pour reprendre là où vous vous étiez arrêté.\n\n— Hadam Marketplace`,
    storeContactReceivedSubject: (subject) => `Nouveau message d'un client — ${subject}`,
    storeContactReceivedBody: (customerName, customerEmail, subject, message) => `Un client a soumis un message via le formulaire de contact de votre boutique.\n\nDe : ${customerName} (${customerEmail})\nSujet : ${subject}\n\nMessage :\n${message}\n\nVous pouvez consulter et répondre à ce message dans le panneau Messages de support de votre boutique.`,
    renewalTimeLabel1Month: 'dans 1 mois', renewalTimeLabel2Weeks: 'dans 2 semaines', renewalTimeLabel1Week: 'dans 1 semaine',
  },
};
function emailT(templates, key, lang) {
  return (templates[lang] && templates[lang][key]) || templates.en[key];
}

module.exports = { sendEmail, wrapEmailHtml, EMAIL_I18N, emailT };
