/** Public messages only: never attach upstream errors or request model settings. */
export class SceneGenerationError extends Error {
  constructor(message: string, readonly statusCode: 400 | 409 | 500 | 502) {
    super(message);
    this.name = "SceneGenerationError";
  }
}
