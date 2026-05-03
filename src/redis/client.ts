import Redis from 'ioredis';
import { config } from '../config';
import * as logger from '../logger';

const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => logger.error('[Redis] connection error:', err));

export default redis;
