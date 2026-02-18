const deleteLocalStorage = (key: string) => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
};

const getLocalStorage = (key: string) => {
  if (typeof window !== 'undefined') {
    const rawValue = localStorage.getItem(key);

    try {
      return rawValue ? JSON.parse(rawValue) : null;
    } catch {
      return rawValue;
    }
  }

  return null;
};

const setLocalStorage = (key: string, value: unknown) => {
  if (typeof window !== 'undefined') {
    const stringifiedValue = typeof value === 'string' ? value : JSON.stringify(value);

    localStorage.setItem(key, stringifiedValue);
  }
};

export { deleteLocalStorage, getLocalStorage, setLocalStorage };
