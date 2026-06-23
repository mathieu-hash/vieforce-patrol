// api/_lib/marketing-email.js
//
// Transactional email for the Marketing Request module, via Resend.
// KEY-GATED: if RESEND_API_KEY is not set, sendEmail() returns {status:'deferred'}
// instead of throwing. The handler always writes an email_log row, so the audit
// trail is intact even before sending is switched on — physical emails begin
// the moment a key is added to the Vercel project env.

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MARKETING_EMAIL_FROM || 'VieForce Marketing <noreply@vienovo.ph>';

async function sendEmail(_ref) {
  const ref = _ref || {};
  const to = [].concat(ref.to || []).filter(Boolean);
  if (!to.length) return { status: 'failed', error: 'no recipients' };
  if (!RESEND_KEY) return { status: 'deferred', error: 'RESEND_API_KEY not set' };

  const cc = ref.cc ? [].concat(ref.cc).filter(Boolean) : undefined;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: to,
        cc: cc,
        subject: ref.subject || 'VieForce Marketing Request',
        html: ref.html || ''
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(function () { return ''; });
      return { status: 'failed', error: ('Resend ' + res.status + ' ' + t).slice(0, 280) };
    }
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: String((e && e.message) || e).slice(0, 280) };
  }
}

module.exports = { sendEmail, isConfigured: function () { return !!RESEND_KEY; }, FROM };
