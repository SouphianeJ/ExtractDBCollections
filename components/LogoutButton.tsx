'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });

      if (!response.ok) {
        console.error('Failed to log out', await response.text());
      }
    } catch (error) {
      console.error('Unexpected error while logging out:', error);
    } finally {
      setIsLoading(false);
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className="logout-button"
      aria-label="Se déconnecter"
    >
      <span className="logout-button__indicator" aria-hidden="true" />
      <span className="logout-button__label">{isLoading ? 'Déconnexion…' : 'Se déconnecter'}</span>
    </button>
  );
}
