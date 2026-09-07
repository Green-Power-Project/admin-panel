/** Central material list maintained by the office (requirement 55). */
export interface MaterialCatalogItem {
  id: string;
  name: string;
  materialNumber: string;
  category: string;
  unit: string;
  supplier: string;
  description: string;
  isActive: boolean;
}

/** Machine and equipment register (requirement 56). */
export interface MachineCatalogItem {
  id: string;
  name: string;
  machineNumber: string;
  type: string;
  registrationNumber: string;
  unit: string;
  isActive: boolean;
}

export const MATERIAL_UNITS = ['lfdm', 'm²', 'm³', 'hrs', 'piece', 'to'] as const;

export const MACHINE_UNITS = ['hrs', 'day', 'piece'] as const;

export interface CatalogSnapshot {
  materials: MaterialCatalogItem[];
  machines: MachineCatalogItem[];
}
