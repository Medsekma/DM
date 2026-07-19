export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export const clean = (value, limit = 2000) => String(value ?? '').trim().slice(0, limit);
export const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
