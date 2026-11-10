import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getMonthReport } from "@/lib/report";

export const dynamic = "force-dynamic";

const NAVY = "FF0F1D38";
const CYAN = "FF1AC4DB";
const LIGHT = "FFF1FDFE";
const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

/**
 * Ajustes → Exportação → Planilha: o mês num arquivo do Excel (.xlsx), com abas Resumo,
 * Lançamentos, Categorias, Faturas e Dívidas. Abre no Excel, Google Planilhas e Numbers.
 */
export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "mês inválido" }, { status: 400 });
  const r = await getMonthReport(auth, month);
  const money = (c: number) => c / 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = "BIRION FINANCE";
  wb.created = r.generatedAt;

  // Cabeçalho de tabela: fundo marinho, letra branca, filtro e primeira linha presa.
  const table = (ws: ExcelJS.Worksheet, headerRow: number, cols: { header: string; width: number; money?: boolean; pct?: boolean }[]) => {
    const row = ws.getRow(headerRow);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle" };
      ws.getColumn(i + 1).width = c.width;
      if (c.money) ws.getColumn(i + 1).numFmt = BRL;
      if (c.pct) ws.getColumn(i + 1).numFmt = "0.0%";
    });
    row.height = 22;
    ws.views = [{ state: "frozen", ySplit: headerRow }];
  };
  const stripe = (ws: ExcelJS.Worksheet, from: number) => {
    for (let i = from; i <= ws.rowCount; i++) if ((i - from) % 2 === 1) ws.getRow(i).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }));
  };
  const title = (ws: ExcelJS.Worksheet, text: string, cols: number) => {
    ws.mergeCells(1, 1, 1, cols);
    const c = ws.getCell(1, 1);
    c.value = text;
    c.font = { bold: true, size: 14, color: { argb: NAVY } };
    ws.getRow(1).height = 24;
    ws.mergeCells(2, 1, 2, cols);
    ws.getCell(2, 1).value = `${r.family} · gerado em ${r.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${r.estimate ? " · mês à frente: valores previstos" : ""}`;
    ws.getCell(2, 1).font = { italic: true, color: { argb: "FF64748B" } };
  };

  // Resumo
  const res = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: CYAN } } });
  title(res, `BIRION FINANCE · ${r.title}`, 2);
  table(res, 4, [
    { header: "O quê", width: 38 },
    { header: "Valor", width: 18, money: true },
  ]);
  const s = r.summary;
  res.addRows([
    ["Seus gastos no mês (sua parte)", money(s.spentCents)],
    ["Entradas", money(s.incomeCents)],
    ["Faturas do cartão a pagar (total)", money(s.invoicesCents)],
    ["Faturas do cartão: sua parte", money(s.invoicesMineCents)],
    ["As pessoas te devem", money(s.owedToMeCents)],
    ["Você deve a outras pessoas", money(s.iOweCents)],
    ["Lançamentos no mês", s.count],
  ]);
  res.getCell(`B${res.rowCount}`).numFmt = "0";
  stripe(res, 5);

  // Lançamentos
  const lan = wb.addWorksheet("Lançamentos");
  title(lan, `Lançamentos · ${r.title.replace("Extrato de ", "")}`, 12);
  table(lan, 4, [
    { header: "Data", width: 12 },
    { header: "Descrição", width: 34 },
    { header: "Tipo", width: 10 },
    { header: "Categoria", width: 18 },
    { header: "Cartão", width: 16 },
    { header: "Parcela", width: 10 },
    { header: "Quem pagou", width: 16 },
    { header: "Valor", width: 14, money: true },
    { header: "Sua parte", width: 14, money: true },
    { header: "Divisão", width: 40 },
    { header: "Ainda deve", width: 30 },
    { header: "Status", width: 14 },
  ]);
  for (const x of r.rows) {
    lan.addRow([
      new Date(`${x.date}T12:00:00`),
      x.description,
      x.kind,
      x.category,
      x.card,
      x.series,
      x.payer,
      money(x.totalCents),
      money(x.myShareCents),
      x.people,
      x.owing,
      x.status,
    ]);
  }
  lan.getColumn(1).numFmt = "dd/mm/yyyy";
  if (r.rows.length) lan.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + r.rows.length, column: 12 } };
  stripe(lan, 5);
  const desp = r.rows.filter((x) => x.kind === "Despesa");
  const totalRow = lan.addRow(["", "Total das despesas", "", "", "", "", "", money(desp.reduce((a, x) => a + x.totalCents, 0)), money(desp.reduce((a, x) => a + x.myShareCents, 0))]);
  totalRow.font = { bold: true };

  // Categorias
  const cat = wb.addWorksheet("Categorias");
  title(cat, "Gastos por categoria (sua parte)", 3);
  table(cat, 4, [
    { header: "Categoria", width: 26 },
    { header: "Valor", width: 16, money: true },
    { header: "% do mês", width: 12, pct: true },
  ]);
  for (const c of r.byCategory) cat.addRow([c.name, money(c.cents), c.pct]);
  stripe(cat, 5);

  // Faturas
  const fat = wb.addWorksheet("Faturas");
  title(fat, "Faturas do cartão que vencem no mês", 5);
  table(fat, 4, [
    { header: "Cartão", width: 20 },
    { header: "Vence", width: 12 },
    { header: "Total", width: 16, money: true },
    { header: "Sua parte", width: 16, money: true },
    { header: "Situação", width: 12 },
  ]);
  for (const v of r.invoices) fat.addRow([v.card, new Date(`${v.due}T12:00:00`), money(v.totalCents), money(v.mineCents), v.paid ? "Paga" : "A pagar"]);
  fat.getColumn(2).numFmt = "dd/mm/yyyy";
  stripe(fat, 5);

  // Dívidas
  const div = wb.addWorksheet("Dívidas");
  title(div, r.estimate ? "Dívidas do mês (previsão)" : "Dívidas em aberto", 3);
  table(div, 4, [
    { header: "Pessoa", width: 22 },
    { header: "Situação", width: 14 },
    { header: "Valor", width: 16, money: true },
  ]);
  for (const d of r.debts) div.addRow([d.name, d.direction, money(d.cents)]);
  stripe(div, 5);

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="birion-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
