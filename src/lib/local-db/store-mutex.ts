import path from "node:path";

const storeLocks = new Map<string, Promise<void>>();

export async function withStoreMutex<T>(
  storePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = path.resolve(storePath);
  const previous = storeLocks.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  storeLocks.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (storeLocks.get(key) === tail) storeLocks.delete(key);
  }
}
