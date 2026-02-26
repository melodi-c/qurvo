import { Module } from '@nestjs/common';
import { ShareTokensService } from './share-tokens.service';

@Module({
  providers: [ShareTokensService],
  exports: [ShareTokensService],
})
export class ShareTokensModule {}
