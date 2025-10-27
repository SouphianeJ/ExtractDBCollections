'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoginFormProps = {
  redirectPath?: string;
};

type LoginResponse = {
  error?: string;
};

export default function LoginForm({ redirectPath }: LoginFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier, password, remember: rememberMe })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as LoginResponse;
        const message = body.error || 'Impossible de vous connecter. Vérifiez vos identifiants.';
        throw new Error(message);
      }

      router.replace(redirectPath ?? '/admin');
      router.refresh();
    } catch (error) {
      console.error('Login failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Connexion échouée.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label htmlFor="identifier">Identifiant administrateur</label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          className="form-control"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          className="form-control"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <div className="remember-toggle">
        <input
          id="remember"
          name="remember"
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        <label htmlFor="remember">Se souvenir de moi</label>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      <button className="submit-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
