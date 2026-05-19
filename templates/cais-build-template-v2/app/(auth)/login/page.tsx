'use client';

import { AuthForm } from '@caistech/corporate-components/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <AuthForm
        mode="login"
        forgotPasswordHref="/forgot-password"
        signupHref="/signup"
        onSuccess={() => router.push('/dashboard')}
      />
    </main>
  );
}
