import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface TelegramConfig {
  token: string;
  adminId: string;
  secret: string;
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'telegram_config')).limit(1);
  return (row?.value as TelegramConfig) || { token: '', adminId: '', secret: '' };
}
