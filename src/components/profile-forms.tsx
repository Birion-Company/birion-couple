"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Camera, KeyRound, Trash2 } from "lucide-react";
import { changePassword, removeAvatar, updateProfile, uploadAvatar } from "@/app/actions/profile";
import { toast, toastResult } from "./toaster";
import { Avatar } from "./ui";

/** Corta a imagem num quadrado centralizado e reduz para 320px em JPEG. */
export async function squareJpeg(file: File, size = 320): Promise<string> {
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

/** Foto do perfil; ao clicar abre um menu com Trocar/Adicionar foto e Remover. */
export function AvatarEditor({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const menuId = useId();
  const input = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const shown = preview ?? avatarUrl;

  const show = () => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = 220;
    const left = Math.min(Math.max(8, b.left), window.innerWidth - width - 8);
    const up = window.innerHeight - b.bottom < 130;
    setPos(up ? { left, width, bottom: window.innerHeight - b.top + 8 } : { left, width, top: b.bottom + 8 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onClose = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const pick = () => {
    setOpen(false);
    input.current?.click();
  };

  const remove = () => {
    setOpen(false);
    buttonRef.current?.focus();
    start(async () => {
      const r = await removeAvatar();
      toastResult(r);
      if (r.ok) setPreview(null);
      router.refresh();
    });
  };

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
        ref={buttonRef}
        type="button"
        className="avatar-editor-photo"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Foto de perfil"
      >
        <Avatar name={name} color="#1AC4DB" size={120} src={shown} />
        <span className="avatar-editor-badge" aria-hidden>
          <Camera size={16} strokeWidth={2} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {open &&
        createPortal(
          <div ref={menuRef} id={menuId} role="menu" aria-label="Foto de perfil" className="bf-select-pop bf-select-list user-menu" style={pos} onKeyDown={onMenuKey}>
            <button type="button" role="menuitem" className="bf-select-option user-menu-item" onClick={pick}>
              <Camera size={17} strokeWidth={1.7} />
              <span className="bf-select-option-label">{shown ? "Trocar foto" : "Adicionar foto"}</span>
            </button>
            {shown && (
              <button type="button" role="menuitem" className="bf-select-option user-menu-item danger" onClick={remove}>
                <Trash2 size={17} strokeWidth={1.7} />
                <span className="bf-select-option-label">Remover foto</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function ProfileForm({ name, email, username }: { name: string; email: string; username: string }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [e, setE] = useState(email);
  const [u, setU] = useState(username);
  const changed = n.trim() !== name || e.trim().toLowerCase() !== email || u.trim().replace(/^@/, "").toLowerCase() !== username;
  return (
    <form
      className="card form"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => toastResult(await updateProfile({ name: n, email: e, username: u })));
      }}
    >
      <h2>Dados pessoais</h2>
      <label className="field">
        <span>Nome</span>
        <input className="input" value={n} onChange={(ev) => setN(ev.target.value)} maxLength={60} autoComplete="name" required />
      </label>
      <div className="field">
        <label htmlFor="perfil-usuario">Nome de usuário</label>
        <div className="at-input">
          <span aria-hidden>@</span>
          <input
            id="perfil-usuario"
            className="input"
            value={u}
            onChange={(ev) => setU(ev.target.value.toLowerCase().replace(/\s/g, ""))}
            maxLength={12}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="perfil-usuario-hint"
            required
          />
        </div>
        <span id="perfil-usuario-hint" className="faint">Único no Birion, até 12: letras, números, ponto ou _. Também serve para entrar.</span>
      </div>
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

/** Cartão "Senha" com um botão; o formulário abre numa janela por cima. */
export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  return (
    <section className="card form password-card">
      <h2>Senha</h2>
      <p className="muted">Pelo menos 8 caracteres.</p>
      <div className="actions">
        <button ref={opener} type="button" className="btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <KeyRound size={16} strokeWidth={1.7} /> Alterar senha
        </button>
      </div>
      {open && <PasswordDialog onClose={close} />}
    </section>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const first = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: ev.target.value }));
  const mismatch = v.confirm.length > 0 && v.next !== v.confirm;

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="alert-backdrop" onClick={(e) => e.target === e.currentTarget && !pending && onClose()}>
      <form
        className="alert-dialog form password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (mismatch) return;
          start(async () => {
            const r = await changePassword(v);
            toastResult(r);
            if (r.ok) onClose();
          });
        }}
      >
        <h2 id="pw-title">Alterar senha</h2>
        <label className="field">
          <span>Senha atual</span>
          <input ref={first} className="input" type="password" value={v.current} onChange={set("current")} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>Nova senha</span>
          <input className="input" type="password" value={v.next} onChange={set("next")} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>Repita a nova senha</span>
          <input className="input" type="password" value={v.confirm} onChange={set("confirm")} autoComplete="new-password" minLength={8} required aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "pw-mismatch" : undefined} />
          {mismatch && (
            <small id="pw-mismatch" className="error-text">
              As duas senhas novas não são iguais.
            </small>
          )}
        </label>
        <div className="alert-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button className="btn primary" disabled={pending || mismatch}>
            {pending ? "Alterando…" : "Salvar nova senha"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
