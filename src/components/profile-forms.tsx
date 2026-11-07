"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { changePassword, removeAvatar, updateProfile, uploadAvatar } from "@/app/actions/profile";
import { toast, toastResult } from "./toaster";
import { Avatar } from "./ui";

/** Corta a imagem num quadrado centralizado e reduz para 320px em JPEG. */
async function squareJpeg(file: File, size = 320): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

/** Foto em destaque no centro do perfil, com botões para trocar e remover. */
export function AvatarEditor({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? avatarUrl;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Escolha um arquivo de imagem.", "error");
    if (file.size > 15_000_000) return toast("Imagem grande demais (máximo 15 MB).", "error");
    let dataUrl: string;
    try {
      dataUrl = await squareJpeg(file);
    } catch {
      return toast("Não consegui ler esta imagem.", "error");
    }
    setPreview(dataUrl);
    start(async () => {
      const r = await uploadAvatar(dataUrl);
      toastResult(r);
      if (!r.ok) setPreview(null);
      router.refresh();
    });
  };

  return (
    <div className="avatar-editor">
      <button
        type="button"
        className="avatar-editor-photo"
        onClick={() => input.current?.click()}
        disabled={pending}
        aria-label={shown ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
      >
        <Avatar name={name} color="#1AC4DB" size={148} src={shown} />
        <span className="avatar-editor-badge" aria-hidden>
          <Camera size={18} strokeWidth={2} />
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="actions" style={{ justifyContent: "center" }}>
        <button type="button" className="btn small" onClick={() => input.current?.click()} disabled={pending}>
          <Camera size={15} strokeWidth={1.8} /> {shown ? "Trocar foto" : "Adicionar foto"}
        </button>
        {shown && (
          <button
            type="button"
            className="btn small ghost danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeAvatar();
                toastResult(r);
                if (r.ok) setPreview(null);
                router.refresh();
              })
            }
          >
            <Trash2 size={15} strokeWidth={1.8} /> Remover
          </button>
        )}
      </div>
    </div>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [e, setE] = useState(email);
  const changed = n.trim() !== name || e.trim().toLowerCase() !== email;
  return (
    <form
      className="card form"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => toastResult(await updateProfile({ name: n, email: e })));
      }}
    >
      <h2>Dados pessoais</h2>
      <label className="field">
        <span>Nome</span>
        <input className="input" value={n} onChange={(ev) => setN(ev.target.value)} maxLength={60} autoComplete="name" required />
      </label>
      <div className="field">
        <label htmlFor="perfil-email">E-mail</label>
        <input
          id="perfil-email"
          className="input"
          type="email"
          value={e}
          onChange={(ev) => setE(ev.target.value)}
          autoComplete="email"
          aria-describedby="perfil-email-hint"
          required
        />
        <span id="perfil-email-hint" className="faint">É o e-mail que você usa para entrar.</span>
      </div>
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={pending || !changed}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: ev.target.value }));
  return (
    <form
      className="card form"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          const r = await changePassword(v);
          toastResult(r);
          if (r.ok) setV({ current: "", next: "", confirm: "" });
        });
      }}
    >
      <h2>Senha</h2>
      <label className="field">
        <span>Senha atual</span>
        <input className="input" type="password" value={v.current} onChange={set("current")} autoComplete="current-password" required />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Nova senha</span>
          <input className="input" type="password" value={v.next} onChange={set("next")} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>Repita a nova senha</span>
          <input className="input" type="password" value={v.confirm} onChange={set("confirm")} autoComplete="new-password" minLength={8} required />
        </label>
      </div>
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={pending}>
          {pending ? "Alterando…" : "Alterar senha"}
        </button>
      </div>
    </form>
  );
}
