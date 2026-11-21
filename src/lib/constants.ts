export const CURRENCIES = ["IDR", "MYR", "SGD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_DECIMALS: Record<string, number> = { IDR: 0, MYR: 2, SGD: 2 };

export const CATEGORIES: Record<string, string> = {
  HIJAB: "Hijab",
  MUKENA: "Mukena",
  MUKENA_TRAVELING: "Mukena traveling",
  MANSET: "Manset",
  SLEEVE: "Sleeve",
  LAINNYA: "Lainnya",
};

export const CHANNELS: Record<string, string> = {
  OFFLINE: "Toko offline",
  MARKETPLACE: "Marketplace",
  EVENT: "Pameran / event",
};

export const MARKETPLACES: Record<string, string> = {
  SHOPEE: "Shopee",
  TOKOPEDIA: "Tokopedia",
  TIKTOK: "TikTok Shop",
  LAZADA: "Lazada",
  LAINNYA: "Lainnya",
};

export const PAYMENT_METHODS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QR: "QR / e-wallet (QRIS, Touch 'n Go, DuitNow, PayNow)",
  CARD: "Kartu",
  MARKETPLACE: "Saldo marketplace",
};

export const LOCATION_TYPES: Record<string, string> = {
  WAREHOUSE: "Gudang",
  STORE: "Toko",
  EVENT: "Pameran",
  MARKETPLACE: "Stok marketplace",
};

export const WALLET_KINDS: Record<string, string> = {
  PERSON: "Dipegang orang",
  BANK: "Rekening bank",
  MARKETPLACE: "Saldo marketplace",
};

export const CASH_MOVE_TYPES: Record<string, string> = {
  DEPOSIT: "Setoran",
  EXPENSE: "Pengeluaran",
  EXCHANGE: "Tukar valas",
  TRANSFER: "Pindah dompet",
  ADJUST: "Koreksi saldo",
};

export const EXPENSE_CATEGORIES: Record<string, string> = {
  BOOTH: "Sewa booth",
  TRANSPORT: "Transport",
  AKOMODASI: "Akomodasi",
  MAKAN: "Makan",
  LAINNYA: "Lainnya",
};

export const STOCK_MOVE_TYPES: Record<string, string> = {
  IN: "Barang masuk",
  TRANSFER: "Pindah lokasi",
  SALE: "Terjual",
  VOID: "Batal jual",
  ADJUST: "Koreksi / stock opname",
};

export const COUNTRIES: Record<string, string> = { ID: "Indonesia", MY: "Malaysia", SG: "Singapura" };

export const ROLES: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", STAFF: "Staf" };
