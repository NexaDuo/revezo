let listeners: ((t: Toast) => void)[] = [];
let nextId = 0;

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const toast = {
  success: (message: string) => emit({ id: ++nextId, message, type: 'success' }),
  error: (message: string) => emit({ id: ++nextId, message, type: 'error' }),
  info: (message: string) => emit({ id: ++nextId, message, type: 'info' })
};

function emit(t: Toast) {
  listeners.forEach(l => l(t));
}

export function subscribeToasts(listener: (t: Toast) => void) {
  listeners.push(listener);
  return () => { listeners = listeners.filter(l => l !== listener); };
}
