// Define AlkaneId types locally to avoid import issues with ts-sdk
type AlkaneIdInput = { block: number | string; tx: number | string };
type AlkaneIdString = { block: string; tx: string };

export function formatAlkaneId({ block, tx }: AlkaneIdInput): string {
  return `${block}:${tx}`;
}

export function parseAlkaneId(alkaneId: string): AlkaneIdString {
  const [block, tx] = alkaneId.split(':');
  if (!block || !tx) {
    throw new Error(`Invalid alkaneId format ${alkaneId}`);
  }
  return { block, tx };
}

// Re-export the input type for other files that need it
export type AlkaneId = AlkaneIdInput;


export interface SimulateRequest {
  alkanes?: string[];
  transaction?: string;
  block?: string;
  height?: string;
  txindex?: number;
  target?: AlkaneId;
  inputs?: string[];
  pointer?: number;
  refundPointer?: number;
  vout?: number;
}

export function createSimulateRequestObject(request: SimulateRequest) {
  const response = {
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '20000',
    txindex: 0,
    inputs: [],
    pointer: 0,
    refundPointer: 0,
    vout: 0,
    ...request,
  }
  return response;
}