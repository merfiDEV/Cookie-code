/**
 * Заглушка для DSH/plugin runtime (плагины в Cookie Code не поддерживаются).
 * Экспортирует пустые реализации, чтобы код shell компилировался.
 */
export interface SlotSpec {
  id: string;
  pluginId?: string;
  Component?: any;
  [k: string]: any;
}
export interface SlotEntry {
  key: string;
  spec: any;
  Component?: any;
  id?: string;
  pluginId?: string;
  t?: any;
}

export function subscribeSlots(_cb: () => void): () => void {
  return () => {};
}
export function getSlotItems(_slot: string): SlotEntry[] {
  return [];
}
export function reloadDshClients(_cb?: any): Promise<void> {
  return Promise.resolve();
}
export function loadDshClients(): Promise<void> {
  return Promise.resolve();
}
