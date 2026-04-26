import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  apns: {
    keyPath:    process.env.APNS_KEY_PATH || '',
    keyId:      process.env.APNS_KEY_ID   || '',
    teamId:     process.env.APNS_TEAM_ID  || '',
    bundleId:   process.env.APNS_BUNDLE_ID || '',
    production: process.env.NODE_ENV === 'production',
  },
  turn: {
    server: process.env.TURN_SERVER || '',
    secret: process.env.TURN_SECRET || '',
    ttl:    Number(process.env.TURN_TTL) || 3600,
  },
};
