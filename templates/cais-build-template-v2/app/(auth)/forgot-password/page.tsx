'use client';

import { AuthForm } from '@caistech/corporate-components/auth';

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Reset your password</h1>
      <AuthForm mode="forgot-password" loginHref="/login" />
    </main>
  );
}
