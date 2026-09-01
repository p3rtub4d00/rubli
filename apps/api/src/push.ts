import { getDatabase } from './store/database.js';

export interface PushRecipient {
  userId: string;
  role?: string;
  token: string;
  updatedAt: string;
}

const collectionName = 'push_tokens';
const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

export async function registerPushToken(userId: string, token: string, role?: string) {
  const db = await getDatabase();
  if (!db) return;
  await db.collection<PushRecipient>(collectionName).updateOne(
    { userId, token },
    { $set: { userId, token, role, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
}

export async function removePushToken(userId: string, token: string) {
  const db = await getDatabase();
  if (!db) return;
  await db.collection<PushRecipient>(collectionName).deleteOne({ userId, token });
}

export async function sendPushToUsers(
  userIds: string[],
  notification: { title: string; body: string; data?: Record<string, unknown> },
) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  const db = await getDatabase();
  if (!db) return;

  const recipients = await db.collection<PushRecipient>(collectionName)
    .find({ userId: { $in: ids } })
    .toArray();
  if (recipients.length === 0) return;

  const messages = recipients.map((recipient) => ({
    to: recipient.token,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {},
    channelId: 'service-opportunities',
  }));

  try {
    await fetch(expoPushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch {
    // Push failure must never break the main Rubli operation.
  }
}

export async function sendPushToRoles(
  roles: string[],
  notification: { title: string; body: string; data?: Record<string, unknown> },
) {
  const db = await getDatabase();
  if (!db) return;
  const recipients = await db.collection<PushRecipient>(collectionName)
    .find({ role: { $in: roles } })
    .toArray();
  await sendPushToUsers(recipients.map((recipient) => recipient.userId), notification);
}
