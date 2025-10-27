'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface LoginFormState {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formState, setFormState] = useState<LoginFormState>({
    identifier: '',
    password: '',
    rememberMe: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectToParam = searchParams?.get('from') ?? null;
  const redirectTo = redirectToParam && redirectToParam.startsWith('/') ? redirectToParam : '/admin';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: formState.identifier,
          password: formState.password,
          rememberMe: formState.rememberMe
        })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Connexion impossible. Veuillez réessayer.');
        setIsSubmitting(false);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submissionError) {
      console.error('Login failed:', submissionError);
      setError('Une erreur est survenue. Veuillez réessayer.');
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Connexion administrateur</h1>
      <p className="text-sm text-gray-600">
        Veuillez vous connecter avec votre identifiant administrateur pour accéder à l&apos;outil.
      </p>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-800">Identifiant</span>
        <input
          type="text"
          name="identifier"
          autoComplete="username"
          required
          value={formState.identifier}
          onChange={(event) =>
            setFormState((state) => ({ ...state, identifier: event.target.value }))
          }
          className="rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-800">Mot de passe</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={formState.password}
          onChange={(event) =>
            setFormState((state) => ({ ...state, password: event.target.value }))
          }
          className="rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name="rememberMe"
          checked={formState.rememberMe}
          onChange={(event) =>
            setFormState((state) => ({ ...state, rememberMe: event.target.checked }))
          }
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span>Se souvenir de moi</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex items-center justify-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {isSubmitting ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
