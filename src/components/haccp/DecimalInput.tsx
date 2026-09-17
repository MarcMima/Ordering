"use client";

import { useState, type InputHTMLAttributes } from "react";

/** "36,6" → 36.6; "" → null; "3," → 3; "-" → null. */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const ALLOWED = /^-?\d*([.,]\d*)?$/;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (n: number | null) => void;
};

/**
 * Number field for HACCP temperatures. Keeps what the user types ("3," / "-" / "4.")
 * instead of re-rendering the parsed number, which swallowed the decimal separator
 * and the minus sign (feedback kitchen, 17-09). Accepts comma and dot.
 */
export function DecimalInput({ value, onValueChange, ...rest }: Props) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState<number | null>(value ?? null);
  if ((value ?? null) !== lastValue) {
    setLastValue(value ?? null);
    if (parseDecimal(text) !== (value ?? null)) setText(value == null ? "" : String(value));
  }
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        if (!ALLOWED.test(next.trim())) return;
        setText(next);
        const n = parseDecimal(next);
        setLastValue(n);
        onValueChange(n);
      }}
    />
  );
}
