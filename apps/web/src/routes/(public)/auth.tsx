import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react';
import SignInForm from '@/components/sign-in-form';
import SignUpForm from '@/components/sign-up-form';

export const Route = createFileRoute('/(public)/auth')({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const parentData = context;
    if (parentData?.isAuthenticated) {
      throw redirect({
        to: '/dashboard',
      });
    }
  },
})

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);
  
  return (
    <div>
      {showSignIn ? (
        <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
      ) : (
        <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
      )}
    </div>
  );
}
