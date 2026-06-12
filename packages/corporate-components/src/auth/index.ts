// Subpath entry: `@caistech/corporate-components/auth`.
//
// Re-exports the Portfolio Standard R1 auth surface so consumers can
// either `import { AuthForm } from '@caistech/corporate-components'` (root)
// or scope to the subpath when they only need auth pieces.

export { AuthForm } from './AuthForm';
export type {
  AuthFormProps,
  AuthMode,
  AuthTheme,
  AuthUser,
  AuthExtraField,
  ExtraFieldRenderProps,
} from './AuthForm';
export { PasswordInput } from './PasswordInput';
export type { PasswordInputProps } from './PasswordInput';
export {
  AUTH_ERROR_CODES,
  resolveAuthErrorMessage,
  resolveAuthErrorCode,
  mapSupabaseAuthError,
} from './error-codes';
export type { AuthErrorCode } from './error-codes';
