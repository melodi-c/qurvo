export class ProjectNameConflictException extends Error {
  constructor(message = 'Project name already taken') {
    super(message);
    this.name = 'ProjectNameConflictException';
  }
}
