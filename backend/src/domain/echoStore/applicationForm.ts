/**
 * Validates persisted `echo_servers.application_form` JSON and application answer payloads.
 */

import { ECHO_UPLOAD_ABS_MAX_BYTES } from '../../../../shared/echoPlanLimits';

export type EchoApplicationQuestionType =
  | 'short'
  | 'long'
  | 'single'
  | 'multi'
  | 'attachment';

export type EchoApplicationQuestion = {
  id: string;
  type: EchoApplicationQuestionType;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxLength?: number;
  /** Only for `attachment`; caps upload size (bytes), ≤ {@link ECHO_UPLOAD_ABS_MAX_BYTES}. */
  maxBytes?: number;
};

export type EchoApplicationForm = {
  version: number;
  questions: EchoApplicationQuestion[];
};

const MAX_QUESTIONS = 25;
const MAX_OPTIONS = 25;
const MAX_LABEL = 200;
const MAX_PLACEHOLDER = 120;
const DEFAULT_SHORT_MAX = 500;
const DEFAULT_LONG_MAX = 4000;
const MAX_ATTACHMENT_FILENAME = 255;
const MAX_PUBLIC_URL_LEN = 2048;
const MAX_STORAGE_KEY_LEN = 1024;
const MAX_CONTENT_TYPE_LEN = 128;

const Q_TYPES = new Set<EchoApplicationQuestionType>([
  'short',
  'long',
  'single',
  'multi',
  'attachment',
]);

/** Stable question id from the form builder (no whitespace). */
function isStableQuestionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id);
}

export function parseEchoApplicationFormFromDb(
  raw: unknown,
): EchoApplicationForm | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const o = raw as Record<string, unknown>;
  const version = o.version;
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1)
    return null;
  const qs = o.questions;
  if (!Array.isArray(qs)) return null;
  if (qs.length > MAX_QUESTIONS) return null;
  const questions: EchoApplicationQuestion[] = [];
  const seenIds = new Set<string>();
  for (const item of qs) {
    if (item === null || typeof item !== 'object' || Array.isArray(item))
      return null;
    const q = item as Record<string, unknown>;
    const id = typeof q.id === 'string' ? q.id.trim() : '';
    if (!id || !isStableQuestionId(id) || seenIds.has(id)) return null;
    seenIds.add(id);
    const type = q.type;
    if (
      typeof type !== 'string' ||
      !Q_TYPES.has(type as EchoApplicationQuestionType)
    )
      return null;
    const qt = type as EchoApplicationQuestionType;
    const label =
      typeof q.label === 'string' ? q.label.trim().slice(0, MAX_LABEL) : '';
    if (!label) return null;
    const required = q.required === true;
    const placeholder =
      typeof q.placeholder === 'string'
        ? q.placeholder.trim().slice(0, MAX_PLACEHOLDER)
        : undefined;
    let maxLength: number | undefined;
    if (q.maxLength !== undefined) {
      if (typeof q.maxLength !== 'number' || !Number.isFinite(q.maxLength))
        return null;
      maxLength = Math.floor(q.maxLength);
    }
    if (qt === 'short') {
      const cap = Math.min(
        DEFAULT_SHORT_MAX,
        maxLength != null && maxLength > 0 ? maxLength : DEFAULT_SHORT_MAX,
      );
      questions.push({
        id,
        type: 'short',
        label,
        required,
        placeholder,
        maxLength: cap,
      });
    } else if (qt === 'long') {
      const cap = Math.min(
        DEFAULT_LONG_MAX,
        maxLength != null && maxLength > 0 ? maxLength : DEFAULT_LONG_MAX,
      );
      questions.push({
        id,
        type: 'long',
        label,
        required,
        placeholder,
        maxLength: cap,
      });
    } else if (qt === 'single' || qt === 'multi') {
      const optsRaw = q.options;
      if (!Array.isArray(optsRaw) || optsRaw.length === 0) return null;
      if (optsRaw.length > MAX_OPTIONS) return null;
      const options: string[] = [];
      const seenOpt = new Set<string>();
      for (const op of optsRaw) {
        if (typeof op !== 'string') return null;
        const t = op.trim().slice(0, 200);
        if (!t || seenOpt.has(t.toLowerCase())) return null;
        seenOpt.add(t.toLowerCase());
        options.push(t);
      }
      questions.push({
        id,
        type: qt,
        label,
        required,
        options,
        placeholder,
      });
    } else if (qt === 'attachment') {
      let maxBytes: number | undefined;
      if (q.maxBytes !== undefined) {
        if (typeof q.maxBytes !== 'number' || !Number.isFinite(q.maxBytes))
          return null;
        const mb = Math.floor(q.maxBytes);
        if (mb < 1) return null;
        maxBytes = Math.min(mb, ECHO_UPLOAD_ABS_MAX_BYTES);
      }
      questions.push({
        id,
        type: 'attachment',
        label,
        required,
        placeholder,
        ...(maxBytes != null ? { maxBytes } : {}),
      });
    }
  }
  return { version: Math.floor(version), questions };
}

export type ValidateEchoApplicationAnswersResult =
  | { ok: true; answers: Record<string, unknown> }
  | { ok: false; reason: string };

export type ValidateEchoApplicationAnswersContext = {
  serverId: string;
  userId: string;
};

function attachmentKeyPrefix(
  ctx: ValidateEchoApplicationAnswersContext,
): string {
  return `echo/server-application-attachments/${ctx.serverId}/${ctx.userId}/`;
}

function isAttachmentAnswerEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter(
      (k) => o[k] !== undefined && o[k] !== null && o[k] !== '',
    );
    return keys.length === 0;
  }
  return false;
}

export function validateEchoApplicationAnswers(
  form: EchoApplicationForm,
  rawAnswers: unknown,
  ctx?: ValidateEchoApplicationAnswersContext,
): ValidateEchoApplicationAnswersResult {
  if (
    rawAnswers === null ||
    typeof rawAnswers !== 'object' ||
    Array.isArray(rawAnswers)
  ) {
    return { ok: false, reason: 'answers must be an object' };
  }
  const needsCtx = form.questions.some((q) => q.type === 'attachment');
  if (needsCtx && !ctx) {
    return {
      ok: false,
      reason: 'missing validation context for attachment answers',
    };
  }
  const input = rawAnswers as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const q of form.questions) {
    const v = input[q.id];
    if (q.type === 'attachment') {
      if (isAttachmentAnswerEmpty(v)) {
        if (q.required)
          return { ok: false, reason: `missing answer for: ${q.label}` };
        continue;
      }
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        return { ok: false, reason: `invalid type for: ${q.label}` };
      }
      const o = v as Record<string, unknown>;
      const keyRaw = typeof o.key === 'string' ? o.key.trim() : '';
      const publicUrlRaw =
        typeof o.publicUrl === 'string' ? o.publicUrl.trim() : '';
      const nameRaw = typeof o.name === 'string' ? o.name.trim() : '';
      if (!keyRaw || keyRaw.length > MAX_STORAGE_KEY_LEN)
        return { ok: false, reason: `invalid attachment for: ${q.label}` };
      if (!publicUrlRaw || publicUrlRaw.length > MAX_PUBLIC_URL_LEN)
        return { ok: false, reason: `invalid attachment for: ${q.label}` };
      if (!nameRaw || nameRaw.length > MAX_ATTACHMENT_FILENAME)
        return { ok: false, reason: `invalid attachment for: ${q.label}` };
      if (!/^https?:\/\//i.test(publicUrlRaw))
        return { ok: false, reason: `invalid attachment for: ${q.label}` };
      const prefix = attachmentKeyPrefix(ctx!);
      if (!keyRaw.startsWith(prefix))
        return { ok: false, reason: `invalid attachment for: ${q.label}` };
      let size: number | undefined;
      if (o.size !== undefined) {
        if (typeof o.size !== 'number' || !Number.isFinite(o.size))
          return { ok: false, reason: `invalid attachment for: ${q.label}` };
        size = Math.floor(o.size);
        if (size < 1 || size > ECHO_UPLOAD_ABS_MAX_BYTES)
          return { ok: false, reason: `invalid attachment for: ${q.label}` };
      }
      if (q.maxBytes != null) {
        if (size == null)
          return { ok: false, reason: `invalid attachment for: ${q.label}` };
        if (size > q.maxBytes)
          return { ok: false, reason: `invalid attachment for: ${q.label}` };
      }
      let contentType: string | undefined;
      if (o.contentType !== undefined) {
        if (typeof o.contentType !== 'string')
          return { ok: false, reason: `invalid attachment for: ${q.label}` };
        const ct = o.contentType.trim().slice(0, MAX_CONTENT_TYPE_LEN);
        if (!ct)
          return { ok: false, reason: `invalid attachment for: ${q.label}` };
        contentType = ct;
      }
      const normalized: Record<string, unknown> = {
        key: keyRaw,
        publicUrl: publicUrlRaw,
        name: nameRaw.slice(0, MAX_ATTACHMENT_FILENAME),
      };
      if (size != null) normalized.size = size;
      if (contentType != null) normalized.contentType = contentType;
      out[q.id] = normalized;
      continue;
    }

    if (v === undefined || v === null || v === '') {
      if (q.required)
        return { ok: false, reason: `missing answer for: ${q.label}` };
      continue;
    }
    if (q.type === 'short' || q.type === 'long') {
      if (typeof v !== 'string')
        return { ok: false, reason: `invalid type for: ${q.label}` };
      const cap =
        q.maxLength ??
        (q.type === 'short' ? DEFAULT_SHORT_MAX : DEFAULT_LONG_MAX);
      const s = v.trim().slice(0, cap);
      if (!s && q.required)
        return { ok: false, reason: `missing answer for: ${q.label}` };
      if (s) out[q.id] = s;
    } else if (q.type === 'single') {
      if (typeof v !== 'string')
        return { ok: false, reason: `invalid type for: ${q.label}` };
      const s = v.trim();
      const opts = q.options ?? [];
      if (!opts.includes(s))
        return { ok: false, reason: `invalid option for: ${q.label}` };
      out[q.id] = s;
    } else if (q.type === 'multi') {
      if (!Array.isArray(v))
        return { ok: false, reason: `invalid type for: ${q.label}` };
      const opts = q.options ?? [];
      const picked: string[] = [];
      const seen = new Set<string>();
      for (const x of v) {
        if (typeof x !== 'string') continue;
        const s = x.trim();
        if (!opts.includes(s) || seen.has(s)) continue;
        seen.add(s);
        picked.push(s);
      }
      if (q.required && picked.length === 0)
        return { ok: false, reason: `missing answer for: ${q.label}` };
      if (picked.length) out[q.id] = picked;
    }
  }
  for (const k of Object.keys(input)) {
    if (!form.questions.some((q) => q.id === k))
      return { ok: false, reason: 'unknown question id in answers' };
  }
  return { ok: true, answers: out };
}

export function echoApplicationFormForClient(
  form: EchoApplicationForm,
): EchoApplicationForm {
  return JSON.parse(JSON.stringify(form)) as EchoApplicationForm;
}
