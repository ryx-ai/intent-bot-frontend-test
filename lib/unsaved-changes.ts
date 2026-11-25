"use client";

type Listener = () => void;

let isDirtyGlobal = false;
let messageGlobal =
  "You have unsaved changes. Navigating away will discard these changes. Are you sure you want to leave?";
const listeners = new Set<Listener>();

export const unsavedChangesStore = {
  isDirty: () => isDirtyGlobal,
  getMessage: () => messageGlobal,
  setDirty: (dirty: boolean, message?: string) => {
    isDirtyGlobal = dirty;
    if (message) messageGlobal = message;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => isDirtyGlobal,
  getServerSnapshot: () => false,
};
