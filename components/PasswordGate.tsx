'use client';

import { ReactNode, useEffect, useState } from 'react';

const PASSWORD = (process.env.NEXT_PUBLIC_PAGE_PASSWORD ?? '').trim();
const STORAGE_KEY = 'extractdbcollections:password-access-granted';

interface PasswordGateProps {
  children: ReactNode;
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [isAuthorized, setIsAuthorized] = useState(PASSWORD.length === 0);

  useEffect(() => {
    if (!PASSWORD) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (window.sessionStorage.getItem(STORAGE_KEY) === 'true') {
      setIsAuthorized(true);
      return;
    }

    let hasAccess = false;

    while (!hasAccess) {
      const input = window.prompt(
        'This page is password protected. Please enter the password to continue:'
      );

      if (input === null) {
        window.alert('A password is required to use this application.');
        continue;
      }

      if (input.trim() === '') {
        window.alert('Password cannot be empty. Please try again.');
        continue;
      }

      if (input === PASSWORD) {
        window.sessionStorage.setItem(STORAGE_KEY, 'true');
        setIsAuthorized(true);
        window.alert('Access granted.');
        hasAccess = true;
      } else {
        window.alert('Incorrect password. Please try again.');
      }
    }
  }, []);

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
