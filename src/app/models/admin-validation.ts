/**
 * Shared admin validation helpers.
 * Mirrors iOS AdminValidation enum from UserEditView.swift.
 */

/**
 * RFC5322-simplified email regex.
 * Mirrors iOS: ^[A-Z0-9a-z._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$
 */
export const ADMIN_EMAIL_REGEX = /^[A-Z0-9a-z._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/

export function isValidAdminEmail(email: string): boolean {
  return ADMIN_EMAIL_REGEX.test(email.trim())
}
