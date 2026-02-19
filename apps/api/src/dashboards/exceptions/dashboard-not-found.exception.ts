export class DashboardNotFoundException extends Error {
  constructor(message = 'Dashboard not found') {
    super(message);
    this.name = 'DashboardNotFoundException';
  }
}
