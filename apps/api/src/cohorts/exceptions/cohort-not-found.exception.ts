export class CohortNotFoundException extends Error {
  constructor(message = 'Cohort not found') {
    super(message);
    this.name = 'CohortNotFoundException';
  }
}
