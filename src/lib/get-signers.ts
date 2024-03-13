import { ss58_encode } from 'ss58'
import { ethers } from 'ethers'
import { Buffer } from 'buffer'

export const generateAddress = () => {
  const result = ss58_encode(ethers.randomBytes(32))
  console.log(result)
  return result
}

export const generateRow = () => {
  return {
    address: generateAddress(),
    value: (Math.random() * 10).toFixed(4)
  }
}

export const generateRows = (n) => {
  return Array(n)
    .fill(0)
    .map(() => generateRow())
}

export async function getSigners() {
  // TODO: open websocket to get network signers
  return new Promise((res, rej) => res(generateRows(8)))
}
