import Decimal from "decimal.js";
export const D = (v: Decimal.Value | { toString(): string }) =>
  new Decimal(v.toString());
export const money = (v: Decimal.Value | { toString(): string }) =>
  D(v).toDecimalPlaces(6).toFixed(6);
export type OfferLine = {
  offeredQuantity: Decimal.Value | { toString(): string };
  packFactor: Decimal.Value | { toString(): string };
  unitPrice: Decimal.Value | { toString(): string };
  discountPercent: Decimal.Value | { toString(): string };
  taxPercent: Decimal.Value | { toString(): string };
  taxRecoverable: boolean;
  moq: Decimal.Value | { toString(): string };
  compliant: boolean;
};
export function calculateLine(
  line: OfferLine,
  baseQuantity: Decimal.Value | { toString(): string },
) {
  const factor = D(line.packFactor);
  if (factor.lte(0)) throw new Error("Pack conversion must be positive");
  const packs = D(baseQuantity).div(factor);
  const net = D(line.unitPrice)
    .times(packs)
    .times(D(1).minus(D(line.discountPercent).div(100)));
  const tax = net.times(D(line.taxPercent).div(100));
  return {
    packs,
    net,
    tax,
    payable: net.plus(tax),
    evaluation: net.plus(line.taxRecoverable ? 0 : tax),
    baseUnitPrice: D(line.unitPrice)
      .div(factor)
      .times(D(1).minus(D(line.discountPercent).div(100))),
    eligible:
      line.compliant &&
      packs.gte(D(line.moq)) &&
      D(line.offeredQuantity).times(factor).gte(D(baseQuantity)) &&
      packs.isInteger(),
  };
}
export function totals(
  lines: {
    line: OfferLine;
    quantity: Decimal.Value | { toString(): string };
  }[],
  freight: Decimal.Value | { toString(): string },
  other: Decimal.Value | { toString(): string },
  fx: Decimal.Value | { toString(): string },
) {
  const values = lines.map((l) => calculateLine(l.line, l.quantity));
  const charges = D(freight).plus(D(other));
  return {
    payable: values.reduce((n, l) => n.plus(l.payable), charges),
    evaluation: values
      .reduce((n, l) => n.plus(l.evaluation), charges)
      .times(D(fx)),
    eligible: values.every((l) => l.eligible),
  };
}
