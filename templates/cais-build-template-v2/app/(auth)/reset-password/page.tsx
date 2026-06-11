'use client';

import { useMemo } from 'react';
import { AuthForm } from '@caistech/corporate-components/auth';
import { createClient } from '@/lib/supabase-client';

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <AuthForm
        mode="reset-password"
        theme="light"
        supabaseClient={supabase}
        loginPath="/login"
      />
    </main>
  );
}
