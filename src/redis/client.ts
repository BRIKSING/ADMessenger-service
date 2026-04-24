import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => console.error('[Redis] connection error:', err));

export default redis;
