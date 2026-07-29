/* ---------------- cross-subdomain language cookie ----------------
   localStorage is isolated per-origin — localhost:3001 and demo.localhost:3001
   never actually shared a value there, even though it looked like they should.
   A cookie scoped to the shared parent domain is what makes one language
   choice apply everywhere. This uses a naive "last two labels" rule for
   real domains (acme.hadam.com -> hadam.com) plus a special case for local
   *.localhost testing — not a full public-suffix-list implementation, but
   correct for the domain shapes this project actually uses. */
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
  // URL param wins (explicit cross-site link) > shared cookie (cross-subdomain,
  // but *.localhost cookie scoping is inconsistent across browsers) > localStorage
  // (always reliable same-origin, so a same-page reload never silently reverts to English).
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  const lang = SUPPORTED_LANGS.includes(fromUrl) ? fromUrl : (getCookie('hadam_lang') || localStorage.getItem('hadam_lang') || 'en');
  setCookie('hadam_lang', lang);
  localStorage.setItem('hadam_lang', lang);
  return lang;
}

let state = { token: localStorage.getItem('hadam_super_token') || null, user: null, baseDomain: 'hadam.com', marketCategory: 'All', marketSearch: '', lang: detectInitialLang() };
const PLATFORM_CATEGORIES = ['Design', 'Education', 'Stationery', 'Electronics', 'Books', 'Food & Drink', 'Software', 'Accessories', 'Other'];

const I18N = {
  en: {
    home: 'Home', marketplaceStores: 'Marketplace & Stores', sellOnHadam: 'Sell on Hadam', contact: 'Contact', langToggle: 'العربية',
    superadminLogin: 'Superadmin log in',
    heroEyebrow: 'Global digital store & multi-tenant marketplace platform',
    heroH1: 'Every store gets its own subdomain. We run the infrastructure.',
    heroP: "Hadam is the platform — auth, catalog, cart, checkout, and fulfillment, shared by every tenant. Your store lives at <strong>yourname.hadam.com</strong> and starts with a blank catalog: you decide what you sell and how it's categorized.",
    browseMarketplaceBtn: 'Browse the marketplace', getOwnStoreBtn: 'Get your own store',
    shopPanelH3: 'Looking to shop, or manage a store you already have?',
    shopPanelP: `This page (the Hadam homepage) is <strong>not</strong> where clients, employees, or store admins log in.
        Every store has its own address and its own login — go to <strong>yourname.hadam.com</strong>
        (or <code>yourname.localhost:3000</code> in local testing) and log in there.
        The "Superadmin log in" button above is only for Hadam's own platform staff, who oversee the directory
        of stores below — it has no access to any store's products, orders, or customers.`,
    marketSearchPlaceholder: 'Search products across every store…', sellerStoresH3: 'Seller stores',
    wantOwnStoreP: 'Want your own store? Get a subdomain like <code>yourname.hadam.store</code>.',
    createStoreH3: 'Create your store', subdomainLabel: 'Subdomain', subdomainPlaceholder: 'yourstore',
    storeNameLabel: 'Store name', storeNamePlaceholder: 'Your Store Ltd', whatDoYouWantLabel: 'What do you want?',
    planStoreOption: "Just a store — sell anything, on your own subdomain, not listed on Hadam's Marketplace",
    planMarketOption: "List on Hadam's Marketplace — reach shoppers browsing across every store",
    planBothOption: "Both — your own store, and listed on Hadam's Marketplace",
    planHint: "This doesn't limit what you can sell — every plan can list physical products, digital downloads, or bookable services. It only decides whether your store also appears in Hadam's shared Marketplace & Stores directory, alongside every other store.",
    tierLabelForm: 'Subscription tier', tierHintForm: 'You can change this anytime later from Admin → Store Settings.',
    cardNumber: 'Card number', expiry: 'Expiry', cvv: 'CVV',
    signupPaymentHint: 'Simulated payment. Use 4111 1111 1111 1111 for success or 0000 0000 0000 0000 to preview a decline.',
    yourNameLabel: 'Your name', email: 'Email', password: 'Password', passwordPlaceholder: 'At least 6 characters',
    createStoreBtn: 'Create store', howItWorksH3: 'How it works',
    howItWorksP: `1. Pick a subdomain and a plan — Store, Marketplace, or both.<br>
          2. You become the store's Admin — add your own categories and products.<br>
          3. Invite Employees (or additional Admins) to help fulfil orders and bookings.<br>
          4. Clients register on your subdomain and shop only your catalog.<br><br>
          Every store's data — users, catalog, orders — is fully isolated from every other store.`,
    contactMessageLabel: 'Message', contactMessagePlaceholder: 'Question about a store, a listing, or the platform itself…',
    send: 'Send', contactHint: "For an order, a return, or anything about a specific store's products — contact that store directly from its own site instead; this goes to the Hadam platform team.",
    footerText: `Hadam Marketplace — the global digital store and multi-tenant marketplace platform. © ${new Date().getFullYear()} Hadam Marketplace. All rights reserved.`,
    superadminOnlyHint: "This is for Hadam platform staff only — not for store owners, employees, or clients. Those log in at their own store's subdomain instead.",
    logIn: 'Log in', logout: 'Log out', logInAsSuperadmin: 'Log in as superadmin to view tenants.',
    allTenants: 'All tenants', store: 'Store', plan: 'Plan', revenue: 'Revenue', products: 'Products', orders: 'Orders',
    users: 'Users', status: 'Status', suspend: 'Suspend', activate: 'Activate',
    noProductsMatch: 'No products match yet.', noStoresYet: 'No stores yet — be the first.', noTagline: 'No tagline yet.',
    storeReady: 'is ready', storeAddressLabel: "Your store's address:", localTestingNote: 'Local testing note: without real DNS, use',
    contactSent: "Sent — thanks, we'll get back to you.", yourStorePreview: 'Your store', productSingular: 'product', productPlural: 'products',
  },
  ar: {
    home: 'الرئيسية', marketplaceStores: 'السوق والمتاجر', sellOnHadam: 'البيع على هدام', contact: 'اتصل بنا', langToggle: 'English',
    superadminLogin: 'تسجيل دخول المشرف العام',
    heroEyebrow: 'متجر رقمي عالمي ومنصة سوق متعددة المستأجرين',
    heroH1: 'كل متجر يحصل على نطاقه الفرعي الخاص. نحن ندير البنية التحتية.',
    heroP: 'هدام هي المنصة — المصادقة، الكتالوج، السلة، الدفع، والتنفيذ، مشتركة بين جميع المتاجر. متجرك يعيش على <strong>yourname.hadam.com</strong> ويبدأ بكتالوج فارغ: أنت من يقرر ماذا تبيع وكيف يُصنَّف.',
    browseMarketplaceBtn: 'تصفح السوق', getOwnStoreBtn: 'احصل على متجرك الخاص',
    shopPanelH3: 'تريد التسوق، أو إدارة متجر تملكه بالفعل؟',
    shopPanelP: `هذه الصفحة (الصفحة الرئيسية لهدام) <strong>ليست</strong> مكان تسجيل دخول العملاء أو الموظفين أو مديري المتاجر.
        كل متجر له عنوانه الخاص وتسجيل دخوله الخاص — اذهب إلى <strong>yourname.hadam.com</strong>
        (أو <code>yourname.localhost:3000</code> عند الاختبار المحلي) وسجّل الدخول هناك.
        زر "تسجيل دخول المشرف العام" أعلاه مخصص فقط لموظفي منصة هدام أنفسهم، الذين يشرفون على دليل
        المتاجر أدناه — وليس له أي وصول إلى منتجات أو طلبات أو عملاء أي متجر.`,
    marketSearchPlaceholder: 'ابحث عن منتجات في كل المتاجر…', sellerStoresH3: 'متاجر البائعين',
    wantOwnStoreP: 'تريد متجرك الخاص؟ احصل على نطاق فرعي مثل <code>yourname.hadam.store</code>.',
    createStoreH3: 'أنشئ متجرك', subdomainLabel: 'النطاق الفرعي', subdomainPlaceholder: 'yourstore',
    storeNameLabel: 'اسم المتجر', storeNamePlaceholder: 'اسم متجرك', whatDoYouWantLabel: 'ماذا تريد؟',
    planStoreOption: 'متجر فقط — بِع أي شيء، على نطاقك الفرعي الخاص، دون إدراجه في سوق هدام',
    planMarketOption: 'أدرج على سوق هدام — تواصل مع المتسوقين الذين يتصفحون كل المتاجر',
    planBothOption: 'كلاهما — متجرك الخاص، ومُدرَج على سوق هدام',
    planHint: 'هذا لا يحدد ماذا يمكنك أن تبيع — كل خطة يمكنها عرض منتجات مادية، أو تنزيلات رقمية، أو خدمات قابلة للحجز. هو فقط يحدد ما إذا كان متجرك سيظهر أيضًا في دليل سوق ومتاجر هدام المشترك، جنبًا إلى جنب مع كل متجر آخر.',
    tierLabelForm: 'خطة الاشتراك', tierHintForm: 'يمكنك تغيير هذا لاحقًا من الإدارة ← إعدادات المتجر.',
    cardNumber: 'رقم البطاقة', expiry: 'تاريخ الانتهاء', cvv: 'رمز الأمان',
    signupPaymentHint: 'دفعة محاكاة. استخدم 4111 1111 1111 1111 للنجاح أو 0000 0000 0000 0000 لمعاينة الرفض.',
    yourNameLabel: 'اسمك', email: 'البريد الإلكتروني', password: 'كلمة المرور', passwordPlaceholder: 'على الأقل 6 أحرف',
    createStoreBtn: 'أنشئ المتجر', howItWorksH3: 'كيف يعمل هذا',
    howItWorksP: `1. اختر نطاقًا فرعيًا وخطة — متجر، سوق، أو كلاهما.<br>
          2. تصبح مديرًا للمتجر — أضف فئاتك ومنتجاتك الخاصة.<br>
          3. ادعُ موظفين (أو مديرين إضافيين) للمساعدة في تنفيذ الطلبات والحجوزات.<br>
          4. يسجّل العملاء في نطاقك الفرعي ويتسوقون من كتالوجك فقط.<br><br>
          بيانات كل متجر — المستخدمون، الكتالوج، الطلبات — معزولة تمامًا عن كل متجر آخر.`,
    contactMessageLabel: 'الرسالة', contactMessagePlaceholder: 'سؤال عن متجر، أو قائمة، أو المنصة نفسها…',
    send: 'إرسال', contactHint: 'لأي طلب أو استرجاع أو أي شيء يخص منتجات متجر معين — تواصل مع ذلك المتجر مباشرة من موقعه؛ هذا النموذج يصل إلى فريق منصة هدام.',
    footerText: `سوق هدام — المتجر الرقمي العالمي ومنصة السوق متعددة المستأجرين. © ${new Date().getFullYear()} سوق هدام. جميع الحقوق محفوظة.`,
    superadminOnlyHint: 'هذا مخصص فقط لموظفي منصة هدام — وليس لأصحاب المتاجر أو الموظفين أو العملاء. هؤلاء يسجلون الدخول من نطاق متجرهم الخاص.',
    logIn: 'تسجيل الدخول', logout: 'تسجيل الخروج', logInAsSuperadmin: 'سجّل الدخول كمشرف عام لعرض المتاجر.',
    allTenants: 'كل المتاجر', store: 'المتجر', plan: 'الخطة', revenue: 'الإيرادات', products: 'المنتجات', orders: 'الطلبات',
    users: 'المستخدمون', status: 'الحالة', suspend: 'إيقاف', activate: 'تفعيل',
    noProductsMatch: 'لا توجد منتجات مطابقة بعد.', noStoresYet: 'لا توجد متاجر بعد — كن الأول.', noTagline: 'لا يوجد وصف بعد.',
    storeReady: 'جاهز', storeAddressLabel: 'عنوان متجرك:', localTestingNote: 'ملاحظة للاختبار المحلي: بدون DNS حقيقي، استخدم',
    contactSent: 'تم الإرسال — شكرًا، سنتواصل معك قريبًا.', yourStorePreview: 'متجرك', productSingular: 'منتج', productPlural: 'منتجات',
  },
  fr: {
    home: 'Accueil', marketplaceStores: 'Marketplace et boutiques', sellOnHadam: 'Vendre sur Hadam', contact: 'Contact', langToggle: 'Français',
    superadminLogin: 'Connexion superadmin',
    heroEyebrow: 'Boutique numérique mondiale et plateforme de marketplace multi-boutiques',
    heroH1: 'Chaque boutique a son propre sous-domaine. Nous gérons l\'infrastructure.',
    heroP: "Hadam est la plateforme — authentification, catalogue, panier, paiement et traitement des commandes, partagés par chaque boutique. Votre boutique vit sur <strong>yourname.hadam.com</strong> et commence avec un catalogue vide : vous décidez quoi vendre et comment le classer.",
    browseMarketplaceBtn: 'Parcourir le marketplace', getOwnStoreBtn: 'Créer votre boutique',
    shopPanelH3: 'Vous voulez acheter, ou gérer une boutique que vous possédez déjà ?',
    shopPanelP: `Cette page (la page d'accueil de Hadam) n'est <strong>pas</strong> l'endroit où les clients, employés, ou admins de boutique se connectent.
        Chaque boutique a sa propre adresse et sa propre connexion — allez sur <strong>yourname.hadam.com</strong>
        (ou <code>yourname.localhost:3000</code> en test local) et connectez-vous là-bas.
        Le bouton "Connexion superadmin" ci-dessus est réservé au personnel de la plateforme Hadam, qui supervise l'annuaire
        des boutiques ci-dessous — il n'a aucun accès aux produits, commandes, ou clients d'aucune boutique.`,
    marketSearchPlaceholder: 'Rechercher des produits dans toutes les boutiques…', sellerStoresH3: 'Boutiques vendeuses',
    wantOwnStoreP: 'Vous voulez votre propre boutique ? Obtenez un sous-domaine comme <code>yourname.hadam.store</code>.',
    createStoreH3: 'Créez votre boutique', subdomainLabel: 'Sous-domaine', subdomainPlaceholder: 'yourstore',
    storeNameLabel: 'Nom de la boutique', storeNamePlaceholder: 'Votre Boutique SARL', whatDoYouWantLabel: 'Que voulez-vous ?',
    planStoreOption: "Juste une boutique — vendez n'importe quoi, sur votre propre sous-domaine, non listée sur le Marketplace Hadam",
    planMarketOption: 'Être listé sur le Marketplace Hadam — atteignez des acheteurs qui parcourent toutes les boutiques',
    planBothOption: 'Les deux — votre propre boutique, et listée sur le Marketplace Hadam',
    planHint: "Cela ne limite pas ce que vous pouvez vendre — chaque offre peut proposer des produits physiques, des téléchargements numériques, ou des services réservables. Cela détermine seulement si votre boutique apparaît aussi dans l'annuaire partagé Marketplace & Boutiques de Hadam, aux côtés de chaque autre boutique.",
    tierLabelForm: "Offre d'abonnement", tierHintForm: 'Vous pouvez changer ceci à tout moment depuis Admin → Paramètres de la boutique.',
    cardNumber: 'Numéro de carte', expiry: "Date d'expiration", cvv: 'CVV',
    signupPaymentHint: 'Paiement simulé. Utilisez 4111 1111 1111 1111 pour réussir ou 0000 0000 0000 0000 pour voir un refus.',
    yourNameLabel: 'Votre nom', email: 'E-mail', password: 'Mot de passe', passwordPlaceholder: 'Au moins 6 caractères',
    createStoreBtn: 'Créer la boutique', howItWorksH3: 'Comment ça marche',
    howItWorksP: `1. Choisissez un sous-domaine et une offre — Boutique, Marketplace, ou les deux.<br>
          2. Vous devenez l'Admin de la boutique — ajoutez vos propres catégories et produits.<br>
          3. Invitez des Employés (ou des Admins supplémentaires) pour aider au traitement des commandes et réservations.<br>
          4. Les clients s'inscrivent sur votre sous-domaine et achètent uniquement dans votre catalogue.<br><br>
          Les données de chaque boutique — utilisateurs, catalogue, commandes — sont entièrement isolées de toute autre boutique.`,
    contactMessageLabel: 'Message', contactMessagePlaceholder: 'Question sur une boutique, une annonce, ou la plateforme elle-même…',
    send: 'Envoyer', contactHint: "Pour une commande, un retour, ou toute question sur les produits d'une boutique précise — contactez cette boutique directement depuis son propre site ; ce formulaire arrive à l'équipe de la plateforme Hadam.",
    footerText: `Hadam Marketplace — la boutique numérique mondiale et la plateforme de marketplace multi-boutiques. © ${new Date().getFullYear()} Hadam Marketplace. Tous droits réservés.`,
    superadminOnlyHint: "Ceci est réservé au personnel de la plateforme Hadam — pas aux propriétaires de boutique, employés, ou clients. Ceux-ci se connectent depuis le sous-domaine de leur propre boutique.",
    logIn: 'Connexion', logout: 'Déconnexion', logInAsSuperadmin: 'Connectez-vous en tant que superadmin pour voir les boutiques.',
    allTenants: 'Toutes les boutiques', store: 'Boutique', plan: 'Offre', revenue: 'Revenus', products: 'Produits', orders: 'Commandes',
    users: 'Utilisateurs', status: 'Statut', suspend: 'Suspendre', activate: 'Activer',
    noProductsMatch: 'Aucun produit ne correspond pour le moment.', noStoresYet: 'Aucune boutique pour le moment — soyez la première.', noTagline: 'Pas encore de description.',
    storeReady: 'est prête', storeAddressLabel: 'Adresse de votre boutique :', localTestingNote: 'Note pour le test local : sans DNS réel, utilisez',
    contactSent: 'Envoyé — merci, nous vous répondrons bientôt.', yourStorePreview: 'Votre boutique', productSingular: 'produit', productPlural: 'produits',
  },
};
function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }
function localized(obj, field) {
  if (!obj) return '';
  const t = obj.translations && obj.translations[state.lang];
  if (t && t[field]) return t[field];
  return obj[field] || '';
}
function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-placeholder')); });
}
function setLang(lang) {
  setCookie('hadam_lang', lang);
  localStorage.setItem('hadam_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  location.reload();
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

function go(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('#mainNav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  window.scrollTo({ top: 0 });
  if (view === 'super') renderSuper();
  if (view === 'marketplace') renderMarketplace();
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }

document.getElementById('cSub').addEventListener('input', e => {
  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  document.getElementById('subPreview').textContent = v ? `${t('yourStorePreview')}: ${v}.${state.baseDomain}` : '';
});

const CATEGORY_LABELS = {
  en: { All: 'All', Design: 'Design', Education: 'Education', Stationery: 'Stationery', Electronics: 'Electronics', Books: 'Books', 'Food & Drink': 'Food & Drink', Software: 'Software', Accessories: 'Accessories', Other: 'Other' },
  ar: { All: 'الكل', Design: 'تصميم', Education: 'تعليم', Stationery: 'قرطاسية', Electronics: 'إلكترونيات', Books: 'كتب', 'Food & Drink': 'طعام وشراب', Software: 'برمجيات', Accessories: 'إكسسوارات', Other: 'أخرى' },
  fr: { All: 'Tout', Design: 'Design', Education: 'Éducation', Stationery: 'Papeterie', Electronics: 'Électronique', Books: 'Livres', 'Food & Drink': 'Alimentation', Software: 'Logiciels', Accessories: 'Accessoires', Other: 'Autre' },
};
function catLabel(c) { return (CATEGORY_LABELS[state.lang] && CATEGORY_LABELS[state.lang][c]) || c; }
function siblingHostSuffix() {
  const parts = window.location.host.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : parts[0];
}
function storeLinkUrl(subdomain) { return `${window.location.protocol}//${subdomain}.${siblingHostSuffix()}?lang=${state.lang}`; }
const PLAN_LABELS = {
  en: { store: 'Store', marketplace: 'Marketplace', both: 'Store + Marketplace' },
  ar: { store: 'متجر', marketplace: 'سوق', both: 'متجر + سوق' },
  fr: { store: 'Boutique', marketplace: 'Marketplace', both: 'Boutique + Marketplace' },
};
function planLabel(p) { return (PLAN_LABELS[state.lang] && PLAN_LABELS[state.lang][p]) || p; }

/* ---------------- marketplace & stores (unified browse) ---------------- */
function setMarketCategory(c) { state.marketCategory = c; renderMarketplace(); }
function onMarketSearch(v) { state.marketSearch = v; renderMarketplace(); }
async function renderMarketplace() {
  document.getElementById('marketCatFilters').innerHTML = ['All', ...PLATFORM_CATEGORIES].map(c =>
    `<button class="chip ${state.marketCategory === c ? 'active' : ''}" onclick="setMarketCategory('${c}')">${catLabel(c)}</button>`).join('');

  const qs = new URLSearchParams();
  if (state.marketCategory !== 'All') qs.set('category', state.marketCategory);
  if (state.marketSearch) qs.set('q', state.marketSearch);
  const { products } = await api(`/api/platform/marketplace/products?${qs.toString()}`);
  const grid = document.getElementById('marketGrid');
  grid.innerHTML = products.length === 0 ? `<div class="empty" style="grid-column:1/-1">${t('noProductsMatch')}</div>` :
    products.map(p => `
      <div class="card">
        <div class="card-thumb"><span class="tag">${catLabel(p.category.platformCategory)}</span>${p.category.fulfillment === 'shipping' ? '📦' : p.category.fulfillment === 'download' ? '📄' : p.category.fulfillment === 'booking' ? '🗓️' : '🛠️'}</div>
        <div class="card-body">
          <h3>${esc(localized(p,'name'))}</h3><p>${esc(localized(p,'description'))}</p>
          <div class="card-foot"><span class="price">$${p.price.toFixed(2)}</span>
            <a href="${storeLinkUrl(p.storeSubdomain)}" target="_blank" style="font-size:11.5px;color:var(--accent);">${esc((p.storeTranslations && p.storeTranslations[state.lang] && p.storeTranslations[state.lang].name) || p.storeName)} →</a></div>
        </div>
      </div>`).join('');

  const { stores, baseDomain } = await api('/api/platform/directory');
  document.getElementById('storesList').innerHTML = stores.length === 0 ? `<div class="empty">${t('noStoresYet')}</div>` :
    stores.map(s => `
      <div class="store-card">
        <h4>${esc(localized(s,'name'))} <span class="role-badge">${planLabel(s.plan)}</span></h4>
        <p class="tagline">${esc(localized(s,'tagline') || t('noTagline'))} · ${s.productCount} ${s.productCount === 1 ? t('productSingular') : t('productPlural')}</p>
        <a href="${storeLinkUrl(s.subdomain)}" target="_blank" style="font-family:var(--font-mono);color:var(--accent);font-size:13px;">${s.subdomain}.${siblingHostSuffix()}</a>
      </div>`).join('');
}

/* ---------------- sell on hadam ---------------- */
function toggleSignupPayment() {
  const tier = document.getElementById('cTier').value;
  document.getElementById('signupPaymentFields').style.display = tier === 'starter' ? 'none' : 'block';
}
async function createTenant() {
  const msg = document.getElementById('createMsg');
  try {
    const subdomain = document.getElementById('cSub').value.trim().toLowerCase();
    const data = await api('/api/platform/tenants', {
      method: 'POST',
      body: JSON.stringify({
        subdomain,
        storeName: document.getElementById('cName').value,
        plan: document.getElementById('cPlan').value,
        subscriptionTier: document.getElementById('cTier').value,
        card: { number: document.getElementById('cCardNum').value },
        adminName: document.getElementById('cAdminName').value,
        adminEmail: document.getElementById('cAdminEmail').value,
        adminPassword: document.getElementById('cAdminPass').value,
      }),
    });
    state.baseDomain = data.storeUrl.split('://')[1].split('.').slice(1).join('.');
    // The server's storeUrl uses its configured production domain (e.g. hadam.com), which
    // isn't a real, resolvable address during local testing — show the actual working link
    // (built from whatever host you're really on right now) as the primary, clickable one.
    const realLink = storeLinkUrl(subdomain);
    document.getElementById('resultContent').innerHTML = `
      <div class="panel" style="max-width:480px;margin:60px auto;text-align:center;">
        <h3>✓ ${esc(data.tenant.name)} ${t('storeReady')}</h3>
        <p style="color:var(--text-dim);font-size:14px;">Your store — click to open it now:</p>
        <a href="${realLink}" target="_blank" style="display:block;font-family:var(--font-mono);color:var(--accent);font-size:16px;margin-bottom:14px;">${esc(realLink)}</a>
        <div class="hint">Log in there with the admin email and password you just set. Your store starts with an empty catalog by design — add your categories and products from Admin.</div>
        <div class="hint" style="margin-top:10px;">In a real production deployment (not this local test), the same store would live at <code>${esc(data.storeUrl)}</code> once wildcard DNS for that domain is set up — that address won't work here since nothing is hosted there yet.</div>
      </div>`;
    go('result');
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* ---------------- contact ---------------- */
async function sendPlatformContact() {
  const msg = document.getElementById('contactMsg');
  try {
    await api('/api/platform/contact', { method: 'POST', body: JSON.stringify({ name: document.getElementById('ctName').value, email: document.getElementById('ctEmail').value, message: document.getElementById('ctMessage').value }) });
    msg.innerHTML = `<div class="msg success">${t('contactSent')}</div>`;
    document.getElementById('ctName').value = ''; document.getElementById('ctEmail').value = ''; document.getElementById('ctMessage').value = '';
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* ---------------- superadmin ---------------- */
function onAuthBtn() {
  if (state.user) { logout(); return; }
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('superadminLogin')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('superadminOnlyHint')}</div>
    <div id="authMsg"></div>
    <div class="field"><label>${t('email')}</label><input id="saEmail" type="email"></div>
    <div class="field"><label>${t('password')}</label><input id="saPass" type="password"></div>
    <button class="btn full" onclick="doSuperLogin()">${t('logIn')}</button>
    <div class="hint">Demo — <code>super@hadam.com / super123</code></div>`;
  openModal('authOverlay');
}
async function doSuperLogin() {
  const msgEl = () => document.getElementById('authMsg');
  try {
    const { user, token } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('saEmail').value, password: document.getElementById('saPass').value }) });
    state.user = user; state.token = token; localStorage.setItem('hadam_super_token', token);
    closeModal('authOverlay');
    document.getElementById('authBtn').textContent = t('logout');
    go('super');
  } catch (e) { msgEl().innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function logout() { state.user = null; state.token = null; localStorage.removeItem('hadam_super_token'); document.getElementById('authBtn').textContent = t('superadminLogin'); go('home'); }

async function renderSuper() {
  const el = document.getElementById('superContent');
  if (!state.user) { el.innerHTML = `<div class="empty">${t('logInAsSuperadmin')}</div>`; return; }
  const { tenants, baseDomain } = await api('/api/platform/tenants');
  state.baseDomain = baseDomain;
  el.innerHTML = `<h2 class="section-title">${t('allTenants')}</h2>
    <table><thead><tr><th>${t('store')}</th><th>${t('plan')}</th><th>${t('subdomainLabel')}</th><th>${t('revenue')}</th><th>${t('products')}</th><th>${t('orders')}</th><th>${t('users')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>
    ${tenants.map(tenant => `<tr>
      <td>${esc(tenant.name)}</td><td>${planLabel(tenant.plan)}</td><td><span style="font-family:var(--font-mono)">${esc(tenant.subdomain)}.${baseDomain}</span></td>
      <td>$${tenant.revenue.toFixed(2)}</td><td>${tenant.productCount}</td><td>${tenant.orderCount}</td><td>${tenant.userCount}</td>
      <td><span class="status-pill ${tenant.status === 'active' ? 'success' : 'failed'}">${tenant.status}</span></td>
      <td><button class="btn ghost sm" onclick="toggleTenant('${tenant.id}','${tenant.status}')">${tenant.status === 'active' ? t('suspend') : t('activate')}</button></td>
    </tr>`).join('')}</tbody></table>`;
}
async function toggleTenant(id, currentStatus) {
  await api(`/api/platform/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ status: currentStatus === 'active' ? 'suspended' : 'active' }) });
  renderSuper();
}

/* if already logged in as superadmin, jump straight to the dashboard */
(async function boot() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('langSelect').value = state.lang;
  applyStaticTranslations();
  if (state.token) {
    try { const { user } = await api('/api/auth/me'); state.user = user; document.getElementById('authBtn').textContent = t('logout'); go('super'); }
    catch { state.token = null; localStorage.removeItem('hadam_super_token'); }
  }
  const hashView = (window.location.hash || '').replace('#', '');
  if (['home', 'marketplace', 'sell', 'contact'].includes(hashView)) go(hashView);
  const planParam = new URLSearchParams(window.location.search).get('plan');
  if (['store', 'marketplace', 'both'].includes(planParam)) document.getElementById('cPlan').value = planParam;
})();
