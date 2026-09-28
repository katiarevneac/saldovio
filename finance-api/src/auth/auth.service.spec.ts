import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  const testEmail = `auth-prisma-test-${Date.now()}@example.com`;
  const password = 'correct-password-123';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, PrismaService],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);

    await prisma.user.create({
      data: { email: testEmail, passwordHash: await bcrypt.hash(password, 10) },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  it('logs in with correct credentials', async () => {
    const result = await service.login({ email: testEmail, password });
    expect(result.email).toBe(testEmail);
  });

  it('includes the current sessionVersion in a successful login response', async () => {
    const result = await service.login({ email: testEmail, password });
    expect(result.sessionVersion).toBe(0);

    await prisma.user.update({ where: { email: testEmail }, data: { sessionVersion: 3 } });
    const resultAfterBump = await service.login({ email: testEmail, password });
    expect(resultAfterBump.sessionVersion).toBe(3);
  });

  it('rejects a wrong password with the same message as an unknown email', async () => {
    await expect(service.login({ email: testEmail, password: 'wrong' })).rejects.toThrow(
      'Invalid credentials',
    );
    await expect(
      service.login({ email: 'nobody-here@example.com', password: 'anything' }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('compares against a real bcrypt hash even when the email does not exist, so response time does not leak which emails are registered', async () => {
    // AuthService.login must call bcrypt.compare (or an equivalent-cost
    // operation) on the unknown-email path too, not short-circuit
    // straight to the UnauthorizedException — otherwise a missing user
    // returns near-instantly while a wrong password takes a real bcrypt
    // round, and the difference is measurable.
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    await expect(
      service.login({ email: 'definitely-not-registered@example.com', password: 'anything' }),
    ).rejects.toThrow('Invalid credentials');
    expect(compareSpy).toHaveBeenCalled();
  });
});
