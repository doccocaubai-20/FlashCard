import { Module } from '@nestjs/common';
import { ChengyuService } from './chengyu.service';
import { ChengyuController } from './chengyu.controller';

@Module({
  controllers: [ChengyuController],
  providers: [ChengyuService],
  exports: [ChengyuService],
})
export class ChengyuModule {}
