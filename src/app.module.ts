import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoordinationConfig, coordinationConfigObj } from './config';
import { CoordinationModule } from './coordination/coordination.module';

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
      }),
      inject: [coordinationConfigObj.KEY],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
