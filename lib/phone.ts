import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
export function normalizePhone(value: string, country: CountryCode = "NI") {
  if (!value.trim()) return "";
  const phone = parsePhoneNumberFromString(value, country);
  if (!phone || !phone.isValid())
    throw new Error("Revisa el número y el prefijo del país.");
  return phone.number as string;
}
