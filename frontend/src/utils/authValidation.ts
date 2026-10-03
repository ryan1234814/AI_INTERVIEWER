/**
 * Client-side mirror of the backend auth rules in app/schemas/auth.py.
 *
 * Validating here first turns an obvious mistake into a sub-second form message
 * instead of a round-trip that comes back as a 422.
 */

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export interface SignupFields {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export const validateLogin = (
  email: string,
  password: string
): FieldErrors<{ email: string; password: string }> => {
  const errors: FieldErrors<{ email: string; password: string }> = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return errors;
};

export const validateSignup = (fields: SignupFields): FieldErrors<SignupFields> => {
  const errors: FieldErrors<SignupFields> = {};
  const { name, email, password, confirmPassword } = fields;

  if (!name.trim()) errors.name = 'Name is required';
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  } else if (new TextEncoder().encode(password).length > 72) {
    // bcrypt silently discards bytes past 72, so a long-but-"valid" password
    // would hash differently than the user expects. Reject it outright.
    errors.password = 'Password must be 72 bytes or fewer';
  }
  if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';

  return errors;
};
