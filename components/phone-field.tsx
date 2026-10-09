"use client";
import { useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { Input } from "./ui/input";
const names = new Intl.DisplayNames(["es"], { type: "region" });
const countries = getCountries().sort((a, b) =>
  (names.of(a) || a).localeCompare(names.of(b) || b, "es"),
);
export function PhoneField({
  value,
  onChange,
  id = "phone",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const parsed = parsePhoneNumberFromString(value, "NI");
  const [selected, setSelected] = useState<CountryCode>(
    parsed?.country || "NI",
  );
  const country = parsed?.country || selected;
  const prefix = "+" + getCountryCallingCode(country);
  const national = parsed?.nationalNumber || value.replace(/^\+\d+\s/, "");
  return (
    <div className="grid grid-cols-[minmax(130px,0.9fr)_minmax(0,1.1fr)] gap-2">
      <select
        aria-label="País del teléfono"
        value={country}
        onChange={(e) => {
          setSelected(e.target.value as CountryCode);
          onChange("");
        }}
      >
        {countries.map((code) => (
          <option key={code} value={code}>
            {names.of(code)} (+{getCountryCallingCode(code)})
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="Número de teléfono"
        value={national}
        maxLength={20}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits ? prefix + " " + digits : "");
        }}
      />
    </div>
  );
}
