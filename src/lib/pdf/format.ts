/** Pure text formatting for document headers; kept free of react-pdf so tests can import it. */

/** "https://acme.com/" reads as "acme.com" on paper. */
export function displayWebsite(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "2162616499" prints as "(216) 261-6499"; anything else is left as typed. */
export function displayPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
