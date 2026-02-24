export interface IPersonWriter {
  mergePersons(projectId: string, fromPersonId: string, intoPersonId: string): Promise<void>;
}

export const PERSON_WRITER = Symbol('PERSON_WRITER');
