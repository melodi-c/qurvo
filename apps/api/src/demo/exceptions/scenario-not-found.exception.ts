import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ScenarioNotFoundException extends AppNotFoundException {
  constructor(message = 'Demo scenario not found') {
    super(message);
    this.name = 'ScenarioNotFoundException';
  }
}
