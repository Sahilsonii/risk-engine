import { createClient, RedisClientType } from 'redis';
import logger from '../logger';

let client: RedisClientType;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }) as RedisClientType;

    client.on('error',   (err) => logger.error({ err }, 'Simulator: Redis client error'));
    client.on('connect', ()    => logger.info('Simulator: Redis connection established'));

    await client.connect();
  }
  return client;
}
