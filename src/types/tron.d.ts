export interface TronWebTransaction {
  txID: string;
  raw_data?: any;
  raw_data_hex?: string;
  signature?: string[];
  [key: string]: any;
}

export interface TronWeb {
  defaultAddress: {
    base58: string;
    hex: string;
    name?: string;
  };
  ready: boolean;
  fullNode: { host: string };
  solidityNode?: { host: string };
  eventServer?: { host: string };
  trx: {
    sign(transaction: any): Promise<any>;
    sendRawTransaction(signedTx: any): Promise<{ result: boolean; txid?: string; transaction?: { txID: string }; code?: string; message?: string }>;
    getBalance(address: string): Promise<number>;
    getTransaction(txID: string): Promise<any>;
  };
  transactionBuilder: {
    triggerSmartContract(
      contractAddress: string,
      functionSelector: string,
      options: { feeLimit?: number; callValue?: number; [k: string]: any },
      parameters: Array<{ type: string; value: any }>,
      issuerAddress?: string
    ): Promise<{
      result: { result: boolean; code?: string; message?: string };
      transaction: TronWebTransaction;
      constant_result?: string[];
    }>;
  };
  contract(): {
    at(address: string): Promise<any>;
  };
  toSun(amount: number | string): string;
  fromSun(sun: number | string): string;
  toHex(value: any): string;
  address: {
    toHex(base58: string): string;
    fromHex(hex: string): string;
  };
}

export interface TronLink {
  ready: boolean;
  tronWeb: TronWeb | false;
  request(args: { method: string; params?: any }): Promise<{ code: number; message?: string }>;
}

declare global {
  interface Window {
    tronWeb?: TronWeb;
    tronLink?: TronLink;
    trustwallet?: any;
    tokenpocket?: any; // TokenPocket DApp browser injection
  }
}
