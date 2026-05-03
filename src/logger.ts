const ts = () => new Date().toISOString();

export const log   = (...args: unknown[]) => console.log(ts(), ...args);
export const warn  = (...args: unknown[]) => console.warn(ts(), ...args);
export const error = (...args: unknown[]) => console.error(ts(), ...args);
