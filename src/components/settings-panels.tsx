"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Plus, Search, Trash2, X } from "lucide-react";
import {
  addRule,
  createInvite,
  deleteHousehold,
  deletePreset,
  deleteRule,
  removeMember,
  revokeInvite,
  setMemberRole,
  updateHousehold,
} from "@/app/actions/settings";
import { CURRENCIES, HOUSEHOLD_NAME_MAX } from "@/lib/defaults";
import { Select } from "./select";
import { toast, toastResult } from "./toaster";
import { Dot } from "./ui";

/** Abas de Ajustes, com uma frase dizendo para que serve cada uma. */
const TABS = [
  { href: "/ajustes", label: "Família", help: "Nome da família e moeda." },
  { href: "/ajustes/pessoas", label: "Pessoas", help: "Família (com login) e contatos (sem login)." },
  { href: "/ajustes/categorias", label: "Categorias", help: "Arraste para ordenar. Embaixo, regras que categorizam sozinhas." },
  { href: "/ajustes/membros", label: "Acesso", help: "Convites para entrar no app." },
  { href: "/ajustes/importacao", label: "Importação", help: "Extratos OFX ou CSV, sem repetir o que já entrou." },
  { href: "/ajustes/exportacao", label: "Exportação", help: "O mês em planilha ou em PDF, para guardar ou mandar para alguém." },
];

export function SettingsTabs() {
  const path = usePathname();
  const active = TABS.find((t) => t.href === path);
  return (
    <>
      <nav className="tabs" aria-label="Ajustes" data-tour="settings-tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {active && <p className="tab-help">{active.help}</p>}
    </>
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
      <div className="field">
        <label htmlFor="familia-nome">Nome da família ou grupo</label>
        <input
          id="familia-nome"
          className="input"
          value={n}
          onChange={(e) => setN(e.target.value)}
          disabled={!isOwner}
          maxLength={HOUSEHOLD_NAME_MAX}
          aria-describedby="familia-limite"
          required
        />
        <span id="familia-limite" className="faint">
          {n.length}/{HOUSEHOLD_NAME_MAX} caracteres
        </span>
      </div>
      <label className="field">
        <span>Moeda</span>
        <Select value={c} onChange={setC} disabled={!isOwner} options={CURRENCIES.map((x) => ({ value: x.value, label: x.label }))} />
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

/** "joão" acha "João": compara sem acento e sem maiúsculas. */
const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Categorização automática: as regras ("uber" → Transporte) agrupadas por categoria, cada grupo
 * recolhido ("Transporte · 12 regras"); abrir mostra as palavras, com × para remover. Uma pesquisa
 * acha a palavra ou a categoria. Ao adicionar, a regra já vale para o que existe e para o que vier.
 */
export function RulesEditor({ rules, categories }: { rules: { id: string; pattern: string; categoryId: string }[]; categories: Opt[] }) {
  const [pending, act] = useAct();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState(categories.find((c) => !c.archived)?.id ?? "");
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  // Grupos por categoria, na ordem das categorias; com pesquisa, só o que bate.
  const groups = categories
    .map((c) => {
      const all = rules.filter((r) => r.categoryId === c.id);
      const shown = !q || fold(c.name).includes(q) ? all : all.filter((r) => fold(r.pattern).includes(q));
      return { c, all, shown };
    })
    .filter((g) => g.shown.length > 0);
  return (
    <div className="card rules-card">
      <form
        className="actions rules-add"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => addRule({ pattern, categoryId }), () => setPattern(""));
        }}
      >
        <input className="input" style={{ flex: "1 1 160px" }} placeholder="Texto na descrição (ex.: uber)" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Texto na descrição" />
        <Select
          ariaLabel="Categoria"
          searchable
          style={{ flex: "1 1 140px", width: "auto" }}
          value={categoryId}
          onChange={setCategoryId}
          options={categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color }))}
        />
        <button className="btn" disabled={pending || !pattern.trim() || !categoryId}>
          <Plus size={16} /> Adicionar
        </button>
      </form>
      <p className="faint rules-help">Quando a descrição tiver o texto, o lançamento vai para a categoria. Vale para o que já existe e para o que vier.</p>
      {rules.length > 0 && (
        <label className="rules-search">
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar palavra ou categoria" aria-label="Pesquisar regras" />
        </label>
      )}
      {rules.length === 0 && <p className="faint">Nenhuma regra ainda.</p>}
      {q && groups.length === 0 && <p className="faint">Nada com “{query}”.</p>}
      <div className="rules-groups">
        {groups.map(({ c, all, shown }) => (
          <details key={c.id + (q ? "-q" : "")} className="rules-group" open={!!q}>
            <summary>
              <Dot color={c.color ?? "#ccc"} />
              <span className="grow">{c.name}</span>
              <span className="faint num">
                {all.length} {all.length === 1 ? "regra" : "regras"}
              </span>
            </summary>
            <div className="rules-chips">
              {shown.map((r) => (
                <span key={r.id} className="rule-chip">
                  {r.pattern}
                  <button type="button" disabled={pending} onClick={() => act(() => deleteRule(r.id))} aria-label={`Remover regra ${r.pattern}`}>
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </span>
              ))}
            </div>
          </details>
        ))}
      </div>
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
                  <Select
                    ariaLabel={`Permissão de ${m.name}`}
                    style={{ width: "auto", minHeight: 36 }}
                    value={m.role}
                    disabled={pending}
                    onChange={(v) => act(() => setMemberRole(m.userId, v as "owner" | "member"))}
                    options={[
                      { value: "member", label: "Membro" },
                      { value: "owner", label: "Administra" },
                    ]}
                  />
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
            Gere um link e envie para a pessoa.
          </p>
          <div className="actions">
            <Select
              ariaLabel="Permissão do convite"
              style={{ width: "auto" }}
              value={role}
              onChange={(v) => setRole(v as "owner" | "member")}
              options={[
                { value: "member", label: "Como membro" },
                { value: "owner", label: "Como administrador" },
              ]}
            />
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
        Como ler o CSV de cada banco. Criados ao importar um CSV.
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

export function DangerZone({ householdName }: { householdName: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <section className="card" aria-labelledby="danger">
      <h2 id="danger" style={{ marginBottom: 4 }}>Excluir a família</h2>
      <p className="faint" style={{ marginBottom: 12 }}>
        Apaga tudo desta família: lançamentos, pessoas, cartões e ajustes. Não dá para desfazer. As contas continuam, mas ficam bloqueadas até
        criar uma família nova, que começa do zero.
      </p>
      {!open ? (
        <button className="btn danger" onClick={() => setOpen(true)}>Excluir a família…</button>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await deleteHousehold(typed);
              if (r && !r.ok) toastResult(r);
            });
          }}
        >
          <label className="field">
            <span>
              Para confirmar, digite o nome da família: <strong>{householdName}</strong>
            </span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</button>
            <button className="btn danger" disabled={pending || typed.trim() !== householdName.trim()}>
              {pending ? "Apagando…" : "Apagar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
