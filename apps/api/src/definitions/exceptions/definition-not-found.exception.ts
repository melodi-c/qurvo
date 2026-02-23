export class DefinitionNotFoundException extends Error {
  constructor(type: 'event' | 'property', identifier: string) {
    super(`${type === 'event' ? 'Event' : 'Property'} definition "${identifier}" not found`);
    this.name = 'DefinitionNotFoundException';
  }
}
