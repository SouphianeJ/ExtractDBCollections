'use client';

import { useCallback, useState } from 'react';

type CopyToClipboardButtonProps = {
  text: string;
  className?: string;
};

export default function CopyToClipboardButton({ text, className }: CopyToClipboardButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setHasError(false);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy document to clipboard:', error);
      setHasError(true);
      setIsCopied(false);
    }
  }, [text]);

  const label = hasError ? 'Copy failed' : isCopied ? 'Copied!' : 'Copy JSON';
  const classes = ['copy-button'];

  if (className) {
    classes.push(className);
  }

  if (isCopied) {
    classes.push('copied');
  }

  if (hasError) {
    classes.push('error');
  }

  return (
    <button type="button" className={classes.join(' ')} onClick={handleCopy} aria-live="polite" aria-label={label}>
      {label}
    </button>
  );
}
