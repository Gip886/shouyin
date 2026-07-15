import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { BatchesModule } from '../batches/batches.module';

@Module({
  imports: [BatchesModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
