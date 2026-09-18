import { createHmac, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { normalizeCategoryKey, type Demand, Proposal, ProviderPlan, ProviderType, ProviderVehicle, Rating, User, UserRole } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';
import { getManagedCategories } from '../store/categories.js';

const scrypt = promisify(scryptCallback);
type RefreshSession = { tokenHash: string; expiresAt: string; createdAt: string; lastUsedAt?: string };
type AuthUser = { user: User; email: string; passwordHash: string; refreshSessions?: RefreshSession[] };
const memoryAuthUsers: AuthUser[] = [];

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: User;
  }
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_LIMIT = 5;
const accessTokenSecret = process.env.AUTH_ACCESS_TOKEN_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(48).toString('base64url'));

if (!accessTokenSecret) throw new Error('AUTH_ACCESS_TOKEN_SECRET é obrigatório em produção.');
if (!process.env.AUTH_ACCESS_TOKEN_SECRET) console.warn('AUTH_ACCESS_TOKEN_SECRET não configurado; sessões serão invalidadas ao reiniciar a API de desenvolvimento.');

function id() {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEmail(value?: string) { return value?.trim().toLowerCase() ?? ''; }
function digits(value?: string) { return (value ?? '').replace(/\D/g, ''); }
function validCpf(value?: string) { const cpf = digits(value); if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false; const check = (size: number) => { const sum = cpf.slice(0, size).split('').reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0); const result = (sum * 10) % 11; return result === 10 ? 0 : result; }; return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]); }
function validCnpj(value?: string) { const cnpj = digits(value); if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false; const check = (length: number) => { let factor = length - 7; const sum = cnpj.slice(0, length).split('').reduce((total, digit) => { const next = total + Number(digit) * factor; factor = factor === 2 ? 9 : factor - 1; return next; }, 0); const result = 11 - (sum % 11); return result >= 10 ? 0 : result; }; return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]); }
async function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); const derived = await scrypt(password, salt, 64) as Buffer; return `${salt}:${derived.toString('hex')}`; }
async function passwordMatches(password: string, stored: string) { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const derived = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(hash, 'hex'); return expected.length === derived.length && timingSafeEqual(expected, derived); }
async function getAuthUser(email: string) { const db = await getDatabase(); if (db) return db.collection<AuthUser>('auth_users').findOne({ email }); return memoryAuthUsers.find((item) => item.email === email) ?? null; }
async function saveAuthUser(entry: AuthUser) { const db = await getDatabase(); if (db) { await Promise.all([db.collection<AuthUser>('auth_users').replaceOne({ email: entry.email }, entry, { upsert: true }), db.collection<User>('users').replaceOne({ id: entry.user.id }, entry.user, { upsert: true })]); return; } const index = memoryAuthUsers.findIndex((item) => item.email === entry.email); if (index >= 0) memoryAuthUsers[index] = entry; else memoryAuthUsers.push(entry); const userIndex = memoryStore.users.findIndex((item) => item.id === entry.user.id); if (userIndex >= 0) memoryStore.users[userIndex] = entry.user; else memoryStore.users.push(entry.user); }
/** Compatibilidade de leitura: não grava nem migra silenciosamente registros antigos. */
export function withLegacyProviderType(user: User | null) {
  if (!user) return null;
  if (user.role === 'courier') return { ...user, providerType: user.providerType ?? 'courier' as ProviderType };
  if (user.role === 'provider' && !user.providerType) return { ...user, providerType: 'services' as ProviderType };
  return user;
}
async function userById(userId: string) { const db = await getDatabase(); const user = db ? await db.collection<User>('users').findOne({ id: userId }) : memoryStore.users.find((item) => item.id === userId) ?? null; return withLegacyProviderType(user); }

type AccessPayload = { sub: string; role: UserRole; exp: number; iat: number };
function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function sign(value: string) { return createHmac('sha256', accessTokenSecret).update(value).digest('base64url'); }
function createAccessToken(user: User) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessPayload = { sub: user.id, role: user.role, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded)}`;
}
function readAccessToken(token: string): AccessPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AccessPayload;
    return payload.sub && payload.role && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}
export async function authenticatedUserFromToken(token?: string) {
  const payload = token ? readAccessToken(token) : null;
  if (!payload) return null;
  const user = await userById(payload.sub);
  return user && user.role === payload.role ? user : null;
}
function hashRefreshToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
async function createSession(account: AuthUser) {
  const now = new Date();
  const refreshToken = randomBytes(48).toString('base64url');
  const session: RefreshSession = { tokenHash: hashRefreshToken(refreshToken), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString() };
  const validSessions = (account.refreshSessions ?? []).filter((entry) => new Date(entry.expiresAt).getTime() > now.getTime()).slice(-(SESSION_LIMIT - 1));
  await saveAuthUser({ ...account, refreshSessions: [...validSessions, session] });
  return { accessToken: createAccessToken(account.user), refreshToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS, refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS };
}
async function revokeRefreshToken(rawToken?: string) {
  if (!rawToken) return;
  const hash = hashRefreshToken(rawToken);
  const db = await getDatabase();
  if (db) {
    await db.collection<AuthUser>('auth_users').updateOne({ 'refreshSessions.tokenHash': hash }, { $pull: { refreshSessions: { tokenHash: hash } } } as any);
    return;
  }
  const account = memoryAuthUsers.find((entry) => entry.refreshSessions?.some((session) => session.tokenHash === hash));
  if (account) await saveAuthUser({ ...account, refreshSessions: account.refreshSessions?.filter((session) => session.tokenHash !== hash) });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const user = await authenticatedUserFromToken(token);
  if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Sessão inválida, expirada ou ausente.' });
  request.authUser = user;
}
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authResult = await requireAuth(request, reply);
    if (authResult) return authResult;
    if (!request.authUser || !roles.includes(request.authUser.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seu tipo de conta não possui permissão para esta ação.' });
  };
}

type ProfessionalMetrics = {
  completedServices: number;
  averageRating?: number;
  ratingsCount: number;
  completionRate?: number;
  cancellationRate?: number;
  averageResponseMinutes?: number;
  responseSampleCount?: number;
  memberSince: string;
};

export async function professionalMetrics(user: User): Promise<ProfessionalMetrics> {
  const db = await getDatabase();
  const [providerDemands, providerProposals, ratings] = db
    ? await Promise.all([
      db.collection<Demand>('demands').find({ acceptedProviderId: user.id }).toArray(),
      db.collection<Proposal>('proposals').find({ providerId: user.id }).toArray(),
      db.collection<Rating>('ratings').find({ toUserId: user.id }).toArray(),
    ])
    : [
      memoryStore.demands.filter((demand) => demand.acceptedProviderId === user.id),
      memoryStore.proposals.filter((proposal) => proposal.providerId === user.id),
      memoryStore.ratings.filter((rating) => rating.toUserId === user.id),
    ];

  const terminalServices = providerDemands.filter((demand) => demand.status === 'completed' || demand.status === 'cancelled');
  const completedServices = providerDemands.filter((demand) => demand.status === 'completed').length;
  const cancelledServices = terminalServices.filter((demand) => demand.status === 'cancelled').length;
  const demandIds = [...new Set(providerProposals.map((proposal) => proposal.demandId))];
  const proposalDemands = db
    ? (demandIds.length ? await db.collection<Demand>('demands').find({ id: { $in: demandIds } }).toArray() : [])
    : memoryStore.demands.filter((demand) => demandIds.includes(demand.id));
  const demandById = new Map(proposalDemands.map((demand) => [demand.id, demand]));
  const firstProposalByDemand = new Map<string, Proposal>();
  providerProposals.forEach((proposal) => {
    const current = firstProposalByDemand.get(proposal.demandId);
    if (!current || proposal.createdAt < current.createdAt) firstProposalByDemand.set(proposal.demandId, proposal);
  });
  const responseMinutes = [...firstProposalByDemand.values()].flatMap((proposal) => {
    const demand = demandById.get(proposal.demandId);
    const elapsed = demand ? new Date(proposal.createdAt).getTime() - new Date(demand.createdAt).getTime() : Number.NaN;
    return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed / 60_000] : [];
  });
  const ratingsCount = ratings.length;
  const terminalCount = terminalServices.length;

  return {
    completedServices,
    ratingsCount,
    averageRating: ratingsCount ? Math.round((ratings.reduce((total, rating) => total + rating.stars, 0) / ratingsCount) * 10) / 10 : undefined,
    completionRate: terminalCount ? Math.round((completedServices / terminalCount) * 100) : undefined,
    cancellationRate: terminalCount ? Math.round((cancelledServices / terminalCount) * 100) : undefined,
    averageResponseMinutes: responseMinutes.length >= 3 ? Math.round(responseMinutes.reduce((total, minutes) => total + minutes, 0) / responseMinutes.length) : undefined,
    responseSampleCount: responseMinutes.length >= 3 ? responseMinutes.length : undefined,
    memberSince: user.createdAt,
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request) => ({ user: request.authUser! }));

  app.post<{ Body: { name?: string; phone?: string; email?: string; password?: string; role?: UserRole; providerType?: ProviderType; providerPlan?: ProviderPlan; taxDocument?: string; taxDocumentType?: 'cpf' | 'cnpj'; businessName?: string; issuesInvoice?: boolean; professionalTitle?: string } }>('/api/v1/auth/register', async (request, reply) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const phone = digits(body.phone); const document = digits(body.taxDocument);
    if (!body.name?.trim() || !email || !body.password || !body.role || !phone || !document || !['customer', 'provider'].includes(body.role)) {
      return reply.code(400).send({ error: 'INVALID_USER', message: 'Nome, telefone, documento, e-mail, senha e tipo de conta são obrigatórios.' });
    }
    if (phone.length < 10 || phone.length > 11) return reply.code(400).send({ error: 'INVALID_PHONE', message: 'Informe um telefone brasileiro válido.' });
    if (body.role === 'provider' && !['services', 'courier', 'freight'].includes(body.providerType ?? '')) return reply.code(400).send({ error: 'INVALID_PROVIDER_TYPE', message: 'Selecione a modalidade profissional.' });
    const documentType = body.role === 'provider' ? body.taxDocumentType : 'cpf';
    if (!documentType || (documentType === 'cpf' ? !validCpf(document) : !validCnpj(document))) return reply.code(400).send({ error: 'INVALID_DOCUMENT', message: `Informe um ${documentType?.toUpperCase() ?? 'CPF'} válido.` });
    if (documentType === 'cnpj' && !body.businessName?.trim()) return reply.code(400).send({ error: 'BUSINESS_NAME_REQUIRED', message: 'Informe a razão social ou nome da empresa.' });
    if (body.password.length < 8) return reply.code(400).send({ error: 'WEAK_PASSWORD', message: 'Use uma senha com ao menos 8 caracteres.' });
    if (await getAuthUser(email)) return reply.code(409).send({ error: 'EMAIL_IN_USE', message: 'Este e-mail já possui uma conta.' });
    const providerPlan = body.role === 'provider' && body.providerPlan === 'premium_verified' ? 'premium_verified' : 'standard';
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const user: User = {
      id: id(),
      name: body.name.trim(),
      phone,
      email,
      taxDocument: document,
      taxDocumentType: documentType,
      businessName: documentType === 'cnpj' ? body.businessName?.trim() : undefined,
      issuesInvoice: body.role === 'provider' ? body.issuesInvoice === true : undefined,
      professionalTitle: body.role === 'provider' ? body.professionalTitle?.trim() : undefined,
      role: body.role,
      providerType: body.role === 'provider' ? body.providerType : undefined,
      providerPlan: body.role === 'provider' ? providerPlan : undefined,
      providerSubscriptionStatus: body.role === 'provider' ? 'trialing' : undefined,
      trialEndsAt: body.role === 'provider' ? trialEndsAt : undefined,
      verificationStatus: body.role === 'provider' ? (providerPlan === 'premium_verified' ? 'pending' : 'not_requested') : undefined,
      isAvailable: body.role === 'provider' ? true : undefined,
      createdAt: new Date().toISOString(),
    };
    const account = { user, email, passwordHash: await passwordHash(body.password) };
    await saveAuthUser(account);
    return reply.code(201).send({ user, ...(await createSession(account)), trial: body.role === 'provider' ? { days: 7, endsAt: trialEndsAt } : undefined });
  });

  app.post<{ Body: { email?: string; password?: string } }>('/api/v1/auth/login', async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password ?? '';
    const account = email ? await getAuthUser(email) : null;
    if (!account || !await passwordMatches(password, account.passwordHash)) return reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
    return { user: withLegacyProviderType(account.user)!, ...(await createSession(account)) };
  });

  app.post<{ Body: { refreshToken?: string } }>('/api/v1/auth/refresh', async (request, reply) => {
    const rawToken = request.body?.refreshToken;
    if (!rawToken) return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN', message: 'Token de renovação ausente.' });
    const tokenHash = hashRefreshToken(rawToken);
    const db = await getDatabase();
    const account = db
      ? await db.collection<AuthUser>('auth_users').findOne({ 'refreshSessions.tokenHash': tokenHash })
      : memoryAuthUsers.find((entry) => entry.refreshSessions?.some((session) => session.tokenHash === tokenHash));
    const session = account?.refreshSessions?.find((entry) => entry.tokenHash === tokenHash);
    if (!account || !session || new Date(session.expiresAt).getTime() <= Date.now()) {
      await revokeRefreshToken(rawToken);
      return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN', message: 'Sessão expirada. Entre novamente.' });
    }
    await revokeRefreshToken(rawToken);
    return { user: account.user, ...(await createSession({ ...account, refreshSessions: account.refreshSessions?.filter((entry) => entry.tokenHash !== tokenHash) })) };
  });

  app.post<{ Body: { refreshToken?: string } }>('/api/v1/auth/logout', async (request, reply) => {
    await revokeRefreshToken(request.body?.refreshToken);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: { plan?: ProviderPlan } }>('/api/v1/providers/:id/subscription/simulate', { preHandler: requireRole('provider') }, async (request, reply) => {
    if (request.params.id !== request.authUser!.id) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Você só pode alterar sua própria assinatura.' });
    const current = request.authUser!;
    const plan = request.body?.plan;
    if (!current || current.role !== 'provider') return reply.code(404).send({ error: 'PROVIDER_NOT_FOUND', message: 'Prestador não encontrado.' });
    if (plan !== 'standard' && plan !== 'premium_verified') return reply.code(400).send({ error: 'INVALID_PLAN', message: 'Plano inválido.' });
    const user: User = { ...current, providerPlan: plan, providerSubscriptionStatus: 'simulated_active', verificationStatus: plan === 'premium_verified' ? 'simulated_verified' : 'not_requested' };
    const account = await getAuthUser(normalizeEmail(user.email));
    if (!account) return reply.code(409).send({ error: 'ACCOUNT_NOT_FOUND', message: 'A conta deste prestador não possui credenciais.' });
    await saveAuthUser({ ...account, user });
    return { user, simulated: true, amount: plan === 'premium_verified' ? 69.90 : 49.90 };
  });

  app.patch<{ Params: { id: string }; Body: Partial<Pick<User, 'name' | 'bio' | 'city' | 'serviceRadiusKm' | 'serviceCategories' | 'serviceLatitude' | 'serviceLongitude' | 'avatarUri' | 'profilePhotos' | 'professionalTitle' | 'businessAddress' | 'isAvailable' | 'providerType' | 'providerVehicle'>> }>('/api/v1/users/:id/profile', { preHandler: requireAuth }, async (request, reply) => {
    if (request.params.id !== request.authUser!.id) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Você só pode alterar seu próprio perfil.' });
    const current = request.authUser!;
    const body = request.body ?? {};
    const currentProviderType = current.role === 'provider' ? (current.providerType ?? 'services') : undefined;
    if (body.providerType !== undefined && body.providerType !== currentProviderType) return reply.code(400).send({ error: 'PROVIDER_TYPE_IMMUTABLE', message: 'A modalidade profissional não pode ser alterada diretamente pelo perfil.' });
    const name = typeof body.name === 'string' ? body.name.trim() : current.name;
    if (name.length < 3) return reply.code(400).send({ error: 'INVALID_NAME', message: 'Informe um nome com ao menos 3 caracteres.' });
    const cleanText = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) || undefined : undefined;
    const cleanList = (value: unknown, maxItems: number, maxLength: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems) : undefined;
    const requestedCategories = current.role === 'provider' && Array.isArray(body.serviceCategories) ? cleanList(body.serviceCategories, 30, 80) ?? [] : current.serviceCategories;
    const managedCategories = requestedCategories ? await getManagedCategories() : [];
    const requiredDemandType = currentProviderType === 'courier' ? 'delivery' : currentProviderType === 'freight' ? 'freight' : undefined;
    if (requiredDemandType && Array.isArray(body.serviceCategories)) {
      const incompatible = requestedCategories?.some((name) => {
        const category = managedCategories.find((item) => normalizeCategoryKey(item.name) === normalizeCategoryKey(name));
        return Boolean(category && category.type !== requiredDemandType);
      });
      if (incompatible) return reply.code(400).send({ error: 'CATEGORY_PROVIDER_TYPE_MISMATCH', message: 'Essa categoria não pertence à modalidade profissional selecionada.' });
    }
    const requestedVehicle = body.providerVehicle;
    let providerVehicle = current.providerVehicle;
    if (requestedVehicle !== undefined) {
      if (currentProviderType === 'services' || !requestedVehicle || typeof requestedVehicle !== 'object') return reply.code(400).send({ error: 'INVALID_PROVIDER_VEHICLE', message: 'Veículo disponível apenas para entregas ou fretes.' });
      const validVehicleTypes = currentProviderType === 'courier' ? ['motorcycle', 'bicycle', 'car'] : ['utility', 'pickup', 'van', 'small_truck', 'truck'];
      if (!validVehicleTypes.includes(requestedVehicle.type)) return reply.code(400).send({ error: 'INVALID_PROVIDER_VEHICLE', message: 'Tipo de veículo incompatível com a modalidade profissional.' });
      const cleanVehicleText = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) || undefined : undefined;
      const capacity = typeof requestedVehicle.loadCapacityKg === 'number' && Number.isFinite(requestedVehicle.loadCapacityKg) && requestedVehicle.loadCapacityKg > 0 && requestedVehicle.loadCapacityKg <= 100_000 ? Math.round(requestedVehicle.loadCapacityKg) : undefined;
      if (currentProviderType === 'freight' && !capacity) return reply.code(400).send({ error: 'LOAD_CAPACITY_REQUIRED', message: 'Informe a capacidade de carga aproximada.' });
      providerVehicle = { type: requestedVehicle.type, brand: cleanVehicleText(requestedVehicle.brand, 80), model: cleanVehicleText(requestedVehicle.model, 80), plate: cleanVehicleText(requestedVehicle.plate, 10)?.toUpperCase(), loadCapacityKg: capacity } as ProviderVehicle;
    }
    const categoryIds = [...new Set(requestedCategories?.flatMap((name) => {
      const category = managedCategories.find((item) => normalizeCategoryKey(item.name) === normalizeCategoryKey(name));
      return category ? [category.id] : [];
    }) ?? [])];
    const nextUser: User = {
      ...current,
      providerType: currentProviderType,
      providerVehicle,
      name,
      bio: typeof body.bio === 'string' ? cleanText(body.bio, 1200) : current.bio,
      city: typeof body.city === 'string' ? cleanText(body.city, 120) : current.city,
      avatarUri: typeof body.avatarUri === 'string' ? cleanText(body.avatarUri, 2_000_000) : current.avatarUri,
      profilePhotos: Array.isArray(body.profilePhotos) ? cleanList(body.profilePhotos, 8, 2_000_000) : current.profilePhotos,
      professionalTitle: current.role === 'provider' ? (typeof body.professionalTitle === 'string' ? cleanText(body.professionalTitle, 120) : current.professionalTitle) : current.professionalTitle,
      businessAddress: current.role === 'provider' && current.taxDocumentType === 'cnpj' ? (typeof body.businessAddress === 'string' ? cleanText(body.businessAddress, 240) : current.businessAddress) : undefined,
      serviceRadiusKm: current.role === 'provider' && typeof body.serviceRadiusKm === 'number' && [5, 10, 20, 50, 100].includes(body.serviceRadiusKm) ? body.serviceRadiusKm : current.serviceRadiusKm,
      // O catálogo pode crescer com áreas criadas pelos próprios prestadores.
      // O limite anterior de 12 descartava silenciosamente a nova área quando
      // o profissional já tinha marcado as opções predefinidas.
      serviceCategories: current.role === 'provider' ? requestedCategories : current.serviceCategories,
      serviceCategoryIds: current.role === 'provider' ? (Array.isArray(body.serviceCategories) ? categoryIds : current.serviceCategoryIds) : current.serviceCategoryIds,
      serviceLatitude: current.role === 'provider' && typeof body.serviceLatitude === 'number' && Number.isFinite(body.serviceLatitude) && body.serviceLatitude >= -90 && body.serviceLatitude <= 90 ? body.serviceLatitude : current.serviceLatitude,
      serviceLongitude: current.role === 'provider' && typeof body.serviceLongitude === 'number' && Number.isFinite(body.serviceLongitude) && body.serviceLongitude >= -180 && body.serviceLongitude <= 180 ? body.serviceLongitude : current.serviceLongitude,
      isAvailable: current.role === 'provider' ? (typeof body.isAvailable === 'boolean' ? body.isAvailable : current.isAvailable !== false) : current.isAvailable,
      availabilityUpdatedAt: current.role === 'provider' && typeof body.isAvailable === 'boolean' && body.isAvailable !== current.isAvailable ? new Date().toISOString() : current.availabilityUpdatedAt,
    };
    const account = await getAuthUser(normalizeEmail(current.email));
    if (!account) return reply.code(409).send({ error: 'ACCOUNT_NOT_FOUND', message: 'Credenciais da conta não encontradas.' });
    await saveAuthUser({ ...account, user: nextUser });
    return nextUser;
  });

  app.get<{ Querystring: { query?: string } }>('/api/v1/providers', async (request) => {
    const query = request.query?.query?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const db = await getDatabase();
    const all = db ? await db.collection<User>('users').find({ role: 'provider', providerPlan: 'premium_verified', verificationStatus: { $in: ['simulated_verified'] }, isAvailable: { $ne: false } }).toArray() : memoryStore.users.filter((user) => user.role === 'provider' && user.providerPlan === 'premium_verified' && user.verificationStatus === 'simulated_verified' && user.isAvailable !== false);
    return all.filter((user) => !query || `${user.name} ${user.city ?? ''} ${(user.serviceCategories ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query)).map((user) => ({ id: user.id, name: user.name, city: user.city, serviceCategories: user.serviceCategories ?? [], bio: user.bio, professionalTitle: user.professionalTitle, businessName: user.businessName, taxDocument: user.taxDocumentType === 'cnpj' ? user.taxDocument : undefined, taxDocumentType: user.taxDocumentType === 'cnpj' ? 'cnpj' : undefined, issuesInvoice: user.issuesInvoice, verificationStatus: user.verificationStatus }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/users/:id', async (request, reply) => {
    const user = await userById(request.params.id);
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    // Coordenadas operacionais servem exclusivamente para o matching; não são
    // expostas no perfil público do profissional.
    const { serviceLatitude: _serviceLatitude, serviceLongitude: _serviceLongitude, providerVehicle, ...publicUser } = user;
    const publicVehicle = providerVehicle ? { ...providerVehicle, plate: undefined } : undefined;
    return user.role === 'provider'
      ? { ...publicUser, providerVehicle: publicVehicle, professionalMetrics: await professionalMetrics(user) }
      : publicUser;
  });
}
