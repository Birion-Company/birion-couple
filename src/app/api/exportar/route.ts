import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getMonthReport } from "@/lib/report";

export const dynamic = "force-dynamic";

// Mesmas cores do extrato em PDF.
const NAVY = "FF0F1D38";
const CYAN = "FF0C8FA3";
const CYAN_SOFT = "FFE6FBFD";
const ZEBRA = "FFF6FAFC";
const LINE = "FFDBE4EB";
const MUTED = "FF64748B";
const GREEN = "FF13795B";
const RED = "FFB42343";
const WHITE = "FFFFFFFF";
const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const STATUS_FILL: Record<string, string> = { Pago: "FFDCF5EA", "A acertar": "FFE0F7FB", "Na fatura": "FFEDE9FE", Recebido: "FFDCF5EA" };

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = (argb = LINE): Partial<ExcelJS.Borders> => ({ bottom: { style: "thin", color: { argb } } });

/**
 * Ajustes → Exportação → Planilha: o mês num .xlsx com a cara do extrato em PDF.
 * Resumo (cartões, faturas, dívidas e categorias com barras), Lançamentos (status em cores,
 * filtros, total) e uma aba para cada lista. Abre no Excel, Google Planilhas e Numbers.
 */
export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "mês inválido" }, { status: 400 });
  const r = await getMonthReport(auth, month);
  const money = (c: number) => c / 100;
  const title = r.title.replace(/^./, (c) => c.toUpperCase());
  const generated = r.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const wb = new ExcelJS.Workbook();
  wb.creator = "BIRION FINANCE";
  wb.created = r.generatedAt;

  /** Faixa de título (marinho) + linha de subtítulo, ocupando `cols` colunas. */
  const banner = (ws: ExcelJS.Worksheet, text: string, cols: number) => {
    ws.mergeCells(1, 1, 1, cols);
    const t = ws.getCell(1, 1);
    t.value = `BIRION FINANCE  ·  ${text}`;
    t.font = { bold: true, size: 16, color: { argb: WHITE } };
    t.fill = fill(NAVY);
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 34;
    ws.mergeCells(2, 1, 2, cols);
    const sub = ws.getCell(2, 1);
    sub.value = `${r.family} · ${r.person} · gerado em ${generated}${r.estimate ? " · mês à frente: valores previstos" : ""}`;
    sub.font = { italic: true, size: 10, color: { argb: MUTED } };
    sub.alignment = { indent: 1 };
    ws.getRow(2).height = 20;
    // Linha ciano embaixo do título, como no PDF.
    for (let c = 1; c <= cols; c++) ws.getCell(2, c).border = { bottom: { style: "medium", color: { argb: "FF1AC4DB" } } };
  };
  /** Título de uma seção (texto marinho em negrito). */
  const section = (ws: ExcelJS.Worksheet, row: number, text: string, cols: number) => {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: NAVY } };
    ws.getRow(row).height = 22;
  };
  /** Cabeçalho de tabela: fundo marinho, letra branca. */
  const head = (ws: ExcelJS.Worksheet, row: number, labels: string[], right: number[] = []) => {
    labels.forEach((l, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = l.toUpperCase();
      c.font = { bold: true, size: 9, color: { argb: WHITE } };
      c.fill = fill(NAVY);
      c.alignment = { vertical: "middle", horizontal: right.includes(i + 1) ? "right" : "left", indent: 1 };
    });
    ws.getRow(row).height = 20;
  };
  /** Uma linha de tabela com zebra e linha fina embaixo. */
  const line = (ws: ExcelJS.Worksheet, row: number, values: (string | number | Date | null)[], i: number, moneyCols: number[] = []) => {
    values.forEach((v, k) => {
      const c = ws.getCell(row, k + 1);
      c.value = v;
      c.border = thin();
      c.alignment = { vertical: "top", indent: 1, wrapText: true };
      if (i % 2 === 1) c.fill = fill(ZEBRA);
      if (moneyCols.includes(k + 1)) {
        c.numFmt = BRL;
        c.alignment = { vertical: "top", horizontal: "right" };
      }
    });
  };
  const print = (ws: ExcelJS.Worksheet, landscape = false) => {
    ws.pageSetup = { paperSize: 9, orientation: landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: `&L&8BIRION FINANCE · ${r.family}&R&8${title} · página &P de &N` };
  };

  // ---------- Resumo ----------
  const res = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: "FF1AC4DB" } }, views: [{ showGridLines: false }] });
  res.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  banner(res, title, 5);
  // Cartões: rótulo pequeno em cima, valor grande embaixo.
  const s = r.summary;
  const cards: [string, number, string][] = [
    ["Seus gastos", s.spentCents, NAVY],
    ["Entradas", s.incomeCents, GREEN],
    ["Faturas a pagar", s.invoicesCents, NAVY],
    ["Te devem", s.owedToMeCents, GREEN],
    ["Você deve", s.iOweCents, RED],
  ];
  cards.forEach(([label, cents, color], i) => {
    const col = i + 1;
    const l = res.getCell(4, col);
    l.value = label.toUpperCase();
    l.font = { size: 8, bold: true, color: { argb: MUTED } };
    const v = res.getCell(5, col);
    v.value = money(cents);
    v.numFmt = BRL;
    v.font = { size: 15, bold: true, color: { argb: color } };
    for (const c of [l, v]) {
      c.fill = fill(ZEBRA);
      c.alignment = { indent: 1, vertical: "middle" };
      c.border = { left: { style: "thin", color: { argb: LINE } }, right: { style: "thin", color: { argb: LINE } } };
    }
    l.border = { ...l.border, top: { style: "thin", color: { argb: LINE } } };
    v.border = { ...v.border, bottom: { style: "thin", color: { argb: LINE } } };
  });
  res.getRow(4).height = 20;
  res.getRow(5).height = 30;
  if (s.invoicesMineCents !== s.invoicesCents) {
    const c = res.getCell(6, 3);
    c.value = `sua parte: R$ ${money(s.invoicesMineCents).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    c.font = { size: 8, italic: true, color: { argb: MUTED } };
    c.alignment = { indent: 1 };
  }

  // Faturas
  let row = 8;
  section(res, row, "Faturas do cartão", 5);
  head(res, ++row, ["Cartão", "Vence", "Total", "Sua parte", "Situação"], [3, 4]);
  if (r.invoices.length === 0) {
    res.getCell(++row, 1).value = "Nenhuma fatura vence neste mês.";
    res.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
  }
  r.invoices.forEach((v, i) => {
    line(res, ++row, [v.card, new Date(`${v.due}T12:00:00`), money(v.totalCents), money(v.mineCents), v.paid ? "Paga" : "A pagar"], i, [3, 4]);
    res.getCell(row, 2).numFmt = "dd/mm/yyyy";
    res.getCell(row, 5).font = { bold: true, color: { argb: v.paid ? GREEN : CYAN } };
  });

  // Dívidas
  row += 2;
  section(res, row, r.estimate ? "Dívidas do mês (previsão)" : "Dívidas em aberto", 5);
  head(res, ++row, ["Quem", "", "Valor"], [3]);
  if (r.debts.length === 0) {
    res.getCell(++row, 1).value = "Ninguém deve nada.";
    res.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
  }
  r.debts.forEach((d, i) => {
    line(res, ++row, [d.direction === "te deve" ? `${d.name} te deve` : `Você deve a ${d.name}`, "", money(d.cents)], i, [3]);
    res.getCell(row, 3).font = { bold: true, color: { argb: d.direction === "te deve" ? GREEN : RED } };
  });

  // Gastos por categoria (com barra dentro da célula)
  row += 2;
  section(res, row, "Gastos por categoria (sua parte)", 5);
  head(res, ++row, ["Categoria", "Valor", "% do mês"], [2, 3]);
  const catFrom = row + 1;
  if (r.byCategory.length === 0) {
    res.getCell(++row, 1).value = "Sem gastos neste mês.";
    res.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
  }
  r.byCategory.forEach((c, i) => {
    line(res, ++row, [c.name, money(c.cents), c.pct], i, [2]);
    res.getCell(row, 3).numFmt = "0%";
    res.getCell(row, 3).alignment = { horizontal: "right" };
  });
  if (r.byCategory.length) {
    res.addConditionalFormatting({
      ref: `B${catFrom}:B${row}`,
      rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF1AC4DB" } } as ExcelJS.DataBarRuleType],
    });
  }
  print(res);

  // ---------- Lançamentos ----------
  const lan = wb.addWorksheet("Lançamentos", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const cols = [
    { h: "Data", w: 11 },
    { h: "Descrição", w: 32 },
    { h: "Tipo", w: 10 },
    { h: "Categoria", w: 16 },
    { h: "Cartão", w: 14 },
    { h: "Parcela", w: 10 },
    { h: "Quem pagou", w: 14 },
    { h: "Valor", w: 14 },
    { h: "Sua parte", w: 14 },
    { h: "Divisão", w: 34 },
    { h: "Ainda deve", w: 26 },
    { h: "Status", w: 13 },
  ];
  lan.columns = cols.map((c) => ({ width: c.w }));
  banner(lan, `Lançamentos · ${title.replace("Extrato de ", "")}`, cols.length);
  head(lan, 4, cols.map((c) => c.h), [8, 9]);
  r.rows.forEach((x, i) => {
    const n = 5 + i;
    line(lan, n, [new Date(`${x.date}T12:00:00`), x.description, x.kind, x.category, x.card, x.series, x.payer, money(x.totalCents), money(x.myShareCents), x.people, x.owing, x.status], i, [8, 9]);
    lan.getCell(n, 1).numFmt = "dd/mm/yyyy";
    if (x.kind === "Receita") lan.getCell(n, 8).font = { color: { argb: GREEN }, bold: true };
    if (x.owing) lan.getCell(n, 11).font = { color: { argb: RED } };
    const st = lan.getCell(n, 12);
    st.fill = fill(STATUS_FILL[x.status] ?? CYAN_SOFT);
    st.font = { bold: true, size: 9, color: { argb: NAVY } };
    st.alignment = { horizontal: "center", vertical: "top" };
  });
  const last = 4 + r.rows.length;
  if (r.rows.length) lan.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: cols.length } };
  const desp = r.rows.filter((x) => x.kind === "Despesa");
  const tot = last + 1;
  lan.getCell(tot, 2).value = "Total das despesas";
  lan.getCell(tot, 8).value = money(desp.reduce((a, x) => a + x.totalCents, 0));
  lan.getCell(tot, 9).value = money(desp.reduce((a, x) => a + x.myShareCents, 0));
  for (let c = 1; c <= cols.length; c++) {
    const cell = lan.getCell(tot, c);
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.border = { top: { style: "medium", color: { argb: NAVY } } };
    if (c === 8 || c === 9) {
      cell.numFmt = BRL;
      cell.alignment = { horizontal: "right" };
    }
  }
  print(lan, true);

  // ---------- Categorias, Faturas, Dívidas (uma lista por aba, para filtrar e somar) ----------
  const simple = (name: string, heads: { h: string; w: number; money?: boolean; pct?: boolean; date?: boolean }[], data: (string | number | Date)[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    ws.columns = heads.map((h) => ({ width: h.w }));
    banner(ws, `${name} · ${title.replace("Extrato de ", "")}`, heads.length);
    head(ws, 4, heads.map((h) => h.h), heads.flatMap((h, i) => (h.money || h.pct ? [i + 1] : [])));
    data.forEach((vals, i) => {
      line(ws, 5 + i, vals, i, heads.flatMap((h, k) => (h.money ? [k + 1] : [])));
      heads.forEach((h, k) => {
        if (h.pct) {
          ws.getCell(5 + i, k + 1).numFmt = "0%";
          ws.getCell(5 + i, k + 1).alignment = { horizontal: "right" };
        }
        if (h.date) ws.getCell(5 + i, k + 1).numFmt = "dd/mm/yyyy";
      });
    });
    if (data.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + data.length, column: heads.length } };
    print(ws);
    return ws;
  };
  simple(
    "Categorias",
    [{ h: "Categoria", w: 26 }, { h: "Valor", w: 16, money: true }, { h: "% do mês", w: 12, pct: true }],
    r.byCategory.map((c) => [c.name, money(c.cents), c.pct]),
  );
  simple(
    "Faturas",
    [{ h: "Cartão", w: 20 }, { h: "Vence", w: 12, date: true }, { h: "Total", w: 16, money: true }, { h: "Sua parte", w: 16, money: true }, { h: "Situação", w: 12 }],
    r.invoices.map((v) => [v.card, new Date(`${v.due}T12:00:00`), money(v.totalCents), money(v.mineCents), v.paid ? "Paga" : "A pagar"]),
  );
  simple(
    "Dívidas",
    [{ h: "Pessoa", w: 22 }, { h: "Situação", w: 14 }, { h: "Valor", w: 16, money: true }],
    r.debts.map((d) => [d.name, d.direction, money(d.cents)]),
  );

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="birion-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
