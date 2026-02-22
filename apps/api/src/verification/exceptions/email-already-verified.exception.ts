export class EmailAlreadyVerifiedException extends Error {
  constructor(message = 'Email is already verified') {
    super(message);
    this.name = 'EmailAlreadyVerifiedException';
  }
}
