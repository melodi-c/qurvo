export class ProjectAccessDeniedException extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ProjectAccessDeniedException';
  }
}
