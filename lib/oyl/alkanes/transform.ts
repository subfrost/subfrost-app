import type { AlkaneId } from '@oyl/sdk';

export function formatAlkaneId({ block, tx }: AlkaneId): string {
  return `${block}:${tx}`;
}

export function parseAlkaneId(alkaneId: string): AlkaneId {
  const [block, tx] = alkaneId.split(':');
  if (!block || !tx) {
    throw new Error(`Invalid alkaneId format ${alkaneId}`);
  }
  return { block, tx };
}


