export class InsightNotFoundException extends Error {
  constructor(message = 'Insight not found') {
    super(message);
    this.name = 'InsightNotFoundException';
  }
}
