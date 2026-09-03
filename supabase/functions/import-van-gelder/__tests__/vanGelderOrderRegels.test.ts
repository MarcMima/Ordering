/**
 * Regressietests voor de Van Gelder aantallen-logica.
 *
 * Aanleiding: West bestelde op 2026-09-02 zeven kratten komkommer en kreeg er één,
 * omdat het aantal in de app (al in kratten) nog eens door de kratgrootte werd gedeeld.
 * Draai met `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPackSameAsVanGelderOrderUnit,
  parseVanGelderOrderUnitDivisor,
  parseVanGelderOrderUnitSuffix,
  vanGelderDispatchQtyForLine,
} from "../vanGelderOrderRegels.ts";

function line(
  quantity: number,
  pack: { size: number; size_unit: string } | null,
  orderUnit: string | null,
  orderUnitSize: number | null,
  name = "x"
) {
  return {
    quantity,
    raw_ingredient: { name },
    pack_size: pack,
    supplier_ingredient: { order_unit: orderUnit, order_unit_size: orderUnitSize },
  };
}

test("krat komkommer (12 st) tegenover KST12ST: aantal gaat ongewijzigd mee", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(7, { size: 12, size_unit: "pcs" }, "KST12ST", 12)), 7);
  assert.equal(vanGelderDispatchQtyForLine(line(1, { size: 12, size_unit: "pcs" }, "KST12ST", 12)), 1);
});

test("kist tomaat (6 kg) tegenover KST6ST (6 × 1 kg): aantal gaat ongewijzigd mee", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(2, { size: 6, size_unit: "kg" }, "KST6ST", 6)), 2);
});

test("zak uien (5 kg) tegenover ST met order_unit_size 5: aantal gaat ongewijzigd mee", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(3, { size: 5, size_unit: "kg" }, "ST", 5)), 3);
});

test("rode kool: zak 2,5 kg tegenover kist van 2 zakken (KST2ST) — wél delen", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(4, { size: 2.5, size_unit: "kg" }, "KST2ST", 2)), 2);
  assert.equal(vanGelderDispatchQtyForLine(line(2, { size: 2.5, size_unit: "kg" }, "KST2ST", 2)), 1);
  assert.equal(vanGelderDispatchQtyForLine(line(9, { size: 2.5, size_unit: "kg" }, "KST2ST", 2)), 5);
});

test("groene peper: tray 500 g tegenover KST3KG — gram wordt niet met kilo verward, wél delen", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(2, { size: 500, size_unit: "g" }, "KST3KG", 3)), 1);
  assert.equal(
    isPackSameAsVanGelderOrderUnit({ packSize: 500, packSizeUnit: "g", orderUnit: "KST3KG", divisor: 3 }),
    false
  );
});

test("zonder deler (order_unit_size 1 of leeg) verandert er niets", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(2, { size: 1, size_unit: "kg" }, "KST1KG", 1)), 2);
  assert.equal(vanGelderDispatchQtyForLine(line(3, null, "ST", null)), 3);
  assert.equal(vanGelderDispatchQtyForLine(line(3, null, null, null)), 3);
});

test("zonder pack_size blijft de oude deling staan (stuks → kratten)", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(43, null, "KST12ST", 12)), 4);
});

test("de hardgecodeerde namenlijst blijft als vangnet werken", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(5, { size: 14, size_unit: "pcs" }, "KST14ST", null, "Aubergine")), 5);
  assert.equal(vanGelderDispatchQtyForLine(line(3, null, "KST10KG", 10, "Chickpeas")), 3);
});

test("aantal wordt naar boven afgerond en is minimaal 1", () => {
  assert.equal(vanGelderDispatchQtyForLine(line(0, null, null, null)), 1);
  assert.equal(vanGelderDispatchQtyForLine(line(1.2, { size: 12, size_unit: "pcs" }, "KST12ST", 12)), 2);
});

test("parsers: deler en eenheid uit de VG-code", () => {
  assert.equal(parseVanGelderOrderUnitDivisor("KST12ST"), 12);
  assert.equal(parseVanGelderOrderUnitDivisor("KST1KG"), null);
  assert.equal(parseVanGelderOrderUnitDivisor("ST"), null);
  assert.equal(parseVanGelderOrderUnitSuffix("KST12ST"), "ST");
  assert.equal(parseVanGelderOrderUnitSuffix("KST3KG"), "KG");
  assert.equal(parseVanGelderOrderUnitSuffix("ST"), null);
});

test("vergelijking: eenheden van dezelfde familie worden omgerekend, anders op getal", () => {
  assert.equal(isPackSameAsVanGelderOrderUnit({ packSize: 12, packSizeUnit: "pcs", orderUnit: "KST12ST", divisor: 12 }), true);
  assert.equal(isPackSameAsVanGelderOrderUnit({ packSize: 6, packSizeUnit: "kg", orderUnit: "KST6ST", divisor: 6 }), true);
  assert.equal(isPackSameAsVanGelderOrderUnit({ packSize: 3000, packSizeUnit: "g", orderUnit: "KST3KG", divisor: 3 }), true);
  assert.equal(isPackSameAsVanGelderOrderUnit({ packSize: 2.5, packSizeUnit: "kg", orderUnit: "KST2ST", divisor: 2 }), false);
  assert.equal(isPackSameAsVanGelderOrderUnit({ packSize: null, orderUnit: "KST12ST", divisor: 12 }), false);
});
