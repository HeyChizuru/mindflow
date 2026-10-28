export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

export class KnowledgeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeNotFoundError';
  }
}

export class IngestBusyError extends Error {}
export class IngestSupersededError extends Error {}
