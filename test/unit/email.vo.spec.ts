import { Email } from '../../src/customer/domain/value-objects/email.vo';

describe('Email Value Object', () => {
  it('should create a valid email', () => {
    const email = new Email('Test@Example.DE');
    expect(email.value).toBe('test@example.de');
  });

  it('should normalize email to lowercase and trim whitespace', () => {
    const email = new Email('  Max.Mustermann@Example.DE  ');
    expect(email.value).toBe('max.mustermann@example.de');
  });

  it('should throw for invalid email format', () => {
    expect(() => new Email('not-an-email')).toThrow('Invalid email format');
    expect(() => new Email('')).toThrow('Invalid email format');
    expect(() => new Email('missing@domain')).toThrow('Invalid email format');
    expect(() => new Email('@no-local.com')).toThrow('Invalid email format');
  });

  it('should correctly compare two equal emails', () => {
    const a = new Email('test@example.de');
    const b = new Email('TEST@EXAMPLE.DE');
    expect(a.equals(b)).toBe(true);
  });

  it('should correctly compare two different emails', () => {
    const a = new Email('a@example.de');
    const b = new Email('b@example.de');
    expect(a.equals(b)).toBe(false);
  });

  describe('isValid static method', () => {
    it('should return true for valid emails', () => {
      expect(Email.isValid('user@domain.com')).toBe(true);
      expect(Email.isValid('user.name@domain.co.uk')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(Email.isValid('')).toBe(false);
      expect(Email.isValid('invalid')).toBe(false);
      expect(Email.isValid('missing@')).toBe(false);
      expect(Email.isValid('@domain.com')).toBe(false);
    });
  });
});
