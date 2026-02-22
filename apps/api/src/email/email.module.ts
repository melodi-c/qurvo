import { Global, Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.provider.interface';
import { SmtpEmailProvider } from './smtp-email.provider';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: SmtpEmailProvider,
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
