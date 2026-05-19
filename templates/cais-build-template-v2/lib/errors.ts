import { NextResponse } from 'next/server';

// Portfolio Standard R10 — never leak verbatim Postgres errors.
// All API routes use errorResponse() to return a stable code + safe message.
// Add new codes here; never inline a raw db error in a NextResponse.

type ErrorCode =
  | 'auth_required'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'validation_error'
  | 'server_error';

const STATUS: Record<ErrorCode, number> = {
  auth_required: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  validation_error: 422,
  server_error: 500,
};

const MESSAGES: Record<ErrorCode, string> = {
  auth_required: 'Sign in to continue.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'Not found.',
  rate_limited: 'Too many requests. Try again shortly.',
  validation_error: 'The request body is invalid.',
  server_error: 'Something went wrong. Try again shortly.',
};

export function errorResponse(code: ErrorCode, detail?: string) {
  // Log the detail server-side, never return it to the client.
  if (detail && process.env.NODE_ENV !== 'production') {
    console.error(`[${code}]`, detail);
  }
  return NextResponse.json(
    { error: code, message: MESSAGES[code] },
    { status: STATUS[code] }
  );
}
