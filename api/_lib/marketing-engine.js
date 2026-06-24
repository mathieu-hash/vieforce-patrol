// api/_lib/marketing-engine.js
//
// Pure approval state-machine + authorization for the Marketing Request module
// (Functional Spec v1.1). No I/O — fully unit-testable. The /api/marketing
// handler composes this with Supabase REST (service role) + email.
//
// Three-level chain: submitted ->(RSM)-> marketing_review ->(Marketing)-> evp_review ->(EVP)-> approved
// Rejection at any level -> rejected.

const VALID_TYPES = [
  'signages', 'store_dress_up', 'seminar', 'vet_mission',
  'vet_products', 'feed_sampling', 'special_request'
];
const VALID_DELIVERY = ['pick_up', 'thru_customer'];

// On approval at a given status, move to the next status.
const NEXT_STATUS_ON_APPROVE = {
  submitted: 'marketing_review',
  marketing_review: 'evp_review',
  evp_review: 'approved'
};

// Which approver level owns a given pending status.
const LEVEL_FOR_STATUS = {
  submitted: 'rsm',
  marketing_review: 'marketing',
  evp_review: 'evp'
};

function normRole(r) {
  return String(r == null ? '' : r).toLowerCase();
}

// Can this user APPROVE/REJECT the request at its current status?
// request = { status, dsm_region, dsm_user_id }
// user    = { id, role, region }
// returns { allowed:Boolean, level:'rsm'|'marketing'|'evp'|null, reason:String }
function canApprove(request, user) {
  if (!request || !user) return { allowed: false, level: null, reason: 'missing' };
  const status = request.status;
  const level = LEVEL_FOR_STATUS[status];
  if (!level) return { allowed: false, level: null, reason: 'not_pending' }; // approved/rejected
  const role = normRole(user.role);
  if (role === 'admin') return { allowed: true, level, reason: 'admin' };

  if (level === 'rsm') {
    if (role !== 'rsm') return { allowed: false, level, reason: 'role' };
    // Region gate: the RSM must own the DSM's region. If either side has no
    // region recorded, fail closed.
    if (!request.dsm_region || !user.region) return { allowed: false, level, reason: 'region' };
    if (String(request.dsm_region) !== String(user.region)) return { allowed: false, level, reason: 'region' };
    return { allowed: true, level, reason: 'rsm' };
  }
  if (level === 'marketing') {
    return { allowed: role === 'marketing', level, reason: role === 'marketing' ? 'marketing' : 'role' };
  }
  if (level === 'evp') {
    // DB role for EVP is 'exec'; accept 'evp' too for forward-compat.
    const ok = role === 'exec' || role === 'evp';
    return { allowed: ok, level, reason: ok ? 'evp' : 'role' };
  }
  return { allowed: false, level: null, reason: 'unknown' };
}

// Can this user SEE the request? (dashboard scoping)
function canSee(request, user) {
  if (!request || !user) return false;
  const role = normRole(user.role);
  if (role === 'admin' || role === 'marketing') return true;            // all
  if (role === 'exec' || role === 'evp') {
    // EVP sees items that reached their level or beyond.
    return ['evp_review', 'approved', 'rejected'].indexOf(request.status) !== -1;
  }
  if (role === 'rsm') {
    if (!request.dsm_region || !user.region) return false;
    return String(request.dsm_region) === String(user.region);
  }
  // DSM (and any other role): own requests only.
  return !!(request.dsm_user_id && user.id && String(request.dsm_user_id) === String(user.id));
}

// Compute the next status on an approval. Returns null if not a pending status.
function nextStatusOnApprove(status) {
  return NEXT_STATUS_ON_APPROVE[status] || null;
}

module.exports = {
  VALID_TYPES,
  VALID_DELIVERY,
  NEXT_STATUS_ON_APPROVE,
  LEVEL_FOR_STATUS,
  normRole,
  canApprove,
  canSee,
  nextStatusOnApprove
};
