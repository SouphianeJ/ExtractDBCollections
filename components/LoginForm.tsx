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
      className="login-card"
    >
      <div className="login-card__intro">
        <h1 className="login-card__title">Connexion administrateur</h1>
      </div>

      <div className="login-card__fields">
        <label className="login-field">
          <span className="login-field__label">Identifiant</span>
          <input
            type="text"
            name="identifier"
            autoComplete="username"
            required
            value={formState.identifier}
            onChange={(event) =>
              setFormState((state) => ({ ...state, identifier: event.target.value }))
            }
            className="login-input"
          />
        </label>

        <label className="login-field">
          <span className="login-field__label">Mot de passe</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={formState.password}
            onChange={(event) =>
              setFormState((state) => ({ ...state, password: event.target.value }))
            }
            className="login-input"
          />
        </label>

        <label className="login-checkbox">
          <span className="login-checkbox__main">
            <span className="login-checkbox__box">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formState.rememberMe}
                onChange={(event) =>
                  setFormState((state) => ({ ...state, rememberMe: event.target.checked }))
                }
                className="login-checkbox__input"
              />
              <span className="login-checkbox__mark" aria-hidden="true" />
            </span>
            <span className="login-checkbox__text">Se souvenir de moi</span>
          </span>
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="login-submit"
        >
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>

    </form>
  );
}
