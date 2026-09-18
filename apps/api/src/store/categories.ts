import { getDatabase } from './database.js';
import { DEMAND_CATEGORIES, normalizeCategoryKey, type DemandType } from '@rubli/shared';

export type ManagedCategory = { id: string; type: DemandType; name: string; icon: string; active: boolean; createdAt: string; updatedAt: string };
const collection = 'categories';
const defaults: ManagedCategory[] = (Object.entries(DEMAND_CATEGORIES) as Array<[DemandType, readonly string[]]>).flatMap(([type, names]) => names.map((name) => ({ id: `${type}_${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, type, name, icon: '•', active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })));
let localCategories = [...defaults];

export async function getManagedCategories(includeInactive = false) {
  const db = await getDatabase();
  if (!db) return localCategories.filter((item) => includeInactive || item.active);
  const existing = await db.collection<ManagedCategory>(collection).find({}).toArray();
  const existingIds = new Set(existing.map((item) => item.id));
  const missingDefaults = defaults.filter((item) => !existingIds.has(item.id));
  // Bancos iniciados por versões antigas podem ter somente categorias criadas
  // manualmente. Completar os padrões evita que uma categoria desapareça do app.
  if (missingDefaults.length) await db.collection<ManagedCategory>(collection).insertMany(missingDefaults);
  return [...existing, ...missingDefaults].filter((item) => includeInactive || item.active).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export async function saveManagedCategory(category: ManagedCategory) {
  const db = await getDatabase();
  if (!db) { const index = localCategories.findIndex((item) => item.id === category.id); if (index >= 0) localCategories[index] = category; else localCategories.push(category); return category; }
  await db.collection<ManagedCategory>(collection).replaceOne({ id: category.id }, category, { upsert: true });
  return category;
}

export async function isAllowedCategory(type: DemandType, name: string) {
  return Boolean(await resolveManagedCategory(type, name));
}

/** Resolve ID, nome atual ou nome legado normalizado para uma única categoria ativa. */
export async function resolveManagedCategory(type: DemandType, identity: string) {
  const key = normalizeCategoryKey(identity);
  if (!key) return null;
  const matches = (await getManagedCategories()).filter((item) => item.type === type && (item.id === identity || normalizeCategoryKey(item.name) === key));
  return matches.length === 1 ? matches[0] : null;
}

export async function createProviderCategory(type: DemandType, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 80);
  const normalized = normalizeCategoryKey(name).replace(/\s+/g, '_');
  if (name.length < 3 || !normalized) throw new Error('INVALID_CATEGORY_NAME');
  const existing = (await getManagedCategories(true)).find((item) => item.type === type && normalizeCategoryKey(item.name) === normalizeCategoryKey(name));
  if (existing) return existing;
  const now = new Date().toISOString();
  return saveManagedCategory({ id: `provider_${type}_${normalized}`, type, name, icon: '•', active: true, createdAt: now, updatedAt: now });
}
