export class SpendNotFoundException extends Error {
  constructor(message = 'Ad spend record not found') {
    super(message);
    this.name = 'SpendNotFoundException';
  }
}
