type CurrencySetting = {
  code: string;
  locale: string;
  maximumFractionDigits?: number;
};

// Default: Indian Rupee with Indian numbering/formatting
let current: CurrencySetting = {
  code: 'INR',
  locale: 'en-IN',
  maximumFractionDigits: 0,
};

export function getCurrency() {
  return current;
}

export function setCurrency(code: string, locale?: string, maximumFractionDigits?: number) {
  current = {
    code,
    locale: locale ?? current.locale,
    maximumFractionDigits: typeof maximumFractionDigits === 'number' ? maximumFractionDigits : current.maximumFractionDigits,
  };
}

// A small list of common currencies (code + locale suggestion) used by the picker UI.
export const CURRENCIES: { code: string; label: string; locale?: string }[] = [
  { code: 'INR', label: 'Indian Rupee (₹)', locale: 'en-IN' },
  { code: 'USD', label: 'US Dollar ($)', locale: 'en-US' },
  { code: 'EUR', label: 'Euro (€)', locale: 'en-IE' },
  { code: 'GBP', label: 'British Pound (£)', locale: 'en-GB' },
  { code: 'JPY', label: 'Japanese Yen (¥)', locale: 'ja-JP' },
  { code: 'CNY', label: 'Chinese Yuan (¥)', locale: 'zh-CN' },
  { code: 'AED', label: 'UAE Dirham (د.إ)', locale: 'ar-AE' },
  { code: 'AUD', label: 'Australian Dollar (A$)', locale: 'en-AU' },
  { code: 'CAD', label: 'Canadian Dollar (C$)', locale: 'en-CA' },
  { code: 'SGD', label: 'Singapore Dollar (S$)', locale: 'en-SG' },
  { code: 'KRW', label: 'South Korean Won (₩)', locale: 'ko-KR' },
  { code: 'NZD', label: 'New Zealand Dollar (NZ$)', locale: 'en-NZ' },
  { code: 'ZAR', label: 'South African Rand (R)', locale: 'en-ZA' },
  { code: 'BRL', label: 'Brazilian Real (R$)', locale: 'pt-BR' },
  { code: 'MXN', label: 'Mexican Peso (MX$)', locale: 'es-MX' },
  { code: 'RUB', label: 'Russian Ruble (₽)', locale: 'ru-RU' },
  { code: 'TRY', label: 'Turkish Lira (₺)', locale: 'tr-TR' },
  { code: 'NGN', label: 'Nigerian Naira (₦)', locale: 'en-NG' },
  { code: 'PKR', label: 'Pakistani Rupee (₨)', locale: 'en-PK' },
  { code: 'BDT', label: 'Bangladeshi Taka (৳)', locale: 'en-BD' },
];
