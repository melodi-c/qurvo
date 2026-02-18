export class ProjectNotFoundException extends Error {
  constructor(message = 'Project not found') {
    super(message);
    this.name = 'ProjectNotFoundException';
  }
}
