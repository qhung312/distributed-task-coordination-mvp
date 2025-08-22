import { ConfigType, registerAs } from '@nestjs/config';
import z from 'zod';

const coordinationConfigSchema = z.object({
  etcdHosts: z.array(z.url()).nonempty(),
  etcdAuth: z
    .object({
      username: z.string().nonempty(),
      password: z.string().nonempty(),
    })
    .optional(),
});

type CoordinationConfigType = z.infer<typeof coordinationConfigSchema>;

export const coordinationConfigObj = registerAs('coordination', () => {
  const config: CoordinationConfigType = {
    etcdHosts: (process.env.ETCD_HOSTS || '').split(','),
    etcdAuth: process.env.ETCD_USERNAME
      ? {
          username: process.env.ETCD_USERNAME,
          password: process.env.ETCD_PASSWORD || '',
        }
      : undefined,
  };
  console.log(config);

  coordinationConfigSchema.parse(config);

  return config;
});

export type CoordinationConfig = ConfigType<typeof coordinationConfigObj>;
