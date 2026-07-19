'use client';

import { useState } from 'react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
  className,
  disabled,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className ?? ''}`.trim()}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        className="focus-ignite w-full rounded-lg border border-surface-3 bg-surface-2 px-3 py-2 pr-10 text-sm text-content placeholder:text-content-muted focus:border-ignite focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="focus-ignite absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
      >
        <i className={`bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
      </button>
    </div>
  );
}
