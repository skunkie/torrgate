// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

interface StorageRequest {
  onsuccess?: () => void;
}

interface StorageTransaction {
  abort(): void;
  objectStore(name: string): { get(key: string): StorageRequest };
  onabort?: () => void;
  oncomplete?: () => void;
}

const coordinators = new WeakMap<Map<string, string>, ReturnType<typeof createIndexedDbFake>>();

/** Shares a transaction queue between browser contexts using the same storage. */
export function browserStorageCoordinator(storage: Map<string, string>) {
  let coordinator = coordinators.get(storage);
  if (!coordinator) {
    coordinator = createIndexedDbFake();
    coordinators.set(storage, coordinator);
  }
  return coordinator;
}

function createIndexedDbFake() {
  let tail = Promise.resolve();
  const database = {
    createObjectStore: (_name: string) => {},
    transaction: (_name: string, _mode: string): StorageTransaction => {
      let isAborted = false;
      const reading: StorageRequest = {};
      const transaction: StorageTransaction = {
        abort: () => { isAborted = true; },
        objectStore: (_storeName: string) => ({ get: (_key: string) => reading }),
      };
      tail = tail.then(() => {
        reading.onsuccess?.();
        if (isAborted) transaction.onabort?.();
        else transaction.oncomplete?.();
      });
      return transaction;
    },
  };
  return {
    open: (_name: string, _version: number) => {
      const opening: { onsuccess?: () => void; onupgradeneeded?: () => void; result: typeof database } = { result: database };
      queueMicrotask(() => {
        opening.onupgradeneeded?.();
        opening.onsuccess?.();
      });
      return opening;
    },
  };
}
