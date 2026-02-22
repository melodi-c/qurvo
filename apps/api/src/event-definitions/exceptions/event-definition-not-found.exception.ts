export class EventDefinitionNotFoundException extends Error {
  constructor(message = 'Event definition not found') {
    super(message);
    this.name = 'EventDefinitionNotFoundException';
  }
}
