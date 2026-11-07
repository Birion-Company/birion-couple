"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, FileUp } from "lucide-react";
import { commitImport, previewImport, savePreset, type PreviewResult, type PreviewRow } from "@/app/actions/import";
import type { CsvMapping } from "@/lib/import/types";
import { formatMoney } from "@/lib/money";
import type { Lookups } from "@/lib/queries";
import { Select, type SelectOption } from "./select";
import { toast, toastResult } from "./toaster";
import { Avatar, formatDate } from "./ui";

type Preset = { id: string; name: string; mapping: unknown };

/** Bancos brasileiros às vezes salvam em Windows-1252; tentamos UTF-8 primeiro. */
async function readText(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function ImportWizard({
  lookups,
  presets,
  currency,
  me,
}: {
  lookups: Lookups;
  presets: Preset[];
  currency: string;
  me: string | null;
}) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Record<string, string>>({});
  const people = lookups.participants.filter((p) => !p.archived);
  const firstPerson = me && people.some((p) => p.id === me) ? me : people[0]?.id ?? "";
  const [payerId, setPayerId] = useState(firstPerson);
  const [splitIds, setSplitIds] = useState<string[]>(firstPerson ? [firstPerson] : []);
  const [statusId, setStatusId] = useState(
    lookups.statuses.find((s) => s.isImportDefault && !s.archived)?.id ?? lookups.statuses.find((s) => !s.archived)?.id ?? "",
  );
  const [projectId, setProjectId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = (f: { name: string; text: string }, m?: CsvMapping) =>
    start(async () => {
      const r = await previewImport({ fileName: f.name, text: f.text, mapping: m });
      if (!r.ok) {
        toast(r.error ?? "Não consegui ler o arquivo.", "error");
        return;
      }
      setPreview(r);
      if (r.mapping) setMapping(r.mapping);
      setInclude(new Set((r.rows ?? []).filter((x) => !x.duplicate).map((x) => x.key)));
      setCats(Object.fromEntries((r.rows ?? []).map((x) => [x.key, x.categoryId ?? ""])));
    });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 3_000_000) return toast("Arquivo grande demais (máximo 3 MB).", "error");
    const text = await readText(f);
    const next = { name: f.name, text };
    setFile(next);
    setDone(null);
    load(next);
  };

  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const chosen = rows.filter((r) => include.has(r.key));
  const totalOut = chosen.filter((r) => r.amountCents < 0).reduce((a, r) => a - r.amountCents, 0);
  const totalIn = chosen.filter((r) => r.amountCents > 0).reduce((a, r) => a + r.amountCents, 0);
  const dupCount = rows.filter((r) => r.duplicate).length;

  const setMap = (patch: Partial<CsvMapping>) => {
    if (!mapping || !file) return;
    const next = { ...mapping, ...patch };
    setMapping(next);
    load(file, next);
  };

  const toggleAll = (pred: (r: PreviewRow) => boolean, on: boolean) =>
    setInclude((s) => {
      const n = new Set(s);
      rows.filter(pred).forEach((r) => (on ? n.add(r.key) : n.delete(r.key)));
      return n;
    });

  const confirm = () => {
    if (!preview?.format || chosen.length === 0) return toast("Escolha pelo menos uma linha.", "error");
    if (splitIds.length === 0) return toast("Escolha quem divide as despesas.", "error");
    start(async () => {
      const r = await commitImport({
        fileName: file?.name ?? "arquivo",
        format: preview.format!,
        rows: chosen.map((x) => ({ key: x.key, date: x.date, description: x.description, amountCents: x.amountCents, categoryId: cats[x.key] || null })),
        payerId: payerId || null,
        splitIds,
        statusId: statusId || null,
        projectId: projectId || null,
      });
      if (!r.ok) return toast(r.error ?? "Falha ao importar.", "error");
      setDone({ imported: r.imported ?? 0, skipped: r.skipped ?? 0 });
      setPreview(null);
      setFile(null);
    });
  };

  if (done) {
    return (
      <div className="card">
        <div className="empty">
          <CheckCircle2 size={36} strokeWidth={1.2} style={{ color: "var(--pos)" }} />
          <p style={{ color: "var(--text)" }}>
            {done.imported} {done.imported === 1 ? "lançamento importado" : "lançamentos importados"}
            {done.skipped > 0 ? ` · ${done.skipped} já existiam e foram ignorados` : ""}.
          </p>
          <div className="actions" style={{ justifyContent: "center", marginTop: 14 }}>
            <Link className="btn primary" href="/transacoes">Ver lançamentos</Link>
            <button className="btn" onClick={() => setDone(null)}>Importar outro arquivo</button>
          </div>
        </div>
      </div>
    );
  }

  const colOptions: SelectOption[] = (preview?.headers ?? []).map((h, i) => ({
    value: String(i),
    label: mapping?.hasHeader && h ? h : `Coluna ${i + 1}`,
  }));
  const colOrNone: SelectOption[] = [{ value: "-1", label: "Nenhuma" }, ...colOptions];
  const catOptions: SelectOption[] = [
    { value: "", label: "Sem categoria" },
    ...lookups.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color })),
  ];

  return (
    <>
      <div className="steps" aria-hidden>
        <span className="on" />
        <span className={preview ? "on" : ""} />
        <span className={chosen.length && preview ? "on" : ""} />
      </div>

      <div
        className="card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files[0]);
        }}
      >
        <div className="empty" style={{ padding: "20px 8px" }}>
          <FileUp size={34} strokeWidth={1.2} />
          <p style={{ color: "var(--text)" }}>{file ? file.name : "Escolha um extrato ou fatura"}</p>
          <p className="faint" style={{ marginTop: 2 }}>OFX ou CSV, de qualquer banco. Até 3 MB.</p>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={pending}>
              {file ? "Trocar arquivo" : "Escolher arquivo"}
            </button>
            <input ref={inputRef} type="file" accept=".ofx,.qfx,.csv,.txt,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
      </div>

      {pending && !preview && <p className="faint" style={{ marginTop: 12 }}>Lendo o arquivo…</p>}

      {preview?.format === "csv" && mapping && (
        <section className="card section" aria-labelledby="map">
          <div className="card-head">
            <h2 id="map">Como ler este CSV</h2>
            {presets.length > 0 && (
              <Select
                ariaLabel="Usar modelo salvo"
                style={{ width: "auto", minHeight: 36 }}
                value=""
                placeholder="Usar modelo salvo…"
                options={presets.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => {
                  const p = presets.find((x) => x.id === v);
                  if (p) setMap(p.mapping as CsvMapping);
                }}
              />
            )}
          </div>
          <p className="faint" style={{ marginBottom: 12 }}>Já tentei adivinhar. Confira as colunas olhando o exemplo abaixo.</p>
          <div className="form">
            <div className="field-row">
              <label className="field">
                <span>Data</span>
                <Select value={String(mapping.dateColumn)} onChange={(v) => setMap({ dateColumn: Number(v) })} options={colOptions} />
              </label>
              <label className="field">
                <span>Formato da data</span>
                <Select
                  value={mapping.dateFormat}
                  onChange={(v) => setMap({ dateFormat: v as CsvMapping["dateFormat"] })}
                  options={[
                    { value: "DD/MM/YYYY", label: "dia/mês/ano" },
                    { value: "YYYY-MM-DD", label: "ano-mês-dia" },
                    { value: "MM/DD/YYYY", label: "mês/dia/ano" },
                  ]}
                />
              </label>
            </div>
            <label className="field">
              <span>Descrição</span>
              <Select value={String(mapping.descriptionColumn)} onChange={(v) => setMap({ descriptionColumn: Number(v) })} options={colOptions} />
            </label>
            <div className="segmented" role="group" aria-label="Colunas de valor">
              <button type="button" aria-pressed={mapping.amountColumn >= 0} onClick={() => setMap({ amountColumn: Math.max(0, mapping.debitColumn, mapping.amountColumn), debitColumn: -1, creditColumn: -1 })}>Uma coluna de valor</button>
              <button type="button" aria-pressed={mapping.amountColumn < 0} onClick={() => setMap({ amountColumn: -1, debitColumn: Math.max(0, mapping.amountColumn), creditColumn: -1 })}>Débito e crédito separados</button>
            </div>
            {mapping.amountColumn >= 0 ? (
              <div className="field-row">
                <label className="field">
                  <span>Valor</span>
                  <Select value={String(mapping.amountColumn)} onChange={(v) => setMap({ amountColumn: Number(v) })} options={colOptions} />
                </label>
                <label className="field">
                  <span>Valores positivos são</span>
                  <Select
                    value={mapping.positiveIsExpense ? "out" : "in"}
                    onChange={(v) => setMap({ positiveIsExpense: v === "out" })}
                    options={[
                      { value: "in", label: "Entradas (extrato de conta)" },
                      { value: "out", label: "Saídas (fatura de cartão)" },
                    ]}
                  />
                </label>
              </div>
            ) : (
              <div className="field-row">
                <label className="field">
                  <span>Débito (saídas)</span>
                  <Select value={String(mapping.debitColumn)} onChange={(v) => setMap({ debitColumn: Number(v) })} options={colOrNone} />
                </label>
                <label className="field">
                  <span>Crédito (entradas)</span>
                  <Select value={String(mapping.creditColumn)} onChange={(v) => setMap({ creditColumn: Number(v) })} options={colOrNone} />
                </label>
              </div>
            )}
            <div className="field-row">
              <label className="field">
                <span>Separador de centavos</span>
                <Select
                  value={mapping.decimal}
                  onChange={(v) => setMap({ decimal: v as "," | "." })}
                  options={[
                    { value: ",", label: "Vírgula (1.234,56)" },
                    { value: ".", label: "Ponto (1,234.56)" },
                  ]}
                />
              </label>
              <label className="check" style={{ alignSelf: "end" }}>
                <input type="checkbox" checked={mapping.hasHeader} onChange={(e) => setMap({ hasHeader: e.target.checked })} />
                Primeira linha é cabeçalho
              </label>
            </div>
            <div className="scroll-x">
              <table className="preview">
                <tbody>
                  {(preview.sample ?? []).map((r, i) => (
                    <tr key={i} style={i === 0 && mapping.hasHeader ? { color: "var(--text-3)" } : undefined}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions">
              <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Nome do modelo (ex.: Fatura Nubank)" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <button
                type="button"
                className="btn"
                disabled={!presetName.trim() || pending}
                onClick={() =>
                  start(async () => {
                    toastResult(await savePreset(presetName, mapping));
                    setPresetName("");
                  })
                }
              >
                Salvar modelo
              </button>
            </div>
          </div>
        </section>
      )}

      {preview && (
        <>
          {(preview.issues?.length ?? 0) > 0 && (
            <div className="notice section">
              {preview.issues!.length} linha(s) não puderam ser lidas e ficaram de fora
              {preview.issues![0].line ? ` (ex.: linha ${preview.issues![0].line}: ${preview.issues![0].message})` : `: ${preview.issues![0].message}`}.
            </div>
          )}

          <section className="card section" aria-labelledby="def">
            <h2 id="def" style={{ marginBottom: 12 }}>Como lançar</h2>
            <div className="form">
              <div className="field-row">
                <label className="field">
                  <span>Quem pagou / recebeu</span>
                  <Select
                    value={payerId}
                    onChange={setPayerId}
                    options={[{ value: "", label: "Ninguém ainda" }, ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <Select
                    value={statusId}
                    onChange={setStatusId}
                    options={lookups.statuses.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name, color: s.color }))}
                  />
                </label>
              </div>
              <div className="field">
                <span className="label-text">Dividir igualmente entre</span>
                <div className="person-pills" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>
                  {people.map((p) => {
                    const on = splitIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`chip ${on ? "on" : ""}`}
                        aria-pressed={on}
                        onClick={() => setSplitIds((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                      >
                        <Avatar name={p.name} color={p.color} size={22} /> {p.name}
                      </button>
                    );
                  })}
                </div>
                <span className="faint">Dá para ajustar a divisão de cada lançamento depois.</span>
              </div>
              {lookups.projects.some((p) => !p.archived) && (
                <label className="field">
                  <span>Projeto</span>
                  <Select
                    value={projectId}
                    onChange={setProjectId}
                    options={[
                      { value: "", label: "Nenhum" },
                      ...lookups.projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color })),
                    ]}
                  />
                </label>
              )}
            </div>
          </section>

          <section className="card section" aria-labelledby="rows">
            <div className="card-head">
              <h2 id="rows">Prévia</h2>
              <span className="faint">
                {rows.length} linhas{dupCount ? ` · ${dupCount} já importadas` : ""}
              </span>
            </div>
            <div className="actions" style={{ marginBottom: 8 }}>
              <button type="button" className="btn small" onClick={() => toggleAll((r) => !r.duplicate, true)}>Marcar novas</button>
              <button type="button" className="btn small" onClick={() => toggleAll(() => true, false)}>Desmarcar tudo</button>
              <button type="button" className="btn small" onClick={() => toggleAll((r) => r.amountCents > 0, false)}>Tirar entradas</button>
            </div>
            <div className="rows">
              {rows.map((r) => (
                <div key={r.key} className={`row ${r.duplicate ? "dup" : ""}`}>
                  <input
                    type="checkbox"
                    aria-label={`Importar ${r.description}`}
                    checked={include.has(r.key)}
                    onChange={() =>
                      setInclude((s) => {
                        const n = new Set(s);
                        if (n.has(r.key)) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      })
                    }
                    style={{ width: 18, height: 18, accentColor: "var(--brand-strong)", flex: "none" }}
                  />
                  <div className="grow">
                    <p className="title">{r.description}</p>
                    <p className="sub">
                      {formatDate(r.date, { day: "2-digit", month: "short", year: "numeric" })}
                      {r.duplicate ? " · já importado" : ""}
                    </p>
                    <Select
                      ariaLabel={`Categoria de ${r.description}`}
                      value={cats[r.key] ?? ""}
                      onChange={(v) => setCats((c) => ({ ...c, [r.key]: v }))}
                      options={catOptions}
                      style={{ minHeight: 32, padding: "4px 10px", fontSize: "0.8rem", marginTop: 6, maxWidth: 220 }}
                    />
                  </div>
                  <span className={`amount ${r.amountCents > 0 ? "pos" : ""}`}>
                    {r.amountCents > 0 ? "+" : ""}
                    {formatMoney(Math.abs(r.amountCents), currency)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="card section" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div className="grow" style={{ flex: 1 }}>
              <p>{chosen.length} selecionadas</p>
              <p className="faint">
                {formatMoney(totalOut, currency)} em saídas · {formatMoney(totalIn, currency)} em entradas
              </p>
            </div>
            <button className="btn primary" onClick={confirm} disabled={pending || chosen.length === 0}>
              {pending ? "Importando…" : `Importar ${chosen.length}`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
