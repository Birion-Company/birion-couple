"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
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
  { href: "/ajustes", label: "Família", help: "Nome da família (aparece embaixo do seu nome no menu) e a moeda usada nos valores. Só quem administra pode mudar." },
  {
    href: "/ajustes/pessoas",
    label: "Pessoas",
    help: "Quem divide as contas: aparecem em “Quem pagou”, “Quem deveria pagar” e em Dívidas. Não precisam ter login; para dar acesso ao app, use a aba Acesso. Máximo de 10 pessoas ativas.",
  },
  {
    href: "/ajustes/categorias",
    label: "Categorias",
    help: "Com o que o dinheiro foi gasto (Mercado, Moradia…). Servem para o gráfico “Gastos por categoria” e para filtrar. Embaixo, regras que escolhem a categoria sozinhas na importação.",
  },
  {
    href: "/ajustes/projetos",
    label: "Projetos",
    help: "Agrupam lançamentos de um mesmo assunto, como uma viagem ou uma reforma, para ver quanto custou no total. São opcionais e viram filtro.",
  },
  {
    href: "/ajustes/status",
    label: "Status",
    help: "Em que pé está cada lançamento. O que conta é o significado: só “Acertado” tira o lançamento das dívidas; “Pendente” ainda aparece na lista de Pendências do painel.",
  },
  {
    href: "/ajustes/membros",
    label: "Acesso",
    help: "Quem entra no app. Gere um link de convite para alguém da família criar a conta. Quem administra vê tudo; os outros membros só veem o que os envolve.",
  },
  {
    href: "/ajustes/importacao",
    label: "Importação",
    help: "Modelos salvos de leitura de CSV (qual coluna é a data, o valor…), para não precisar configurar de novo a cada extrato do mesmo banco.",
  },
];

export function SettingsTabs() {
  const path = usePathname();
  const active = TABS.find((t) => t.href === path);
  return (
    <>
      <nav className="tabs" aria-label="Ajustes">
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
        <Select
          ariaLabel="Categoria"
          style={{ flex: "1 1 140px", width: "auto" }}
          value={categoryId}
          onChange={setCategoryId}
          options={categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color }))}
        />
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
            Gere um link e envie pelo WhatsApp ou e-mail. Quem entrar vira também uma pessoa nos lançamentos.
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

export function DangerZone({ householdName }: { householdName: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <section className="card" aria-labelledby="danger">
      <h2 id="danger" style={{ marginBottom: 4 }}>Excluir a família</h2>
      <p className="faint" style={{ marginBottom: 12 }}>
        Apaga todos os lançamentos, pessoas e configurações desta família. Não dá para desfazer.
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
            <span>Para confirmar, digite o nome da família: {householdName}</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</button>
            <button className="btn danger" disabled={pending || typed.trim() !== householdName.trim()}>
              {pending ? "Excluindo…" : "Excluir para sempre"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
