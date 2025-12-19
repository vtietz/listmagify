/**
 * Contact information configuration from environment variables.
 * Used in Imprint and Privacy Policy pages.
 */

export interface ContactInfo {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
}

const PLACEHOLDER_NAME = "[Your Full Name]";
const PLACEHOLDER_STREET = "[Street Address]";
const PLACEHOLDER_POSTAL = "[Postal Code]";
const PLACEHOLDER_CITY = "[City]";
const PLACEHOLDER_COUNTRY = "[Country]";
const PLACEHOLDER_EMAIL = "[your@email.com]";

/**
 * Get contact information from environment variables.
 * Falls back to placeholder text if not configured.
 */
export function getContactInfo(): ContactInfo {
  return {
    name: process.env.CONTACT_NAME || PLACEHOLDER_NAME,
    street: process.env.CONTACT_STREET || PLACEHOLDER_STREET,
    postalCode: process.env.CONTACT_POSTAL_CODE || PLACEHOLDER_POSTAL,
    city: process.env.CONTACT_CITY || PLACEHOLDER_CITY,
    country: process.env.CONTACT_COUNTRY || PLACEHOLDER_COUNTRY,
    email: process.env.CONTACT_EMAIL || PLACEHOLDER_EMAIL,
  };
}

/**
 * Check if contact info is properly configured (not using placeholders).
 */
export function isContactConfigured(): boolean {
  const info = getContactInfo();
  return (
    info.name !== PLACEHOLDER_NAME &&
    info.email !== PLACEHOLDER_EMAIL
  );
}
