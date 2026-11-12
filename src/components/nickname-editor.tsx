"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { setNickname } from "@/app/actions/profile";
import { toastResult } from "./toaster";

/**
 * Apelido de quem tem login, só para você (ex.: dois "Felipe" na família). Mostra o nome cadastrado
 * embaixo e um lápis para dar, trocar ou tirar o apelido.
 */
export function NicknameEditor({ participantId, realName, nickname }: { participantId: string; realName: string; nickname: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname ?? "");
  const [pending, start] = useTransition();

  const save = (v: string) =>
    start(async () => {
      const r = await setNickname(participantId, v);
      toastResult(r);
      if (r.ok) {
        setEditing(false);
        router.refresh();
      }
    });

  if (!editing) {
    return (
      <button type="button" className="nick-btn" onClick={() => setEditing(true)} aria-label={`${nickname ? "Mudar o apelido de" : "Adicionar apelido a"} ${realName}`}>
        <Pencil size={13} strokeWidth={2} aria-hidden /> {nickname ? "Mudar apelido" : "Adicionar apelido"}
      </button>
    );
  }
  return (
    <form
      className="nick-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <label className="nick-label">
        Apelido (só você vê)
        <input
          autoFocus
          className="input"
          value={value}
          maxLength={40}
          placeholder={realName}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        />
      </label>
      <div className="nick-actions">
        <button type="submit" className="btn primary small" disabled={pending}>
          Salvar
        </button>
        {nickname && (
          <button type="button" className="btn small" disabled={pending} onClick={() => save("")}>
            Tirar apelido
          </button>
        )}
        <button type="button" className="btn ghost small" disabled={pending} onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
