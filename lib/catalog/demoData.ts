import type { CatalogSnapshot } from './types';

/** Seeded catalogues mirroring what the employee app's pickers offer. */
export function createCatalogSnapshot(): CatalogSnapshot {
  return {
    materials: [
      { id: 'mat-001', name: 'Kies 16/32', materialNumber: 'M-1001', category: 'Schüttgut', unit: 'to', supplier: 'Kieswerk Nord', description: 'Rundkorn, gewaschen', isActive: true },
      { id: 'mat-002', name: 'Splitt 2/5', materialNumber: 'M-1002', category: 'Schüttgut', unit: 'to', supplier: 'Kieswerk Nord', description: 'Brechkorn', isActive: true },
      { id: 'mat-003', name: 'Schotter 0/45', materialNumber: 'M-1003', category: 'Schüttgut', unit: 'to', supplier: 'Kieswerk Nord', description: 'Frostschutzschicht', isActive: true },
      { id: 'mat-004', name: 'Transportbeton C25/30', materialNumber: 'M-2001', category: 'Beton', unit: 'm³', supplier: 'Betonwerk Süd', description: '', isActive: true },
      { id: 'mat-005', name: 'Bordstein 100/15/30', materialNumber: 'M-3001', category: 'Betonwaren', unit: 'lfdm', supplier: 'Steinwerk Ost', description: '', isActive: true },
      { id: 'mat-006', name: 'Pflasterstein grau', materialNumber: 'M-3002', category: 'Betonwaren', unit: 'm²', supplier: 'Steinwerk Ost', description: '', isActive: true },
      { id: 'mat-007', name: 'Mutterboden', materialNumber: 'M-4001', category: 'Erdbau', unit: 'm³', supplier: '', description: 'Wiedereinbau', isActive: false },
    ],
    machines: [
      { id: 'machine-001', name: 'Bagger CAT 320', machineNumber: 'MA-001', type: 'Excavator', registrationNumber: 'GP-BA-320', unit: 'hrs', isActive: true },
      { id: 'machine-002', name: 'Radlader Volvo L60', machineNumber: 'MA-002', type: 'Wheel loader', registrationNumber: 'GP-RL-060', unit: 'hrs', isActive: true },
      { id: 'machine-003', name: 'Rüttelplatte Wacker', machineNumber: 'MA-003', type: 'Plate compactor', registrationNumber: '', unit: 'day', isActive: true },
      { id: 'machine-004', name: 'Minibagger Kubota KX', machineNumber: 'MA-004', type: 'Mini excavator', registrationNumber: 'GP-MB-019', unit: 'hrs', isActive: true },
      { id: 'machine-005', name: 'Anhänger 3.5t', machineNumber: 'MA-005', type: 'Trailer', registrationNumber: 'GP-AH-035', unit: 'day', isActive: false },
    ],
  };
}
