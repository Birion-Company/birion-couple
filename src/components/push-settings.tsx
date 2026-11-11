"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BellOff, BellRing, Share, SquarePlus, X } from "lucide-react";
import { getPushPrefs, removePushSubscription, savePushSubscription, setPushPref } from "@/app/actions/push";
import { PUSH_KINDS, wants, type PushKind, type PushPrefs } from "@/lib/push-prefs";
import { toastResult } from "./toaster";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "ios-install" | "off" | "on" | "blocked";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const deviceName = () => (isIOS() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Computador");

/**
 * Notificações no celular (push): funcionam com o app fechado. No iPhone, só depois de adicionar
 * o site à Tela de Início e abrir por lá.
 */
export function PushSettings() {
  const [state, setState] = useState<State>("loading");
  const [pending, start] = useTransition();
  const [prefs, setPrefs] = useState<PushPrefs>({});
  useEffect(() => {
    if (state === "on") void getPushPrefs().then(setPrefs);
  }, [state]);
  const toggle = (kind: PushKind, on: boolean) => {
    setPrefs((p) => ({ ...p, [kind]: on }));
    void setPushPref(kind, on).then((r) => {
      if (!r.ok) {
        toastResult(r);
        setPrefs((p) => ({ ...p, [kind]: !on }));
      }
    });
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!KEY) return setState("unsupported");
      if (isIOS() && !isInstalled()) return setState("ios-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Mantém o servidor em dia com este aparelho (as chaves podem mudar).
        void savePushSubscription({ ...(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }), device: deviceName() });
        setState("on");
      } else setState("off");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const enable = () =>
    start(async () => {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const r = await savePushSubscription({ ...(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }), device: deviceName() });
      toastResult(r);
      if (r.ok) {
        setState("on");
        // O aviso antigo "com o app em outra aba" ficaria repetido.
        try {
          localStorage.removeItem("bf-notif-browser");
        } catch {
          /* ignora */
        }
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toastResult({ ok: true, message: "Notificações desligadas neste aparelho." });
    });

  if (state === "loading") return null;
  if (state === "unsupported") return <p className="faint">Este navegador não recebe notificações do app.</p>;
  if (state === "ios-install") {
    return (
      <div className="push-box">
        <p className="push-title">
          <BellRing size={15} aria-hidden /> Receber notificações no iPhone
        </p>
        <ol className="push-steps">
          <li>
            No Safari, toque em <Share size={14} aria-label="Compartilhar" /> <strong>Compartilhar</strong>.
          </li>
          <li>
            Escolha <SquarePlus size={14} aria-hidden /> <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li>Abra o Birion pelo ícone novo e volte aqui, no sino, para ativar.</li>
        </ol>
      </div>
    );
  }
  if (state === "blocked") return <p className="faint">Notificações bloqueadas. Libere nos ajustes do aparelho.</p>;
  if (state === "off") {
    return (
      <div className="push-box">
        <p className="faint">Faturas, dívidas e pagamentos, mesmo com o app fechado.</p>
        <button type="button" className="btn small primary" onClick={enable} disabled={pending}>
          <BellRing size={14} /> Ativar neste aparelho
        </button>
      </div>
    );
  }
  return (
    <div className="push-box">
      <p className="push-on">
        <BellRing size={15} aria-hidden /> Notificações ligadas neste aparelho.
      </p>
      <fieldset className="push-kinds">
        <legend>Quais avisos receber</legend>
        {PUSH_KINDS.map((k) => (
          <label key={k.key} className="push-kind">
            <span>
              <strong>{k.label}</strong>
              <span className="faint">{k.hint}</span>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={wants(prefs, k.key)} onChange={(e) => toggle(k.key, e.target.checked)} />
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn small ghost push-off" onClick={disable} disabled={pending}>
        <BellOff size={14} /> Desligar neste aparelho
      </button>
    </div>
  );
}

/** Janela "Configurar notificações" (abre pela engrenagem do sino). */
export function PushSettingsDialog({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop push-dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} className="push-dialog" role="dialog" aria-modal="true" aria-labelledby="push-dialog-title">
        <div className="push-dialog-head">
          <h2 id="push-dialog-title">Configurar notificações</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <PushSettings />
      </div>
    </div>,
    document.body,
  );
}
