"use client";

import React, { useEffect, useState } from 'react';

interface ConfigData {
  DATABASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  SECRET_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch current config on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/admin/config', {
          headers: { 'x-admin-token': process.env.NEXT_PUBLIC_ADMIN_TOKEN || '' },
        });
        if (!res.ok) throw new Error('Failed to load config');
        const data = (await res.json()) as ConfigData;
        setConfig(data);
      } catch (e) {
        setMessage('Không thể tải cấu hình.');
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': process.env.NEXT_PUBLIC_ADMIN_TOKEN || '',
        },
        body: JSON.stringify(config),
      });
      const result = await res.json();
      if (result.success) {
        setMessage('Lưu cấu hình thành công.');
      } else {
        setMessage(result.error || 'Lỗi khi lưu cấu hình');
      }
    } catch (e) {
      setMessage('Đã có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Đang tải...</div>;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Cấu hình môi trường</h1>
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>DATABASE_URL</label>
          <input
            name="DATABASE_URL"
            type="text"
            value={config.DATABASE_URL || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>NEXT_PUBLIC_APP_URL</label>
          <input
            name="NEXT_PUBLIC_APP_URL"
            type="text"
            value={config.NEXT_PUBLIC_APP_URL || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>NEXT_PUBLIC_API_URL</label>
          <input
            name="NEXT_PUBLIC_API_URL"
            type="text"
            value={config.NEXT_PUBLIC_API_URL || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>SECRET_KEY</label>
          <input
            name="SECRET_KEY"
            type="text"
            value={config.SECRET_KEY || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>GOOGLE_CLIENT_ID</label>
          <input
            name="GOOGLE_CLIENT_ID"
            type="text"
            value={config.GOOGLE_CLIENT_ID || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>GOOGLE_CLIENT_SECRET</label>
          <input
            name="GOOGLE_CLIENT_SECRET"
            type="text"
            value={config.GOOGLE_CLIENT_SECRET || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>TELEGRAM_BOT_TOKEN</label>
          <input
            name="TELEGRAM_BOT_TOKEN"
            type="text"
            value={config.TELEGRAM_BOT_TOKEN || ''}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>
        <button type="submit" disabled={saving} style={{ marginTop: '1rem' }}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </form>
    </div>
  );
}
