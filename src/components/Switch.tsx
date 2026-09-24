import React from 'react';

export function Switch({ checked, onChange, disabled, className = '', 'aria-label': ariaLabel, title, 'data-testid': dataTestId }: {
  checked: boolean;
  onChange: (checked: boolean, e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  title?: string;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onChange(!checked, e)}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={ariaLabel}
      title={title}
      data-testid={dataTestId}
      className={`relative align-middle shrink-0 w-11 h-6 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-caneta-600' : 'bg-slate-300'
      } ${className}`}
    >
      <span
        data-testid={dataTestId ? dataTestId.replace('toggle-', 'toggle-knob-') : undefined}
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
