import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { asciiName, getMonthReport, reportFileName } from "@/lib/report";

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
/** Com sinal: + entrada / te devem, − saída / você deve (as cores vêm da fonte). */
const BRL_SIGN = '+"R$" #,##0.00;-"R$" #,##0.00;"R$" #,##0.00';
const tone = (v: number) => (v > 0 ? GREEN : v < 0 ? RED : NAVY);
const STATUS_FILL: Record<string, string> = {
  Pago: "FFDCF5EA",
  "A acertar": "FFE0F7FB",
  "Na fatura": "FFEDE9FE",
  Recebido: "FFDCF5EA",
};

const fill = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});
const thin = (argb = LINE): Partial<ExcelJS.Borders> => ({
  bottom: { style: "thin", color: { argb } },
});

/**
 * Ajustes → Exportação → Planilha: o mês num .xlsx com a cara do extrato em PDF.
 * Resumo (cartões, faturas, dívidas e categorias com barras), Lançamentos (status em cores,
 * filtros, total) e uma aba para cada lista. Abre no Excel, Google Planilhas e Numbers.
 */
export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const month = url.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return NextResponse.json({ error: "mês inválido" }, { status: 400 });
  // ?pessoa=<id>: extrato de outra pessoa (para mandar a quem te deve e não tem login).
  const r = await getMonthReport(auth, month, url.searchParams.get("pessoa"));
  const money = (c: number) => c / 100;
  const title = r.title.replace(/^./, (c) => c.toUpperCase());
  const generated = r.generatedAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Birion Couple";
  wb.created = r.generatedAt;
  // Foto de quem é o extrato (e de quem enviou), no canto da faixa de título de cada aba.
  const face = r.subject ?? r.owner;
  const faceImg = face.photo
    ? wb.addImage({ base64: face.photo, extension: "jpeg" })
    : null;
  const ownerImg =
    r.subject && r.owner.photo
      ? wb.addImage({ base64: r.owner.photo, extension: "jpeg" })
      : null;
  const who = r.subject
    ? `Extrato de ${r.subject.name} · enviado por ${r.owner.name} (${r.family})`
    : `${r.owner.name} · ${r.family}`;

  /** Faixa de título (marinho) + linha de subtítulo, ocupando `cols` colunas. */
  const banner = (ws: ExcelJS.Worksheet, text: string, cols: number) => {
    ws.mergeCells(1, 1, 1, cols);
    const t = ws.getCell(1, 1);
    t.value = `Birion Couple - ${text} - ${face.name}`;
    t.font = { bold: true, size: 16, color: { argb: WHITE } };
    t.fill = fill(NAVY);
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 34;
    ws.mergeCells(2, 1, 2, cols);
    const sub = ws.getCell(2, 1);
    sub.value = `${who} · gerado em ${generated}${r.estimate ? " · mês à frente: valores previstos" : ""}`;
    // Foto no canto direito da faixa (a de quem enviou, menor, ao lado).
    if (faceImg !== null)
      ws.addImage(faceImg, {
        tl: { col: cols - 0.55, row: 0.08 },
        ext: { width: 38, height: 38 },
      });
    if (ownerImg !== null)
      ws.addImage(ownerImg, {
        tl: { col: cols - 0.95, row: 0.22 },
        ext: { width: 26, height: 26 },
      });
    sub.font = { italic: true, size: 10, color: { argb: MUTED } };
    sub.alignment = { indent: 1 };
    ws.getRow(2).height = 20;
    // Linha ciano embaixo do título, como no PDF.
    for (let c = 1; c <= cols; c++)
      ws.getCell(2, c).border = {
        bottom: { style: "medium", color: { argb: "FF1AC4DB" } },
      };
  };
  /** Título de uma seção (texto marinho em negrito). */
  const section = (
    ws: ExcelJS.Worksheet,
    row: number,
    text: string,
    cols: number,
  ) => {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: NAVY } };
    ws.getRow(row).height = 22;
  };
  /** Cabeçalho de tabela: fundo marinho, letra branca. */
  const head = (
    ws: ExcelJS.Worksheet,
    row: number,
    labels: string[],
    right: number[] = [],
  ) => {
    labels.forEach((l, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = l.toUpperCase();
      c.font = { bold: true, size: 9, color: { argb: WHITE } };
      c.fill = fill(NAVY);
      c.alignment = {
        vertical: "middle",
        horizontal: right.includes(i + 1) ? "right" : "left",
        indent: 1,
      };
    });
    ws.getRow(row).height = 20;
  };
  /** Uma linha de tabela com zebra e linha fina embaixo. */
  const line = (
    ws: ExcelJS.Worksheet,
    row: number,
    values: (string | number | Date | null)[],
    i: number,
    moneyCols: number[] = [],
  ) => {
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
    ws.pageSetup = {
      paperSize: 9,
      orientation: landscape ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };
    ws.headerFooter = {
      oddFooter: `&L&8Birion Couple - ${r.family}&R&8${title} - página &P de &N`,
    };
  };

  // ---------- Resumo ----------
  const res = wb.addWorksheet("Resumo", {
    properties: { tabColor: { argb: "FF1AC4DB" } },
    views: [{ showGridLines: false }],
  });
  res.columns = [
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];
  banner(res, title, 5);
  // Cartões: rótulo pequeno em cima, valor grande embaixo.
  r.cards.forEach((card, i) => {
    const col = i + 1;
    const l = res.getCell(4, col);
    l.value = card.label.toUpperCase();
    l.font = { size: 8, bold: true, color: { argb: MUTED } };
    const v = res.getCell(5, col);
    v.value = money(card.cents);
    // Com sinal (+ entra / te devem, − sai / você deve); faturas sem sinal (é o total da conta do cartão).
    v.numFmt = card.signed ? BRL_SIGN : BRL;
    v.font = {
      size: 15,
      bold: true,
      color: { argb: card.signed ? tone(card.cents) : NAVY },
    };
    for (const c of [l, v]) {
      c.fill = fill(ZEBRA);
      c.alignment = { indent: 1, vertical: "middle", wrapText: true };
      c.border = {
        left: { style: "thin", color: { argb: LINE } },
        right: { style: "thin", color: { argb: LINE } },
      };
    }
    l.border = { ...l.border, top: { style: "thin", color: { argb: LINE } } };
    v.border = {
      ...v.border,
      bottom: { style: "thin", color: { argb: LINE } },
    };
    if (card.note) {
      const n = res.getCell(6, col);
      n.value = card.note;
      n.font = {
        size: 8,
        italic: true,
        color: { argb: card.note.startsWith("+") ? GREEN : MUTED },
      };
      n.alignment = { indent: 1 };
    }
  });
  res.getRow(4).height = 24;
  res.getRow(5).height = 30;

  // Faturas (só no seu extrato: os cartões são seus)
  let row = 8;
  if (!r.subject) {
    section(res, row, "Faturas do cartão", 5);
    head(
      res,
      ++row,
      ["Cartão", "Vence", "Total", "Sua parte", "Situação"],
      [3, 4],
    );
    if (r.invoices.length === 0) {
      res.getCell(++row, 1).value = "Nenhuma fatura vence neste mês.";
      res.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
    }
    r.invoices.forEach((v, i) => {
      line(
        res,
        ++row,
        [
          v.card,
          new Date(`${v.due}T12:00:00`),
          money(v.totalCents),
          money(v.mineCents),
          v.paid ? "Paga" : "A pagar",
        ],
        i,
        [3, 4],
      );
      res.getCell(row, 2).numFmt = "dd/mm/yyyy";
      res.getCell(row, 5).font = {
        bold: true,
        color: { argb: v.paid ? GREEN : CYAN },
      };
    });
    row += 2;
  }

  // Dívidas
  section(
    res,
    row,
    r.estimate ? "Dívidas do mês (previsão)" : "Dívidas em aberto",
    5,
  );
  head(res, ++row, ["Quem", "", "Valor"], [3]);
  if (r.debts.length === 0) {
    res.getCell(++row, 1).value = "Ninguém deve nada.";
    res.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
  }
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  r.debts.forEach((d, i) => {
    line(
      res,
      ++row,
      [d.label, "", money(d.direction === "te deve" ? d.cents : -d.cents)],
      i,
      [3],
    );
    res.getCell(row, 1).font = { bold: true };
    res.getCell(row, 3).numFmt = BRL_SIGN;
    res.getCell(row, 3).font = {
      bold: true,
      color: { argb: d.direction === "te deve" ? GREEN : RED },
    };
    // De quê: cada lançamento que forma a dívida (o que abate vem com sinal de menos).
    for (const x of d.items) {
      line(
        res,
        ++row,
        [
          `   ${x.description}${x.projected ? " (todo mês, previsto)" : ""}`,
          dm(x.date),
          money(x.cents),
        ],
        i,
        [3],
      );
      res.getCell(row, 1).font = { size: 10, color: { argb: MUTED } };
      res.getCell(row, 2).font = { size: 10, color: { argb: MUTED } };
      res.getCell(row, 3).numFmt = BRL_SIGN;
      res.getCell(row, 3).font = { size: 10, color: { argb: tone(x.cents) } };
    }
  });

  // Gastos por categoria (com barra dentro da célula)
  row += 2;
  section(res, row, r.subject ? `Gastos por categoria (parte de ${r.subject.name})` : "Gastos por categoria (sua parte)", 5);
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
      rules: [
        {
          type: "dataBar",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: "FF1AC4DB" },
        } as ExcelJS.DataBarRuleType,
      ],
    });
  }
  print(res);

  // ---------- Recorrentes e Lançamentos (abas separadas, mesmas colunas) ----------
  const txSheet = (
    sheetName: string,
    list: typeof r.rows,
    totalLabel: string,
  ) => {
    const lan = wb.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    });
    const cols = [
      { h: "Data", w: 11 },
      { h: "Descrição", w: 32 },
      { h: "Tipo", w: 10 },
      { h: "Categoria", w: 16 },
      { h: "Cartão", w: 14 },
      { h: "Parcela", w: 10 },
      { h: "Quem pagou", w: 14 },
      { h: "Valor", w: 14 },
      { h: r.shareLabel, w: 14 },
      { h: "Divisão", w: 34 },
      { h: "Ainda deve", w: 26 },
      { h: "Status", w: 13 },
    ];
    lan.columns = cols.map((c) => ({ width: c.w }));
    banner(
      lan,
      `${sheetName} · ${title.replace("Extrato de ", "")}`,
      cols.length,
    );
    head(
      lan,
      4,
      cols.map((c) => c.h),
      [8, 9],
    );
    list.forEach((x, i) => {
      const n = 5 + i;
      line(
        lan,
        n,
        [
          new Date(`${x.date}T12:00:00`),
          x.description,
          x.kind,
          x.category,
          x.card,
          x.series,
          x.payer,
          money(x.sign ? x.sign * x.totalCents : x.totalCents),
          money(x.sign ? x.sign * x.myShareCents : x.myShareCents),
          x.people,
          x.owing,
          x.status,
        ],
        i,
        [8, 9],
      );
      lan.getCell(n, 1).numFmt = "dd/mm/yyyy";
      // Despesa em vermelho com −, receita em verde com +; dívida e acerto sem sinal.
      for (const col of [1, 2, 8, 9]) {
        if (!x.sign) continue;
        lan.getCell(n, col).font = {
          color: { argb: tone(x.sign) },
          bold: col === 8,
        };
      }
      if (x.sign) {
        lan.getCell(n, 8).numFmt = BRL_SIGN;
        lan.getCell(n, 9).numFmt = BRL_SIGN;
      }
      if (x.owing) lan.getCell(n, 11).font = { color: { argb: RED } };
      const st = lan.getCell(n, 12);
      st.fill = fill(STATUS_FILL[x.status] ?? CYAN_SOFT);
      st.font = { bold: true, size: 9, color: { argb: NAVY } };
      st.alignment = { horizontal: "center", vertical: "top" };
    });
    const last = 4 + list.length;
    if (list.length)
      lan.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: last, column: cols.length },
      };
    // Saldo: entradas (+) menos saídas (−). Dívida e acerto não entram (só movem entre pessoas).
    const totAll = list.reduce((a, x) => a + x.sign * x.totalCents, 0);
    const totMine = list.reduce((a, x) => a + x.sign * x.myShareCents, 0);
    const tot = last + 1;
    lan.getCell(tot, 2).value = totalLabel;
    lan.getCell(tot, 8).value = money(totAll);
    lan.getCell(tot, 9).value = money(totMine);
    for (let c = 1; c <= cols.length; c++) {
      const cell = lan.getCell(tot, c);
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.border = { top: { style: "medium", color: { argb: NAVY } } };
      if (c === 8 || c === 9) {
        cell.numFmt = BRL_SIGN;
        cell.font = {
          bold: true,
          color: { argb: tone(c === 8 ? totAll : totMine) },
        };
        cell.alignment = { horizontal: "right" };
      }
    }
    print(lan, true);
  };
  // Contas "todo mês" primeiro, numa aba só delas, para identificar fácil.
  if (r.recurring.length)
    txSheet(
      "Recorrentes",
      r.recurring,
      "Saldo das recorrentes (entradas − saídas)",
    );
  txSheet("Lançamentos", r.rows, "Saldo dos lançamentos (entradas − saídas)");

  // ---------- Categorias, Faturas, Dívidas (uma lista por aba, para filtrar e somar) ----------
  const simple = (
    name: string,
    heads: {
      h: string;
      w: number;
      money?: boolean;
      pct?: boolean;
      date?: boolean;
      /** Valor com + / − e verde / vermelho. */
      signed?: boolean;
    }[],
    data: (string | number | Date)[][],
  ) => {
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    });
    ws.columns = heads.map((h) => ({ width: h.w }));
    banner(ws, `${name} · ${title.replace("Extrato de ", "")}`, heads.length);
    head(
      ws,
      4,
      heads.map((h) => h.h),
      heads.flatMap((h, i) => (h.money || h.pct ? [i + 1] : [])),
    );
    data.forEach((vals, i) => {
      line(
        ws,
        5 + i,
        vals,
        i,
        heads.flatMap((h, k) => (h.money ? [k + 1] : [])),
      );
      heads.forEach((h, k) => {
        if (h.pct) {
          ws.getCell(5 + i, k + 1).numFmt = "0%";
          ws.getCell(5 + i, k + 1).alignment = { horizontal: "right" };
        }
        if (h.date) ws.getCell(5 + i, k + 1).numFmt = "dd/mm/yyyy";
        if (h.signed && typeof vals[k] === "number") {
          const cell = ws.getCell(5 + i, k + 1);
          cell.numFmt = BRL_SIGN;
          cell.font = {
            bold: vals[2] === "Total",
            color: { argb: tone(vals[k] as number) },
          };
        }
      });
    });
    if (data.length)
      ws.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4 + data.length, column: heads.length },
      };
    print(ws);
    return ws;
  };
  simple(
    "Categorias",
    [
      { h: "Categoria", w: 26 },
      { h: "Valor", w: 16, money: true },
      { h: "% do mês", w: 12, pct: true },
    ],
    r.byCategory.map((c) => [c.name, money(c.cents), c.pct]),
  );
  if (!r.subject)
    simple(
      "Faturas",
      [
        { h: "Cartão", w: 20 },
        { h: "Vence", w: 12, date: true },
        { h: "Total", w: 16, money: true },
        { h: "Sua parte", w: 16, money: true },
        { h: "Situação", w: 12 },
      ],
      r.invoices.map((v) => [
        v.card,
        new Date(`${v.due}T12:00:00`),
        money(v.totalCents),
        money(v.mineCents),
        v.paid ? "Paga" : "A pagar",
      ]),
    );
  simple(
    "Dívidas",
    [
      { h: "Pessoa", w: 22 },
      { h: "Situação", w: 14 },
      { h: "De quê", w: 34 },
      { h: "Data", w: 12, date: true },
      { h: "Valor", w: 16, money: true, signed: true },
    ],
    r.debts.flatMap((d) => [
      ...d.items.map((x) => [
        d.name,
        d.label,
        `${x.description}${x.projected ? " (todo mês, previsto)" : ""}`,
        new Date(`${x.date}T12:00:00`),
        money(x.cents),
      ]),
      [
        d.name,
        d.label,
        "Total",
        "",
        money(d.direction === "te deve" ? d.cents : -d.cents),
      ],
    ]),
  );

  const fileName = reportFileName(r.title, r.subject?.name);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // "Birion - Relatório da fatura de novembro de 2026.xlsx" (com acento; versão sem acento para navegadores antigos).
      "Content-Disposition": `attachment; filename="${asciiName(fileName)}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}.xlsx`,
      "Cache-Control": "no-store",
    },
  });
}
