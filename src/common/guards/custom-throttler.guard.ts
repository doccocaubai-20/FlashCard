import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      'Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ít phút!',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
