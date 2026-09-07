export function isEmployeesDemoMode(): boolean {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EMPLOYEES_DEMO === 'false') {
    return false;
  }
  return true;
}
