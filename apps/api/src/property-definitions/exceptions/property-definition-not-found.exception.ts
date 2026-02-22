export class PropertyDefinitionNotFoundException extends Error {
  constructor(id: string) {
    super(`Property definition ${id} not found`);
    this.name = 'PropertyDefinitionNotFoundException';
  }
}
