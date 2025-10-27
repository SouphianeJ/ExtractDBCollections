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
    <form
      onSubmit={handleSubmit}
      className="relative mx-auto w-full max-w-lg overflow-hidden rounded-3xl border border-indigo-100/60 bg-white/90 p-10 shadow-[0_28px_60px_-24px_rgba(30,64,175,0.45)] backdrop-blur"
    >
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500">Accès sécurisé</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Connexion administrateur</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Saisissez vos identifiants pour accéder aux outils d&apos;extraction et de supervision. Vos informations restent
          chiffrées et protégées.
        </p>
      </div>

      <div className="space-y-5">
        <label className="flex flex-col gap-2 text-left">
          <span className="text-sm font-medium text-slate-800">Identifiant</span>
          <input
            type="text"
            name="identifier"
            autoComplete="username"
            required
            value={formState.identifier}
            onChange={(event) =>
              setFormState((state) => ({ ...state, identifier: event.target.value }))
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="flex flex-col gap-2 text-left">
          <span className="text-sm font-medium text-slate-800">Mot de passe</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={formState.password}
            onChange={(event) =>
              setFormState((state) => ({ ...state, password: event.target.value }))
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="flex items-center justify-between rounded-2xl bg-indigo-50/70 px-4 py-3 text-sm text-slate-700">
          <div className="flex items-center gap-3">
            <span className="relative flex h-5 w-5 items-center justify-center">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formState.rememberMe}
                onChange={(event) =>
                  setFormState((state) => ({ ...state, rememberMe: event.target.checked }))
                }
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-indigo-300 bg-white shadow-inner transition-colors checked:bg-indigo-600 checked:shadow-[0_0_0_1px_#312e81] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              />
              <span className="pointer-events-none absolute inset-[5px] rounded-[6px] bg-white transition peer-checked:bg-indigo-600/20" />
            </span>
            <span className="font-medium text-slate-800">Se souvenir de moi</span>
          </div>
          <span className="text-xs text-indigo-500">
            {formState.rememberMe ? 'Session prolongée activée' : 'Session standard'}
          </span>
        </label>

        {error && (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="group relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:from-indigo-300 disabled:to-indigo-300"
        >
          <span className="absolute inset-0 translate-y-full bg-white/20 transition duration-500 group-hover:translate-y-0" />
          <span className="relative">{isSubmitting ? 'Connexion…' : 'Se connecter'}</span>
        </button>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 font-medium">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
          Connexion protégée
        </span>
        <span>Besoin d&apos;aide ? Contactez votre administrateur principal.</span>
      </div>
    </form>
  );
}
