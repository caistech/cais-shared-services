/**
 * @caistech/next-auth
 * 
 * Standard auth utilities for Next.js API routes using Supabase.
 * Use this in every repo - DO NOT duplicate auth logic.
 * 
 * Usage:
 * import { getUser, requireUser, createCookieClient } from '@caistech/next-auth'
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { serialize } from 'cookie'

/**
 * Create a cookie-aware Supabase client for auth operations.
 * Use this for: getUser(), requireUser(), session checks
 */
export function createCookieClient() {
  const cookieStore = cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Server Component - can't set cookies
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Server Component
          }
        },
      },
    }
  )
}

/**
 * Get current user from session cookie.
 * Returns null if not authenticated.
 */
export async function getUser() {
  const supabase = createCookieClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * Get current user + their email.
 * Returns null if not authenticated.
 */
export async function getUserEmail(): Promise<string | null> {
  const user = await getUser()
  if (!user?.email) return null
  
  // Also check profiles table for synced email
  const supabase = createCookieClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()
  
  return profile?.email || user.email
}

/**
 * Require user - returns user or throws error.
 * Use this at the top of API routes that need auth.
 */
export async function requireUser() {
  const user = await getUser()
  if (!user) {
    throw new Error('UNAUTHENTICATED')
  }
  return user
}

/**
 * Require user email - returns email or throws error.
 */
export async function requireUserEmail(): Promise<string> {
  const email = await getUserEmail()
  if (!email) {
    throw new Error('UNAUTHENTICATED')
  }
  return email
}

/**
 * Create a service-role client for data operations (bypasses RLS).
 * NEVER use this for auth checks - only for admin DB operations.
 */
export function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Create response that clears auth cookies (logout).
 */
export function createLogoutResponse(request: NextRequest, redirectTo: string = '/') {
  const supabase = createCookieClient()
  supabase.auth.signOut()
  
  // Build cookie expiry headers
  const cookieOptions: CookieOptions = {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  }
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirectTo,
      'Set-Cookie': [
        `${serialize('sb-access-token', '', cookieOptions)}; Path=/; Max-Age=0`,
        `${serialize('sb-refresh-token', '', cookieOptions)}; Path=/; Max-Age=0`,
      ].join(', '),
    },
  })
}
