/**
 * Direct Safe Transaction Service API calls
 * Workaround for SafeApiKit 4.0.1 using v2 endpoint that doesn't exist
 */

import { SAFE_TX_SERVICE_URL, SAFE_API_KEY } from "@/config/network";
import { getAddress } from "viem";

export interface ProposeTransactionParams {
  safeAddress: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
  contractTransactionHash: string;
  sender: string;
  signature: string;
  origin?: string;
}

/**
 * Propose transaction directly to Safe Transaction Service v1 API
 * SafeApiKit 4.0.1 tries to use v2 which doesn't exist
 */
export async function proposeTransaction(params: ProposeTransactionParams): Promise<void> {
  // Checksum all addresses
  const safeAddress = getAddress(params.safeAddress);
  const to = getAddress(params.to);
  const sender = getAddress(params.sender);
  const gasToken = params.gasToken === "0x0000000000000000000000000000000000000000" 
    ? params.gasToken 
    : (params.gasToken ? getAddress(params.gasToken) : params.gasToken);
  const refundReceiver = params.refundReceiver === "0x0000000000000000000000000000000000000000"
    ? params.refundReceiver
    : (params.refundReceiver ? getAddress(params.refundReceiver) : params.refundReceiver);
  
  const url = `${SAFE_TX_SERVICE_URL}/safes/${safeAddress}/multisig-transactions/`;
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  if (SAFE_API_KEY) {
    headers["X-API-Key"] = SAFE_API_KEY;
  }
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: to,
      value: params.value,
      data: params.data,
      operation: params.operation,
      safeTxGas: params.safeTxGas,
      baseGas: params.baseGas,
      gasPrice: params.gasPrice,
      gasToken: gasToken,
      refundReceiver: refundReceiver,
      nonce: params.nonce,
      contractTransactionHash: params.contractTransactionHash,
      sender: sender,
      signature: params.signature,
      origin: params.origin || "",
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("API Error:", response.status, error);
    throw new Error(`${response.status}: ${error}`);
  }
  
  // Safe Transaction Service returns 201 Created with empty body on success
  const text = await response.text();
  if (!text || text.trim() === '') {
    console.log("Transaction proposed successfully (empty response)");
    return;
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("Response is not JSON:", text);
    return;
  }
}

/**
 * Get pending transactions
 */
export async function getPendingTransactions(safeAddress: string): Promise<any> {
  const checksummedAddress = getAddress(safeAddress);
  const url = `${SAFE_TX_SERVICE_URL}/safes/${checksummedAddress}/multisig-transactions/?executed=false`;
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  if (SAFE_API_KEY) {
    headers["X-API-Key"] = SAFE_API_KEY;
  }
  
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("API Error:", response.status, error);
    throw new Error(`${response.status}: ${error}`);
  }
  
  return await response.json();
}

/**
 * Confirm/sign a transaction
 */
export async function confirmTransaction(
  safeTxHash: string, 
  signature: string,
  owner: string // Add owner address parameter
): Promise<void> {
  const url = `${SAFE_TX_SERVICE_URL}/multisig-transactions/${safeTxHash}/confirmations/`;
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  if (SAFE_API_KEY) {
    headers["X-API-Key"] = SAFE_API_KEY;
  }
  
  // Checksum owner address
  const checksummedOwner = getAddress(owner);
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      signature,
      // Some Safe TX Service versions recover signer from signature,
      // but to be explicit, we can add it (though API might not use it)
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("API Error:", response.status, error);
    throw new Error(`${response.status}: ${error}`);
  }
  
  // Handle empty response
  const text = await response.text();
  if (!text || text.trim() === '') {
    console.log("Transaction confirmed successfully (empty response)");
    return;
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("Response is not JSON:", text);
    return;
  }
}

/**
 * Get single transaction details
 */
export async function getTransaction(safeTxHash: string): Promise<any> {
  const url = `${SAFE_TX_SERVICE_URL}/multisig-transactions/${safeTxHash}/`;
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  if (SAFE_API_KEY) {
    headers["X-API-Key"] = SAFE_API_KEY;
  }
  
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("API Error:", response.status, error);
    throw new Error(`${response.status}: ${error}`);
  }
  
  return await response.json();
}
