import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env');
const adminToken = process.env.ADMIN_TOKEN || '';

// Helper: parse .env file into key/value object
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function GET() {
  // Simple auth
  const token = (process.env.NEXT_PUBLIC_ADMIN_TOKEN as string) ?? '';
  if (token !== adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!fs.existsSync(envPath)) {
    return NextResponse.json({ error: '.env not found' }, { status: 404 });
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = parseEnv(content);
  // Return only the allowed keys
  const allowed = [
    'DATABASE_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_API_URL',
    'SECRET_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ADMIN_ID',
    'TELEGRAM_WEBHOOK_SECRET',
  ];
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (env[key] !== undefined) data[key] = env[key];
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  // Simple auth via header
  const authHeader = request.headers.get('x-admin-token') ?? '';
  if (authHeader !== adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const allowed = [
    'DATABASE_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_API_URL',
    'SECRET_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ADMIN_ID',
    'TELEGRAM_WEBHOOK_SECRET',
  ];
  const updates: Record<string, string> = {};
  for (const key of allowed) {
    if (typeof (body as any)[key] === 'string') {
      updates[key] = (body as any)[key];
    }
  }
  // Read existing .env (or create empty)
  let existing = '';
  if (fs.existsSync(envPath)) {
    existing = fs.readFileSync(envPath, 'utf-8');
  }
  const envObj = parseEnv(existing);
  // Apply updates
  for (const [k, v] of Object.entries(updates)) {
    envObj[k] = v;
  }
  // Serialize back to .env format
  const lines: string[] = [];
  // Preserve comments and unknown vars by appending them after known keys
  for (const key of allowed) {
    if (envObj[key] !== undefined) {
      lines.push(`${key}="${envObj[key]}"`);
    }
  }
  // Append any other existing keys not in allowed list
  for (const [k, v] of Object.entries(envObj)) {
    if (!allowed.includes(k)) {
      lines.push(`${k}="${v}"`);
    }
  }
  const newContent = lines.join('\n') + '\n';
  fs.writeFileSync(envPath, newContent, { encoding: 'utf-8' });
  return NextResponse.json({ success: true });
}
