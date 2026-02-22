export class Email {
  readonly value: string;

  constructor(email: string) {
    const normalized = email.toLowerCase().trim();
    if (!Email.isValid(normalized)) {
      throw new Error(`Invalid email format: ${email}`);
    }
    this.value = normalized;
  }

  static isValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
