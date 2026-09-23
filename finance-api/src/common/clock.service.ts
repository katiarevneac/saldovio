import { Injectable } from '@nestjs/common';

// Domain services depend on this instead of calling `new Date()` directly,
// so a test can override it with a fixed date (via a TestingModule provider
// override) instead of asserting against whatever day it happens to run on.
// S00.7.
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }

  // Today's calendar date where the server is running, anchored at UTC
  // midnight for storage — same local-date reasoning as
  // serialization.ts's todayDateOnly(), but reading an injected clock
  // instead of the real one.
  today(): Date {
    const now = this.now();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }
}
