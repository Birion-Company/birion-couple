"use client";

import { useEffect, useId, useState } from "react";
import { AtSign } from "lucide-react";
import { checkUsernameAvailable } from "@/app/actions/username";

/** Nome de usuário (@fulano) nas telas de entrada, conferindo na hora se está livre. */
export function UsernameField({ defaultValue = "" }: { defaultValue?: string }) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    if (value.trim().length < 3) return setMsg(null);
    const t = setTimeout(async () => setMsg(await checkUsernameAvailable(value)), 400);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="auth-field">
      <label htmlFor={id} className="sr-only">
        Nome de usuário
      </label>
      <div className="auth-input">
        <span className="auth-input-icon" aria-hidden>
          <AtSign size={24} strokeWidth={2} />
        </span>
        <input
          id={id}
          name="username"
          placeholder="Nome de usuário (único)"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={21}
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s/g, ""))}
          aria-describedby={`${id}-hint`}
          required
        />
      </div>
      <p id={`${id}-hint`} className={`auth-hint ${msg ? (msg.ok ? "pos" : "neg") : ""}`}>
        {msg?.message ?? "Letras, números, ponto ou _. É assim que te acham no Birion."}
      </p>
    </div>
  );
}
