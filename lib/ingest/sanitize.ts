const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// Extensions we accept, mapped to the MIME types a browser might report for
// them. Browsers are inconsistent for .txt/.md (text/plain, text/markdown, or
// empty/application/octet-stream), so validation is primarily extension-driven
// with the MIME as a secondary allow-list. See clarify.md C2.
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.txt': ['text/plain', 'application/octet-stream', ''],
  '.md': ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream', ''],
};

export interface SanitizeResult {
  ok: boolean;
  error?: string;
  extension?: string;
}

/**
 * Enforces max size and an allow-listed MIME/extension pair before any parsing
 * is attempted. This is a lightweight signature/size gate, NOT a substitute for
 * a real antivirus scan.
 *
 * TODO(security): wire in a real AV scanner (e.g. shell out to `clamscan` via
 * a ClamAV sidecar container) before this file reaches the parser in a
 * production deployment. No AV binary is available in this dev environment,
 * so that step is intentionally left as a hook rather than faked.
 */
export function sanitizeUpload(file: {
  name: string;
  type: string;
  size: number;
}): SanitizeResult {
  if (file.size <= 0) {
    return { ok: false, error: 'File is empty.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` };
  }

  const lowerName = file.name.toLowerCase();
  const dot = lowerName.lastIndexOf('.');
  const extension = dot === -1 ? '' : lowerName.slice(dot);

  const allowedMimes = ALLOWED_EXTENSIONS[extension];
  if (!allowedMimes) {
    return {
      ok: false,
      error: `Unsupported file extension "${extension || 'none'}". Allowed: PDF, DOCX, TXT, MD.`,
    };
  }

  // Extension is the primary gate; the reported MIME is a secondary check that
  // tolerates the empty/octet-stream values browsers sometimes send for text.
  if (!allowedMimes.includes(file.type)) {
    return {
      ok: false,
      error: `File "${file.name}" was reported as type "${file.type || 'unknown'}", which does not match a "${extension}" file.`,
    };
  }

  return { ok: true, extension };
}
