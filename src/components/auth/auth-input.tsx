"use client";

import { useId, useState, type ComponentType } from "react";
import { Eye, EyeOff } from "lucide-react";

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

/** Campo das telas de entrada: ícone à esquerda e, na senha, botão de mostrar/ocultar. */
export function AuthInput({
  label,
  name,
  type = "text",
  icon: Icon,
  defaultValue,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  icon: IconType;
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="auth-field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="auth-input">
        <span className="auth-input-icon" aria-hidden>
          <Icon size={24} strokeWidth={2} />
        </span>
        <input
          id={id}
          name={name}
          type={isPassword && show ? "text" : type}
          placeholder={label}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          required
        />
        {isPassword && (
          <button
            type="button"
            className="auth-input-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={show}
          >
            {show ? <Eye size={22} strokeWidth={1.8} /> : <EyeOff size={22} strokeWidth={1.8} />}
          </button>
        )}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="auth-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
