// Trilingual Label System — Tagalog / Bisaya / English
// TSR screens use T.key to get the label in current language.
// Language stored in localStorage('patrol_lang'), default TL.

var LABELS = {
  TL: {
    // Navigation
    home:        'Bahay',
    stores:      'Mga Tindahan',
    map:         'Mapa',
    profile:     'Profile ko',

    // Greeting
    goodMorning: 'Magandang umaga',
    goodDay:     'Magandang araw',
    goodEvening: 'Magandang gabi',

    // Store list
    visitToday:  'Bisitahin ngayon',
    notVisited:  'Hindi pa nabibisita',
    lastVisit:   'Huling bisita',
    today:       'Ngayon',
    yesterday:   'Kahapon',
    daysAgo:     function(n) { return n + ' araw na ang nakakaraan'; },
    hoursAgo:    function(n) { return n + ' oras na ang nakakaraan'; },
    minsAgo:     function(n) { return n + ' minuto na ang nakakaraan'; },
    justNow:     'Ngayon lang',
    never:       'Hindi pa nabisita',
    storesCount: function(n) { return n + ' tindahan'; },
    bagsMonth:   'bags/buwan',

    // Visit outcomes
    withOrder:   'May Order',
    noOrder:     'Walang Order',
    comeback:    'Bukas ulit',
    ordered:     'Nag-order',
    noOrderNote: 'Nakausap, walang order',
    willReturn:  'Babalik bukas',

    // Visit form
    whatHappened: 'Ano ang nangyari sa bisita mo?',
    logVisit:    'I-log ang visit ngayon',

    // Actions
    submitVisit: 'I-SUBMIT ANG VISIT',
    takePhoto:   'Kumuha ng litrato',
    addNotes:    'Dagdag ng notes...',
    syncNow:     'I-sync ngayon',
    refresh:     'I-refresh',
    call:        'Tawagan',
    directions:  'Direksyon',
    newStore:    '+ Bagong Tindahan',
    startVisit:  'Simulan ang Bisita',
    back:        'Bumalik',
    cancel:      'Kanselahin',
    save:        'I-save',
    next:        'Susunod',
    done:        'Tapos na',
    retry:       'I-retry',

    // Sync status
    synced:      'Naka-sync na',
    offline:     'Offline',
    pending:     function(n) { return n + ' naghihintay'; },
    syncing:     'Nag-sisync...',
    syncError:   'Hindi na-sync. I-retry?',
    syncSuccess: 'Na-sync na!',

    // Errors / empty states
    noStores:    'Wala pang tindahan sa lugar mo.',
    noVisits:    'Wala pang bisita.',
    noSignal:    'Walang signal. Sine-save namin ang data mo.',
    submitOk:    'Na-save! Mag-sync kapag may signal.',
    submitFail:  'May problema. Subukan ulit.',
    loadError:   'Hindi ma-load. Subukan ulit.',
    photoTaken:  'May litrato na',
    noPhoto:     'Wala pang litrato',

    // Visit details
    orderAmount: 'Halaga ng order',
    bags:        'bags',
    merchScore:  'Merch Score',
    notes:       'Mga notes',
    competitor:  'Kakumpitensya',

    // Store types
    feedsDealer: 'Feeds Dealer',
    farmSupply:  'Farm Supply',
    petShop:     'Pet Shop',
    veterinary:  'Veterinary',
    supermarket: 'Supermarket',
    other:       'Iba pa',

    // Onboarding
    welcome:     'Maligayang pagdating sa VieForce Patrol!',
    step1title:  'I-tap ang tindahan para mag-log ng bisita',
    step2title:  'Kumuha ng litrato at i-lagay ang order',
    step3title:  'I-sync kapag may internet na',
    skip:        'Laktawan',
    getStarted:  'Magsimula na!',

    // Store detail tabs
    tabProfile:    'Profile',
    tabProducts:   'Produkto',
    tabCompetitors:'Kakumpitensya',
    tabMerch:      'Merch',
    tabHistory:    'Kasaysayan',

    // Store detail labels
    contact:       'Kontak',
    owner:         'May-ari',
    phone:         'Telepono',
    supplyChain:   'Supply Chain',
    commercial:    'Komersyal',
    totalMonthlyVol:'Kabuuang buwanang volume',
    vienovoMonthly:'Vienovo buwanan',
    vienovoShare:  'Bahagi ng Vienovo',
    visitHealth:   'Visit Health',
    lastVisitLabel:'Huling bisita',
    totalVisitsLabel:'Kabuuang bisita',
    target:        'Target',
    perMonth:      'bawat buwan',

    // New store wizard
    newStoreTitle: 'Bagong Tindahan',
    step1Basic:    'Hakbang 1: Basic Info',
    step1Desc:     'I-lagay ang detalye ng tindahan.',
    storeName:     'Pangalan ng Tindahan',
    ownerName:     'Pangalan ng May-ari',
    storeType:     'Uri ng Tindahan',
    selectType:    'Pumili ng uri...',
    step2Location: 'Hakbang 2: Lokasyon',
    step2Desc:     'Kunin ang GPS at i-lagay ang address.',
    captureGPS:    'Kunin ang GPS Lokasyon',
    gpsHint:       'I-tap ang button para kunin ang GPS',
    province:      'Lalawigan',
    cityMunicipality:'Lungsod / Munisipyo',
    addressLandmark:'Address / Landmark',
    step3Photo:    'Hakbang 3: Litrato at I-submit',
    step3Desc:     'Kumuha ng litrato at i-classify ang tindahan.',
    volumeClass:   'Volume Class',
    healthStatus:  'Health Status',
    bagsPerMonth:  'Bags bawat buwan (tantiya)',
    registerStore: 'I-register ang Tindahan',

    // Common actions
    backLabel:     'Bumalik',
    nextLabel:     'Susunod',
    cancelLabel:   'Kanselahin',

    // GPS
    gpsWarning:  'Hindi ma-locate ang GPS mo.',
    gpsAllow:    'I-allow ang location sa settings.',
    gpsNoBlock:  'Maaari ka pa ring mag-submit.',
    gpsAcquiring:'Kinukuha ang GPS...',
    gpsOk:       'GPS OK',

    // Auth / Login
    phoneLabel:    'Phone Number',
    pinLabel:      'PIN Code',
    signIn:        'Mag-sign in',
    signingIn:     'Nag-sisign in...',
    enterPhonePin: 'Ilagay ang phone number at PIN.',
    invalidLogin:  'Mali ang numero o PIN.',
    loginFailed:   'Hindi makapag-login. Subukan ulit.',
    errorInvalidPhone: 'Mali ang numero — dapat 10-13 digits',
    errorInvalidPin:   'Mali ang PIN — dapat 4-6 na digit',
    errorWrongPin:     'Mali ang numero o PIN',
    errorThrottled:    function(n) { return 'Sobrang daming pagsubok. Subukan ulit sa ' + n + ' segundo.'; },
    errorThrottledGeneric: 'Sobrang daming pagsubok. Subukan ulit mamaya.',
    errorInactive:     'Hindi aktibo ang account. Makipag-ugnayan sa DSM.',
    errorNetworkLogin: 'Walang internet. Hindi makapag-login offline.',

    // Data reassurance
    dataSaved:   function(kb) { return 'Ginamit: ' + kb + 'KB lang.'; },

    // Profile
    myStats:     'Mga Stats ko',
    storesMapped:'Tindahan',
    farmsLabel:  'Bukid',
    visitsWeek:  'Bisita/linggo',
    signOut:     'Mag-sign out',
    adminPanel:  'Admin Panel',
    account:     'Account',
    territory:   'Territory',
    role:        'Role',

    // Language
    language:       'Wika / Language',
    langHint:       'Pipiliin mo ang wika ng app.',
    langChanged:    'Wika ay binago',

    // Filter chips
    all:         'Lahat',
    critical:    'Critical',
    warning:     'Babala',
    ok:          'OK',
    thisWeek:    'Ngayong Linggo',

    // Map page
    territoryMap: 'Mapa ng Teritoryo',
    loadingStores:'Nilo-load ang mga tindahan...',
    storeHealth: 'Kalusugan ng Tindahan',
    onTrack:     'OK — Nasa tamang direksyon',
    needsAttention:'Babala — Kailangan ng atensiyon',
    actionRequired:'Critical — Kailangan ng aksyon',
    myLocation:  'Lokasyon ko',
    myTerritory: 'Ang teritoryo ko',

    // Visit form extras
    orderAmountPlaceholder: 'hal. 25000',
    merchChecklist: 'Merch Checklist (opsyonal)',

    // New store wizard status
    gpsCapturing:'Kinukuha ang GPS...',
    gpsTapHint:  'I-tap ang button para kunin ang GPS',
    gpsUnavailable:'Hindi available ang GPS — i-check ang settings',
    lowAccuracy: 'Mababang accuracy — pumunta sa open area',
    mapAfterGPS: 'Lalabas ang mapa pagkatapos kumuha ng GPS',
    openingCamera:'Binubuksan ang camera...',
    photoCaptured: function(kb) { return 'May litrato na (' + kb + ' KB)'; },
    photoCancelled:'Kinansela ang litrato',
    saving:      'Sine-save...',
    storeNameReq:'Kailangan ng pangalan ng tindahan.',
    storeNameMax:'Dapat mas mababa sa 100 character ang pangalan.',
    addressMax:  'Dapat mas mababa sa 200 character ang address.',
    phoneInvalid:'Mali ang format ng telepono (hal. 09171234567).',
    noBrands:    'Walang naka-record na brand',
    noProducts:  'Walang naka-record na produkto',
    noCompetitors:'Walang data ng kakumpitensya',
    noVisitsYet: 'Walang naka-record na bisita',
    accuracy:    'accuracy',

    // Champion team widget
    teamToday:   'Koponan mo ngayon',
    visitsOf:    function(done, total) { return done + '/' + total + ' visits'; },
    noTeamData:  'Walang data ng koponan ngayon.',
    assignedStores: function(n) { return n + ' store' + (n !== 1 ? 's' : '') + ' na-assign'; },
    viewStores:  'Tingnan ang mga stores',

    // Leaderboard widget
    leaderboard:     'Pinakamahusay ngayong linggo',
    rankLabel:       function(n) { return '#' + n; },
    visitsThisWeek:  function(n) { return n + ' bisita ngayong linggo'; },
    yourRank:        'Ikaw',
    keepGoing:       'tuloy lang!'
  },

  BIS: {
    // Navigation
    home:        'Balay',
    stores:      'Mga Tindahan',
    map:         'Mapa',
    profile:     'Akong Profile',

    // Greeting
    goodMorning: 'Maayong buntag',
    goodDay:     'Maayong adlaw',
    goodEvening: 'Maayong gabii',

    // Store list
    visitToday:  'Bisitahon karon',
    notVisited:  'Wala pa nabisita',
    lastVisit:   'Katapusang bisita',
    today:       'Karon',
    yesterday:   'Kagabie',
    daysAgo:     function(n) { return n + ' ka adlaw ang milabay'; },
    hoursAgo:    function(n) { return n + ' ka oras ang milabay'; },
    minsAgo:     function(n) { return n + ' ka minuto ang milabay'; },
    justNow:     'Bag-o lang',
    never:       'Wala pa nabisita',
    storesCount: function(n) { return n + ' ka tindahan'; },
    bagsMonth:   'bags/bulan',

    // Visit outcomes
    withOrder:   'Adunay Order',
    noOrder:     'Walay Order',
    comeback:    'Ugma pag-usab',
    ordered:     'Nag-order',
    noOrderNote: 'Nakaistorya, walay order',
    willReturn:  'Mobalik ugma',

    // Visit form
    whatHappened: 'Unsa ang nahitabo sa imong bisita?',
    logVisit:    'I-log ang bisita karon',

    // Actions
    submitVisit: 'I-SUBMIT ANG BISITA',
    takePhoto:   'Pagkuha og litrato',
    addNotes:    'Dugangi og notes...',
    syncNow:     'I-sync karon',
    refresh:     'I-refresh',
    call:        'Tawagi',
    directions:  'Direksyon',
    newStore:    '+ Bag-ong Tindahan',
    startVisit:  'Sugdi ang Bisita',
    back:        'Balik',
    cancel:      'Kanselahon',
    save:        'I-save',
    next:        'Sunod',
    done:        'Human na',
    retry:       'I-retry',

    // Sync status
    synced:      'Na-sync na',
    offline:     'Offline',
    pending:     function(n) { return n + ' naghulat'; },
    syncing:     'Nag-sync...',
    syncError:   'Dili na-sync. I-retry?',
    syncSuccess: 'Na-sync na!',

    // Errors / empty states
    noStores:    'Wala pay tindahan sa imong lista.',
    noVisits:    'Wala pay bisita.',
    noSignal:    'Walay signal. Gitipigan namo ang imong data.',
    submitOk:    'Na-save! Mag-sync kung naay signal.',
    submitFail:  'Adunay problema. Sulayi pag-usab.',
    loadError:   'Dili ma-load. Sulayi pag-usab.',
    photoTaken:  'Adunay litrato na',
    noPhoto:     'Wala pay litrato',

    // Visit details
    orderAmount: 'Kantidad sa order',
    bags:        'bags',
    merchScore:  'Merch Score',
    notes:       'Mga notes',
    competitor:  'Kakompetensya',

    // Store types
    feedsDealer: 'Feeds Dealer',
    farmSupply:  'Farm Supply',
    petShop:     'Pet Shop',
    veterinary:  'Veterinary',
    supermarket: 'Supermarket',
    other:       'Uban pa',

    // Onboarding
    welcome:     'Maayong pag-abot sa VieForce Patrol!',
    step1title:  'I-tap ang tindahan para mag-log og bisita',
    step2title:  'Pagkuha og litrato ug ibutang ang order',
    step3title:  'I-sync kung naay internet na',
    skip:        'Laktawi',
    getStarted:  'Magsugod na!',

    // Store detail tabs
    tabProfile:    'Profile',
    tabProducts:   'Produkto',
    tabCompetitors:'Kakompetensya',
    tabMerch:      'Merch',
    tabHistory:    'Kasaysayan',

    // Store detail labels
    contact:       'Kontak',
    owner:         'Tag-iya',
    phone:         'Telepono',
    supplyChain:   'Supply Chain',
    commercial:    'Komersyal',
    totalMonthlyVol:'Kinatibuk-ang bulanan nga volume',
    vienovoMonthly:'Vienovo bulanan',
    vienovoShare:  'Bahin sa Vienovo',
    visitHealth:   'Visit Health',
    lastVisitLabel:'Katapusang bisita',
    totalVisitsLabel:'Kinatibuk-ang bisita',
    target:        'Target',
    perMonth:      'matag bulan',

    // New store wizard
    newStoreTitle: 'Bag-ong Tindahan',
    step1Basic:    'Lakang 1: Basic Info',
    step1Desc:     'Ibutang ang detalye sa tindahan.',
    storeName:     'Ngalan sa Tindahan',
    ownerName:     'Ngalan sa Tag-iya',
    storeType:     'Klase sa Tindahan',
    selectType:    'Pagpili og klase...',
    step2Location: 'Lakang 2: Lokasyon',
    step2Desc:     'Kuhaa ang GPS ug ibutang ang address.',
    captureGPS:    'Kuhaa ang GPS Lokasyon',
    gpsHint:       'I-tap ang button para makuha ang GPS',
    province:      'Probinsya',
    cityMunicipality:'Siyudad / Munisipyo',
    addressLandmark:'Address / Landmark',
    step3Photo:    'Lakang 3: Litrato ug I-submit',
    step3Desc:     'Pagkuha og litrato ug i-classify ang tindahan.',
    volumeClass:   'Volume Class',
    healthStatus:  'Health Status',
    bagsPerMonth:  'Bags matag bulan (tantiya)',
    registerStore: 'I-register ang Tindahan',

    // Common actions
    backLabel:     'Balik',
    nextLabel:     'Sunod',
    cancelLabel:   'Kanselahon',

    // GPS
    gpsWarning:  'Dili ma-locate ang GPS.',
    gpsAllow:    'I-allow ang location sa settings.',
    gpsNoBlock:  'Mahimo ka gihapon mag-submit.',
    gpsAcquiring:'Gikuha ang GPS...',
    gpsOk:       'GPS OK',

    // Auth / Login
    phoneLabel:    'Phone Number',
    pinLabel:      'PIN Code',
    signIn:        'Mag-sign in',
    signingIn:     'Nag-sign in...',
    enterPhonePin: 'Ibutang ang phone number ug PIN.',
    invalidLogin:  'Sayop ang numero o PIN.',
    loginFailed:   'Dili maka-login. Sulayi pag-usab.',
    errorInvalidPhone: 'Sayop ang numero — kinahanglan 10-13 digits',
    errorInvalidPin:   'Sayop ang PIN — kinahanglan 4-6 ka digit',
    errorWrongPin:     'Sayop ang numero o PIN',
    errorThrottled:    function(n) { return 'Daghan kaayo og pagsulay. Sulayi pag-usab sa ' + n + ' segundo.'; },
    errorThrottledGeneric: 'Daghan kaayo og pagsulay. Sulayi pag-usab unya.',
    errorInactive:     'Dili aktibo ang account. Kontaka ang DSM.',
    errorNetworkLogin: 'Walay internet. Dili maka-login offline.',

    // Data reassurance
    dataSaved:   function(kb) { return 'Gigamit: ' + kb + 'KB lang.'; },

    // Profile
    myStats:     'Akong Stats',
    storesMapped:'Tindahan',
    farmsLabel:  'Uma',
    visitsWeek:  'Bisita/semana',
    signOut:     'Mag-sign out',
    adminPanel:  'Admin Panel',
    account:     'Account',
    territory:   'Territory',
    role:        'Role',

    // Language
    language:       'Pinulongan / Language',
    langHint:       'Pilia ang pinulongan sa app.',
    langChanged:    'Gibag-o ang pinulongan',

    // Filter chips
    all:         'Tanan',
    critical:    'Critical',
    warning:     'Babala',
    ok:          'OK',
    thisWeek:    'Karong Semana',

    // Map page
    territoryMap: 'Mapa sa Teritoryo',
    loadingStores:'Gi-load ang mga tindahan...',
    storeHealth: 'Kahimsog sa Tindahan',
    onTrack:     'OK — Naa sa track',
    needsAttention:'Babala — Kinahanglan og atensiyon',
    actionRequired:'Critical — Kinahanglan og aksyon',
    myLocation:  'Akong lokasyon',
    myTerritory: 'Akong teritoryo',

    // Visit form extras
    orderAmountPlaceholder: 'pananglitan 25000',
    merchChecklist: 'Merch Checklist (opsyonal)',

    // New store wizard status
    gpsCapturing:'Gikuha ang GPS...',
    gpsTapHint:  'I-tap ang button para makuha ang GPS',
    gpsUnavailable:'Dili available ang GPS — i-check ang settings',
    lowAccuracy: 'Ubos nga accuracy — adto sa open area',
    mapAfterGPS: 'Mogawas ang mapa pagkahuman makuha ang GPS',
    openingCamera:'Gi-abli ang camera...',
    photoCaptured: function(kb) { return 'Adunay litrato na (' + kb + ' KB)'; },
    photoCancelled:'Gikansela ang litrato',
    saving:      'Gi-save...',
    storeNameReq:'Kinahanglan ang ngalan sa tindahan.',
    storeNameMax:'Kinahanglan ubos sa 100 character ang ngalan.',
    addressMax:  'Kinahanglan ubos sa 200 character ang address.',
    phoneInvalid:'Sayop ang format sa telepono (pananglitan 09171234567).',
    noBrands:    'Walay na-record nga brand',
    noProducts:  'Walay na-record nga produkto',
    noCompetitors:'Walay data sa kakompetensya',
    noVisitsYet: 'Walay na-record nga bisita',
    accuracy:    'accuracy',

    // Champion team widget
    teamToday:   'Imong team karon',
    visitsOf:    function(done, total) { return done + '/' + total + ' visits'; },
    noTeamData:  'Walay data sa team karon.',
    assignedStores: function(n) { return n + ' store' + (n !== 1 ? 's' : '') + ' na-assign'; },
    viewStores:  'Tan-awa ang mga stores',

    // Leaderboard widget
    leaderboard:     'Pinakagwapa karong semana',
    rankLabel:       function(n) { return '#' + n; },
    visitsThisWeek:  function(n) { return n + ' bisita karong semana'; },
    yourRank:        'Ikaw',
    keepGoing:       'padayon lang!'
  },

  EN: {
    // Navigation
    home:        'Home',
    stores:      'Stores',
    map:         'Map',
    profile:     'My Profile',

    // Greeting
    goodMorning: 'Good morning',
    goodDay:     'Good afternoon',
    goodEvening: 'Good evening',

    // Store list
    visitToday:  'Visit today',
    notVisited:  'Not yet visited',
    lastVisit:   'Last visit',
    today:       'Today',
    yesterday:   'Yesterday',
    daysAgo:     function(n) { return n + ' days ago'; },
    hoursAgo:    function(n) { return n + ' hours ago'; },
    minsAgo:     function(n) { return n + ' minutes ago'; },
    justNow:     'Just now',
    never:       'Never visited',
    storesCount: function(n) { return n + ' store' + (n !== 1 ? 's' : ''); },
    bagsMonth:   'bags/month',

    // Visit outcomes
    withOrder:   'With Order',
    noOrder:     'No Order',
    comeback:    'Come back later',
    ordered:     'Ordered',
    noOrderNote: 'Talked, no order',
    willReturn:  'Will return tomorrow',

    // Visit form
    whatHappened: 'What happened on your visit?',
    logVisit:    'Log visit now',

    // Actions
    submitVisit: 'SUBMIT VISIT',
    takePhoto:   'Take a photo',
    addNotes:    'Add notes...',
    syncNow:     'Sync now',
    refresh:     'Refresh',
    call:        'Call',
    directions:  'Directions',
    newStore:    '+ New Store',
    startVisit:  'Start Visit',
    back:        'Back',
    cancel:      'Cancel',
    save:        'Save',
    next:        'Next',
    done:        'Done',
    retry:       'Retry',

    // Sync status
    synced:      'Synced',
    offline:     'Offline',
    pending:     function(n) { return n + ' pending'; },
    syncing:     'Syncing...',
    syncError:   'Sync failed. Retry?',
    syncSuccess: 'Synced!',

    // Errors / empty states
    noStores:    'No stores assigned yet.',
    noVisits:    'No visits yet.',
    noSignal:    'No signal. Your data is saved.',
    submitOk:    'Saved! Will sync when online.',
    submitFail:  'Something went wrong. Try again.',
    loadError:   'Cannot load. Try again.',
    photoTaken:  'Photo taken',
    noPhoto:     'No photo yet',

    // Visit details
    orderAmount: 'Order amount',
    bags:        'bags',
    merchScore:  'Merch Score',
    notes:       'Notes',
    competitor:  'Competitor',

    // Store types
    feedsDealer: 'Feeds Dealer',
    farmSupply:  'Farm Supply',
    petShop:     'Pet Shop',
    veterinary:  'Veterinary',
    supermarket: 'Supermarket',
    other:       'Other',

    // Onboarding
    welcome:     'Welcome to VieForce Patrol!',
    step1title:  'Tap a store to log your visit',
    step2title:  'Take a photo and enter the order',
    step3title:  'Sync when you have internet',
    skip:        'Skip',
    getStarted:  'Get started!',

    // Store detail tabs
    tabProfile:    'Profile',
    tabProducts:   'Products',
    tabCompetitors:'Competitors',
    tabMerch:      'Merch',
    tabHistory:    'History',

    // Store detail labels
    contact:       'Contact',
    owner:         'Owner',
    phone:         'Phone',
    supplyChain:   'Supply Chain',
    commercial:    'Commercial',
    totalMonthlyVol:'Total monthly volume',
    vienovoMonthly:'Vienovo monthly',
    vienovoShare:  'Vienovo share',
    visitHealth:   'Visit Health',
    lastVisitLabel:'Last visit',
    totalVisitsLabel:'Total visits',
    target:        'Target',
    perMonth:      'per month',

    // New store wizard
    newStoreTitle: 'New Store',
    step1Basic:    'Step 1: Basic Info',
    step1Desc:     'Enter the store details.',
    storeName:     'Store Name',
    ownerName:     'Owner Name',
    storeType:     'Store Type',
    selectType:    'Select type...',
    step2Location: 'Step 2: Location',
    step2Desc:     'Capture GPS and enter the address.',
    captureGPS:    'Capture GPS Location',
    gpsHint:       'Tap the button to capture GPS',
    province:      'Province',
    cityMunicipality:'City / Municipality',
    addressLandmark:'Address / Landmark',
    step3Photo:    'Step 3: Photo & Submit',
    step3Desc:     'Take a photo and classify the store.',
    volumeClass:   'Volume Class',
    healthStatus:  'Health Status',
    bagsPerMonth:  'Bags per month (estimate)',
    registerStore: 'Register Store',

    // Common actions
    backLabel:     'Back',
    nextLabel:     'Next',
    cancelLabel:   'Cancel',

    // GPS
    gpsWarning:  'Cannot locate GPS.',
    gpsAllow:    'Allow location in settings.',
    gpsNoBlock:  'You can still submit.',
    gpsAcquiring:'Acquiring GPS...',
    gpsOk:       'GPS OK',

    // Auth / Login
    phoneLabel:    'Phone Number',
    pinLabel:      'PIN Code',
    signIn:        'Sign In',
    signingIn:     'Signing in...',
    enterPhonePin: 'Enter phone number and PIN.',
    invalidLogin:  'Invalid phone number or PIN.',
    loginFailed:   'Login failed. Try again.',
    errorInvalidPhone: 'Invalid number — must be 10-13 digits',
    errorInvalidPin:   'Invalid PIN — must be 4-6 digits',
    errorWrongPin:     'Wrong number or PIN',
    errorThrottled:    function(n) { return 'Too many attempts. Try again in ' + n + ' seconds.'; },
    errorThrottledGeneric: 'Too many attempts. Try again later.',
    errorInactive:     'Account inactive. Contact your DSM.',
    errorNetworkLogin: 'No internet. Cannot login offline.',

    // Data reassurance
    dataSaved:   function(kb) { return 'Used: ' + kb + 'KB only.'; },

    // Profile
    myStats:     'My Stats',
    storesMapped:'Stores',
    farmsLabel:  'Farms',
    visitsWeek:  'Visits/week',
    signOut:     'Sign out',
    adminPanel:  'Admin Panel',
    account:     'Account',
    territory:   'Territory',
    role:        'Role',

    // Language
    language:       'Language',
    langHint:       'Choose your app language.',
    langChanged:    'Language changed',

    // Filter chips
    all:         'All',
    critical:    'Critical',
    warning:     'Warning',
    ok:          'OK',
    thisWeek:    'This Week',

    // Map page
    territoryMap: 'Territory Map',
    loadingStores:'Loading stores...',
    storeHealth: 'Store Health',
    onTrack:     'OK — On track',
    needsAttention:'Warning — Needs attention',
    actionRequired:'Critical — Action required',
    myLocation:  'My Location',
    myTerritory: 'My Territory',

    // Visit form extras
    orderAmountPlaceholder: 'e.g. 25000',
    merchChecklist: 'Merch Checklist (optional)',

    // New store wizard status
    gpsCapturing:'Acquiring GPS...',
    gpsTapHint:  'Tap the button to capture GPS',
    gpsUnavailable:'GPS unavailable — check settings',
    lowAccuracy: 'Low accuracy — move to an open area',
    mapAfterGPS: 'Map will appear after GPS capture',
    openingCamera:'Opening camera...',
    photoCaptured: function(kb) { return 'Photo captured (' + kb + ' KB)'; },
    photoCancelled:'Photo capture cancelled',
    saving:      'Saving...',
    storeNameReq:'Store name is required.',
    storeNameMax:'Store name must be under 100 characters.',
    addressMax:  'Address must be under 200 characters.',
    phoneInvalid:'Phone number format is invalid (e.g. 09171234567).',
    noBrands:    'No brands recorded',
    noProducts:  'No products recorded yet',
    noCompetitors:'No competitor data yet',
    noVisitsYet: 'No visits recorded yet',
    accuracy:    'accuracy',

    // Champion team widget
    teamToday:   'Your team today',
    visitsOf:    function(done, total) { return done + '/' + total + ' visits'; },
    noTeamData:  'No team data today.',
    assignedStores: function(n) { return n + ' store' + (n !== 1 ? 's' : '') + ' assigned'; },
    viewStores:  'View stores',

    // Leaderboard widget
    leaderboard:     'Top performers this week',
    rankLabel:       function(n) { return '#' + n; },
    visitsThisWeek:  function(n) { return n + ' visits this week'; },
    yourRank:        'You',
    keepGoing:       'keep going!'
  }
};

// Active language — read from localStorage, default Tagalog
var currentLang = localStorage.getItem('patrol_lang') || 'TL';

// T object — Proxy that resolves to current language, falls back to TL
var T = new Proxy({}, {
  get: function(_, key) {
    if (LABELS[currentLang] && LABELS[currentLang][key] !== undefined) {
      return LABELS[currentLang][key];
    }
    return LABELS['TL'][key] || key;
  }
});

// Switch language and re-render
function setLanguage(lang) {
  if (['TL','BIS','EN'].indexOf(lang) === -1) return;
  currentLang = lang;
  localStorage.setItem('patrol_lang', lang);
  rerenderCurrentPage();
  showLangToast();
}

// Re-render all data-t elements + active page dynamic content
function rerenderCurrentPage() {
  // Update all static elements with data-t attribute
  document.querySelectorAll('[data-t]').forEach(function(el) {
    var key = el.dataset.t;
    if (T[key] && typeof T[key] === 'string') {
      el.textContent = T[key];
    }
  });

  // Update language pill active states
  document.querySelectorAll('.lang-pill').forEach(function(pill) {
    if (pill.dataset.lang === currentLang) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  // Re-render dynamic page content
  var activePage = document.querySelector('.page.active');
  if (!activePage) return;

  if (activePage.id === 'page-stores' && typeof renderStoreList === 'function') {
    renderStoreList();
  }
  if (activePage.id === 'page-home' && typeof renderStoreList === 'function') {
    renderStoreList();
  }
  if (activePage.id === 'page-visits' && typeof renderVisitList === 'function') {
    renderVisitList();
  }

  // Update greeting
  var greetingEl = document.getElementById('home-greeting');
  if (greetingEl) {
    var session = typeof getSession === 'function' ? getSession() : null;
    var firstName = session ? (session.name || '').split(' ')[0] : '';
    greetingEl.textContent = getGreeting() + (firstName ? ', ' + firstName + '!' : '!');
  }

  // Update bottom nav labels
  document.querySelectorAll('.nav-item[data-t]').forEach(function(el) {
    var key = el.dataset.t;
    if (T[key] && typeof T[key] === 'string') {
      // Preserve the SVG icon, just update text
      var svg = el.querySelector('svg');
      el.textContent = T[key];
      if (svg) el.prepend(svg);
    }
  });
}

// Brief toast notification when language changes
function showLangToast() {
  var existing = document.getElementById('lang-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'lang-toast';
  toast.textContent = T.langChanged;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'background:var(--accent-dark,#004D71);color:white;padding:10px 24px;border-radius:24px;' +
    'font-size:14px;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.3s;';
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.style.opacity = '1'; });
  setTimeout(function() {
    toast.style.opacity = '0';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2000);
}

// Relative time using current language
function formatRelativeTimeTagalog(dateStr) {
  if (!dateStr) return T.never;
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = now - then;
  if (diff < 0) return T.justNow;

  var mins = Math.floor(diff / 60000);
  if (mins < 1) return T.justNow;
  if (mins < 60) return T.minsAgo(mins);

  var hours = Math.floor(mins / 60);
  if (hours < 24) return T.hoursAgo(hours);

  var days = Math.floor(hours / 24);
  if (days === 1) return T.yesterday;
  if (days < 30) return T.daysAgo(days);

  var locale = currentLang === 'EN' ? 'en-US' : 'fil-PH';
  return new Date(dateStr).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Greeting based on time of day
function getGreeting() {
  var h = new Date().getHours();
  if (h < 12) return T.goodMorning;
  if (h < 18) return T.goodDay;
  return T.goodEvening;
}

// Store type in current language
function formatStoreTypeTagalog(type) {
  if (!type) return '';
  var map = {
    feeds_dealer: T.feedsDealer,
    farm_supply: T.farmSupply,
    pet_shop: T.petShop,
    veterinary: T.veterinary,
    supermarket: T.supermarket,
    other: T.other
  };
  return map[type] || type;
}

window.T = T;
window.LABELS = LABELS;
window.currentLang = currentLang;
window.setLanguage = setLanguage;
window.rerenderCurrentPage = rerenderCurrentPage;
