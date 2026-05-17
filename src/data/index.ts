// Public DAL barrel. Components import from '@/data', never from
// '@/data/<module>' or from '@supabase/supabase-js' directly.

export * from './client';
export * from './errors';

export * as orgs from './orgs';
export * as chantiers from './chantiers';
export * as workers from './workers';
export * as attendance from './attendance';
export * as tasks from './tasks';
export * as assignments from './assignments';
export * as materiels from './materiels';
export * as suppliers from './suppliers';
export * as consumables from './consumables';
export * as payments from './payments';
export * as audit from './audit';
export * as prefs from './prefs';
export * as budget from './budget-engine';
