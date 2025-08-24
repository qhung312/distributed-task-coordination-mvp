export class SplitBrainError extends Error {
  public readonly name = SplitBrainError.name;

  constructor(message?: string) {
    super(message);
    this.message = message ?? 'Split brain detected';
  }
}
