/** Linha lida de um arquivo, antes de virar transação. */
export type ParsedRow = {
  /** AAAA-MM-DD */
  date: string;
  description: string;
  /** Centavos com sinal do arquivo: negativo = saída, positivo = entrada. */
  amountCents: number;
  /** Identificador do banco (FITID no OFX), quando existe. */
  bankId?: string;
};

export type ParseIssue = { line: number; message: string };

export type ParseResult = {
  rows: ParsedRow[];
  issues: ParseIssue[];
  /** OFX: extrato de conta ou fatura de cartão de crédito. */
  statement?: "bank" | "card";
};

export type DateFormat = "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";

/** Como ler um CSV: escolhido na tela de importação e salvo como modelo. */
export type CsvMapping = {
  dateColumn: number;
  descriptionColumn: number;
  /** Coluna única de valor; use -1 quando o arquivo tiver colunas separadas de débito e crédito. */
  amountColumn: number;
  debitColumn: number;
  creditColumn: number;
  dateFormat: DateFormat;
  decimal: "," | ".";
  /** Cartão de crédito costuma listar compras como valores positivos. */
  positiveIsExpense: boolean;
  hasHeader: boolean;
};
