"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  addRule,
  createInvite,
  deletePreset,
  deleteRule,
  linkMyParticipant,
  removeMember,
  revokeInvite,
  setMemberRole,
  updateHousehold,
} from "@/app/actions/settings";
import { CURRENCIES } from "@/lib/defaults";
import { toast, toastResult } from "./toaster";
import { Dot } from "./ui";

const TABS = [
  { href: "/ajustes", label: "Família" },
  { href: "/ajustes/pessoas", label: "Pessoas" },
  { href: "/ajustes/categorias", label: "Categorias" },
  { href: "/ajustes/projetos", label: "Projetos" },
  { href: "/ajustes/status", label: "Status" },
  { href: "/ajustes/membros", label: "Acesso" },
  { href: "/ajustes/importacao", label: "Importação" },
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Ajustes">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

type Opt = { id: string; name: string; color?: string; archived?: boolean };
type Result = { ok: boolean; error?: string; message?: string };

function useAct() {
  const [pending, start] = useTransition();
  return [pending, (fn: () => Promise<Result>, after?: () => void) => start(async () => {
    const r = await fn();
    toastResult(r);
    if (r.ok) after?.();
  })] as const;
}

export function HouseholdForm({ name, currency, isOwner }: { name: string; currency: string; isOwner: boolean }) {
  const [pending, act] = useAct();
  const [n, setN] = useState(name);
  const [c, setC] = useState(currency);
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateHousehold({ name: n, currency: c }));
      }}
    >
      <label className="field">
        <span>Nome da família ou grupo</span>
        <input className="input" value={n} onChange={(e) => setN(e.target.value)} disabled={!isOwner} maxLength={60} required />
      </label>
      <label className="field">
        <span>Moeda</span>
        <select className="select" value={c} onChange={(e) => setC(e.target.value)} disabled={!isOwner}>
          {CURRENCIES.map((x) => (
            <option key={x.value} value={x.value}>{x.label}</option>
          ))}
        </select>
      </label>
      {isOwner ? (
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" disabled={pending}>Salvar</button>
        </div>
      ) : (
        <p className="faint">Só quem administra a família pode mudar estes dados.</p>
      )}
    </form>
  );
}

export function MeForm({ participants, current }: { participants: Opt[]; current: string | null }) {
  const [pending, act] = useAct();
  return (
    <div className="card form">
      <label className="field">
        <span>Quem é você entre as pessoas</span>
        <select
          className="select"
          value={current ?? ""}
          disabled={pending}
          onChange={(e) => act(() => linkMyParticipant(e.target.value || null))}
        >
          <option value="">Não definido</option>
          {participants.filter((p) => !p.archived || p.id === current).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="faint">Usado para mostrar “seu saldo” no painel e já sugerir você como quem pagou.</span>
      </label>
    </div>
  );
}

export function RulesEditor({ rules, categories }: { rules: { id: string; pattern: string; categoryId: string }[]; categories: Opt[] }) {
  const [pending, act] = useAct();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState(categories.find((c) => !c.archived)?.id ?? "");
  const cat = new Map(categories.map((c) => [c.id, c]));
  return (
    <div className="card">
      <p className="faint" style={{ marginBottom: 10 }}>
        Na importação, a categoria é escolhida sozinha quando a descrição contém o texto. Ex.: “uber” → Transporte.
      </p>
      <div className="rows">
        {rules.map((r) => (
          <div key={r.id} className="row">
            <div className="grow">
              <p className="title">contém “{r.pattern}”</p>
              <p className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Dot color={cat.get(r.categoryId)?.color ?? "#ccc"} /> {cat.get(r.categoryId)?.name}
              </p>
            </div>
            <button className="icon-btn" disabled={pending} onClick={() => act(() => deleteRule(r.id))} aria-label={`Remover regra ${r.pattern}`}>
              <Trash2 size={16} strokeWidth={1.6} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="actions"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          act(() => addRule({ pattern, categoryId }), () => setPattern(""));
        }}
      >
        <input className="input" style={{ flex: "1 1 160px" }} placeholder="Texto na descrição" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Texto na descrição" />
        <select className="select" style={{ flex: "1 1 140px", width: "auto" }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
          {categories.filter((c) => !c.archived).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn" disabled={pending || !pattern.trim() || !categoryId}>
          <Plus size={16} /> Adicionar
        </button>
      </form>
    </div>
  );
}

export function MembersPanel({
  members,
  invites,
  participants,
  me,
  isOwner,
}: {
  members: { userId: string; name: string; email: string; role: string; participantId: string | null }[];
  invites: { id: string; code: string; role: string; expiresAt: string }[];
  participants: Opt[];
  me: string;
  isOwner: boolean;
}) {
  const [pending, act] = useAct();
  const [role, setRole] = useState<"member" | "owner">("member");
  const pName = new Map(participants.map((p) => [p.id, p.name]));
  const linkFor = (code: string) => `${window.location.origin}/convite/${code}`;
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code));
      toast("Link copiado. Envie para a pessoa.");
    } catch {
      window.prompt("Copie o link do convite:", linkFor(code));
    }
  };

  return (
    <>
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Quem tem acesso</h2>
        <div className="rows">
          {members.map((m) => (
            <div key={m.userId} className="row">
              <div className="grow">
                <p className="title">{m.name}{m.userId === me ? " (você)" : ""}</p>
                <p className="sub">
                  {m.email}
                  {m.participantId ? ` · é “${pName.get(m.participantId) ?? "?"}”` : ""}
                </p>
              </div>
              {isOwner && m.userId !== me ? (
                <>
                  <select
                    className="select"
                    style={{ width: "auto", minHeight: 36 }}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => act(() => setMemberRole(m.userId, e.target.value as "owner" | "member"))}
                    aria-label={`Permissão de ${m.name}`}
                  >
                    <option value="member">Membro</option>
                    <option value="owner">Administra</option>
                  </select>
                  <button
                    className="icon-btn"
                    disabled={pending}
                    onClick={() => window.confirm(`Remover o acesso de ${m.name}?`) && act(() => removeMember(m.userId))}
                    aria-label={`Remover ${m.name}`}
                  >
                    <Trash2 size={16} strokeWidth={1.6} />
                  </button>
                </>
              ) : (
                <span className="badge">{m.role === "owner" ? "Administra" : "Membro"}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {isOwner && (
        <section className="card section">
          <h2 style={{ marginBottom: 4 }}>Convidar alguém</h2>
          <p className="faint" style={{ marginBottom: 12 }}>
            Gere um link e envie pelo WhatsApp ou e-mail. Quem entrar vira também uma pessoa nos lançamentos.
          </p>
          <div className="actions">
            <select className="select" style={{ width: "auto" }} value={role} onChange={(e) => setRole(e.target.value as "owner" | "member")} aria-label="Permissão do convite">
              <option value="member">Como membro</option>
              <option value="owner">Como administrador</option>
            </select>
            <button
              className="btn primary"
              disabled={pending}
              onClick={() =>
                act(async () => {
                  const r = await createInvite(role);
                  if (r.ok && r.code) await copy(r.code);
                  return { ...r, message: undefined };
                })
              }
            >
              <Plus size={16} /> Gerar link de convite
            </button>
          </div>
          {invites.length > 0 && (
            <div className="rows" style={{ marginTop: 12 }}>
              {invites.map((i) => (
                <div key={i.id} className="row">
                  <div className="grow">
                    <p className="title num">…/convite/{i.code.slice(0, 6)}…</p>
                    <p className="sub">
                      {i.role === "owner" ? "administrador" : "membro"} · vale até {new Date(i.expiresAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <button className="icon-btn" onClick={() => copy(i.code)} aria-label="Copiar link">
                    <Copy size={16} strokeWidth={1.6} />
                  </button>
                  <button className="icon-btn" disabled={pending} onClick={() => act(() => revokeInvite(i.id))} aria-label="Cancelar convite">
                    <Trash2 size={16} strokeWidth={1.6} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function PresetsPanel({ presets }: { presets: { id: string; name: string }[] }) {
  const [pending, act] = useAct();
  return (
    <div className="card">
      <p className="faint" style={{ marginBottom: 10 }}>
        Modelos guardam como ler o CSV de cada banco (colunas, formato de data, sinal dos valores). Você cria um na tela de importação.
      </p>
      {presets.length === 0 ? (
        <div className="empty">Nenhum modelo salvo ainda.</div>
      ) : (
        <div className="rows">
          {presets.map((p) => (
            <div key={p.id} className="row">
              <p className="grow title">{p.name}</p>
              <button className="icon-btn" disabled={pending} onClick={() => act(() => deletePreset(p.id))} aria-label={`Excluir modelo ${p.name}`}>
                <Trash2 size={16} strokeWidth={1.6} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
