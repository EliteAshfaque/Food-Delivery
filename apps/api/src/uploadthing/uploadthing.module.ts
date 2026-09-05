import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.modules';
import { UploadAuthorizationService } from './upload-authorization.service';

@Module({
  imports: [AuthModule],
  providers: [UploadAuthorizationService],
  exports: [UploadAuthorizationService],
})
export class UploadthingModule {}
