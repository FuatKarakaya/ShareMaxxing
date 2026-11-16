import request from 'supertest';
import { createApp } from '../src/app';

const FRONTEND = 'https://sharemaxxing-web.onrender.com';

afterEach(() => {
  delete process.env.FRONTEND_ORIGIN;
  delete process.env.TRUST_PROXY_HOPS;
});

describe('live-site settings', () => {
  it('sends no CORS headers and does not trust proxies by default', async () => {
    const app = createApp();
    const response = await request(app).get('/health').set('Origin', FRONTEND);
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(app.get('trust proxy')).toBe(false);
  });

  it('answers the browser preflight for the configured frontend', async () => {
    process.env.FRONTEND_ORIGIN = FRONTEND;
    const response = await request(createApp())
      .options('/api/bookings')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(FRONTEND);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('allows normal requests from the configured frontend only', async () => {
    process.env.FRONTEND_ORIGIN = FRONTEND;
    const app = createApp();
    const allowed = await request(app).get('/health').set('Origin', FRONTEND);
    expect(allowed.headers['access-control-allow-origin']).toBe(FRONTEND);
    const other = await request(app).get('/health').set('Origin', 'https://example.com');
    expect(other.status).toBe(200);
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app).options('/api/bookings').set('Origin', 'https://example.com');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('reads the client address from the proxy header when TRUST_PROXY_HOPS is set', async () => {
    process.env.TRUST_PROXY_HOPS = '1';
    expect(createApp().get('trust proxy')).toBe(1);
  });
});
