export const BRANDS = ["Darling", "MegaGrowth", "TURA", "FreshGlow", "GK"] as const;

export const STATUSES = ["Pending", "Flagged", "Approved", "Rejected"] as const;

export type BrandName = (typeof BRANDS)[number];
