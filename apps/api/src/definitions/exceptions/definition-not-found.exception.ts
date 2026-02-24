import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class DefinitionNotFoundException extends AppNotFoundException {
  constructor(type: 'event' | 'property', identifier: string) {
    super(`${type === 'event' ? 'Event' : 'Property'} definition "${identifier}" not found`);
    this.name = 'DefinitionNotFoundException';
  }
}
