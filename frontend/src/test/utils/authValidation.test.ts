/**
 * Auth form validation mirrors backend/app/schemas/auth.py on the client.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  SignupFields,
  validateLogin,
  validateSignup,
} from '../../utils/authValidation';

const valid: SignupFields = {
  name: 'Ryan George',
  email: 'ryan@example.com',
  password: 'password123',
  confirmPassword: 'password123',
};

const signup = (overrides: Partial<SignupFields>): SignupFields => ({
  ...valid,
  ...overrides,
});

describe('validateLogin', () => {
  it('accepts a well-formed pair', () => {
    expect(validateLogin('ryan@example.com', 'password123')).toEqual({});
  });

  it('requires a valid email and a password', () => {
    expect(validateLogin('not-an-email', 'password123').email).toBeDefined();
    expect(validateLogin('ryan@example.com', '').password).toBeDefined();
  });

  it('does not enforce length on login (existing accounts may predate the rule)', () => {
    expect(validateLogin('ryan@example.com', 'short')).toEqual({});
  });
});

describe('validateSignup', () => {
  it('accepts a complete, consistent form', () => {
    expect(validateSignup(valid)).toEqual({});
  });

  it('requires a name', () => {
    expect(validateSignup(signup({ name: '   ' })).name).toBeDefined();
  });

  it('requires a valid email', () => {
    expect(validateSignup(signup({ email: 'ryan@invalid' })).email).toBeDefined();
  });

  it(`requires a password of at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(validateSignup(signup({ password: 'short12', confirmPassword: 'short12' })).password)
      .toBeDefined();
    expect(validateSignup(signup({ password: 'perfectly12', confirmPassword: 'perfectly12' })))
      .toEqual({});
  });

  it('rejects passwords longer than bcrypt will consider (72 bytes)', () => {
    const long = 'p'.repeat(73);
    expect(validateSignup(signup({ password: long, confirmPassword: long })).password).toBeDefined();
  });

  it('catches a multibyte password that is short in chars but long in bytes', () => {
    // 37 characters, but 74 UTF-8 bytes — past what bcrypt actually hashes.
    const wide = 'ä'.repeat(37);
    expect(validateSignup(signup({ password: wide, confirmPassword: wide })).password).toBeDefined();
  });

  it('requires the confirmation to match', () => {
    expect(validateSignup(signup({ confirmPassword: 'different123' })).confirmPassword).toBeDefined();
  });
});
