/* Hadam — global digital store & multi-tenant marketplace platform (storefront front end) */
const API = '';
const ICONS = { shipping: '📦', download: '📄', booking: '🗓️', manual: '🛠️' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- i18n (interface chrome only — store owners' own product/category
   text is never auto-translated; there's no translation engine wired in for that) ---------------- */
const I18N = {
  en: {
    home: 'Home', stores: 'Stores', myOrders: 'My Orders', fulfillmentQueue: 'Fulfillment Queue', admin: 'Admin',
    login: 'Log in', logout: 'Log out', cart: 'Cart', browse: 'Browse', browseCatalog: 'Browse the catalog',
    yourCart: 'Your cart', emptyCart: 'Your cart is empty.', total: 'Total', checkout: 'Checkout',
    howReceive: 'How do you want to receive this?', shipToAddress: 'Ship to an address', pickUpInStore: 'Pick up in store',
    shippingAddress: 'Shipping address', cardNumber: 'Card number', expiry: 'Expiry', cvv: 'CVV',
    pay: 'Pay', logInToCheckOut: 'Log in to check out', myOrdersTitle: 'My orders', noOrdersYet: 'No orders yet.',
    download: 'Download', storesOnHadam: 'Stores on Hadam', saleOnHadam: 'Sale on Hadam',
    saleOnHadamBlurb: "Looking for more? Browse every store on Hadam's shared Marketplace.",
    logIn: 'Log in', createAccount: 'Create account', email: 'Email', password: 'Password', name: 'Name',
    forgotPassword: 'Forgot password?', newAccount: 'New? Create a client account', haveAccount: 'Have an account? Log in',
    resetYourPassword: 'Reset your password', sendResetLink: 'Send reset link', backToLogin: 'Back to log in',
    chooseNewPassword: 'Choose a new password', resetCode: 'Reset code', newPassword: 'New password', setNewPassword: 'Set new password',
    stats: 'Stats', products: 'Products', categories: 'Categories', employees: 'Employees', orders: 'Orders',
    addCategory: '+ Add category', addProduct: '+ Add product', addEmployee: '+ Add employee', save: 'Save changes', add: 'Add',
    editProductTitle: 'Edit product', addProductTitle: 'Add product', editCategoryTitle: 'Edit category', addCategoryTitle: 'Add category',
    edit: 'Edit', delete: 'Delete', allOrdersPayments: 'All Orders & Payments', langToggle: 'العربية', dashboard: 'Admin dashboard',
    storeSettingsTab: 'Store Settings', reportsTab: 'Reports',
    groupStoreOpt: 'Store (physical)', groupMarketplaceOpt: 'Marketplace', fulfillShippingOpt: 'Physical (electronics, clothing, food, furniture...)',
    fulfillDownloadOpt: 'Digital (eBooks, software, courses, music, videos...)', fulfillBookingOpt: 'Services (education, healthcare, consulting, maintenance...)', fulfillManualOpt: 'Other (define your own category type)',
    customTypeNameLabel: 'What kind of category is this?', customTypeNamePlaceholder: 'e.g. Rentals, Subscriptions, Custom Orders',
    customTypeNameHint: "Since this doesn't fit Digital/Physical/Services, name it yourself — this is shown to your shoppers.",
    externalUrlLabel: 'External URL / demo link', externalUrlPlaceholder: 'https://...',
    externalUrlHint: 'Optional — a link to a live demo, sample, or preview for this product/service.',
    productImagesLabel: 'Product images', uploadImageBtn: 'Upload image', noImagesYet: 'No images yet.',
    imageUploadHint: 'JPEG, PNG, GIF, or WebP — up to 4MB per image.', saveProductFirstForImages: 'Save this product first, then edit it again to add images.',
    chooseFileFirst: 'Choose a file first.', unsupportedImageType: 'Unsupported image type — use JPEG, PNG, GIF, or WebP.',
    deleteImageConfirm: 'Delete this image?', removeProductConfirm: 'Remove this product?', deleteCategoryConfirm: 'Delete this category?',
    categoryTypeLabel: 'Category Type', categoryTypeLockedHint: "Type can't be changed once a category exists — delete and recreate it instead.",
    advancedOptionsLabel: 'Advanced options', marketplaceTagHint: "Used to surface your products on Hadam's cross-store marketplace browse page — optional, has a sensible default.",
    allowPickupLabel: 'Allow in-store pickup for this category', allowPickupHint: 'If checked, clients buying items in this category can choose "Pick up in store" instead of shipping, at checkout.',
    noCategoriesYetHint: 'Create a category first, from the Categories tab.',
    subExpiredBanner: 'Your subscription has expired. Renew below to restore full access.',
    subExpiringBanner: 'Your subscription expires in {days} day(s). Renew below to avoid any interruption.',
    subscriptionH3: 'Subscription', subExpiresOnLabel: 'Expires on', subDaysRemaining: '{days} day(s) remaining',
    subDaysOverdue: '{days} day(s) overdue', renewAsHint: 'Renew for another 30 days — pick which plan you want to renew as:',
    renewStoreOnlyBtn: 'Renew: Store only', renewMarketplaceOnlyBtn: 'Renew: Marketplace only', renewBothBtn: 'Renew: Store + Marketplace',
    renewConfirm: 'Renew your subscription as "{plan}" for another 30 days?',
    storeNameLabelForm: 'Store name', taglineLabelForm: 'Tagline', taglinePlaceholderForm: 'A short line shown in the Stores directory',
    aboutStoreLabelForm: 'About this store (shown on your Home page)',
    aboutStorePlaceholderForm: 'One line per point, e.g.:\n🛒 Physical products — electronics, clothing, home items\n💻 Digital products — software, courses, ebooks',
    aboutStoreHintForm: 'One line per bullet point — each line break becomes a separate line on your Home page.',
    planStoreOnlyOptForm: 'Store only — sell anything, not listed on the shared Marketplace',
    planMarketplaceOptForm: 'Marketplace — listed in the shared directory and cross-store browse',
    planBothOptForm: 'Store + Marketplace — both',
    planChangeHintForm: 'Changing this doesn\'t affect your existing products or categories — it only controls whether your store shows up in Hadam\'s shared Marketplace & Stores directory. Switching to "Store only" removes you from that directory immediately; switching to "Marketplace" or "Both" adds you to it immediately.',
    addTranslationHint: 'Optional — add a name/description in another language (any language you choose: Arabic, French, Spanish, etc.)',
    alreadyHasLabel: 'already has', nameInLanguageLabel: 'Name in that language', descriptionInLanguageLabel: 'Description in that language',
    addStoreTranslationHint: "Optional — add your store's name, tagline, and about text in another language (any language you choose: Arabic, French, Spanish, etc.)",
    storeTranslationExplainer: "This is what lets Arabic (or any language) actually show for a store you set up yourself — it isn't filled in automatically.",
    storeNameInLanguageLabel: 'Store name in that language', taglineInLanguageLabel: 'Tagline in that language', aboutTextInLanguageLabel: 'About text in that language',
    planRemoveFromMarketplaceWarning: "This will remove your store from Hadam's shared Marketplace & Stores directory immediately — shoppers browsing the Marketplace will no longer find you there. Your own store link keeps working exactly as before. Continue?",
    planAddToMarketplaceWarning: "This will list your store on Hadam's shared Marketplace & Stores directory immediately — every product you have will become visible there. Continue?",
    planChangeGenericWarning: "Change your store's plan? This takes effect immediately.", savedMsg: 'Saved.',
    planLabelForm: 'Plan', employeeRoleOpt: 'Employee', adminRoleOpt: 'Admin',
    refundRequestedStatus: 'Refund requested', requestRefundBtn: 'Request refund', storeDetailsH3: 'Store details',
    languageCodeLabel: 'Language code', maxDownloadsLabel: 'Max downloads', descriptionLabel: 'Description',
    marketplaceListingTagLabel: 'Marketplace listing tag', downloadWindowLabel: 'Download window (hours)', addAccountBtn: 'Add account',
    paymentSuccessfulH3: 'Payment successful', awaitingPickupStatus: 'awaiting pickup readiness', pendingShipmentStatus: 'pending shipment',
    requestedStatus: 'requested', pendingStatus: 'pending', viewMyOrdersBtn: 'View my orders',
    fulfillmentOrdersH2: 'Fulfillment & orders', nothingToFulfill: 'Nothing to fulfill right now.',
    refundedByOn: 'Refunded by {by} on {date}', inStorePickupHint: 'In-store pickup — no shipping needed.',
    pickupNotePlaceholder: 'Pickup note', shipToLabel: 'Ship to:', trackingNotePlaceholder: 'Tracking note', notePlaceholder: 'Note',
    refundThisItemBtn: 'Refund this item', refundBtn: 'Refund', refundReasonPrompt: 'Reason for refund (optional):',
    currentPasswordLabel: 'Current password', newPasswordLabel: 'New password', atLeast6Chars: 'At least 6 characters',
    changePasswordBtn: 'Change password', deleteMyAccountBtn: 'Delete my account', deleteYourAccountH3: 'Delete your account',
    deleteAccountWarning: "This permanently removes your login. Your past orders stay on record (they already keep a copy of your name/email), but you won't be able to sign back in with this account.",
    confirmPasswordLabel: 'Confirm your password', permanentlyDeleteBtn: 'Permanently delete my account', cancelBtn: 'Cancel',
    passwordChangedMsg: 'Password changed.',
    backUpDataH3: 'Back up your data', backUpDataP: "Download everything for this store — categories, products, orders, and your team's account list — as a single file, anytime. Nothing sensitive (like passwords) is ever included.",
    exportMyDataBtn: "Export my store's data", cancelDeleteH3: 'Cancel or delete your store',
    cancelTempCloseStrong: 'Cancel (temporarily close)', storeCurrentlyClosedMsg: 'Your store is currently closed.',
    cancelBlocksMsg: 'Blocks new orders and new client sign-ups immediately, but you can still log in and reopen it anytime — nothing is lost.',
    reopenMyStoreBtn: 'Reopen my store', cancelCloseMyStoreBtn: 'Cancel / close my store',
    deletePermanentlyStrong: 'Delete permanently', deletePermanentlyDesc: 'this is different from Cancel: once deleted, you cannot log back in or reopen it yourself. This cannot be undone from your side.',
    deleteMyStoreBtn: 'Delete my store permanently',
    closeStoreConfirm: 'This blocks new orders and new client sign-ups immediately. You can still log in and reopen your store anytime — this does not delete anything. Continue?',
    reopenStoreConfirm: 'This reopens your store to new orders and new client sign-ups immediately. Continue?',
    deleteStoreWarning: 'This permanently deletes your store. Unlike Cancel, you will not be able to log back in or reopen it yourself afterward. This cannot be undone from your side.',
    confirmPasswordProceedLabel: 'Confirm your password to proceed', yesDeleteStoreBtn: 'Yes, permanently delete my store',
    cancelKeepStoreBtn: 'Cancel, keep my store', storeDeletedAlert: 'Your store has been deleted.',
    netRevenue: 'net revenue', refundedLabel: 'refunded', paidTotalOrders: 'paid / total orders', clientsLabel: 'clients',
    topSellingProducts: 'Top-selling products', noSalesYet: 'No sales yet.', productCol: 'Product', unitsCol: 'Units', revenueCol: 'Revenue',
    stockLevelsH3: 'Stock levels', lowBadge: 'low', noStockTracked: 'No physical (stock-tracked) products.', stockCol: 'Stock', leftBadge: 'left',
    nameCol: 'Name', categoryCol: 'Category', priceCol: 'Price', groupCol: 'Group', fulfillmentCol: 'Fulfillment', rulesCol: 'Rules',
    marketplaceTagCol: 'Marketplace tag', downloadsWord: 'download(s)', otherFallback: 'Other', accountsWord: 'accounts',
    emailCol: 'Email', roleCol: 'Role', youLabel: 'you', idCol: 'ID', clientCol: 'Client', itemsCol: 'Items', totalCol: 'Total',
    statusCol: 'Status', dateCol: 'Date', fromLabel: 'From', toLabel: 'To', presetToday: 'Today', presetWeek: 'Last 7 days',
    presetMonth: 'Last 30 days', presetYear: 'Last year', presetAllTime: 'All time', runReportBtn: 'Run report',
    newClientsLabel: 'new clients', commissionLabel: 'commission', youKeepLabel: 'you keep', topProductsPeriod: 'Top products in this period',
    noSalesPeriod: 'No sales in this period.', dayByDayH3: 'Day-by-day', noOrdersPeriod: 'No orders in this period.', ordersCol: 'Orders',
    group_all: 'Everything', group_store: 'Physical', group_marketplace: 'Digital & Services', group_other: 'Other',
    allCategories: 'All categories', browseTitle_all: 'Browse everything', browseTitle_store: 'Physical products',
    browseTitle_marketplace: 'Digital downloads & services', browseTitle_other: 'Other categories',
    aboutIntro: 'runs on Hadam — a multi-tenant marketplace platform, not a single store. Hadam provides three types of listings:',
    aboutDigitalLabel: 'Digital', aboutDigitalDesc: '(delivered or downloaded within hours of payment)',
    aboutPhysicalLabel: 'Physical', aboutPhysicalDesc: '(shipped or picked up)', and: 'and',
    aboutServicesLabel: 'Services', aboutServicesDesc: '(education, healthcare consultations, bookings, and more)',
    aboutOtherText: "plus an Other category for anything else, which each store's own owner defines for themselves based on what they actually sell; Hadam doesn't pre-define it for them.",
    aboutListedYes: "This particular store is also listed on Hadam's shared Marketplace.",
    aboutListedNo: "This particular store runs independently and isn't listed on Hadam's shared Marketplace.",
    loading: 'Loading…', noStoresListedYet: 'No Marketplace-listed stores yet.', noTagline: 'No tagline yet.',
    productSingular: 'product', productPlural: 'products',
    hadamMarketplaceTitle: 'Hadam Marketplace',
    hadamCardTagline: 'The global digital store and multi-tenant marketplace platform — every seller gets their own subdomain store on',
    marketplaceStores: 'Marketplace', allProducts: 'All Products', sellerStoresH3: 'Seller Stores', pricingPlans: 'Pricing Plans',
    accountLabel: 'Account', myDashboard: 'My Dashboard', loginRegister: 'Log in / Register',
    supportLabel: 'Support', contactUsLabel: 'Contact Us', allRightsReserved: 'All rights reserved.',
    trustBadges: 'SSL Secure · ✓ Verified · 💳 Safe Payments',
    tierLabel_starter: 'Starter', tierLabel_professional: 'Professional', tierLabel_enterprise: 'Enterprise',
    tierCta_starter: 'Start Free', tierCta_professional: 'Select Professional', tierCta_enterprise: 'Select Enterprise',
    currentPlanBadge: 'Current plan', perMonth: 'month', freeForever: 'Free forever',
    hadamCommission: 'Hadam commission', perSale: 'per sale',
    fSubdomain: 'Your subdomain store', fUpTo10: 'Up to 10 products', fUpTo100: 'Up to 100 products', fUnlimited: 'Unlimited products',
    fBasicDashboard: 'Basic seller dashboard', fFullDashboard: 'Full seller dashboard',
    fEmailSupport: 'Email support', fPriorityEmailSupport: 'Priority email support', f247Support: '24/7 priority support',
    fStandardAnalytics: 'Standard analytics', fAdvancedAnalytics: 'Advanced analytics',
    fCustomBranding: 'Custom branding', fCustomStoreBranding: 'Custom store branding', fPrioritySupport: 'Priority support',
    fAPIAccess: 'API access', fFullAPIAccess: 'Full API access', fDedicatedManager: 'Dedicated account manager',
    pricingDisclaimer: "Prices and commission rates shown here are the real numbers this platform uses to enforce product limits — there's no live payment processor wired in, so selecting a tier doesn't actually charge a card. A production deployment would connect this to a real billing provider (e.g. Stripe Billing).",
    switchToPlanConfirm: 'Switch to the', sellIntro: 'Choose a plan and get your own store on yourname.hadam.store. Hadam earns from subscriptions plus commission on each sale.',
    managePlanH3: "Manage this store's plan", managePlanP: 'To upgrade/downgrade your Store vs. Marketplace listing, close your store, or edit your details, go to Admin → Store Settings.',
    goToStoreSettings: 'Go to Store Settings', hireOwnStoreH3: 'Hire your own store',
    hireOwnStoreP: "Pick which you want — this takes you to Hadam's main site with that choice pre-selected.",
    hireStoreOnly: 'Hire Store only', hireMarketplaceOnly: 'Hire Marketplace only', hireBoth: 'Hire Store + Marketplace',
    newStoreSeparateHint: 'A new store is separate from this one, with its own subdomain, login, and sign-up/sign-in.',
    justWantToShopH3: 'Just want to shop here?', manageMyAccount: 'Manage my account', signInRegisterClient: 'Sign in / Register as a client',
    aboutThisStoreH3: 'About this store', contactUsH3: 'Contact us', subjectLabel: 'Subject', messageLabel: 'Message',
    loginToMessageStore: 'Log in to send this store a message, or use My Orders once you have one to ask about it directly.',
    contactSentMsg: 'Sent — the store will get back to you.',
    storeFooterText: 'Powered by Hadam Marketplace — the global digital store and multi-tenant marketplace platform. © 2026 Hadam Marketplace. All rights reserved. Payments on this platform are simulated for demonstration; no real transactions occur.',
  },
  ar: {
    home: 'الرئيسية', stores: 'المتاجر', myOrders: 'طلباتي', fulfillmentQueue: 'قائمة التنفيذ', admin: 'الإدارة',
    login: 'تسجيل الدخول', logout: 'تسجيل الخروج', cart: 'السلة', browse: 'تصفح', browseCatalog: 'تصفح المنتجات',
    yourCart: 'سلتك', emptyCart: 'سلتك فارغة.', total: 'الإجمالي', checkout: 'إتمام الشراء',
    howReceive: 'كيف تريد استلام هذا؟', shipToAddress: 'الشحن إلى عنوان', pickUpInStore: 'الاستلام من المتجر',
    shippingAddress: 'عنوان الشحن', cardNumber: 'رقم البطاقة', expiry: 'تاريخ الانتهاء', cvv: 'رمز الأمان',
    pay: 'ادفع', logInToCheckOut: 'سجّل الدخول لإتمام الشراء', myOrdersTitle: 'طلباتي', noOrdersYet: 'لا توجد طلبات بعد.',
    download: 'تحميل', storesOnHadam: 'المتاجر على هدام', saleOnHadam: 'البيع على هدام',
    saleOnHadamBlurb: 'تريد المزيد؟ تصفح جميع المتاجر على سوق هدام المشترك.',
    logIn: 'تسجيل الدخول', createAccount: 'إنشاء حساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', name: 'الاسم',
    forgotPassword: 'نسيت كلمة المرور؟', newAccount: 'جديد؟ أنشئ حساب عميل', haveAccount: 'لديك حساب؟ سجّل الدخول',
    resetYourPassword: 'إعادة تعيين كلمة المرور', sendResetLink: 'إرسال رابط إعادة التعيين', backToLogin: 'العودة لتسجيل الدخول',
    chooseNewPassword: 'اختر كلمة مرور جديدة', resetCode: 'رمز إعادة التعيين', newPassword: 'كلمة المرور الجديدة', setNewPassword: 'تعيين كلمة المرور',
    stats: 'الإحصائيات', products: 'المنتجات', categories: 'الفئات', employees: 'الموظفون', orders: 'الطلبات',
    addCategory: '+ إضافة فئة', addProduct: '+ إضافة منتج', addEmployee: '+ إضافة موظف', save: 'حفظ التغييرات', add: 'إضافة',
    editProductTitle: 'تعديل المنتج', addProductTitle: 'إضافة منتج', editCategoryTitle: 'تعديل الفئة', addCategoryTitle: 'إضافة فئة',
    edit: 'تعديل', delete: 'حذف', allOrdersPayments: 'كل الطلبات والمدفوعات', langToggle: 'English', dashboard: 'لوحة تحكم الإدارة',
    storeSettingsTab: 'إعدادات المتجر', reportsTab: 'التقارير',
    groupStoreOpt: 'متجر (مادي)', groupMarketplaceOpt: 'سوق', fulfillShippingOpt: 'مادي (إلكترونيات، ملابس، طعام، أثاث...)',
    fulfillDownloadOpt: 'رقمي (كتب إلكترونية، برمجيات، دورات، موسيقى، فيديوهات...)', fulfillBookingOpt: 'خدمات (تعليم، رعاية صحية، استشارات، صيانة...)', fulfillManualOpt: 'أخرى (حدد نوع فئتك الخاص)',
    customTypeNameLabel: 'ما نوع هذه الفئة؟', customTypeNamePlaceholder: 'مثال: تأجير، اشتراكات، طلبات مخصصة',
    customTypeNameHint: 'بما أن هذا لا يندرج ضمن رقمي/مادي/خدمات، سمِّه بنفسك — يظهر هذا لعملائك.',
    externalUrlLabel: 'رابط خارجي / رابط تجريبي', externalUrlPlaceholder: 'https://...',
    externalUrlHint: 'اختياري — رابط لعرض توضيحي مباشر أو نموذج أو معاينة لهذا المنتج/الخدمة.',
    productImagesLabel: 'صور المنتج', uploadImageBtn: 'رفع صورة', noImagesYet: 'لا توجد صور بعد.',
    imageUploadHint: 'JPEG أو PNG أو GIF أو WebP — حتى 4 ميغابايت لكل صورة.', saveProductFirstForImages: 'احفظ هذا المنتج أولاً، ثم عدّله مرة أخرى لإضافة صور.',
    chooseFileFirst: 'اختر ملفًا أولاً.', unsupportedImageType: 'نوع صورة غير مدعوم — استخدم JPEG أو PNG أو GIF أو WebP.',
    deleteImageConfirm: 'حذف هذه الصورة؟', removeProductConfirm: 'إزالة هذا المنتج؟', deleteCategoryConfirm: 'حذف هذه الفئة؟',
    categoryTypeLabel: 'نوع الفئة', categoryTypeLockedHint: 'لا يمكن تغيير النوع بعد إنشاء الفئة — احذفها وأنشئها من جديد بدلاً من ذلك.',
    advancedOptionsLabel: 'خيارات متقدمة', marketplaceTagHint: 'يُستخدم لإظهار منتجاتك في صفحة تصفح سوق هدام المشترك عبر المتاجر — اختياري وله قيمة افتراضية مناسبة.',
    allowPickupLabel: 'السماح بالاستلام من المتجر لهذه الفئة', allowPickupHint: 'عند التحديد، يمكن للعملاء الذين يشترون عناصر في هذه الفئة اختيار "الاستلام من المتجر" بدلاً من الشحن، عند الدفع.',
    noCategoriesYetHint: 'أنشئ فئة أولاً، من تبويب الفئات.',
    subExpiredBanner: 'انتهى اشتراكك. جدّده أدناه لاستعادة الوصول الكامل.',
    subExpiringBanner: 'ينتهي اشتراكك خلال {days} يوم/أيام. جدّده أدناه لتجنب أي انقطاع.',
    subscriptionH3: 'الاشتراك', subExpiresOnLabel: 'ينتهي في', subDaysRemaining: 'متبقٍ {days} يوم/أيام',
    subDaysOverdue: 'متأخر {days} يوم/أيام', renewAsHint: 'جدّد لمدة 30 يومًا إضافية — اختر الخطة التي تريد التجديد بها:',
    renewStoreOnlyBtn: 'تجديد: متجر فقط', renewMarketplaceOnlyBtn: 'تجديد: سوق فقط', renewBothBtn: 'تجديد: متجر + سوق',
    renewConfirm: 'تجديد اشتراكك كـ "{plan}" لمدة 30 يومًا إضافية؟',
    storeNameLabelForm: 'اسم المتجر', taglineLabelForm: 'الوصف المختصر', taglinePlaceholderForm: 'سطر قصير يظهر في دليل المتاجر',
    aboutStoreLabelForm: 'عن هذا المتجر (يظهر في صفحتك الرئيسية)',
    aboutStorePlaceholderForm: 'سطر واحد لكل نقطة، مثال:\n🛒 منتجات مادية — إلكترونيات، ملابس، أدوات منزلية\n💻 منتجات رقمية — برمجيات، دورات، كتب إلكترونية',
    aboutStoreHintForm: 'سطر واحد لكل نقطة — يصبح كل سطر جديد سطرًا منفصلاً في صفحتك الرئيسية.',
    planStoreOnlyOptForm: 'متجر فقط — بيع أي شيء، غير مُدرَج في السوق المشترك',
    planMarketplaceOptForm: 'سوق — مُدرَج في الدليل المشترك وتصفح المتاجر المتبادل',
    planBothOptForm: 'متجر + سوق — كلاهما',
    planChangeHintForm: 'لا يؤثر هذا على منتجاتك أو فئاتك الحالية — يتحكم فقط فيما إذا كان متجرك يظهر في دليل سوق ومتاجر هدام المشترك. التبديل إلى "متجر فقط" يزيلك من الدليل فورًا؛ التبديل إلى "سوق" أو "كلاهما" يضيفك إليه فورًا.',
    addTranslationHint: 'اختياري — أضف اسمًا/وصفًا بلغة أخرى (أي لغة تختارها: عربية، فرنسية، إسبانية، وغيرها)',
    alreadyHasLabel: 'يحتوي بالفعل على', nameInLanguageLabel: 'الاسم بتلك اللغة', descriptionInLanguageLabel: 'الوصف بتلك اللغة',
    addStoreTranslationHint: 'اختياري — أضف اسم متجرك ووصفه المختصر ونص "عن المتجر" بلغة أخرى (أي لغة تختارها: عربية، فرنسية، إسبانية، وغيرها)',
    storeTranslationExplainer: 'هذا ما يتيح ظهور العربية (أو أي لغة) فعليًا لمتجر أنشأته بنفسك — لا يُملأ تلقائيًا.',
    storeNameInLanguageLabel: 'اسم المتجر بتلك اللغة', taglineInLanguageLabel: 'الوصف المختصر بتلك اللغة', aboutTextInLanguageLabel: 'نص "عن المتجر" بتلك اللغة',
    planRemoveFromMarketplaceWarning: 'سيؤدي هذا إلى إزالة متجرك من دليل سوق ومتاجر هدام المشترك فورًا — لن يجدك المتسوقون المتصفحون للسوق هناك بعد الآن. رابط متجرك الخاص سيستمر بالعمل كالمعتاد. هل تريد المتابعة؟',
    planAddToMarketplaceWarning: 'سيؤدي هذا إلى إدراج متجرك في دليل سوق ومتاجر هدام المشترك فورًا — ستصبح كل منتجاتك مرئية هناك. هل تريد المتابعة؟',
    planChangeGenericWarning: 'تغيير خطة متجرك؟ يسري هذا فورًا.', savedMsg: 'تم الحفظ.',
    planLabelForm: 'الخطة', employeeRoleOpt: 'موظف', adminRoleOpt: 'مسؤول',
    refundRequestedStatus: 'تم طلب الاسترداد', requestRefundBtn: 'طلب استرداد', storeDetailsH3: 'تفاصيل المتجر',
    languageCodeLabel: 'رمز اللغة', maxDownloadsLabel: 'الحد الأقصى للتنزيلات', descriptionLabel: 'الوصف',
    marketplaceListingTagLabel: 'تصنيف إدراج السوق', downloadWindowLabel: 'نافذة التنزيل (ساعات)', addAccountBtn: 'إضافة حساب',
    paymentSuccessfulH3: 'تم الدفع بنجاح', awaitingPickupStatus: 'بانتظار جاهزية الاستلام', pendingShipmentStatus: 'بانتظار الشحن',
    requestedStatus: 'مطلوب', pendingStatus: 'قيد الانتظار', viewMyOrdersBtn: 'عرض طلباتي',
    fulfillmentOrdersH2: 'التنفيذ والطلبات', nothingToFulfill: 'لا يوجد شيء لتنفيذه الآن.',
    refundedByOn: 'تم الاسترداد بواسطة {by} في {date}', inStorePickupHint: 'استلام من المتجر — لا حاجة للشحن.',
    pickupNotePlaceholder: 'ملاحظة الاستلام', shipToLabel: 'الشحن إلى:', trackingNotePlaceholder: 'ملاحظة التتبع', notePlaceholder: 'ملاحظة',
    refundThisItemBtn: 'استرداد هذا العنصر', refundBtn: 'استرداد', refundReasonPrompt: 'سبب الاسترداد (اختياري):',
    currentPasswordLabel: 'كلمة المرور الحالية', newPasswordLabel: 'كلمة المرور الجديدة', atLeast6Chars: 'على الأقل 6 أحرف',
    changePasswordBtn: 'تغيير كلمة المرور', deleteMyAccountBtn: 'حذف حسابي', deleteYourAccountH3: 'حذف حسابك',
    deleteAccountWarning: 'هذا يزيل تسجيل دخولك نهائيًا. تبقى طلباتك السابقة مسجلة (تحتفظ بنسخة من اسمك/بريدك الإلكتروني)، لكن لن تتمكن من تسجيل الدخول بهذا الحساب مرة أخرى.',
    confirmPasswordLabel: 'أكّد كلمة المرور', permanentlyDeleteBtn: 'حذف حسابي نهائيًا', cancelBtn: 'إلغاء',
    passwordChangedMsg: 'تم تغيير كلمة المرور.',
    backUpDataH3: 'نسخ بياناتك احتياطيًا', backUpDataP: 'نزّل كل شيء لهذا المتجر — الفئات، المنتجات، الطلبات، وقائمة حسابات فريقك — كملف واحد، في أي وقت. لا يُدرَج أي شيء حساس (مثل كلمات المرور) أبدًا.',
    exportMyDataBtn: 'تصدير بيانات متجري', cancelDeleteH3: 'إلغاء أو حذف متجرك',
    cancelTempCloseStrong: 'إلغاء (إغلاق مؤقت)', storeCurrentlyClosedMsg: 'متجرك مغلق حاليًا.',
    cancelBlocksMsg: 'يمنع الطلبات الجديدة وتسجيلات العملاء الجدد فورًا، لكن يمكنك تسجيل الدخول وإعادة الفتح في أي وقت — لا شيء يُفقد.',
    reopenMyStoreBtn: 'إعادة فتح متجري', cancelCloseMyStoreBtn: 'إلغاء / إغلاق متجري',
    deletePermanentlyStrong: 'حذف نهائي', deletePermanentlyDesc: 'يختلف هذا عن الإلغاء: بعد الحذف، لن تتمكن من تسجيل الدخول أو إعادة الفتح بنفسك. لا يمكن التراجع عن هذا من جانبك.',
    deleteMyStoreBtn: 'حذف متجري نهائيًا',
    closeStoreConfirm: 'هذا يمنع الطلبات الجديدة وتسجيلات العملاء الجدد فورًا. يمكنك تسجيل الدخول وإعادة فتح متجرك في أي وقت — هذا لا يحذف أي شيء. هل تريد المتابعة؟',
    reopenStoreConfirm: 'هذا يعيد فتح متجرك للطلبات الجديدة وتسجيلات العملاء الجدد فورًا. هل تريد المتابعة؟',
    deleteStoreWarning: 'هذا يحذف متجرك نهائيًا. على عكس الإلغاء، لن تتمكن من تسجيل الدخول أو إعادة الفتح بنفسك لاحقًا. لا يمكن التراجع عن هذا من جانبك.',
    confirmPasswordProceedLabel: 'أكّد كلمة المرور للمتابعة', yesDeleteStoreBtn: 'نعم، احذف متجري نهائيًا',
    cancelKeepStoreBtn: 'إلغاء، الاحتفاظ بمتجري', storeDeletedAlert: 'تم حذف متجرك.',
    netRevenue: 'صافي الإيرادات', refundedLabel: 'مسترد', paidTotalOrders: 'مدفوعة / إجمالي الطلبات', clientsLabel: 'العملاء',
    topSellingProducts: 'الأكثر مبيعًا', noSalesYet: 'لا توجد مبيعات بعد.', productCol: 'المنتج', unitsCol: 'الوحدات', revenueCol: 'الإيرادات',
    stockLevelsH3: 'مستويات المخزون', lowBadge: 'منخفض', noStockTracked: 'لا توجد منتجات مادية (بمخزون متتبع).', stockCol: 'المخزون', leftBadge: 'متبقٍ',
    nameCol: 'الاسم', categoryCol: 'الفئة', priceCol: 'السعر', groupCol: 'المجموعة', fulfillmentCol: 'طريقة التسليم', rulesCol: 'القواعد',
    marketplaceTagCol: 'تصنيف السوق', downloadsWord: 'تنزيل(ات)', otherFallback: 'أخرى', accountsWord: 'حسابات',
    emailCol: 'البريد الإلكتروني', roleCol: 'الدور', youLabel: 'أنت', idCol: 'المعرف', clientCol: 'العميل', itemsCol: 'العناصر', totalCol: 'الإجمالي',
    statusCol: 'الحالة', dateCol: 'التاريخ', fromLabel: 'من', toLabel: 'إلى', presetToday: 'اليوم', presetWeek: 'آخر 7 أيام',
    presetMonth: 'آخر 30 يومًا', presetYear: 'آخر سنة', presetAllTime: 'كل الأوقات', runReportBtn: 'تشغيل التقرير',
    newClientsLabel: 'عملاء جدد', commissionLabel: 'العمولة', youKeepLabel: 'ما تحتفظ به', topProductsPeriod: 'أفضل المنتجات في هذه الفترة',
    noSalesPeriod: 'لا توجد مبيعات في هذه الفترة.', dayByDayH3: 'يومًا بيوم', noOrdersPeriod: 'لا توجد طلبات في هذه الفترة.', ordersCol: 'الطلبات',
    group_all: 'الكل', group_store: 'منتجات مادية', group_marketplace: 'رقمي وخدمات', group_other: 'أخرى',
    allCategories: 'كل الفئات', browseTitle_all: 'تصفح الكل', browseTitle_store: 'منتجات مادية',
    browseTitle_marketplace: 'تنزيلات رقمية وخدمات', browseTitle_other: 'فئات أخرى',
    aboutIntro: 'يعمل على هدام — منصة سوق متعددة المستأجرين، وليس متجرًا واحدًا. توفر هدام ثلاثة أنواع من العروض:',
    aboutDigitalLabel: 'رقمي', aboutDigitalDesc: '(يُسلَّم أو يُنزَّل خلال ساعات من الدفع)',
    aboutPhysicalLabel: 'مادي', aboutPhysicalDesc: '(يُشحن أو يُستلم من المتجر)', and: 'و',
    aboutServicesLabel: 'خدمات', aboutServicesDesc: '(تعليم، استشارات صحية، حجوزات، وغير ذلك)',
    aboutOtherText: 'بالإضافة إلى فئة أخرى لأي شيء آخر، يحددها كل صاحب متجر بنفسه بناءً على ما يبيعه فعليًا؛ لا تحددها هدام مسبقًا نيابة عنه.',
    aboutListedYes: 'هذا المتجر مُدرَج أيضًا على سوق هدام المشترك.',
    aboutListedNo: 'يعمل هذا المتجر بشكل مستقل وليس مُدرَجًا على سوق هدام المشترك.',
    loading: 'جارٍ التحميل…', noStoresListedYet: 'لا توجد متاجر مُدرَجة على السوق بعد.', noTagline: 'لا يوجد وصف بعد.',
    productSingular: 'منتج', productPlural: 'منتجات',
    hadamMarketplaceTitle: 'سوق هدام',
    hadamCardTagline: 'المتجر الرقمي العالمي ومنصة السوق متعددة المستأجرين — كل بائع يحصل على متجره الخاص بنطاق فرعي على',
    marketplaceStores: 'السوق', allProducts: 'كل المنتجات', sellerStoresH3: 'متاجر البائعين', pricingPlans: 'خطط الأسعار',
    accountLabel: 'الحساب', myDashboard: 'لوحة التحكم الخاصة بي', loginRegister: 'تسجيل الدخول / التسجيل',
    supportLabel: 'الدعم', contactUsLabel: 'اتصل بنا', allRightsReserved: 'جميع الحقوق محفوظة.',
    trustBadges: 'اتصال آمن SSL · ✓ موثّق · 💳 مدفوعات آمنة',
    tierLabel_starter: 'المبتدئ', tierLabel_professional: 'الاحترافي', tierLabel_enterprise: 'المؤسسات',
    tierCta_starter: 'ابدأ مجانًا', tierCta_professional: 'اختر الاحترافي', tierCta_enterprise: 'اختر المؤسسات',
    currentPlanBadge: 'الخطة الحالية', perMonth: 'شهر', freeForever: 'مجاني للأبد',
    hadamCommission: 'عمولة هدام', perSale: 'لكل عملية بيع',
    fSubdomain: 'متجرك بنطاق فرعي خاص', fUpTo10: 'حتى 10 منتجات', fUpTo100: 'حتى 100 منتج', fUnlimited: 'منتجات غير محدودة',
    fBasicDashboard: 'لوحة تحكم بائع أساسية', fFullDashboard: 'لوحة تحكم بائع كاملة',
    fEmailSupport: 'دعم عبر البريد الإلكتروني', fPriorityEmailSupport: 'دعم بريد إلكتروني ذو أولوية', f247Support: 'دعم على مدار الساعة ذو أولوية',
    fStandardAnalytics: 'تحليلات قياسية', fAdvancedAnalytics: 'تحليلات متقدمة',
    fCustomBranding: 'هوية بصرية مخصصة', fCustomStoreBranding: 'هوية متجر مخصصة', fPrioritySupport: 'دعم ذو أولوية',
    fAPIAccess: 'الوصول إلى API', fFullAPIAccess: 'وصول كامل إلى API', fDedicatedManager: 'مدير حساب مخصص',
    pricingDisclaimer: 'الأسعار ونسب العمولة المعروضة هنا هي الأرقام الحقيقية التي تستخدمها هذه المنصة لتطبيق حدود المنتجات — لا يوجد مزود دفع فعلي مربوط، لذا اختيار خطة لا يترتب عليه خصم فعلي من أي بطاقة. النشر الفعلي سيربط هذا بمزود فوترة حقيقي (مثل Stripe Billing).',
    switchToPlanConfirm: 'التبديل إلى خطة', sellIntro: 'اختر خطة واحصل على متجرك الخاص على yourname.hadam.store. تحصل هدام على عائد من الاشتراكات بالإضافة إلى عمولة على كل عملية بيع.',
    managePlanH3: 'إدارة خطة هذا المتجر', managePlanP: 'لترقية أو تخفيض خطة المتجر مقابل السوق، أو إغلاق متجرك، أو تعديل بياناتك، اذهب إلى الإدارة ← إعدادات المتجر.',
    goToStoreSettings: 'الذهاب إلى إعدادات المتجر', hireOwnStoreH3: 'احصل على متجرك الخاص',
    hireOwnStoreP: 'اختر ما تريده — سينقلك هذا إلى الموقع الرئيسي لهدام مع اختيارك مُحدَّد مسبقًا.',
    hireStoreOnly: 'الحصول على متجر فقط', hireMarketplaceOnly: 'الحصول على سوق فقط', hireBoth: 'الحصول على متجر وسوق',
    newStoreSeparateHint: 'المتجر الجديد منفصل عن هذا المتجر، وله نطاقه الفرعي وتسجيل دخوله وتسجيله الخاص.',
    justWantToShopH3: 'تريد التسوق هنا فقط؟', manageMyAccount: 'إدارة حسابي', signInRegisterClient: 'تسجيل الدخول / التسجيل كعميل',
    aboutThisStoreH3: 'عن هذا المتجر', contactUsH3: 'اتصل بنا', subjectLabel: 'الموضوع', messageLabel: 'الرسالة',
    loginToMessageStore: 'سجّل الدخول لإرسال رسالة إلى هذا المتجر، أو استخدم طلباتي بمجرد وجود طلب للاستفسار عنه مباشرة.',
    contactSentMsg: 'تم الإرسال — سيتواصل معك المتجر قريبًا.',
    storeFooterText: 'مدعوم من سوق هدام — المتجر الرقمي العالمي ومنصة السوق متعددة المستأجرين. © 2026 سوق هدام. جميع الحقوق محفوظة. المدفوعات على هذه المنصة محاكاة للعرض فقط؛ لا تتم أي معاملات حقيقية.',
  },
  fr: {
    home: 'Accueil', stores: 'Boutiques', myOrders: 'Mes commandes', fulfillmentQueue: 'File de traitement', admin: 'Admin',
    login: 'Connexion', logout: 'Déconnexion', cart: 'Panier', browse: 'Parcourir', browseCatalog: 'Parcourir le catalogue',
    yourCart: 'Votre panier', emptyCart: 'Votre panier est vide.', total: 'Total', checkout: 'Paiement',
    howReceive: 'Comment souhaitez-vous le recevoir ?', shipToAddress: 'Livrer à une adresse', pickUpInStore: 'Retrait en boutique',
    shippingAddress: 'Adresse de livraison', cardNumber: 'Numéro de carte', expiry: "Date d'expiration", cvv: 'CVV',
    pay: 'Payer', logInToCheckOut: 'Connectez-vous pour payer', myOrdersTitle: 'Mes commandes', noOrdersYet: 'Aucune commande pour le moment.',
    download: 'Télécharger', storesOnHadam: 'Boutiques sur Hadam', saleOnHadam: 'Vendre sur Hadam',
    saleOnHadamBlurb: 'Vous cherchez autre chose ? Parcourez toutes les boutiques du Marketplace partagé de Hadam.',
    logIn: 'Connexion', createAccount: 'Créer un compte', email: 'E-mail', password: 'Mot de passe', name: 'Nom',
    forgotPassword: 'Mot de passe oublié ?', newAccount: 'Nouveau ? Créer un compte client', haveAccount: 'Déjà un compte ? Connexion',
    resetYourPassword: 'Réinitialiser votre mot de passe', sendResetLink: 'Envoyer le lien de réinitialisation', backToLogin: 'Retour à la connexion',
    chooseNewPassword: 'Choisissez un nouveau mot de passe', resetCode: 'Code de réinitialisation', newPassword: 'Nouveau mot de passe', setNewPassword: 'Définir le mot de passe',
    stats: 'Statistiques', products: 'Produits', categories: 'Catégories', employees: 'Employés', orders: 'Commandes',
    addCategory: '+ Ajouter une catégorie', addProduct: '+ Ajouter un produit', addEmployee: '+ Ajouter un employé', save: 'Enregistrer', add: 'Ajouter',
    editProductTitle: 'Modifier le produit', addProductTitle: 'Ajouter un produit', editCategoryTitle: 'Modifier la catégorie', addCategoryTitle: 'Ajouter une catégorie',
    edit: 'Modifier', delete: 'Supprimer', allOrdersPayments: 'Toutes les commandes et paiements', langToggle: 'Français', dashboard: 'Tableau de bord admin',
    storeSettingsTab: 'Paramètres de la boutique', reportsTab: 'Rapports',
    groupStoreOpt: 'Boutique (physique)', groupMarketplaceOpt: 'Marketplace', fulfillShippingOpt: 'Physique (électronique, vêtements, alimentation, meubles...)',
    fulfillDownloadOpt: 'Numérique (ebooks, logiciels, cours, musique, vidéos...)', fulfillBookingOpt: 'Services (éducation, santé, conseil, maintenance...)', fulfillManualOpt: 'Autre (définissez votre propre type de catégorie)',
    customTypeNameLabel: 'Quel type de catégorie est-ce ?', customTypeNamePlaceholder: 'ex. Locations, Abonnements, Commandes personnalisées',
    customTypeNameHint: "Comme ceci ne correspond pas à Numérique/Physique/Services, nommez-le vous-même — ceci est affiché à vos acheteurs.",
    externalUrlLabel: 'URL externe / lien de démo', externalUrlPlaceholder: 'https://...',
    externalUrlHint: 'Facultatif — un lien vers une démo, un échantillon, ou un aperçu pour ce produit/service.',
    productImagesLabel: 'Images du produit', uploadImageBtn: 'Téléverser une image', noImagesYet: 'Aucune image pour le moment.',
    imageUploadHint: 'JPEG, PNG, GIF, ou WebP — jusqu\'à 4 Mo par image.', saveProductFirstForImages: "Enregistrez d'abord ce produit, puis modifiez-le à nouveau pour ajouter des images.",
    chooseFileFirst: "Choisissez d'abord un fichier.", unsupportedImageType: 'Type d\'image non pris en charge — utilisez JPEG, PNG, GIF, ou WebP.',
    deleteImageConfirm: 'Supprimer cette image ?', removeProductConfirm: 'Supprimer ce produit ?', deleteCategoryConfirm: 'Supprimer cette catégorie ?',
    categoryTypeLabel: 'Type de catégorie', categoryTypeLockedHint: 'Le type ne peut pas être modifié une fois la catégorie créée — supprimez-la et recréez-la à la place.',
    advancedOptionsLabel: 'Options avancées', marketplaceTagHint: 'Utilisé pour faire apparaître vos produits sur la page de navigation multi-boutiques du Marketplace de Hadam — facultatif, avec une valeur par défaut adaptée.',
    allowPickupLabel: 'Autoriser le retrait en boutique pour cette catégorie', allowPickupHint: 'Si coché, les clients achetant des articles de cette catégorie peuvent choisir "Retrait en boutique" au lieu de la livraison, lors du paiement.',
    noCategoriesYetHint: "Créez d'abord une catégorie, depuis l'onglet Catégories.",
    subExpiredBanner: 'Votre abonnement a expiré. Renouvelez ci-dessous pour restaurer un accès complet.',
    subExpiringBanner: 'Votre abonnement expire dans {days} jour(s). Renouvelez ci-dessous pour éviter toute interruption.',
    subscriptionH3: 'Abonnement', subExpiresOnLabel: 'Expire le', subDaysRemaining: '{days} jour(s) restant(s)',
    subDaysOverdue: '{days} jour(s) de retard', renewAsHint: 'Renouvelez pour 30 jours de plus — choisissez l\'offre à renouveler :',
    renewStoreOnlyBtn: 'Renouveler : Boutique seule', renewMarketplaceOnlyBtn: 'Renouveler : Marketplace seul', renewBothBtn: 'Renouveler : Boutique + Marketplace',
    renewConfirm: 'Renouveler votre abonnement en tant que "{plan}" pour 30 jours de plus ?',
    storeNameLabelForm: 'Nom de la boutique', taglineLabelForm: 'Slogan', taglinePlaceholderForm: "Une courte phrase affichée dans l'annuaire des boutiques",
    aboutStoreLabelForm: 'À propos de cette boutique (affiché sur votre page d\'accueil)',
    aboutStorePlaceholderForm: 'Une ligne par point, par ex. :\n🛒 Produits physiques — électronique, vêtements, articles pour la maison\n💻 Produits numériques — logiciels, cours, ebooks',
    aboutStoreHintForm: "Une ligne par point — chaque saut de ligne devient une ligne distincte sur votre page d'accueil.",
    planStoreOnlyOptForm: 'Boutique seule — vendez ce que vous voulez, non listée sur le Marketplace partagé',
    planMarketplaceOptForm: 'Marketplace — listée dans l\'annuaire partagé et la navigation multi-boutiques',
    planBothOptForm: 'Boutique + Marketplace — les deux',
    planChangeHintForm: "Cela n'affecte pas vos produits ou catégories existants — cela contrôle seulement si votre boutique apparaît dans l'annuaire Marketplace & Boutiques partagé de Hadam. Passer à \"Boutique seule\" vous retire immédiatement de cet annuaire ; passer à \"Marketplace\" ou \"Les deux\" vous y ajoute immédiatement.",
    addTranslationHint: "Facultatif — ajoutez un nom/description dans une autre langue (celle de votre choix : arabe, français, espagnol, etc.)",
    alreadyHasLabel: 'contient déjà', nameInLanguageLabel: 'Nom dans cette langue', descriptionInLanguageLabel: 'Description dans cette langue',
    addStoreTranslationHint: "Facultatif — ajoutez le nom, le slogan et le texte « à propos » de votre boutique dans une autre langue (celle de votre choix : arabe, français, espagnol, etc.)",
    storeTranslationExplainer: "C'est ce qui permet à l'arabe (ou toute autre langue) de s'afficher réellement pour une boutique que vous configurez vous-même — ce n'est pas rempli automatiquement.",
    storeNameInLanguageLabel: 'Nom de la boutique dans cette langue', taglineInLanguageLabel: 'Slogan dans cette langue', aboutTextInLanguageLabel: 'Texte « à propos » dans cette langue',
    planRemoveFromMarketplaceWarning: "Cela retirera immédiatement votre boutique de l'annuaire Marketplace & Boutiques partagé de Hadam — les acheteurs parcourant le Marketplace ne vous y trouveront plus. Le lien de votre propre boutique continue de fonctionner comme avant. Continuer ?",
    planAddToMarketplaceWarning: "Cela listera immédiatement votre boutique sur l'annuaire Marketplace & Boutiques partagé de Hadam — tous vos produits y deviendront visibles. Continuer ?",
    planChangeGenericWarning: "Changer l'offre de votre boutique ? Cela prend effet immédiatement.", savedMsg: 'Enregistré.',
    planLabelForm: 'Offre', employeeRoleOpt: 'Employé', adminRoleOpt: 'Admin',
    refundRequestedStatus: 'Remboursement demandé', requestRefundBtn: 'Demander un remboursement', storeDetailsH3: 'Détails de la boutique',
    languageCodeLabel: 'Code de langue', maxDownloadsLabel: 'Téléchargements max', descriptionLabel: 'Description',
    marketplaceListingTagLabel: 'Tag de listing Marketplace', downloadWindowLabel: 'Fenêtre de téléchargement (heures)', addAccountBtn: 'Ajouter le compte',
    paymentSuccessfulH3: 'Paiement réussi', awaitingPickupStatus: 'en attente de disponibilité pour retrait', pendingShipmentStatus: 'expédition en attente',
    requestedStatus: 'demandé', pendingStatus: 'en attente', viewMyOrdersBtn: 'Voir mes commandes',
    fulfillmentOrdersH2: 'Traitement et commandes', nothingToFulfill: 'Rien à traiter pour le moment.',
    refundedByOn: 'Remboursé par {by} le {date}', inStorePickupHint: 'Retrait en boutique — aucune expédition nécessaire.',
    pickupNotePlaceholder: 'Note de retrait', shipToLabel: 'Expédier à :', trackingNotePlaceholder: 'Note de suivi', notePlaceholder: 'Note',
    refundThisItemBtn: 'Rembourser cet article', refundBtn: 'Rembourser', refundReasonPrompt: 'Raison du remboursement (facultatif) :',
    currentPasswordLabel: 'Mot de passe actuel', newPasswordLabel: 'Nouveau mot de passe', atLeast6Chars: 'Au moins 6 caractères',
    changePasswordBtn: 'Changer le mot de passe', deleteMyAccountBtn: 'Supprimer mon compte', deleteYourAccountH3: 'Supprimer votre compte',
    deleteAccountWarning: "Cela supprime définitivement votre connexion. Vos commandes passées restent enregistrées (elles conservent déjà une copie de votre nom/e-mail), mais vous ne pourrez plus vous reconnecter avec ce compte.",
    confirmPasswordLabel: 'Confirmez votre mot de passe', permanentlyDeleteBtn: 'Supprimer définitivement mon compte', cancelBtn: 'Annuler',
    passwordChangedMsg: 'Mot de passe modifié.',
    backUpDataH3: 'Sauvegardez vos données', backUpDataP: "Téléchargez tout pour cette boutique — catégories, produits, commandes, et la liste des comptes de votre équipe — en un seul fichier, à tout moment. Rien de sensible (comme les mots de passe) n'est jamais inclus.",
    exportMyDataBtn: 'Exporter les données de ma boutique', cancelDeleteH3: 'Annuler ou supprimer votre boutique',
    cancelTempCloseStrong: 'Annuler (fermeture temporaire)', storeCurrentlyClosedMsg: 'Votre boutique est actuellement fermée.',
    cancelBlocksMsg: 'Bloque immédiatement les nouvelles commandes et inscriptions clients, mais vous pouvez toujours vous connecter et rouvrir à tout moment — rien n\'est perdu.',
    reopenMyStoreBtn: 'Rouvrir ma boutique', cancelCloseMyStoreBtn: 'Annuler / fermer ma boutique',
    deletePermanentlyStrong: 'Supprimer définitivement', deletePermanentlyDesc: "ceci est différent d'Annuler : une fois supprimée, vous ne pourrez plus vous reconnecter ni la rouvrir vous-même. Cela ne peut pas être annulé de votre côté.",
    deleteMyStoreBtn: 'Supprimer définitivement ma boutique',
    closeStoreConfirm: "Cela bloque immédiatement les nouvelles commandes et inscriptions clients. Vous pouvez toujours vous connecter et rouvrir votre boutique à tout moment — cela ne supprime rien. Continuer ?",
    reopenStoreConfirm: 'Cela rouvre immédiatement votre boutique aux nouvelles commandes et inscriptions clients. Continuer ?',
    deleteStoreWarning: "Cela supprime définitivement votre boutique. Contrairement à Annuler, vous ne pourrez plus vous reconnecter ni la rouvrir vous-même par la suite. Cela ne peut pas être annulé de votre côté.",
    confirmPasswordProceedLabel: 'Confirmez votre mot de passe pour continuer', yesDeleteStoreBtn: 'Oui, supprimer définitivement ma boutique',
    cancelKeepStoreBtn: 'Annuler, garder ma boutique', storeDeletedAlert: 'Votre boutique a été supprimée.',
    netRevenue: 'revenu net', refundedLabel: 'remboursé', paidTotalOrders: 'payées / total commandes', clientsLabel: 'clients',
    topSellingProducts: 'Produits les plus vendus', noSalesYet: 'Aucune vente pour le moment.', productCol: 'Produit', unitsCol: 'Unités', revenueCol: 'Revenu',
    stockLevelsH3: 'Niveaux de stock', lowBadge: 'faible', noStockTracked: 'Aucun produit physique (stock suivi).', stockCol: 'Stock', leftBadge: 'restant',
    nameCol: 'Nom', categoryCol: 'Catégorie', priceCol: 'Prix', groupCol: 'Groupe', fulfillmentCol: 'Traitement', rulesCol: 'Règles',
    marketplaceTagCol: 'Tag Marketplace', downloadsWord: 'téléchargement(s)', otherFallback: 'Autre', accountsWord: 'comptes',
    emailCol: 'E-mail', roleCol: 'Rôle', youLabel: 'vous', idCol: 'ID', clientCol: 'Client', itemsCol: 'Articles', totalCol: 'Total',
    statusCol: 'Statut', dateCol: 'Date', fromLabel: 'Du', toLabel: 'Au', presetToday: "Aujourd'hui", presetWeek: '7 derniers jours',
    presetMonth: '30 derniers jours', presetYear: 'Dernière année', presetAllTime: 'Toute la période', runReportBtn: 'Lancer le rapport',
    newClientsLabel: 'nouveaux clients', commissionLabel: 'commission', youKeepLabel: 'vous gardez', topProductsPeriod: 'Meilleurs produits sur cette période',
    noSalesPeriod: 'Aucune vente sur cette période.', dayByDayH3: 'Jour par jour', noOrdersPeriod: 'Aucune commande sur cette période.', ordersCol: 'Commandes',
    group_all: 'Tout', group_store: 'Produits physiques', group_marketplace: 'Numérique et services', group_other: 'Autre',
    allCategories: 'Toutes les catégories', browseTitle_all: 'Tout parcourir', browseTitle_store: 'Produits physiques',
    browseTitle_marketplace: 'Téléchargements numériques et services', browseTitle_other: 'Autres catégories',
    aboutIntro: "fonctionne sur Hadam — une plateforme de marketplace multi-boutiques, pas une seule boutique. Hadam propose trois types d'annonces :",
    aboutDigitalLabel: 'Numérique', aboutDigitalDesc: '(livré ou téléchargé quelques heures après le paiement)',
    aboutPhysicalLabel: 'Physique', aboutPhysicalDesc: '(livré ou retiré en boutique)', and: 'et',
    aboutServicesLabel: 'Services', aboutServicesDesc: '(éducation, consultations médicales, réservations, et plus)',
    aboutOtherText: "plus une catégorie Autre pour tout le reste, que chaque propriétaire de boutique définit lui-même selon ce qu'il vend réellement ; Hadam ne la prédéfinit pas.",
    aboutListedYes: 'Cette boutique est aussi listée sur le Marketplace partagé de Hadam.',
    aboutListedNo: "Cette boutique fonctionne indépendamment et n'est pas listée sur le Marketplace partagé de Hadam.",
    loading: 'Chargement…', noStoresListedYet: 'Aucune boutique listée sur le Marketplace pour le moment.', noTagline: 'Pas encore de description.',
    productSingular: 'produit', productPlural: 'produits',
    hadamMarketplaceTitle: 'Hadam Marketplace',
    hadamCardTagline: 'La boutique numérique mondiale et la plateforme de marketplace multi-boutiques — chaque vendeur obtient sa propre boutique en sous-domaine sur',
    marketplaceStores: 'Marketplace', allProducts: 'Tous les produits', sellerStoresH3: 'Boutiques vendeuses', pricingPlans: 'Tarifs',
    accountLabel: 'Compte', myDashboard: 'Mon tableau de bord', loginRegister: 'Connexion / Inscription',
    supportLabel: 'Assistance', contactUsLabel: 'Nous contacter', allRightsReserved: 'Tous droits réservés.',
    trustBadges: 'SSL sécurisé · ✓ Vérifié · 💳 Paiements sécurisés',
    tierLabel_starter: 'Débutant', tierLabel_professional: 'Professionnel', tierLabel_enterprise: 'Entreprise',
    tierCta_starter: 'Commencer gratuitement', tierCta_professional: 'Choisir Professionnel', tierCta_enterprise: 'Choisir Entreprise',
    currentPlanBadge: 'Offre actuelle', perMonth: 'mois', freeForever: 'Gratuit pour toujours',
    hadamCommission: 'Commission Hadam', perSale: 'par vente',
    fSubdomain: 'Votre boutique en sous-domaine', fUpTo10: "Jusqu'à 10 produits", fUpTo100: "Jusqu'à 100 produits", fUnlimited: 'Produits illimités',
    fBasicDashboard: 'Tableau de bord vendeur de base', fFullDashboard: 'Tableau de bord vendeur complet',
    fEmailSupport: 'Support par e-mail', fPriorityEmailSupport: 'Support e-mail prioritaire', f247Support: 'Support prioritaire 24/7',
    fStandardAnalytics: 'Analyses standard', fAdvancedAnalytics: 'Analyses avancées',
    fCustomBranding: 'Image de marque personnalisée', fCustomStoreBranding: 'Image de boutique personnalisée', fPrioritySupport: 'Support prioritaire',
    fAPIAccess: 'Accès API', fFullAPIAccess: 'Accès API complet', fDedicatedManager: 'Gestionnaire de compte dédié',
    pricingDisclaimer: "Les prix et taux de commission affichés ici sont les chiffres réels utilisés par cette plateforme pour appliquer les limites de produits — aucun processeur de paiement réel n'est connecté, donc choisir une offre ne débite aucune carte réellement. Un déploiement en production connecterait ceci à un vrai fournisseur de facturation (ex. Stripe Billing).",
    switchToPlanConfirm: "Passer à l'offre", sellIntro: "Choisissez une offre et obtenez votre propre boutique sur yourname.hadam.store. Hadam gagne sur les abonnements ainsi qu'une commission sur chaque vente.",
    managePlanH3: 'Gérer l\'offre de cette boutique', managePlanP: "Pour changer d'offre Boutique/Marketplace, fermer votre boutique, ou modifier vos informations, allez dans Admin → Paramètres de la boutique.",
    goToStoreSettings: 'Aller aux paramètres de la boutique', hireOwnStoreH3: 'Obtenez votre propre boutique',
    hireOwnStoreP: 'Choisissez ce que vous voulez — cela vous emmène sur le site principal de Hadam avec ce choix déjà sélectionné.',
    hireStoreOnly: 'Obtenir une Boutique seule', hireMarketplaceOnly: 'Obtenir un Marketplace seul', hireBoth: 'Obtenir Boutique + Marketplace',
    newStoreSeparateHint: 'Une nouvelle boutique est distincte de celle-ci, avec son propre sous-domaine, sa connexion, et son inscription.',
    justWantToShopH3: 'Vous voulez juste acheter ici ?', manageMyAccount: 'Gérer mon compte', signInRegisterClient: 'Connexion / Inscription en tant que client',
    aboutThisStoreH3: 'À propos de cette boutique', contactUsH3: 'Nous contacter', subjectLabel: 'Sujet', messageLabel: 'Message',
    loginToMessageStore: "Connectez-vous pour envoyer un message à cette boutique, ou utilisez Mes commandes une fois que vous en avez une pour poser une question directement.",
    contactSentMsg: 'Envoyé — la boutique vous répondra.',
    storeFooterText: 'Propulsé par Hadam Marketplace — la boutique numérique mondiale et la plateforme de marketplace multi-boutiques. © 2026 Hadam Marketplace. Tous droits réservés. Les paiements sur cette plateforme sont simulés à des fins de démonstration ; aucune transaction réelle n\'a lieu.',
  },
};
function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }
/* Bilingual CONTENT (product/category/store names & descriptions) is different from
   interface CHROME (t() above): a store owner optionally fills in an Arabic name/description
   alongside the English one, and this picks whichever matches the current language — falling
   back to the base field if no Arabic version was provided. There's still no machine
   translation here; this only shows what was actually typed in. */
function localized(obj, field) {
  if (!obj) return '';
  const t = obj.translations && obj.translations[state.lang];
  if (t && t[field]) return t[field];
  return obj[field] || '';
}
/* Same shared-parent-domain cookie approach as the platform site — see public-platform/app.js
   for the full explanation. localStorage does not cross demo.localhost <-> localhost. */
function sharedCookieDomain() {
  const host = window.location.hostname;
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost';
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}
function setCookie(name, value) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; domain=${sharedCookieDomain()}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const SUPPORTED_LANGS = ['en', 'ar', 'fr'];
function detectInitialLang() {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  const lang = SUPPORTED_LANGS.includes(fromUrl) ? fromUrl : (getCookie('hadam_lang') || localStorage.getItem('hadam_lang') || 'en');
  setCookie('hadam_lang', lang);
  localStorage.setItem('hadam_lang', lang);
  return lang;
}
function setLang(lang) {
  state.lang = lang;
  setCookie('hadam_lang', lang);
  localStorage.setItem('hadam_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  location.reload();
}

let state = {
  token: localStorage.getItem('hadam_token') || null,
  lang: detectInitialLang(),
  user: null,
  categories: [],
  products: [],
  cart: [],           // [{productId, qty}]
  group: 'all',        // all | store | marketplace | other
  category: 'all',
  search: '',
  adminTab: 'stats',
  employeeTab: 'queue',
  checkoutStep: 'cart',
};

/* ---------------- API helper ---------------- */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }
  if (!res.ok) throw Object.assign(new Error('Request failed'), { status: res.status });
  return res;
}

/* ---------------- routing ---------------- */
function go(view, navKey) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  renderNav(navKey || view);
  window.scrollTo({ top: 0 });
  if (view === 'welcome') renderWelcome();
  if (view === 'home') renderCatalog();
  if (view === 'cart') renderCart();
  if (view === 'orders') renderOrders();
  if (view === 'employee') renderEmployee();
  if (view === 'admin') renderAdmin();
  if (view === 'stores') renderStores();
  if (view === 'sell') renderSell();
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }

/* Every store's own subdomain still points back to the rest of the Hadam ecosystem —
   this derives sibling-store and platform-root URLs from whatever host we're on now,
   so it works the same on acme.hadam.com in production as on acme.localhost:3000 locally. */
function siblingHostSuffix() {
  const parts = window.location.host.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : parts[0];
}
function storeUrl(subdomain) { return `${window.location.protocol}//${subdomain}.${siblingHostSuffix()}?lang=${state.lang}`; }
function platformUrl() { return `${window.location.protocol}//${siblingHostSuffix()}?lang=${state.lang}`; }

function renderNav(active) {
  const mktEnabled = marketplaceEnabled();
  const links = [
    { id: 'welcome', key: 'welcome', label: t('home') },
    { id: 'home', key: 'home', label: t('products') },
  ];
  if (mktEnabled) links.push({ id: 'stores', key: 'stores', label: t('stores') });
  links.push(
    { id: 'cart', key: 'cart', label: t('cart'), action: "state.checkoutStep='cart';go('cart','cart');" },
    { id: 'cart', key: 'checkout', label: t('checkout'), action: "state.checkoutStep='payment';go('cart','checkout');" },
  );
  if (state.user) links.push({ id: 'orders', key: 'orders', label: t('myOrders') });
  links.push({ id: 'sell', key: 'sell', label: t('saleOnHadam') });
  if (state.user && (state.user.role === 'employee' || state.user.role === 'admin')) links.push({ id: 'employee', key: 'employee', label: t('fulfillmentQueue') });
  if (state.user && state.user.role === 'admin') links.push({ id: 'admin', key: 'admin', label: t('admin') });
  document.getElementById('mainNav').innerHTML = links.map(l =>
    `<a href="#" class="${active === l.key ? 'active' : ''}" onclick="${l.action || `go('${l.id}');`}return false;">${l.label}</a>`).join('');
  document.getElementById('cartBtn').style.display = state.user && state.user.role === 'client' ? '' : (state.cart.length ? '' : 'none');
  document.getElementById('cartBadge').textContent = state.cart.length;
  document.getElementById('authBtn').textContent = state.user ? state.user.name.split(' ')[0] + ' ▾' : t('login');
  document.getElementById('authBtn').onclick = state.user ? openAccountMenu : () => openAuth('login');
  document.getElementById('authBtn').style.display = (state.user || active === 'checkout') ? '' : 'none';
}

/* Whether this store shows anything Marketplace-related (the shared cross-store directory,
   the "browse other stores" banner) — this is opt-in per store's own plan, not shown to
   every visitor by default, and not shown for a seller who chose Store-only. */
function marketplaceEnabled() { return state.tenantInfo && ['marketplace', 'both'].includes(state.tenantInfo.plan); }

/* ---------------- Home landing page (distinct from the Products catalog) ---------------- */
function renderWelcome() {
  const info = state.tenantInfo;
  const name = localized(info, 'name');
  const tagline = localized(info, 'tagline');
  const aboutText = localized(info, 'aboutText');
  document.getElementById('welcomeContent').innerHTML = `
    <div style="max-width:640px;margin:40px auto 0;text-align:center;">
      <h1 style="font-family:var(--font-display);font-size:32px;margin:0 0 12px;">${esc(name)}</h1>
      ${tagline ? `<p style="color:var(--text-dim);font-size:15px;margin:0 0 26px;">${esc(tagline)}</p>` : ''}
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn" onclick="go('home')">${t('products')}</button>
        ${marketplaceEnabled() ? `<button class="btn secondary" onclick="go('stores')">${t('stores')}</button>` : ''}
        <button class="btn secondary" onclick="go('sell')">${t('saleOnHadam')}</button>
      </div>
    </div>
    <div class="row2" style="max-width:900px;margin:36px auto 0;align-items:start;">
      <div class="panel">
        <h3>${t('aboutThisStoreH3')}</h3>
        <p style="color:var(--text-dim);font-size:13px;line-height:1.6;margin-bottom:${aboutText ? '14px' : '0'};">
          ${esc(name)} ${t('aboutIntro')}
          <strong style="color:var(--text)">${t('aboutDigitalLabel')}</strong> ${t('aboutDigitalDesc')},
          <strong style="color:var(--text)">${t('aboutPhysicalLabel')}</strong> ${t('aboutPhysicalDesc')}, ${t('and')}
          <strong style="color:var(--text)">${t('aboutServicesLabel')}</strong> ${t('aboutServicesDesc')} —
          ${t('aboutOtherText')}
          ${marketplaceEnabled() ? ` ${t('aboutListedYes')}` : ` ${t('aboutListedNo')}`}
        </p>
        ${aboutText ? `
          <div style="color:var(--text-dim);font-size:14px;line-height:2;text-align:left;border-top:1px solid var(--border);padding-top:12px;">
            ${aboutText.split('\n').filter(Boolean).map(line => esc(line)).join('<br>')}
          </div>
        ` : ''}
      </div>
      <div class="panel">
        <h3>${t('contactUsH3')}</h3>
        <div id="homeContactMsg"></div>
        ${state.user ? `
          <div class="field"><label>${t('subjectLabel')}</label><input id="homeContactSubject"></div>
          <div class="field"><label>${t('messageLabel')}</label><textarea id="homeContactMessage" rows="3"></textarea></div>
          <button class="btn full" onclick="sendHomeContact()">${t('send')}</button>
        ` : `<p style="color:var(--text-dim);font-size:13.5px;">${t('loginToMessageStore')}</p>
          <button class="btn secondary" onclick="openAuth('login')">${t('login')}</button>`}
      </div>
    </div>`;
}
async function sendHomeContact() {
  const msg = document.getElementById('homeContactMsg');
  try {
    await api('/api/support/messages', { method: 'POST', body: JSON.stringify({ subject: document.getElementById('homeContactSubject').value, message: document.getElementById('homeContactMessage').value }) });
    msg.innerHTML = `<div class="msg success">${t('contactSentMsg')}</div>`;
    document.getElementById('homeContactSubject').value = ''; document.getElementById('homeContactMessage').value = '';
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* ---------------- Pricing: real tiers, honestly labeled (no live billing) ---------------- */
const TIER_FEATURE_KEYS = {
  starter: { featureKeys: ['fSubdomain', 'fUpTo10', 'fBasicDashboard', 'fEmailSupport', 'fStandardAnalytics'], missingKeys: ['fCustomBranding', 'fPrioritySupport', 'fAPIAccess', 'fAdvancedAnalytics'] },
  professional: { featureKeys: ['fSubdomain', 'fUpTo100', 'fFullDashboard', 'fPriorityEmailSupport', 'fAdvancedAnalytics', 'fCustomStoreBranding', 'fAPIAccess'], missingKeys: ['fDedicatedManager'] },
  enterprise: { featureKeys: ['fSubdomain', 'fUnlimited', 'fFullDashboard', 'f247Support', 'fAdvancedAnalytics', 'fCustomStoreBranding', 'fFullAPIAccess', 'fDedicatedManager'], missingKeys: [] },
};
async function fetchPricing() {
  if (!state._pricingTiers) { const { tiers } = await api('/api/platform/pricing'); state._pricingTiers = tiers; }
  return state._pricingTiers;
}
function pricingCardsHtml(tiers, currentTier) {
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));">
    ${Object.entries(tiers).map(([key, tier]) => {
      const meta = TIER_FEATURE_KEYS[key];
      const isCurrent = currentTier === key;
      return `<div class="panel" style="${isCurrent ? 'border-color:var(--accent);' : ''}">
        <h3 style="display:flex;justify-content:space-between;align-items:center;">${t('tierLabel_' + key)} ${isCurrent ? `<span class="status-pill success">${t('currentPlanBadge')}</span>` : ''}</h3>
        <div style="font-family:var(--font-mono);font-size:26px;color:var(--accent);margin-bottom:2px;">$${tier.monthlyFee}${tier.monthlyFee ? `<span style="font-size:13px;color:var(--text-dim)">/${t('perMonth')}</span>` : ''}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">${tier.monthlyFee === 0 ? t('freeForever') : ''}</div>
        <div class="hint" style="margin-bottom:10px;">${t('hadamCommission')}: <strong style="color:var(--text)">${(tier.commissionRate * 100).toFixed(0)}% ${t('perSale')}</strong></div>
        <div style="font-size:13px;color:var(--text-dim);line-height:2;">
          ${meta.featureKeys.map(k => `✓ ${t(k)}`).join('<br>')}
          ${meta.missingKeys.map(k => `<br><span style="opacity:.4">✕ ${t(k)}</span>`).join('')}
        </div>
        ${state.user && state.user.role === 'admin' ? `<button class="btn full" style="margin-top:16px;" onclick="selectTier('${key}')" ${isCurrent ? 'disabled' : ''}>${isCurrent ? t('currentPlanBadge') : t('tierCta_' + key)}</button>` : ''}
      </div>`;
    }).join('')}
  </div>
  <div class="hint" style="margin-top:14px;">${t('pricingDisclaimer')}</div>`;
}
async function selectTier(tier) {
  if (!confirm(`${t('switchToPlanConfirm')} ${t('tierLabel_' + tier)}?`)) return;
  try {
    await api('/api/admin/store', { method: 'PATCH', body: JSON.stringify({ subscriptionTier: tier }) });
    renderSell();
  } catch (e) { alert(e.message); }
}
async function renderStores() {
  const el = document.getElementById('storesContent');
  el.innerHTML = `<h2 class="section-title">${t('storesOnHadam')}</h2><div id="storesList">${t('loading')}</div>`;
  const { stores } = await api('/api/platform/directory');
  const listEl = document.getElementById('storesList');
  listEl.innerHTML = (stores.length === 0 ? `<div class="empty">${t('noStoresListedYet')}</div>` :
    stores.map(s => `
      <div class="order-card">
        <div class="oh"><span>${esc(localized(s,'name'))}</span><span class="role-badge">${planLabelTenant(s.plan)}</span></div>
        <p style="color:var(--text-dim);font-size:13px;margin:0 0 8px;">${esc(localized(s,'tagline') || t('noTagline'))} · ${s.productCount} ${s.productCount === 1 ? t('productSingular') : t('productPlural')}</p>
        <a href="${storeUrl(s.subdomain)}" target="_blank" style="color:var(--accent);font-family:var(--font-mono);font-size:13px;">${esc(s.subdomain)}.${siblingHostSuffix()}</a>
      </div>`).join('')) +
    `<div class="order-card" style="border-color:var(--accent);">
        <h3 style="font-family:var(--font-display);font-size:18px;margin:0 0 6px;">${t('hadamMarketplaceTitle')}</h3>
        <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">${t('hadamCardTagline')} ${siblingHostSuffix()}.</p>
        <a href="${platformUrl()}" target="_blank" style="color:var(--accent);font-family:var(--font-mono);font-size:13px;display:block;margin-bottom:14px;">${siblingHostSuffix()}</a>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;font-size:12.5px;">
          <div><strong style="display:block;margin-bottom:4px;">${t('marketplaceStores')}</strong>
            <a href="${platformUrl()}#marketplace" target="_blank" style="color:var(--text-dim);display:block;">${t('allProducts')}</a>
            <a href="${platformUrl()}#marketplace" target="_blank" style="color:var(--text-dim);display:block;">${t('sellerStoresH3')}</a>
            <a href="#" onclick="go('sell');return false;" style="color:var(--text-dim);display:block;">${t('pricingPlans')}</a>
          </div>
          <div><strong style="display:block;margin-bottom:4px;">${t('accountLabel')}</strong>
            ${state.user ? `<a href="#" onclick="go('${state.user.role==='admin'?'admin':'orders'}');return false;" style="color:var(--text-dim);display:block;">${t('myDashboard')}</a>
            <a href="#" onclick="go('orders');return false;" style="color:var(--text-dim);display:block;">${t('myOrders')}</a>` :
            `<a href="#" onclick="openAuth('login');return false;" style="color:var(--text-dim);display:block;">${t('loginRegister')}</a>`}
          </div>
          <div><strong style="display:block;margin-bottom:4px;">${t('supportLabel')}</strong>
            <a href="${platformUrl()}#contact" target="_blank" style="color:var(--text-dim);display:block;">${t('contactUsLabel')}</a>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:10px;font-size:11.5px;color:var(--text-dim);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>© ${new Date().getFullYear()} ${t('hadamMarketplaceTitle')}. ${t('allRightsReserved')}</span>
          <span>🔒 ${t('trustBadges')}</span>
        </div>
      </div>`;
}
const PLAN_LABELS_TENANT = {
  en: { store: 'Store', marketplace: 'Marketplace', both: 'Store + Marketplace' },
  ar: { store: 'متجر', marketplace: 'سوق', both: 'متجر + سوق' },
  fr: { store: 'Boutique', marketplace: 'Marketplace', both: 'Boutique + Marketplace' },
};
function planLabelTenant(p) { return (PLAN_LABELS_TENANT[state.lang] && PLAN_LABELS_TENANT[state.lang][p]) || p; }

/* ---------------- bootstrap ---------------- */
async function boot() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('langSelect').value = state.lang;
  document.getElementById('saleOnHadamBlurb').textContent = t('saleOnHadamBlurb');
  document.getElementById('saleOnHadamLink').textContent = t('saleOnHadam') + ' →';
  const [{ categories }, { products }, tenantInfo] = await Promise.all([api('/api/categories'), api('/api/products'), api('/api/tenant/info')]);
  state.categories = categories;
  state.products = products;
  state.tenantInfo = tenantInfo;
  const displayName = localized(tenantInfo, 'name');
  document.getElementById('storeLogo').innerHTML = `${esc(state.lang === 'ar' ? displayName : displayName.toUpperCase())} <span class="dot">●</span>`;
  document.title = displayName;
  document.getElementById('saleOnHadamLink').href = platformUrl() + '/#marketplace';
  document.getElementById('storeFooter').textContent = t('storeFooterText');
  document.getElementById('saleOnHadamBanner').style.display = marketplaceEnabled() ? 'flex' : 'none';
  if (state.token) {
    try { const { user } = await api('/api/auth/me'); state.user = user; }
    catch { state.token = null; localStorage.removeItem('hadam_token'); }
  }
  renderNav('welcome');
  go(state.user && state.user.role === 'admin' ? 'admin' : state.user && state.user.role === 'employee' ? 'employee' : 'welcome');
}
boot();

/* ---------------- catalog ---------------- */
function catThumbBg(fulfillment) {
  return { shipping: '#242a3d', download: '#332a1f', booking: '#2a2436', manual: '#1f2f2c' }[fulfillment] || '#232735';
}
function renderCatalog() {
  document.getElementById('groupFilters').innerHTML = ['all', 'store', 'marketplace', 'other'].map(g =>
    `<button class="chip ${state.group === g ? 'active' : ''}" onclick="setGroup('${g}')">${t('group_' + g)}</button>`
  ).join('') + `<span style="flex:1"></span><input type="text" placeholder="Search…" value="${state.search}" oninput="onSearch(this.value)"
    style="padding:7px 12px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;">`;

  const cats = state.categories.filter(c => state.group === 'all' || c.group === state.group);
  document.getElementById('catFilters').innerHTML = [{ id: 'all', name: t('allCategories') }, ...cats].map(c =>
    `<button class="chip ${state.category === c.id ? 'active' : ''}" onclick="setCategory('${c.id}')">${c.id === 'all' ? c.name : esc(localized(c,'name'))}</button>`
  ).join('');

  let list = state.products.filter(p => {
    const matchGroup = state.group === 'all' || p.category.group === state.group;
    const matchCat = state.category === 'all' || p.categoryId === state.category;
    const matchSearch = !state.search || p.name.toLowerCase().includes(state.search.toLowerCase());
    return matchGroup && matchCat && matchSearch;
  });
  document.getElementById('catalogTitle').textContent = t('browseTitle_' + state.group);

  const grid = document.getElementById('productGrid');
  grid.innerHTML = list.length === 0 ? `<div class="empty" style="grid-column:1/-1">No products match.</div>` :
    list.map(p => `
      <div class="card" onclick="viewProduct('${p.id}')">
        <div class="card-thumb" style="background:${catThumbBg(p.category.fulfillment)}">
          <span class="tag">${esc(localized(p.category,'name'))}</span>${ICONS[p.category.fulfillment]}
        </div>
        <div class="card-body">
          <h3>${esc(localized(p,'name'))}</h3><p>${esc(localized(p,'description'))}</p>
          <div class="card-foot"><span class="price">$${p.price.toFixed(2)}</span>
            <button class="btn sm" onclick="event.stopPropagation();addToCart('${p.id}')">Add</button></div>
        </div>
      </div>`).join('');
}
function setGroup(g) { state.group = g; state.category = 'all'; renderCatalog(); }
function setCategory(c) { state.category = c; renderCatalog(); }
function onSearch(v) { state.search = v; renderCatalog(); }

function viewProduct(id) {
  const p = state.products.find(x => x.id === id);
  document.getElementById('productDetail').innerHTML = `
    <a href="#" onclick="go('home');return false;" style="color:var(--text-dim);font-size:13px;">← Back to catalog</a>
    <div style="display:grid;grid-template-columns:280px 1fr;gap:30px;margin-top:16px;">
      <div style="height:220px;border-radius:14px;background:${catThumbBg(p.category.fulfillment)};display:flex;align-items:center;justify-content:center;font-size:70px;">${ICONS[p.category.fulfillment]}</div>
      <div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent-2);text-transform:uppercase;">${esc(localized(p.category,'name'))} · ${p.category.fulfillment}</div>
        <h1 style="font-family:var(--font-display);font-size:26px;margin:8px 0;">${esc(localized(p,'name'))}</h1>
        <p style="color:var(--text-dim);max-width:520px;line-height:1.6;">${esc(localized(p,'description'))}</p>
        ${p.category.fulfillment === 'download' ? `<div class="hint">Format: ${p.fileMeta?.fmt || '—'} · Size: ${p.fileMeta?.size || '—'}<br>Available for ${p.category.downloadWindowHours}h after purchase, ${p.category.maxDownloads} download(s) allowed.</div>` : ''}
        ${p.category.fulfillment === 'shipping' ? `<div class="hint">Ships to the address you provide at checkout.</div>` : ''}
        ${p.category.fulfillment === 'booking' ? `<div class="hint">Scheduled with staff after your booking is confirmed.</div>` : ''}
        <div style="margin-top:20px;display:flex;align-items:center;gap:14px;">
          <span class="price" style="font-size:22px;">$${p.price.toFixed(2)}</span>
          <button class="btn" onclick="addToCart('${p.id}')">Add to cart</button>
        </div>
      </div>
    </div>`;
  go('product');
}

/* ---------------- cart ---------------- */
function addToCart(id) {
  const line = state.cart.find(l => l.productId === id);
  if (line) line.qty += 1; else state.cart.push({ productId: id, qty: 1 });
  state.checkoutStep = 'cart';
  renderNav(document.querySelector('.view.active').id.replace('view-', ''));
  go('cart');
}
function removeFromCart(id) { state.cart = state.cart.filter(l => l.productId !== id); renderCart(); renderNav('cart'); }
function changeQty(id, delta) {
  const line = state.cart.find(l => l.productId === id);
  line.qty = Math.max(1, line.qty + delta);
  renderCart();
}
function cartLines() {
  return state.cart.map(l => ({ ...l, product: state.products.find(p => p.id === l.productId) }));
}
function renderCart() {
  const el = document.getElementById('cartContent');
  const lines = cartLines();
  if (lines.length === 0) { el.innerHTML = `<div class="empty">${t('emptyCart')} <a href="#" onclick="go('home');return false;" style="color:var(--accent)">${t('browseCatalog')}</a>.</div>`; return; }
  const total = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const shippingLines = lines.filter(l => l.product.category.fulfillment === 'shipping');
  const needsShipping = shippingLines.length > 0;
  const pickupAvailable = needsShipping && shippingLines.every(l => l.product.category.allowPickup);
  const itemsHtml = `
    <h2 class="section-title">${t('yourCart')}</h2>
    <div class="panel" style="margin-bottom:18px;">
      ${lines.map(l => `
        <div class="order-item">
          <span>${ICONS[l.product.category.fulfillment]} ${esc(localized(l.product,'name'))} <span style="color:var(--text-dim)">× ${l.qty}</span></span>
          <span style="display:flex;align-items:center;gap:8px;">
            <button class="btn ghost sm" onclick="changeQty('${l.productId}',-1)">−</button>
            <button class="btn ghost sm" onclick="changeQty('${l.productId}',1)">+</button>
            <span class="price">$${(l.product.price * l.qty).toFixed(2)}</span>
            <button class="btn danger sm" onclick="removeFromCart('${l.productId}')">✕</button>
          </span>
        </div>`).join('')}
      <div class="order-item" style="font-weight:700;font-size:16px;"><span>${t('total')}</span><span class="price">$${total.toFixed(2)}</span></div>
    </div>`;

  if (!state.user) { el.innerHTML = itemsHtml + `<button class="btn full" onclick="openAuth('login')">${t('logInToCheckOut')}</button>`; return; }

  // Cart review step: just the items and a clear, explicit action to move on —
  // clicking "Cart" never jumps straight into the payment form on its own.
  if (state.checkoutStep !== 'payment') {
    el.innerHTML = itemsHtml + `<button class="btn full" onclick="state.checkoutStep='payment'; renderCart();">${t('checkout')} — $${total.toFixed(2)} →</button>`;
    return;
  }

  el.innerHTML = itemsHtml + `
    <div class="panel">
      <h3>${t('checkout')}</h3>
      <div id="checkoutMsg"></div>
      ${needsShipping ? (pickupAvailable ? `
        <div class="field"><label>${t('howReceive')}</label>
          <select id="deliveryMethod" onchange="toggleShipAddr()">
            <option value="shipping">${t('shipToAddress')}</option>
            <option value="pickup">${t('pickUpInStore')}</option>
          </select>
        </div>
        <div id="shipAddrWrap" class="field"><label>${t('shippingAddress')}</label><textarea id="shipAddr" rows="2" placeholder="Street, city, postcode"></textarea></div>
      ` : `<div class="field"><label>${t('shippingAddress')}</label><textarea id="shipAddr" rows="2" placeholder="Street, city, postcode"></textarea></div>`) : ''}
      <div class="field"><label>${t('cardNumber')}</label><input id="cardNum" placeholder="4111 1111 1111 1111" maxlength="19"></div>
      <div class="row2">
        <div class="field"><label>${t('expiry')}</label><input id="cardExp" placeholder="MM/YY"></div>
        <div class="field"><label>${t('cvv')}</label><input id="cardCvv" placeholder="123"></div>
      </div>
      <button class="btn full" id="payBtn" onclick="checkout()">${t('pay')} $${total.toFixed(2)}</button>
      <button class="btn full ghost" style="margin-top:8px;" onclick="state.checkoutStep='cart'; renderCart();">← Back to cart</button>
      <div class="hint">Simulated payment provider. Use <code>4111 1111 1111 1111</code> for success or <code>0000 0000 0000 0000</code> to preview a decline.</div>
    </div>`;
}
function toggleShipAddr() {
  const wrap = document.getElementById('shipAddrWrap');
  if (wrap) wrap.style.display = document.getElementById('deliveryMethod').value === 'pickup' ? 'none' : 'block';
}
async function checkout() {
  const btn = document.getElementById('payBtn');
  const msg = document.getElementById('checkoutMsg');
  btn.disabled = true; btn.textContent = 'Processing…';
  try {
    const shipEl = document.getElementById('shipAddr');
    const deliveryEl = document.getElementById('deliveryMethod');
    const order = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: state.cart,
        deliveryMethod: deliveryEl ? deliveryEl.value : 'shipping',
        shippingAddress: shipEl ? shipEl.value : undefined,
        card: { number: document.getElementById('cardNum').value },
      }),
    });
    state.cart = [];
    state.checkoutStep = 'cart';
    renderNav('cart');
    renderReceipt(order.order);
  } catch (e) {
    msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`;
    btn.disabled = false; btn.textContent = 'Try again';
  }
}
function renderReceipt(order) {
  document.getElementById('cartContent').innerHTML = `
    <div class="panel" style="max-width:480px;margin:0 auto;">
      <h3>✓ ${t('paymentSuccessfulH3')}</h3>
      <div class="hint">${order.id} · ${new Date(order.createdAt).toLocaleString()}</div>
      ${order.items.map(i => `
        <div class="order-item">
          <span>${ICONS[i.fulfillment]} ${esc(localized(i,'name'))}</span>
          ${i.fulfillment === 'download' ? `<button class="btn sm secondary" onclick="downloadItem('${order.id}','${i.productId}')">⬇ ${t('download')}</button>` :
            i.fulfillment === 'shipping' && i.deliveryMethod === 'pickup' ? `<span class="status-pill pending">${t('awaitingPickupStatus')}</span>` :
            i.fulfillment === 'shipping' ? `<span class="status-pill pending">${t('pendingShipmentStatus')}</span>` :
            i.fulfillment === 'booking' ? `<span class="status-pill requested">${t('requestedStatus')}</span>` : `<span class="status-pill pending">${t('pendingStatus')}</span>`}
        </div>`).join('')}
      <button class="btn full" style="margin-top:16px" onclick="go('orders')">${t('viewMyOrdersBtn')}</button>
    </div>`;
}
async function downloadItem(orderId, productId) {
  try {
    const res = await api(`/api/downloads/${orderId}/${productId}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'download.txt';
    document.body.appendChild(a); a.click(); a.remove();
    if (document.getElementById('view-orders').classList.contains('active')) renderOrders();
  } catch (e) { alert(e.message); }
}
async function exportStoreData() {
  try {
    const data = await api('/api/admin/export'); // already parsed to an object, since this endpoint returns application/json
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.store.subdomain}-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { alert(e.message); }
}

/* ---------------- auth ---------------- */
function onAuthBtn() { openAuth('login'); }
function openAuth(mode) { renderAuthModal(mode); openModal('authOverlay'); }
function renderAuthModal(mode, error) {
  const c = document.getElementById('authModalContent');
  if (mode === 'login') {
    c.innerHTML = `<h3>${t('logIn')}</h3>
      ${error ? `<div class="msg error">${esc(error)}</div>` : ''}
      <div class="field"><label>${t('email')}</label><input id="liEmail" type="email"></div>
      <div class="field"><label>${t('password')}</label><input id="liPass" type="password"></div>
      <button class="btn full" onclick="doLogin()">${t('logIn')}</button>
      <div style="text-align:center;font-size:13px;margin-top:12px;color:var(--text-dim)">
        <a href="#" style="color:var(--accent)" onclick="renderAuthModal('forgot');return false;">${t('forgotPassword')}</a> ·
        <a href="#" style="color:var(--accent)" onclick="renderAuthModal('register');return false;">${t('newAccount')}</a></div>`;
  } else if (mode === 'register') {
    c.innerHTML = `<h3>${t('createAccount')}</h3>
      ${error ? `<div class="msg error">${esc(error)}</div>` : ''}
      <div class="field"><label>${t('name')}</label><input id="rName"></div>
      <div class="field"><label>${t('email')}</label><input id="rEmail" type="email"></div>
      <div class="field"><label>${t('password')}</label><input id="rPass" type="password"></div>
      <button class="btn full" onclick="doRegister()">${t('createAccount')}</button>
      <div style="text-align:center;font-size:13px;margin-top:12px;color:var(--text-dim)"><a href="#" style="color:var(--accent)" onclick="renderAuthModal('login');return false;">${t('haveAccount')}</a></div>`;
  } else if (mode === 'forgot') {
    c.innerHTML = `<h3>${t('resetYourPassword')}</h3>
      ${error ? `<div class="msg error">${esc(error)}</div>` : ''}
      <div id="forgotMsg"></div>
      <div class="field"><label>${t('email')}</label><input id="fpEmail" type="email"></div>
      <button class="btn full" onclick="doForgotPassword()">${t('sendResetLink')}</button>
      <div style="text-align:center;font-size:13px;margin-top:12px;color:var(--text-dim)"><a href="#" style="color:var(--accent)" onclick="renderAuthModal('login');return false;">${t('backToLogin')}</a></div>`;
  } else if (mode === 'reset') {
    c.innerHTML = `<h3>${t('chooseNewPassword')}</h3>
      ${error ? `<div class="msg error">${esc(error)}</div>` : ''}
      <div class="field"><label>${t('resetCode')}</label><input id="rpToken" value="${state.pendingResetToken || ''}"></div>
      <div class="field"><label>${t('newPassword')}</label><input id="rpPass" type="password" placeholder="At least 6 characters"></div>
      <button class="btn full" onclick="doResetPassword()">${t('setNewPassword')}</button>`;
  }
}
async function doForgotPassword() {
  const email = document.getElementById('fpEmail').value;
  try {
    const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    // No real email provider is wired in for this demo — the reset code is shown directly instead of emailed.
    state.pendingResetToken = data.demoResetToken || '';
    renderAuthModal('reset');
    document.getElementById('forgotMsg')?.remove();
  } catch (e) { renderAuthModal('forgot', e.message); }
}
async function doResetPassword() {
  try {
    await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: document.getElementById('rpToken').value, newPassword: document.getElementById('rpPass').value }) });
    renderAuthModal('login');
    document.getElementById('authModalContent').insertAdjacentHTML('afterbegin', `<div class="msg success">Password updated — log in with your new password.</div>`);
  } catch (e) { renderAuthModal('reset', e.message); }
}
async function doLogin() {
  try {
    const { user, token } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('liEmail').value, password: document.getElementById('liPass').value }) });
    state.user = user; state.token = token; localStorage.setItem('hadam_token', token);
    closeModal('authOverlay');
    go(user.role === 'admin' ? 'admin' : user.role === 'employee' ? 'employee' : 'home');
  } catch (e) { renderAuthModal('login', e.message); }
}
async function doRegister() {
  try {
    const { user, token } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: document.getElementById('rName').value, email: document.getElementById('rEmail').value, password: document.getElementById('rPass').value }) });
    state.user = user; state.token = token; localStorage.setItem('hadam_token', token);
    closeModal('authOverlay'); go('home');
  } catch (e) { renderAuthModal('register', e.message); }
}
function logout() { state.user = null; state.token = null; localStorage.removeItem('hadam_token'); closeModal('accountOverlay'); go('welcome'); }

/* ---------------- account menu: change password + logout ---------------- */
function openAccountMenu() {
  document.getElementById('accountModalContent').innerHTML = `
    <h3>${esc(state.user.name)}</h3>
    <div class="hint" style="margin-bottom:14px;">${esc(state.user.email)} · ${state.user.role}</div>
    <div id="accountMsg"></div>
    <div class="field"><label>${t('currentPasswordLabel')}</label><input id="cpCurrent" type="password"></div>
    <div class="field"><label>${t('newPasswordLabel')}</label><input id="cpNew" type="password" placeholder="${t('atLeast6Chars')}"></div>
    <button class="btn full" onclick="doChangePassword()">${t('changePasswordBtn')}</button>
    <button class="btn full secondary" style="margin-top:10px;" onclick="logout()">${t('logout')}</button>
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
      <button class="btn full danger" onclick="openDeleteAccount()">${t('deleteMyAccountBtn')}</button>
    </div>`;
  openModal('accountOverlay');
}
function openDeleteAccount() {
  document.getElementById('accountModalContent').innerHTML = `
    <h3>${t('deleteYourAccountH3')}</h3>
    <div class="msg error">${t('deleteAccountWarning')}</div>
    <div id="deleteAcctMsg"></div>
    <div class="field"><label>${t('confirmPasswordLabel')}</label><input id="delPassword" type="password"></div>
    <button class="btn full danger" onclick="doDeleteAccount()">${t('permanentlyDeleteBtn')}</button>
    <button class="btn full secondary" style="margin-top:10px;" onclick="openAccountMenu()">${t('cancelBtn')}</button>`;
}
async function doDeleteAccount() {
  const msg = document.getElementById('deleteAcctMsg');
  try {
    await api('/api/auth/me', { method: 'DELETE', body: JSON.stringify({ password: document.getElementById('delPassword').value }) });
    closeModal('accountOverlay');
    logout();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function doChangePassword() {
  const msg = document.getElementById('accountMsg');
  try {
    await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({
      currentPassword: document.getElementById('cpCurrent').value,
      newPassword: document.getElementById('cpNew').value,
    }) });
    msg.innerHTML = `<div class="msg success">${t('passwordChangedMsg')}</div>`;
    document.getElementById('cpCurrent').value = ''; document.getElementById('cpNew').value = '';
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* ---------------- Sale on Hadam: hire store/marketplace/both, upgrade/downgrade, or cancel ---------------- */
async function renderSell() {
  const el = document.getElementById('sellContent');
  const isOwnAdmin = state.user && state.user.role === 'admin';
  const tiers = await fetchPricing();
  const info = isOwnAdmin ? await api('/api/tenant/info') : null;
  el.innerHTML = `
    <h2 class="section-title">${t('saleOnHadam')}</h2>
    <p style="color:var(--text-dim);font-size:13.5px;max-width:640px;margin:-8px 0 20px;">${t('sellIntro')}</p>
    ${pricingCardsHtml(tiers, info ? info.subscriptionTier : null)}
    ${isOwnAdmin ? `
      <div class="panel" style="max-width:560px;margin-top:22px;">
        <h3>${t('managePlanH3')}</h3>
        <p style="color:var(--text-dim);font-size:13.5px;">${t('managePlanP')}</p>
        <button class="btn secondary" onclick="state.adminTab='settings'; go('admin');">${t('goToStoreSettings')}</button>
      </div>
    ` : `
      <div class="panel" style="max-width:640px;margin-top:22px;">
        <h3>${t('hireOwnStoreH3')}</h3>
        <p style="color:var(--text-dim);font-size:13.5px;">${t('hireOwnStoreP')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="${platformUrl()}?lang=${state.lang}&plan=store#sell" target="_blank" class="btn secondary">${t('hireStoreOnly')} →</a>
          <a href="${platformUrl()}?lang=${state.lang}&plan=marketplace#sell" target="_blank" class="btn secondary">${t('hireMarketplaceOnly')} →</a>
          <a href="${platformUrl()}?lang=${state.lang}&plan=both#sell" target="_blank" class="btn">${t('hireBoth')} →</a>
        </div>
        <div class="hint">${t('newStoreSeparateHint')} (${esc(localized(state.tenantInfo,'name'))})</div>
      </div>
      <div class="panel" style="max-width:640px;margin-top:16px;">
        <h3>${t('justWantToShopH3')}</h3>
        <button class="btn secondary" onclick="openAuth('${state.user ? 'login' : 'register'}')">${state.user ? t('manageMyAccount') : t('signInRegisterClient')}</button>
      </div>
    `}`;
}

/* ---------------- orders (client) ---------------- */
async function renderOrders() {
  const el = document.getElementById('ordersContent');
  const { orders } = await api('/api/orders/mine');
  el.innerHTML = `
    <h2 class="section-title">${t('myOrdersTitle')}</h2>` + (orders.length === 0 ? `<div class="empty">${t('noOrdersYet')}</div>` :
    orders.map(o => `
      <div class="order-card">
        <div class="oh"><span>${o.id} · ${new Date(o.createdAt).toLocaleString()}</span><span class="status-pill ${o.paymentStatus}">${o.paymentStatus}</span></div>
        ${o.items.map(i => `
          <div class="order-item">
            <span>${ICONS[i.fulfillment]} ${esc(localized(i,'name'))}</span>
            <span style="display:flex;align-items:center;gap:8px;">
              ${statusExtra(i, o.id)}
              <span class="status-pill ${i.status}">${i.status.replace('_', ' ')}</span>
            </span>
          </div>`).join('')}
      </div>`).join(''));
}
async function requestRefund(orderId, productId) {
  const reason = prompt('Why are you requesting a refund? (optional)') || '';
  try {
    await api(`/api/orders/${orderId}/items/${productId}/request-refund`, { method: 'POST', body: JSON.stringify({ reason }) });
    renderOrders();
  } catch (e) { alert(e.message); }
}
function statusExtra(i, orderId) {
  const parts = [];
  if (i.fulfillment === 'download' && i.status === 'ready') {
    parts.push(`<button class="btn sm secondary" onclick="downloadItem('${orderId}','${i.productId}')">⬇ ${t('download')}</button>`);
  }
  if (i.fulfillment === 'shipping' && i.trackingNote) parts.push(`<span class="hint" style="margin:0">${esc(i.trackingNote)}</span>`);
  if (i.fulfillment === 'booking' && i.scheduledAt) parts.push(`<span class="hint" style="margin:0">${new Date(i.scheduledAt).toLocaleString()}</span>`);
  if (i.refundRequested) {
    parts.push(`<span class="hint" style="margin:0">${t('refundRequestedStatus')}</span>`);
  } else if (!['refunded', 'payment_failed'].includes(i.status)) {
    parts.push(`<button class="btn ghost sm" onclick="requestRefund('${orderId}','${i.productId}')">${t('requestRefundBtn')}</button>`);
  }
  return parts.join(' ');
}

/* ---------------- employee ---------------- */
async function renderEmployee() {
  const el = document.getElementById('employeeContent');
  el.innerHTML = `<h2 class="section-title">${t('fulfillmentOrdersH2')}</h2>
    <div class="admin-tabs">
      ${['queue', 'orders'].map(tabKey => `<button class="admin-tab ${state.employeeTab === tabKey ? 'active' : ''}" onclick="setEmployeeTab('${tabKey}')">${tabKey === 'queue' ? t('fulfillmentQueue') : t('allOrdersPayments')}</button>`).join('')}
    </div>
    <div id="employeeTabBody"></div>`;
  renderEmployeeTab();
}
function setEmployeeTab(t) { state.employeeTab = t; renderEmployee(); }
async function renderEmployeeTab() {
  const el = document.getElementById('employeeTabBody');
  if (state.employeeTab === 'queue') {
    const { queue } = await api('/api/employee/queue');
    el.innerHTML = queue.length === 0 ? `<div class="empty">${t('nothingToFulfill')}</div>` :
      queue.map(q => `
        <div class="order-card">
          <div class="oh"><span>${q.orderId} · ${esc(q.clientName)} (${esc(q.clientEmail)})</span><span class="status-pill ${q.item.status}">${q.item.status.replace('_',' ')}</span></div>
          <div class="order-item"><span>${ICONS[q.item.fulfillment]} ${esc(localized(q.item,'name'))}</span></div>
          ${q.item.status === 'refunded' ? `<div class="hint">${t('refundedByOn').replace('{by}', q.item.refundedBy).replace('{date}', new Date(q.item.refundedAt).toLocaleString())}${q.item.refundReason ? ` — "${q.item.refundReason}"` : ''}</div>` : `
          ${q.item.fulfillment === 'shipping' && q.item.deliveryMethod === 'pickup' ? `
            <div class="hint">${t('inStorePickupHint')}</div>
            <div class="row2" style="margin-top:8px;">
              <select id="sel-${q.orderId}-${q.item.productId}">
                ${['pending','ready_for_pickup','picked_up'].map(s=>`<option value="${s}" ${s===q.item.status?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
              </select>
              <input id="note-${q.orderId}-${q.item.productId}" placeholder="${t('pickupNotePlaceholder')}" value="${q.item.trackingNote||''}">
            </div>
            <button class="btn sm" style="margin-top:8px" onclick="updateItem('${q.orderId}','${q.item.productId}','pickup')">${t('save')}</button>
          ` : q.item.fulfillment === 'shipping' ? `
            <div class="hint">${t('shipToLabel')} ${q.shippingAddress || '—'}</div>
            <div class="row2" style="margin-top:8px;">
              <select id="sel-${q.orderId}-${q.item.productId}">
                ${['pending','processing','shipped','delivered'].map(s=>`<option value="${s}" ${s===q.item.status?'selected':''}>${s}</option>`).join('')}
              </select>
              <input id="note-${q.orderId}-${q.item.productId}" placeholder="${t('trackingNotePlaceholder')}" value="${q.item.trackingNote||''}">
            </div>
            <button class="btn sm" style="margin-top:8px" onclick="updateItem('${q.orderId}','${q.item.productId}','shipping')">${t('save')}</button>
          ` : q.item.fulfillment === 'booking' ? `
            <div class="row2" style="margin-top:8px;">
              <select id="sel-${q.orderId}-${q.item.productId}">
                ${['requested','confirmed','completed','cancelled'].map(s=>`<option value="${s}" ${s===q.item.status?'selected':''}>${s}</option>`).join('')}
              </select>
              <input id="sched-${q.orderId}-${q.item.productId}" type="datetime-local">
            </div>
            <button class="btn sm" style="margin-top:8px" onclick="updateItem('${q.orderId}','${q.item.productId}','booking')">${t('save')}</button>
          ` : `
            <div class="row2" style="margin-top:8px;">
              <select id="sel-${q.orderId}-${q.item.productId}">
                ${['pending','in_progress','done'].map(s=>`<option value="${s}" ${s===q.item.status?'selected':''}>${s}</option>`).join('')}
              </select>
              <input id="note-${q.orderId}-${q.item.productId}" placeholder="${t('notePlaceholder')}" value="${q.item.trackingNote||''}">
            </div>
            <button class="btn sm" style="margin-top:8px" onclick="updateItem('${q.orderId}','${q.item.productId}','manual')">${t('save')}</button>
          `}
          <button class="btn danger sm" style="margin-top:8px" onclick="refundItem('${q.orderId}','${q.item.productId}')">${t('refundThisItemBtn')}</button>
          `}
        </div>`).join('');
  } else {
    const { orders } = await api('/api/employee/orders');
    el.innerHTML = orders.length === 0 ? `<div class="empty">${t('noOrdersYet')}</div>` :
      orders.map(o => `
        <div class="order-card">
          <div class="oh"><span>${o.id} · ${esc(o.clientName)} (${esc(o.clientEmail)}) · ${new Date(o.createdAt).toLocaleString()}</span><span class="status-pill ${o.paymentStatus}">${o.paymentStatus}</span></div>
          ${o.items.map(i => `
            <div class="order-item">
              <span>${ICONS[i.fulfillment]} ${esc(localized(i,'name'))} <span style="color:var(--text-dim)">$${i.price.toFixed(2)} × ${i.qty}</span></span>
              <span style="display:flex;align-items:center;gap:8px;">
                <span class="status-pill ${i.status}">${i.status.replace('_',' ')}</span>
                ${o.paymentStatus === 'success' && i.status !== 'refunded' ? `<button class="btn ghost sm" onclick="refundItem('${o.id}','${i.productId}')">${t('refundBtn')}</button>` : ''}
              </span>
            </div>`).join('')}
        </div>`).join('');
  }
}
async function refundItem(orderId, productId) {
  const reason = prompt(t('refundReasonPrompt')) || '';
  try {
    await api(`/api/employee/orders/${orderId}/items/${productId}/refund`, { method: 'POST', body: JSON.stringify({ reason }) });
    renderEmployeeTab();
  } catch (e) { alert(e.message); }
}
async function updateItem(orderId, productId, kind) {
  const status = document.getElementById(`sel-${orderId}-${productId}`).value;
  const body = { status };
  const noteEl = document.getElementById(`note-${orderId}-${productId}`);
  if (noteEl) body.trackingNote = noteEl.value;
  const schedEl = document.getElementById(`sched-${orderId}-${productId}`);
  if (schedEl && schedEl.value) body.scheduledAt = new Date(schedEl.value).getTime();
  await api(`/api/employee/orders/${orderId}/items/${productId}`, { method: 'PATCH', body: JSON.stringify(body) });
  renderEmployeeTab();
}

/* ---------------- admin ---------------- */
async function renderAdmin() {
  const el = document.getElementById('adminContent');
  el.innerHTML = `<h2 class="section-title">${t('dashboard')}</h2>
    <div class="admin-tabs">
      ${['stats','reports','products','categories','employees','orders','settings'].map(tabKey=>`<button class="admin-tab ${state.adminTab===tabKey?'active':''}" onclick="setAdminTab('${tabKey}')">${tabKey==='settings' ? t('storeSettingsTab') : tabKey==='reports' ? t('reportsTab') : t(tabKey)}</button>`).join('')}
    </div>
    <div id="adminTabBody"></div>`;
  renderAdminTab();
}
function setAdminTab(t) { state.adminTab = t; renderAdmin(); }
function setReportPreset(days) {
  const to = Date.now();
  const from = days >= 36500 ? 0 : to - days * 24 * 3600 * 1000;
  state._reportRange = { from, to };
  renderAdminTab();
}
async function runReport() {
  const fromInput = document.getElementById('reportFrom').value;
  const toInput = document.getElementById('reportTo').value;
  const from = new Date(fromInput).getTime();
  const to = new Date(toInput).getTime() + (24 * 3600 * 1000 - 1); // include the whole "to" day
  state._reportRange = { from, to };
  const el = document.getElementById('reportResults');
  el.innerHTML = t('loading');
  const r = await api(`/api/admin/reports?from=${from}&to=${to}`);
  el.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><div class="n">$${r.revenue.toFixed(2)}</div><div class="l">${t('netRevenue')}</div></div>
      <div class="stat-card"><div class="n">$${r.refundedTotal.toFixed(2)}</div><div class="l">${t('refundedLabel')} (${r.refundedItemCount})</div></div>
      <div class="stat-card"><div class="n">${r.successOrderCount}/${r.orderCount}</div><div class="l">${t('paidTotalOrders')}</div></div>
      <div class="stat-card"><div class="n">${r.newClients}</div><div class="l">${t('newClientsLabel')}</div></div>
      <div class="stat-card"><div class="n">$${r.commissionOwed.toFixed(2)}</div><div class="l">${t('commissionLabel')} (${(r.commissionRate*100).toFixed(0)}%)</div></div>
      <div class="stat-card"><div class="n">$${r.sellerKeeps.toFixed(2)}</div><div class="l">${t('youKeepLabel')}</div></div>
    </div>
    <div class="row2" style="align-items:start;">
      <div class="panel">
        <h3>${t('topProductsPeriod')}</h3>
        ${r.topProducts.length === 0 ? `<div class="hint">${t('noSalesPeriod')}</div>` : `<table><thead><tr><th>${t('productCol')}</th><th>${t('unitsCol')}</th><th>${t('revenueCol')}</th></tr></thead><tbody>
          ${r.topProducts.map(p => `<tr><td>${esc(p.name)}</td><td>${p.unitsSold}</td><td>$${p.revenue.toFixed(2)}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
      <div class="panel">
        <h3>${t('dayByDayH3')}</h3>
        ${r.dailySeries.length === 0 ? `<div class="hint">${t('noOrdersPeriod')}</div>` : `<table><thead><tr><th>${t('dateCol')}</th><th>${t('ordersCol')}</th><th>${t('revenueCol')}</th></tr></thead><tbody>
          ${r.dailySeries.map(d => `<tr><td>${d.date}</td><td>${d.orders}</td><td>$${d.revenue.toFixed(2)}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
    </div>`;
}
async function renderAdminTab() {
  const body = document.getElementById('adminTabBody');
  if (state.adminTab === 'stats') {
    const s = await api('/api/admin/stats');
    body.innerHTML = `<div class="stat-cards">
      <div class="stat-card"><div class="n">$${s.revenue.toFixed(2)}</div><div class="l">${t('netRevenue')}</div></div>
      <div class="stat-card"><div class="n">$${s.refundedTotal.toFixed(2)}</div><div class="l">${t('refundedLabel')} (${s.refundedItemCount})</div></div>
      <div class="stat-card"><div class="n">${s.successOrderCount}/${s.orderCount}</div><div class="l">${t('paidTotalOrders')}</div></div>
      <div class="stat-card"><div class="n">${s.productCount}</div><div class="l">${t('products')} (${s.categoryCount} ${t('categories')})</div></div>
      <div class="stat-card"><div class="n">${s.clientCount}</div><div class="l">${t('clientsLabel')}</div></div>
      <div class="stat-card"><div class="n">${s.employeeCount}</div><div class="l">${t('employees')}</div></div>
    </div>
    <div class="row2" style="align-items:start;">
      <div class="panel">
        <h3>${t('topSellingProducts')}</h3>
        ${s.topProducts.length === 0 ? `<div class="hint">${t('noSalesYet')}</div>` : `<table><thead><tr><th>${t('productCol')}</th><th>${t('unitsCol')}</th><th>${t('revenueCol')}</th></tr></thead><tbody>
          ${s.topProducts.map(p => `<tr><td>${esc(p.name)}</td><td>${p.unitsSold}</td><td>$${p.revenue.toFixed(2)}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
      <div class="panel">
        <h3>${t('stockLevelsH3')} ${s.lowStock.length ? `<span class="status-pill failed" style="margin-left:6px">${s.lowStock.length} ${t('lowBadge')}</span>` : ''}</h3>
        ${s.stockLevels.length === 0 ? `<div class="hint">${t('noStockTracked')}</div>` : `<table><thead><tr><th>${t('productCol')}</th><th>${t('stockCol')}</th></tr></thead><tbody>
          ${s.stockLevels.map(p => `<tr><td>${esc(p.name)}</td><td>${p.stock <= s.lowStockThreshold ? `<span class="status-pill failed">${p.stock} ${t('leftBadge')}</span>` : p.stock}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
    </div>`;
  } else if (state.adminTab === 'products') {
    const { products } = await api('/api/products');
    body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="color:var(--text-dim);font-size:13.5px">${products.length} ${t('products')}</span>
      <button class="btn sm" onclick="openProductForm(null)">${t('addProduct')}</button></div>
      <table><thead><tr><th>${t('nameCol')}</th><th>${t('categoryCol')}</th><th>${t('priceCol')}</th><th></th></tr></thead><tbody>
      ${products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.category.name)}</td><td>$${p.price.toFixed(2)}</td>
        <td><button class="btn ghost sm" onclick='openProductForm(${JSON.stringify(p.id)})'>${t('edit')}</button>
        <button class="btn danger sm" onclick="deleteProduct('${p.id}')">${t('delete')}</button></td></tr>`).join('')}
      </tbody></table>`;
  } else if (state.adminTab === 'categories') {
    body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="color:var(--text-dim);font-size:13.5px">${state.categories.length} ${t('categories')}</span>
      <button class="btn sm" onclick="openCategoryForm()">${t('addCategory')}</button></div>
      <table><thead><tr><th>${t('nameCol')}</th><th>${t('groupCol')}</th><th>${t('fulfillmentCol')}</th><th>${t('rulesCol')}</th><th>${t('marketplaceTagCol')}</th><th></th></tr></thead><tbody>
      ${state.categories.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.group}</td><td>${c.fulfillment}</td>
        <td>${c.fulfillment==='download' ? `${c.downloadWindowHours}h · ${c.maxDownloads} ${t('downloadsWord')}` : '—'}</td>
        <td>${c.platformCategory || t('otherFallback')}</td>
        <td class="table-actions"><button class="btn ghost sm" onclick='openCategoryForm(${JSON.stringify(c.id)})'>${t('edit')}</button>
        <button class="btn danger sm" onclick="deleteCategory('${c.id}')">${t('delete')}</button></td></tr>`).join('')}
      </tbody></table>`;
  } else if (state.adminTab === 'employees') {
    const { users } = await api('/api/admin/users');
    body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="color:var(--text-dim);font-size:13.5px">${users.length} ${t('accountsWord')}</span>
      <button class="btn sm" onclick="openEmployeeForm()">${t('addEmployee')}</button></div>
      <table><thead><tr><th>${t('nameCol')}</th><th>${t('emailCol')}</th><th>${t('roleCol')}</th><th></th></tr></thead><tbody>
      ${users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="role-badge">${u.role}</span></td>
        <td>${u.id === state.user.id ? `<span class="hint" style="margin:0">(${t('youLabel')})</span>` : `<button class="btn danger sm" onclick="deleteUser('${u.id}')">${t('delete')}</button>`}</td></tr>`).join('')}
      </tbody></table>`;
  } else if (state.adminTab === 'orders') {
    const { orders } = await api('/api/admin/orders');
    body.innerHTML = `<table><thead><tr><th>${t('idCol')}</th><th>${t('clientCol')}</th><th>${t('itemsCol')}</th><th>${t('totalCol')}</th><th>${t('statusCol')}</th><th>${t('dateCol')}</th></tr></thead><tbody>
      ${orders.map(o=>`<tr><td>${o.id}</td><td>${esc(o.clientEmail)}</td><td>${o.items.length}</td><td>$${o.total.toFixed(2)}</td>
        <td><span class="status-pill ${o.paymentStatus}">${o.paymentStatus}</span></td><td>${new Date(o.createdAt).toLocaleString()}</td></tr>`).join('')}
      </tbody></table>`;
  } else if (state.adminTab === 'reports') {
    if (!state._reportRange) {
      const to = Date.now();
      const from = to - 30 * 24 * 3600 * 1000;
      state._reportRange = { from, to };
    }
    const { from, to } = state._reportRange;
    body.innerHTML = `
      <div class="panel" style="margin-bottom:18px;">
        <div class="row2">
          <div class="field"><label>${t('fromLabel')}</label><input type="date" id="reportFrom" value="${new Date(from).toISOString().slice(0,10)}"></div>
          <div class="field"><label>${t('toLabel')}</label><input type="date" id="reportTo" value="${new Date(to).toISOString().slice(0,10)}"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <button class="chip" onclick="setReportPreset(1)">${t('presetToday')}</button>
          <button class="chip" onclick="setReportPreset(7)">${t('presetWeek')}</button>
          <button class="chip" onclick="setReportPreset(30)">${t('presetMonth')}</button>
          <button class="chip" onclick="setReportPreset(365)">${t('presetYear')}</button>
          <button class="chip" onclick="setReportPreset(36500)">${t('presetAllTime')}</button>
        </div>
        <button class="btn" onclick="runReport()">${t('runReportBtn')}</button>
      </div>
      <div id="reportResults"></div>`;
    runReport();
  } else if (state.adminTab === 'settings') {
    const info = await api('/api/tenant/info');
    state._currentPlan = info.plan;
    state._editingStoreInfo = info;
    const existingStoreLangs = info.translations ? Object.keys(info.translations) : [];
    const alertLevel = info.subscriptionAlertLevel;
    const alertBannerHtml = alertLevel ? `
      <div class="msg ${alertLevel === 'expired' ? 'error' : 'error'}" style="margin-bottom:14px;">
        ${alertLevel === 'expired' ? t('subExpiredBanner') : t('subExpiringBanner').replace('{days}', info.daysUntilExpiry)}
      </div>` : '';
    body.innerHTML = `
      ${alertBannerHtml}
      <div class="panel" style="max-width:560px;">
        <h3>${t('subscriptionH3')}</h3>
        <p style="color:var(--text-dim);font-size:13px;">${t('subExpiresOnLabel')} <strong style="color:var(--text)">${new Date(info.subscriptionExpiresAt).toDateString()}</strong> (${info.daysUntilExpiry >= 0 ? t('subDaysRemaining').replace('{days}', info.daysUntilExpiry) : t('subDaysOverdue').replace('{days}', Math.abs(info.daysUntilExpiry))})</p>
        <div id="renewMsg"></div>
        <p style="color:var(--text-dim);font-size:13px;">${t('renewAsHint')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn secondary" onclick="renewSubscription('store')">${t('renewStoreOnlyBtn')}</button>
          <button class="btn secondary" onclick="renewSubscription('marketplace')">${t('renewMarketplaceOnlyBtn')}</button>
          <button class="btn" onclick="renewSubscription('both')">${t('renewBothBtn')}</button>
        </div>
      </div>
      <div class="panel" style="max-width:560px;margin-top:18px;">
        <h3>${t('storeDetailsH3')}</h3>
        <div id="settingsMsg"></div>
        <div class="field"><label>${t('storeNameLabelForm')}</label><input id="stName" value="${esc(info.name)}"></div>
        <div class="field"><label>${t('taglineLabelForm')}</label><input id="stTagline" value="${esc(info.tagline)}" placeholder="${t('taglinePlaceholderForm')}"></div>
        <div class="field"><label>${t('aboutStoreLabelForm')}</label>
          <textarea id="stAbout" rows="5" placeholder="${t('aboutStorePlaceholderForm')}">${esc(info.aboutText || '')}</textarea>
          <div class="hint">${t('aboutStoreHintForm')}</div>
        </div>
        ${storeTranslationFieldsHtml(existingStoreLangs)}
        <div class="field"><label>${t('planLabelForm')}</label>
          <select id="stPlan">
            <option value="store" ${info.plan==='store'?'selected':''}>${t('planStoreOnlyOptForm')}</option>
            <option value="marketplace" ${info.plan==='marketplace'?'selected':''}>${t('planMarketplaceOptForm')}</option>
            <option value="both" ${info.plan==='both'?'selected':''}>${t('planBothOptForm')}</option>
          </select>
          <div class="hint">${t('planChangeHintForm')}</div>
        </div>
        <button class="btn full" onclick="saveStoreSettings()">${t('save')}</button>
      </div>
      <div class="panel" style="max-width:560px;margin-top:18px;">
        <h3>${t('backUpDataH3')}</h3>
        <p style="color:var(--text-dim);font-size:13px;line-height:1.6;">${t('backUpDataP')}</p>
        <button class="btn full secondary" onclick="exportStoreData()">${t('exportMyDataBtn')}</button>
      </div>
      <div class="panel" style="max-width:560px;margin-top:18px;border-color:var(--danger);">
        <h3>${t('cancelDeleteH3')}</h3>
        <div id="cancelMsg"></div>
        <p style="color:var(--text-dim);font-size:13px;line-height:1.6;">
          <strong style="color:var(--text)">${t('cancelTempCloseStrong')}</strong> — ${info.closedBySelf ? t('storeCurrentlyClosedMsg') : t('cancelBlocksMsg')}
        </p>
        <button class="btn full ${info.closedBySelf ? '' : 'secondary'}" onclick="toggleCloseStore(${info.closedBySelf ? 'false' : 'true'})">${info.closedBySelf ? t('reopenMyStoreBtn') : t('cancelCloseMyStoreBtn')}</button>
        <p style="color:var(--text-dim);font-size:13px;line-height:1.6;margin-top:18px;border-top:1px solid var(--border);padding-top:14px;">
          <strong style="color:var(--text)">${t('deletePermanentlyStrong')}</strong> — ${t('deletePermanentlyDesc')}
        </p>
        <button class="btn full danger" onclick="openDeleteStore()">${t('deleteMyStoreBtn')}</button>
      </div>`;
  }
}
function toggleCloseStore(shouldClose) {
  const msg = document.getElementById('cancelMsg');
  const warning = shouldClose ? t('closeStoreConfirm') : t('reopenStoreConfirm');
  if (!confirm(warning)) return;
  api('/api/admin/store', { method: 'PATCH', body: JSON.stringify({ closedBySelf: shouldClose }) })
    .then(() => renderAdminTab())
    .catch(e => { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; });
}
function openDeleteStore() {
  document.getElementById('cancelMsg').innerHTML = `
    <div class="msg error">${t('deleteStoreWarning')}</div>
    <div class="field"><label>${t('confirmPasswordProceedLabel')}</label><input id="delStorePassword" type="password"></div>
    <button class="btn full danger" onclick="confirmDeleteStore()">${t('yesDeleteStoreBtn')}</button>
    <button class="btn full secondary" style="margin-top:8px;" onclick="renderAdminTab()">${t('cancelKeepStoreBtn')}</button>`;
}
async function confirmDeleteStore() {
  const msg = document.getElementById('cancelMsg');
  try {
    await api('/api/admin/store', { method: 'DELETE', body: JSON.stringify({ password: document.getElementById('delStorePassword').value }) });
    alert(t('storeDeletedAlert'));
    logout();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function renewSubscription(plan) {
  const msg = document.getElementById('renewMsg');
  const labels = { store: t('renewStoreOnlyBtn'), marketplace: t('renewMarketplaceOnlyBtn'), both: t('renewBothBtn') };
  if (!confirm(t('renewConfirm').replace('{plan}', labels[plan]))) return;
  try {
    await api('/api/admin/store/renew', { method: 'POST', body: JSON.stringify({ plan }) });
    renderAdminTab();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function saveStoreSettings() {
  const msg = document.getElementById('settingsMsg');
  const newPlan = document.getElementById('stPlan').value;
  const wasListed = state._currentPlan === 'marketplace' || state._currentPlan === 'both';
  const willBeListed = newPlan === 'marketplace' || newPlan === 'both';
  if (newPlan !== state._currentPlan) {
    let warning;
    if (wasListed && !willBeListed) warning = t('planRemoveFromMarketplaceWarning');
    else if (!wasListed && willBeListed) warning = t('planAddToMarketplaceWarning');
    else warning = t('planChangeGenericWarning');
    if (!confirm(warning)) return;
  }
  try {
    await api('/api/admin/store', { method: 'PATCH', body: JSON.stringify({
      name: document.getElementById('stName').value,
      tagline: document.getElementById('stTagline').value,
      aboutText: document.getElementById('stAbout').value,
      translations: collectTranslationsPayload('st', [['name', 'stNameTrans'], ['tagline', 'stTaglineTrans'], ['aboutText', 'stAboutTrans']]),
      plan: newPlan,
    }) });
    state._currentPlan = newPlan;
    msg.innerHTML = `<div class="msg success">${t('savedMsg')}</div>`;
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function openProductForm(id) {
  const p = id ? state.products.find(x => x.id === id) : null;
  state._editingTranslatable = p;
  const existingLangs = p && p.translations ? Object.keys(p.translations) : [];
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${id ? t('editProductTitle') : t('addProductTitle')}</h3>
    <div class="field"><label>${t('categoryTypeLabel')}</label><select id="pfCat">${state.categories.map(c=>`<option value="${c.id}" ${p&&p.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
      ${state.categories.length === 0 ? `<div class="hint">${t('noCategoriesYetHint')}</div>` : ''}
    </div>
    <div class="field"><label>${t('nameCol')}</label><input id="pfName" value="${p ? esc(p.name) : ''}"></div>
    <div class="field"><label>${t('descriptionLabel')}</label><textarea id="pfDesc" rows="3">${p?esc(p.description):''}</textarea></div>
    <div class="field"><label>${t('priceCol')}</label><input id="pfPrice" type="number" step="0.01" value="${p?p.price:''}"></div>
    <div class="field">
      <label>${t('productImagesLabel')}</label>
      ${id ? `
        <div id="pfImageGallery" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">${productImageGalleryHtml(p)}</div>
        <div id="pfImageMsg"></div>
        <input type="file" id="pfImageFile" accept="image/png,image/jpeg,image/gif,image/webp">
        <button class="btn sm secondary" style="margin-top:8px;" onclick="uploadProductImage('${id}')">${t('uploadImageBtn')}</button>
        <div class="hint">${t('imageUploadHint')}</div>
      ` : `<div class="hint">${t('saveProductFirstForImages')}</div>`}
    </div>
    <details style="margin:14px 0;">
      <summary style="cursor:pointer;color:var(--text-dim);font-size:13px;">${t('advancedOptionsLabel')}</summary>
      <div style="margin-top:12px;">
        <div class="field"><label>${t('externalUrlLabel')}</label><input id="pfExternalUrl" placeholder="${t('externalUrlPlaceholder')}" value="${p && p.externalUrl ? esc(p.externalUrl) : ''}">
          <div class="hint">${t('externalUrlHint')}</div>
        </div>
        ${translationFieldsHtml('pf', existingLangs)}
      </div>
    </details>
    <button class="btn full" onclick="saveProduct(${id ? `'${id}'` : null})">${id?t('save'):t('addProductTitle')}</button>`;
  openModal('genericOverlay');
}
function productImageGalleryHtml(p) {
  if (!p || !p.images || p.images.length === 0) return `<div class="hint" style="margin:0">${t('noImagesYet')}</div>`;
  return p.images.map(img => `
    <div style="position:relative;width:70px;height:70px;">
      <img src="${img.url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" alt="${esc(img.filename)}">
      <button onclick="deleteProductImage('${p.id}','${img.id}')" title="${t('delete')}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--danger);color:#14121f;border:none;font-size:12px;line-height:1;cursor:pointer;">✕</button>
    </div>`).join('');
}
async function uploadProductImage(productId) {
  const fileInput = document.getElementById('pfImageFile');
  const msg = document.getElementById('pfImageMsg');
  const file = fileInput.files[0];
  if (!file) { msg.innerHTML = `<div class="msg error">${t('chooseFileFirst')}</div>`; return; }
  const allowed = { 'image/png': 1, 'image/jpeg': 1, 'image/gif': 1, 'image/webp': 1 };
  if (!allowed[file.type]) { msg.innerHTML = `<div class="msg error">${t('unsupportedImageType')}</div>`; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    const dataBase64 = reader.result.split(',')[1];
    try {
      await api(`/api/admin/products/${productId}/images`, { method: 'POST', body: JSON.stringify({ mimeType: file.type, filename: file.name, dataBase64 }) });
      const { products } = await api('/api/products'); state.products = products;
      const updated = state.products.find(x => x.id === productId);
      document.getElementById('pfImageGallery').innerHTML = productImageGalleryHtml(updated);
      fileInput.value = '';
      msg.innerHTML = '';
    } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
  };
  reader.readAsDataURL(file);
}
async function deleteProductImage(productId, imageId) {
  if (!confirm(t('deleteImageConfirm'))) return;
  await api(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' });
  const { products } = await api('/api/products'); state.products = products;
  const updated = state.products.find(x => x.id === productId);
  document.getElementById('pfImageGallery').innerHTML = productImageGalleryHtml(updated);
}
/* Any store owner can add this item's name/description in whatever language they choose —
   not a fixed list. Typing a code that already has a saved translation loads it for editing;
   a new code starts blank. Other languages already saved are preserved (see mergeTranslations
   server-side) even though only one language is edited per form open. */
function translationFieldsHtml(prefix, existingLangs) {
  return `
    <div class="hint" style="margin-bottom:10px;">${t('addTranslationHint')}${existingLangs.length ? ` — ${t('alreadyHasLabel')}: ${existingLangs.join(', ')}` : ''}.</div>
    <div class="row2">
      <div class="field"><label>${t('languageCodeLabel')}</label><input id="${prefix}LangCode" placeholder="e.g. ar, fr, es" list="langSuggestions" oninput="loadTranslationFields('${prefix}', this.value)"></div>
    </div>
    <datalist id="langSuggestions"><option value="ar"><option value="fr"><option value="es"><option value="de"><option value="ur"><option value="hi"><option value="tr"><option value="zh"></datalist>
    <div class="field"><label>${t('nameInLanguageLabel')}</label><input id="${prefix}NameTrans" dir="auto"></div>
    <div class="field"><label>${t('descriptionInLanguageLabel')}</label><textarea id="${prefix}DescTrans" dir="auto" rows="2"></textarea></div>`;
}
function loadTranslationFields(prefix, code) {
  const obj = state._editingTranslatable;
  const t = obj && obj.translations && obj.translations[code.trim().toLowerCase()];
  document.getElementById(`${prefix}NameTrans`).value = (t && t.name) || '';
  document.getElementById(`${prefix}DescTrans`).value = (t && t.description) || '';
}
function storeTranslationFieldsHtml(existingLangs) {
  return `
    <div class="hint" style="margin-bottom:10px;">${t('addStoreTranslationHint')}${existingLangs.length ? ` — ${t('alreadyHasLabel')}: ${existingLangs.join(', ')}` : ''}. ${t('storeTranslationExplainer')}</div>
    <div class="row2">
      <div class="field"><label>${t('languageCodeLabel')}</label><input id="stLangCode" placeholder="e.g. ar, fr, es" list="langSuggestions" oninput="loadStoreTranslationFields(this.value)"></div>
    </div>
    <datalist id="langSuggestions"><option value="ar"><option value="fr"><option value="es"><option value="de"><option value="ur"><option value="hi"><option value="tr"><option value="zh"></datalist>
    <div class="field"><label>${t('storeNameInLanguageLabel')}</label><input id="stNameTrans" dir="auto"></div>
    <div class="field"><label>${t('taglineInLanguageLabel')}</label><input id="stTaglineTrans" dir="auto"></div>
    <div class="field"><label>${t('aboutTextInLanguageLabel')}</label><textarea id="stAboutTrans" dir="auto" rows="4"></textarea></div>`;
}
function loadStoreTranslationFields(code) {
  const info = state._editingStoreInfo;
  const t = info && info.translations && info.translations[code.trim().toLowerCase()];
  document.getElementById('stNameTrans').value = (t && t.name) || '';
  document.getElementById('stTaglineTrans').value = (t && t.tagline) || '';
  document.getElementById('stAboutTrans').value = (t && t.aboutText) || '';
}
function collectTranslationsPayload(prefix, fields) {
  const code = document.getElementById(`${prefix}LangCode`).value.trim().toLowerCase();
  if (!code) return undefined;
  const entry = {};
  fields.forEach(([apiField, elId]) => { const v = document.getElementById(elId).value; if (v) entry[apiField] = v; });
  return { [code]: entry };
}
async function saveProduct(id) {
  const body = { name: document.getElementById('pfName').value, categoryId: document.getElementById('pfCat').value,
    price: parseFloat(document.getElementById('pfPrice').value), description: document.getElementById('pfDesc').value,
    externalUrl: document.getElementById('pfExternalUrl').value,
    translations: collectTranslationsPayload('pf', [['name', 'pfNameTrans'], ['description', 'pfDescTrans']]) };
  if (id) await api(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  else await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
  const { products } = await api('/api/products'); state.products = products;
  closeModal('genericOverlay'); renderAdminTab();
}
async function deleteProduct(id) {
  if (!confirm(t('removeProductConfirm'))) return;
  await api(`/api/admin/products/${id}`, { method: 'DELETE' });
  const { products } = await api('/api/products'); state.products = products;
  renderAdminTab();
}
const PLATFORM_CATEGORIES = ['Design', 'Education', 'Stationery', 'Electronics', 'Books', 'Food & Drink', 'Software', 'Accessories', 'Other'];
function openCategoryForm(id) {
  const c = id ? state.categories.find(x => x.id === id) : null;
  state._editingTranslatable = c;
  const existingLangs = c && c.translations ? Object.keys(c.translations) : [];
  // "Category Type" is the single choice a client makes — it maps internally to the
  // group+fulfillment combination the system already uses, with sensible defaults, so the
  // primary screen only ever asks for Type + Name. Advanced fields (marketplace tag, pickup,
  // download window, translations, description) are real and still available, just tucked
  // into a collapsible section rather than shown by default.
  const currentType = !c ? 'digital' : c.fulfillment === 'download' ? 'digital' : c.fulfillment === 'shipping' ? 'physical' : c.fulfillment === 'booking' ? 'services' : 'other';
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${id ? t('editCategoryTitle') : t('addCategoryTitle')}</h3>
    <div class="field"><label>${t('categoryTypeLabel')}</label><select id="cfType" onchange="onCategoryTypeChange()" ${id ? 'disabled' : ''}>
      <option value="digital" ${currentType==='digital'?'selected':''}>${t('fulfillDownloadOpt')}</option>
      <option value="physical" ${currentType==='physical'?'selected':''}>${t('fulfillShippingOpt')}</option>
      <option value="services" ${currentType==='services'?'selected':''}>${t('fulfillBookingOpt')}</option>
      <option value="other" ${currentType==='other'?'selected':''}>${t('fulfillManualOpt')}</option>
    </select>
    ${id ? `<div class="hint">${t('categoryTypeLockedHint')}</div>` : ''}</div>
    <div class="field"><label>${t('nameCol')}</label><input id="cfName" placeholder="e.g. Legal Services" value="${c ? c.name : ''}"></div>
    <div id="customTypeField" style="display:${currentType==='other' ? 'block' : 'none'}" class="field">
      <label>${t('customTypeNameLabel')}</label><input id="cfCustomTypeName" placeholder="${t('customTypeNamePlaceholder')}" value="${c && c.customTypeName || ''}">
      <div class="hint">${t('customTypeNameHint')}</div>
    </div>
    <input type="hidden" id="cfGroup" value="${c ? c.group : 'marketplace'}">
    <input type="hidden" id="cfFulfillment" value="${c ? c.fulfillment : 'download'}">
    <details style="margin:14px 0;">
      <summary style="cursor:pointer;color:var(--text-dim);font-size:13px;">${t('advancedOptionsLabel')}</summary>
      <div style="margin-top:12px;">
        <div class="field"><label>${t('descriptionLabel')}</label><textarea id="cfDesc" rows="2">${c ? c.description || '' : ''}</textarea></div>
        <div class="field"><label>${t('marketplaceListingTagLabel')}</label><select id="cfPlatformCategory">
          ${PLATFORM_CATEGORIES.map(pc => `<option value="${pc}" ${c && c.platformCategory===pc ? 'selected' : (!c && pc==='Other' ? 'selected' : '')}>${pc}</option>`).join('')}
        </select><div class="hint">${t('marketplaceTagHint')}</div></div>
        <div id="pickupField" style="display:${currentType==='physical' ? 'block' : 'none'}" class="field">
          <label><input type="checkbox" id="cfAllowPickup" ${c && c.allowPickup ? 'checked' : ''} style="width:auto;display:inline;margin-right:6px;">${t('allowPickupLabel')}</label>
          <div class="hint">${t('allowPickupHint')}</div>
        </div>
        <div id="downloadFields" style="display:${currentType==='digital' ? 'grid' : 'none'}" class="row2">
          <div class="field"><label>${t('downloadWindowLabel')}</label><input id="cfWindow" type="number" value="${c && c.downloadWindowHours || 72}"></div>
          <div class="field"><label>${t('maxDownloadsLabel')}</label><input id="cfMax" type="number" value="${c && c.maxDownloads || 1}"></div>
        </div>
        ${translationFieldsHtml('cf', existingLangs)}
      </div>
    </details>
    <button class="btn full" onclick="saveCategory(${id ? `'${id}'` : null})">${id ? t('save') : t('addCategoryTitle')}</button>`;
  openModal('genericOverlay');
}
function onCategoryTypeChange() {
  const type = document.getElementById('cfType').value;
  const mapping = { digital: { group: 'marketplace', fulfillment: 'download' }, physical: { group: 'store', fulfillment: 'shipping' }, services: { group: 'marketplace', fulfillment: 'booking' }, other: { group: 'other', fulfillment: 'manual' } };
  document.getElementById('cfGroup').value = mapping[type].group;
  document.getElementById('cfFulfillment').value = mapping[type].fulfillment;
  document.getElementById('customTypeField').style.display = type === 'other' ? 'block' : 'none';
  document.getElementById('pickupField').style.display = type === 'physical' ? 'block' : 'none';
  document.getElementById('downloadFields').style.display = type === 'digital' ? 'grid' : 'none';
}
async function saveCategory(id) {
  const translations = collectTranslationsPayload('cf', [['name', 'cfNameTrans'], ['description', 'cfDescTrans']]);
  if (id) {
    const body = { name: document.getElementById('cfName').value, description: document.getElementById('cfDesc').value, platformCategory: document.getElementById('cfPlatformCategory').value, translations };
    if (document.getElementById('downloadFields').style.display !== 'none') {
      body.downloadWindowHours = parseInt(document.getElementById('cfWindow').value);
      body.maxDownloads = parseInt(document.getElementById('cfMax').value);
    }
    if (document.getElementById('pickupField').style.display !== 'none') body.allowPickup = document.getElementById('cfAllowPickup').checked;
    if (document.getElementById('customTypeField').style.display !== 'none') body.customTypeName = document.getElementById('cfCustomTypeName').value;
    await api(`/api/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  } else {
    const body = { name: document.getElementById('cfName').value, group: document.getElementById('cfGroup').value,
      fulfillment: document.getElementById('cfFulfillment').value, description: document.getElementById('cfDesc').value, translations,
      platformCategory: document.getElementById('cfPlatformCategory').value, allowPickup: document.getElementById('cfAllowPickup').checked,
      customTypeName: document.getElementById('cfCustomTypeName').value,
      downloadWindowHours: parseInt(document.getElementById('cfWindow').value), maxDownloads: parseInt(document.getElementById('cfMax').value) };
    await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(body) });
  }
  const { categories } = await api('/api/categories'); state.categories = categories;
  closeModal('genericOverlay'); renderAdminTab();
}
async function deleteCategory(id) {
  if (!confirm(t('deleteCategoryConfirm'))) return;
  try {
    await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
    const { categories } = await api('/api/categories'); state.categories = categories;
    renderAdminTab();
  } catch (e) { alert(e.message); }
}
function openEmployeeForm() {
  document.getElementById('genericModalContent').innerHTML = `
    <h3>Add staff account</h3>
    <div class="field"><label>${t('nameCol')}</label><input id="efName"></div>
    <div class="field"><label>${t('emailCol')}</label><input id="efEmail" type="email"></div>
    <div class="field"><label>${t('password')}</label><input id="efPass" type="password"></div>
    <div class="field"><label>${t('roleCol')}</label><select id="efRole"><option value="employee">${t('employeeRoleOpt')}</option><option value="admin">${t('adminRoleOpt')}</option></select></div>
    <button class="btn full" onclick="saveEmployee()">${t('addAccountBtn')}</button>`;
  openModal('genericOverlay');
}
async function saveEmployee() {
  await api('/api/admin/employees', { method: 'POST', body: JSON.stringify({ name: document.getElementById('efName').value, email: document.getElementById('efEmail').value, password: document.getElementById('efPass').value, role: document.getElementById('efRole').value }) });
  closeModal('genericOverlay'); renderAdminTab();
}
async function deleteUser(id) {
  if (!confirm('Delete this account? This cannot be undone.')) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    renderAdminTab();
  } catch (e) { alert(e.message); }
}
