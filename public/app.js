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
    yourCart: 'Your cart', emptyCart: 'Your cart is empty.', total: 'Total', checkout: 'Checkout', qtyLabel: 'Qty',
    howReceive: 'How do you want to receive this?', shipToAddress: 'Ship to an address', pickUpInStore: 'Pick up in store',
    shippingAddress: 'Shipping address', shippingAddressPlaceholder: 'Street, city, postcode', cardNumber: 'Card number', expiry: 'Expiry', cvv: 'CVV', cardholderNameLabel: 'Cardholder name',
    cardNumberRequiredError: 'A valid card number is required.', cardExpiryFormatError: 'Card expiry must be in MM/YY format.', cardCvvRequiredError: 'Card security code (CVV/CVC) is required.', cardCvvDigitsError: 'Card security code (CVV/CVC) must contain only digits.', cardCvvLengthError: 'Card security code (CVV/CVC) must be exactly 3 digits.', cardholderNameRequiredError: 'Cardholder name is required.', renewBtn: 'Renew', signupPaymentHint: 'Simulated payment. Use 4111 1111 1111 1111 for success or 0000 0000 0000 0000 to preview a decline.',
    helpIconAriaLabel: 'Help', helpWhatLabel: 'What to enter', helpWhyLabel: "Why it's needed", helpNextLabel: 'What happens next', helpRulesLabel: 'Requirements', helpErrorsLabel: 'If something goes wrong', helpMoreLabel: 'Need more help?', helpMoreText: 'See the', helpMoreTextEnd: 'page for the full guides.', helpNavLabel: 'Help',
    helpCheckoutCardWhat: 'Card number, expiry (MM/YY), CVV, and the cardholder name.', helpCheckoutCardWhy: 'Required to complete payment for this order — this environment simulates payment, nothing is actually charged.', helpCheckoutCardNext: "If the card is accepted, your order is placed immediately and you'll see a receipt. If it's declined, your cart is untouched and you can try again.", helpCheckoutCardRules: 'CVV must be exactly 3 digits. All four fields are required. Use 4111 1111 1111 1111 to simulate success, or 0000 0000 0000 0000 to preview a decline.', helpCheckoutCardErrors: "Check the red text under the specific field that's invalid. If the card is declined, try the success test number, or a different real card.",
    helpShipAddrWhat: 'The full delivery address for this order — street, city, and postcode.', helpShipAddrWhy: 'The store needs this to actually ship your physical items to you.', helpShipAddrNext: "Staff will use this address when they mark your order as shipped; you'll see delivery status updates in My Orders.",
    helpDeliveryConfirmWhat: 'Whether you actually received this delivered item.', helpDeliveryConfirmWhy: "This is tracked separately from the store's own \"delivered\" status — it's your own confirmation, so there's a clear record if there's ever a dispute.", helpDeliveryConfirmNext: '"Confirm Receipt" closes this out. "Report a Problem" notifies the store\'s staff immediately with your note.', helpDeliveryConfirmErrors: "If the item never arrived, is damaged, or is wrong, use \"Report a Problem\" instead of confirming — staff will follow up.",
    helpRefundPayBtnWhat: 'A payment method for where your refund should be sent — this can be a different card than the one you originally paid with.', helpRefundPayBtnWhy: 'Your original card details are never stored, so we need you to confirm a destination for the refund.', helpRefundPayBtnNext: "Once submitted, the refund is processed immediately — the item is marked refunded and you'll get a confirmation email.", helpRefundPayBtnRules: 'Only the last 4 digits of this card are ever stored, for reference — never the full number or CVV.',
    helpRequestRefundWhat: 'Your reason for requesting a refund.', helpRequestRefundWhy: 'This is shown to the store\'s staff so they can review your request.', helpRequestRefundNext: "The store's staff is notified immediately and will approve or reject your request, with a reason if rejected. You'll be emailed either way.", helpRequestRefundRules: 'A digital product that has already been downloaded can no longer be refunded.',
    helpFqStatusWhat: 'The current fulfillment status, and an optional tracking note for the customer.', helpFqStatusWhy: "This is what the customer sees on their own order — keeping it accurate avoids confusion and support requests.", helpFqStatusNext: 'Marking an item "delivered" automatically emails the customer, prompting them to confirm receipt.', helpFqStatusRules: 'Status must move forward in order (pending → processing → shipped → delivered) — it cannot be set backward from this form.',
    helpFqRefundWhat: 'Whether to approve or reject this customer\'s refund request.', helpFqRefundWhy: 'Every refund needs a human decision — this is never automatic.', helpFqRefundNext: 'Approving prompts the customer to confirm a refund payment method before it actually processes. Rejecting ends it immediately with your stated reason shown to the customer.', helpFqRefundRules: 'You\'ll be asked for a reason either way — it\'s especially important for a rejection, since the customer sees it.',
    helpRegEnabledWhat: 'Whether new customers can create their own account at your store.', helpRegEnabledWhy: 'Turning this off is useful for a private or invite-only store.', helpRegEnabledNext: 'Existing customer accounts are never affected — this only controls new sign-ups.',
    helpReqMfaWhat: 'Whether your store\'s admin and employee accounts must have two-factor authentication enabled to log in.', helpReqMfaWhy: 'Protects your store from someone logging in with just a stolen password.', helpReqMfaNext: 'Staff without MFA set up will be prompted to enable it the next time they log in.', helpReqMfaErrors: 'If a staff member is locked out after this is enabled, you can reset their MFA from the Employees section.',
    helpRenewButtonsWhat: 'Which subscription to renew — Store, Marketplace, or Both.', helpRenewButtonsWhy: 'Extends your current subscription period by 30 days from today (or from your current expiry, whichever is later).', helpRenewButtonsNext: "You'll be asked for payment details before anything changes. If your subscription still has more than a week left, the system will tell you a renewal isn't needed yet.", helpRenewButtonsRules: 'To switch tiers instead of just renewing, use Sale on Hadam and pick a different tier there — that\'s treated as an explicit plan change.',
    helpAdminProductsWhat: 'Your product catalog — name, price, images, and which category it belongs to.', helpAdminProductsWhy: "A product's category determines how it's fulfilled: shipped, downloaded, or booked as a service.", helpAdminProductsNext: 'New products appear in your storefront immediately once saved.', helpAdminProductsRules: "You can't add more products than your subscription tier's limit allows — check Admin → Settings for your current limit.",
    helpAdminCategoriesWhat: 'A grouping for your products that determines how orders for them are fulfilled.', helpAdminCategoriesWhy: "Fulfillment type (shipping, download, booking, or manual) drives the entire order lifecycle for every product in that category — it can't be changed per-product, only per-category.", helpAdminCategoriesNext: 'Products already using this category keep working; changes here only affect future orders and the category settings themselves.', helpAdminCategoriesRules: 'Category names must be unique within your store (case-insensitive).',
    helpAdminEmployeesWhat: 'The name, email, and password for a new staff account at your store.', helpAdminEmployeesWhy: 'Employees can access Fulfillment Queue to process orders, but not your store settings or billing.', helpAdminEmployeesNext: 'The new account can log in immediately with the password you set.', helpAdminEmployeesRules: 'One email can hold different roles at different stores — this only affects their role at this store specifically.', helpAdminEmployeesErrors: "If an employee is locked out of two-factor authentication, use \"Reset MFA\" next to their name rather than deleting their account.",
    helpEmailOtpWhat: 'The 6-digit verification code.', helpEmailOtpWhy: 'This confirms it\'s really you logging in, not just someone who has your password.', helpEmailOtpNext: 'The code is sent to your registered email address — the same one you use to log in. Enter it here to finish signing in.', helpEmailOtpRules: 'The code expires 10 minutes after it\'s sent, and can only be used once. If you don\'t see it within a minute or two, check your spam folder, or click "Resend code" below to get a new one.', helpEmailOtpErrors: 'An expired, already-used, or incorrect code shows a clear message telling you exactly which one it is — expired and used codes both just need a fresh one via "Resend code"; an incorrect code means double-checking what you typed.',
    helpCartWhat: 'The items you\'re about to buy, and how many of each.', helpCartWhy: 'Review everything here before entering payment details — quantities and items can still be changed at this stage.', helpCartNext: 'Clicking checkout takes you to payment; nothing is charged until you submit valid card details there.', helpCartRules: 'Quantity must be at least 1 for every item.',
    helpAdminStatsWhy: 'Net Revenue is your actual income: successful payments minus any refunds already processed. It does not include pending or failed orders.', helpAdminStatsNext: 'This updates automatically as new orders come in and refunds are processed — no action needed here.',
    helpAdminStatsRefundedWhy: 'This only counts refunds that have actually been completed and paid out — not pending requests still awaiting a staff decision, and not approved requests still waiting on the customer to confirm a payment method.', helpAdminStatsRefundedNext: 'To see refunds still in progress, check the Fulfillment Queue rather than this total.',
    helpFqSelfTestWhat: 'Nothing — this runs automatically once you click it, no input needed.', helpFqSelfTestWhy: 'Verifies the entire delivery-confirmation pipeline actually works end-to-end (status update, customer visibility, confirmation, dispute) using this real order item.', helpFqSelfTestNext: 'It temporarily changes this item\'s status and tracking note while testing, then automatically restores every value back to exactly what it was before — nothing about this order is permanently affected.', helpFqSelfTestRules: 'Safe to run on a real order at any time; it does not notify the customer or change what they see.',
    helpEmployeeOrdersWhy: 'This is a read-only view of every order at your store, regardless of status — useful for looking something up when you don\'t know which item is in the active Fulfillment Queue.', helpEmployeeOrdersNext: 'To actually update a status or tracking note, use the Fulfillment Queue tab instead — this view is for finding and refunding, not day-to-day processing.',
    pay: 'Pay', logInToCheckOut: 'Log in to check out', myOrdersTitle: 'My orders', noOrdersYet: 'No orders yet.',
    download: 'Download', downloadImageBtn: 'Download image', storesOnHadam: 'Stores on Hadam', saleOnHadam: 'Sale on Hadam',
    saleOnHadamBlurb: "Looking for more? Browse every store on Hadam's shared Marketplace.",
    logIn: 'Log in', createAccount: 'Create account', email: 'Email', password: 'Password', name: 'Name',
    setNewPasswordTitle: 'Set a new password', newPasswordLabel: 'New password', setNewPasswordBtn: 'Set password', passwordTooShort: 'Password must be at least 6 characters.', passwordResetSuccess: 'Password updated successfully. You can now log in with your new password.', checkEmailToConfirm: 'Check your email to confirm your account before logging in.', checkEmailForResetLink: 'If that account exists, a password reset link has been sent to that email. Click the link to set a new password.',
    disableBtn: 'Disable', emailOtpEnableBtn: 'Enable email code', emailOtpEnabledLabel: 'Email code enabled', emailOtpSectionHint: 'No authenticator app? Get a one-time code by email instead when logging in.', emailOtpSectionTitle: 'Email verification code',
    enterCardNumberPrompt: 'Enter a card number to upgrade (use 4111 1111 1111 1111 to succeed):', invalidRecoveryLinkMsg: 'This password reset link is invalid or has expired. Please request a new one.',
    mfaChooseMethodHint: "Choose how you'd like to verify it's you.", mfaEmailSendingHint: 'Sending a code to your email...', mfaEmailSentHint: 'Enter the code we just emailed you.',
    mfaMethodAuthenticatorApp: 'Authenticator app', mfaMethodEmail: 'Email code', mfaQrLoadErrorMsg: 'The QR code image failed to load — use the manual entry code below instead.',
    recoveryMfaRequiredHint: 'This account has two-factor authentication enabled — enter a code from your authenticator app to finish resetting your password.',
    recoveryMfaUnavailableMsg: 'Two-factor verification is required to reset this password, but no verified method could be found. Please contact support.',
    requestNewLinkBtn: 'Request a new link', resendCodeLink: 'Resend code',
    mfaMethodBackup: 'Backup code', backupCodeLoginHint: 'Enter one of your backup codes. Each one only works once.', backupCodeLabel: 'Backup code',
    backupCodesSectionTitle: 'Backup codes', backupCodesSectionHint: 'One-time codes to get in if you lose access to your authenticator app or email.',
    backupCodesNoPrimaryWarning: 'Backup codes are a fallback, not a login method on their own — enable the authenticator app or email code above first, or these codes will never be asked for at login.',
    resetMfaBtn: 'Reset MFA', resetMfaConfirm: 'This removes every MFA method (authenticator app, email code, and backup codes) for {name}, so they can log in with just their password and set up MFA again from scratch. Continue?', resetMfaSuccess: 'MFA has been reset for this account.', deleteUserConfirm: 'Delete this account? This cannot be undone.', tryAgainBtn: 'Try again', processingBtn: 'Processing…',
    backupCodesRemainingLabel: 'unused codes remaining', noBackupCodesLabel: 'No backup codes generated yet.', regenerateBackupCodesBtn: 'Regenerate codes', generateBackupCodesBtn: 'Generate backup codes',
    regenerateBackupCodesConfirm: 'This will invalidate any existing backup codes. Continue?', yourBackupCodesTitle: 'Your backup codes',
    backupCodesWarning: 'Save these somewhere safe — each code works once, and this is the only time they\'ll be shown.', downloadCodesBtn: 'Download as text file', doneBtn: 'Done',
    lostDeviceUseBackupLink: 'Lost your authenticator? Use a backup code', recoveryBackupCodeHint: 'Enter one of your backup codes, along with your new password.',
    confirmNewPasswordLabel: 'Confirm new password', passwordRequirementsHint: 'At least 8 characters, including a letter, a number, and a special character.', passwordTooShortStrong: 'Password must be at least 8 characters.', passwordNeedsLetterNumber: 'Password must include at least one letter and one number.', passwordNeedsSpecialChar: 'Password must include at least one special character (e.g. ! @ # $).', passwordsDontMatch: 'Passwords do not match.', passwordSameAsCurrentError: 'This is your current password — please choose a different one.', recoveryLinkExpiredDuringUse: 'Your recovery link session was lost — please request a new password reset link and try again promptly.',
    mfaPromptTitle: 'Two-factor verification', mfaPromptHint: 'Enter the 6-digit code from your authenticator app.', mfaCodeLabel: 'Verification code', verifyBtn: 'Verify',
    mfaSectionTitle: 'Two-factor authentication', mfaSectionHint: 'Add an extra layer of security using an authenticator app (like Google Authenticator or Microsoft Authenticator).', loadingLabel: 'Loading…',
    mfaEnabledLabel: 'Enabled', disableMfaBtn: 'Disable', mfaUnavailableHint: 'Two-factor authentication is not available right now.', enableMfaBtn: 'Enable two-factor authentication',
    disableMfaConfirm: 'Disable two-factor authentication for your account? This makes your account slightly less secure.',
    mfaScanHint: 'Scan this code with your authenticator app:', mfaManualEntryLabel: 'Or enter this code manually', mfaEnabledSuccessMsg: 'Two-factor authentication enabled successfully.',
    mfaSetupRequiredNotice: 'This store requires staff accounts to have two-factor authentication set up. Please set it up now to continue.',
    accessControlSectionTitle: 'Login & Registration', registrationEnabledLabel: 'Allow new customers to create accounts', requireMfaForStaffLabel: 'Require two-factor authentication for admin/employee accounts',
    accessSettingsSaved: 'Access settings saved.', supabaseManagedSettingsTitle: 'Platform-wide security settings', supabaseManagedSettingsHint: 'These apply to every store on Hadam and are managed directly in Supabase, not here — email confirmation requirements, password complexity rules, and redirect URLs.',
    securityAccessTab: 'Security & Access', appManagedSectionTitle: 'Store-managed settings', appManagedSectionHint: 'These are specific to your store and fully controlled here.',
    yourOwnAccountSecurityTitle: 'Your account security', yourOwnAccountSecurityHint: 'Set up two-factor authentication for your own admin login.', setUpYourOwnMfaBtn: 'Set up two-factor authentication',
    smSettingEmailConfirm: 'Email confirmation required for signup', smSettingPasswordRules: 'Password complexity rules', smSettingRedirectUrls: 'Allowed redirect URLs', smSettingMfaProviders: 'Available MFA methods', smManagedInSupabase: 'Managed in Supabase',
    openSupabaseAuthSettings: 'Open Supabase Auth settings',
    forgotPassword: 'Forgot password?', newAccount: 'New? Create a client account', haveAccount: 'Have an account? Log in',
    resetYourPassword: 'Reset your password', sendResetLink: 'Send reset link', backToLogin: 'Back to log in',
    chooseNewPassword: 'Choose a new password', resetCode: 'Reset code', newPassword: 'New password', setNewPassword: 'Set new password',
    stats: 'Stats', products: 'Products', categories: 'Categories', employees: 'Employees', orders: 'Orders',
    addCategory: '+ Add category', addProduct: '+ Add product', addEmployee: '+ Add employee', addStaffAccountH3: 'Add staff account', save: 'Save changes', add: 'Add',
    editProductTitle: 'Edit product', addProductTitle: 'Add product', editCategoryTitle: 'Edit category', addCategoryTitle: 'Add category',
    edit: 'Edit', delete: 'Delete', allOrdersPayments: 'All Orders & Payments', langToggle: 'العربية', dashboard: 'Admin dashboard',
    storeSettingsTab: 'Store Settings', reportsTab: 'Reports', digitalProductsTab: 'Digital Products',
    searchDigitalProductsPlaceholder: 'Search by product or category...', productCodeCol: 'Product Code', originalFileNameCol: 'Original File Name',
    fileTypeCol: 'File Type', fileSizeCol: 'File Size', uploadStatusCol: 'Upload Status', uploadDateCol: 'Upload Date', uploadedByCol: 'Uploaded By', downloadCountCol: 'Download Count', imageDownloadCountCol: 'Image Download Count',
    replaceFileBtn: 'Replace file', verifyDownloadBtn: 'Verify download', zipWrapperTag: 'ZIP', noDigitalProductsYetHint: 'No digital products in this store yet — add one from the Products page first.', manageFilesBtn: 'Manage file & image',
    deleteDigitalFileConfirm: 'Delete this file? Customers will no longer be able to buy or download this product until a new file is uploaded.',
    noFileWarningBadge: 'No file', noFileWarningTooltip: 'This digital product has no file — customers cannot buy it yet.',
    goToDigitalProductsHint: 'Product saved. Now go to Admin → Digital Products to upload its file.',
    productCodeLabel: 'Product Code (SKU)', productCodePermanentHint: 'Assigned automatically when this product was created — permanent, and cannot be changed.', productCodeAutoAssignedHint: 'A unique product code will be assigned automatically once you save this product.', searchProductsPlaceholder: 'Search by name or product code...',
    readyForSaleCol: 'Ready for Sale', readyForSaleYes: 'Ready', readyForSaleNo: 'Not ready', noCodeSetHint: 'No code set',
    groupStoreOpt: 'Store (physical)', groupMarketplaceOpt: 'Marketplace', fulfillShippingOpt: 'Physical (electronics, clothing, food, furniture...)',
    fulfillDownloadOpt: 'Digital (eBooks, software, courses, music, videos...)', fulfillBookingOpt: 'Services (education, healthcare, consulting, maintenance...)', fulfillManualOpt: 'Other (define your own category type)',
    customTypeNameLabel: 'What kind of category is this?', customTypeNamePlaceholder: 'e.g. Rentals, Subscriptions, Custom Orders',
    customTypeNameHint: "Since this doesn't fit Digital/Physical/Services, name it yourself — this is shown to your shoppers.",
    externalUrlLabel: 'External URL / demo link', externalUrlPlaceholder: 'https://...',
    meetingLinkLabel: 'Online meeting link (Zoom, Teams, etc.)', meetingLinkPlaceholder: 'https://zoom.us/j/...', meetingLinkHint: 'For any service delivered as an online meeting — courses, consultations, coaching, checkups, and more. Shown to the customer only after they purchase or book.', joinMeetingBtn: 'Join online meeting', meetingLinkAlsoEmailedHint: 'This link has also been emailed to you.', meetingLinkPendingHint: "A meeting link will be provided once available — we'll email it to you.",
    customerConfirmedReceivedLabel: 'Received by you', problemReportedLabel: 'Problem reported', confirmReceiptBtn: 'Confirm Receipt', reportProblemBtn: 'Report a Problem',
    confirmReceiptConfirm: 'I confirm that I received this order.', reportProblemPrompt: 'What went wrong? (e.g. never arrived, damaged, wrong item)',
    customerConfirmedReceivedLabelStaff: 'Customer confirmed receipt', customerReportedProblemLabelStaff: 'Customer reported a problem', awaitingCustomerConfirmationLabel: 'Awaiting customer confirmation',
    runTrackingSelfTestBtn: 'Run Tracking Status', runningTestHint: 'Running self-test...', selfTestPassed: 'All checks passed', selfTestFailed: 'A check failed',
    externalUrlHint: 'Optional — a link to a live demo, sample, or preview for this product/service.',
    productImagesLabel: 'Product images', uploadImageBtn: 'Upload image', noImagesYet: 'No images yet.', replaceImageBtn: 'Replace',
    digitalFileLabel: 'Digital file', currentFileLabel: 'Current file', noDigitalFileYet: 'No file uploaded yet — customers will see a placeholder until you add one.', uploadDigitalFileBtn: 'Upload file', digitalFileHint: 'The actual file customers download after buying this product (PDF, ZIP, etc.). Max 20MB.', fileFormatLabel: 'Format', fileSizeLabel: 'Size',
    digitalFileSectionTitle: 'Digital Product File', digitalFileSectionHint: 'The downloadable content itself — PDF, PowerPoint, video, audio, ZIP, or any other file type. This is what the customer receives after purchase, exactly as uploaded. Want to include a cover image or extra materials together? Zip them yourself first, then upload that single .zip file here — it will be delivered completely unchanged.',
    uploadSuccessBadge: 'Uploaded Successfully', deleteFileBtn: 'Delete File',
    looksLikeImageConfirm: 'This looks like an image file. This slot is for the downloadable product file — did you mean to upload it under "Product images" instead? Click OK to upload it here anyway, or Cancel to choose a different file.',
    productImagesSectionTitle: 'Product Images', productImagesSectionHint: 'Photos shown on the storefront to represent this product. Stored completely separately from the digital file above — images are never mixed with downloadable content.',
    digitalFileRequiredHint: 'Required — a digital product cannot be saved without its file attached.', digitalFileRequiredError: 'No file attached yet — customers will not be able to buy this product until one is uploaded.',
    optionalNowLabel: 'optional now, required before it can be sold', digitalFileOptionalHint: 'You can save this product now and upload the file afterward — useful for large files that take a while to upload. It cannot be purchased until a file is attached.',
    productSavedNowUploading: 'Product saved — now uploading the file...', productSavedButNotPurchasable: '(Product was saved, but is not yet purchasable.)',
    imageUploadHint: 'JPEG, PNG, GIF, WebP, TIFF, or SVG — up to 4MB per image.', saveProductFirstForImages: 'Save this product first, then edit it again to add images.',
    chooseFileFirst: 'Choose a file first.', unsupportedImageType: 'Unsupported image type — use JPEG, PNG, GIF, or WebP.',
    uploadingLabel: 'Uploading...', retryUploadBtn: 'Retry upload', largeFileNotice: 'This is a large file — using the resumable large-file upload process. If your connection drops, you can retry without starting over.',
    compressedFileNotice: 'This download is a ZIP file containing "{filename}" — after downloading, extract (unzip) it to get the file.',
    compressBeforeUploadLabel: 'Compress this file before uploading (recommended for large document collections)', compressingLabel: 'Compressing...', storedAsZipLabel: 'stored as a ZIP',
    deleteImageConfirm: 'Delete this image?', removeProductConfirm: 'Remove this product?', deleteCategoryConfirm: 'Delete this category?',
    categoryTypeLabel: 'Category Type', categoryTypeLockedHint: "Type can't be changed once a category exists — delete and recreate it instead.",
    fulfillmentType_shipping: 'Shipping', fulfillmentType_download: 'Download', fulfillmentType_booking: 'Booking', fulfillmentType_manual: 'Manual', fulfillmentType_other: 'Other',
    advancedOptionsLabel: 'Advanced options', marketplaceTagHint: "Used to surface your products on Hadam's cross-store marketplace browse page — optional, has a sensible default.",
    allowPickupLabel: 'Allow in-store pickup for this category', allowPickupHint: 'If checked, clients buying items in this category can choose "Pick up in store" instead of shipping, at checkout.',
    noCategoriesYetHint: 'Create a category first, from the Categories tab.',
    subExpiredBanner: 'Your subscription has expired. Renew below to restore full access.', renewNowBtn: 'Renew now',
    subExpiringBanner: 'Your subscription expires in {days} day(s). Renew below to avoid any interruption.',
    subscriptionH3: 'Subscription', subExpiresOnLabel: 'Expires on', subDaysRemaining: '{days} day(s) remaining', noActiveSubscriptionLabel: 'No active subscription found for this store yet.',
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
    autoTranslateBtn: 'Auto-translate', autoTranslateHint: 'Uses a free machine translation service — always review the result before saving, since automatic translations can be imperfect.', enterLangCodeFirst: 'Enter a language code first (e.g. ar, fr, es).', nothingToTranslate: 'There is no name or description to translate yet.', translatingLabel: 'Translating…', autoTranslateDoneMsg: 'Translated — please review before saving.',
    langCodeShortPlaceholder: 'ar, fr…', autoTranslateAllBtn: 'Auto-translate all', bulkTranslateConfirm: 'Auto-translate and save every item on this page into "{lang}" now? This saves immediately, without a review step — machine translation can be imperfect, so double-check important items afterward.', bulkTranslatingLabel: 'Translating everything — this may take a moment…', bulkTranslateDoneMsg: '{translated} translated, {skipped} already had this language.', bulkTranslateFailedMsg: '{count} could not be translated.',
    translateEntireStoreTitle: 'Translate entire store', translateEntireStoreHint: 'Translates and saves products, categories, and your store\'s own name/tagline/about text into one language, all in a single action — instead of visiting each page separately. Built-in interface text (buttons, menus) is already professionally translated and is not affected by this.',
    translateEntireStoreBtn: 'Translate entire store', translateEntireStoreConfirm: 'Auto-translate and save products, categories, and store info into "{lang}" now? This saves immediately, without a review step.', translatingScopeLabel: 'Translating {scope}…',
    alreadyHasLabel: 'already has', nameInLanguageLabel: 'Name in that language', descriptionInLanguageLabel: 'Description in that language',
    addStoreTranslationHint: "Optional — add your store's name, tagline, and about text in another language (any language you choose: Arabic, French, Spanish, etc.)",
    storeTranslationExplainer: "This is what lets Arabic (or any language) actually show for a store you set up yourself — it isn't filled in automatically.",
    storeNameInLanguageLabel: 'Store name in that language', taglineInLanguageLabel: 'Tagline in that language', aboutTextInLanguageLabel: 'About text in that language',
    planRemoveFromMarketplaceWarning: "This will remove your store from Hadam's shared Marketplace & Stores directory immediately — shoppers browsing the Marketplace will no longer find you there. Your own store link keeps working exactly as before. Continue?",
    planAddToMarketplaceWarning: "This will list your store on Hadam's shared Marketplace & Stores directory immediately — every product you have will become visible there. Continue?",
    planChangeGenericWarning: "Change your store's plan? This takes effect immediately.", savedMsg: 'Saved.',
    planLabelForm: 'Plan', employeeRoleOpt: 'Employee', adminRoleOpt: 'Admin',
    refundRequestedStatus: 'Refund requested', requestRefundBtn: 'Request refund',
    stripePaymentsH3: 'Stripe payments', stripeIntroText: 'Connect your own Stripe account to accept card payments directly \u2014 customer payments go straight to your account, not through Hadam.', stripeConnectBtn: 'Connect Stripe', stripeContinueOnboardingBtn: 'Continue Stripe setup', stripeEnableAsPaymentMethod: 'Accept Stripe payments in this store', stripeStatus_not_connected: 'Not connected', stripeStatus_pending: 'Setup incomplete', stripeStatus_connected: 'Connected', stripeStatus_restricted: 'Action needed', stripeNotConnectedHint: 'Connect a Stripe account to start accepting card payments.', stripePendingHint: "You've started connecting Stripe, but setup isn't finished yet \u2014 continue where you left off.", stripeConnectedHint: 'Your Stripe account is fully connected and ready to accept payments.', stripeRestrictedHint: 'Stripe needs more information from you before this account can accept payments \u2014 continuing setup will show what\u2019s required.', stripeReturnMsg: "Welcome back \u2014 we're checking your Stripe connection status.", stripeRefreshMsg: 'That Stripe setup link expired. Click below to get a new one.',
    storeDetailsH3: 'Store details',
    alreadyDownloadedLabel: 'Downloaded', noRefundAfterDownloadHint: 'Not eligible for refund — this digital product has already been downloaded.',
    languageCodeLabel: 'Language code', maxDownloadsLabel: 'Max downloads', descriptionLabel: 'Description',
    marketplaceListingTagLabel: 'Marketplace listing tag', downloadWindowLabel: 'Download window (hours)', addAccountBtn: 'Add account',
    paymentSuccessfulH3: 'Payment successful', awaitingPickupStatus: 'awaiting pickup readiness', pendingShipmentStatus: 'pending shipment',
    requestedStatus: 'requested', pendingStatus: 'pending', viewMyOrdersBtn: 'View my orders',
    fulfillmentOrdersH2: 'Fulfillment & orders', nothingToFulfill: 'Nothing to fulfill right now.',
    refundedByOn: 'Refunded by {by} on {date}', inStorePickupHint: 'In-store pickup — no shipping needed.',
    pickupNotePlaceholder: 'Pickup note', shipToLabel: 'Ship to:', trackingNotePlaceholder: 'Tracking note', notePlaceholder: 'Note',
    refundThisItemBtn: 'Refund this item', refundBtn: 'Refund', refundReasonPrompt: 'Reason for refund (optional):',
    confirmRefundPaymentBtn: 'Confirm refund payment method', refundPaymentHint: "Your refund has been approved. Please confirm where it should be sent — this can be a different card than the one you paid with.",
    submitRefundPaymentBtn: 'Submit', refundRejectedStatus: 'Refund request declined', refundRequestedByCustomerLabel: 'Refund requested by customer',
    reasonLabel: 'Reason', requestedAtLabel: 'Requested', approveRefundBtn: 'Approve', rejectRefundBtn: 'Reject',
    refundApprovedAwaitingPaymentLabel: 'Refund approved — awaiting customer payment confirmation', refundRejectedByStaffLabel: 'Refund rejected', rejectReasonPrompt: 'Reason for rejecting this refund:',
    currentPasswordLabel: 'Current password', newPasswordLabel: 'New password', atLeast6Chars: 'At least 6 characters',
    changePasswordBtn: 'Change password', deleteMyAccountBtn: 'Delete my account', deleteYourAccountH3: 'Delete your account',
    deleteAccountWarning: "This permanently removes your login. Your past orders stay on record (they already keep a copy of your name/email), but you won't be able to sign back in with this account.",
    confirmPasswordLabel: 'Confirm your password', permanentlyDeleteBtn: 'Permanently delete my account', cancelBtn: 'Cancel',
    passwordChangedMsg: 'Your password has been changed successfully.', passwordChangedDetail: 'Your password is now active. Continue using your current session, or sign in again on your other devices if needed.',
    securitySettingsTitle: 'Security Settings', signedInAsLabel: 'Signed in as', roleLabel: 'Role',
    roleAdministrator: 'Administrator', roleEmployee: 'Employee', roleCustomer: 'Customer', roleSuperadmin: 'Superadmin',
    passwordSectionTitle: 'Password', updatePasswordBtn: 'Update Password',
    checklistLength: 'At least 8 characters', checklistLetter: 'One letter', checklistNumber: 'One number', checklistSpecial: 'One special character',
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
    stockLabel: 'Stock (optional)', stockPlaceholder: 'Leave blank if not stock-tracked', stockHint: 'Only set this for physical items you want to track inventory for. Leave blank for digital items, services, or anything you don\'t need to count.',
    marketplaceTagCol: 'Marketplace tag', downloadsWord: 'download(s)', otherFallback: 'Other', accountsWord: 'accounts',
    emailCol: 'Email', roleCol: 'Role', youLabel: 'you', idCol: 'ID', clientCol: 'Client', itemsCol: 'Items', totalCol: 'Total',
    statusCol: 'Status', dateCol: 'Date', fromLabel: 'From', toLabel: 'To', presetToday: 'Today', presetWeek: 'Last 7 days',
    orderStatusLabel: 'Order status', orderStatus_pending: 'Pending', orderStatus_confirmed: 'Confirmed', orderStatus_processing: 'Processing', orderStatus_shipped: 'Shipped', orderStatus_delivered: 'Delivered', orderStatus_cancelled: 'Cancelled', orderStatus_refunded: 'Refunded',
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
    wantToRenewHint: 'Want to renew or extend this plan? Go to', settingsLinkLabel: 'Settings', confirmBtn: 'Confirm',
    currentPlanBadge: 'Current plan', perMonth: 'month', freeForever: 'Free forever',
    hadamCommission: 'Hadam commission', perSale: 'per sale',
    fSubdomain: 'Your subdomain store', fUpTo10: 'Up to 10 products', fUpTo100: 'Up to 100 products', fUnlimited: 'Unlimited products',
    fBasicDashboard: 'Basic seller dashboard', fFullDashboard: 'Full seller dashboard',
    fEmailSupport: 'Email support', fPriorityEmailSupport: 'Priority email support', f247Support: '24/7 priority support',
    fStandardAnalytics: 'Standard analytics', fAdvancedAnalytics: 'Advanced analytics',
    fCustomBranding: 'Custom branding', fCustomStoreBranding: 'Custom store branding', fPrioritySupport: 'Priority support',
    fAPIAccess: 'API access', fFullAPIAccess: 'Full API access', fDedicatedManager: 'Dedicated account manager',
    pricingDisclaimer: "Prices, product limits, and commission rates shown here apply for a 30-day subscription period from the date of payment. Choosing a plan will prompt you for payment before anything changes.",
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
    storeFooterText: 'Powered by Hadam Marketplace — the global digital store and multi-tenant marketplace platform. © 2026 Hadam Marketplace. All rights reserved.',
  },
  ar: {
    home: 'الرئيسية', stores: 'المتاجر', myOrders: 'طلباتي', fulfillmentQueue: 'قائمة التنفيذ', admin: 'الإدارة',
    login: 'تسجيل الدخول', logout: 'تسجيل الخروج', cart: 'السلة', browse: 'تصفح', browseCatalog: 'تصفح المنتجات',
    yourCart: 'سلتك', emptyCart: 'سلتك فارغة.', total: 'الإجمالي', checkout: 'إتمام الشراء', qtyLabel: 'الكمية',
    howReceive: 'كيف تريد استلام هذا؟', shipToAddress: 'الشحن إلى عنوان', pickUpInStore: 'الاستلام من المتجر',
    shippingAddress: 'عنوان الشحن', shippingAddressPlaceholder: 'الشارع، المدينة، الرمز البريدي', cardNumber: 'رقم البطاقة', expiry: 'تاريخ الانتهاء', cvv: 'رمز الأمان', cardholderNameLabel: 'اسم حامل البطاقة',
    cardNumberRequiredError: 'رقم بطاقة صالح مطلوب.', cardExpiryFormatError: 'يجب أن يكون تاريخ انتهاء البطاقة بصيغة شهر/سنة.', cardCvvRequiredError: 'رمز أمان البطاقة (CVV/CVC) مطلوب.', cardCvvDigitsError: 'يجب أن يحتوي رمز أمان البطاقة (CVV/CVC) على أرقام فقط.', cardCvvLengthError: 'يجب أن يتكون رمز أمان البطاقة (CVV/CVC) من 3 أرقام بالضبط.', cardholderNameRequiredError: 'اسم حامل البطاقة مطلوب.', renewBtn: 'تجديد', signupPaymentHint: 'دفع محاكى. استخدم 4111 1111 1111 1111 للنجاح أو 0000 0000 0000 0000 لمعاينة الرفض.',
    helpIconAriaLabel: 'مساعدة', helpWhatLabel: 'ما الذي يجب إدخاله', helpWhyLabel: 'لماذا هذا مطلوب', helpNextLabel: 'ماذا يحدث بعد ذلك', helpRulesLabel: 'المتطلبات', helpErrorsLabel: 'إذا حدث خطأ ما', helpMoreLabel: 'تحتاج مساعدة إضافية؟', helpMoreText: 'راجع صفحة', helpMoreTextEnd: 'للاطلاع على الأدلة الكاملة.', helpNavLabel: 'مساعدة',
    helpCheckoutCardWhat: 'رقم البطاقة، تاريخ الانتهاء (شهر/سنة)، رمز الأمان (CVV)، واسم حامل البطاقة.', helpCheckoutCardWhy: 'مطلوب لإتمام الدفع لهذا الطلب — هذه البيئة تحاكي الدفع، ولا يتم خصم أي مبلغ فعليًا.', helpCheckoutCardNext: 'إذا قُبلت البطاقة، يُنشأ طلبك فورًا وستظهر لك إيصال. إذا رُفضت، تبقى سلتك كما هي ويمكنك المحاولة مجددًا.', helpCheckoutCardRules: 'يجب أن يتكون رمز الأمان من 3 أرقام بالضبط. جميع الحقول الأربعة مطلوبة. استخدم 4111 1111 1111 1111 لمحاكاة النجاح، أو 0000 0000 0000 0000 لمعاينة الرفض.', helpCheckoutCardErrors: 'تحقق من النص الأحمر أسفل الحقل غير الصالح تحديدًا. إذا رُفضت البطاقة، جرّب رقم اختبار النجاح أو بطاقة حقيقية مختلفة.',
    helpShipAddrWhat: 'عنوان التسليم الكامل لهذا الطلب — الشارع، المدينة، والرمز البريدي.', helpShipAddrWhy: 'يحتاج المتجر هذا لشحن منتجاتك المادية إليك فعليًا.', helpShipAddrNext: 'سيستخدم الموظفون هذا العنوان عند تعليم طلبك كمشحون؛ ستشاهد تحديثات حالة التسليم في طلباتي.',
    helpDeliveryConfirmWhat: 'ما إذا كنت قد استلمت فعليًا هذا العنصر المُسلَّم.', helpDeliveryConfirmWhy: 'يُتبَّع هذا بشكل منفصل عن حالة "التسليم" الخاصة بالمتجر نفسه — إنه تأكيدك الخاص، لذا يوجد سجل واضح في حال وجود نزاع.', helpDeliveryConfirmNext: '"تأكيد الاستلام" يُنهي هذا. "الإبلاغ عن مشكلة" يُخطر موظفي المتجر فورًا بملاحظتك.', helpDeliveryConfirmErrors: 'إذا لم يصل العنصر مطلقًا، أو كان تالفًا، أو خاطئًا، استخدم "الإبلاغ عن مشكلة" بدلًا من التأكيد — سيتابع الموظفون الأمر.',
    helpRefundPayBtnWhat: 'طريقة دفع لوجهة استردادك — يمكن أن تكون بطاقة مختلفة عن التي دفعت بها أصلًا.', helpRefundPayBtnWhy: 'لا تُخزَّن بيانات بطاقتك الأصلية أبدًا، لذا نحتاج منك تأكيد وجهة للاسترداد.', helpRefundPayBtnNext: 'بمجرد الإرسال، يُعالَج الاسترداد فورًا — يُعلَّم العنصر كمُسترَد وستصلك رسالة تأكيد.', helpRefundPayBtnRules: 'يُخزَّن فقط آخر 4 أرقام من هذه البطاقة، للمرجعية — أبدًا الرقم الكامل أو رمز الأمان.',
    helpRequestRefundWhat: 'سبب طلبك للاسترداد.', helpRequestRefundWhy: 'يظهر هذا لموظفي المتجر لمراجعة طلبك.', helpRequestRefundNext: 'يُخطَر موظفو المتجر فورًا وسيوافقون على طلبك أو يرفضونه، مع سبب في حال الرفض. ستصلك رسالة بريد إلكتروني في الحالتين.', helpRequestRefundRules: 'المنتج الرقمي الذي تم تنزيله بالفعل لا يمكن استرداده بعد الآن.',
    helpFqStatusWhat: 'حالة التنفيذ الحالية، وملاحظة تتبع اختيارية للعميل.', helpFqStatusWhy: 'هذا ما يراه العميل في طلبه الخاص — الحفاظ على دقته يتجنب اللبس وطلبات الدعم.', helpFqStatusNext: 'تعليم عنصر كـ "تم التسليم" يرسل بريدًا إلكترونيًا للعميل تلقائيًا، ويطلب منه تأكيد الاستلام.', helpFqStatusRules: 'يجب أن تتقدم الحالة بالترتيب (معلق ← قيد المعالجة ← تم الشحن ← تم التسليم) — لا يمكن ضبطها للخلف من هذا النموذج.',
    helpFqRefundWhat: 'ما إذا كنت ستوافق على طلب استرداد هذا العميل أو ترفضه.', helpFqRefundWhy: 'كل استرداد يحتاج قرارًا بشريًا — هذا ليس تلقائيًا أبدًا.', helpFqRefundNext: 'الموافقة تطلب من العميل تأكيد طريقة دفع للاسترداد قبل أن تُعالَج فعليًا. الرفض ينهيها فورًا مع سببك المذكور والذي يظهر للعميل.', helpFqRefundRules: 'سيُطلَب منك سبب في كلتا الحالتين — وهو مهم بشكل خاص في حال الرفض، لأن العميل يراه.',
    helpRegEnabledWhat: 'ما إذا كان بإمكان العملاء الجدد إنشاء حسابهم الخاص في متجرك.', helpRegEnabledWhy: 'تعطيل هذا مفيد لمتجر خاص أو بالدعوة فقط.', helpRegEnabledNext: 'حسابات العملاء الحاليين لا تتأثر أبدًا — هذا يتحكم فقط في التسجيلات الجديدة.',
    helpReqMfaWhat: 'ما إذا كان يجب على حسابات المسؤول والموظفين في متجرك تفعيل التحقق بخطوتين لتسجيل الدخول.', helpReqMfaWhy: 'يحمي متجرك من تسجيل دخول أي شخص بكلمة مرور مسروقة فقط.', helpReqMfaNext: 'سيُطلَب من الموظفين غير المُفعَّل لديهم التحقق بخطوتين تفعيله عند تسجيل الدخول التالي.', helpReqMfaErrors: 'إذا أُقفل حساب موظف بعد تفعيل هذا، يمكنك إعادة تعيين التحقق بخطوتين الخاص به من قسم الموظفين.',
    helpRenewButtonsWhat: 'أي اشتراك تريد تجديده — المتجر، السوق، أو كلاهما.', helpRenewButtonsWhy: 'يمدد اشتراكك الحالي 30 يومًا من اليوم (أو من تاريخ انتهائه الحالي، أيهما لاحقًا).', helpRenewButtonsNext: 'سيُطلَب منك بيانات الدفع قبل أي تغيير. إذا كان اشتراكك لا يزال يتبقى منه أكثر من أسبوع، سيخبرك النظام أن التجديد غير ضروري بعد.', helpRenewButtonsRules: 'لتبديل الباقة بدلًا من مجرد التجديد، استخدم البيع على هدام واختر باقة مختلفة هناك — يُعامَل ذلك كتغيير خطة صريح.',
    helpAdminProductsWhat: 'كتالوج منتجاتك — الاسم، السعر، الصور، والفئة التي ينتمي إليها.', helpAdminProductsWhy: 'تحدد فئة المنتج كيفية تنفيذه: شحن، تنزيل، أو حجز كخدمة.', helpAdminProductsNext: 'تظهر المنتجات الجديدة في متجرك فورًا بعد الحفظ.', helpAdminProductsRules: 'لا يمكنك إضافة منتجات أكثر مما يسمح به حد باقة اشتراكك — راجع الإدارة ← الإعدادات لمعرفة حدك الحالي.',
    helpAdminCategoriesWhat: 'تجميع لمنتجاتك يحدد كيفية تنفيذ الطلبات الخاصة بها.', helpAdminCategoriesWhy: 'نوع التنفيذ (شحن، تنزيل، حجز، أو يدوي) يقود دورة حياة الطلب بأكملها لكل منتج في تلك الفئة — لا يمكن تغييره لكل منتج على حدة، فقط لكل فئة.', helpAdminCategoriesNext: 'المنتجات التي تستخدم هذه الفئة بالفعل تستمر بالعمل؛ التغييرات هنا تؤثر فقط على الطلبات المستقبلية وإعدادات الفئة نفسها.', helpAdminCategoriesRules: 'يجب أن تكون أسماء الفئات فريدة ضمن متجرك (بغض النظر عن حالة الأحرف).',
    helpAdminEmployeesWhat: 'الاسم والبريد الإلكتروني وكلمة المرور لحساب موظف جديد في متجرك.', helpAdminEmployeesWhy: 'يمكن للموظفين الوصول إلى قائمة التنفيذ لمعالجة الطلبات، لكن ليس إعدادات متجرك أو الفوترة.', helpAdminEmployeesNext: 'يمكن للحساب الجديد تسجيل الدخول فورًا بكلمة المرور التي حددتها.', helpAdminEmployeesRules: 'يمكن لبريد إلكتروني واحد أن يحمل أدوارًا مختلفة في متاجر مختلفة — هذا يؤثر فقط على دوره في هذا المتجر تحديدًا.', helpAdminEmployeesErrors: 'إذا أُقفل موظف عن التحقق بخطوتين، استخدم "إعادة تعيين التحقق بخطوتين" بجانب اسمه بدلًا من حذف حسابه.',
    helpEmailOtpWhat: 'الرمز المكون من 6 أرقام.', helpEmailOtpWhy: 'هذا يؤكد أنك فعلًا من يسجل الدخول، وليس مجرد شخص يملك كلمة مرورك.', helpEmailOtpNext: 'يُرسَل الرمز إلى عنوان بريدك الإلكتروني المسجَّل — نفس العنوان الذي تستخدمه لتسجيل الدخول. أدخله هنا لإتمام تسجيل الدخول.', helpEmailOtpRules: 'ينتهي صلاحية الرمز بعد 10 دقائق من إرساله، ويمكن استخدامه مرة واحدة فقط. إذا لم تره خلال دقيقة أو دقيقتين، تحقق من مجلد البريد العشوائي، أو انقر "إعادة إرسال الرمز" أدناه للحصول على رمز جديد.', helpEmailOtpErrors: 'الرمز المنتهي الصلاحية أو المستخدَم مسبقًا أو غير الصحيح يظهر برسالة واضحة تخبرك بالضبط أيها هو — الرمز المنتهي والمستخدَم يحتاجان فقط رمزًا جديدًا عبر "إعادة إرسال الرمز"؛ الرمز غير الصحيح يعني التحقق مما كتبته.',
    helpCartWhat: 'العناصر التي أنت على وشك شرائها، وكمية كل منها.', helpCartWhy: 'راجع كل شيء هنا قبل إدخال بيانات الدفع — لا يزال بإمكانك تغيير الكميات والعناصر في هذه المرحلة.', helpCartNext: 'النقر على إتمام الشراء يأخذك إلى الدفع؛ لا يُخصَم أي مبلغ حتى تُرسِل بيانات بطاقة صالحة هناك.', helpCartRules: 'يجب أن تكون الكمية 1 على الأقل لكل عنصر.',
    helpAdminStatsWhy: 'صافي الإيرادات هو دخلك الفعلي: المدفوعات الناجحة ناقص أي استردادات تمت معالجتها بالفعل. لا يشمل الطلبات المعلقة أو الفاشلة.', helpAdminStatsNext: 'يتحدث هذا تلقائيًا مع وصول طلبات جديدة ومعالجة الاستردادات — لا حاجة لأي إجراء هنا.',
    helpAdminStatsRefundedWhy: 'هذا يحسب فقط الاستردادات التي تمت واكتملت فعليًا ودُفعت — وليس الطلبات المعلقة التي لا تزال بانتظار قرار الموظف، وليس الطلبات الموافق عليها التي لا تزال بانتظار تأكيد العميل لطريقة الدفع.', helpAdminStatsRefundedNext: 'لرؤية الاستردادات التي لا تزال قيد التقدم، راجع قائمة التنفيذ بدلًا من هذا الإجمالي.',
    helpFqSelfTestWhat: 'لا شيء — يعمل هذا تلقائيًا بمجرد النقر عليه، لا حاجة لأي إدخال.', helpFqSelfTestWhy: 'يتحقق من أن مسار تأكيد التسليم بأكمله يعمل فعليًا من البداية إلى النهاية (تحديث الحالة، رؤية العميل، التأكيد، النزاع) باستخدام عنصر الطلب الحقيقي هذا.', helpFqSelfTestNext: 'يغيّر مؤقتًا حالة هذا العنصر وملاحظة التتبع أثناء الاختبار، ثم يستعيد تلقائيًا كل قيمة إلى ما كانت عليه بالضبط قبل ذلك — لا يتأثر شيء بشكل دائم في هذا الطلب.', helpFqSelfTestRules: 'آمن للتشغيل على طلب حقيقي في أي وقت؛ لا يُخطر العميل ولا يغيّر ما يراه.',
    helpEmployeeOrdersWhy: 'هذا عرض للقراءة فقط لكل طلب في متجرك، بغض النظر عن الحالة — مفيد للبحث عن شيء عندما لا تعرف أي عنصر موجود في قائمة التنفيذ النشطة.', helpEmployeeOrdersNext: 'لتحديث الحالة أو ملاحظة التتبع فعليًا، استخدم علامة تبويب قائمة التنفيذ بدلًا من ذلك — هذا العرض للبحث والاسترداد، وليس للمعالجة اليومية.',
    pay: 'ادفع', logInToCheckOut: 'سجّل الدخول لإتمام الشراء', myOrdersTitle: 'طلباتي', noOrdersYet: 'لا توجد طلبات بعد.',
    download: 'تحميل', downloadImageBtn: 'تنزيل الصورة', storesOnHadam: 'المتاجر على هدام', saleOnHadam: 'البيع على هدام',
    saleOnHadamBlurb: 'تريد المزيد؟ تصفح جميع المتاجر على سوق هدام المشترك.',
    logIn: 'تسجيل الدخول', createAccount: 'إنشاء حساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', name: 'الاسم',
    setNewPasswordTitle: 'تعيين كلمة مرور جديدة', newPasswordLabel: 'كلمة المرور الجديدة', setNewPasswordBtn: 'تعيين كلمة المرور', passwordTooShort: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.', passwordResetSuccess: 'تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.', checkEmailToConfirm: 'تحقق من بريدك الإلكتروني لتأكيد حسابك قبل تسجيل الدخول.', checkEmailForResetLink: 'إذا كان هذا الحساب موجودًا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى ذلك البريد الإلكتروني. انقر على الرابط لتعيين كلمة مرور جديدة.',
    disableBtn: 'تعطيل', emailOtpEnableBtn: 'تفعيل رمز البريد الإلكتروني', emailOtpEnabledLabel: 'رمز البريد الإلكتروني مُفعَّل', emailOtpSectionHint: 'ليس لديك تطبيق مصادقة؟ احصل على رمز لمرة واحدة عبر البريد الإلكتروني بدلاً من ذلك عند تسجيل الدخول.', emailOtpSectionTitle: 'رمز التحقق عبر البريد الإلكتروني',
    enterCardNumberPrompt: 'أدخل رقم بطاقة للترقية (استخدم 4111 1111 1111 1111 للنجاح):', invalidRecoveryLinkMsg: 'رابط إعادة تعيين كلمة المرور هذا غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.',
    mfaChooseMethodHint: 'اختر كيف تريد التحقق من هويتك.', mfaEmailSendingHint: 'جارٍ إرسال رمز إلى بريدك الإلكتروني...', mfaEmailSentHint: 'أدخل الرمز الذي أرسلناه للتو إلى بريدك الإلكتروني.',
    mfaMethodAuthenticatorApp: 'تطبيق المصادقة', mfaMethodEmail: 'رمز البريد الإلكتروني', mfaQrLoadErrorMsg: 'فشل تحميل صورة رمز الاستجابة السريعة — استخدم رمز الإدخال اليدوي أدناه بدلاً من ذلك.',
    recoveryMfaRequiredHint: 'هذا الحساب يحتوي على التحقق بخطوتين — أدخل رمزًا من تطبيق المصادقة الخاص بك لإنهاء إعادة تعيين كلمة المرور.',
    recoveryMfaUnavailableMsg: 'التحقق بخطوتين مطلوب لإعادة تعيين كلمة المرور هذه، ولكن تعذر العثور على طريقة تحقق مُفعَّلة. يرجى الاتصال بالدعم.',
    requestNewLinkBtn: 'طلب رابط جديد', resendCodeLink: 'إعادة إرسال الرمز',
    mfaMethodBackup: 'رمز احتياطي', backupCodeLoginHint: 'أدخل أحد رموزك الاحتياطية. كل رمز يعمل مرة واحدة فقط.', backupCodeLabel: 'رمز احتياطي',
    backupCodesSectionTitle: 'الرموز الاحتياطية', backupCodesSectionHint: 'رموز لمرة واحدة للدخول إذا فقدت الوصول إلى تطبيق المصادقة أو بريدك الإلكتروني.',
    backupCodesNoPrimaryWarning: 'الرموز الاحتياطية هي وسيلة احتياطية فقط، وليست وسيلة تسجيل دخول بحد ذاتها — فعّل تطبيق المصادقة أو رمز البريد الإلكتروني أعلاه أولاً، وإلا فلن يُطلب منك هذه الرموز أبدًا عند تسجيل الدخول.',
    resetMfaBtn: 'إعادة تعيين التحقق بخطوتين', resetMfaConfirm: 'سيؤدي هذا إلى إزالة كل وسائل التحقق بخطوتين (تطبيق المصادقة، رمز البريد الإلكتروني، والرموز الاحتياطية) لـ {name}، بحيث يمكنه تسجيل الدخول بكلمة المرور فقط وإعداد التحقق بخطوتين من جديد. متابعة؟', resetMfaSuccess: 'تمت إعادة تعيين التحقق بخطوتين لهذا الحساب.', deleteUserConfirm: 'حذف هذا الحساب؟ لا يمكن التراجع عن هذا.', tryAgainBtn: 'حاول مرة أخرى', processingBtn: 'جارٍ المعالجة...',
    backupCodesRemainingLabel: 'رموز غير مستخدمة متبقية', noBackupCodesLabel: 'لم يتم إنشاء رموز احتياطية بعد.', regenerateBackupCodesBtn: 'إعادة إنشاء الرموز', generateBackupCodesBtn: 'إنشاء رموز احتياطية',
    regenerateBackupCodesConfirm: 'سيؤدي هذا إلى إبطال أي رموز احتياطية موجودة. متابعة؟', yourBackupCodesTitle: 'رموزك الاحتياطية',
    backupCodesWarning: 'احفظ هذه في مكان آمن — كل رمز يعمل مرة واحدة، وهذه هي المرة الوحيدة التي ستظهر فيها.', downloadCodesBtn: 'تنزيل كملف نصي', doneBtn: 'تم',
    lostDeviceUseBackupLink: 'فقدت جهاز المصادقة؟ استخدم رمزًا احتياطيًا', recoveryBackupCodeHint: 'أدخل أحد رموزك الاحتياطية، مع كلمة المرور الجديدة.',
    confirmNewPasswordLabel: 'تأكيد كلمة المرور الجديدة', passwordRequirementsHint: 'يجب أن تتكون من 8 أحرف على الأقل، وتشمل حرفًا ورقمًا ورمزًا خاصًا.', passwordTooShortStrong: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.', passwordNeedsLetterNumber: 'يجب أن تحتوي كلمة المرور على حرف ورقم واحد على الأقل.', passwordNeedsSpecialChar: 'يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل (مثل ! @ # $).', passwordsDontMatch: 'كلمتا المرور غير متطابقتين.', passwordSameAsCurrentError: 'هذه كلمة مرورك الحالية — يرجى اختيار كلمة مرور مختلفة.', recoveryLinkExpiredDuringUse: 'فُقدت جلسة رابط الاسترداد — يرجى طلب رابط جديد لإعادة تعيين كلمة المرور والمحاولة على الفور.',
    mfaPromptTitle: 'التحقق بخطوتين', mfaPromptHint: 'أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة الخاص بك.', mfaCodeLabel: 'رمز التحقق', verifyBtn: 'تحقق',
    mfaSectionTitle: 'التحقق بخطوتين', mfaSectionHint: 'أضف طبقة إضافية من الأمان باستخدام تطبيق مصادقة (مثل Google Authenticator أو Microsoft Authenticator).', loadingLabel: 'جارٍ التحميل…',
    mfaEnabledLabel: 'مفعّل', disableMfaBtn: 'تعطيل', mfaUnavailableHint: 'التحقق بخطوتين غير متاح حاليًا.', enableMfaBtn: 'تفعيل التحقق بخطوتين',
    disableMfaConfirm: 'تعطيل التحقق بخطوتين لحسابك؟ هذا يجعل حسابك أقل أمانًا بعض الشيء.',
    mfaScanHint: 'امسح هذا الرمز باستخدام تطبيق المصادقة الخاص بك:', mfaManualEntryLabel: 'أو أدخل هذا الرمز يدويًا', mfaEnabledSuccessMsg: 'تم تفعيل التحقق بخطوتين بنجاح.',
    mfaSetupRequiredNotice: 'يتطلب هذا المتجر إعداد التحقق بخطوتين لحسابات الموظفين. يرجى إعداده الآن للمتابعة.',
    accessControlSectionTitle: 'تسجيل الدخول والتسجيل', registrationEnabledLabel: 'السماح للعملاء الجدد بإنشاء حسابات', requireMfaForStaffLabel: 'طلب التحقق بخطوتين لحسابات المسؤولين والموظفين',
    accessSettingsSaved: 'تم حفظ إعدادات الوصول.', supabaseManagedSettingsTitle: 'إعدادات الأمان على مستوى المنصة', supabaseManagedSettingsHint: 'تنطبق هذه الإعدادات على كل متجر على هدام وتُدار مباشرة في Supabase وليس هنا — متطلبات تأكيد البريد الإلكتروني وقواعد تعقيد كلمة المرور وعناوين إعادة التوجيه.',
    securityAccessTab: 'الأمان والوصول', appManagedSectionTitle: 'الإعدادات المُدارة من المتجر', appManagedSectionHint: 'هذه خاصة بمتجرك وتُدار بالكامل هنا.',
    yourOwnAccountSecurityTitle: 'أمان حسابك', yourOwnAccountSecurityHint: 'قم بإعداد التحقق بخطوتين لحساب تسجيل الدخول الخاص بك كمسؤول.', setUpYourOwnMfaBtn: 'إعداد التحقق بخطوتين',
    smSettingEmailConfirm: 'تأكيد البريد الإلكتروني مطلوب للتسجيل', smSettingPasswordRules: 'قواعد تعقيد كلمة المرور', smSettingRedirectUrls: 'عناوين إعادة التوجيه المسموح بها', smSettingMfaProviders: 'طرق التحقق بخطوتين المتاحة', smManagedInSupabase: 'تُدار في Supabase',
    openSupabaseAuthSettings: 'فتح إعدادات المصادقة في Supabase',
    forgotPassword: 'نسيت كلمة المرور؟', newAccount: 'جديد؟ أنشئ حساب عميل', haveAccount: 'لديك حساب؟ سجّل الدخول',
    resetYourPassword: 'إعادة تعيين كلمة المرور', sendResetLink: 'إرسال رابط إعادة التعيين', backToLogin: 'العودة لتسجيل الدخول',
    chooseNewPassword: 'اختر كلمة مرور جديدة', resetCode: 'رمز إعادة التعيين', newPassword: 'كلمة المرور الجديدة', setNewPassword: 'تعيين كلمة المرور',
    stats: 'الإحصائيات', products: 'المنتجات', categories: 'الفئات', employees: 'الموظفون', orders: 'الطلبات',
    addCategory: '+ إضافة فئة', addProduct: '+ إضافة منتج', addEmployee: '+ إضافة موظف', addStaffAccountH3: 'إضافة حساب موظف', save: 'حفظ التغييرات', add: 'إضافة',
    editProductTitle: 'تعديل المنتج', addProductTitle: 'إضافة منتج', editCategoryTitle: 'تعديل الفئة', addCategoryTitle: 'إضافة فئة',
    edit: 'تعديل', delete: 'حذف', allOrdersPayments: 'كل الطلبات والمدفوعات', langToggle: 'English', dashboard: 'لوحة تحكم الإدارة',
    storeSettingsTab: 'إعدادات المتجر', reportsTab: 'التقارير', digitalProductsTab: 'المنتجات الرقمية',
    searchDigitalProductsPlaceholder: 'ابحث بالمنتج أو الفئة...', productCodeCol: 'رمز المنتج', originalFileNameCol: 'اسم الملف الأصلي',
    fileTypeCol: 'نوع الملف', fileSizeCol: 'حجم الملف', uploadStatusCol: 'حالة الرفع', uploadDateCol: 'تاريخ الرفع', uploadedByCol: 'تم الرفع بواسطة', downloadCountCol: 'عدد التنزيلات', imageDownloadCountCol: 'عدد تنزيلات الصورة',
    replaceFileBtn: 'استبدال الملف', verifyDownloadBtn: 'التحقق من التنزيل', zipWrapperTag: 'ZIP', noDigitalProductsYetHint: 'لا توجد منتجات رقمية في هذا المتجر بعد — أضف واحدًا من صفحة المنتجات أولاً.', manageFilesBtn: 'إدارة الملف والصورة',
    deleteDigitalFileConfirm: 'حذف هذا الملف؟ لن يتمكن العملاء من شراء أو تنزيل هذا المنتج حتى يتم رفع ملف جديد.',
    noFileWarningBadge: 'لا يوجد ملف', noFileWarningTooltip: 'هذا المنتج الرقمي لا يحتوي على ملف — لا يمكن للعملاء شراؤه بعد.',
    goToDigitalProductsHint: 'تم حفظ المنتج. اذهب الآن إلى الإدارة ← المنتجات الرقمية لرفع ملفه.',
    productCodeLabel: 'رمز المنتج (SKU)', productCodePermanentHint: 'تم تعيينه تلقائيًا عند إنشاء هذا المنتج — دائم ولا يمكن تغييره.', productCodeAutoAssignedHint: 'سيتم تعيين رمز منتج فريد تلقائيًا بمجرد حفظ هذا المنتج.', searchProductsPlaceholder: 'ابحث بالاسم أو رمز المنتج...',
    readyForSaleCol: 'جاهز للبيع', readyForSaleYes: 'جاهز', readyForSaleNo: 'غير جاهز', noCodeSetHint: 'لم يتم تعيين رمز',
    groupStoreOpt: 'متجر (مادي)', groupMarketplaceOpt: 'سوق', fulfillShippingOpt: 'مادي (إلكترونيات، ملابس، طعام، أثاث...)',
    fulfillDownloadOpt: 'رقمي (كتب إلكترونية، برمجيات، دورات، موسيقى، فيديوهات...)', fulfillBookingOpt: 'خدمات (تعليم، رعاية صحية، استشارات، صيانة...)', fulfillManualOpt: 'أخرى (حدد نوع فئتك الخاص)',
    customTypeNameLabel: 'ما نوع هذه الفئة؟', customTypeNamePlaceholder: 'مثال: تأجير، اشتراكات، طلبات مخصصة',
    customTypeNameHint: 'بما أن هذا لا يندرج ضمن رقمي/مادي/خدمات، سمِّه بنفسك — يظهر هذا لعملائك.',
    externalUrlLabel: 'رابط خارجي / رابط تجريبي', externalUrlPlaceholder: 'https://...',
    meetingLinkLabel: 'رابط الاجتماع عبر الإنترنت (Zoom أو Teams أو غيره)', meetingLinkPlaceholder: 'https://zoom.us/j/...', meetingLinkHint: 'لأي خدمة تُقدَّم عبر اجتماع أونلاين — دورات، استشارات، تدريب، فحوصات، وغيرها. يُعرض للعميل فقط بعد الشراء أو الحجز.', joinMeetingBtn: 'انضم إلى الاجتماع عبر الإنترنت', meetingLinkAlsoEmailedHint: 'تم أيضًا إرسال هذا الرابط إلى بريدك الإلكتروني.', meetingLinkPendingHint: 'سيتم توفير رابط الاجتماع بمجرد توفره — سنرسله إليك عبر البريد الإلكتروني.',
    customerConfirmedReceivedLabel: 'تم الاستلام', problemReportedLabel: 'تم الإبلاغ عن مشكلة', confirmReceiptBtn: 'تأكيد الاستلام', reportProblemBtn: 'الإبلاغ عن مشكلة',
    confirmReceiptConfirm: 'أؤكد أنني استلمت هذا الطلب.', reportProblemPrompt: 'ما الذي حدث؟ (مثال: لم يصل، تالف، منتج خاطئ)',
    customerConfirmedReceivedLabelStaff: 'أكّد العميل الاستلام', customerReportedProblemLabelStaff: 'أبلغ العميل عن مشكلة', awaitingCustomerConfirmationLabel: 'بانتظار تأكيد العميل',
    runTrackingSelfTestBtn: 'تشغيل حالة التتبع', runningTestHint: 'جارٍ تشغيل الاختبار...', selfTestPassed: 'نجحت جميع الفحوصات', selfTestFailed: 'فشل أحد الفحوصات',
    externalUrlHint: 'اختياري — رابط لعرض توضيحي مباشر أو نموذج أو معاينة لهذا المنتج/الخدمة.',
    productImagesLabel: 'صور المنتج', uploadImageBtn: 'رفع صورة', noImagesYet: 'لا توجد صور بعد.', replaceImageBtn: 'استبدال',
    digitalFileLabel: 'الملف الرقمي', currentFileLabel: 'الملف الحالي', noDigitalFileYet: 'لم يتم رفع أي ملف بعد — سيرى العملاء ملفًا مؤقتًا حتى تضيف واحدًا.', uploadDigitalFileBtn: 'رفع الملف', digitalFileHint: 'الملف الفعلي الذي سيحمّله العملاء بعد شراء هذا المنتج (PDF، ZIP، إلخ). الحد الأقصى 20 ميغابايت.', fileFormatLabel: 'الصيغة', fileSizeLabel: 'الحجم',
    digitalFileSectionTitle: 'ملف المنتج الرقمي', digitalFileSectionHint: 'المحتوى القابل للتنزيل نفسه — PDF أو PowerPoint أو فيديو أو صوت أو ZIP أو أي نوع ملف آخر. هذا ما يحصل عليه العميل بعد الشراء، تمامًا كما تم رفعه. تريد تضمين صورة غلاف أو مواد إضافية؟ اضغطها في ملف ZIP بنفسك أولاً، ثم ارفع ملف الـ ZIP هذا هنا — سيتم تسليمه دون أي تغيير.',
    uploadSuccessBadge: 'تم الرفع بنجاح', deleteFileBtn: 'حذف الملف',
    looksLikeImageConfirm: 'يبدو هذا ملف صورة. هذا الحقل مخصص لملف المنتج القابل للتنزيل — هل تقصد رفعه ضمن "صور المنتج" بدلاً من ذلك؟ اضغط موافق للرفع هنا على أي حال، أو إلغاء لاختيار ملف آخر.',
    productImagesSectionTitle: 'صور المنتج', productImagesSectionHint: 'الصور المعروضة في المتجر لتمثيل هذا المنتج. تُخزَّن بشكل منفصل تمامًا عن الملف الرقمي أعلاه — لا يتم خلط الصور أبدًا مع المحتوى القابل للتنزيل.',
    digitalFileRequiredHint: 'مطلوب — لا يمكن حفظ منتج رقمي دون إرفاق ملفه.', digitalFileRequiredError: 'لم يتم إرفاق ملف بعد — لن يتمكن العملاء من شراء هذا المنتج حتى يتم رفع ملف.',
    optionalNowLabel: 'اختياري الآن، مطلوب قبل إمكانية البيع', digitalFileOptionalHint: 'يمكنك حفظ هذا المنتج الآن ورفع الملف لاحقًا — مفيد للملفات الكبيرة التي تستغرق وقتًا لرفعها. لا يمكن شراؤه حتى يتم إرفاق ملف.',
    productSavedNowUploading: 'تم حفظ المنتج — جارٍ رفع الملف الآن...', productSavedButNotPurchasable: '(تم حفظ المنتج، لكنه غير قابل للشراء بعد.)',
    imageUploadHint: 'JPEG أو PNG أو GIF أو WebP أو TIFF أو SVG — حتى 4 ميغابايت لكل صورة.', saveProductFirstForImages: 'احفظ هذا المنتج أولاً، ثم عدّله مرة أخرى لإضافة صور.',
    chooseFileFirst: 'اختر ملفًا أولاً.', unsupportedImageType: 'نوع صورة غير مدعوم — استخدم JPEG أو PNG أو GIF أو WebP.',
    uploadingLabel: 'جارٍ الرفع...', retryUploadBtn: 'إعادة المحاولة', largeFileNotice: 'هذا ملف كبير — سيتم استخدام عملية رفع الملفات الكبيرة القابلة للاستئناف. إذا انقطع اتصالك، يمكنك إعادة المحاولة دون البدء من جديد.',
    compressedFileNotice: 'هذا التنزيل عبارة عن ملف ZIP يحتوي على "{filename}" — بعد التنزيل، قم باستخراج (فك ضغط) الملف للحصول عليه.',
    compressBeforeUploadLabel: 'ضغط هذا الملف قبل الرفع (يُنصح به لمجموعات المستندات الكبيرة)', compressingLabel: 'جارٍ الضغط...', storedAsZipLabel: 'مخزّن كملف ZIP',
    deleteImageConfirm: 'حذف هذه الصورة؟', removeProductConfirm: 'إزالة هذا المنتج؟', deleteCategoryConfirm: 'حذف هذه الفئة؟',
    categoryTypeLabel: 'نوع الفئة', categoryTypeLockedHint: 'لا يمكن تغيير النوع بعد إنشاء الفئة — احذفها وأنشئها من جديد بدلاً من ذلك.',
    fulfillmentType_shipping: 'شحن', fulfillmentType_download: 'تنزيل', fulfillmentType_booking: 'حجز', fulfillmentType_manual: 'يدوي', fulfillmentType_other: 'أخرى',
    advancedOptionsLabel: 'خيارات متقدمة', marketplaceTagHint: 'يُستخدم لإظهار منتجاتك في صفحة تصفح سوق هدام المشترك عبر المتاجر — اختياري وله قيمة افتراضية مناسبة.',
    allowPickupLabel: 'السماح بالاستلام من المتجر لهذه الفئة', allowPickupHint: 'عند التحديد، يمكن للعملاء الذين يشترون عناصر في هذه الفئة اختيار "الاستلام من المتجر" بدلاً من الشحن، عند الدفع.',
    noCategoriesYetHint: 'أنشئ فئة أولاً، من تبويب الفئات.',
    subExpiredBanner: 'انتهى اشتراكك. جدّده أدناه لاستعادة الوصول الكامل.', renewNowBtn: 'جدّد الآن',
    subExpiringBanner: 'ينتهي اشتراكك خلال {days} يوم/أيام. جدّده أدناه لتجنب أي انقطاع.',
    subscriptionH3: 'الاشتراك', subExpiresOnLabel: 'ينتهي في', subDaysRemaining: 'متبقٍ {days} يوم/أيام', noActiveSubscriptionLabel: 'لا يوجد اشتراك نشط لهذا المتجر حتى الآن.',
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
    autoTranslateBtn: 'ترجمة تلقائية', autoTranslateHint: 'يستخدم خدمة ترجمة آلية مجانية — راجع النتيجة دائمًا قبل الحفظ، فقد تكون الترجمة الآلية غير دقيقة تمامًا.', enterLangCodeFirst: 'أدخل رمز اللغة أولاً (مثل ar أو fr أو es).', nothingToTranslate: 'لا يوجد اسم أو وصف لترجمته بعد.', translatingLabel: 'جارٍ الترجمة…', autoTranslateDoneMsg: 'تمت الترجمة — يرجى المراجعة قبل الحفظ.',
    langCodeShortPlaceholder: 'ar, fr…', autoTranslateAllBtn: 'ترجمة الكل تلقائيًا', bulkTranslateConfirm: 'ترجمة وحفظ كل عنصر في هذه الصفحة إلى "{lang}" الآن؟ يتم الحفظ فورًا دون خطوة مراجعة — قد تكون الترجمة الآلية غير دقيقة، لذا راجع العناصر المهمة لاحقًا.', bulkTranslatingLabel: 'جارٍ ترجمة كل شيء — قد يستغرق هذا لحظة…', bulkTranslateDoneMsg: 'تمت ترجمة {translated}، وكان لدى {skipped} هذه اللغة بالفعل.', bulkTranslateFailedMsg: 'تعذرت ترجمة {count}.',
    translateEntireStoreTitle: 'ترجمة المتجر بالكامل', translateEntireStoreHint: 'يترجم ويحفظ المنتجات والفئات واسم متجرك/شعاره/نص "حول المتجر" إلى لغة واحدة، كل ذلك في إجراء واحد — بدلاً من زيارة كل صفحة على حدة. نصوص الواجهة المدمجة (الأزرار والقوائم) مُترجمة باحترافية بالفعل ولا تتأثر بهذا.',
    translateEntireStoreBtn: 'ترجمة المتجر بالكامل', translateEntireStoreConfirm: 'ترجمة وحفظ المنتجات والفئات ومعلومات المتجر إلى "{lang}" الآن؟ يتم الحفظ فورًا دون خطوة مراجعة.', translatingScopeLabel: 'جارٍ ترجمة {scope}…',
    alreadyHasLabel: 'يحتوي بالفعل على', nameInLanguageLabel: 'الاسم بتلك اللغة', descriptionInLanguageLabel: 'الوصف بتلك اللغة',
    addStoreTranslationHint: 'اختياري — أضف اسم متجرك ووصفه المختصر ونص "عن المتجر" بلغة أخرى (أي لغة تختارها: عربية، فرنسية، إسبانية، وغيرها)',
    storeTranslationExplainer: 'هذا ما يتيح ظهور العربية (أو أي لغة) فعليًا لمتجر أنشأته بنفسك — لا يُملأ تلقائيًا.',
    storeNameInLanguageLabel: 'اسم المتجر بتلك اللغة', taglineInLanguageLabel: 'الوصف المختصر بتلك اللغة', aboutTextInLanguageLabel: 'نص "عن المتجر" بتلك اللغة',
    planRemoveFromMarketplaceWarning: 'سيؤدي هذا إلى إزالة متجرك من دليل سوق ومتاجر هدام المشترك فورًا — لن يجدك المتسوقون المتصفحون للسوق هناك بعد الآن. رابط متجرك الخاص سيستمر بالعمل كالمعتاد. هل تريد المتابعة؟',
    planAddToMarketplaceWarning: 'سيؤدي هذا إلى إدراج متجرك في دليل سوق ومتاجر هدام المشترك فورًا — ستصبح كل منتجاتك مرئية هناك. هل تريد المتابعة؟',
    planChangeGenericWarning: 'تغيير خطة متجرك؟ يسري هذا فورًا.', savedMsg: 'تم الحفظ.',
    planLabelForm: 'الخطة', employeeRoleOpt: 'موظف', adminRoleOpt: 'مسؤول',
    refundRequestedStatus: 'تم طلب الاسترداد', requestRefundBtn: 'طلب استرداد',
    stripePaymentsH3: 'مدفوعات Stripe', stripeIntroText: 'اربط حساب Stripe الخاص بك لقبول المدفوعات بالبطاقة مباشرة — تذهب مدفوعات العملاء إلى حسابك مباشرة، وليس عبر هدام.', stripeConnectBtn: 'ربط Stripe', stripeContinueOnboardingBtn: 'متابعة إعداد Stripe', stripeEnableAsPaymentMethod: 'قبول مدفوعات Stripe في هذا المتجر', stripeStatus_not_connected: 'غير مرتبط', stripeStatus_pending: 'الإعداد غير مكتمل', stripeStatus_connected: 'مرتبط', stripeStatus_restricted: 'يتطلب إجراء', stripeNotConnectedHint: 'اربط حساب Stripe لبدء قبول المدفوعات بالبطاقة.', stripePendingHint: 'بدأت في ربط Stripe، لكن الإعداد لم يكتمل بعد — تابع من حيث توقفت.', stripeConnectedHint: 'حساب Stripe الخاص بك مرتبط بالكامل وجاهز لقبول المدفوعات.', stripeRestrictedHint: 'يحتاج Stripe إلى مزيد من المعلومات منك قبل أن يتمكن هذا الحساب من قبول المدفوعات — متابعة الإعداد ستُظهر ما هو مطلوب.', stripeReturnMsg: 'مرحبًا بعودتك — نتحقق من حالة اتصال Stripe الخاص بك.', stripeRefreshMsg: 'انتهت صلاحية رابط إعداد Stripe هذا. انقر أدناه للحصول على رابط جديد.',
    storeDetailsH3: 'تفاصيل المتجر',
    alreadyDownloadedLabel: 'تم التنزيل', noRefundAfterDownloadHint: 'غير مؤهل للاسترداد — تم تنزيل هذا المنتج الرقمي بالفعل.',
    languageCodeLabel: 'رمز اللغة', maxDownloadsLabel: 'الحد الأقصى للتنزيلات', descriptionLabel: 'الوصف',
    marketplaceListingTagLabel: 'تصنيف إدراج السوق', downloadWindowLabel: 'نافذة التنزيل (ساعات)', addAccountBtn: 'إضافة حساب',
    paymentSuccessfulH3: 'تم الدفع بنجاح', awaitingPickupStatus: 'بانتظار جاهزية الاستلام', pendingShipmentStatus: 'بانتظار الشحن',
    requestedStatus: 'مطلوب', pendingStatus: 'قيد الانتظار', viewMyOrdersBtn: 'عرض طلباتي',
    fulfillmentOrdersH2: 'التنفيذ والطلبات', nothingToFulfill: 'لا يوجد شيء لتنفيذه الآن.',
    refundedByOn: 'تم الاسترداد بواسطة {by} في {date}', inStorePickupHint: 'استلام من المتجر — لا حاجة للشحن.',
    pickupNotePlaceholder: 'ملاحظة الاستلام', shipToLabel: 'الشحن إلى:', trackingNotePlaceholder: 'ملاحظة التتبع', notePlaceholder: 'ملاحظة',
    refundThisItemBtn: 'استرداد هذا العنصر', refundBtn: 'استرداد', refundReasonPrompt: 'سبب الاسترداد (اختياري):',
    confirmRefundPaymentBtn: 'تأكيد طريقة دفع الاسترداد', refundPaymentHint: 'تمت الموافقة على استردادك. يرجى تأكيد الوجهة — يمكن أن تكون بطاقة مختلفة عن التي دفعت بها.',
    submitRefundPaymentBtn: 'إرسال', refundRejectedStatus: 'تم رفض طلب الاسترداد', refundRequestedByCustomerLabel: 'طلب العميل استردادًا',
    reasonLabel: 'السبب', requestedAtLabel: 'تاريخ الطلب', approveRefundBtn: 'موافقة', rejectRefundBtn: 'رفض',
    refundApprovedAwaitingPaymentLabel: 'تمت الموافقة على الاسترداد — بانتظار تأكيد دفع العميل', refundRejectedByStaffLabel: 'تم رفض الاسترداد', rejectReasonPrompt: 'سبب رفض هذا الاسترداد:',
    currentPasswordLabel: 'كلمة المرور الحالية', newPasswordLabel: 'كلمة المرور الجديدة', atLeast6Chars: 'على الأقل 6 أحرف',
    changePasswordBtn: 'تغيير كلمة المرور', deleteMyAccountBtn: 'حذف حسابي', deleteYourAccountH3: 'حذف حسابك',
    deleteAccountWarning: 'هذا يزيل تسجيل دخولك نهائيًا. تبقى طلباتك السابقة مسجلة (تحتفظ بنسخة من اسمك/بريدك الإلكتروني)، لكن لن تتمكن من تسجيل الدخول بهذا الحساب مرة أخرى.',
    confirmPasswordLabel: 'أكّد كلمة المرور', permanentlyDeleteBtn: 'حذف حسابي نهائيًا', cancelBtn: 'إلغاء',
    passwordChangedMsg: 'تم تغيير كلمة مرورك بنجاح.', passwordChangedDetail: 'كلمة مرورك الآن مفعّلة. يمكنك متابعة استخدام جلستك الحالية، أو تسجيل الدخول مرة أخرى على أجهزتك الأخرى إذا لزم الأمر.',
    securitySettingsTitle: 'إعدادات الأمان', signedInAsLabel: 'تم تسجيل الدخول باسم', roleLabel: 'الدور',
    roleAdministrator: 'مسؤول', roleEmployee: 'موظف', roleCustomer: 'عميل', roleSuperadmin: 'مشرف عام',
    passwordSectionTitle: 'كلمة المرور', updatePasswordBtn: 'تحديث كلمة المرور',
    checklistLength: '8 أحرف على الأقل', checklistLetter: 'حرف واحد', checklistNumber: 'رقم واحد', checklistSpecial: 'رمز خاص واحد',
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
    stockLabel: 'المخزون (اختياري)', stockPlaceholder: 'اتركه فارغًا إذا لم يتم تتبع المخزون', stockHint: 'اضبط هذا فقط للمنتجات المادية التي تريد تتبع مخزونها. اتركه فارغًا للمنتجات الرقمية أو الخدمات أو أي شيء لا تحتاج إلى عدّه.',
    marketplaceTagCol: 'تصنيف السوق', downloadsWord: 'تنزيل(ات)', otherFallback: 'أخرى', accountsWord: 'حسابات',
    emailCol: 'البريد الإلكتروني', roleCol: 'الدور', youLabel: 'أنت', idCol: 'المعرف', clientCol: 'العميل', itemsCol: 'العناصر', totalCol: 'الإجمالي',
    statusCol: 'الحالة', dateCol: 'التاريخ', fromLabel: 'من', toLabel: 'إلى', presetToday: 'اليوم', presetWeek: 'آخر 7 أيام',
    orderStatusLabel: 'حالة الطلب', orderStatus_pending: 'قيد الانتظار', orderStatus_confirmed: 'مؤكد', orderStatus_processing: 'قيد المعالجة', orderStatus_shipped: 'تم الشحن', orderStatus_delivered: 'تم التسليم', orderStatus_cancelled: 'ملغى', orderStatus_refunded: 'مسترد',
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
    wantToRenewHint: 'تريد تجديد أو تمديد هذه الخطة؟ اذهب إلى', settingsLinkLabel: 'الإعدادات', confirmBtn: 'تأكيد',
    currentPlanBadge: 'الخطة الحالية', perMonth: 'شهر', freeForever: 'مجاني للأبد',
    hadamCommission: 'عمولة هدام', perSale: 'لكل عملية بيع',
    fSubdomain: 'متجرك بنطاق فرعي خاص', fUpTo10: 'حتى 10 منتجات', fUpTo100: 'حتى 100 منتج', fUnlimited: 'منتجات غير محدودة',
    fBasicDashboard: 'لوحة تحكم بائع أساسية', fFullDashboard: 'لوحة تحكم بائع كاملة',
    fEmailSupport: 'دعم عبر البريد الإلكتروني', fPriorityEmailSupport: 'دعم بريد إلكتروني ذو أولوية', f247Support: 'دعم على مدار الساعة ذو أولوية',
    fStandardAnalytics: 'تحليلات قياسية', fAdvancedAnalytics: 'تحليلات متقدمة',
    fCustomBranding: 'هوية بصرية مخصصة', fCustomStoreBranding: 'هوية متجر مخصصة', fPrioritySupport: 'دعم ذو أولوية',
    fAPIAccess: 'الوصول إلى API', fFullAPIAccess: 'وصول كامل إلى API', fDedicatedManager: 'مدير حساب مخصص',
    pricingDisclaimer: 'الأسعار وحدود المنتجات ونسب العمولة المعروضة هنا سارية لمدة اشتراك 30 يومًا من تاريخ الدفع. اختيار خطة سيطلب منك الدفع قبل تطبيق أي تغيير.',
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
    storeFooterText: 'مدعوم من سوق هدام — المتجر الرقمي العالمي ومنصة السوق متعددة المستأجرين. © 2026 سوق هدام. جميع الحقوق محفوظة.',
  },
  fr: {
    home: 'Accueil', stores: 'Boutiques', myOrders: 'Mes commandes', fulfillmentQueue: 'File de traitement', admin: 'Admin',
    login: 'Connexion', logout: 'Déconnexion', cart: 'Panier', browse: 'Parcourir', browseCatalog: 'Parcourir le catalogue',
    yourCart: 'Votre panier', emptyCart: 'Votre panier est vide.', total: 'Total', checkout: 'Paiement', qtyLabel: 'Qté',
    howReceive: 'Comment souhaitez-vous le recevoir ?', shipToAddress: 'Livrer à une adresse', pickUpInStore: 'Retrait en boutique',
    shippingAddress: 'Adresse de livraison', shippingAddressPlaceholder: 'Rue, ville, code postal', cardNumber: 'Numéro de carte', expiry: "Date d'expiration", cvv: 'CVV', cardholderNameLabel: 'Nom du titulaire de la carte',
    cardNumberRequiredError: 'Un numéro de carte valide est requis.', cardExpiryFormatError: "La date d'expiration de la carte doit être au format MM/AA.", cardCvvRequiredError: 'Le code de sécurité de la carte (CVV/CVC) est requis.', cardCvvDigitsError: 'Le code de sécurité de la carte (CVV/CVC) ne doit contenir que des chiffres.', cardCvvLengthError: 'Le code de sécurité de la carte (CVV/CVC) doit comporter exactement 3 chiffres.', cardholderNameRequiredError: 'Le nom du titulaire de la carte est requis.', renewBtn: 'Renouveler', signupPaymentHint: "Paiement simulé. Utilisez 4111 1111 1111 1111 pour un succès ou 0000 0000 0000 0000 pour un refus.",
    helpIconAriaLabel: 'Aide', helpWhatLabel: 'Que saisir', helpWhyLabel: "Pourquoi c'est nécessaire", helpNextLabel: 'Ce qui se passe ensuite', helpRulesLabel: 'Exigences', helpErrorsLabel: 'En cas de problème', helpMoreLabel: "Besoin d'aide supplémentaire ?", helpMoreText: 'Consultez la page', helpMoreTextEnd: 'pour les guides complets.', helpNavLabel: 'Aide',
    helpCheckoutCardWhat: 'Numéro de carte, expiration (MM/AA), CVV, et le nom du titulaire.', helpCheckoutCardWhy: "Requis pour finaliser le paiement de cette commande — cet environnement simule le paiement, aucun montant n'est réellement débité.", helpCheckoutCardNext: "Si la carte est acceptée, votre commande est passée immédiatement et vous verrez un reçu. Si elle est refusée, votre panier reste intact et vous pouvez réessayer.", helpCheckoutCardRules: 'Le CVV doit comporter exactement 3 chiffres. Les quatre champs sont obligatoires. Utilisez 4111 1111 1111 1111 pour simuler un succès, ou 0000 0000 0000 0000 pour prévisualiser un refus.', helpCheckoutCardErrors: "Vérifiez le texte rouge sous le champ concerné. Si la carte est refusée, essayez le numéro de test de succès, ou une autre carte réelle.",
    helpShipAddrWhat: 'Adresse de livraison complète pour cette commande — rue, ville et code postal.', helpShipAddrWhy: "Le magasin en a besoin pour vous expédier réellement vos articles physiques.", helpShipAddrNext: "Le personnel utilisera cette adresse lorsqu'il marquera votre commande comme expédiée ; vous verrez les mises à jour du statut de livraison dans Mes commandes.",
    helpDeliveryConfirmWhat: 'Si vous avez effectivement reçu cet article livré.', helpDeliveryConfirmWhy: "Ceci est suivi séparément du statut « livré » du magasin lui-même — c'est votre propre confirmation, il existe donc un enregistrement clair en cas de litige.", helpDeliveryConfirmNext: '« Confirmer la réception » clôture ceci. « Signaler un problème » notifie immédiatement le personnel du magasin avec votre note.', helpDeliveryConfirmErrors: "Si l'article n'est jamais arrivé, est endommagé ou incorrect, utilisez « Signaler un problème » plutôt que de confirmer — le personnel fera un suivi.",
    helpRefundPayBtnWhat: "Un mode de paiement pour l'envoi de votre remboursement — cela peut être une carte différente de celle utilisée pour le paiement initial.", helpRefundPayBtnWhy: "Les coordonnées de votre carte d'origine ne sont jamais stockées, nous avons donc besoin que vous confirmiez une destination pour le remboursement.", helpRefundPayBtnNext: "Une fois soumis, le remboursement est traité immédiatement — l'article est marqué remboursé et vous recevrez un e-mail de confirmation.", helpRefundPayBtnRules: 'Seuls les 4 derniers chiffres de cette carte sont conservés, à titre de référence — jamais le numéro complet ni le CVV.',
    helpRequestRefundWhat: 'Votre motif de demande de remboursement.', helpRequestRefundWhy: 'Ceci est montré au personnel du magasin afin qu\'il puisse examiner votre demande.', helpRequestRefundNext: "Le personnel du magasin est notifié immédiatement et approuvera ou rejettera votre demande, avec un motif en cas de rejet. Vous serez informé par e-mail dans les deux cas.", helpRequestRefundRules: 'Un produit numérique déjà téléchargé ne peut plus être remboursé.',
    helpFqStatusWhat: "Le statut de traitement actuel, et une note de suivi facultative pour le client.", helpFqStatusWhy: "C'est ce que le client voit sur sa propre commande — le maintenir exact évite la confusion et les demandes de support.", helpFqStatusNext: 'Marquer un article « livré » envoie automatiquement un e-mail au client, l\'invitant à confirmer la réception.', helpFqStatusRules: 'Le statut doit avancer dans l\'ordre (en attente → en traitement → expédié → livré) — il ne peut pas être défini en arrière depuis ce formulaire.',
    helpFqRefundWhat: 'Approuver ou rejeter cette demande de remboursement du client.', helpFqRefundWhy: "Chaque remboursement nécessite une décision humaine — ce n'est jamais automatique.", helpFqRefundNext: 'L\'approbation invite le client à confirmer un mode de paiement de remboursement avant que celui-ci ne soit réellement traité. Le rejet le termine immédiatement avec votre motif indiqué, visible par le client.', helpFqRefundRules: "On vous demandera un motif dans les deux cas — c'est particulièrement important pour un rejet, puisque le client le voit.",
    helpRegEnabledWhat: 'Si de nouveaux clients peuvent créer leur propre compte dans votre boutique.', helpRegEnabledWhy: 'Désactiver ceci est utile pour une boutique privée ou sur invitation uniquement.', helpRegEnabledNext: "Les comptes clients existants ne sont jamais affectés — ceci contrôle uniquement les nouvelles inscriptions.",
    helpReqMfaWhat: "Si les comptes administrateur et employé de votre boutique doivent avoir l'authentification à deux facteurs activée pour se connecter.", helpReqMfaWhy: 'Protège votre boutique contre une connexion avec seulement un mot de passe volé.', helpReqMfaNext: "Le personnel sans MFA configuré sera invité à l'activer lors de sa prochaine connexion.", helpReqMfaErrors: "Si un membre du personnel est bloqué après l'activation de ceci, vous pouvez réinitialiser son MFA depuis la section Employés.",
    helpRenewButtonsWhat: 'Quel abonnement renouveler — Boutique, Marketplace, ou les deux.', helpRenewButtonsWhy: "Prolonge votre période d'abonnement actuelle de 30 jours à partir d'aujourd'hui (ou de votre expiration actuelle, selon la plus tardive).", helpRenewButtonsNext: "Les coordonnées de paiement vous seront demandées avant tout changement. Si votre abonnement a encore plus d'une semaine avant expiration, le système vous indiquera qu'un renouvellement n'est pas encore nécessaire.", helpRenewButtonsRules: "Pour changer d'offre plutôt que simplement renouveler, utilisez Vendre sur Hadam et choisissez une offre différente là-bas — c'est traité comme un changement de plan explicite.",
    helpAdminProductsWhat: 'Votre catalogue de produits — nom, prix, images, et à quelle catégorie il appartient.', helpAdminProductsWhy: "La catégorie d'un produit détermine comment il est traité : expédié, téléchargé, ou réservé en tant que service.", helpAdminProductsNext: 'Les nouveaux produits apparaissent immédiatement sur votre boutique une fois enregistrés.', helpAdminProductsRules: "Vous ne pouvez pas ajouter plus de produits que la limite autorisée par votre offre d'abonnement — consultez Admin → Paramètres pour votre limite actuelle.",
    helpAdminCategoriesWhat: 'Un regroupement de vos produits qui détermine comment les commandes associées sont traitées.', helpAdminCategoriesWhy: "Le type de traitement (expédition, téléchargement, réservation, ou manuel) pilote tout le cycle de vie de la commande pour chaque produit de cette catégorie — il ne peut pas être changé par produit, seulement par catégorie.", helpAdminCategoriesNext: "Les produits utilisant déjà cette catégorie continuent de fonctionner ; les changements ici n'affectent que les futures commandes et les paramètres de la catégorie elle-même.", helpAdminCategoriesRules: 'Les noms de catégories doivent être uniques au sein de votre boutique (insensible à la casse).',
    helpAdminEmployeesWhat: "Le nom, l'e-mail et le mot de passe d'un nouveau compte employé pour votre boutique.", helpAdminEmployeesWhy: 'Les employés peuvent accéder à la File de traitement pour gérer les commandes, mais pas aux paramètres de votre boutique ni à la facturation.', helpAdminEmployeesNext: 'Le nouveau compte peut se connecter immédiatement avec le mot de passe que vous avez défini.', helpAdminEmployeesRules: "Un même e-mail peut avoir des rôles différents dans différentes boutiques — ceci n'affecte que son rôle dans cette boutique spécifiquement.", helpAdminEmployeesErrors: "Si un employé est bloqué hors de l'authentification à deux facteurs, utilisez « Réinitialiser MFA » à côté de son nom plutôt que de supprimer son compte.",
    helpEmailOtpWhat: 'Le code de vérification à 6 chiffres.', helpEmailOtpWhy: "Ceci confirme que c'est bien vous qui vous connectez, pas seulement quelqu'un qui a votre mot de passe.", helpEmailOtpNext: "Le code est envoyé à votre adresse e-mail enregistrée — la même que vous utilisez pour vous connecter. Saisissez-le ici pour terminer la connexion.", helpEmailOtpRules: "Le code expire 10 minutes après son envoi, et ne peut être utilisé qu'une seule fois. Si vous ne le voyez pas dans une minute ou deux, vérifiez votre dossier spam, ou cliquez sur « Renvoyer le code » ci-dessous pour en obtenir un nouveau.", helpEmailOtpErrors: "Un code expiré, déjà utilisé, ou incorrect affiche un message clair indiquant exactement lequel c'est — les codes expirés et déjà utilisés nécessitent simplement un nouveau code via « Renvoyer le code » ; un code incorrect signifie qu'il faut vérifier ce que vous avez saisi.",
    helpCartWhat: 'Les articles que vous êtes sur le point d\'acheter, et leur quantité.', helpCartWhy: 'Vérifiez tout ici avant de saisir les détails de paiement — les quantités et articles peuvent encore être modifiés à cette étape.', helpCartNext: "Cliquer sur passer commande vous amène au paiement ; rien n'est débité tant que vous n'y soumettez pas de coordonnées de carte valides.", helpCartRules: 'La quantité doit être au moins 1 pour chaque article.',
    helpAdminStatsWhy: 'Le revenu net est votre revenu réel : paiements réussis moins tous les remboursements déjà traités. Il n\'inclut pas les commandes en attente ou échouées.', helpAdminStatsNext: "Ceci se met à jour automatiquement à mesure que de nouvelles commandes arrivent et que les remboursements sont traités — aucune action nécessaire ici.",
    helpAdminStatsRefundedWhy: "Ceci ne compte que les remboursements réellement effectués et payés — pas les demandes en attente d'une décision du personnel, ni les demandes approuvées en attente de la confirmation du mode de paiement par le client.", helpAdminStatsRefundedNext: "Pour voir les remboursements encore en cours, consultez la File de traitement plutôt que ce total.",
    helpFqSelfTestWhat: "Rien — cela s'exécute automatiquement dès que vous cliquez, aucune saisie nécessaire.", helpFqSelfTestWhy: "Vérifie que tout le pipeline de confirmation de livraison fonctionne réellement de bout en bout (mise à jour du statut, visibilité client, confirmation, litige) en utilisant cet article de commande réel.", helpFqSelfTestNext: "Cela modifie temporairement le statut et la note de suivi de cet article pendant le test, puis restaure automatiquement chaque valeur exactement comme avant — rien n'est affecté de façon permanente sur cette commande.", helpFqSelfTestRules: "Peut être exécuté en toute sécurité sur une commande réelle à tout moment ; cela ne notifie pas le client et ne change pas ce qu'il voit.",
    helpEmployeeOrdersWhy: "Il s'agit d'une vue en lecture seule de toutes les commandes de votre boutique, quel que soit leur statut — utile pour rechercher quelque chose lorsque vous ne savez pas quel article se trouve dans la File de traitement active.", helpEmployeeOrdersNext: "Pour réellement mettre à jour un statut ou une note de suivi, utilisez plutôt l'onglet File de traitement — cette vue sert à rechercher et rembourser, pas au traitement quotidien.",
    pay: 'Payer', logInToCheckOut: 'Connectez-vous pour payer', myOrdersTitle: 'Mes commandes', noOrdersYet: 'Aucune commande pour le moment.',
    download: 'Télécharger', downloadImageBtn: "Télécharger l'image", storesOnHadam: 'Boutiques sur Hadam', saleOnHadam: 'Vendre sur Hadam',
    saleOnHadamBlurb: 'Vous cherchez autre chose ? Parcourez toutes les boutiques du Marketplace partagé de Hadam.',
    logIn: 'Connexion', createAccount: 'Créer un compte', email: 'E-mail', password: 'Mot de passe', name: 'Nom',
    setNewPasswordTitle: 'Définir un nouveau mot de passe', newPasswordLabel: 'Nouveau mot de passe', setNewPasswordBtn: 'Définir le mot de passe', passwordTooShort: 'Le mot de passe doit comporter au moins 6 caractères.', passwordResetSuccess: 'Mot de passe mis à jour avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.', checkEmailToConfirm: 'Vérifiez votre e-mail pour confirmer votre compte avant de vous connecter.', checkEmailForResetLink: "Si ce compte existe, un lien de réinitialisation du mot de passe a été envoyé à cette adresse e-mail. Cliquez sur le lien pour définir un nouveau mot de passe.",
    disableBtn: 'Désactiver', emailOtpEnableBtn: 'Activer le code par e-mail', emailOtpEnabledLabel: 'Code par e-mail activé', emailOtpSectionHint: "Pas d'application d'authentification ? Recevez un code à usage unique par e-mail à la place lors de la connexion.", emailOtpSectionTitle: 'Code de vérification par e-mail',
    enterCardNumberPrompt: 'Entrez un numéro de carte pour mettre à niveau (utilisez 4111 1111 1111 1111 pour réussir) :', invalidRecoveryLinkMsg: 'Ce lien de réinitialisation de mot de passe est invalide ou a expiré. Veuillez en demander un nouveau.',
    mfaChooseMethodHint: 'Choisissez comment vous souhaitez vérifier votre identité.', mfaEmailSendingHint: 'Envoi d\'un code à votre e-mail...', mfaEmailSentHint: 'Entrez le code que nous venons de vous envoyer par e-mail.',
    mfaMethodAuthenticatorApp: "Application d'authentification", mfaMethodEmail: 'Code par e-mail', mfaQrLoadErrorMsg: "L'image du code QR n'a pas pu être chargée — utilisez plutôt le code de saisie manuelle ci-dessous.",
    recoveryMfaRequiredHint: "Ce compte a l'authentification à deux facteurs activée — entrez un code de votre application d'authentification pour terminer la réinitialisation de votre mot de passe.",
    recoveryMfaUnavailableMsg: "L'authentification à deux facteurs est requise pour réinitialiser ce mot de passe, mais aucune méthode vérifiée n'a pu être trouvée. Veuillez contacter le support.",
    requestNewLinkBtn: 'Demander un nouveau lien', resendCodeLink: 'Renvoyer le code',
    mfaMethodBackup: 'Code de secours', backupCodeLoginHint: 'Entrez un de vos codes de secours. Chacun ne fonctionne qu\'une fois.', backupCodeLabel: 'Code de secours',
    backupCodesSectionTitle: 'Codes de secours', backupCodesSectionHint: "Codes à usage unique pour accéder à votre compte si vous perdez l'accès à votre application d'authentification ou à votre e-mail.",
    backupCodesNoPrimaryWarning: "Les codes de secours sont une solution de repli, pas une méthode de connexion à part entière — activez d'abord l'application d'authentification ou le code par e-mail ci-dessus, sinon ces codes ne seront jamais demandés lors de la connexion.",
    resetMfaBtn: 'Réinitialiser MFA', resetMfaConfirm: "Cela supprime toutes les méthodes MFA (application d'authentification, code par e-mail et codes de secours) pour {name}, afin qu'il puisse se connecter avec juste son mot de passe et reconfigurer le MFA. Continuer ?", resetMfaSuccess: 'Le MFA a été réinitialisé pour ce compte.', deleteUserConfirm: 'Supprimer ce compte ? Cette action est irréversible.', tryAgainBtn: 'Réessayer', processingBtn: 'Traitement en cours…',
    backupCodesRemainingLabel: 'codes inutilisés restants', noBackupCodesLabel: 'Aucun code de secours généré pour le moment.', regenerateBackupCodesBtn: 'Régénérer les codes', generateBackupCodesBtn: 'Générer des codes de secours',
    regenerateBackupCodesConfirm: 'Cela invalidera tous les codes de secours existants. Continuer ?', yourBackupCodesTitle: 'Vos codes de secours',
    backupCodesWarning: "Conservez-les en lieu sûr — chaque code ne fonctionne qu'une fois, et ils ne seront affichés qu'une seule fois.", downloadCodesBtn: 'Télécharger en fichier texte', doneBtn: 'Terminé',
    lostDeviceUseBackupLink: "Vous avez perdu votre authentificateur ? Utilisez un code de secours", recoveryBackupCodeHint: 'Entrez un de vos codes de secours, ainsi que votre nouveau mot de passe.',
    confirmNewPasswordLabel: 'Confirmer le nouveau mot de passe', passwordRequirementsHint: 'Au moins 8 caractères, incluant une lettre, un chiffre et un caractère spécial.', passwordTooShortStrong: 'Le mot de passe doit comporter au moins 8 caractères.', passwordNeedsLetterNumber: 'Le mot de passe doit inclure au moins une lettre et un chiffre.', passwordNeedsSpecialChar: 'Le mot de passe doit inclure au moins un caractère spécial (ex. ! @ # $).', passwordsDontMatch: 'Les mots de passe ne correspondent pas.', passwordSameAsCurrentError: "C'est votre mot de passe actuel — veuillez en choisir un différent.", recoveryLinkExpiredDuringUse: "La session de votre lien de récupération a été perdue — veuillez demander un nouveau lien et réessayer rapidement.",
    mfaPromptTitle: 'Vérification à deux facteurs', mfaPromptHint: 'Entrez le code à 6 chiffres de votre application d\'authentification.', mfaCodeLabel: 'Code de vérification', verifyBtn: 'Vérifier',
    mfaSectionTitle: 'Authentification à deux facteurs', mfaSectionHint: "Ajoutez une couche de sécurité supplémentaire avec une application d'authentification (comme Google Authenticator ou Microsoft Authenticator).", loadingLabel: 'Chargement…',
    mfaEnabledLabel: 'Activé', disableMfaBtn: 'Désactiver', mfaUnavailableHint: "L'authentification à deux facteurs n'est pas disponible pour le moment.", enableMfaBtn: "Activer l'authentification à deux facteurs",
    disableMfaConfirm: 'Désactiver l\'authentification à deux facteurs pour votre compte ? Cela rend votre compte légèrement moins sécurisé.',
    mfaScanHint: 'Scannez ce code avec votre application d\'authentification :', mfaManualEntryLabel: 'Ou entrez ce code manuellement', mfaEnabledSuccessMsg: 'Authentification à deux facteurs activée avec succès.',
    mfaSetupRequiredNotice: "Ce magasin exige que les comptes du personnel aient une authentification à deux facteurs configurée. Veuillez la configurer maintenant pour continuer.",
    accessControlSectionTitle: 'Connexion et inscription', registrationEnabledLabel: 'Autoriser les nouveaux clients à créer un compte', requireMfaForStaffLabel: "Exiger l'authentification à deux facteurs pour les comptes admin/employé",
    accessSettingsSaved: "Paramètres d'accès enregistrés.", supabaseManagedSettingsTitle: 'Paramètres de sécurité pour toute la plateforme', supabaseManagedSettingsHint: "Ces paramètres s'appliquent à toutes les boutiques sur Hadam et sont gérés directement dans Supabase, pas ici — exigences de confirmation d'e-mail, règles de complexité des mots de passe et URL de redirection.",
    securityAccessTab: 'Sécurité et accès', appManagedSectionTitle: 'Paramètres gérés par la boutique', appManagedSectionHint: 'Ces paramètres sont spécifiques à votre boutique et entièrement contrôlés ici.',
    yourOwnAccountSecurityTitle: 'Sécurité de votre compte', yourOwnAccountSecurityHint: "Configurez l'authentification à deux facteurs pour votre propre connexion admin.", setUpYourOwnMfaBtn: "Configurer l'authentification à deux facteurs",
    smSettingEmailConfirm: "Confirmation d'e-mail requise à l'inscription", smSettingPasswordRules: 'Règles de complexité des mots de passe', smSettingRedirectUrls: 'URL de redirection autorisées', smSettingMfaProviders: "Méthodes d'authentification à deux facteurs disponibles", smManagedInSupabase: 'Géré dans Supabase',
    openSupabaseAuthSettings: "Ouvrir les paramètres d'authentification Supabase",
    forgotPassword: 'Mot de passe oublié ?', newAccount: 'Nouveau ? Créer un compte client', haveAccount: 'Déjà un compte ? Connexion',
    resetYourPassword: 'Réinitialiser votre mot de passe', sendResetLink: 'Envoyer le lien de réinitialisation', backToLogin: 'Retour à la connexion',
    chooseNewPassword: 'Choisissez un nouveau mot de passe', resetCode: 'Code de réinitialisation', newPassword: 'Nouveau mot de passe', setNewPassword: 'Définir le mot de passe',
    stats: 'Statistiques', products: 'Produits', categories: 'Catégories', employees: 'Employés', orders: 'Commandes',
    addCategory: '+ Ajouter une catégorie', addProduct: '+ Ajouter un produit', addEmployee: '+ Ajouter un employé', addStaffAccountH3: 'Ajouter un compte employé', save: 'Enregistrer', add: 'Ajouter',
    editProductTitle: 'Modifier le produit', addProductTitle: 'Ajouter un produit', editCategoryTitle: 'Modifier la catégorie', addCategoryTitle: 'Ajouter une catégorie',
    edit: 'Modifier', delete: 'Supprimer', allOrdersPayments: 'Toutes les commandes et paiements', langToggle: 'Français', dashboard: 'Tableau de bord admin',
    storeSettingsTab: 'Paramètres de la boutique', reportsTab: 'Rapports', digitalProductsTab: 'Produits numériques',
    searchDigitalProductsPlaceholder: 'Rechercher par produit ou catégorie...', productCodeCol: 'Code produit', originalFileNameCol: 'Nom de fichier original',
    fileTypeCol: 'Type de fichier', fileSizeCol: 'Taille du fichier', uploadStatusCol: 'Statut du téléversement', uploadDateCol: 'Date de téléversement', uploadedByCol: 'Téléversé par', downloadCountCol: 'Nombre de téléchargements', imageDownloadCountCol: "Nombre de téléchargements d'image",
    replaceFileBtn: 'Remplacer le fichier', verifyDownloadBtn: 'Vérifier le téléchargement', zipWrapperTag: 'ZIP', noDigitalProductsYetHint: "Aucun produit numérique dans cette boutique pour l'instant — ajoutez-en un depuis la page Produits d'abord.", manageFilesBtn: "Gérer le fichier et l'image",
    deleteDigitalFileConfirm: 'Supprimer ce fichier ? Les clients ne pourront plus acheter ni télécharger ce produit tant qu\'un nouveau fichier n\'est pas téléversé.',
    noFileWarningBadge: 'Aucun fichier', noFileWarningTooltip: "Ce produit numérique n'a pas de fichier — les clients ne peuvent pas encore l'acheter.",
    goToDigitalProductsHint: 'Produit enregistré. Allez maintenant dans Admin → Produits numériques pour téléverser son fichier.',
    productCodeLabel: 'Code produit (SKU)', productCodePermanentHint: "Attribué automatiquement à la création de ce produit — permanent, il ne peut pas être modifié.", productCodeAutoAssignedHint: 'Un code produit unique sera attribué automatiquement une fois ce produit enregistré.', searchProductsPlaceholder: 'Rechercher par nom ou code produit...',
    readyForSaleCol: 'Prêt à la vente', readyForSaleYes: 'Prêt', readyForSaleNo: 'Pas prêt', noCodeSetHint: 'Aucun code défini',
    groupStoreOpt: 'Boutique (physique)', groupMarketplaceOpt: 'Marketplace', fulfillShippingOpt: 'Physique (électronique, vêtements, alimentation, meubles...)',
    fulfillDownloadOpt: 'Numérique (ebooks, logiciels, cours, musique, vidéos...)', fulfillBookingOpt: 'Services (éducation, santé, conseil, maintenance...)', fulfillManualOpt: 'Autre (définissez votre propre type de catégorie)',
    customTypeNameLabel: 'Quel type de catégorie est-ce ?', customTypeNamePlaceholder: 'ex. Locations, Abonnements, Commandes personnalisées',
    customTypeNameHint: "Comme ceci ne correspond pas à Numérique/Physique/Services, nommez-le vous-même — ceci est affiché à vos acheteurs.",
    externalUrlLabel: 'URL externe / lien de démo', externalUrlPlaceholder: 'https://...',
    meetingLinkLabel: 'Lien de réunion en ligne (Zoom, Teams, etc.)', meetingLinkPlaceholder: 'https://zoom.us/j/...', meetingLinkHint: "Pour tout service délivré sous forme de réunion en ligne — cours, consultations, coaching, bilans, et plus. Affiché au client uniquement après l'achat ou la réservation.", joinMeetingBtn: 'Rejoindre la réunion en ligne', meetingLinkAlsoEmailedHint: 'Ce lien vous a également été envoyé par e-mail.', meetingLinkPendingHint: "Un lien de réunion sera fourni dès qu'il sera disponible — nous vous l'enverrons par e-mail.",
    customerConfirmedReceivedLabel: 'Reçu par vous', problemReportedLabel: 'Problème signalé', confirmReceiptBtn: 'Confirmer la réception', reportProblemBtn: 'Signaler un problème',
    confirmReceiptConfirm: 'Je confirme avoir reçu cette commande.', reportProblemPrompt: "Qu'est-ce qui n'a pas fonctionné ? (ex. jamais arrivé, endommagé, mauvais article)",
    customerConfirmedReceivedLabelStaff: 'Le client a confirmé la réception', customerReportedProblemLabelStaff: 'Le client a signalé un problème', awaitingCustomerConfirmationLabel: 'En attente de confirmation du client',
    runTrackingSelfTestBtn: 'Lancer le statut de suivi', runningTestHint: 'Test en cours...', selfTestPassed: 'Toutes les vérifications ont réussi', selfTestFailed: "Une vérification a échoué",
    externalUrlHint: 'Facultatif — un lien vers une démo, un échantillon, ou un aperçu pour ce produit/service.',
    productImagesLabel: 'Images du produit', uploadImageBtn: 'Téléverser une image', noImagesYet: 'Aucune image pour le moment.', replaceImageBtn: 'Remplacer',
    digitalFileLabel: 'Fichier numérique', currentFileLabel: 'Fichier actuel', noDigitalFileYet: "Aucun fichier téléversé pour l'instant — les clients verront un fichier provisoire jusqu'à ce que vous en ajoutiez un.", uploadDigitalFileBtn: 'Téléverser le fichier', digitalFileHint: "Le fichier réel que les clients téléchargent après avoir acheté ce produit (PDF, ZIP, etc.). Max 20 Mo.", fileFormatLabel: 'Format', fileSizeLabel: 'Taille',
    digitalFileSectionTitle: 'Fichier du produit numérique', digitalFileSectionHint: "Le contenu téléchargeable lui-même — PDF, PowerPoint, vidéo, audio, ZIP ou tout autre type de fichier. C'est ce que le client reçoit après l'achat, exactement tel que téléversé. Vous voulez inclure une image de couverture ou des documents supplémentaires ? Compressez-les vous-même d'abord, puis téléversez ce fichier .zip unique ici — il sera livré totalement inchangé.",
    uploadSuccessBadge: 'Téléversé avec succès', deleteFileBtn: 'Supprimer le fichier',
    looksLikeImageConfirm: "Ceci ressemble à un fichier image. Cet emplacement est pour le fichier produit téléchargeable — vouliez-vous plutôt le téléverser dans « Images du produit » ? Cliquez sur OK pour le téléverser ici quand même, ou Annuler pour choisir un autre fichier.",
    productImagesSectionTitle: 'Images du produit', productImagesSectionHint: "Photos affichées sur la boutique pour représenter ce produit. Stockées entièrement séparément du fichier numérique ci-dessus — les images ne sont jamais mélangées avec le contenu téléchargeable.",
    digitalFileRequiredHint: "Obligatoire — un produit numérique ne peut pas être enregistré sans son fichier joint.", digitalFileRequiredError: "Aucun fichier joint pour l'instant — les clients ne pourront pas acheter ce produit tant qu'un fichier n'est pas téléversé.",
    optionalNowLabel: 'facultatif pour le moment, requis avant la vente', digitalFileOptionalHint: "Vous pouvez enregistrer ce produit maintenant et téléverser le fichier ensuite — utile pour les fichiers volumineux qui prennent du temps à téléverser. Il ne peut pas être acheté tant qu'un fichier n'est pas joint.",
    productSavedNowUploading: 'Produit enregistré — téléversement du fichier en cours...', productSavedButNotPurchasable: "(Le produit a été enregistré, mais n'est pas encore achetable.)",
    imageUploadHint: 'JPEG, PNG, GIF, WebP, TIFF, ou SVG — jusqu\'à 4 Mo par image.', saveProductFirstForImages: "Enregistrez d'abord ce produit, puis modifiez-le à nouveau pour ajouter des images.",
    chooseFileFirst: "Choisissez d'abord un fichier.", unsupportedImageType: 'Type d\'image non pris en charge — utilisez JPEG, PNG, GIF, ou WebP.',
    uploadingLabel: 'Téléversement...', retryUploadBtn: 'Réessayer', largeFileNotice: 'Il s\'agit d\'un fichier volumineux — utilisation du processus de téléversement résumable pour fichiers volumineux. En cas de coupure, vous pourrez réessayer sans tout recommencer.',
    compressedFileNotice: 'Ce téléchargement est un fichier ZIP contenant "{filename}" — après téléchargement, extrayez (décompressez)-le pour obtenir le fichier.',
    compressBeforeUploadLabel: 'Compresser ce fichier avant le téléversement (recommandé pour les grandes collections de documents)', compressingLabel: 'Compression...', storedAsZipLabel: 'stocké sous forme de ZIP',
    deleteImageConfirm: 'Supprimer cette image ?', removeProductConfirm: 'Supprimer ce produit ?', deleteCategoryConfirm: 'Supprimer cette catégorie ?',
    categoryTypeLabel: 'Type de catégorie', categoryTypeLockedHint: 'Le type ne peut pas être modifié une fois la catégorie créée — supprimez-la et recréez-la à la place.',
    fulfillmentType_shipping: 'Expédition', fulfillmentType_download: 'Téléchargement', fulfillmentType_booking: 'Réservation', fulfillmentType_manual: 'Manuel', fulfillmentType_other: 'Autre',
    advancedOptionsLabel: 'Options avancées', marketplaceTagHint: 'Utilisé pour faire apparaître vos produits sur la page de navigation multi-boutiques du Marketplace de Hadam — facultatif, avec une valeur par défaut adaptée.',
    allowPickupLabel: 'Autoriser le retrait en boutique pour cette catégorie', allowPickupHint: 'Si coché, les clients achetant des articles de cette catégorie peuvent choisir "Retrait en boutique" au lieu de la livraison, lors du paiement.',
    noCategoriesYetHint: "Créez d'abord une catégorie, depuis l'onglet Catégories.",
    subExpiredBanner: 'Votre abonnement a expiré. Renouvelez ci-dessous pour restaurer un accès complet.', renewNowBtn: 'Renouveler maintenant',
    subExpiringBanner: 'Votre abonnement expire dans {days} jour(s). Renouvelez ci-dessous pour éviter toute interruption.',
    subscriptionH3: 'Abonnement', subExpiresOnLabel: 'Expire le', subDaysRemaining: '{days} jour(s) restant(s)', noActiveSubscriptionLabel: "Aucun abonnement actif trouvé pour cette boutique pour l'instant.",
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
    autoTranslateBtn: 'Traduire automatiquement', autoTranslateHint: "Utilise un service de traduction automatique gratuit — vérifiez toujours le résultat avant d'enregistrer, car les traductions automatiques peuvent être imparfaites.", enterLangCodeFirst: "Entrez d'abord un code de langue (ex. ar, fr, es).", nothingToTranslate: "Il n'y a pas encore de nom ou de description à traduire.", translatingLabel: 'Traduction en cours…', autoTranslateDoneMsg: "Traduit — veuillez vérifier avant d'enregistrer.",
    langCodeShortPlaceholder: 'ar, fr…', autoTranslateAllBtn: 'Tout traduire automatiquement', bulkTranslateConfirm: 'Traduire et enregistrer automatiquement chaque élément de cette page en « {lang} » maintenant ? Ceci enregistre immédiatement, sans étape de vérification — la traduction automatique peut être imparfaite, vérifiez donc les éléments importants ensuite.', bulkTranslatingLabel: 'Traduction de tout en cours — cela peut prendre un moment…', bulkTranslateDoneMsg: '{translated} traduits, {skipped} avaient déjà cette langue.', bulkTranslateFailedMsg: '{count} n\'ont pas pu être traduits.',
    translateEntireStoreTitle: 'Traduire toute la boutique', translateEntireStoreHint: "Traduit et enregistre les produits, les catégories, ainsi que le nom/slogan/texte « à propos » de votre boutique en une seule langue, en une seule action — plutôt que de visiter chaque page séparément. Le texte intégré de l'interface (boutons, menus) est déjà traduit professionnellement et n'est pas concerné par cette action.",
    translateEntireStoreBtn: 'Traduire toute la boutique', translateEntireStoreConfirm: 'Traduire et enregistrer automatiquement les produits, les catégories et les informations de la boutique en « {lang} » maintenant ? Ceci enregistre immédiatement, sans étape de vérification.', translatingScopeLabel: 'Traduction de {scope} en cours…',
    alreadyHasLabel: 'contient déjà', nameInLanguageLabel: 'Nom dans cette langue', descriptionInLanguageLabel: 'Description dans cette langue',
    addStoreTranslationHint: "Facultatif — ajoutez le nom, le slogan et le texte « à propos » de votre boutique dans une autre langue (celle de votre choix : arabe, français, espagnol, etc.)",
    storeTranslationExplainer: "C'est ce qui permet à l'arabe (ou toute autre langue) de s'afficher réellement pour une boutique que vous configurez vous-même — ce n'est pas rempli automatiquement.",
    storeNameInLanguageLabel: 'Nom de la boutique dans cette langue', taglineInLanguageLabel: 'Slogan dans cette langue', aboutTextInLanguageLabel: 'Texte « à propos » dans cette langue',
    planRemoveFromMarketplaceWarning: "Cela retirera immédiatement votre boutique de l'annuaire Marketplace & Boutiques partagé de Hadam — les acheteurs parcourant le Marketplace ne vous y trouveront plus. Le lien de votre propre boutique continue de fonctionner comme avant. Continuer ?",
    planAddToMarketplaceWarning: "Cela listera immédiatement votre boutique sur l'annuaire Marketplace & Boutiques partagé de Hadam — tous vos produits y deviendront visibles. Continuer ?",
    planChangeGenericWarning: "Changer l'offre de votre boutique ? Cela prend effet immédiatement.", savedMsg: 'Enregistré.',
    planLabelForm: 'Offre', employeeRoleOpt: 'Employé', adminRoleOpt: 'Admin',
    refundRequestedStatus: 'Remboursement demandé', requestRefundBtn: 'Demander un remboursement',
    stripePaymentsH3: 'Paiements Stripe', stripeIntroText: 'Connectez votre propre compte Stripe pour accepter les paiements par carte directement — les paiements des clients vont directement sur votre compte, pas via Hadam.', stripeConnectBtn: 'Connecter Stripe', stripeContinueOnboardingBtn: 'Poursuivre la configuration Stripe', stripeEnableAsPaymentMethod: 'Accepter les paiements Stripe dans cette boutique', stripeStatus_not_connected: 'Non connecté', stripeStatus_pending: 'Configuration incomplète', stripeStatus_connected: 'Connecté', stripeStatus_restricted: 'Action requise', stripeNotConnectedHint: 'Connectez un compte Stripe pour commencer à accepter les paiements par carte.', stripePendingHint: "Vous avez commencé à connecter Stripe, mais la configuration n'est pas terminée — reprenez là où vous vous étiez arrêté.", stripeConnectedHint: 'Votre compte Stripe est entièrement connecté et prêt à accepter des paiements.', stripeRestrictedHint: 'Stripe a besoin de plus d\u2019informations avant que ce compte puisse accepter des paiements — poursuivre la configuration indiquera ce qui est requis.', stripeReturnMsg: 'Bon retour — nous vérifions le statut de votre connexion Stripe.', stripeRefreshMsg: 'Ce lien de configuration Stripe a expiré. Cliquez ci-dessous pour en obtenir un nouveau.',
    storeDetailsH3: 'Détails de la boutique',
    alreadyDownloadedLabel: 'Téléchargé', noRefundAfterDownloadHint: 'Non éligible au remboursement — ce produit numérique a déjà été téléchargé.',
    languageCodeLabel: 'Code de langue', maxDownloadsLabel: 'Téléchargements max', descriptionLabel: 'Description',
    marketplaceListingTagLabel: 'Tag de listing Marketplace', downloadWindowLabel: 'Fenêtre de téléchargement (heures)', addAccountBtn: 'Ajouter le compte',
    paymentSuccessfulH3: 'Paiement réussi', awaitingPickupStatus: 'en attente de disponibilité pour retrait', pendingShipmentStatus: 'expédition en attente',
    requestedStatus: 'demandé', pendingStatus: 'en attente', viewMyOrdersBtn: 'Voir mes commandes',
    fulfillmentOrdersH2: 'Traitement et commandes', nothingToFulfill: 'Rien à traiter pour le moment.',
    refundedByOn: 'Remboursé par {by} le {date}', inStorePickupHint: 'Retrait en boutique — aucune expédition nécessaire.',
    pickupNotePlaceholder: 'Note de retrait', shipToLabel: 'Expédier à :', trackingNotePlaceholder: 'Note de suivi', notePlaceholder: 'Note',
    refundThisItemBtn: 'Rembourser cet article', refundBtn: 'Rembourser', refundReasonPrompt: 'Raison du remboursement (facultatif) :',
    confirmRefundPaymentBtn: 'Confirmer le mode de remboursement', refundPaymentHint: "Votre remboursement a été approuvé. Veuillez confirmer où il doit être envoyé — cela peut être une carte différente de celle utilisée pour le paiement.",
    submitRefundPaymentBtn: 'Envoyer', refundRejectedStatus: 'Demande de remboursement refusée', refundRequestedByCustomerLabel: 'Remboursement demandé par le client',
    reasonLabel: 'Raison', requestedAtLabel: 'Demandé le', approveRefundBtn: 'Approuver', rejectRefundBtn: 'Refuser',
    refundApprovedAwaitingPaymentLabel: 'Remboursement approuvé — en attente de confirmation du client', refundRejectedByStaffLabel: 'Remboursement refusé', rejectReasonPrompt: 'Raison du refus de ce remboursement :',
    currentPasswordLabel: 'Mot de passe actuel', newPasswordLabel: 'Nouveau mot de passe', atLeast6Chars: 'Au moins 6 caractères',
    changePasswordBtn: 'Changer le mot de passe', deleteMyAccountBtn: 'Supprimer mon compte', deleteYourAccountH3: 'Supprimer votre compte',
    deleteAccountWarning: "Cela supprime définitivement votre connexion. Vos commandes passées restent enregistrées (elles conservent déjà une copie de votre nom/e-mail), mais vous ne pourrez plus vous reconnecter avec ce compte.",
    confirmPasswordLabel: 'Confirmez votre mot de passe', permanentlyDeleteBtn: 'Supprimer définitivement mon compte', cancelBtn: 'Annuler',
    passwordChangedMsg: 'Votre mot de passe a été modifié avec succès.', passwordChangedDetail: 'Votre mot de passe est maintenant actif. Continuez à utiliser votre session actuelle, ou reconnectez-vous sur vos autres appareils si nécessaire.',
    securitySettingsTitle: 'Paramètres de sécurité', signedInAsLabel: 'Connecté en tant que', roleLabel: 'Rôle',
    roleAdministrator: 'Administrateur', roleEmployee: 'Employé', roleCustomer: 'Client', roleSuperadmin: 'Superadmin',
    passwordSectionTitle: 'Mot de passe', updatePasswordBtn: 'Mettre à jour le mot de passe',
    checklistLength: 'Au moins 8 caractères', checklistLetter: 'Une lettre', checklistNumber: 'Un chiffre', checklistSpecial: 'Un caractère spécial',
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
    stockLabel: 'Stock (facultatif)', stockPlaceholder: 'Laisser vide si le stock n\'est pas suivi', stockHint: 'Ne renseignez ce champ que pour les articles physiques dont vous voulez suivre le stock. Laissez vide pour les articles numériques, les services, ou tout ce que vous n\'avez pas besoin de compter.',
    marketplaceTagCol: 'Tag Marketplace', downloadsWord: 'téléchargement(s)', otherFallback: 'Autre', accountsWord: 'comptes',
    emailCol: 'E-mail', roleCol: 'Rôle', youLabel: 'vous', idCol: 'ID', clientCol: 'Client', itemsCol: 'Articles', totalCol: 'Total',
    statusCol: 'Statut', dateCol: 'Date', fromLabel: 'Du', toLabel: 'Au', presetToday: "Aujourd'hui", presetWeek: '7 derniers jours',
    orderStatusLabel: 'Statut de la commande', orderStatus_pending: 'En attente', orderStatus_confirmed: 'Confirmée', orderStatus_processing: 'En traitement', orderStatus_shipped: 'Expédiée', orderStatus_delivered: 'Livrée', orderStatus_cancelled: 'Annulée', orderStatus_refunded: 'Remboursée',
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
    wantToRenewHint: 'Vous voulez renouveler ou prolonger cette offre ? Allez dans', settingsLinkLabel: 'Paramètres', confirmBtn: 'Confirmer',
    currentPlanBadge: 'Offre actuelle', perMonth: 'mois', freeForever: 'Gratuit pour toujours',
    hadamCommission: 'Commission Hadam', perSale: 'par vente',
    fSubdomain: 'Votre boutique en sous-domaine', fUpTo10: "Jusqu'à 10 produits", fUpTo100: "Jusqu'à 100 produits", fUnlimited: 'Produits illimités',
    fBasicDashboard: 'Tableau de bord vendeur de base', fFullDashboard: 'Tableau de bord vendeur complet',
    fEmailSupport: 'Support par e-mail', fPriorityEmailSupport: 'Support e-mail prioritaire', f247Support: 'Support prioritaire 24/7',
    fStandardAnalytics: 'Analyses standard', fAdvancedAnalytics: 'Analyses avancées',
    fCustomBranding: 'Image de marque personnalisée', fCustomStoreBranding: 'Image de boutique personnalisée', fPrioritySupport: 'Support prioritaire',
    fAPIAccess: 'Accès API', fFullAPIAccess: 'Accès API complet', fDedicatedManager: 'Gestionnaire de compte dédié',
    pricingDisclaimer: "Les prix, limites de produits et taux de commission affichés ici s'appliquent pour une période d'abonnement de 30 jours à partir de la date de paiement. Choisir une offre vous demandera de payer avant que quoi que ce soit ne change.",
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
    storeFooterText: 'Propulsé par Hadam Marketplace — la boutique numérique mondiale et la plateforme de marketplace multi-boutiques. © 2026 Hadam Marketplace. Tous droits réservés.',
  },
};
function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }
/** Formats a date/time using the APP's own selected language, not the browser's default locale — a bare .toLocaleString() ignores state.lang entirely, which is wrong for a user whose OS/browser language differs from what they've chosen in the app. */
function localeDate(date, opts) { return date.toLocaleString(state.lang === 'ar' ? 'ar' : state.lang === 'fr' ? 'fr' : 'en', opts); }
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
  if (fromUrl) {
    // The URL's ?lang= is meant as a one-time initial hint (e.g. from the
    // "Sell on Hadam" signup link) — once applied, it must not keep
    // permanently overriding the user's own later language choice on every
    // subsequent reload, or switching languages afterward would silently
    // never stick for as long as that parameter remains in the address bar.
    const url = new URL(window.location.href);
    url.searchParams.delete('lang');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
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
  const headers = { 'Content-Type': 'application/json', 'X-Lang': state.lang || 'en' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (res.status === 401) {
    console.log('[401 debug]', { path, hasToken: !!state.token, tokenPreview: state.token ? state.token.slice(0, 20) + '...' : null, localStorageToken: !!localStorage.getItem('hadam_token') });
  }
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
/** Same mechanism as public-platform/app.js — a "?" icon that toggles a
 * contextual help popover: what to enter, why it's needed, what happens
 * next, requirements, error recovery, and a link to the full manuals.
 * Since most of this file's UI is template-literal-rendered (not static
 * HTML), this is called directly inline rather than injected after render. */
function helpIcon(id, keys) {
  const { what, why, next, rules, errors } = keys;
  const row = (label, val) => val ? `<dt>${label}</dt><dd>${t(val)}</dd>` : '';
  return `<span class="help-wrap" id="help-wrap-${id}"><span class="help-icon" tabindex="0" role="button" aria-label="${t('helpIconAriaLabel') || 'Help'}" onclick="toggleHelp('${id}')" onkeydown="if(event.key==='Enter'||event.key===' ')toggleHelp('${id}')">?</span>
    <dl class="help-popover" id="help-${id}">
      ${row(t('helpWhatLabel') || 'What to enter', what)}
      ${row(t('helpWhyLabel') || "Why it's needed", why)}
      ${row(t('helpNextLabel') || 'What happens next', next)}
      ${row(t('helpRulesLabel') || 'Requirements', rules)}
      ${row(t('helpErrorsLabel') || 'If something goes wrong', errors)}
      <dt>${t('helpMoreLabel') || 'Need more help?'}</dt><dd>${t('helpMoreText') || 'See the'} <a href="${platformUrl()}#help" target="_blank" style="color:var(--accent);">${t('helpNavLabel') || 'Help'}</a> ${t('helpMoreTextEnd') || 'page for the full guides.'}</dd>
    </dl></span>`;
}
function toggleHelp(id) {
  const el = document.getElementById('help-' + id);
  document.querySelectorAll('.help-popover.open').forEach(p => { if (p !== el) p.classList.remove('open'); });
  el.classList.toggle('open');
}
function closeAllHelp() { document.querySelectorAll('.help-popover.open').forEach(p => p.classList.remove('open')); }
document.addEventListener('click', e => {
  if (!e.target.closest('.help-icon') && !e.target.closest('.help-popover')) closeAllHelp();
});
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
        ${isCurrent && state.user && state.user.role === 'admin' ? `<div class="hint" style="margin-top:8px;">${t('wantToRenewHint') || 'Want to renew or extend this plan? Go to'} <a href="#" onclick="state.adminTab='settings';go('admin');return false;" style="color:var(--accent);">${t('settingsLinkLabel') || 'Settings'}</a>.</div>` : ''}
      </div>`;
    }).join('')}
  </div>
  <div class="hint" style="margin-top:14px;">${t('pricingDisclaimer')}</div>`;
}
function selectTier(tier) {
  if (tier === 'starter') {
    if (!confirm(`${t('switchToPlanConfirm')} ${t('tierLabel_' + tier)}?`)) return;
    submitTierChange(tier, null);
    return;
  }
  const container = document.getElementById('genericModalContent');
  container.innerHTML = `
    <h3>${t('switchToPlanConfirm')} ${t('tierLabel_' + tier)}?</h3>
    <div class="field"><label>${t('cardNumber')}</label><input id="stCardNum" dir="ltr" placeholder="4111 1111 1111 1111" maxlength="19" autocomplete="off"></div>
    <div class="row2">
      <div class="field"><label>${t('expiry')}</label><input id="stCardExp" dir="ltr" placeholder="MM/YY" autocomplete="off"></div>
      <div class="field"><label>${t('cvv')}</label><input id="stCardCvv" dir="ltr" placeholder="123" autocomplete="off"></div>
    </div>
    <div class="field"><label>${t('cardholderNameLabel')}</label><input id="stCardName" autocomplete="off"></div>
    <div class="hint">${t('signupPaymentHint') || 'Simulated payment. Use 4111 1111 1111 1111 for success or 0000 0000 0000 0000 to preview a decline.'}</div>
    <div id="selectTierMsg"></div>
    <button class="btn full" style="margin-top:10px;" onclick="submitTierChangeFromModal('${tier}')">${t('confirmBtn') || 'Confirm'}</button>`;
  openModal('genericOverlay');
  wireCardFieldValidation('st');
}
async function submitTierChangeFromModal(tier) {
  const card = {
    number: document.getElementById('stCardNum').value, expiry: document.getElementById('stCardExp').value,
    cvv: document.getElementById('stCardCvv').value, holderName: document.getElementById('stCardName').value,
  };
  const msgEl = document.getElementById('selectTierMsg');
  const cardError = cardValidationError(card);
  if (cardError) { msgEl.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  await submitTierChange(tier, card, msgEl);
}
async function submitTierChange(tier, card, msgEl) {
  try {
    await api('/api/admin/store/renew', { method: 'POST', body: JSON.stringify({ plan: state.tenantInfo.plan, subscriptionTier: tier, card }) });
    closeModal('genericOverlay');
    renderSell();
  } catch (e) { if (msgEl) msgEl.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; else alert(e.message); }
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
async function initSupabaseRecoveryFlow() {
  // Supabase's password-recovery links land back on this page with recovery
  // tokens in the URL hash. Finishing the reset MUST happen via Supabase's
  // own client SDK calling auth.updateUser() directly — not through our own
  // backend — per Supabase's documented flow and the requirement that
  // password operations go through the auth provider's own secure APIs.
  if (location.hash.includes('error=')) {
    // An already-expired or already-used link redirects here with an
    // explicit error in the hash (e.g. error_code=otp_expired) rather than
    // firing PASSWORD_RECOVERY at all — this needs its own direct check,
    // not just the "nothing happened within a few seconds" fallback below.
    showInvalidRecoveryLinkMessage();
    return;
  }
  if (!location.hash.includes('type=recovery')) return;
  let config;
  try { config = await api('/api/config'); } catch { return; }
  if (config.authDriver !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) return;
  const sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  let recoveryStarted = false;
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { recoveryStarted = true; showSetNewPasswordModal(sb); }
  });
  // A link that's structurally fine but rejected some other way never fires
  // PASSWORD_RECOVERY either — give Supabase's own client a few seconds to
  // process the tokens before concluding something's wrong.
  setTimeout(() => {
    if (!recoveryStarted) showInvalidRecoveryLinkMessage();
  }, 3000);
}
function showInvalidRecoveryLinkMessage() {
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${t('setNewPasswordTitle')}</h3>
    <div class="msg error">${t('invalidRecoveryLinkMsg') || 'This password reset link is invalid or has expired. Please request a new one.'}</div>
    <button class="btn full" style="margin-top:10px;" onclick="closeModal('genericOverlay');history.replaceState(null,'',location.pathname);openModal('authOverlay');renderAuthModal('forgot');">${t('requestNewLinkBtn') || 'Request a new link'}</button>`;
  openModal('genericOverlay');
}
/** Client-side mirror of the backend's validateFullCard — gives immediate
 * feedback without a round-trip, but the backend check remains the
 * authoritative one (never trust client-side validation alone). */
function cardValidationError(card) {
  const digits = ((card && card.number) || '').replace(/\s/g, '');
  if (digits.length < 12) return t('cardNumberRequiredError') || 'A valid card number is required.';
  const expiry = ((card && card.expiry) || '').trim();
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry)) return t('cardExpiryFormatError') || 'Card expiry must be in MM/YY format.';
  const cvv = ((card && card.cvv) || '').trim();
  if (!cvv) return t('cardCvvRequiredError') || 'Card security code (CVV/CVC) is required.';
  if (!/^\d+$/.test(cvv)) return t('cardCvvDigitsError') || 'Card security code (CVV/CVC) must contain only digits.';
  if (cvv.length !== 3) return t('cardCvvLengthError') || 'Card security code (CVV/CVC) must be exactly 3 digits.';
  if (!((card && card.holderName) || '').trim()) return t('cardholderNameRequiredError') || 'Cardholder name is required.';
  return null;
}
/** Wires live, per-field validation onto a card form: restricts what can
 * even be typed into number/CVV, and shows immediate inline feedback per
 * field as the person types — rather than only discovering problems when
 * they press Pay/Confirm/Renew. idPrefix matches the input IDs used by the
 * calling form, e.g. 'rs' for #rsCardNum, #rsCardExp, #rsCardCvv, #rsCardName.
 */
function wireCardFieldValidation(idPrefix) {
  const numEl = document.getElementById(idPrefix + 'CardNum');
  const expEl = document.getElementById(idPrefix + 'CardExp');
  const cvvEl = document.getElementById(idPrefix + 'CardCvv');
  const nameEl = document.getElementById(idPrefix + 'CardName');
  const alreadyWired = numEl && numEl.dataset.cardValidationWired === 'true';
  if (alreadyWired) return;
  [numEl, expEl, cvvEl, nameEl].forEach(el => { if (el) el.dataset.cardValidationWired = 'true'; });
  function errEl(input) {
    let el = input.nextElementSibling;
    if (!el || !el.classList || !el.classList.contains('field-error')) {
      el = document.createElement('div');
      el.className = 'field-error';
      el.style.cssText = 'color:var(--danger,#e57373);font-size:12px;margin-top:3px;';
      input.insertAdjacentElement('afterend', el);
    }
    return el;
  }
  function setError(input, message) { errEl(input).textContent = message || ''; }
  if (numEl) {
    numEl.addEventListener('input', () => {
      // Card numbers are digits (and spaces for readability) only —
      // anything else typed is silently dropped, not just rejected later.
      const cleaned = numEl.value.replace(/[^\d\s]/g, '');
      if (cleaned !== numEl.value) numEl.value = cleaned;
      const digits = cleaned.replace(/\s/g, '');
      setError(numEl, digits.length > 0 && digits.length < 12 ? (t('cardNumberRequiredError') || 'A valid card number is required.') : '');
    });
  }
  if (expEl) {
    expEl.addEventListener('input', () => {
      const cleaned = expEl.value.replace(/[^\d/]/g, '');
      if (cleaned !== expEl.value) expEl.value = cleaned;
      setError(expEl, cleaned.length > 0 && !/^\d{2}\s*\/\s*\d{2}$/.test(cleaned) ? (t('cardExpiryFormatError') || 'Card expiry must be in MM/YY format.') : '');
    });
  }
  if (cvvEl) {
    cvvEl.addEventListener('input', () => {
      // CVV: digits only, hard-capped at 3 characters — the field itself
      // cannot even accept a 4th digit or a letter, not just reject them
      // on submit.
      const cleaned = cvvEl.value.replace(/\D/g, '').slice(0, 3);
      if (cleaned !== cvvEl.value) cvvEl.value = cleaned;
      setError(cvvEl, cleaned.length > 0 && cleaned.length < 3 ? (t('cardCvvLengthError') || 'Card security code (CVV/CVC) must be exactly 3 digits.') : '');
    });
    cvvEl.setAttribute('maxlength', '3');
    cvvEl.setAttribute('inputmode', 'numeric');
  }
  if (nameEl) {
    nameEl.addEventListener('blur', () => {
      setError(nameEl, nameEl.value.trim() ? '' : (t('cardholderNameRequiredError') || 'Cardholder name is required.'));
    });
  }
}
function passwordStrengthError(password) {
  if (password.length < 8) return t('passwordTooShortStrong');
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return t('passwordNeedsLetterNumber');
  if (!/[^a-zA-Z0-9]/.test(password)) return t('passwordNeedsSpecialChar');
  return null;
}
function passwordChecklistHtml(password) {
  const checks = [
    { ok: password.length >= 8, label: t('checklistLength') },
    { ok: /[a-zA-Z]/.test(password), label: t('checklistLetter') },
    { ok: /[0-9]/.test(password), label: t('checklistNumber') },
    { ok: /[^a-zA-Z0-9]/.test(password), label: t('checklistSpecial') },
  ];
  return checks.map(c => `<div style="font-size:12.5px;color:${c.ok ? 'var(--success,#3aa76d)' : 'var(--text-dim)'};">${c.ok ? '✓' : '○'} ${c.label}</div>`).join('');
}
function renderPasswordChecklist(inputId, containerId) {
  document.getElementById(containerId).innerHTML = passwordChecklistHtml(document.getElementById(inputId).value);
}
function showSetNewPasswordModal(sb) {
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${t('setNewPasswordTitle')}</h3>
    <div class="field"><label>${t('newPasswordLabel')}</label><input type="password" id="recoveryNewPassword" oninput="renderPasswordChecklist('recoveryNewPassword','recoveryChecklist')"></div>
    <div class="field"><label>${t('confirmNewPasswordLabel')}</label><input type="password" id="recoveryNewPasswordConfirm"></div>
    <div id="recoveryChecklist" style="margin-bottom:10px;">${passwordChecklistHtml('')}</div>
    <div id="recoveryMsg"></div>
    <button class="btn full" onclick="submitNewPassword()">${t('setNewPasswordBtn')}</button>`;
  window._recoverySbClient = sb;
  openModal('genericOverlay');
}
async function submitNewPassword() {
  const newPassword = document.getElementById('recoveryNewPassword').value;
  const confirmPassword = document.getElementById('recoveryNewPasswordConfirm').value;
  const msg = document.getElementById('recoveryMsg');
  if (newPassword !== confirmPassword) { msg.innerHTML = `<div class="msg error">${t('passwordsDontMatch')}</div>`; return; }
  const strengthError = passwordStrengthError(newPassword);
  if (strengthError) { msg.innerHTML = `<div class="msg error">${esc(strengthError)}</div>`; return; }
  window._recoveryPendingPassword = newPassword; // stashed so the MFA step below can retry with it
  console.log('[recovery debug] client exists:', !!window._recoverySbClient);
  const { data: sessionData, error: sessionErr } = await window._recoverySbClient.auth.getSession();
  console.log('[recovery debug] getSession result:', { hasSession: !!sessionData?.session, hasAccessToken: !!sessionData?.session?.access_token, error: sessionErr?.message });
  if (!sessionData || !sessionData.session) {
    msg.innerHTML = `<div class="msg error">${t('recoveryLinkExpiredDuringUse') || 'Your recovery link session was lost — please request a new password reset link and try again promptly.'}</div>`;
    return;
  }
  try {
    const { isSame } = await api('/api/auth/check-password-different', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, newPassword }) });
    console.log('[recovery debug] check-password-different result:', isSame);
    if (isSame) { msg.innerHTML = `<div class="msg error">${t('passwordSameAsCurrentError') || 'This is your current password — please choose a different one.'}</div>`; return; }
  } catch (e) {
    console.log('[recovery debug] check-password-different threw:', e.message);
    // if the check itself fails for some reason, fall through — Supabase's own updateUser() call below will still catch a same-password case, just later
  }
  await attemptRecoveryPasswordUpdate(newPassword);
}
async function attemptRecoveryPasswordUpdate(newPassword) {
  const msg = document.getElementById('recoveryMsg');
  const { error } = await window._recoverySbClient.auth.updateUser({ password: newPassword });
  if (error) {
    // The recovery link only ever establishes an aal1 session — if this
    // account has MFA enabled, Supabase correctly refuses a sensitive
    // change like a password reset until the session is elevated to aal2.
    // Without this step, anyone with MFA enabled who forgets their
    // password would be permanently locked out of recovery.
    if (/aal2/i.test(error.message)) { await showRecoveryMfaChallenge(); return; }
    msg.innerHTML = `<div class="msg error">${esc(error.message)}</div>`;
    return;
  }
  await window._recoverySbClient.auth.signOut();
  history.replaceState(null, '', location.pathname); // clear the recovery tokens from the URL
  msg.innerHTML = `<div class="msg success">${t('passwordResetSuccess')}</div>`;
  setTimeout(() => { closeModal('genericOverlay'); go('welcome'); }, 1500);
}
async function showRecoveryMfaChallenge() {
  const container = document.getElementById('genericModalContent');
  const { data: mfaData } = await window._recoverySbClient.auth.mfa.listFactors();
  const hasTotp = mfaData && mfaData.totp && mfaData.totp.length > 0;
  const { data: sessionData } = await window._recoverySbClient.auth.getSession();
  const recoveryAccessToken = sessionData.session.access_token;
  let hasEmailOtp = false;
  try {
    const status = await fetch('/api/auth/mfa/email-otp/status', { headers: { Authorization: `Bearer ${recoveryAccessToken}` } }).then(r => r.json());
    hasEmailOtp = !!status.enabled;
  } catch { /* treat as unavailable if the check itself fails */ }
  if (!hasTotp && !hasEmailOtp) {
    container.innerHTML = `<h3>${t('setNewPasswordTitle')}</h3><div class="msg error">${t('recoveryMfaUnavailableMsg') || 'Two-factor verification is required to reset this password, but no verified method could be found. Please contact support.'}</div>`;
    return;
  }
  if (hasTotp && hasEmailOtp) {
    const factorId = mfaData.totp[0].id;
    container.innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaChooseMethodHint') || "Choose how you'd like to verify it's you."}</div>
      <button class="btn full secondary" style="margin-bottom:8px;" onclick="showRecoveryTotpForm('${factorId}')">${t('mfaMethodAuthenticatorApp') || 'Authenticator app'}</button>
      <button class="btn full secondary" onclick="showRecoveryEmailOtpForm()">${t('mfaMethodEmail') || 'Email code'}</button>
      <a href="#" onclick="showRecoveryBackupCodePrompt();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('lostDeviceUseBackupLink') || 'Lost your authenticator? Use a backup code'}</a>`;
    return;
  }
  if (hasTotp) { showRecoveryTotpForm(mfaData.totp[0].id); return; }
  showRecoveryEmailOtpForm();
}
function showRecoveryTotpForm(factorId) {
  const container = document.getElementById('genericModalContent');
  container.innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('recoveryMfaRequiredHint') || 'This account has two-factor authentication enabled — enter a code from your authenticator app to finish resetting your password.'}</div>
    <div class="field"><label>${t('mfaCodeLabel')}</label><input id="recoveryMfaCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <div id="recoveryMsg"></div>
    <button class="btn full" onclick="submitRecoveryMfaCode('${factorId}')">${t('verifyBtn')}</button>
    <a href="#" onclick="showRecoveryBackupCodePrompt();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('lostDeviceUseBackupLink') || 'Lost your authenticator? Use a backup code'}</a>`;
}
async function showRecoveryEmailOtpForm() {
  const container = document.getElementById('genericModalContent');
  container.innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="hint" style="margin-bottom:12px;">${t('mfaEmailSendingHint') || 'Sending a code to your email...'}</div>`;
  try {
    const { data: sessionData } = await window._recoverySbClient.auth.getSession();
    await api('/api/auth/mfa/email-otp/request', { method: 'POST', body: JSON.stringify({ tempToken: sessionData.session.access_token }) });
    container.innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaEmailSentHint')}</div>
      <div class="field"><label>${t('mfaCodeLabel')}</label><input id="recoveryEmailOtpCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div id="recoveryMsg"></div>
      <button class="btn full" onclick="submitRecoveryEmailOtpCode()">${t('verifyBtn')}</button>
      <a href="#" onclick="showRecoveryBackupCodePrompt();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('lostDeviceUseBackupLink') || 'Lost your authenticator? Use a backup code'}</a>`;
  } catch (e) {
    container.innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="msg error">${esc(e.message)}</div>`;
  }
}
async function submitRecoveryEmailOtpCode() {
  const code = document.getElementById('recoveryEmailOtpCode').value.trim();
  const msg = document.getElementById('recoveryMsg');
  try {
    const { data: sessionData } = await window._recoverySbClient.auth.getSession();
    await api('/api/auth/mfa/email-otp/verify-for-recovery', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, code }) });
    await completeRecoveryWithStashedPassword();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function showRecoveryBackupCodePrompt() {
  const container = document.getElementById('genericModalContent');
  container.innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('recoveryBackupCodeHint') || 'Enter one of your backup codes.'}</div>
    <div class="field"><label>${t('backupCodeLabel') || 'Backup code'}</label><input id="recoveryBackupCode" autocomplete="one-time-code" placeholder="XXXXX-XXXXX"></div>
    <div id="recoveryMsg"></div>
    <button class="btn full" onclick="submitRecoveryBackupCode()">${t('verifyBtn')}</button>`;
}
async function submitRecoveryBackupCode() {
  const code = document.getElementById('recoveryBackupCode').value.trim();
  const msg = document.getElementById('recoveryMsg');
  try {
    const { data: sessionData } = await window._recoverySbClient.auth.getSession();
    await api('/api/auth/mfa/backup-codes/verify-for-recovery', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, code }) });
    await completeRecoveryWithStashedPassword();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
// Shared final step: the password was already collected and confirmed
// different from the current one on the very first screen — this just
// applies it now that MFA has been verified. No separate password screen
// needed, since there's nothing left to ask the user for.
async function completeRecoveryWithStashedPassword() {
  const msg = document.getElementById('recoveryMsg');
  try {
    const { data: sessionData } = await window._recoverySbClient.auth.getSession();
    await api('/api/auth/mfa/set-password-after-recovery', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, newPassword: window._recoveryPendingPassword }) });
    await window._recoverySbClient.auth.signOut();
    history.replaceState(null, '', location.pathname);
    document.getElementById('genericModalContent').innerHTML = `<h3>${t('setNewPasswordTitle')}</h3><div class="msg success">${t('passwordResetSuccess')}</div>`;
    setTimeout(() => { closeModal('genericOverlay'); go('welcome'); }, 1500);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function submitRecoveryMfaCode(factorId) {
  const code = document.getElementById('recoveryMfaCode').value.trim();
  const msg = document.getElementById('recoveryMsg');
  try {
    const { data: challenge, error: challengeErr } = await window._recoverySbClient.auth.mfa.challenge({ factorId });
    if (challengeErr) throw challengeErr;
    const { error: verifyErr } = await window._recoverySbClient.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyErr) throw verifyErr;
    // Session is now aal2 — the password update that failed before will succeed now.
    await attemptRecoveryPasswordUpdate(window._recoveryPendingPassword);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function boot() {
  await initSupabaseRecoveryFlow();
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('langSelect').value = state.lang;
  document.getElementById('saleOnHadamBlurb').textContent = t('saleOnHadamBlurb');
  document.getElementById('staticHelpLink').textContent = t('helpNavLabel') || 'Help';
  document.getElementById('saleOnHadamLink').textContent = t('saleOnHadam') + ' →';
  const [{ categories }, { products }, tenantInfo] = await Promise.all([api('/api/categories'), api('/api/products'), api('/api/tenant/info')]);
  state.categories = categories;
  state.products = products;
  state.tenantInfo = tenantInfo;
  const displayName = localized(tenantInfo, 'name');
  document.getElementById('storeLogoText').innerHTML = `${esc(state.lang === 'ar' ? displayName : displayName.toUpperCase())} <span class="dot">●</span>`;
  document.title = displayName;
  document.getElementById('saleOnHadamLink').href = platformUrl() + '/#marketplace';
  document.getElementById('storeFooterText').textContent = t('storeFooterText');
  document.getElementById('saleOnHadamBanner').style.display = marketplaceEnabled() ? 'flex' : 'none';
  if (state.token) {
    try { const { user } = await api('/api/auth/me'); state.user = user; }
    catch { state.token = null; localStorage.removeItem('hadam_token'); }
  }
  renderNav('welcome');
  const stripeOnboardingParam = new URLSearchParams(location.search).get('stripeOnboarding');
  if (stripeOnboardingParam && state.user && state.user.role === 'admin') {
    history.replaceState(null, '', location.pathname); // drop the query param from the URL bar
    state.adminTab = 'settings';
    state._stripeOnboardingReturn = stripeOnboardingParam; // 'return' or 'refresh' — read once by the settings panel to show the right message, then cleared
    return go('admin');
  }
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
        ${p.category.fulfillment === 'download' ? `<div class="hint">${p.digitalFile ? `${t('fileFormatLabel')}: ${esc((p.digitalFile.filename.split('.').pop() || '').toUpperCase())} · ${t('fileSizeLabel')}: ${Math.round((p.digitalFile.size||0)/1024)} KB` : ''}<br>Available for ${p.category.downloadWindowHours}h after purchase, ${p.category.maxDownloads} download(s) allowed.</div>` : ''}
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
function setQty(id, value) {
  const line = state.cart.find(l => l.productId === id);
  const n = parseInt(value, 10);
  line.qty = Number.isInteger(n) && n >= 1 ? n : 1;
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
    <h2 class="section-title">${t('yourCart')}${helpIcon('cart', { what: 'helpCartWhat', why: 'helpCartWhy', next: 'helpCartNext', rules: 'helpCartRules' })}</h2>
    <div class="panel" style="margin-bottom:18px;">
      ${lines.map(l => `
        <div class="order-item">
          <span>${ICONS[l.product.category.fulfillment]} ${esc(localized(l.product,'name'))}</span>
          <span style="display:flex;align-items:center;gap:8px;">
            <label style="color:var(--text-dim);font-size:13px;">${t('qtyLabel')}</label>
            <input type="number" min="1" step="1" value="${l.qty}" style="width:60px;" onchange="setQty('${l.productId}', this.value)">
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
        <div id="shipAddrWrap" class="field"><label>${t('shippingAddress')}${helpIcon('shipAddr', { what: 'helpShipAddrWhat', why: 'helpShipAddrWhy', next: 'helpShipAddrNext' })}</label><textarea id="shipAddr" rows="2" placeholder="${t('shippingAddressPlaceholder') || 'Street, city, postcode'}"></textarea></div>
      ` : `<div class="field"><label>${t('shippingAddress')}${helpIcon('shipAddr', { what: 'helpShipAddrWhat', why: 'helpShipAddrWhy', next: 'helpShipAddrNext' })}</label><textarea id="shipAddr" rows="2" placeholder="${t('shippingAddressPlaceholder') || 'Street, city, postcode'}"></textarea></div>`) : ''}
      <div class="field"><label>${t('cardNumber')}${helpIcon('checkoutCard', { what: 'helpCheckoutCardWhat', why: 'helpCheckoutCardWhy', next: 'helpCheckoutCardNext', rules: 'helpCheckoutCardRules', errors: 'helpCheckoutCardErrors' })}</label><input id="cardNum" dir="ltr" placeholder="4111 1111 1111 1111" maxlength="19"></div>
      <div class="row2">
        <div class="field"><label>${t('expiry')}</label><input id="cardExp" dir="ltr" placeholder="MM/YY"></div>
        <div class="field"><label>${t('cvv')}</label><input id="cardCvv" dir="ltr" placeholder="123"></div>
      </div>
      <div class="field"><label>${t('cardholderNameLabel')}</label><input id="cardName"></div>
      <button class="btn full" id="payBtn" onclick="checkout()">${t('pay')} $${total.toFixed(2)}</button>
      <button class="btn full ghost" style="margin-top:8px;" onclick="state.checkoutStep='cart'; renderCart();">← Back to cart</button>
      <div class="hint">Simulated payment provider. Use <code>4111 1111 1111 1111</code> for success or <code>0000 0000 0000 0000</code> to preview a decline.</div>
    </div>`;
  wireCardFieldValidation('');
}
function toggleShipAddr() {
  const wrap = document.getElementById('shipAddrWrap');
  if (wrap) wrap.style.display = document.getElementById('deliveryMethod').value === 'pickup' ? 'none' : 'block';
}
async function checkout() {
  const btn = document.getElementById('payBtn');
  const msg = document.getElementById('checkoutMsg');
  const card = {
    number: document.getElementById('cardNum').value, expiry: document.getElementById('cardExp').value,
    cvv: document.getElementById('cardCvv').value, holderName: document.getElementById('cardName').value,
  };
  const cardError = cardValidationError(card);
  if (cardError) { msg.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  btn.disabled = true; btn.textContent = t('processingBtn') || 'Processing…';
  try {
    const shipEl = document.getElementById('shipAddr');
    const deliveryEl = document.getElementById('deliveryMethod');
    const order = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: state.cart,
        deliveryMethod: deliveryEl ? deliveryEl.value : 'shipping',
        shippingAddress: shipEl ? shipEl.value : undefined,
        card,
      }),
    });
    state.cart = [];
    state.checkoutStep = 'cart';
    renderNav('cart');
    renderReceipt(order.order);
  } catch (e) {
    msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`;
    btn.disabled = false; btn.textContent = t('tryAgainBtn') || 'Try again';
  }
}
function renderReceipt(order) {
  document.getElementById('cartContent').innerHTML = `
    <div class="panel" style="max-width:480px;margin:0 auto;">
      <h3>✓ ${t('paymentSuccessfulH3')}</h3>
      <div class="hint">${order.id} · ${localeDate(new Date(order.createdAt))}</div>
      ${order.items.map(i => `
        <div class="order-item">
          <span>${ICONS[i.fulfillment]} ${esc(localized(i,'name'))}</span>
          ${i.fulfillment === 'download' ? `<button class="btn sm secondary" onclick="downloadItem('${order.id}','${i.productId}')">⬇ ${t('download')}</button> <button class="btn sm ghost" onclick="downloadItemImage('${order.id}','${i.productId}')">🖼️ ${t('downloadImageBtn')}</button>` :
            i.fulfillment === 'shipping' && i.deliveryMethod === 'pickup' ? `<span class="status-pill pending">${t('awaitingPickupStatus')}</span>` :
            i.fulfillment === 'shipping' ? `<span class="status-pill pending">${t('pendingShipmentStatus')}</span>` :
            i.fulfillment === 'booking' ? `<span class="status-pill requested">${t('requestedStatus')}</span>` : `<span class="status-pill pending">${t('pendingStatus')}</span>`}
        </div>
        ${i.fulfillment === 'booking' && i.meetingLink ? `<div class="msg success" style="margin:8px 0;"><a href="${esc(i.meetingLink)}" target="_blank" rel="noopener" style="color:inherit;font-weight:600;">🔗 ${t('joinMeetingBtn')}</a><div class="hint" style="margin-top:2px;">${t('meetingLinkAlsoEmailedHint') || 'This link has also been emailed to you.'}</div></div>`
          : i.fulfillment === 'booking' ? `<div class="hint" style="margin:8px 0;">${t('meetingLinkPendingHint') || 'A meeting link will be provided once available — we\'ll email it to you.'}</div>` : ''}`).join('')}
      <button class="btn full" style="margin-top:16px" onclick="go('orders')">${t('viewMyOrdersBtn')}</button>
    </div>`;
}
async function downloadItem(orderId, productId) {
  try {
    const info = await api(`/api/downloads/${orderId}/${productId}/info`);
    if (info.isCompressed) alert(t('compressedFileNotice').replace('{filename}', info.filename || ''));
    const res = await api(`/api/downloads/${orderId}/${productId}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = info.filename ? (info.isCompressed ? `${info.filename}.zip` : info.filename) : 'download';
    document.body.appendChild(a); a.click(); a.remove();
    if (document.getElementById('view-orders').classList.contains('active')) renderOrders();
  } catch (e) { alert(e.message); }
}
async function downloadItemImage(orderId, productId) {
  try {
    const res = await api(`/api/downloads/${orderId}/${productId}/image`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'product-image';
    document.body.appendChild(a); a.click(); a.remove();
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
function renderAuthModal(mode, error, info) {
  const c = document.getElementById('authModalContent');
  if (mode === 'login') {
    c.innerHTML = `<h3>${t('logIn')}</h3>
      ${error ? `<div class="msg error">${esc(error)}</div>` : ''}
      ${info ? `<div class="msg success">${esc(info)}</div>` : ''}
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
    if (data.demoResetToken !== undefined) {
      // Local/demo driver only — no real email provider is wired in, so the
      // reset code is shown directly here instead of actually being emailed.
      state.pendingResetToken = data.demoResetToken || '';
      renderAuthModal('reset');
      document.getElementById('forgotMsg')?.remove();
    } else {
      // Real Supabase driver — there is no code to enter in this app at all;
      // the person must click the actual link in their email, which lands
      // back on this site and is handled entirely by initSupabaseRecoveryFlow().
      renderAuthModal('login', null, t('checkEmailForResetLink'));
    }
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
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('liEmail').value, password: document.getElementById('liPass').value }) });
    if (result.mfaRequired) {
      showMfaLoginPrompt(result.tempToken, result.factorId, result.methods || ['totp']);
      return;
    }
    completeLogin(result);
  } catch (e) { renderAuthModal('login', e.message); }
}
function completeLogin(result) {
  state.user = result.user; state.token = result.token; localStorage.setItem('hadam_token', result.token);
  closeModal('authOverlay');
  if (result.mfaSetupRequired) {
    go('home');
    alert(t('mfaSetupRequiredNotice'));
    openAccountMenu();
    return;
  }
  go(result.user.role === 'admin' ? 'admin' : result.user.role === 'employee' ? 'employee' : 'home');
}
function showMfaLoginPrompt(tempToken, factorId, methods) {
  if (methods.length > 1) {
    document.getElementById('authModalContent').innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaChooseMethodHint') || 'Choose how you\'d like to verify it\'s you.'}</div>
      ${methods.includes('totp') ? `<button class="btn full secondary" style="margin-bottom:8px;" onclick="showMfaLoginPrompt('${tempToken}','${factorId}',['totp'])">${t('mfaMethodAuthenticatorApp') || 'Authenticator app'}</button>` : ''}
      ${methods.includes('email') ? `<button class="btn full secondary" style="margin-bottom:8px;" onclick="showEmailOtpLoginPrompt('${tempToken}')">${t('mfaMethodEmail') || 'Email code'}</button>` : ''}
      ${methods.includes('backup') ? `<button class="btn full secondary" onclick="showBackupCodeLoginPrompt('${tempToken}')">${t('mfaMethodBackup') || 'Backup code'}</button>` : ''}`;
    return;
  }
  if (methods[0] === 'email') { showEmailOtpLoginPrompt(tempToken); return; }
  if (methods[0] === 'backup') { showBackupCodeLoginPrompt(tempToken); return; }
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('mfaPromptHint')}</div>
    <div class="field"><label>${t('mfaCodeLabel')}</label><input id="mfaLoginCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <div id="mfaLoginMsg"></div>
    <button class="btn full" onclick="submitMfaLoginCode('${tempToken}','${factorId}')">${t('verifyBtn')}</button>`;
}
function showBackupCodeLoginPrompt(tempToken) {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('backupCodeLoginHint') || 'Enter one of your backup codes. Each one only works once.'}</div>
    <div class="field"><label>${t('backupCodeLabel') || 'Backup code'}</label><input id="backupLoginCode" autocomplete="one-time-code" placeholder="XXXXX-XXXXX"></div>
    <div id="mfaLoginMsg"></div>
    <button class="btn full" onclick="submitBackupCodeLogin('${tempToken}')">${t('verifyBtn')}</button>`;
}
async function submitBackupCodeLogin(tempToken) {
  const code = document.getElementById('backupLoginCode').value.trim();
  const msg = document.getElementById('mfaLoginMsg');
  try {
    const result = await api('/api/auth/mfa/backup-codes/verify', { method: 'POST', body: JSON.stringify({ tempToken, code }) });
    completeLogin(result);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function showEmailOtpLoginPrompt(tempToken) {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('mfaEmailSendingHint') || 'Sending a code to your email...'}</div>`;
  try {
    await api('/api/auth/mfa/email-otp/request', { method: 'POST', body: JSON.stringify({ tempToken }) });
    document.getElementById('authModalContent').innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaEmailSentHint') || 'Enter the code we just emailed you.'}</div>
      <div class="field"><label>${t('mfaCodeLabel')}${helpIcon('emailOtpCode', { what: 'helpEmailOtpWhat', why: 'helpEmailOtpWhy', next: 'helpEmailOtpNext', rules: 'helpEmailOtpRules', errors: 'helpEmailOtpErrors' })}</label><input id="emailOtpCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div id="mfaLoginMsg"></div>
      <button class="btn full" onclick="submitEmailOtpCode('${tempToken}')">${t('verifyBtn')}</button>
      <a href="#" onclick="showEmailOtpLoginPrompt('${tempToken}');return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('resendCodeLink') || 'Resend code'}</a>`;
  } catch (e) {
    document.getElementById('authModalContent').innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="msg error">${esc(e.message)}</div>`;
  }
}
async function submitEmailOtpCode(tempToken) {
  const code = document.getElementById('emailOtpCode').value.trim();
  const msg = document.getElementById('mfaLoginMsg');
  try {
    const result = await api('/api/auth/mfa/email-otp/verify', { method: 'POST', body: JSON.stringify({ tempToken, code }) });
    completeLogin(result);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function submitMfaLoginCode(tempToken, factorId) {
  const code = document.getElementById('mfaLoginCode').value.trim();
  const msg = document.getElementById('mfaLoginMsg');
  try {
    const result = await api('/api/auth/mfa/login-verify', { method: 'POST', body: JSON.stringify({ tempToken, factorId, code }) });
    completeLogin(result);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function doRegister() {
  try {
    const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: document.getElementById('rName').value, email: document.getElementById('rEmail').value, password: document.getElementById('rPass').value }) });
    if (!result.token) {
      // Email confirmation is required before a session exists — this is
      // Supabase's own enforced behavior, not something to work around.
      renderAuthModal('login', null, result.note || t('checkEmailToConfirm'));
      return;
    }
    state.user = result.user; state.token = result.token; localStorage.setItem('hadam_token', result.token);
    closeModal('authOverlay'); go('home');
  } catch (e) { renderAuthModal('register', e.message); }
}
function logout() { state.user = null; state.token = null; localStorage.removeItem('hadam_token'); closeModal('accountOverlay'); go('welcome'); }

/* ---------------- account menu: change password + logout ---------------- */
async function openAccountMenu(scrollTo) {
  const roleLabel = { admin: t('roleAdministrator'), employee: t('roleEmployee'), client: t('roleCustomer'), superadmin: t('roleSuperadmin') }[state.user.role] || state.user.role;
  document.getElementById('accountModalContent').innerHTML = `
    <h3>${t('securitySettingsTitle')}</h3>
    <div style="background:var(--bg-2,#1a1830);border-radius:8px;padding:12px;margin-bottom:16px;">
      <div class="hint" style="margin:0 0 6px;">${t('signedInAsLabel')}</div>
      <div>📧 ${esc(state.user.email)}</div>
      <div style="margin-top:2px;">👤 ${t('roleLabel')}: ${roleLabel}</div>
    </div>
    <div id="accountMsg"></div>
    <div style="border-top:1px solid var(--border);padding-top:14px;">
      <label style="font-weight:600;">${t('passwordSectionTitle')}</label>
      <div class="field" style="margin-top:10px;"><label>${t('currentPasswordLabel')}</label><input id="cpCurrent" type="password"></div>
      <div class="field"><label>${t('newPasswordLabel')}</label><input id="cpNew" type="password" oninput="renderPasswordChecklist('cpNew','cpChecklist')"></div>
      <div class="field"><label>${t('confirmNewPasswordLabel')}</label><input id="cpNewConfirm" type="password"></div>
      <div id="cpChecklist" style="margin-bottom:10px;">${passwordChecklistHtml('')}</div>
      <button class="btn full" onclick="doChangePassword()">${t('updatePasswordBtn')}</button>
    </div>
    <div id="mfaSectionWrapper" style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
      <label style="font-weight:600;">${t('mfaSectionTitle')}</label>
      <div class="hint" style="margin:4px 0 10px;">${t('mfaSectionHint')}</div>
      <div id="mfaStatusContainer">${t('loadingLabel')}</div>
    </div>
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
      <label style="font-weight:600;">${t('emailOtpSectionTitle') || 'Email verification code'}</label>
      <div class="hint" style="margin:4px 0 10px;">${t('emailOtpSectionHint') || 'No authenticator app? Get a one-time code by email instead when logging in.'}</div>
      <div id="emailOtpStatusContainer">${t('loadingLabel')}</div>
    </div>
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
      <label style="font-weight:600;">${t('backupCodesSectionTitle') || 'Backup codes'}</label>
      <div class="hint" style="margin:4px 0 10px;">${t('backupCodesSectionHint') || 'One-time codes to get in if you lose access to your authenticator app or email.'}</div>
      <div id="backupCodesStatusContainer">${t('loadingLabel')}</div>
    </div>
    <button class="btn full secondary" style="margin-top:16px;" onclick="logout()">${t('logout')}</button>
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
      <button class="btn full danger" onclick="openDeleteAccount()">${t('deleteMyAccountBtn')}</button>
    </div>`;
  openModal('accountOverlay');
  renderMfaStatus();
  renderEmailOtpStatus();
  renderBackupCodesStatus();
  if (scrollTo === 'mfa') {
    // "Set up two-factor authentication" from the Security & Access tab
    // used to just open this whole modal at the top (Password section),
    // silently leaving the person to scroll and search for the MFA section
    // themselves. Scrolling straight to it, with a brief highlight, removes
    // that guesswork entirely.
    setTimeout(() => {
      const target = document.getElementById('mfaSectionWrapper');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.transition = 'background-color 0.3s ease';
        target.style.backgroundColor = 'var(--accent-dim, rgba(245,166,35,0.15))';
        setTimeout(() => { target.style.backgroundColor = ''; }, 1800);
      }
    }, 150);
  }
}
async function renderBackupCodesStatus() {
  const container = document.getElementById('backupCodesStatusContainer');
  try {
    const [{ remaining }, { factors }, { enabled: emailOtpEnabled }] = await Promise.all([
      api('/api/auth/mfa/backup-codes/status'),
      api('/api/auth/mfa/factors').catch(() => ({ factors: [] })),
      api('/api/auth/mfa/email-otp/status').catch(() => ({ enabled: false })),
    ]);
    const hasPrimaryMethod = factors.some(f => f.status === 'verified') || emailOtpEnabled;
    const warning = !hasPrimaryMethod
      ? `<div class="msg error" style="margin-bottom:8px;">${t('backupCodesNoPrimaryWarning') || 'Backup codes are a fallback, not a login method on their own — enable the authenticator app or email code above first, or these codes will never be asked for at login.'}</div>`
      : '';
    container.innerHTML = `
      ${warning}
      <div class="hint" style="margin-bottom:8px;">${remaining > 0 ? `${remaining} ${t('backupCodesRemainingLabel') || 'unused codes remaining'}` : t('noBackupCodesLabel') || 'No backup codes generated yet.'}</div>
      <button class="btn sm secondary" onclick="confirmGenerateBackupCodes()">${remaining > 0 ? (t('regenerateBackupCodesBtn') || 'Regenerate codes') : (t('generateBackupCodesBtn') || 'Generate backup codes')}</button>`;
  } catch (e) { container.innerHTML = `<span class="hint" style="margin:0">${t('mfaUnavailableHint')}</span>`; }
}
async function confirmGenerateBackupCodes() {
  if (!confirm(t('regenerateBackupCodesConfirm') || 'This will invalidate any existing backup codes. Continue?')) return;
  const container = document.getElementById('backupCodesStatusContainer');
  try {
    const { codes } = await api('/api/auth/mfa/backup-codes/generate', { method: 'POST' });
    showBackupCodesModal(codes);
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function showBackupCodesModal(codes) {
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${t('yourBackupCodesTitle') || 'Your backup codes'}</h3>
    <div class="hint" style="margin-bottom:10px;">${t('backupCodesWarning') || 'Save these somewhere safe — each code works once, and this is the only time they\'ll be shown.'}</div>
    <div style="background:var(--surface-2,#1b1e29);border-radius:8px;padding:12px;font-family:monospace;font-size:15px;line-height:2;text-align:center;margin-bottom:12px;">${codes.join('<br>')}</div>
    <button class="btn full" onclick="downloadBackupCodes(${JSON.stringify(codes).replace(/"/g,'&quot;')})">${t('downloadCodesBtn') || 'Download as text file'}</button>
    <button class="btn full secondary" style="margin-top:8px;" onclick="closeModal('genericOverlay');renderBackupCodesStatus();">${t('doneBtn') || 'Done'}</button>`;
  openModal('genericOverlay');
}
function downloadBackupCodes(codes) {
  const blob = new Blob([`Hadam backup codes\n\n${codes.join('\n')}\n\nEach code works once. Keep this file somewhere safe.`], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'hadam-backup-codes.txt';
  link.click();
}
async function renderEmailOtpStatus() {
  const container = document.getElementById('emailOtpStatusContainer');
  try {
    const { enabled } = await api('/api/auth/mfa/email-otp/status');
    if (enabled) {
      container.innerHTML = `<span class="status-pill success">✅ ${t('emailOtpEnabledLabel') || 'Email code enabled'}</span>
        <button class="btn danger sm" style="margin-inline-start:8px;" onclick="toggleEmailOtp(false)">${t('disableBtn') || 'Disable'}</button>`;
    } else {
      container.innerHTML = `<button class="btn sm secondary" onclick="toggleEmailOtp(true)">${t('emailOtpEnableBtn') || 'Enable email code'}</button>`;
    }
  } catch { container.innerHTML = `<span class="hint" style="margin:0">${t('mfaUnavailableHint')}</span>`; }
}
async function toggleEmailOtp(enabled) {
  try {
    await api('/api/auth/mfa/email-otp/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
    renderEmailOtpStatus();
  } catch (e) { alert(e.message); }
}
async function renderMfaStatus() {
  const container = document.getElementById('mfaStatusContainer');
  try {
    const { factors } = await api('/api/auth/mfa/factors');
    const verified = factors.find(f => f.status === 'verified');
    if (verified) {
      container.innerHTML = `<span class="status-pill success">✅ ${t('mfaEnabledLabel')}</span>
        <button class="btn danger sm" style="margin-inline-start:8px;" onclick="disableMfa('${verified.id}')">${t('disableMfaBtn')}</button>`;
    } else {
      container.innerHTML = `<button class="btn sm secondary" onclick="startMfaEnrollment()">${t('enableMfaBtn')}</button>`;
    }
  } catch { container.innerHTML = `<span class="hint" style="margin:0">${t('mfaUnavailableHint')}</span>`; }
}
async function disableMfa(factorId) {
  if (!confirm(t('disableMfaConfirm'))) return;
  try {
    await api(`/api/auth/mfa/factors/${factorId}`, { method: 'DELETE' });
    renderMfaStatus();
  } catch (e) { alert(e.message); }
}
async function startMfaEnrollment() {
  const container = document.getElementById('mfaStatusContainer');
  try {
    const { factorId, qrCode, secret } = await api('/api/auth/mfa/enroll', { method: 'POST' });
    container.innerHTML = `
      <div class="hint" style="margin-bottom:8px;">${t('mfaScanHint')}</div>
      <img src="${esc(qrCode)}" alt="${t('mfaScanHint')}" style="display:block;margin-bottom:8px;width:280px;height:280px;background:white;padding:8px;" onerror="this.style.display='none';document.getElementById('mfaQrError').style.display='block';">
      <div id="mfaQrError" class="msg error" style="display:none;margin-bottom:8px;">${t('mfaQrLoadErrorMsg') || 'The QR code image failed to load — use the manual entry code below instead.'}</div>
      <div class="hint" style="margin-bottom:10px;">${t('mfaManualEntryLabel')}: <code>${esc(secret)}</code></div>
      <div class="field"><label>${t('mfaCodeLabel')}</label><input id="mfaEnrollCode" dir="ltr" inputmode="numeric" maxlength="6"></div>
      <div id="mfaEnrollMsg"></div>
      <button class="btn full" onclick="confirmMfaEnrollment('${factorId}')">${t('verifyBtn')}</button>`;
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function confirmMfaEnrollment(factorId) {
  const code = document.getElementById('mfaEnrollCode').value.trim();
  const msg = document.getElementById('mfaEnrollMsg');
  try {
    await api('/api/auth/mfa/verify-enrollment', { method: 'POST', body: JSON.stringify({ factorId, code }) });
    msg.innerHTML = `<div class="msg success">${t('mfaEnabledSuccessMsg')}</div>`;
    setTimeout(renderMfaStatus, 1200);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
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
  const newPassword = document.getElementById('cpNew').value;
  const confirmPassword = document.getElementById('cpNewConfirm').value;
  if (newPassword !== confirmPassword) { msg.innerHTML = `<div class="msg error">${t('passwordsDontMatch')}</div>`; return; }
  const strengthError = passwordStrengthError(newPassword);
  if (strengthError) { msg.innerHTML = `<div class="msg error">${esc(strengthError)}</div>`; return; }
  try {
    await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({
      currentPassword: document.getElementById('cpCurrent').value,
      newPassword,
    }) });
    msg.innerHTML = `<div class="msg success">✅ ${t('passwordChangedMsg')}<br><span style="font-size:12.5px;">${t('passwordChangedDetail')}</span></div>`;
    document.getElementById('cpCurrent').value = ''; document.getElementById('cpNew').value = ''; document.getElementById('cpNewConfirm').value = '';
    document.getElementById('cpChecklist').innerHTML = passwordChecklistHtml('');
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
          <a href="${platformUrl()}?lang=${state.lang}&plan=store#sell" target="_blank" class="btn secondary">${t('hireStoreOnly')} ${state.lang === 'ar' ? '←' : '→'}</a>
          <a href="${platformUrl()}?lang=${state.lang}&plan=marketplace#sell" target="_blank" class="btn secondary">${t('hireMarketplaceOnly')} ${state.lang === 'ar' ? '←' : '→'}</a>
          <a href="${platformUrl()}?lang=${state.lang}&plan=both#sell" target="_blank" class="btn">${t('hireBoth')} ${state.lang === 'ar' ? '←' : '→'}</a>
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
        <div class="oh"><span>${o.id} · ${localeDate(new Date(o.createdAt))}</span><span class="status-pill ${o.paymentStatus}">${o.paymentStatus}</span> <span class="status-pill ${o.status}">${t('orderStatus_'+o.status)}</span></div>
        ${o.items.map(i => `
          <div class="order-item">
            <span>${ICONS[i.fulfillment]} ${esc(localized(i,'name'))} ${i.sku ? `<span style="color:var(--text-dim);font-size:12px;">(${esc(i.sku)})</span>` : ''} <span style="color:var(--text-dim)">× ${i.qty}</span></span>
            <span style="display:flex;align-items:center;gap:8px;">
              <span class="price">$${(i.price * i.qty).toFixed(2)}</span>
              ${statusExtra(i, o.id)}
              <span class="status-pill ${i.status}">${i.status.replace('_', ' ')}</span>
            </span>
          </div>`).join('')}
        <div class="order-item" style="font-weight:700;"><span>${t('total')}</span><span class="price">$${o.total.toFixed(2)}</span></div>
      </div>`).join(''));
}
async function requestRefund(orderId, productId) {
  const reason = prompt('Why are you requesting a refund? (optional)') || '';
  try {
    await api(`/api/orders/${orderId}/items/${productId}/request-refund`, { method: 'POST', body: JSON.stringify({ reason }) });
    renderOrders();
  } catch (e) { alert(e.message); }
}
async function confirmDeliveryReceipt(orderId, productId) {
  if (!confirm(t('confirmReceiptConfirm') || 'I confirm that I received this order.')) return;
  try {
    await api(`/api/orders/${orderId}/items/${productId}/confirm-receipt`, { method: 'POST' });
    renderOrders();
  } catch (e) { alert(e.message); }
}
async function reportDeliveryProblem(orderId, productId) {
  const note = prompt(t('reportProblemPrompt') || "What went wrong? (e.g. never arrived, damaged, wrong item)") || '';
  try {
    await api(`/api/orders/${orderId}/items/${productId}/report-problem`, { method: 'POST', body: JSON.stringify({ note }) });
    renderOrders();
  } catch (e) { alert(e.message); }
}
function statusExtra(i, orderId) {
  const parts = [];
  if (i.fulfillment === 'download') {
    if (i.status === 'ready') {
      parts.push(`<button class="btn sm secondary" onclick="downloadItem('${orderId}','${i.productId}')">⬇ ${t('download')}</button>`);
    } else if (i.status === 'downloaded') {
      parts.push(`<span class="hint" style="margin:0">${t('alreadyDownloadedLabel')}${i.firstDownloadedAt ? ' — ' + localeDate(new Date(i.firstDownloadedAt)) : ''}</span>`);
    }
    // The product image is never gated by the file's own download limit —
    // customers can still view/download it even after using up their
    // downloads for the file itself.
    if (i.status !== 'refunded') {
      parts.push(`<button class="btn sm ghost" onclick="downloadItemImage('${orderId}','${i.productId}')">🖼️ ${t('downloadImageBtn')}</button>`);
    }
  }
  if (i.fulfillment === 'shipping' && i.trackingNote) parts.push(`<span class="hint" style="margin:0">${esc(i.trackingNote)}</span>`);
  if (i.fulfillment === 'shipping' && i.status === 'delivered') {
    if (i.customerConfirmedAt) {
      parts.push(`<span class="hint" style="margin:0;color:var(--success,#4caf50);">✓ ${t('customerConfirmedReceivedLabel') || 'Received by you'} — ${localeDate(new Date(i.customerConfirmedAt))}</span>`);
    } else if (i.customerReportedProblem) {
      parts.push(`<span class="hint" style="margin:0;color:var(--danger,#e57373);">${t('problemReportedLabel') || 'Problem reported'} — ${localeDate(new Date(i.customerProblemReportedAt))}</span>`);
    } else {
      parts.push(`<button class="btn sm secondary" onclick="confirmDeliveryReceipt('${orderId}','${i.productId}')">${t('confirmReceiptBtn') || 'Confirm Receipt'}</button>`);
      parts.push(`<button class="btn sm ghost" onclick="reportDeliveryProblem('${orderId}','${i.productId}')">${t('reportProblemBtn') || 'Report a Problem'}</button>`);
      parts.push(helpIcon('deliveryConfirm-' + i.productId, { what: 'helpDeliveryConfirmWhat', why: 'helpDeliveryConfirmWhy', next: 'helpDeliveryConfirmNext', errors: 'helpDeliveryConfirmErrors' }));
    }
  }
  if (i.fulfillment === 'booking' && i.scheduledAt) parts.push(`<span class="hint" style="margin:0">${localeDate(new Date(i.scheduledAt))}</span>`);
  if (i.fulfillment === 'booking' && i.meetingLink && i.status !== 'refunded') {
    parts.push(`<a href="${esc(i.meetingLink)}" target="_blank" rel="noopener" class="btn sm secondary">🔗 ${t('joinMeetingBtn')}</a>`);
  } else if (i.fulfillment === 'booking' && !i.meetingLink && i.status !== 'refunded') {
    parts.push(`<span class="hint" style="margin:0">${t('meetingLinkPendingHint') || 'A meeting link will be provided once available — we\'ll email it to you.'}</span>`);
  }
  if (i.refundStatus === 'requested') {
    parts.push(`<span class="hint" style="margin:0">${t('refundRequestedStatus')}</span>`);
  } else if (i.refundStatus === 'approved') {
    parts.push(`<button class="btn sm secondary" onclick="showRefundPaymentForm('${orderId}','${i.productId}')">${t('confirmRefundPaymentBtn') || 'Confirm refund payment method'}</button>`);
    parts.push(helpIcon('refundPayBtn-' + i.productId, { what: 'helpRefundPayBtnWhat', why: 'helpRefundPayBtnWhy', next: 'helpRefundPayBtnNext', rules: 'helpRefundPayBtnRules' }));
  } else if (i.refundStatus === 'rejected') {
    parts.push(`<span class="hint" style="margin:0;color:var(--danger,#e57373);">${t('refundRejectedStatus') || 'Refund request declined'}${i.refundDecisionReason ? `: ${esc(i.refundDecisionReason)}` : ''}</span>`);
  } else if (i.fulfillment === 'download' && i.firstDownloadedAt) {
    // Once a digital product has actually been downloaded, refunds are no
    // longer offered at all — not even the request button, matching the
    // policy that access to digital content can't be taken back.
    parts.push(`<span class="hint" style="margin:0">${t('noRefundAfterDownloadHint')}</span>`);
  } else if (!['refunded', 'payment_failed'].includes(i.status)) {
    parts.push(`<button class="btn ghost sm" onclick="requestRefund('${orderId}','${i.productId}')">${t('requestRefundBtn')}</button>`);
    parts.push(helpIcon('requestRefundBtn-' + i.productId, { what: 'helpRequestRefundWhat', why: 'helpRequestRefundWhy', next: 'helpRequestRefundNext', rules: 'helpRequestRefundRules' }));
  }
  return parts.join(' ');
}
function showRefundPaymentForm(orderId, productId) {
  const container = document.getElementById('genericModalContent');
  container.innerHTML = `
    <h3>${t('confirmRefundPaymentBtn') || 'Confirm refund payment method'}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('refundPaymentHint') || "Your refund has been approved. Please confirm where it should be sent — this can be a different card than the one you paid with."}</div>
    <div class="field"><label>${t('cardNumber')}</label><input id="rfCardNum" dir="ltr" placeholder="4111 1111 1111 1111" maxlength="19" autocomplete="off"></div>
    <div class="row2">
      <div class="field"><label>${t('expiry')}</label><input id="rfCardExp" dir="ltr" placeholder="MM/YY" autocomplete="off"></div>
      <div class="field"><label>${t('cvv')}</label><input id="rfCardCvv" dir="ltr" placeholder="123" autocomplete="off"></div>
    </div>
    <div class="field"><label>${t('cardholderNameLabel')}</label><input id="rfCardName" autocomplete="off"></div>
    <div class="hint">${t('signupPaymentHint') || 'Simulated payment. Use 4111 1111 1111 1111 for success or 0000 0000 0000 0000 to preview a decline.'}</div>
    <div id="refundPayMsg"></div>
    <button class="btn full" style="margin-top:10px;" onclick="submitRefundPayment('${orderId}','${productId}')">${t('submitRefundPaymentBtn') || 'Submit'}</button>`;
  openModal('genericOverlay');
  wireCardFieldValidation('rf');
}
async function submitRefundPayment(orderId, productId) {
  const msg = document.getElementById('refundPayMsg');
  const card = {
    number: document.getElementById('rfCardNum').value, expiry: document.getElementById('rfCardExp').value,
    cvv: document.getElementById('rfCardCvv').value, holderName: document.getElementById('rfCardName').value,
  };
  const cardError = cardValidationError(card);
  if (cardError) { msg.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  try {
    await api(`/api/orders/${orderId}/items/${productId}/submit-refund-payment`, { method: 'POST', body: JSON.stringify({ card }) });
    closeModal('genericOverlay');
    renderOrders();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
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
          ${q.item.status === 'refunded' ? `<div class="hint">${t('refundedByOn').replace('{by}', q.item.refundedBy).replace('{date}', localeDate(new Date(q.item.refundedAt)))}${q.item.refundReason ? ` — "${q.item.refundReason}"` : ''}</div>` : `
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
              ${helpIcon('fqStatus-' + q.item.productId, { what: 'helpFqStatusWhat', why: 'helpFqStatusWhy', next: 'helpFqStatusNext', rules: 'helpFqStatusRules' })}
            </div>
            <button class="btn sm" style="margin-top:8px" onclick="updateItem('${q.orderId}','${q.item.productId}','shipping')">${t('save')}</button>
            <button class="btn sm ghost" style="margin-top:8px" onclick="runTrackingSelfTest('${q.orderId}','${q.item.productId}', this)">${t('runTrackingSelfTestBtn') || 'Run Tracking Self-Test'}</button>${helpIcon('fqSelfTest-' + q.item.productId, { what: 'helpFqSelfTestWhat', why: 'helpFqSelfTestWhy', next: 'helpFqSelfTestNext', rules: 'helpFqSelfTestRules' })}
            <div id="selftest-${q.orderId}-${q.item.productId}"></div>
            ${q.item.customerConfirmedAt ? `<div class="hint" style="margin-top:6px;color:var(--success,#4caf50);">✓ ${t('customerConfirmedReceivedLabelStaff') || 'Customer confirmed receipt'} — ${localeDate(new Date(q.item.customerConfirmedAt))}</div>`
              : q.item.customerReportedProblem ? `<div class="hint" style="margin-top:6px;color:var(--danger,#e57373);">⚠ ${t('customerReportedProblemLabelStaff') || 'Customer reported a problem'} — ${localeDate(new Date(q.item.customerProblemReportedAt))}${q.item.customerProblemNote ? `: "${esc(q.item.customerProblemNote)}"` : ''}</div>`
              : q.item.status === 'delivered' ? `<div class="hint" style="margin-top:6px;">${t('awaitingCustomerConfirmationLabel') || 'Awaiting customer confirmation'}</div>` : ''}
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
          ${q.item.refundStatus === 'requested' ? `
            <div class="msg" style="margin-top:8px;background:var(--surface-2,#232735);">
              <strong>${t('refundRequestedByCustomerLabel') || 'Refund requested by customer'}</strong>
              <div class="hint" style="margin-top:4px;">${t('reasonLabel') || 'Reason'}: ${esc(q.item.refundRequestReason || '(none given)')}</div>
              <div class="hint">${t('requestedAtLabel') || 'Requested'}: ${localeDate(new Date(q.item.refundRequestedAt))}</div>
              <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
                <button class="btn sm" onclick="decideRefund('${q.orderId}','${q.item.productId}','approve')">${t('approveRefundBtn') || 'Approve'}</button>
                <button class="btn sm danger" onclick="decideRefund('${q.orderId}','${q.item.productId}','reject')">${t('rejectRefundBtn') || 'Reject'}</button>
                ${helpIcon('fqRefundDecision-' + q.item.productId, { what: 'helpFqRefundWhat', why: 'helpFqRefundWhy', next: 'helpFqRefundNext', rules: 'helpFqRefundRules' })}
              </div>
            </div>
          ` : q.item.refundStatus === 'approved' ? `
            <div class="hint" style="margin-top:8px;">${t('refundApprovedAwaitingPaymentLabel') || 'Refund approved — awaiting customer payment confirmation'}</div>
          ` : q.item.refundStatus === 'rejected' ? `
            <div class="hint" style="margin-top:8px;">${t('refundRejectedByStaffLabel') || 'Refund rejected'}${q.item.refundDecisionReason ? `: ${esc(q.item.refundDecisionReason)}` : ''}</div>
          ` : q.item.status !== 'refunded' ? `
            <button class="btn danger sm" style="margin-top:8px" onclick="decideRefund('${q.orderId}','${q.item.productId}','approve')">${t('refundThisItemBtn')}</button>
          ` : ''}
          `}
        </div>`).join('');
  } else {
    const { orders } = await api('/api/employee/orders');
    el.innerHTML = orders.length === 0 ? `<div class="empty">${t('noOrdersYet')}</div>` :
      orders.map(o => `
        <div class="order-card">
          <div class="oh"><span>${o.id} · ${esc(o.clientName)} (${esc(o.clientEmail)}) · ${localeDate(new Date(o.createdAt))}</span><span class="status-pill ${o.paymentStatus}">${o.paymentStatus}</span></div>
          ${o.items.map(i => `
            <div class="order-item">
              <span>${ICONS[i.fulfillment]} ${esc(localized(i,'name'))} <span style="color:var(--text-dim)">$${i.price.toFixed(2)} × ${i.qty}</span></span>
              <span style="display:flex;align-items:center;gap:8px;">
                <span class="status-pill ${i.status}">${i.status.replace('_',' ')}</span>
                ${i.refundStatus === 'requested' ? `<button class="btn sm" onclick="decideRefund('${o.id}','${i.productId}','approve')">${t('approveRefundBtn') || 'Approve'}</button><button class="btn sm danger" onclick="decideRefund('${o.id}','${i.productId}','reject')">${t('rejectRefundBtn') || 'Reject'}</button>`
                  : i.refundStatus === 'approved' ? `<span class="hint" style="margin:0;">${t('refundApprovedAwaitingPaymentLabel') || 'Awaiting customer payment'}</span>`
                  : i.refundStatus === 'rejected' ? `<span class="hint" style="margin:0;">${t('refundRejectedByStaffLabel') || 'Refund rejected'}</span>`
                  : o.paymentStatus === 'success' && i.status !== 'refunded' ? `<button class="btn ghost sm" onclick="decideRefund('${o.id}','${i.productId}','approve')">${t('refundBtn')}</button>` : ''}
              </span>
            </div>`).join('')}
        </div>`).join('') + helpIcon('employeeOrdersTab', { why: 'helpEmployeeOrdersWhy', next: 'helpEmployeeOrdersNext' });
  }
}
async function decideRefund(orderId, productId, decision) {
  const reason = prompt(decision === 'reject' ? (t('rejectReasonPrompt') || 'Reason for rejecting this refund:') : t('refundReasonPrompt')) || '';
  try {
    await api(`/api/employee/orders/${orderId}/items/${productId}/refund-decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) });
    renderEmployeeTab();
  } catch (e) { alert(e.message); }
}
async function runTrackingSelfTest(orderId, productId, btn) {
  if (btn) { if (btn.disabled) return; btn.disabled = true; } // guards against a double-click starting two overlapping runs that write over each other
  const container = document.getElementById(`selftest-${orderId}-${productId}`);
  container.innerHTML = `<div class="hint" style="margin-top:6px;">${t('runningTestHint') || 'Running self-test...'}</div>`;
  try {
    const { pass, steps } = await api(`/api/admin/orders/${orderId}/items/${productId}/run-tracking-self-test`, { method: 'POST' });
    container.innerHTML = `
      <div class="msg ${pass ? 'success' : 'error'}" style="margin-top:6px;">
        <strong>${pass ? '✓ ' + (t('selfTestPassed') || 'All checks passed') : '✗ ' + (t('selfTestFailed') || 'A check failed')}</strong>
        <ul style="margin:6px 0 0 18px;padding:0;font-size:13px;">
          ${steps.map(s => `<li>${s.pass ? '✓' : '✗'} ${esc(s.step)}: ${esc(s.detail)}</li>`).join('')}
        </ul>
      </div>`;
  } catch (e) { container.innerHTML = `<div class="msg error" style="margin-top:6px;">${esc(e.message)}</div>`; }
  finally { if (btn) btn.disabled = false; }
}
async function updateItem(orderId, productId, kind) {
  const status = document.getElementById(`sel-${orderId}-${productId}`).value;
  const body = { status };
  const noteEl = document.getElementById(`note-${orderId}-${productId}`);
  if (noteEl) body.trackingNote = noteEl.value;
  const schedEl = document.getElementById(`sched-${orderId}-${productId}`);
  if (schedEl && schedEl.value) body.scheduledAt = new Date(schedEl.value).getTime();
  try {
    await api(`/api/employee/orders/${orderId}/items/${productId}`, { method: 'PATCH', body: JSON.stringify(body) });
    renderEmployeeTab();
  } catch (e) { alert(e.message); }
}

/* ---------------- admin ---------------- */
async function renderAdmin() {
  const el = document.getElementById('adminContent');
  let bannerHtml = '';
  try {
    const info = await api('/api/tenant/info');
    if (info.subscriptionAlertLevel) {
      bannerHtml = `<div class="msg error" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <span>${info.subscriptionAlertLevel === 'expired' ? t('subExpiredBanner') : t('subExpiringBanner').replace('{days}', info.daysUntilExpiry)}</span>
        <button class="btn sm" onclick="state.adminTab='settings';renderAdmin();">${t('renewNowBtn')}</button>
      </div>`;
    }
  } catch { /* if this fails, just skip the banner rather than breaking the whole dashboard */ }
  el.innerHTML = `<h2 class="section-title">${t('dashboard')}</h2>
    ${bannerHtml}
    <div class="admin-tabs">
      ${['stats','reports','products','digitalProducts','categories','employees','orders','security','settings'].map(tabKey=>`<button class="admin-tab ${state.adminTab===tabKey?'active':''}" onclick="setAdminTab('${tabKey}')">${tabKey==='settings' ? t('storeSettingsTab') : tabKey==='reports' ? t('reportsTab') : tabKey==='digitalProducts' ? t('digitalProductsTab') : tabKey==='security' ? t('securityAccessTab') : t(tabKey)}</button>`).join('')}
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
      <div class="stat-card"><div class="n">$${s.revenue.toFixed(2)}</div><div class="l">${t('netRevenue')}${helpIcon('adminStats', { why: 'helpAdminStatsWhy', next: 'helpAdminStatsNext' })}</div></div>
      <div class="stat-card"><div class="n">$${s.refundedTotal.toFixed(2)}</div><div class="l">${t('refundedLabel')} (${s.refundedItemCount})${helpIcon('adminStatsRefunded', { why: 'helpAdminStatsRefundedWhy', next: 'helpAdminStatsRefundedNext' })}</div></div>
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
        <h3>${t('stockLevelsH3')} ${s.lowStock.length ? `<span class="status-pill failed" style="margin-inline-start:6px">${s.lowStock.length} ${t('lowBadge')}</span>` : ''}</h3>
        ${s.stockLevels.length === 0 ? `<div class="hint">${t('noStockTracked')}</div>` : `<table><thead><tr><th>${t('productCol')}</th><th>${t('stockCol')}</th></tr></thead><tbody>
          ${s.stockLevels.map(p => `<tr><td>${esc(p.name)}</td><td>${p.stock <= s.lowStockThreshold ? `<span class="status-pill failed">${p.stock} ${t('leftBadge')}</span>` : p.stock}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
    </div>`;
  } else if (state.adminTab === 'products') {
    const { products } = await api('/api/products');
    state._products = products;
    // This is a secondary, non-essential lookup (just for the "no file"
    // warning badge) — if it fails for any reason, the products list itself
    // must still render correctly rather than showing nothing at all.
    try {
      const { digitalProducts } = await api('/api/admin/digital-products');
      state._missingFileIds = new Set(digitalProducts.filter(d => !d.hasFile).map(d => d.productId));
    } catch (e) {
      console.error('Could not load digital product file status:', e.message);
      state._missingFileIds = new Set();
    }
    body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center;">
      <span style="color:var(--text-dim);font-size:13.5px">${products.length} ${t('products')}${helpIcon('adminProducts', { what: 'helpAdminProductsWhat', why: 'helpAdminProductsWhy', next: 'helpAdminProductsNext', rules: 'helpAdminProductsRules' })}</span>
      <button class="btn sm" onclick="openProductForm(null)">${t('addProduct')}</button></div>
      <div style="margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <input id="productSearch" placeholder="${t('searchProductsPlaceholder')}" oninput="renderProductsTable()" style="width:100%;max-width:320px;">
        <input id="bulkTranslateLangProducts" placeholder="${t('langCodeShortPlaceholder')}" list="langSuggestions" style="width:90px;">
        <button class="btn sm secondary" onclick="bulkAutoTranslate('products','bulkTranslateLangProducts','bulkTranslateMsgProducts')">${t('autoTranslateAllBtn')}</button>
      </div>
      <div id="bulkTranslateMsgProducts" style="margin-bottom:10px;"></div>
      <datalist id="langSuggestions"><option value="ar"><option value="fr"><option value="es"><option value="de"><option value="ur"><option value="hi"><option value="tr"><option value="zh"></datalist>
      <div id="productsTableContainer"></div>`;
    renderProductsTable();
  } else if (state.adminTab === 'digitalProducts') {
    await renderDigitalProductsTab(body);
  } else if (state.adminTab === 'categories') {
    body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center;">
      <span style="color:var(--text-dim);font-size:13.5px">${state.categories.length} ${t('categories')}${helpIcon('adminCategories', { what: 'helpAdminCategoriesWhat', why: 'helpAdminCategoriesWhy', next: 'helpAdminCategoriesNext', rules: 'helpAdminCategoriesRules' })}</span>
      <button class="btn sm" onclick="openCategoryForm()">${t('addCategory')}</button></div>
      <div style="margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <input id="bulkTranslateLangCategories" placeholder="${t('langCodeShortPlaceholder')}" list="langSuggestions" style="width:90px;">
        <button class="btn sm secondary" onclick="bulkAutoTranslate('categories','bulkTranslateLangCategories','bulkTranslateMsgCategories')">${t('autoTranslateAllBtn')}</button>
      </div>
      <div id="bulkTranslateMsgCategories" style="margin-bottom:10px;"></div>
      <datalist id="langSuggestions"><option value="ar"><option value="fr"><option value="es"><option value="de"><option value="ur"><option value="hi"><option value="tr"><option value="zh"></datalist>
      <table><thead><tr><th>${t('nameCol')}</th><th>${t('groupCol')}</th><th>${t('fulfillmentCol')}</th><th>${t('rulesCol')}</th><th>${t('marketplaceTagCol')}</th><th></th></tr></thead><tbody>
      ${state.categories.map(c=>`<tr><td>${esc(localized(c, 'name'))}</td><td>${c.group}</td><td>${c.fulfillment}</td>
        <td>${c.fulfillment==='download' ? `${c.downloadWindowHours}h · ${c.maxDownloads} ${t('downloadsWord')}` : '—'}</td>
        <td>${c.platformCategory || t('otherFallback')}</td>
        <td class="table-actions"><button class="btn ghost sm" onclick='openCategoryForm(${JSON.stringify(c.id)})'>${t('edit')}</button>
        <button class="btn danger sm" onclick="deleteCategory('${c.id}')">${t('delete')}</button></td></tr>`).join('')}
      </tbody></table>`;
  } else if (state.adminTab === 'employees') {
    const { users } = await api('/api/admin/users');
    body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center;">
      <span style="color:var(--text-dim);font-size:13.5px">${users.length} ${t('accountsWord')}${helpIcon('adminEmployees', { what: 'helpAdminEmployeesWhat', why: 'helpAdminEmployeesWhy', next: 'helpAdminEmployeesNext', rules: 'helpAdminEmployeesRules', errors: 'helpAdminEmployeesErrors' })}</span>
      <button class="btn sm" onclick="openEmployeeForm()">${t('addEmployee')}</button></div>
      <table><thead><tr><th>${t('nameCol')}</th><th>${t('emailCol')}</th><th>${t('roleCol')}</th><th></th></tr></thead><tbody>
      ${users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="role-badge">${u.role}</span></td>
        <td>${u.id === state.user.id ? `<span class="hint" style="margin:0">(${t('youLabel')})</span>` : `<button class="btn sm secondary" onclick="adminResetUserMfa('${u.id}','${esc(u.name)}')" style="margin-inline-end:6px;">${t('resetMfaBtn') || 'Reset MFA'}</button><button class="btn danger sm" onclick="deleteUser('${u.id}')">${t('delete')}</button>`}</td></tr>`).join('')}
      </tbody></table>`;
  } else if (state.adminTab === 'orders') {
    const { orders } = await api('/api/admin/orders');
    body.innerHTML = `<table><thead><tr><th>${t('idCol')}</th><th>${t('clientCol')}</th><th>${t('productCodeCol')}</th><th>${t('itemsCol')}</th><th>${t('totalCol')}</th><th>${t('statusCol')}</th><th>${t('orderStatusLabel')}</th><th>${t('dateCol')}</th></tr></thead><tbody>
      ${orders.map(o=>`<tr><td>${o.id}</td><td>${esc(o.clientEmail)}</td><td>${o.items.map(i=>i.sku?esc(i.sku):'—').join(', ')}</td><td>${o.items.length}</td><td>$${o.total.toFixed(2)}</td>
        <td><span class="status-pill ${o.paymentStatus}">${o.paymentStatus}</span></td>
        <td><select onchange="updateOrderStatus('${o.id}', this.value)">${ORDER_STATUSES.map(s => `<option value="${s}" ${o.status===s?'selected':''}>${t('orderStatus_'+s)}</option>`).join('')}</select></td>
        <td>${localeDate(new Date(o.createdAt))}</td></tr>`).join('')}
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
  } else if (state.adminTab === 'security') {
    const info = await api('/api/tenant/info');
    const { factors } = await api('/api/auth/mfa/factors').catch(() => ({ factors: [] }));
    const ownMfaEnabled = factors.some(f => f.status === 'verified');
    body.innerHTML = `
      <div class="panel" style="max-width:640px;">
        <h3>${t('appManagedSectionTitle')}</h3>
        <p class="hint" style="margin:0 0 14px;">${t('appManagedSectionHint')}</p>
        <div id="accessSettingsMsg"></div>
        <div class="field"><label><input type="checkbox" id="stRegistrationEnabled" ${info.registrationEnabled ? 'checked' : ''}> ${t('registrationEnabledLabel')}</label>${helpIcon('regEnabled', { what: 'helpRegEnabledWhat', why: 'helpRegEnabledWhy', next: 'helpRegEnabledNext' })}</div>
        <div class="field"><label><input type="checkbox" id="stRequireMfaForStaff" ${info.requireMfaForStaff ? 'checked' : ''}> ${t('requireMfaForStaffLabel')}</label>${helpIcon('reqMfa', { what: 'helpReqMfaWhat', why: 'helpReqMfaWhy', next: 'helpReqMfaNext', errors: 'helpReqMfaErrors' })}</div>
        <button class="btn secondary" onclick="saveAccessSettings()">${t('save')}</button>
      </div>
      <div class="panel" style="max-width:640px;margin-top:18px;">
        <h3>${t('yourOwnAccountSecurityTitle')}</h3>
        <p class="hint" style="margin:0 0 10px;">${t('yourOwnAccountSecurityHint')}</p>
        ${ownMfaEnabled
          ? `<span class="status-pill success">✅ ${t('mfaEnabledLabel')}</span>`
          : `<button class="btn sm secondary" onclick="setAdminTab('settings');setTimeout(()=>openAccountMenu('mfa'),50)">${t('setUpYourOwnMfaBtn')}</button>`}
      </div>
      <div class="panel" style="max-width:640px;margin-top:18px;">
        <h3>${t('supabaseManagedSettingsTitle')}</h3>
        <p class="hint" style="margin:0 0 14px;">${t('supabaseManagedSettingsHint')}</p>
        <table style="width:100%;font-size:13.5px;">
          <tbody>
            <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingEmailConfirm')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
            <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingPasswordRules')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
            <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingRedirectUrls')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
            <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingMfaProviders')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
          </tbody>
        </table>
      </div>`;
  } else if (state.adminTab === 'settings') {
    const info = await api('/api/tenant/info');
    state._currentPlan = info.plan;
    state._editingStoreInfo = info;
    const existingStoreLangs = info.translations ? Object.keys(info.translations) : [];
    const stripeStatus = await api('/api/admin/stripe/status');
    const stripeReturnFlag = state._stripeOnboardingReturn;
    state._stripeOnboardingReturn = null; // shown once, then cleared
    body.innerHTML = `
      <div class="panel" style="max-width:560px;">
        <h3>${t('subscriptionH3')}</h3>
        <p style="color:var(--text-dim);font-size:13px;">${info.subscriptionExpiresAt ? `${t('subExpiresOnLabel')} <strong style="color:var(--text)">${localeDate(new Date(info.subscriptionExpiresAt), { dateStyle: "medium" })}</strong> (${info.daysUntilExpiry >= 0 ? t('subDaysRemaining').replace('{days}', info.daysUntilExpiry) : t('subDaysOverdue').replace('{days}', Math.abs(info.daysUntilExpiry))})` : t('noActiveSubscriptionLabel')}</p>
        <div id="renewMsg"></div>
        <p style="color:var(--text-dim);font-size:13px;">${t('renewAsHint')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="btn secondary" onclick="renewSubscription('store')">${t('renewStoreOnlyBtn')}</button>
          <button class="btn secondary" onclick="renewSubscription('marketplace')">${t('renewMarketplaceOnlyBtn')}</button>
          <button class="btn" onclick="renewSubscription('both')">${t('renewBothBtn')}</button>
          ${helpIcon('renewButtons', { what: 'helpRenewButtonsWhat', why: 'helpRenewButtonsWhy', next: 'helpRenewButtonsNext', rules: 'helpRenewButtonsRules' })}
        </div>
      </div>
      <div class="panel" style="max-width:560px;margin-top:18px;">
        <h3>${t('stripePaymentsH3')}</h3>
        ${stripeReturnFlag === 'return' ? `<div class="msg" style="background:var(--panel-2);border-radius:8px;padding:10px;margin-bottom:10px;">${t('stripeReturnMsg')}</div>` : ''}
        ${stripeReturnFlag === 'refresh' ? `<div class="msg" style="background:var(--warn-bg,#3a2a00);border-radius:8px;padding:10px;margin-bottom:10px;">${t('stripeRefreshMsg')}</div>` : ''}
        <p style="color:var(--text-dim);font-size:13px;">${t('stripeIntroText')}</p>
        <div style="display:flex;align-items:center;gap:10px;margin:10px 0;">
          <span class="badge ${stripeStatus.onboardingStatus === 'connected' ? 'badge-success' : stripeStatus.onboardingStatus === 'restricted' ? 'badge-danger' : 'badge-warn'}">${t('stripeStatus_' + stripeStatus.onboardingStatus)}</span>
        </div>
        ${stripeStatus.onboardingStatus === 'not_connected' ? `<p style="color:var(--text-dim);font-size:13px;">${t('stripeNotConnectedHint')}</p>` : ''}
        ${stripeStatus.onboardingStatus === 'pending' ? `<p style="color:var(--text-dim);font-size:13px;">${t('stripePendingHint')}</p>` : ''}
        ${stripeStatus.onboardingStatus === 'restricted' ? `<p style="color:var(--text-dim);font-size:13px;">${t('stripeRestrictedHint')}</p>` : ''}
        ${stripeStatus.onboardingStatus === 'connected' ? `<p style="color:var(--text-dim);font-size:13px;">${t('stripeConnectedHint')}</p>` : ''}
        <div id="stripeMsg"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px;">
          ${stripeStatus.onboardingStatus !== 'connected' ? `<button class="btn" onclick="connectStripe()">${stripeStatus.onboardingStatus === 'not_connected' ? t('stripeConnectBtn') : t('stripeContinueOnboardingBtn')}</button>` : ''}
          ${stripeStatus.onboardingStatus === 'connected' ? `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="stripeEnabledToggle" ${stripeStatus.enabled ? 'checked' : ''} onchange="toggleStripeEnabled(this.checked)"> ${t('stripeEnableAsPaymentMethod')}</label>` : ''}
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
        <h3>${t('translateEntireStoreTitle')}</h3>
        <p class="hint" style="margin:0 0 12px;">${t('translateEntireStoreHint')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input id="bulkTranslateLangAll" placeholder="${t('langCodeShortPlaceholder')}" list="langSuggestions" style="width:90px;">
          <button class="btn secondary" onclick="translateEntireStore('bulkTranslateLangAll','bulkTranslateMsgAll')">${t('translateEntireStoreBtn')}</button>
        </div>
        <div id="bulkTranslateMsgAll" style="margin-top:10px;"></div>
        <datalist id="langSuggestions"><option value="ar"><option value="fr"><option value="es"><option value="de"><option value="ur"><option value="hi"><option value="tr"><option value="zh"></datalist>
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
function renewSubscription(plan) {
  const labels = { store: t('renewStoreOnlyBtn'), marketplace: t('renewMarketplaceOnlyBtn'), both: t('renewBothBtn') };
  const container = document.getElementById('genericModalContent');
  container.innerHTML = `
    <h3>${t('renewConfirm').replace('{plan}', labels[plan])}</h3>
    <div class="field"><label>${t('cardNumber') || 'Card number'}</label><input id="rsCardNum" dir="ltr" placeholder="4111 1111 1111 1111" maxlength="19" autocomplete="off"></div>
    <div class="row2">
      <div class="field"><label>${t('expiry') || 'Expiry'}</label><input id="rsCardExp" dir="ltr" placeholder="MM/YY" autocomplete="off"></div>
      <div class="field"><label>${t('cvv') || 'CVV'}</label><input id="rsCardCvv" dir="ltr" placeholder="123" autocomplete="off"></div>
    </div>
    <div class="field"><label>${t('cardholderNameLabel') || 'Cardholder name'}</label><input id="rsCardName" autocomplete="off"></div>
    <div class="hint">${t('signupPaymentHint') || 'Simulated payment. Use 4111 1111 1111 1111 for success or 0000 0000 0000 0000 to preview a decline.'}</div>
    <div id="renewSubMsg"></div>
    <button class="btn full" style="margin-top:10px;" onclick="submitRenewSubscription('${plan}')">${t('renewBtn') || 'Renew'}</button>`;
  openModal('genericOverlay');
  wireCardFieldValidation('rs');
}
async function submitRenewSubscription(plan) {
  const msg = document.getElementById('renewSubMsg');
  const card = {
    number: document.getElementById('rsCardNum').value,
    expiry: document.getElementById('rsCardExp').value,
    cvv: document.getElementById('rsCardCvv').value,
    holderName: document.getElementById('rsCardName').value,
  };
  const cardError = cardValidationError(card);
  if (cardError) { msg.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  try {
    await api('/api/admin/store/renew', { method: 'POST', body: JSON.stringify({ plan, card }) });
    closeModal('genericOverlay');
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
async function connectStripe() {
  const msg = document.getElementById('stripeMsg');
  try {
    const { onboardingUrl } = await api('/api/admin/stripe/connect', { method: 'POST' });
    location.href = onboardingUrl; // hands off to Stripe's own hosted onboarding form entirely — nothing here collects or sees any of that information
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function toggleStripeEnabled(enabled) {
  const msg = document.getElementById('stripeMsg');
  try {
    await api('/api/admin/stripe/enable', { method: 'PATCH', body: JSON.stringify({ enabled }) });
    msg.innerHTML = `<div class="msg success">${t('savedMsg')}</div>`;
  } catch (e) {
    msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`;
    document.getElementById('stripeEnabledToggle').checked = !enabled; // revert the visual toggle since the actual change didn't take
  }
}
async function saveAccessSettings() {
  const msg = document.getElementById('accessSettingsMsg');
  try {
    await api('/api/admin/store', { method: 'PATCH', body: JSON.stringify({
      registrationEnabled: document.getElementById('stRegistrationEnabled').checked,
      requireMfaForStaff: document.getElementById('stRequireMfaForStaff').checked,
    }) });
    msg.innerHTML = `<div class="msg success">${t('accessSettingsSaved')}</div>`;
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function openProductForm(id) {
  const p = id ? state.products.find(x => x.id === id) : null;
  state._editingTranslatable = p;
  const existingLangs = p && p.translations ? Object.keys(p.translations) : [];
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${id ? t('editProductTitle') : t('addProductTitle')}</h3>
    <div class="field"><label>${t('categoryTypeLabel')}</label><select id="pfCat" onchange="toggleMeetingLinkField()">${state.categories.map(c=>`<option value="${c.id}" data-fulfillment="${c.fulfillment}" ${p&&p.categoryId===c.id?'selected':''}>${esc(localized(c, 'name'))} (${t('fulfillmentType_' + c.fulfillment) || c.fulfillment})</option>`).join('')}</select>
      ${state.categories.length === 0 ? `<div class="hint">${t('noCategoriesYetHint')}</div>` : ''}
    </div>
    <div class="field"><label>${t('nameCol')}</label><input id="pfName" value="${p ? esc(p.name) : ''}"></div>
    <div class="field"><label>${t('productCodeLabel')}</label>${p && p.sku ? `<div class="hint" style="margin:0;font-weight:600;color:var(--text);">${esc(p.sku)}</div><div class="hint">${t('productCodePermanentHint')}</div>` : `<div class="hint">${t('productCodeAutoAssignedHint')}</div>`}
    </div>
    <div class="field"><label>${t('descriptionLabel')}</label><textarea id="pfDesc" rows="3">${p?esc(p.description):''}</textarea></div>
    <div class="field"><label>${t('priceCol')}</label><input id="pfPrice" type="number" step="0.01" value="${p?p.price:''}"></div>
    <div class="field"><label>${t('stockLabel')}</label><input id="pfStock" type="number" step="1" min="0" placeholder="${t('stockPlaceholder')}" value="${p && typeof p.stock === 'number' ? p.stock : ''}">
      <div class="hint">${t('stockHint')}</div>
    </div>
    <div class="field" style="border:2px solid var(--success,#3aa76d);border-radius:8px;padding:12px;">
      <label style="font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:0.5px;">🖼️ ${t('productImagesLabel')}</label>
      ${id ? `
        <div id="pfImageGallery" style="margin-bottom:10px;">${productImageGalleryHtml(p)}</div>
        <div id="pfImageMsg"></div>
        <input type="file" id="pfImageFile" accept="image/png,image/jpeg,image/gif,image/webp,image/tiff,image/svg+xml">
        <button class="btn sm secondary" style="margin-top:8px;" onclick="uploadProductImage('${id}')">${t('uploadImageBtn')}</button>
        <div class="hint">${t('imageUploadHint')}</div>
      ` : `<div class="hint">${t('saveProductFirstForImages')}</div>`}
    </div>
    ${id && p && p.category && p.category.fulfillment === 'download' ? `
    <div class="field" id="pfDigitalFileField" style="border:2px solid var(--accent,#5b8def);border-radius:8px;padding:12px;margin-top:16px;">
      <label style="font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:0.5px;">📦 ${t('digitalFileSectionTitle')}</label>
      <div id="pfDigitalFileCurrentInfo">${digitalFileStatusHtml(p.digitalFile)}</div>
      <div id="pfDigitalFileMsg"></div>
      <input type="file" id="pfDigitalFile" onchange="updateCompressionCheckbox('pfDigitalFile','pfDigitalFileCompressBox')">
      <div id="pfDigitalFileCompressBox" style="display:none;margin-top:6px;"><label><input type="checkbox" id="pfDigitalFileCompress"> ${t('compressBeforeUploadLabel')}</label></div>
      <button class="btn sm secondary" style="margin-top:8px;" onclick="uploadDigitalFileFromProductForm('${id}')">${p.digitalFile ? t('replaceFileBtn') : t('uploadDigitalFileBtn')}</button>
      <div class="hint">${t('digitalFileSectionHint')}</div>
    </div>` : ''}
    <details style="margin:14px 0;">
      <summary style="cursor:pointer;color:var(--text-dim);font-size:13px;">${t('advancedOptionsLabel')}</summary>
      <div style="margin-top:12px;">
        <div class="field"><label>${t('externalUrlLabel')}</label><input id="pfExternalUrl" placeholder="${t('externalUrlPlaceholder')}" value="${p && p.externalUrl ? esc(p.externalUrl) : ''}">
          <div class="hint">${t('externalUrlHint')}</div>
        </div>
        <div class="field" id="pfMeetingLinkField" style="display:none;"><label>${t('meetingLinkLabel')}</label><input id="pfMeetingLink" placeholder="${t('meetingLinkPlaceholder')}" value="${p && p.meetingLink ? esc(p.meetingLink) : ''}">
          <div class="hint">${t('meetingLinkHint')}</div>
        </div>
        ${translationFieldsHtml('pf', existingLangs)}
      </div>
    </details>
    <div id="pfSaveMsg"></div>
    <button class="btn full" onclick="saveProduct(${id ? `'${id}'` : null})">${id?t('save'):t('addProductTitle')}</button>`;
  openModal('genericOverlay');
  toggleMeetingLinkField();
}
/** Shows the meeting-link field only for Booking-fulfillment categories (e.g. Online Courses) — irrelevant for shipped, downloadable, or manually-fulfilled products, so it stays hidden for those. */
function toggleMeetingLinkField() {
  const catSelect = document.getElementById('pfCat');
  const field = document.getElementById('pfMeetingLinkField');
  if (!catSelect || !field) return;
  const selectedOption = catSelect.options[catSelect.selectedIndex];
  field.style.display = (selectedOption && selectedOption.dataset.fulfillment === 'booking') ? 'block' : 'none';
}
/** Shows or hides the digital-file section based on whichever category is currently selected —
 * for a NEW product, this is required right here and now (no "save first" step), matching the
 * rule that a digital product cannot be saved at all without a file already attached. */
const ALREADY_COMPRESSED_EXTENSIONS = new Set(['zip','rar','7z','gz','tgz','bz2','xz', // already archives
  'mp4','mov','avi','mkv','webm','flv','wmv','m4v', // video — already compressed
  'jpg','jpeg','png','gif','webp','avif', // images — already compressed
  'mp3','aac','ogg','m4a','opus']); // lossy audio — already compressed
function fileMightBenefitFromCompression(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return !ALREADY_COMPRESSED_EXTENSIONS.has(ext);
}
function updateCompressionCheckbox(fileInputId, boxId) {
  const fileInput = document.getElementById(fileInputId);
  const box = document.getElementById(boxId);
  const file = fileInput.files[0];
  box.style.display = (file && fileMightBenefitFromCompression(file.name)) ? 'block' : 'none';
  if (!file || !fileMightBenefitFromCompression(file.name)) document.getElementById(fileInputId + 'Compress').checked = false;
}
function renderProductsTable() {
  const container = document.getElementById('productsTableContainer');
  const search = (document.getElementById('productSearch').value || '').toLowerCase();
  const products = (state._products || []).filter(p => !search || p.name.toLowerCase().includes(search) || (p.sku && p.sku.toLowerCase().includes(search)));
  container.innerHTML = `<table><thead><tr><th>${t('nameCol')}</th><th>${t('productCodeCol')}</th><th>${t('categoryCol')}</th><th>${t('priceCol')}</th><th></th></tr></thead><tbody>
      ${products.map(p=>`<tr><td>${esc(localized(p, 'name'))} ${state._missingFileIds.has(p.id) ? `<span class="status-pill cancelled" title="${t('noFileWarningTooltip')}">⚠ ${t('noFileWarningBadge')}</span>` : ''}</td><td>${p.sku ? esc(p.sku) : '—'}</td><td>${esc(localized(p.category, 'name'))}</td><td>$${p.price.toFixed(2)}</td>
        <td><button class="btn ghost sm" onclick='openProductForm(${JSON.stringify(p.id)})'>${t('edit')}</button>
        <button class="btn danger sm" onclick="deleteProduct('${p.id}')">${t('delete')}</button></td></tr>`).join('')}
      </tbody></table>`;
}
async function renderDigitalProductsTab(body) {
  const { digitalProducts } = await api('/api/admin/digital-products');
  state._digitalProducts = digitalProducts;
  const { products } = await api('/api/products');
  state.products = products;
  body.innerHTML = `
    <div style="margin-bottom:12px;">
      <input id="dpSearch" placeholder="${t('searchDigitalProductsPlaceholder')}" oninput="renderDigitalProductsTable()" style="width:100%;max-width:320px;">
    </div>
    <div id="dpTableContainer"></div>`;
  renderDigitalProductsTable();
}
function renderDigitalProductsTable() {
  const container = document.getElementById('dpTableContainer');
  const search = (document.getElementById('dpSearch').value || '').toLowerCase();
  const rows = (state._digitalProducts || []).filter(d => !search || d.productName.toLowerCase().includes(search) || d.categoryName.toLowerCase().includes(search) || (d.productCode && d.productCode.toLowerCase().includes(search)));
  container.innerHTML = `<table><thead><tr>
      <th>${t('nameCol')}</th><th>${t('productCodeCol')}</th><th>${t('categoryCol')}</th><th>${t('originalFileNameCol')}</th>
      <th>${t('fileTypeCol')}</th><th>${t('fileSizeCol')}</th><th>${t('uploadStatusCol')}</th><th>${t('readyForSaleCol')}</th><th>${t('uploadDateCol')}</th>
      <th>${t('uploadedByCol')}</th><th>${t('downloadCountCol')}</th><th>${t('imageDownloadCountCol')}</th><th></th>
    </tr></thead><tbody>
    ${rows.map(d => {
      const product = (state.products || []).find(p => p.id === d.productId);
      const image = product && product.images && product.images[0];
      return `<tr>
      <td>${esc(product ? localized(product, 'name') : d.productName)}</td>
      <td>${d.productCode ? esc(d.productCode) : `<span class="hint" style="margin:0">${t('noCodeSetHint')}</span>`}</td>
      <td>${esc(product && product.category ? localized(product.category, 'name') : d.categoryName)}</td>
      <td>${d.hasFile ? esc(d.originalFilename) : `<span class="status-pill cancelled">⚠ ${t('noFileWarningBadge')}</span>`}</td>
      <td style="display:flex;align-items:center;gap:6px;">${image ? `<img src="${image.url}" style="width:28px;height:28px;object-fit:cover;border-radius:4px;flex-shrink:0;" alt="${esc(image.filename)}">` : ''}<span>${d.extension ? d.extension.toUpperCase() : '—'}${d.isCompressed ? ` (${t('zipWrapperTag')})` : ''}</span></td>
      <td>${d.sizeBytes ? Math.round(d.sizeBytes/1024) + ' KB' : '—'}</td>
      <td>${d.uploadStatus ? `<span class="status-pill ${d.uploadStatus==='completed'?'success':'cancelled'}">${d.uploadStatus}</span>` : '—'}</td>
      <td><span class="status-pill ${d.readyForSale?'success':'cancelled'}">${d.readyForSale ? t('readyForSaleYes') : t('readyForSaleNo')}</span></td>
      <td>${d.uploadedAt ? localeDate(new Date(d.uploadedAt)) : '—'}</td>
      <td>${d.uploadedBy ? esc(d.uploadedBy) : '—'}</td>
      <td>${d.downloadCount}</td>
      <td>${image ? d.imageDownloadCount : `<span class="hint" style="margin:0">—</span>`}</td>
      <td class="table-actions">
        <button class="btn ghost sm" onclick='openDigitalFileUploadModal(${JSON.stringify(d.productId)}, ${JSON.stringify(d.productName)})'>${t('manageFilesBtn')}</button>
        ${d.hasFile ? `
          <button class="btn ghost sm" onclick="verifyDigitalFileDownload('${d.productId}')">${t('verifyDownloadBtn')}</button>
          <button class="btn danger sm" onclick="deleteDigitalFile('${d.productId}')">${t('delete')}</button>
        ` : ''}
      </td>
    </tr>`;
    }).join('')}
    </tbody></table>
    ${rows.length === 0 ? `<div class="hint">${t('noDigitalProductsYetHint')}</div>` : ''}`;
}
async function verifyDigitalFileDownload(productId) {
  try {
    const res = await api(`/api/admin/products/${productId}/digital-file/verify-download`);
    const blob = await res.blob();
    const d = (state._digitalProducts || []).find(x => x.productId === productId);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (d && d.originalFilename) ? d.originalFilename : 'download';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { alert(e.message); }
}
function openDigitalFileUploadModal(productId, productName) {
  const p = (state.products || []).find(x => x.id === productId);
  document.getElementById('genericModalContent').innerHTML = `
    <h3>${esc(productName)}</h3>
    <h4 style="margin:16px 0 8px;">${t('digitalFileSectionTitle')}</h4>
    <div class="hint" style="margin-bottom:10px;">${t('digitalFileSectionHint')}</div>
    <div class="field">
      <label>${t('digitalFileLabel')}</label>
      <input type="file" id="dpUploadFile" onchange="updateCompressionCheckbox('dpUploadFile','dpUploadCompressBox')">
      <div id="dpUploadCompressBox" style="display:none;margin-top:6px;"><label><input type="checkbox" id="dpUploadFileCompress"> ${t('compressBeforeUploadLabel')}</label></div>
    </div>
    <div id="dpUploadMsg"></div>
    <button class="btn full" onclick="submitDigitalFileUpload('${productId}')">${t('uploadDigitalFileBtn')}</button>

    <hr style="margin:20px 0;border:none;border-top:1px solid var(--border,#333);">
    <h4 style="margin:0 0 8px;">${t('productImagesSectionTitle')}</h4>
    <div class="hint" style="margin-bottom:10px;">${t('productImagesSectionHint')}</div>
    <div id="dpImageGallery" style="margin-bottom:10px;">${productImageGalleryHtml(p)}</div>
    <div id="dpImageMsg"></div>
    <input type="file" id="dpImageFile" accept="image/png,image/jpeg,image/gif,image/webp,image/tiff,image/svg+xml">
    <button class="btn sm secondary" style="margin-top:8px;" onclick="uploadProductImage('${productId}', {file:'dpImageFile',msg:'dpImageMsg',gallery:'dpImageGallery'})">${t('uploadImageBtn')}</button>
    <div class="hint">${t('imageUploadHint')}</div>`;
  openModal('genericOverlay');
}
async function submitDigitalFileUpload(productId) {
  const fileInput = document.getElementById('dpUploadFile');
  const msg = document.getElementById('dpUploadMsg');
  const file = fileInput.files[0];
  if (!file) { msg.innerHTML = `<div class="msg error">${t('chooseFileFirst')}</div>`; return; }
  if (file.type.startsWith('image/')) {
    if (!confirm(t('looksLikeImageConfirm'))) return;
  }
  const shouldCompress = document.getElementById('dpUploadFileCompress').checked;
  if (shouldCompress) msg.innerHTML = `<div class="hint">${t('compressingLabel')}</div>`;
  const { fileToUpload, isCompressed, originalFilename } = await compressFileIfRequested(file, shouldCompress);
  await streamUploadDigitalFile(productId, fileToUpload, msg, async () => {
    // Deliberately does NOT close the modal — the product image upload
    // section is right below this one in the same modal, and closing here
    // was forcing the user to reopen "Manage file & image" separately just
    // to add the image, when both belong in one session. The underlying
    // table still refreshes in the background so it's current once the
    // user does close the modal themselves.
    await renderDigitalProductsTab(document.getElementById('adminTabBody'));
  }, { isCompressed, originalFilename });
}
async function deleteDigitalFile(productId) {
  if (!confirm(t('deleteDigitalFileConfirm'))) return;
  await api(`/api/admin/products/${productId}/digital-file`, { method: 'DELETE' });
  await renderDigitalProductsTab(document.getElementById('adminTabBody'));
}
function digitalFileStatusHtml(digitalFile) {
  if (!digitalFile) return `<div class="hint" style="margin:0 0 8px 0;">${t('noDigitalFileYet')}</div>`;
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
    <span style="font-weight:600;">${esc(digitalFile.filename)}</span>
    <span class="hint" style="margin:0;">${digitalFile.extension ? digitalFile.extension.toUpperCase() + ' · ' : ''}${Math.round((digitalFile.size||0)/1024)} KB${digitalFile.isCompressed ? ` (${t('zipWrapperTag')})` : ''} · ${digitalFile.uploadedAt ? localeDate(new Date(digitalFile.uploadedAt)) : ''}</span>
    <span class="status-pill success">✅ ${t('uploadSuccessBadge')}</span>
    <button class="btn danger sm" onclick="deleteDigitalFileFromProductForm()">${t('deleteFileBtn')}</button>
  </div>`;
}
async function uploadDigitalFileFromProductForm(productId) {
  const fileInput = document.getElementById('pfDigitalFile');
  const msg = document.getElementById('pfDigitalFileMsg');
  const file = fileInput.files[0];
  if (!file) { msg.innerHTML = `<div class="msg error">${t('chooseFileFirst')}</div>`; return; }
  if (file.type.startsWith('image/')) {
    if (!confirm(t('looksLikeImageConfirm'))) return;
  }
  const shouldCompress = document.getElementById('pfDigitalFileCompress').checked;
  if (shouldCompress) msg.innerHTML = `<div class="hint">${t('compressingLabel')}</div>`;
  const { fileToUpload, isCompressed, originalFilename } = await compressFileIfRequested(file, shouldCompress);
  await streamUploadDigitalFile(productId, fileToUpload, msg, () => {
    const updated = state.products.find(x => x.id === productId);
    document.getElementById('pfDigitalFileCurrentInfo').innerHTML = digitalFileStatusHtml(updated && updated.digitalFile);
  }, { isCompressed, originalFilename });
  fileInput.value = '';
}
async function deleteDigitalFileFromProductForm() {
  if (!confirm(t('deleteDigitalFileConfirm'))) return;
  const productId = state._editingTranslatable && state._editingTranslatable.id;
  if (!productId) return;
  await api(`/api/admin/products/${productId}/digital-file`, { method: 'DELETE' });
  const { products } = await api('/api/products'); state.products = products;
  const updated = state.products.find(x => x.id === productId);
  document.getElementById('pfDigitalFileCurrentInfo').innerHTML = digitalFileStatusHtml(updated && updated.digitalFile);
}
function productImageGalleryHtml(p) {
  if (!p || !p.images || p.images.length === 0) return `<div class="hint" style="margin:0">${t('noImagesYet')}</div>`;
  return p.images.map(img => `
    <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:6px;">
      <img src="${img.url}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;" alt="${esc(img.filename)}">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(img.filename)}</div>
        <div class="hint" style="margin:2px 0 0;">${img.size ? Math.round(img.size/1024) + ' KB · ' : ''}${localeDate(new Date(img.uploadedAt))}</div>
        <div><span class="status-pill success" style="margin-top:4px;display:inline-block;">✅ ${t('uploadSuccessBadge')}</span></div>
      </div>
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/tiff,image/svg+xml" id="replaceInput-${img.id}" style="display:none;" onchange="replaceProductImage('${p.id}','${img.id}')">
      <button class="btn ghost sm" onclick="document.getElementById('replaceInput-${img.id}').click()">${t('replaceImageBtn')}</button>
      <button class="btn danger sm" onclick="deleteProductImage('${p.id}','${img.id}')">${t('delete')}</button>
    </div>`).join('');
}
async function replaceProductImage(productId, oldImageId) {
  const fileInput = document.getElementById(`replaceInput-${oldImageId}`);
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataBase64 = reader.result.split(',')[1];
    try {
      await api(`/api/admin/products/${productId}/images`, { method: 'POST', body: JSON.stringify({ mimeType: file.type, filename: file.name, dataBase64 }) });
      await api(`/api/admin/products/${productId}/images/${oldImageId}`, { method: 'DELETE' }); // new one uploaded and confirmed first, old one removed after — never leaves zero images mid-replace if the upload itself fails
      const { products } = await api('/api/products'); state.products = products;
      const updated = state.products.find(x => x.id === productId);
      ['pfImageGallery', 'dpImageGallery'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = productImageGalleryHtml(updated); });
    } catch (e) { alert(e.message); }
  };
  reader.readAsDataURL(file);
}
/** Zips the file if requested, leaving its bytes completely unchanged inside the archive.
 * Returns the file to actually upload, plus metadata describing what's really inside it. */
async function compressFileIfRequested(file, shouldCompress) {
  if (!shouldCompress) return { fileToUpload: file, isCompressed: false, originalFilename: file.name };
  const zip = new JSZip();
  zip.file(file.name, file); // stored exactly as selected — no transformation of its content
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const zipFile = new File([zipBlob], file.name.replace(/\.[^.]+$/, '') + '.zip', { type: 'application/zip' });
  return { fileToUpload: zipFile, isCompressed: true, originalFilename: file.name };
}
async function uploadDigitalFile(productId) {
  const fileInput = document.getElementById('pfDigitalFile');
  const msg = document.getElementById('pfDigitalFileMsg');
  const file = fileInput.files[0];
  if (!file) { msg.innerHTML = `<div class="msg error">${t('chooseFileFirst')}</div>`; return; }
  const shouldCompress = document.getElementById('pfDigitalFileCompress').checked;
  if (shouldCompress) msg.innerHTML = `<div class="hint">${t('compressingLabel')}</div>`;
  const { fileToUpload, isCompressed, originalFilename } = await compressFileIfRequested(file, shouldCompress);
  await streamUploadDigitalFile(productId, fileToUpload, msg, null, { isCompressed, originalFilename });
  fileInput.value = '';
}
/**
 * The actual large-file-capable upload: gets a signed URL from our server
 * (step 1 — no file bytes sent yet), then the BROWSER uploads the file
 * directly to Supabase Storage using that URL (step 2 — this is the part
 * that streams; the file goes straight from disk to Supabase, our own
 * server is not in this path at all), then tells our server the upload
 * finished so it can verify and record the metadata (step 3). XMLHttpRequest
 * is used specifically because it reports real upload progress, which
 * fetch() does not do well — this is what drives the progress bar below.
 * On failure, the same signed URL can be retried without starting over.
 */
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB — raised well above Supabase's documented 6MB cutover point. The simple direct-PUT path has proven reliable throughout this whole project; TUS caused repeated, hard-to-diagnose upload issues in real testing even after fixing the specific documented causes found along the way (wrong hostname, missing RLS SELECT policy). Reserving TUS only for genuinely large files (where chunking truly can't be avoided) means ordinary files — including anything up to 100MB — use the simpler, already-proven mechanism instead.

async function streamUploadDigitalFile(productId, file, msgEl, onDone, compressionInfo) {
  const { isCompressed, originalFilename } = compressionInfo || { isCompressed: false, originalFilename: file.name };
  const isLarge = file.size > LARGE_FILE_THRESHOLD;
  if (isLarge) msgEl.innerHTML = `<div class="hint">${t('largeFileNotice')}</div>`;

  let prepared;
  try {
    prepared = await api(`/api/admin/products/${productId}/digital-file/prepare-upload`, { method: 'POST', body: JSON.stringify({ filename: file.name }) });
  } catch (e) { msgEl.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; return; }

  const onFinished = async () => {
    let fileMeta;
    try {
      fileMeta = await api(`/api/admin/products/${productId}/digital-file/confirm-upload`, {
        method: 'POST', body: JSON.stringify({ storagePath: prepared.storagePath, filename: file.name, mimeType: file.type, sizeBytes: file.size, isCompressed, originalFilename }),
      });
    } catch (e) { msgEl.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; return; }
    const infoEl = document.getElementById('pfDigitalFileInfo');
    if (infoEl) infoEl.innerHTML = `<div class="hint" style="margin:0 0 8px 0;">${t('currentFileLabel')}: ${esc(fileMeta.fileMeta.filename)} (${Math.round((fileMeta.fileMeta.size||0)/1024)} KB)${fileMeta.fileMeta.isCompressed ? ` — ${t('storedAsZipLabel')}` : ''}</div>`;
    msgEl.innerHTML = `<div class="msg success">${t('savedMsg')}</div>`;
    const { products } = await api('/api/products'); state.products = products;
    if (onDone) onDone();
  };

  if (isLarge) {
    // True chunked, resumable upload — tus-js-client handles retrying failed
    // Deliberately does NOT resume from a previous upload attempt. tus-js-client
    // has a known bug (tus/tus-js-client#50) where a stale upload URL left over
    // from an earlier attempt of the SAME file can be reused even after it's no
    // longer valid on the server, silently producing a corrupted result instead
    // of cleanly restarting. Since this exact scenario — replacing the same file
    // repeatedly — is common in real admin workflows, a unique fingerprint per
    // attempt sidesteps the bug entirely: there is never a "previous upload" for
    // it to (mis)match against. Within a single attempt, retryDelays above still
    // handles ordinary network interruptions correctly.
    const upload = new tus.Upload(file, {
      endpoint: prepared.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 6 * 1024 * 1024, // required by Supabase's TUS implementation — other values are rejected
      headers: { authorization: `Bearer ${state.token}`, apikey: prepared.anonKey, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: () => Promise.resolve(`hadam-${prepared.storagePath}-${Date.now()}-${Math.random()}`),
      metadata: { bucketName: 'digital-files', objectName: prepared.storagePath, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
      onError: (error) => {
        msgEl.innerHTML = `<div class="msg error">${esc(error.message || String(error))}</div> <button class="btn sm secondary" style="margin-top:6px;" id="pfRetryUpload">${t('retryUploadBtn')}</button>`;
        document.getElementById('pfRetryUpload').onclick = () => upload.start(); // retries the SAME in-memory upload object, which is safe (not a stale stored fingerprint)
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        msgEl.innerHTML = `<div class="hint">${t('largeFileNotice')}<br>${t('uploadingLabel')} <progress value="${pct}" max="100" style="width:100%;"></progress> ${pct}%</div>`;
      },
      onSuccess: onFinished,
    });
    upload.start();
    return;
  }

  // Small file — the simple direct PUT to a signed URL is enough here.
  const attempt = async () => {
    msgEl.innerHTML = `<div class="hint">${t('uploadingLabel')} <progress id="pfUploadProgress" value="0" max="100" style="width:100%;"></progress> <span id="pfUploadPct">0%</span></div>`;
    const progressBar = document.getElementById('pfUploadProgress');
    const pctLabel = document.getElementById('pfUploadPct');
    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', prepared.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.value = pct; pctLabel.textContent = pct + '%';
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
        xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
        xhr.send(file);
      });
      await onFinished();
    } catch (e) {
      msgEl.innerHTML = `<div class="msg error">${esc(e.message)}</div> <button class="btn sm secondary" style="margin-top:6px;" id="pfRetryUpload">${t('retryUploadBtn')}</button>`;
      document.getElementById('pfRetryUpload').onclick = () => attempt(); // same signed URL — no need to re-prepare
    }
  };
  await attempt();
}
async function uploadProductImage(productId, ids) {
  ids = ids || { file: 'pfImageFile', msg: 'pfImageMsg', gallery: 'pfImageGallery' };
  const fileInput = document.getElementById(ids.file);
  const msg = document.getElementById(ids.msg);
  const file = fileInput.files[0];
  if (!file) { msg.innerHTML = `<div class="msg error">${t('chooseFileFirst')}</div>`; return; }
  // No client-side type whitelist here — the server is the single source of
  // truth for which image formats are accepted, so this can never drift out
  // of sync with it the way a duplicated list would.
  const reader = new FileReader();
  reader.onload = async () => {
    const dataBase64 = reader.result.split(',')[1];
    try {
      await api(`/api/admin/products/${productId}/images`, { method: 'POST', body: JSON.stringify({ mimeType: file.type, filename: file.name, dataBase64 }) });
      const { products } = await api('/api/products'); state.products = products;
      const updated = state.products.find(x => x.id === productId);
      document.getElementById(ids.gallery).innerHTML = productImageGalleryHtml(updated);
      fileInput.value = '';
      msg.innerHTML = `<div class="msg success">✅ ${t('uploadSuccessBadge')}</div>`;
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
    <div class="field"><label>${t('descriptionInLanguageLabel')}</label><textarea id="${prefix}DescTrans" dir="auto" rows="2"></textarea></div>
    <button type="button" class="btn sm secondary" onclick="autoTranslateFields('${prefix}')">${t('autoTranslateBtn')}</button>
    <div class="hint">${t('autoTranslateHint')}</div>
    <div id="${prefix}AutoTranslateMsg"></div>`;
}
async function autoTranslateFields(prefix) {
  const langCode = document.getElementById(`${prefix}LangCode`).value.trim().toLowerCase();
  const msg = document.getElementById(`${prefix}AutoTranslateMsg`);
  if (!langCode) { msg.innerHTML = `<div class="msg error">${t('enterLangCodeFirst')}</div>`; return; }
  const nameSourceEl = document.getElementById(prefix === 'st' ? 'stName' : prefix === 'cf' ? 'cfName' : `${prefix}Name`);
  const descSourceEl = document.getElementById(prefix === 'st' ? 'stAbout' : prefix === 'cf' ? 'cfDesc' : `${prefix}Desc`);
  const sourceName = nameSourceEl ? nameSourceEl.value : '';
  const sourceDesc = descSourceEl ? descSourceEl.value : '';
  if (!sourceName && !sourceDesc) { msg.innerHTML = `<div class="msg error">${t('nothingToTranslate')}</div>`; return; }
  msg.innerHTML = `<div class="hint">${t('translatingLabel')}</div>`;
  try {
    if (sourceName) {
      const { translated } = await api('/api/admin/translate', { method: 'POST', body: JSON.stringify({ text: sourceName, targetLang: langCode }) });
      document.getElementById(`${prefix}NameTrans`).value = translated;
    }
    if (sourceDesc) {
      const { translated } = await api('/api/admin/translate', { method: 'POST', body: JSON.stringify({ text: sourceDesc, targetLang: langCode }) });
      document.getElementById(`${prefix}DescTrans`).value = translated;
    }
    msg.innerHTML = `<div class="msg success">${t('autoTranslateDoneMsg')}</div>`;
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
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
    <div class="field"><label>${t('aboutTextInLanguageLabel')}</label><textarea id="stAboutTrans" dir="auto" rows="4"></textarea></div>
    <button type="button" class="btn sm secondary" onclick="autoTranslateStoreFields()">${t('autoTranslateBtn')}</button>
    <div class="hint">${t('autoTranslateHint')}</div>
    <div id="stAutoTranslateMsg"></div>`;
}
async function translateEntireStore(langInputId, msgId) {
  const langCode = document.getElementById(langInputId).value.trim().toLowerCase();
  const msg = document.getElementById(msgId);
  if (!langCode) { msg.innerHTML = `<div class="msg error">${t('enterLangCodeFirst')}</div>`; return; }
  if (!confirm(t('translateEntireStoreConfirm').replace('{lang}', langCode))) return;
  const scopes = ['products', 'categories', 'store'];
  const totals = { translated: 0, skipped: 0, failed: 0 };
  for (const scope of scopes) {
    msg.innerHTML = `<div class="hint">${t('translatingScopeLabel').replace('{scope}', t(scope === 'store' ? 'storeDetailsH3' : scope))}</div>`;
    try {
      const result = await api('/api/admin/translate-bulk', { method: 'POST', body: JSON.stringify({ targetLang: langCode, scope }) });
      totals.translated += result.translated; totals.skipped += result.skipped; totals.failed += (result.failed ? result.failed.length : 0);
    } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; return; }
  }
  let summary = t('bulkTranslateDoneMsg').replace('{translated}', totals.translated).replace('{skipped}', totals.skipped);
  if (totals.failed) summary += ` ${t('bulkTranslateFailedMsg').replace('{count}', totals.failed)}`;
  msg.innerHTML = `<div class="msg success">${summary}</div>`;
}
async function bulkAutoTranslate(scope, langInputId, msgId) {
  const langCode = document.getElementById(langInputId).value.trim().toLowerCase();
  const msg = document.getElementById(msgId);
  if (!langCode) { msg.innerHTML = `<div class="msg error">${t('enterLangCodeFirst')}</div>`; return; }
  if (!confirm(t('bulkTranslateConfirm').replace('{lang}', langCode))) return;
  msg.innerHTML = `<div class="hint">${t('bulkTranslatingLabel')}</div>`;
  try {
    const result = await api('/api/admin/translate-bulk', { method: 'POST', body: JSON.stringify({ targetLang: langCode, scope }) });
    let summary = t('bulkTranslateDoneMsg').replace('{translated}', result.translated).replace('{skipped}', result.skipped);
    if (result.failed && result.failed.length) summary += ` ${t('bulkTranslateFailedMsg').replace('{count}', result.failed.length)}`;
    msg.innerHTML = `<div class="msg success">${summary}</div>`;
    renderAdminTab();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function autoTranslateStoreFields() {
  const langCode = document.getElementById('stLangCode').value.trim().toLowerCase();
  const msg = document.getElementById('stAutoTranslateMsg');
  if (!langCode) { msg.innerHTML = `<div class="msg error">${t('enterLangCodeFirst')}</div>`; return; }
  const sourceName = document.getElementById('stName').value, sourceTagline = document.getElementById('stTagline').value, sourceAbout = document.getElementById('stAbout').value;
  if (!sourceName && !sourceTagline && !sourceAbout) { msg.innerHTML = `<div class="msg error">${t('nothingToTranslate')}</div>`; return; }
  msg.innerHTML = `<div class="hint">${t('translatingLabel')}</div>`;
  try {
    if (sourceName) { const { translated } = await api('/api/admin/translate', { method: 'POST', body: JSON.stringify({ text: sourceName, targetLang: langCode }) }); document.getElementById('stNameTrans').value = translated; }
    if (sourceTagline) { const { translated } = await api('/api/admin/translate', { method: 'POST', body: JSON.stringify({ text: sourceTagline, targetLang: langCode }) }); document.getElementById('stTaglineTrans').value = translated; }
    if (sourceAbout) { const { translated } = await api('/api/admin/translate', { method: 'POST', body: JSON.stringify({ text: sourceAbout, targetLang: langCode }) }); document.getElementById('stAboutTrans').value = translated; }
    msg.innerHTML = `<div class="msg success">${t('autoTranslateDoneMsg')}</div>`;
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
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
  const stockRaw = document.getElementById('pfStock').value;
  const categoryId = document.getElementById('pfCat').value;
  const category = state.categories.find(c => c.id === categoryId);
  const body = { name: document.getElementById('pfName').value, categoryId,
    price: parseFloat(document.getElementById('pfPrice').value), description: document.getElementById('pfDesc').value,
    stock: stockRaw === '' ? null : parseInt(stockRaw, 10),
    externalUrl: document.getElementById('pfExternalUrl').value,
    meetingLink: document.getElementById('pfMeetingLink') ? document.getElementById('pfMeetingLink').value : '',
    translations: collectTranslationsPayload('pf', [['name', 'pfNameTrans'], ['description', 'pfDescTrans']]) };
  const msg = document.getElementById('pfSaveMsg');
  let savedProduct;
  try {
    if (id) { const r = await api(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); savedProduct = r.product; }
    else { const r = await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) }); savedProduct = r.product; }
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; return; }

  if (!id && category && category.fulfillment === 'download') {
    msg.innerHTML = `<div class="msg" style="color:var(--warn,#a15c00);">${t('goToDigitalProductsHint')}</div>`;
    setTimeout(() => { closeModal('genericOverlay'); state.adminTab = 'digitalProducts'; renderAdminTab(); }, 1400);
    return;
  }
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
const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
async function updateOrderStatus(orderId, status) {
  try { await api(`/api/employee/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
  catch (e) { alert(e.message); renderAdminTab(); }
}
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
          <label><input type="checkbox" id="cfAllowPickup" ${c && c.allowPickup ? 'checked' : ''} style="width:auto;display:inline;margin-inline-end:6px;">${t('allowPickupLabel')}</label>
          <div class="hint">${t('allowPickupHint')}</div>
        </div>
        <div id="downloadFields" style="display:${currentType==='digital' ? 'grid' : 'none'}" class="row2">
          <div class="field"><label>${t('downloadWindowLabel')}</label><input id="cfWindow" type="number" value="${c && c.downloadWindowHours || 72}"></div>
          <div class="field"><label>${t('maxDownloadsLabel')}</label><input id="cfMax" type="number" value="${c && c.maxDownloads || 1}"></div>
        </div>
        ${translationFieldsHtml('cf', existingLangs)}
      </div>
    </details>
    <div id="cfSaveMsg"></div>
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
  const msg = document.getElementById('cfSaveMsg');
  try {
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
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
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
    <h3>${t('addStaffAccountH3') || 'Add staff account'}</h3>
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
  if (!confirm(t('deleteUserConfirm') || 'Delete this account? This cannot be undone.')) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    renderAdminTab();
  } catch (e) { alert(e.message); }
}
async function adminResetUserMfa(id, name) {
  if (!confirm((t('resetMfaConfirm') || 'This removes every MFA method (authenticator app, email code, and backup codes) for {name}, so they can log in with just their password and set up MFA again from scratch. Continue?').replace('{name}', name))) return;
  try {
    await api(`/api/admin/users/${id}/reset-mfa`, { method: 'POST' });
    alert(t('resetMfaSuccess') || 'MFA has been reset for this account.');
  } catch (e) { alert(e.message); }
}
