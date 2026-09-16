import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Demand, Proposal, Rating, User } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';
import { getManagedCategories, saveManagedCategory, type ManagedCategory } from '../store/categories.js';
import { broadcastRealtime } from '../realtime.js';
import type { SupportTicket } from './support.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../../public/admin');
const docsDir = join(here, '../../../../docs');
const adminKey = () => process.env.RUBLI_ADMIN_KEY || (process.env.NODE_ENV === 'production' ? '' : 'rubli-admin-local');
type AdminUser = { id: string; name?: string; email?: string; phone?: string; role: string; suspended?: boolean; source: string };
async function authorize(request: FastifyRequest, reply: FastifyReply) { const key = request.headers['x-rubli-admin-key']; if (!adminKey() || key !== adminKey()) { await reply.code(401).send({ error: 'ADMIN_UNAUTHORIZED', message: 'Acesso administrativo não autorizado.' }); return false; } return true; }
async function records<T>(collection: string, fallback: T[]) { const db = await getDatabase(); return db ? db.collection(collection).find({}).toArray() as Promise<T[]> : fallback; }
async function audit(action: string, detail: Record<string, unknown>) { const item = { id: `adm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, action, detail, createdAt: new Date().toISOString() }; const db = await getDatabase(); if (db) await db.collection('admin_audit').insertOne(item); }
async function purgeCollections(names: string[]) {
  const db = await getDatabase();
  if (db) {
    const counts = await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const));
    await Promise.all(names.map((name) => db.collection(name).deleteMany({})));
    return Object.fromEntries(counts);
  }
  const memoryCounts: Record<string, number> = {};
  const memoryNames = names.filter((name): name is keyof typeof memoryStore => name in memoryStore);
  memoryNames.forEach((name) => { memoryCounts[name] = memoryStore[name].length; memoryStore[name].splice(0, memoryStore[name].length); });
  return memoryCounts;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/admin', async (_request, reply) => reply.type('text/html').send(await readFile(join(publicDir, 'index.html'), 'utf8')));
  app.get('/admin/app.js', async (_request, reply) => reply.type('application/javascript').send(await readFile(join(publicDir, 'app.js'), 'utf8')));
  app.get('/admin/app.css', async (_request, reply) => reply.type('text/css').send(await readFile(join(publicDir, 'app.css'), 'utf8')));
  app.get('/admin/modern.css', async (_request, reply) => reply.type('text/css').send(await readFile(join(publicDir, 'modern.css'), 'utf8')));
  app.get('/legal/terms', async (_request, reply) => reply.type('text/markdown; charset=utf-8').send(await readFile(join(docsDir, 'TERMOS-DE-USO.md'), 'utf8')));
  app.get('/legal/privacy', async (_request, reply) => reply.type('text/markdown; charset=utf-8').send(await readFile(join(docsDir, 'POLITICA-DE-PRIVACIDADE.md'), 'utf8')));
  app.get('/api/v1/categories', async () => getManagedCategories());
  app.get('/api/v1/admin/overview', async (request, reply) => { if (!await authorize(request, reply)) return; const [demands, proposals, ratings, users] = await Promise.all([records<Demand>('demands', memoryStore.demands), records<Proposal>('proposals', memoryStore.proposals), records<Rating>('ratings', memoryStore.ratings), records<User>('users', memoryStore.users)]); const identities = new Set([...users.map((u) => u.id), ...demands.map((d) => d.requesterId), ...proposals.map((p) => p.providerId)]); return { clients: users.filter((user) => user.role === 'customer').length, providers: users.filter((user) => user.role === 'provider').length, users: identities.size, demands: demands.length, openDemands: demands.filter((d) => ['open','negotiating'].includes(d.status)).length, completedServices: demands.filter((d) => d.status === 'completed').length, proposals: proposals.length, ratings: ratings.length }; });
  app.get('/api/v1/admin/users', async (request, reply) => { if (!await authorize(request, reply)) return; const [demands, proposals, stored, states] = await Promise.all([records<Demand>('demands', memoryStore.demands), records<Proposal>('proposals', memoryStore.proposals), records<User>('users', memoryStore.users), records<{ userId: string; suspended: boolean }>('admin_user_state', [])]); const map = new Map<string, AdminUser>(); stored.forEach((u) => map.set(u.id, { ...u, source: 'cadastro' })); demands.forEach((d) => { if (!map.has(d.requesterId)) map.set(d.requesterId, { id:d.requesterId, role:'customer', source:'demanda' }); }); proposals.forEach((p) => { if (!map.has(p.providerId)) map.set(p.providerId, { id:p.providerId, role:'provider', source:'proposta' }); }); states.forEach((s) => { const item=map.get(s.userId); if(item) item.suspended=s.suspended; }); return [...map.values()]; });
  app.get('/api/v1/admin/users/:role', async (request, reply) => { if (!await authorize(request, reply)) return; const role = (request.params as { role?: string }).role; if (role !== 'customers' && role !== 'providers') return reply.code(404).send({ error: 'NOT_FOUND' }); const [demands, proposals, stored, states] = await Promise.all([records<Demand>('demands', memoryStore.demands), records<Proposal>('proposals', memoryStore.proposals), records<User>('users', memoryStore.users), records<{ userId: string; suspended: boolean }>('admin_user_state', [])]); const stateByUser = new Map(states.map((state) => [state.userId, state])); const storedById = new Map(stored.map((user) => [user.id, user])); const isCustomer = role === 'customers'; const registeredIds = stored.filter((user) => user.role === (isCustomer ? 'customer' : 'provider')).map((user) => user.id); const legacyIds = isCustomer ? demands.map((demand) => demand.requesterId) : proposals.map((proposal) => proposal.providerId); const ids = [...new Set([...registeredIds, ...legacyIds])]; return ids.map((id) => { const user = storedById.get(id); const demandCount = demands.filter((d) => d.requesterId === id).length; const proposalCount = proposals.filter((p) => p.providerId === id).length; const completedCount = isCustomer ? demands.filter((d) => d.requesterId === id && d.status === 'completed').length : demands.filter((d) => d.acceptedProviderId === id && d.status === 'completed').length; return { ...(user ?? {}), id, name: user?.name, email: user?.email, phone: user?.phone, role: isCustomer ? 'customer' : 'provider', suspended: stateByUser.get(id)?.suspended ?? false, demandCount, proposalCount, completedCount, source: user ? 'cadastro' : (isCustomer ? 'demanda' : 'proposta') }; }); });
  app.get('/api/v1/admin/financials', async (request, reply) => { if (!await authorize(request, reply)) return; const [demands, proposals] = await Promise.all([records<Demand>('demands', memoryStore.demands), records<Proposal>('proposals', memoryStore.proposals)]); const demandById = new Map(demands.map((demand) => [demand.id, demand])); const accepted = proposals.filter((proposal) => proposal.status === 'accepted' && demandById.has(proposal.demandId)); const negotiatedValue = accepted.reduce((sum, proposal) => sum + proposal.amount, 0); const completed = accepted.filter((proposal) => demandById.get(proposal.demandId)?.status === 'completed'); const completedValue = completed.reduce((sum, proposal) => sum + proposal.amount, 0); const inProgress = accepted.filter((proposal) => { const status = demandById.get(proposal.demandId)?.status; return status && !['completed', 'cancelled'].includes(status); }); return { currency: 'BRL', negotiatedValue, completedValue, pendingValue: inProgress.reduce((sum, proposal) => sum + proposal.amount, 0), acceptedServices: accepted.length, completedServices: completed.length, paymentIntegration: false, note: 'Valores de propostas confirmadas. Não representam pagamentos recebidos enquanto o checkout não estiver integrado.' }; });
  app.patch<{ Params:{id:string}; Body:{suspended?:boolean} }>('/api/v1/admin/users/:id', async (request, reply) => { if (!await authorize(request, reply)) return; if (typeof request.body?.suspended !== 'boolean') return reply.code(400).send({ error:'INVALID_USER_STATE' }); const state={userId:request.params.id,suspended:request.body.suspended,updatedAt:new Date().toISOString()}; const db=await getDatabase(); if(db) await db.collection('admin_user_state').replaceOne({userId:state.userId},state,{upsert:true}); await audit(state.suspended?'user.suspended':'user.reactivated',{userId:state.userId}); return state; });
  app.get('/api/v1/admin/demands', async (request, reply) => { if (!await authorize(request, reply)) return; return records<Demand>('demands', memoryStore.demands); });
  app.post<{ Body: { confirmation?: string } }>('/api/v1/admin/purge/demands', async (request, reply) => {
    if (!await authorize(request, reply)) return;
    if (request.body?.confirmation !== 'EXCLUIR CHAMADOS') return reply.code(400).send({ error: 'CONFIRMATION_REQUIRED', message: 'Digite EXCLUIR CHAMADOS para confirmar esta ação.' });
    const deleted = await purgeCollections(['demands', 'proposals', 'conversations', 'messages', 'ratings']);
    await audit('data.demands_purged', { deleted });
    broadcastRealtime({ type: 'admin.data_purged', scope: 'demands', at: new Date().toISOString() });
    return { deleted };
  });
  app.post<{ Body: { confirmation?: string } }>('/api/v1/admin/purge/users', async (request, reply) => {
    if (!await authorize(request, reply)) return;
    if (request.body?.confirmation !== 'EXCLUIR USUÁRIOS') return reply.code(400).send({ error: 'CONFIRMATION_REQUIRED', message: 'Digite EXCLUIR USUÁRIOS para confirmar esta ação.' });
    const deleted = await purgeCollections(['users', 'auth_users', 'push_tokens', 'admin_user_state', 'demands', 'proposals', 'conversations', 'messages', 'ratings', 'support_tickets']);
    await audit('data.users_purged', { deleted });
    broadcastRealtime({ type: 'admin.data_purged', scope: 'users', at: new Date().toISOString() });
    return { deleted };
  });
  app.get('/api/v1/admin/proposals', async (request, reply) => { if (!await authorize(request, reply)) return; return records<Proposal>('proposals', memoryStore.proposals); });
  app.get('/api/v1/admin/ratings', async (request, reply) => { if (!await authorize(request, reply)) return; return records<Rating>('ratings', memoryStore.ratings); });
  app.get('/api/v1/admin/support/tickets', async (request, reply) => { if (!await authorize(request, reply)) return; const db = await getDatabase(); return db ? db.collection<SupportTicket>('support_tickets').find({}).sort({ createdAt: -1 }).toArray() : []; });
  app.patch<{ Params: { id: string }; Body: { status?: SupportTicket['status'] } }>('/api/v1/admin/support/tickets/:id', async (request, reply) => { if (!await authorize(request, reply)) return; const status = request.body?.status; if (!status || !['open', 'in_progress', 'resolved'].includes(status)) return reply.code(400).send({ error: 'INVALID_TICKET_STATUS' }); const db = await getDatabase(); if (!db) return reply.code(503).send({ error: 'PERSISTENCE_REQUIRED', message: 'O suporte administrativo requer o banco de dados configurado.' }); const ticket = await db.collection<SupportTicket>('support_tickets').findOne({ id: request.params.id }); if (!ticket) return reply.code(404).send({ error: 'TICKET_NOT_FOUND' }); const now = new Date().toISOString(); const next = { ...ticket, status, statusHistory: [...(ticket.statusHistory ?? [{ status: ticket.status, at: ticket.createdAt }]), { status, at: now }], updatedAt: now }; await db.collection<SupportTicket>('support_tickets').replaceOne({ id: ticket.id }, next); await audit('support.ticket_updated', { ticketId: ticket.id, status }); return next; });
  app.get('/api/v1/admin/categories', async (request, reply) => { if (!await authorize(request, reply)) return; return getManagedCategories(true); });
  app.post<{Body: Partial<ManagedCategory>}>('/api/v1/admin/categories', async (request, reply) => { if (!await authorize(request, reply)) return; const body=request.body??{}; if(!body.name?.trim() || !body.type || !['service','purchase','delivery','freight'].includes(body.type)) return reply.code(400).send({error:'INVALID_CATEGORY'}); const now=new Date().toISOString(); const category:ManagedCategory={id:body.id??`cat_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name:body.name.trim(),type:body.type,icon:body.icon?.trim()||'•',active:body.active!==false,createdAt:body.createdAt??now,updatedAt:now}; await saveManagedCategory(category); await audit('category.created',{categoryId:category.id}); return reply.code(201).send(category); });
  app.patch<{Params:{id:string};Body:Partial<ManagedCategory>}>('/api/v1/admin/categories/:id', async(request,reply)=>{if(!await authorize(request,reply))return; const found=(await getManagedCategories(true)).find((item)=>item.id===request.params.id); if(!found)return reply.code(404).send({error:'CATEGORY_NOT_FOUND'}); const next={...found,...request.body,id:found.id,createdAt:found.createdAt,updatedAt:new Date().toISOString()}; await saveManagedCategory(next); await audit('category.updated',{categoryId:next.id}); return next;});
  app.get('/api/v1/admin/audit', async(request,reply)=>{if(!await authorize(request,reply))return; return records('admin_audit',[]).then((items:any[])=>items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100));});
}
