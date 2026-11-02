/**
 * How a contract's order number reads on screen. An order that printed none
 * has none (uw_contracts.contract_identifier is null, 2026-09-30) — the
 * screens say so rather than inventing one.
 */
export const NO_ORDER_NUMBER = "No order number";

export function orderNumberLabel(identifier: string | null | undefined): string {
  const trimmed = identifier?.trim() ?? "";
  return trimmed === "" ? NO_ORDER_NUMBER : trimmed;
}
