import { getDatabase } from './database.js';
import { DEMAND_CATEGORIES, type DemandType } from '@rubli/shared';

export type ManagedCategory = { id: string; type: DemandType; name: string; icon: string; active: boolean; createdAt: string; updatedAt: string };
const collection = 'categories';
const defaults: ManagedCategory[] = (Object.entries(DEMAND_CATEGORIES) as Array<[DemandType, readonly string[]]>).flatMap(([type, names]) => names.map((name) => ({ id: `${type}_${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, type, name, icon: '•', active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })));
let localCategories = [...defaults];

export async function getManagedCategories(includeInactive = false) {
  const db = await getDatabase();
  if (!db) return localCategories.filter((item) => includeInactive || item.active);
  const existing = await db.collection<ManagedCategory>(collection).find({}).toArray();
  if (!existing.length) { await db.collection<ManagedCategory>(collection).insertMany(defaults); return includeInactive ? defaults : defaults.filter((item) => item.active); }
  return existing.filter((item) => includeInactive || item.active).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export async function saveManagedCategory(category: ManagedCategory) {
  const db = await getDatabase();
  if (!db) { const index = localCategories.findIndex((item) => item.id === category.id); if (index >= 0) localCategories[index] = category; else localCategories.push(category); return category; }
  await db.collection<ManagedCategory>(collection).replaceOne({ id: category.id }, category, { upsert: true });
  return category;
}

export async function isAllowedCategory(type: DemandType, name: string) {
  return (await getManagedCategories()).some((item) => item.type === type && item.name === name);
}
