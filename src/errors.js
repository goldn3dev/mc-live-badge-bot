/** An error whose message is safe and useful to show directly to a Discord user. */
export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}
