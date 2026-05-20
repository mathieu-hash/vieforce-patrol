import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(root, 'css/admin-page.css');
const inlinePath = path.join(root, '.tmp-admin-inline.css');

const page = fs.readFileSync(pagePath, 'utf8');
const inline = fs.readFileSync(inlinePath, 'utf8');
const extra = inline.split('\n').slice(16).join('\n');

const phaseA = `
/* --- Shared admin subnav (Phase A) --- */
.admin-subnav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 14px;
}
.admin-subnav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid #cbd5e0;
  background: #fff;
  color: var(--navy, #004d71);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  line-height: 1.2;
}
.admin-subnav-link:hover {
  border-color: var(--blue, #00a6ce);
  color: var(--blue, #00a6ce);
}
.admin-subnav-link[aria-current="page"] {
  background: var(--navy, #004d71);
  border-color: var(--navy, #004d71);
  color: #fff;
}
.admin-intro {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.45;
  color: #4a5568;
}

.admin-email-missing {
  color: #c05621;
  font-weight: 700;
  font-size: 12px;
}
.admin-email-none {
  color: #a0aec0;
  font-size: 12px;
  font-style: italic;
}

.admin-skeleton-wrap {
  padding: 8px 0 24px;
}
.admin-skeleton-label {
  margin: 12px 0 0;
  text-align: center;
  font-size: 13px;
  color: #718096;
}
.admin-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.admin-skeleton-grid--stats {
  grid-template-columns: repeat(4, 1fr);
}
.admin-skeleton-block {
  min-height: 72px;
  border-radius: 12px;
  background: linear-gradient(90deg, #edf2f7 0%, #f7fafc 45%, #edf2f7 90%);
  background-size: 200% 100%;
  animation: admin-shimmer 1.2s ease-in-out infinite;
}
.admin-skeleton-block.tall {
  min-height: 140px;
}
@keyframes admin-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

@media (max-width: 720px) {
  .admin-skeleton-grid { grid-template-columns: 1fr; }
  .admin-skeleton-grid--stats { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  body.admin-page .admin-actions .btn-action,
  body.admin-page .tbl-btn,
  body.admin-page .top-bar .action-btn,
  body.admin-page .modal-footer button,
  body.admin-page .org-btn {
    min-height: 48px;
  }
  .admin-subnav-link {
    flex: 1 1 calc(50% - 8px);
  }
}
`;

const merged =
  page.trimEnd() +
  '\n\n/* --- From admin.html shell (consolidated) --- */\n' +
  extra.trim() +
  phaseA;

fs.writeFileSync(pagePath, merged);
console.log('Wrote', pagePath, merged.length, 'bytes');
