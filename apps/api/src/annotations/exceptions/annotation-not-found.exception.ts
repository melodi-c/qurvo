import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class AnnotationNotFoundException extends AppNotFoundException {
  constructor(message = 'Annotation not found') {
    super(message);
    this.name = 'AnnotationNotFoundException';
  }
}
