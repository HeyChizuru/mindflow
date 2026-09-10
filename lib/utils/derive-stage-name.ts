const MAX_NAME_LENGTH = 50;

export function deriveStageName(requirement: string): string {
  const trimmed = requirement.trim();

  if (trimmed.length <= MAX_NAME_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_NAME_LENGTH)}…`;
}
