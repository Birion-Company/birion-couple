"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import {
  addRule,
  deleteAccount, deleteMyData,
  deletePreset,
  deleteRule,
  updateHousehold,
} from "@/app/actions/settings";
import { CURRENCIES, HOUSEHOLD_NAME_MAX } from "@/lib/defaults";
import { Select } from "./select";
import { toastResult } from "./toaster";
import { Dot } from "./ui";

/** Abas de Ajustes, com uma frase dizendo para que serve cada uma. */
const TABS: { href: string; label: string; help: string; danger?: boolean; needsApprovals?: boolean }[] = [
  { href: "/ajustes", label: "Pessoas", help: "Quem participa, o modo casal e o histórico." },
  { href: "/ajustes/aparencia", label: "Aparência", help: "Cores, claro ou escuro e a largura das páginas." },
  { href: "/ajustes/categorias", label: "Categorias", help: "Ordem, limite por mês e regras automáticas." },
  { href: "/ajustes/automacao", label: "Automação", help: "O que o app reaproveita ao importar um mês novo." },
  { href: "/ajustes/importacao", label: "Importação", help: "Extratos OFX ou CSV, sem repetir." },
  { href: "/ajustes/exportacao", label: "Exportação", help: "O mês em planilha ou PDF." },
  { href: "/ajustes/perigo", label: "Perigo", help: "Apagar seus dados ou a conta. Sem volta.", danger: true },
];

export function SettingsTabs({ approvals = false }: { approvals?: boolean }) {
  const path = usePathname();
  // Abas marcadas com needsApprovals só aparecem quando um confirma os gastos do outro.
  const tabs = TABS.filter((t) => !t.needsApprovals || approvals || path === t.href);
  const active = tabs.find((t) => t.href === path);
  return (
    <>
      <nav className="tabs" aria-label="Ajustes" data-tour="settings-tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined} className={t.danger ? "tab-danger" : undefined}>
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

export function HouseholdForm({ name, currency, isOwner, currencyLocked = false, approvals = false }: { name: string; currency: string; isOwner: boolean; currencyLocked?: boolean; approvals?: boolean }) {
  const [pending, act] = useAct();
  const [ask, setAsk] = useState(approvals);
  const [n, setN] = useState(name);
  const [c, setC] = useState(currency);
  return (
    <form
      className="card form"
      data-tour="family-form"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateHousehold({ name: n, currency: c, approvals: ask }));
      }}
    >
      <div className="field">
        <label htmlFor="familia-nome">Nome do casal</label>
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
        <Select value={c} onChange={setC} disabled={!isOwner || currencyLocked} options={CURRENCIES.map((x) => ({ value: x.value, label: x.label }))} />
        {currencyLocked && <span className="faint">Travada: já há lançamentos, e trocar a moeda não converte os valores (só mudaria o símbolo).</span>}
      </label>
      <label className="check-row">
        <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} disabled={!isOwner} />
        <span>Um confirma os gastos do outro</span>
      </label>
      {isOwner ? (
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" disabled={pending}>Salvar</button>
        </div>
      ) : (
        <p className="faint">Só quem faz parte do casal pode mudar estes dados.</p>
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
    <div className="card rules-card" data-tour="category-rules">
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

/** Excluir meus dados: apaga tudo que a pessoa lançou (some para todos os envolvidos). A conta continua. */
/** Apagar algo sem volta: abre um campo para digitar a palavra de confirmação. */
function ConfirmDanger({
  id,
  title,
  text,
  word,
  open: openLabel,
  submit,
  action,
}: {
  id: string;
  title: string;
  text: React.ReactNode;
  word: string;
  open: string;
  submit: string;
  action: (typed: string) => Promise<{ ok: boolean; error?: string; message?: string } | undefined | void>;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id} style={{ marginBottom: 4 }}>{title}</h2>
      <div className="faint danger-text">{text}</div>
      {!open ? (
        <button className="btn danger" onClick={() => setOpen(true)}>{openLabel}</button>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await action(typed);
              if (r) toastResult(r);
              if (r && r.ok) {
                setOpen(false);
                setTyped("");
              }
            });
          }}
        >
          <label className="field">
            <span>
              Para confirmar, digite <strong>{word}</strong>
            </span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</button>
            <button className="btn danger" disabled={pending || typed.trim().toUpperCase() !== word}>
              {pending ? "Apagando…" : submit}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function DangerZone() {
  return (
    <>
      <ConfirmDanger
        id="danger"
        title="Excluir meus dados"
        word="EXCLUIR"
        open="Excluir meus dados…"
        submit="Apagar o que é só meu"
        action={deleteMyData}
        text={
          <>
            <p>
              Apaga o que <strong>você lançou e é só seu</strong> neste casal: despesas, receitas, contas que repetem, importações e os contatos que
              não aparecem em mais nada.
            </p>
            <p>
              <strong>Não muda nada para os outros:</strong> o que envolve outra pessoa com login (uma dívida que ela aceitou, uma conta dividida com
              ela) continua. Sua conta e o casal continuam. Não dá para desfazer.
            </p>
          </>
        }
      />
      <ConfirmDanger
        id="apagar-conta"
        title="Apagar minha conta"
        word="APAGAR"
        open="Apagar minha conta…"
        submit="Apagar minha conta para sempre"
        action={deleteAccount}
        text={
          <>
            <p>
              Apaga <strong>para sempre</strong> o seu login, o que é só seu e os seus contatos. <strong>Não dá para desfazer nem recuperar.</strong>
            </p>
            <p>
              Nos lançamentos com outras pessoas com login, você vira um nome sem login e as dívidas continuam para elas. Se você administra, o cargo
              passa para quem entrou primeiro.
            </p>
          </>
        }
      />
    </>
  );
}
