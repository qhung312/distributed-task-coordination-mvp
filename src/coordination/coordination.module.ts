import { ConfigurableModuleBuilder, Module } from '@nestjs/common';
import { Etcd3 } from 'etcd3';
import { DistributionService, TaskService } from './services';

export type CoordinationModuleConfig = {
  etcdHosts: string[];
  etcdAuth?: {
    username: string;
    password: string;
  };
  taskName: string;
};

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<CoordinationModuleConfig>()
    .setExtras({ isGlobal: false }, (definition, extras) => ({
      ...definition,
      isGlobal: extras.isGlobal,
    }))
    .build();

export { MODULE_OPTIONS_TOKEN as CoordinationModuleConfigToken };

@Module({
  imports: [],
  providers: [
    {
      provide: Etcd3,
      useFactory: (options: CoordinationModuleConfig) =>
        new Etcd3({
          hosts: options.etcdHosts,
          auth: options.etcdAuth,
        }),
      inject: [MODULE_OPTIONS_TOKEN],
    },
    DistributionService,
    TaskService,
  ],
})
export class CoordinationModule extends ConfigurableModuleClass {}
