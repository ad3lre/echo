/**
 * Operator-facing legal and program prerequisites for hash-based CSAM controls.
 * Engineering cannot substitute for counsel; this documents what production use requires.
 */
export const CSAM_OPERATOR_LEGAL_PREREQUISITES = [
  'Obtain access to an official hash program (for example Microsoft PhotoDNA on-premises) under the vendor’s terms — do not use unofficial hash lists.',
  'When CSAM is identified, follow applicable mandatory reporting (for example NCMEC CyberTipline in the United States) and counsel’s retention guidance.',
  'Do not retain matched media as evidence in application storage; preserve only what reporting requires.',
  'Review GDPR and local safeguarding obligations if EU or other regulated users are served.',
].join('\n');

/** Operational guidance for local hash list files (not legal advice). */
export const CSAM_HASH_LIST_UPDATE_GUIDANCE = [
  'Deploy list updates with atomic replace (write to a temp path, then rename over the live file) so readers never see a partial file.',
  'Use ECHO_CSAM_BLOCKLIST_RELOAD_MINUTES for periodic re-reads; set 0 to rely on mtime-only reloads when the file changes.',
  'Restrict read access on disk to the API OS user; never log list contents or match fingerprints at info level.',
].join('\n');
