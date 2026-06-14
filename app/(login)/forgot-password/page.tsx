import { Suspense } from 'react';
import { ForgotPasswordForm } from './reset-form';

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
