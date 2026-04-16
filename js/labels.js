// Trilingual Label System — Tagalog / Bisaya / English
// TSR screens use T.key to get the label in current language.
// Priority: Tagalog first, Bisaya in parentheses, English fallback.

var T = {
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

  // Auth errors
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
};

// Relative time in Taglish
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

  // Fallback to date
  return new Date(dateStr).toLocaleDateString('fil-PH', { month: 'short', day: 'numeric' });
}

// Greeting based on time of day
function getGreeting() {
  var h = new Date().getHours();
  if (h < 12) return T.goodMorning;
  if (h < 18) return T.goodDay;
  return T.goodEvening;
}

// Store type in Taglish
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
