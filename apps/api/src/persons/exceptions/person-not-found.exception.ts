export class PersonNotFoundException extends Error {
  constructor(message = 'Person not found') {
    super(message);
    this.name = 'PersonNotFoundException';
  }
}
