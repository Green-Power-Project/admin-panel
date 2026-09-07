'use client';

import {
  useRef,
  useCallback,
  useId,
  type InputHTMLAttributes,
  type MouseEvent,
} from 'react';

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  focusClassName?: string;
};

function openPicker(input: HTMLInputElement | null) {
  if (!input || input.disabled || input.readOnly) return;
  input.focus();
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
    } catch {
      /* Unsupported or blocked outside user gesture */
    }
  }
}

/** Native date field — clicking anywhere opens the calendar. */
export function DateInput({
  label,
  id,
  className = '',
  focusClassName = 'focus:border-blue-500',
  onClick,
  ...rest
}: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? autoId;

  const activate = useCallback(() => openPicker(ref.current), []);

  const handleInputClick = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      onClick?.(e);
      if (!e.defaultPrevented && !rest.readOnly && !rest.disabled) {
        activate();
      }
    },
    [onClick, activate, rest.readOnly, rest.disabled]
  );

  return (
    <div className="picker-field">
      <label
        htmlFor={inputId}
        className="mb-1.5 block cursor-pointer text-xs font-semibold text-gray-700"
        onClick={(e) => {
          e.preventDefault();
          activate();
        }}
      >
        {label}
      </label>
      <div
        className="relative"
        onClick={(e) => {
          if (e.target === ref.current) return;
          if (rest.readOnly || rest.disabled) return;
          activate();
        }}
      >
        <input
          ref={ref}
          id={inputId}
          type="date"
          onClick={handleInputClick}
          className={`picker-input w-full cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none ${focusClassName} ${className}`}
          {...rest}
        />
      </div>
    </div>
  );
}
