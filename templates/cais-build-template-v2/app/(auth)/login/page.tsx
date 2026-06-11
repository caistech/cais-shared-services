'use client';

import { useMemo } from 'react';
import { AuthForm } from '@caistech/corporate-components/auth';
import { createClient } from '@/lib/supabase-client';

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <AuthForm
        mode="login"
        theme="light"
        supabaseClient={supabase}
        redirectTo="/dashboard"
        forgotPasswordPath="/forgot-password"
        signupPath="/signup"
      />
    </main>
  );
}
