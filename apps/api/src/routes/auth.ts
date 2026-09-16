import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import type { ProviderPlan, User, UserRole } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';

const scrypt = promisify(scryptCallback);
type AuthUser = { user: User; email: string; passwordHash: string };
const memoryAuthUsers: AuthUser[] = [];

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
async function userById(userId: string) { const db = await getDatabase(); if (db) return db.collection<User>('users').findOne({ id: userId }); return memoryStore.users.find((item) => item.id === userId) ?? null; }

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/v1/auth/session/:id', async (request) => ({ active: Boolean(await userById(request.params.id)) }));

  app.post<{ Body: { name?: string; phone?: string; email?: string; password?: string; role?: UserRole; providerPlan?: ProviderPlan; taxDocument?: string; taxDocumentType?: 'cpf' | 'cnpj'; businessName?: string; issuesInvoice?: boolean; professionalTitle?: string } }>('/api/v1/auth/register', async (request, reply) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const phone = digits(body.phone); const document = digits(body.taxDocument);
    if (!body.name?.trim() || !email || !body.password || !body.role || !phone || !document || !['customer', 'provider', 'courier'].includes(body.role)) {
      return reply.code(400).send({ error: 'INVALID_USER', message: 'Nome, telefone, documento, e-mail, senha e tipo de conta são obrigatórios.' });
    }
    if (phone.length < 10 || phone.length > 11) return reply.code(400).send({ error: 'INVALID_PHONE', message: 'Informe um telefone brasileiro válido.' });
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
      providerPlan: body.role === 'provider' ? providerPlan : undefined,
      providerSubscriptionStatus: body.role === 'provider' ? 'trialing' : undefined,
      trialEndsAt: body.role === 'provider' ? trialEndsAt : undefined,
      verificationStatus: body.role === 'provider' ? (providerPlan === 'premium_verified' ? 'pending' : 'not_requested') : undefined,
      createdAt: new Date().toISOString(),
    };
    await saveAuthUser({ user, email, passwordHash: await passwordHash(body.password) });
    return reply.code(201).send({ user, trial: body.role === 'provider' ? { days: 7, endsAt: trialEndsAt } : undefined });
  });

  app.post<{ Body: { email?: string; password?: string } }>('/api/v1/auth/login', async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password ?? '';
    const account = email ? await getAuthUser(email) : null;
    if (!account || !await passwordMatches(password, account.passwordHash)) return reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
    return { user: account.user };
  });

  app.post<{ Params: { id: string }; Body: { plan?: ProviderPlan } }>('/api/v1/providers/:id/subscription/simulate', async (request, reply) => {
    const current = await userById(request.params.id);
    const plan = request.body?.plan;
    if (!current || current.role !== 'provider') return reply.code(404).send({ error: 'PROVIDER_NOT_FOUND', message: 'Prestador não encontrado.' });
    if (plan !== 'standard' && plan !== 'premium_verified') return reply.code(400).send({ error: 'INVALID_PLAN', message: 'Plano inválido.' });
    const user: User = { ...current, providerPlan: plan, providerSubscriptionStatus: 'simulated_active', verificationStatus: plan === 'premium_verified' ? 'simulated_verified' : 'not_requested' };
    const account = await getAuthUser(normalizeEmail(user.email));
    if (!account) return reply.code(409).send({ error: 'ACCOUNT_NOT_FOUND', message: 'A conta deste prestador não possui credenciais.' });
    await saveAuthUser({ ...account, user });
    return { user, simulated: true, amount: plan === 'premium_verified' ? 69.90 : 49.90 };
  });

  app.patch<{ Params: { id: string }; Body: Partial<Pick<User, 'name' | 'bio' | 'city' | 'serviceRadiusKm' | 'serviceCategories' | 'avatarUri' | 'profilePhotos' | 'professionalTitle' | 'businessAddress'>> }>('/api/v1/users/:id/profile', async (request, reply) => {
    const current = await userById(request.params.id);
    if (!current) return reply.code(404).send({ error: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' });
    const body = request.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : current.name;
    if (name.length < 3) return reply.code(400).send({ error: 'INVALID_NAME', message: 'Informe um nome com ao menos 3 caracteres.' });
    const cleanText = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) || undefined : undefined;
    const cleanList = (value: unknown, maxItems: number, maxLength: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems) : undefined;
    const nextUser: User = {
      ...current,
      name,
      bio: cleanText(body.bio, 1200),
      city: cleanText(body.city, 120),
      avatarUri: cleanText(body.avatarUri, 2_000_000),
      profilePhotos: cleanList(body.profilePhotos, 8, 2_000_000),
      professionalTitle: current.role === 'provider' ? cleanText(body.professionalTitle, 120) : current.professionalTitle,
      businessAddress: current.role === 'provider' && current.taxDocumentType === 'cnpj' ? cleanText(body.businessAddress, 240) : undefined,
      serviceRadiusKm: current.role === 'provider' && typeof body.serviceRadiusKm === 'number' && [5, 10, 20, 50, 100].includes(body.serviceRadiusKm) ? body.serviceRadiusKm : current.serviceRadiusKm,
      serviceCategories: current.role === 'provider' ? cleanList(body.serviceCategories, 12, 80) : current.serviceCategories,
    };
    const account = await getAuthUser(normalizeEmail(current.email));
    if (!account) return reply.code(409).send({ error: 'ACCOUNT_NOT_FOUND', message: 'Credenciais da conta não encontradas.' });
    await saveAuthUser({ ...account, user: nextUser });
    return nextUser;
  });

  app.get<{ Querystring: { query?: string } }>('/api/v1/providers', async (request) => {
    const query = request.query?.query?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const db = await getDatabase();
    const all = db ? await db.collection<User>('users').find({ role: 'provider', providerPlan: 'premium_verified', verificationStatus: { $in: ['simulated_verified'] } }).toArray() : memoryStore.users.filter((user) => user.role === 'provider' && user.providerPlan === 'premium_verified' && user.verificationStatus === 'simulated_verified');
    return all.filter((user) => !query || `${user.name} ${user.city ?? ''} ${(user.serviceCategories ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query)).map((user) => ({ id: user.id, name: user.name, city: user.city, serviceCategories: user.serviceCategories ?? [], bio: user.bio, professionalTitle: user.professionalTitle, businessName: user.businessName, taxDocument: user.taxDocumentType === 'cnpj' ? user.taxDocument : undefined, taxDocumentType: user.taxDocumentType === 'cnpj' ? 'cnpj' : undefined, issuesInvoice: user.issuesInvoice, verificationStatus: user.verificationStatus }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/users/:id', async (request, reply) => {
    const user = await userById(request.params.id);
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const db = await getDatabase();
    const completedServices = user.role === 'provider'
      ? (db ? await db.collection('demands').countDocuments({ acceptedProviderId: user.id, status: 'completed' }) : memoryStore.demands.filter((demand) => demand.acceptedProviderId === user.id && demand.status === 'completed').length)
      : 0;
    return { ...user, completedServices };
  });
}
