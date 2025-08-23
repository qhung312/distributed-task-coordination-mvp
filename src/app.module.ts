import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoordinationConfig, coordinationConfigObj } from './config';
import { CoordinationModule } from './coordination/coordination.module';
import { consistentHashing } from './coordination/lib';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [coordinationConfigObj],
    }),
    CoordinationModule.registerAsync({
      isGlobal: true,
      useFactory: ({ etcdHosts, etcdAuth }: CoordinationConfig) => ({
        etcdHosts: etcdHosts,
        etcdAuth: etcdAuth,
        taskName: 'demoTask',
        distributionStrategy: consistentHashing,
      }),
      inject: [coordinationConfigObj.KEY],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
