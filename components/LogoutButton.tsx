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
      className="rounded border border-transparent bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-500"
      aria-label="Se déconnecter"
    >
      {isLoading ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  );
}
