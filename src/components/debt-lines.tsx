"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Avatar } from "./ui";

export type DebtLine = { fromId: string; toId: string; amountCents: number };
type Person = { name: string; color: string; avatarUrl: string | null };

/** Quantas linhas aparecem antes do "Ver mais". */
const SHOW = 5;
/** A partir de quantas pessoas aparece a busca por nome. */
const SEARCH_FROM = 8;

/** "Fulano" sem acento e minúsculo, para a busca achar "joão" digitando "joao". */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * "Quem deve para quem": uma linha por par de pessoas (de quem → para quem, valor e "Registrar pagamento").
 * Com muita gente, não polui a tela: maiores valores primeiro, só as 5 maiores de cara e o resto em
 * "Ver mais"; a partir de 8 pessoas, uma busca por nome. Em cima, o resumo de quanto entra e quanto sai.
 */
export function DebtLines({ lines, me, people, currency }: { lines: DebtLine[]; me: string | null; people: Record<string, Person>; currency: string }) {
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const name = (id: string) => (id === me ? "Você" : people[id]?.name ?? "Alguém");
  const money = (c: number) => formatMoney(c, currency);
  // Maiores primeiro; entre valores iguais, as que envolvem você.
  const sorted = [...lines].sort((a, b) => b.amountCents - a.amountCents || Number(b.toId === me || b.fromId === me) - Number(a.toId === me || a.fromId === me));
  const q = fold(query.trim());
  const found = q ? sorted.filter((d) => fold(name(d.fromId)).includes(q) || fold(name(d.toId)).includes(q)) : sorted;
  const shown = all || q ? found : found.slice(0, SHOW);
  const toMe = lines.filter((d) => d.toId === me);
  const fromMe = lines.filter((d) => d.fromId === me);
  const sum = (xs: DebtLine[]) => xs.reduce((a, d) => a + d.amountCents, 0);

  const sentence = (d: DebtLine) =>
    d.fromId === me ? (
      <>
        Você deve para <strong>{name(d.toId)}</strong>
      </>
    ) : d.toId === me ? (
      <>
        <strong>{name(d.fromId)}</strong> te deve
      </>
    ) : (
      <>
        <strong>{name(d.fromId)}</strong> deve para <strong>{name(d.toId)}</strong>
      </>
    );
  const face = (id: string) => <Avatar name={name(id)} color={people[id]?.color ?? "#94A3B8"} size={30} src={people[id]?.avatarUrl ?? null} />;

  return (
    <>
      {/* Resumo: quantas pessoas e quanto, de cada lado. */}
      {(toMe.length > 0 || fromMe.length > 0) && (
        <p className="debt-totals">
          {toMe.length > 0 && (
            <span className="in">
              {toMe.length === 1 ? "1 pessoa te deve" : `${toMe.length} pessoas te devem`} <strong>{money(sum(toMe))}</strong>
            </span>
          )}
          {fromMe.length > 0 && (
            <span className="out">
              Você deve a {fromMe.length === 1 ? "1 pessoa" : `${fromMe.length} pessoas`} <strong>{money(sum(fromMe))}</strong>
            </span>
          )}
        </p>
      )}
      {lines.length >= SEARCH_FROM && (
        <label className="debt-search">
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa nas dívidas" />
        </label>
      )}
      <div className="rows">
        {shown.map((d) => (
          <div key={d.fromId + d.toId} className={`row debt-row ${d.toId === me ? "in" : d.fromId === me ? "out" : ""}`}>
            <span className="debt-people" aria-hidden>
              {face(d.fromId)}
              <ArrowRight size={14} strokeWidth={1.8} className="debt-arrow" />
              <span className="debt-to">{face(d.toId)}</span>
            </span>
            <p className="grow title">
              {sentence(d)} <span className="debt-amount">{money(d.amountCents)}</span>
            </p>
            <Link
              className="btn small"
              href={`/transacoes/nova?acerto=${d.fromId}.${d.toId}.${d.amountCents}`}
              aria-label={`Registrar pagamento de ${name(d.fromId)} para ${name(d.toId)}`}
            >
              <span className="long">Registrar pagamento</span>
              {/* No celular, curto: quem recebe vê "Recebi"; quem deve, "Paguei". */}
              <span className="short">{d.toId === me ? "Recebi" : d.fromId === me ? "Paguei" : "Registrar"}</span>
            </Link>
          </div>
        ))}
        {q && found.length === 0 && <p className="faint debt-none">Ninguém com esse nome nas dívidas.</p>}
      </div>
      {!q && found.length > SHOW && (
        <button type="button" className="btn small ghost debt-more" onClick={() => setAll((x) => !x)} aria-expanded={all}>
          {all ? "Mostrar menos" : `Ver mais ${found.length - SHOW} ${found.length - SHOW === 1 ? "pessoa" : "pessoas"}`}
        </button>
      )}
    </>
  );
}
