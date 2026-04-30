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
    noOrder:     'Nakausap \u00b7 Walang Order',
    comeback:    'Bukas ulit',
    ordered:     'Nag-order',
    noOrderNote: 'Nakausap, walang order',
    willReturn:  'Babalik bukas',

    // Visit form
    whatHappened: 'Ano ang nangyari? \ud83c\udfea',
    logVisit:    'I-log ang visit ngayon',
    vieShare:    'VIE Share',
    optional:    'opsyonal',

    // Actions
    submitVisit: 'I-SUBMIT ANG VISIT',
    takePhoto:   'Kumuha ng litrato',
    addNotes:    'Dagdag ng notes... (opsyonal)',
    syncNow:     'I-sync ngayon',
    refresh:     'I-refresh',
    call:        'Tawagan',
    directions:  'Direksyon',
    newStore:    '+ Bagong Tindahan',
    newFarm:     '+ Bagong Farm',
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
    keepGoing:       'tuloy lang!',

    // Team (DSM/RSM/Exec)
    team:            'Team',
    teamHeader:      'Team ko',
    searchTeam:      'Hanapin ang team member...',
    myTeam:          'Team ko ngayon',
    visitsToday:     'Bisita ngayon',
    activeTsrs:      'Aktibong TSR',
    storesCovered:   'Tindahan na-bisita',
    noTeamYet:       'Walang team member pa. Makipag-ugnayan sa admin.',
    noActivityToday: 'Walang activity ngayon',

    // Scorecard (Phase 3)
    prospection:     'Prospeksyon',
    conversion:      'Konbersyon',
    retention:       'Retention',
    growth:          'Paglago',
    newStores:       'Bagong tindahan',
    newShort:        'bago',
    converted:       'Na-convert',
    conversionRate:  'Conversion rate',
    visited:         'Na-bisita',
    atRisk:          'May panganib',
    churned:         'Nawala',
    mtdVolume:       'MTD Volume',
    growthPct:       'Paglago vs LM',
    avgSov:          'Avg SOV',
    recentVisits:    'Mga huling bisita',
    activeProspects: 'Aktibong prospect',
    myScorecard:     'Scorecard ko ngayong buwan',
    overallScore:    'Overall Score',
    firstOrder:      'Unang order!',
    convertedFromProspect: 'Nag-convert si prospect',
    loading:         'Nilo-load...',
    daysWithoutVisit: function(n) { return n + ' araw nang hindi nabibisita'; },
    neverVisited:    'Hindi pa nabibisita',
    takePhotoNow:    'Kumuha ng litrato',
    photoMandatory:  'Mandatory para sa visit na ito',
    photoCapturedTitle: 'Na-capture na!',
    photoRetakeHint: 'I-tap para palitan',

    // Home KPI labels (TSR home)
    kpiStores:       'MGA TINDAHAN',
    kpiWeeklyVisits: 'BISITA/LINGGO',
    kpiCritical:     'CRITICAL',
    kpiOrders:       'ORDERS',
    kpiMapped:       'na-map na',
    kpiThisWeek:     'ngayong linggo',
    kpiNeedsAttn:    'kailangan ng atensyon',
    kpiAllOk:        'OK lahat',

    // Sprint B-TSR — Next Best Action + Streak
    nbaLabel:        'ANG UNANG BISITA MO NGAYON',
    nbaGo:           'GO NGAYON',
    nbaSkip:         'Skip',
    streakStart:     'Magsimula ng streak!',
    streakStartHint: 'Mag-log ng visit ngayon \ud83d\udd25',
    streakLabel:     'Visit streak',
    streakDays:      'Day Streak!',
    streakDaysTo:    'more days',
    streakLegendary: 'Legendary streak — keep going!',
    badgeReliable:   'Reliable TSR',
    badgeIron:       'Iron TSR',
    badgeElite:      'Elite TSR',
    badgeLegend:     'Legend TSR'
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
    noOrder:     'Nakaistorya \u00b7 Walay Order',
    comeback:    'Ugma pag-usab',
    ordered:     'Nag-order',
    noOrderNote: 'Nakaistorya, walay order',
    willReturn:  'Mobalik ugma',

    // Visit form
    whatHappened: 'Unsa ang nahitabo? \ud83c\udfea',
    logVisit:    'I-log ang bisita karon',
    vieShare:    'VIE Share',
    optional:    'opsyonal',

    // Actions
    submitVisit: 'I-SUBMIT ANG BISITA',
    takePhoto:   'Kuhai og litrato',
    addNotes:    'Dugangi og notes... (opsyonal)',
    syncNow:     'I-sync karon',
    refresh:     'I-refresh',
    call:        'Tawagi',
    directions:  'Direksyon',
    newStore:    '+ Bag-ong Tindahan',
    newFarm:     '+ Bag-ong Farm',
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
    keepGoing:       'padayon lang!',

    // Team (DSM/RSM/Exec)
    team:            'Team',
    teamHeader:      'Akong Team',
    searchTeam:      'Pangitaa ang team member...',
    myTeam:          'Akong team karon',
    visitsToday:     'Bisita karon',
    activeTsrs:      'Aktibo nga TSR',
    storesCovered:   'Tindahan na-bisita',
    noTeamYet:       'Wala pay team member. Kontaka ang admin.',
    noActivityToday: 'Walay activity karon',

    // Scorecard (Phase 3)
    prospection:     'Pangita og bag-o',
    conversion:      'Konbersyon',
    retention:       'Retention',
    growth:          'Paglambo',
    newStores:       'Bag-ong tindahan',
    newShort:        'bag-o',
    converted:       'Na-convert',
    conversionRate:  'Conversion rate',
    visited:         'Na-bisita',
    atRisk:          'Nameligro',
    churned:         'Nawala',
    mtdVolume:       'MTD Volume',
    growthPct:       'Paglambo vs LM',
    avgSov:          'Avg SOV',
    recentVisits:    'Katapusang bisita',
    activeProspects: 'Aktibo nga prospect',
    myScorecard:     'Akong scorecard karong bulana',
    overallScore:    'Overall Score',
    firstOrder:      'Unang order!',
    convertedFromProspect: 'Nag-convert ang prospect',
    loading:         'Gi-load...',
    daysWithoutVisit: function(n) { return n + ' ka adlaw wala mabisita'; },
    neverVisited:    'Wala pa mabisita',
    takePhotoNow:    'Kuhai og litrato',
    photoMandatory:  'Mandatory sa bisita na ni',
    photoCapturedTitle: 'Na-capture na!',
    photoRetakeHint: 'I-tap aron ilisan',

    // Home KPI labels (TSR home)
    kpiStores:       'MGA TINDAHAN',
    kpiWeeklyVisits: 'BISITA/SEMANA',
    kpiCritical:     'KRITIKAL',
    kpiOrders:       'ORDERS',
    kpiMapped:       'na-map na',
    kpiThisWeek:     'karong semana',
    kpiNeedsAttn:    'kinahanglan atensyon',
    kpiAllOk:        'OK tanan',

    // Sprint B-TSR
    nbaLabel:        'IMONG UNANG BISITA KARON',
    nbaGo:           'GO KARON',
    nbaSkip:         'Skip',
    streakStart:     'Sugdi ang streak!',
    streakStartHint: 'Mag-log og bisita karon \ud83d\udd25',
    streakLabel:     'Visit streak',
    streakDays:      'ka-Adlaw Streak!',
    streakDaysTo:    'ka adlaw pa',
    streakLegendary: 'Legendary streak \u2014 padayon!',
    badgeReliable:   'Reliable TSR',
    badgeIron:       'Iron TSR',
    badgeElite:      'Elite TSR',
    badgeLegend:     'Legend TSR'
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
    noOrder:     'Talked \u00b7 No Order',
    comeback:    'Come back later',
    ordered:     'Ordered',
    noOrderNote: 'Talked, no order',
    willReturn:  'Will return tomorrow',

    // Visit form
    whatHappened: 'What happened? \ud83c\udfea',
    logVisit:    'Log visit now',
    vieShare:    'VIE Share',
    optional:    'optional',

    // Actions
    submitVisit: 'SUBMIT VISIT',
    takePhoto:   'Take a photo',
    addNotes:    'Add notes... (optional)',
    syncNow:     'Sync now',
    refresh:     'Refresh',
    call:        'Call',
    directions:  'Directions',
    newStore:    '+ New Store',
    newFarm:     '+ New Farm',
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
    keepGoing:       'keep going!',

    // Team (DSM/RSM/Exec)
    team:            'Team',
    teamHeader:      'My Team',
    searchTeam:      'Search team member...',
    myTeam:          'My team today',
    visitsToday:     'Visits today',
    activeTsrs:      'Active TSRs',
    storesCovered:   'Stores covered',
    noTeamYet:       'No team members yet. Contact your admin.',
    noActivityToday: 'No activity today',

    // Scorecard (Phase 3)
    prospection:     'Prospection',
    conversion:      'Conversion',
    retention:       'Retention',
    growth:          'Growth',
    newStores:       'New stores',
    newShort:        'new',
    converted:       'Converted',
    conversionRate:  'Conversion rate',
    visited:         'Visited',
    atRisk:          'At risk',
    churned:         'Churned',
    mtdVolume:       'MTD Volume',
    growthPct:       'Growth vs LM',
    avgSov:          'Avg SOV',
    recentVisits:    'Recent visits',
    activeProspects: 'Active prospects',
    myScorecard:     'My scorecard this month',
    overallScore:    'Overall Score',
    firstOrder:      'First order!',
    convertedFromProspect: 'Prospect converted',
    loading:         'Loading...',
    daysWithoutVisit: function(n) { return n + ' days without visit'; },
    neverVisited:    'Never visited',
    takePhotoNow:    'Take a photo',
    photoMandatory:  'Required for this visit',
    photoCapturedTitle: 'Photo captured!',
    photoRetakeHint: 'Tap to retake',

    // Home KPI labels (TSR home)
    kpiStores:       'STORES',
    kpiWeeklyVisits: 'VISITS/WEEK',
    kpiCritical:     'CRITICAL',
    kpiOrders:       'ORDERS',
    kpiMapped:       'mapped',
    kpiThisWeek:     'this week',
    kpiNeedsAttn:    'needs attention',
    kpiAllOk:        'all OK',

    // Sprint B-TSR
    nbaLabel:        'YOUR FIRST VISIT TODAY',
    nbaGo:           'GO NOW',
    nbaSkip:         'Skip',
    streakStart:     'Start a streak!',
    streakStartHint: 'Log a visit today \ud83d\udd25',
    streakLabel:     'Visit streak',
    streakDays:      'Day Streak!',
    streakDaysTo:    'more days',
    streakLegendary: 'Legendary streak \u2014 keep going!',
    badgeReliable:   'Reliable TSR',
    badgeIron:       'Iron TSR',
    badgeElite:      'Elite TSR',
    badgeLegend:     'Legend TSR'
  }
};

// Active language — use window.currentLang explicitly to avoid scope conflicts
// Normalize existing stored value to uppercase (fixes 'en' → 'EN' corruption)
var storedLang = localStorage.getItem('patrol_lang');
if (storedLang) {
  localStorage.setItem('patrol_lang', storedLang.toUpperCase());
}
window.currentLang = (localStorage.getItem('patrol_lang') || 'TL').toUpperCase();

// Build T as plain object for current language — no Proxy (fails on slow mobile)
function getT() {
  var lang = window.currentLang || (localStorage.getItem('patrol_lang') || 'TL').toUpperCase();
  var src = LABELS[lang] || LABELS['TL'];
  var fallback = LABELS['TL'];
  var obj = {};
  // Copy all keys from TL as base, then overlay current lang
  for (var k in fallback) {
    if (fallback.hasOwnProperty(k)) obj[k] = fallback[k];
  }
  if (src !== fallback) {
    for (var k2 in src) {
      if (src.hasOwnProperty(k2)) obj[k2] = src[k2];
    }
  }
  return obj;
}

// var hoists — available immediately even on slow mobile parsers
var T = getT();
window.T = T;

function _rerenderDynamicLocalizedViews() {
  if (typeof renderStoreList === 'function' && (
    document.getElementById('tindahanAllList') ||
    document.getElementById('storesList') ||
    document.getElementById('store-list')
  )) {
    renderStoreList();
  }
  if (typeof updateHomeKPIs === 'function') {
    updateHomeKPIs();
  }
  if (typeof renderVisitList === 'function' && document.getElementById('visit-list')) {
    renderVisitList();
  }
  if (typeof initDashboard === 'function' && document.getElementById('page-dashboard')) {
    initDashboard();
  }
  if (typeof openStoreDetail === 'function' && window._currentStoreId) {
    openStoreDetail(window._currentStoreId);
  }
}

// Switch language and re-render
function setLanguage(lang, opts) {
  opts = opts || {};
  var silent = !!opts.silent;
  var source = opts.source || 'local';
  console.log('setLanguage input:', lang);
  lang = String(lang).toUpperCase();
  console.log('after toUpperCase:', lang);
  if (lang !== 'TL' && lang !== 'BIS' && lang !== 'EN') {
    console.log('REJECTED - invalid lang:', lang);
    return;
  }
  window.currentLang = lang;
  console.log('window.currentLang set to:', window.currentLang);
  localStorage.setItem('patrol_lang', lang);
  console.log('localStorage set to:', localStorage.getItem('patrol_lang'));
  // Rebuild T in-place — keeps same reference for all scripts
  var newT = getT();
  console.log('newT.withOrder:', newT.withOrder);
  var keys = Object.keys(newT);
  for (var i = 0; i < keys.length; i++) {
    T[keys[i]] = newT[keys[i]];
  }
  window.T = T;
  console.log('T.withOrder after rebuild:', T.withOrder);
  // Force update all data-t elements
  var els = document.querySelectorAll('[data-t]');
  for (var j = 0; j < els.length; j++) {
    var k = els[j].getAttribute('data-t');
    if (T[k] && typeof T[k] === 'string') els[j].textContent = T[k];
  }
  // data-t-placeholder elements (for inputs/textareas)
  var phs = document.querySelectorAll('[data-t-placeholder]');
  for (var ph = 0; ph < phs.length; ph++) {
    var pk = phs[ph].getAttribute('data-t-placeholder');
    if (T[pk] && typeof T[pk] === 'string') phs[ph].setAttribute('placeholder', T[pk]);
  }
  // Re-render dynamic content on the currently active page (incl. store detail)
  var activePage = document.querySelector('.page.active');
  if (activePage) {
    var aid = activePage.id;
    if (aid === 'page-stores' && typeof renderStoreList === 'function') renderStoreList();
    if (aid === 'page-home' && typeof renderStoreList === 'function') renderStoreList();
    if (aid === 'page-home' && typeof updateHomeKPIs === 'function') updateHomeKPIs();
    if (aid === 'page-home' && typeof renderTsrScorecardHero === 'function') renderTsrScorecardHero();
    if (aid === 'page-home' && typeof renderNbaHero === 'function') renderNbaHero();
    if (aid === 'page-home' && typeof renderStreakCard === 'function') renderStreakCard();
    if (aid === 'page-visits' && typeof renderVisitList === 'function') renderVisitList();
    if (aid === 'page-dashboard' && typeof initDashboard === 'function') initDashboard();
    if (aid === 'page-home' && typeof initActivityFeed === 'function') {
      var sFeed2 = typeof getSession === 'function' ? getSession() : null;
      var rf2 = sFeed2 && sFeed2.role ? String(sFeed2.role).toLowerCase() : '';
      if (rf2 === 'tsr' || rf2 === 'champion') initActivityFeed('tsr');
    }
    if (aid === 'page-rsm-home' && typeof initActivityFeed === 'function') initActivityFeed('rsm');
    if (aid === 'page-home-tsr' && typeof renderTsrHome === 'function') renderTsrHome();
    if (aid === 'page-home-dsm' && typeof renderDsmHome === 'function') renderDsmHome();
    if (aid === 'page-store-detail' && typeof openStoreDetail === 'function' && window._currentStoreId) {
      openStoreDetail(window._currentStoreId);
    }
  }
  _rerenderDynamicLocalizedViews();
  // Reset ALL pills to inactive first
  var pills = document.querySelectorAll('.lang-pill, .login-lang-btn');
  for (var p = 0; p < pills.length; p++) {
    pills[p].style.background = 'transparent';
    pills[p].style.color = '#004D71';
    pills[p].style.borderColor = '#004D71';
    pills[p].classList.remove('active');
  }
  // Then activate only matching pill
  for (var p2 = 0; p2 < pills.length; p2++) {
    var pl = (pills[p2].getAttribute('data-lang') || '').toUpperCase();
    if (pl === lang) {
      pills[p2].style.background = '#004D71';
      pills[p2].style.color = '#ffffff';
      pills[p2].style.borderColor = '#004D71';
      pills[p2].classList.add('active');
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('patrol:language-changed', { detail: { lang: lang, source: source } }));
  } catch (e) {}
  if (!silent) showLangToast();
  console.log('setLanguage COMPLETE:', window.currentLang);
}

// Re-render all data-t elements + active page dynamic content
function rerenderCurrentPage() {
  // Update all static elements with data-t attribute
  var els = document.querySelectorAll('[data-t]');
  for (var i = 0; i < els.length; i++) {
    var key = els[i].getAttribute('data-t');
    if (T[key] && typeof T[key] === 'string') {
      els[i].textContent = T[key];
    }
  }
  // data-t-placeholder elements
  var phs = document.querySelectorAll('[data-t-placeholder]');
  for (var ph = 0; ph < phs.length; ph++) {
    var pk = phs[ph].getAttribute('data-t-placeholder');
    if (T[pk] && typeof T[pk] === 'string') phs[ph].setAttribute('placeholder', T[pk]);
  }

  // Reset ALL pills to inactive first
  var pills = document.querySelectorAll('.lang-pill, .login-lang-btn');
  for (var p = 0; p < pills.length; p++) {
    pills[p].style.background = 'transparent';
    pills[p].style.color = '#004D71';
    pills[p].style.borderColor = '#004D71';
    pills[p].classList.remove('active');
  }
  // Then activate only matching pill
  for (var p2 = 0; p2 < pills.length; p2++) {
    var pl = (pills[p2].getAttribute('data-lang') || '').toUpperCase();
    if (pl === (window.currentLang || '').toUpperCase()) {
      pills[p2].style.background = '#004D71';
      pills[p2].style.color = '#ffffff';
      pills[p2].style.borderColor = '#004D71';
      pills[p2].classList.add('active');
    }
  }

  // Re-render dynamic page content
  var activePage = document.querySelector('.page.active');
  if (!activePage) return;
  var id = activePage.id;

  if (id === 'page-stores') {
    if (typeof applyStoresNavPreference === 'function' && applyStoresNavPreference()) {
      /* list already rendered */
    } else if (typeof renderStoreList === 'function') {
      renderStoreList();
    }
  }
  if (id === 'page-home' && typeof renderStoreList === 'function') {
    renderStoreList();
  }
  if (id === 'page-home' && typeof updateHomeKPIs === 'function') {
    updateHomeKPIs();
  }
  if (id === 'page-visits' && typeof renderVisitList === 'function') {
    renderVisitList();
  }
  if (id === 'page-dashboard' && typeof initDashboard === 'function') {
    initDashboard();
  }
  if (id === 'page-home' && typeof initActivityFeed === 'function') {
    var sFeed = typeof getSession === 'function' ? getSession() : null;
    var rf = sFeed && sFeed.role ? String(sFeed.role).toLowerCase() : '';
    if (rf === 'tsr' || rf === 'champion') initActivityFeed('tsr');
  }
  if (id === 'page-rsm-home' && typeof initActivityFeed === 'function') {
    initActivityFeed('rsm');
  }
  if (id === 'page-home-tsr' && typeof renderTsrHome === 'function') {
    renderTsrHome();
  }
  if (id === 'page-home-dsm' && typeof renderDsmHome === 'function') {
    renderDsmHome();
  }
  if (id === 'page-store-detail' && typeof openStoreDetail === 'function' && window._currentStoreId) {
    openStoreDetail(window._currentStoreId);
  }
  // Profile page — update labels that are not data-t
  if (id === 'page-profile') {
    var signOutBtn = document.getElementById('btn-logout');
    if (signOutBtn) signOutBtn.textContent = T.signOut;
    var statsLabel = activePage.querySelector('[style*="Mga Stats"]');
    // Re-render stats labels
    var session = typeof getSession === 'function' ? getSession() : null;
    if (session) {
      var roleEl = document.getElementById('profile-role');
      if (roleEl) {
        roleEl.textContent = (session.role || '').toUpperCase() +
          (session.territory ? ' \u00B7 ' + session.territory : '');
      }
    }
    var uid = window._patrolProfileUserId;
    if (!uid && session) uid = session.id;
    if (typeof window.loadPatrolProfile === 'function') {
      window.loadPatrolProfile(uid);
    }
  }

  if (id === 'page-leader' && typeof window.refreshLeaderboardPage === 'function') {
    window.refreshLeaderboardPage();
  }
  if (id === 'page-notifs' && typeof window.renderPatrolNotifs === 'function') {
    window.renderPatrolNotifs();
  }
  if (id === 'page-search' && typeof window.renderSearchEmpty === 'function') {
    window.renderSearchEmpty();
  }

  // Update greeting
  var greetingEl = document.getElementById('home-greeting');
  if (greetingEl) {
    var sess = typeof getSession === 'function' ? getSession() : null;
    var firstName = sess ? (sess.name || '').split(' ')[0] : '';
    greetingEl.textContent = getGreeting() + (firstName ? ', ' + firstName + '!' : '!');
    var dsmGreet = document.getElementById('dsm-feed-greeting');
    if (dsmGreet) dsmGreet.textContent = greetingEl.textContent;
    var dsmSub = document.getElementById('dsm-feed-subtitle');
    if (dsmSub && sess) {
      dsmSub.textContent =
        'Pulse · ' + (sess.district || sess.territory || sess.region || 'District');
    }
  }

  // Update bottom nav labels
  var navItems = document.querySelectorAll('.nav-item[data-t]');
  for (var n = 0; n < navItems.length; n++) {
    var nkey = navItems[n].getAttribute('data-t');
    if (T[nkey] && typeof T[nkey] === 'string') {
      var svg = navItems[n].querySelector('svg');
      navItems[n].textContent = T[nkey];
      if (svg) navItems[n].prepend(svg);
    }
  }
}

// Visible toast notification when language changes
function showLangToast() {
  var existing = document.getElementById('lang-toast');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var msg = window.currentLang === 'BIS' ? 'Gibag-o ang pinulongan' :
            window.currentLang === 'EN'  ? 'Language changed to English' :
            'Wika ay binago sa Tagalog';

  var toast = document.createElement('div');
  toast.id = 'lang-toast';
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed !important;bottom:100px !important;left:50% !important;' +
    'transform:translateX(-50%) !important;background:#004D71 !important;color:white !important;' +
    'padding:14px 28px !important;border-radius:24px !important;font-size:16px !important;' +
    'font-weight:700 !important;z-index:99999 !important;font-family:system-ui,-apple-system,sans-serif !important;' +
    'box-shadow:0 4px 20px rgba(0,0,0,0.4) !important;pointer-events:none !important;';
  document.body.appendChild(toast);

  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
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

  var locale = window.currentLang === 'EN' ? 'en-US' : 'fil-PH';
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

console.log('labels.js loaded, window.currentLang:', window.currentLang);

function testLang() {
  console.log('window.currentLang before:', window.currentLang);
  setLanguage('BIS');
  console.log('window.currentLang after:', window.currentLang);
  console.log('localStorage:', localStorage.getItem('patrol_lang'));
  console.log('T.withOrder:', T.withOrder);
}

window.T = T;
window.LABELS = LABELS;
// window.currentLang already set at top of file
window.setLanguage = setLanguage;
window.rerenderCurrentPage = rerenderCurrentPage;
window.testLang = testLang;

window.addEventListener('storage', function(ev) {
  if (!ev || ev.key !== 'patrol_lang') return;
  var nextLang = String(ev.newValue || '').toUpperCase();
  if (!nextLang) return;
  if (nextLang === (window.currentLang || '').toUpperCase()) return;
  setLanguage(nextLang, { silent: true, source: 'storage' });
});
