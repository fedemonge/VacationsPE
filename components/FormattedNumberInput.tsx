"use client";

import { useState, useCallback } from "react";

interface FormattedNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  step?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  prefix?: string;
}

function formatNumber(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FormattedNumberInput({
  value,
  onChange,
  className = "input-field",
  step = "0.01",
  min,
  max,
  placeholder,
  disabled,
  prefix,
}: FormattedNumberInputProps) {
  const [editing, setEditing] = useState(false);
  const [rawValue, setRawValue] = useState("");

  const handleFocus = useCallback(() => {
    setEditing(true);
    setRawValue(value ? String(value) : "");
  }, [value]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(rawValue) || 0;
    onChange(parsed);
  }, [rawValue, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawValue(e.target.value);
  }, []);

  if (editing) {
    return (
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        className={className}
        value={rawValue}
        onChange={handleChange}
        onBlur={handleBlur}
        autoFocus
        disabled={disabled}
      />
    );
  }

  return (
    <input
      type="text"
      className={className}
      value={value ? `${prefix || ""}${formatNumber(value)}` : ""}
      onFocus={handleFocus}
      readOnly
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
