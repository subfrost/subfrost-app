// Import types from ts-sdk sub-modules to avoid WASM dependency
import type { FormattedUtxo } from "./types";
import { AddressType } from "./types";

import * as bitcoin from 'bitcoinjs-lib';

// Define Provider type locally
type Provider = {
  esplora: {
    getFeeEstimates: () => Promise<Record<string, number>>;
    getTxInfo: (txId: string) => Promise<any>;
  };
};

// Local definitions for swap helpers
export const UTXO_DUST = 546;

export function assertHex(buffer: Buffer): Buffer {
  // Remove leading 0x02/0x03 prefix for taproot keys
  if (buffer.length === 33 && (buffer[0] === 0x02 || buffer[0] === 0x03)) {
    return buffer.subarray(1);
  }
  return buffer;
}

export function getAddressType(address: string): AddressType | null {
  try {
    // Try to decode as different address types
    if (address.startsWith('bc1p') || address.startsWith('tb1p') || address.startsWith('bcrt1p')) {
      return AddressType.P2TR;
    }
    if (address.startsWith('bc1q') || address.startsWith('tb1q') || address.startsWith('bcrt1q')) {
      return AddressType.P2WPKH;
    }
    if (address.startsWith('3') || address.startsWith('2')) {
      return AddressType.P2SH_P2WPKH;
    }
    if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
      return AddressType.P2PKH;
    }
    return null;
  } catch {
    return null;
  }
}

import {
  BidAffordabilityCheck,
  BidAffordabilityCheckResponse,
  BuiltPsbt,
  ConditionalInput,
  DummyUtxoOptions,
  MarketplaceBatchOffer,
  MarketplaceOffer,
  Marketplaces,
  OutputTxCheck,
  OutputTxTemplate,
  PrepareAddressForDummyUtxos,
  PsbtBuilder,
  SelectSpendAddress,
  SelectSpendAddressResponse,
  TxAddressTypes,
  UtxosToCoverAmount,
  marketplaceName,
} from './types'


export const maxTxSizeForOffers: number = 482
export const CONFIRMED_UTXO_ENFORCED_MARKETPLACES: Marketplaces[] = [
  Marketplaces.UNISAT,
  Marketplaces.ORDINALS_WALLET,
]
export const DUMMY_UTXO_ENFORCED_MARKETPLACES: Marketplaces[] = [
  Marketplaces.OKX,
  Marketplaces.ORDINALS_WALLET,
  Marketplaces.MAGISAT,
  Marketplaces.MAGIC_EDEN,
]
export const ESTIMATE_TX_SIZE: number = 350
export const DUMMY_UTXO_SATS = 600 + 600

function checkPaymentType(
  payment: bitcoin.PaymentCreator,
  network: bitcoin.networks.Network
) {
  return (script: Buffer) => {
    try {
      return payment({ output: script, network: network })
    } catch {
      return false
    }
  }
}

const nativeSegwitFormat = (
  script: Buffer,
  network: bitcoin.networks.Network
) => {
  const p2wpkh = checkPaymentType(bitcoin.payments.p2wpkh, network)(script)
  return {
    data: p2wpkh,
  }
}

const nestedSegwitFormat = (
  script: Buffer,
  network: bitcoin.networks.Network
) => {
  const p2sh = checkPaymentType(bitcoin.payments.p2sh, network)(script)
  return {
    data: p2sh,
  }
}

const taprootFormat = (script: Buffer, network: bitcoin.networks.Network) => {
  const p2tr = checkPaymentType(bitcoin.payments.p2tr, network)(script)
  return {
    data: p2tr,
  }
}

function getOutputFormat(script: Buffer, network: bitcoin.networks.Network) {
  const p2sh = nestedSegwitFormat(script, network)
  if (p2sh.data) {
    return AddressType.P2SH_P2WPKH
  }

  const p2wpkh = nativeSegwitFormat(script, network)
  if (p2wpkh.data) {
    return AddressType.P2WPKH
  }

  const p2tr = taprootFormat(script, network)
  if (p2tr.data) {
    return AddressType.P2TR
  }
}

function getTxSizeByAddressType(addressType: AddressType) {
  switch (addressType) {
    case AddressType.P2TR:
      return { input: 42, output: 43, txHeader: 10.5, witness: 66 }

    case AddressType.P2WPKH:
      return { input: 42, output: 43, txHeader: 10.5, witness: 112.5 }

    case AddressType.P2SH_P2WPKH:
      return { input: 64, output: 32, txHeader: 10, witness: 105 }

    default:
      throw new Error('Invalid address type')
  }
}

export function getUTXOsToCoverAmount({
  utxos,
  amountNeeded,
  excludedUtxos = [],
  insistConfirmedUtxos = false,
}: UtxosToCoverAmount): FormattedUtxo[] {
  try {
    let sum = 0
    const result: FormattedUtxo[] = []
    for (const utxo of utxos) {
      if (isExcludedUtxo(utxo, excludedUtxos)) {
        // Check if the UTXO should be excluded
        continue
      }
      if (insistConfirmedUtxos && utxo.confirmations == 0) {
        continue
      }
      const currentUTXO = utxo
      sum += currentUTXO.satoshis ?? currentUTXO.value ?? 0
      result.push(currentUTXO)
      if (sum > amountNeeded) {
        return result
      }
    }
    return []
  } catch (err) {
    throw new Error(String(err))
  }
}

export function isExcludedUtxo(
  utxo: FormattedUtxo,
  excludedUtxos: FormattedUtxo[]
): boolean {
  return excludedUtxos?.some(
    (excluded) =>
      excluded?.txId === utxo?.txId &&
      excluded?.outputIndex === utxo?.outputIndex
  )
}

export function getAllUTXOsWorthASpecificValue(
  utxos: FormattedUtxo[],
  value: number
): FormattedUtxo[] {
  return utxos.filter((utxo) => utxo?.satoshis === value)
}

export function addInputConditionally(
  inputData: ConditionalInput,
  addressType: AddressType,
  pubKey: string
): ConditionalInput {
  if (addressType === AddressType.P2TR) {
    inputData['tapInternalKey'] = assertHex(Buffer.from(pubKey, 'hex'))
  }
  return inputData
}

export function getBidCostEstimate(
  offers: MarketplaceOffer[],
  feeRate: number
): number {
  let costEstimate = 0
  for (let i = 0; i < offers?.length; i++) {
    const offerPrice = offers[i]?.price ? offers[i].price : offers[i]?.totalPrice
    costEstimate +=
      (offerPrice || 0) + parseInt((maxTxSizeForOffers * feeRate).toFixed(0))
  }
  const totalCost = costEstimate
  return totalCost
}

/**
 *
 * ONLY INSIST retrieving confirmed utxos IF ALL the offers are from CONFIRMED_UTXO_ENFORCED_MARKETPLACES
 * Otherwise if there is AT LEAST ONE offer from a marketplace that does not enforce confirmed
 * utxos, DONT INSIST retrieving confirmed utxos.
 *  */
export async function canAddressAffordBid({
  estimatedCost,
  offers,
  utxos
}: BidAffordabilityCheck): Promise<BidAffordabilityCheckResponse> {
  let insistConfirmedUtxos: boolean = true
  for (let i = 0; i < offers.length; i++) {
    const marketplace = offers[i]?.marketplace
    if (!marketplace) continue
    const mktPlace = marketplaceName[marketplace as keyof typeof marketplaceName]
    if (!CONFIRMED_UTXO_ENFORCED_MARKETPLACES.includes(mktPlace)) {
      insistConfirmedUtxos = false
      break
    }
  }
    const excludedUtxos = getAllUTXOsWorthASpecificValue(utxos, 600).slice(0, 2)
    const retrievedUtxos: FormattedUtxo[] = getUTXOsToCoverAmount({
      utxos,
      amountNeeded: estimatedCost,
      excludedUtxos,
      insistConfirmedUtxos,
    })
    retrievedUtxos.push(...excludedUtxos)
    return {
      offers_: offers,
      estimatedCost,
     retrievedUtxos,
      canAfford: retrievedUtxos.length > 0,
    }
  }


export function calculateAmountGathered(utxoArray: FormattedUtxo[]): number {
  return utxoArray?.reduce(
    (prev, currentValue) => prev + (currentValue.satoshis ?? currentValue.value ?? 0),
    0
  )
}

export async function selectSpendAddress({
  offers,
  provider,
  feeRate,
  account,
  utxos
}: SelectSpendAddress): Promise<SelectSpendAddressResponse> {
  feeRate = await sanitizeFeeRate(provider, feeRate)
  const estimatedCost = getBidCostEstimate(offers, feeRate)
  const spendStrategy = account.spendStrategy as any; // Type assertion for complex spend strategy
  for (let i = 0; i < spendStrategy.addressOrder.length; i++) {
    const addrType = spendStrategy.addressOrder[i] as 'taproot' | 'nativeSegwit';
    if (addrType === 'taproot' || addrType === 'nativeSegwit') {
      const accountAddr = account[addrType];
      if (!accountAddr) continue;
      const address = accountAddr.address
      const pubkey: string = accountAddr.pubkey
      const addrUtxos = utxos.filter((utxo) => utxo.address === address)
      const afford = await canAddressAffordBid({
        estimatedCost,
        offers,
        utxos: addrUtxos,
      })
      const { retrievedUtxos, canAfford, offers_ } = afford
      if (canAfford) {
        const selectedSpendAddress = address
        const selectedSpendPubkey = pubkey
        const addressType = getAddressType(selectedSpendAddress)
        if (!addressType) {
          throw new Error('Invalid address type')
        }
        return {
          address: selectedSpendAddress,
          pubKey: selectedSpendPubkey,
          addressType,
          utxos: retrievedUtxos,
          offers: offers_,
        }
      }
    }
  }
  throw new Error(
    'Not enough (confirmed) satoshis available to buy marketplace offers, need  ' +
      estimatedCost +
      ' sats'
  )
}

export async function sanitizeFeeRate(
  provider: Provider,
  feeRate: number
): Promise<number> {
  if (feeRate < 0 || !Number.isSafeInteger(feeRate)) {
    return (await provider.esplora.getFeeEstimates())['1']
  }
  return feeRate
}

export async function prepareAddressForDummyUtxos({
  address,
  network,
  pubKey,
  feeRate,
  addressType,
  nUtxos = 2,
  utxos = [],
}: PrepareAddressForDummyUtxos): Promise<BuiltPsbt | null> {
  try {
    const paddingUtxos = getAllUTXOsWorthASpecificValue(utxos, 600)
    if (paddingUtxos.length < nUtxos) {
      return dummyUtxosPsbt({
        address,
        utxos,
        network,
        feeRate,
        pubKey,
        addressType,
        nUtxos: nUtxos - paddingUtxos.length,
      })
    }
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `An error occured while preparing address for dummy utxos ${message}`
    )
  }
}

export function dummyUtxosPsbt({
  address,
  utxos,
  feeRate,
  pubKey,
  addressType,
  network,
  nUtxos = 2,
}: DummyUtxoOptions): BuiltPsbt {
  const txInputs: ConditionalInput[] = []
  const txOutputs: OutputTxTemplate[] = []
  const amountNeeded =
    DUMMY_UTXO_SATS + parseInt((ESTIMATE_TX_SIZE * feeRate).toFixed(0))
  const retrievedUtxos = getUTXOsToCoverAmount({
    utxos,
    amountNeeded,
  })
  if (retrievedUtxos.length === 0) {
    throw new Error('No utxos available')
  }
  
  retrievedUtxos.forEach((utxo) => {
    const hash = utxo.txId || utxo.txid;
    const index = utxo.outputIndex ?? utxo.vout;
    const value = utxo.satoshis ?? utxo.value ?? 0;
    const scriptPk = utxo.scriptPk || utxo.scriptPubKey;
    if (!hash || index === undefined || !scriptPk) {
      throw new Error('Invalid UTXO data');
    }
    const input = addInputConditionally(
      {
        hash,
        index,
        witnessUtxo: {
          value: BigInt(value),
          script: Buffer.from(scriptPk, 'hex'),
        },
      },
      addressType,
      pubKey
    )
    txInputs.push(input)
  })

  const amountRetrieved = calculateAmountGathered(retrievedUtxos)
  const changeAmount = amountRetrieved - amountNeeded
  let changeOutput: OutputTxTemplate | null = null

  for (let i = 0; i < nUtxos; i++) {
    txOutputs.push({
      address,
      value: BigInt(600),
    })
  }
  if (changeAmount > 0) changeOutput = { address, value: BigInt(changeAmount) }

  return buildPsbtWithFee({
    inputTemplate: txInputs,
    outputTemplate: txOutputs,
    utxos,
    changeOutput,
    retrievedUtxos,
    spendAddress: address,
    spendPubKey: pubKey,
    amountRetrieved,
    spendAmount: DUMMY_UTXO_SATS,
    feeRate,
    network,
    addressType,
  })
}

export async function updateUtxos({
  originalUtxos,
  txId,
  spendAddress,
  provider,
}: {
  originalUtxos: FormattedUtxo[]
  txId: string
  spendAddress: string
  provider: Provider
}): Promise<FormattedUtxo[]> {
  const txInfo = await provider.esplora.getTxInfo(txId)

  const spentInputs: Array<{ txId: string; outputIndex: number }> = txInfo.vin.map((input: { txid: string; vout: number }) => ({
    txId: input.txid,
    outputIndex: input.vout,
  }))

  const updatedUtxos = originalUtxos.filter(
    (utxo) =>
      !spentInputs.some(
        (input) =>
          input.txId === utxo.txId && input.outputIndex === utxo.outputIndex
      )
  )

  // Add new UTXOs
  txInfo.vout.forEach((output: { scriptpubkey_address: string; value: number; scriptpubkey: string }, index: number) => {
    if (
      output.scriptpubkey_address === spendAddress &&
      output.value > UTXO_DUST
    ) {
      const newUtxo: FormattedUtxo = {
        txid: txId,
        txId: txId,
        vout: index,
        outputIndex: index,
        value: output.value,
        satoshis: output.value,
        scriptPk: output.scriptpubkey,
        address: output.scriptpubkey_address,
        inscriptions: [],
        runes: [],
        alkanes: {},
        indexed: true,
        confirmations: txInfo.status.confirmed ? 1 : 0,
      }
      updatedUtxos.push(newUtxo)
    }
  })

  return updatedUtxos
}

export function outputTxCheck({
  blueprint,
  swapTx,
  output,
  index,
}: OutputTxCheck): boolean {
  const matchAddress = blueprint.address == output.address
  const dustAmount = output.value > UTXO_DUST
  const nonInscriptionUtxo = !(swapTx == true && index == 1)
  if (matchAddress && dustAmount && nonInscriptionUtxo) {
    return true
  } else {
    return false
  }
}

export function batchMarketplaceOffer(
  offers: MarketplaceOffer[]
): (MarketplaceOffer | MarketplaceBatchOffer)[] {
  const groupedOffers: { [key: string]: MarketplaceOffer[] } = {}

  // Group offers by marketplace
  offers.forEach((offer) => {
    if (!groupedOffers[offer.marketplace]) {
      groupedOffers[offer.marketplace] = []
    }
    groupedOffers[offer.marketplace].push(offer)
  })

  return Object.entries(groupedOffers).flatMap(
    ([marketplace, marketplaceOffers]) => {
      if (
        marketplace === 'unisat' ||
        marketplace === 'ordinals-wallet' ||
        marketplace === 'magisat' ||
        marketplace === 'magic-eden'
      ) {
        const batchOffer: MarketplaceBatchOffer = {
          ticker: marketplaceOffers[0].ticker,
          offerId: [],
          marketplace,
          price: [],
          unitPrice: [],
          totalPrice: [],
          amount: [],
          address: [],
          inscriptionId: [],
          outpoint: [],
        }

        marketplaceOffers.forEach((offer) => {
          batchOffer.offerId.push(offer.offerId)
          batchOffer.price?.push(offer.price || 0)
          batchOffer.unitPrice?.push(offer.unitPrice || 0)
          batchOffer.totalPrice?.push(offer.totalPrice || 0)

          if (marketplace === 'unisat' || marketplace === 'magisat' || marketplace === 'magic-eden') {
            batchOffer.amount?.push(offer.amount || '')
            batchOffer.address?.push(offer.address || '')
          } else if (marketplace === 'ordinals-wallet') {
            batchOffer.inscriptionId?.push(offer.inscriptionId || '')
            batchOffer.outpoint?.push(offer.outpoint || '')
          }
        })

        return [batchOffer as MarketplaceOffer | MarketplaceBatchOffer]
      } else {
        return marketplaceOffers
      }
    }
  )
}

export function psbtTxAddressTypes({
  psbt,
  network,
}: {
  psbt: bitcoin.Psbt
  network: bitcoin.Network
}): {
  inputAddressTypes: AddressType[]
  outputAddressTypes: AddressType[]
} {
  const psbtInputs = psbt.data.inputs
  const psbtOutputs = psbt.txOutputs
  const inputAddressTypes: AddressType[] = []
  const outputAddressTypes: AddressType[] = []

  if (psbtInputs.length === 0 || psbtOutputs.length === 0) {
    throw new Error('PSBT requires at least one input & one output ')
  }

  psbtInputs.forEach((input) => {
    const witnessScript =
      input.witnessUtxo && input.witnessUtxo.script
        ? input.witnessUtxo.script
        : null

    if (!witnessScript) {
      throw new Error('Invalid script')
    }

    const inputType = getOutputFormat(Buffer.from(witnessScript), network)
    if (inputType) {
      inputAddressTypes.push(inputType)
    }
  })

  psbtOutputs.forEach((output) => {
    const outputType = getOutputFormat(Buffer.from(output.script), network)
    if (outputType) {
      outputAddressTypes.push(outputType)
    }
  })

  return {
    inputAddressTypes,
    outputAddressTypes,
  }
}

export function estimatePsbtFee({
  txAddressTypes,
  witness = [],
}: {
  txAddressTypes: TxAddressTypes
  witness?: Buffer[]
}): number {
  const { inputAddressTypes, outputAddressTypes } = txAddressTypes
  const witnessHeaderSize = 2
  const inputVB = inputAddressTypes.reduce(
    (j, inputType) => {
      const { input, txHeader, witness } = getTxSizeByAddressType(inputType)
      j.txHeader = txHeader
      j.input += input
      j.witness += witness
      return j
    },
    {
      input: 0,
      witness: 0,
      txHeader: 0,
    }
  )
  const outputVB = outputAddressTypes.reduce((k, outputType) => {
    const { output } = getTxSizeByAddressType(outputType)
    k += output

    return k
  }, 0)

  let witnessByteLength = 0
  if (inputAddressTypes.includes(AddressType.P2TR) && witness?.length) {
    witnessByteLength = witness.reduce(
      (u, witness) => (u += witness.byteLength),
      0
    )
  }

  const witnessSize =
    inputVB.witness + (witness?.length ? witnessByteLength : 0)
  const baseTotal = inputVB.input + inputVB.txHeader + outputVB

  let witnessTotal = 0
  if (witness?.length) {
    witnessTotal = witnessSize
  } else if (witnessSize > 0) {
    witnessTotal = witnessHeaderSize + witnessSize
  }

  const sum = baseTotal + witnessTotal
  const weight = baseTotal * 3 + sum

  return Math.ceil(weight / 4)
}

export function buildPsbtWithFee({
  inputTemplate = [],
  outputTemplate = [],
  utxos,
  changeOutput,
  retrievedUtxos = [],
  spendAddress,
  spendPubKey,
  amountRetrieved,
  spendAmount,
  addressType,
  feeRate,
  network,
}: PsbtBuilder): BuiltPsbt {
  if (inputTemplate.length === 0 || outputTemplate.length === 0) {
    throw new Error('Cant create a psbt with 0 inputs & outputs')
  }

  const inputAddressTypes: AddressType[] = []
  const outputAddressTypes: AddressType[] = []

  inputTemplate.forEach((input) => {
    const inputType = getOutputFormat(Buffer.from(input.witnessUtxo.script), network)
    if (inputType) inputAddressTypes.push(inputType)
  })
  outputTemplate.forEach((output) => {
    const outputType = getAddressType(output.address)
    if (outputType) outputAddressTypes.push(outputType)
  })
  if (changeOutput != null) {
    const changeType = getAddressType(changeOutput.address)
    if (changeType) outputAddressTypes.push(changeType)
  }

  const txAddressTypes = { inputAddressTypes, outputAddressTypes }
  const finalTxSize = estimatePsbtFee({ txAddressTypes })
  const finalFee = parseInt((finalTxSize * feeRate).toFixed(0))

  const newAmountNeeded = spendAmount + finalFee
  let changeAmount = amountRetrieved - newAmountNeeded

  if (changeAmount < 0) {
    const additionalUtxos = getUTXOsToCoverAmount({
      utxos,
      amountNeeded: newAmountNeeded,
      excludedUtxos: retrievedUtxos,
    })

    if (additionalUtxos.length > 0) {
      // Merge new UTXOs with existing ones and create new templates for recursion
      retrievedUtxos = retrievedUtxos.concat(additionalUtxos)
      additionalUtxos.forEach((utxo) => {
        const hash = utxo.txId || utxo.txid;
        const index = utxo.outputIndex ?? utxo.vout;
        const value = utxo.satoshis ?? utxo.value ?? 0;
        const scriptPk = utxo.scriptPk || utxo.scriptPubKey;
        if (!hash || index === undefined || !scriptPk) {
          throw new Error('Invalid UTXO data');
        }
        const input = addInputConditionally(
          {
            hash,
            index,
            witnessUtxo: {
              value: BigInt(value),
              script: Buffer.from(scriptPk, 'hex'),
            },
          },
          addressType,
          spendPubKey
        )
        inputTemplate.push(input)
      })

      amountRetrieved = calculateAmountGathered(retrievedUtxos)
      changeAmount = amountRetrieved - newAmountNeeded
      if (changeAmount > 0)
        changeOutput = { address: spendAddress, value: BigInt(changeAmount) }

      return buildPsbtWithFee({
        spendAddress,
        utxos,
        spendAmount,
        feeRate,
        spendPubKey,
        amountRetrieved,
        addressType,
        network,
        changeOutput,
        retrievedUtxos,
        inputTemplate,
        outputTemplate,
      })
    } else {
      throw new Error(
        'Insufficient funds: cannot cover transaction fee with available UTXOs'
      )
    }
  } else {
    if (changeAmount > 0)
      outputTemplate.push({ address: spendAddress, value: BigInt(changeAmount) })

    const finalPsbtTx = new bitcoin.Psbt({ network })

    inputTemplate.forEach((input) => finalPsbtTx.addInput(input))
    outputTemplate.forEach((output) => finalPsbtTx.addOutput(output))

    return {
      psbtHex: finalPsbtTx.toHex(),
      psbtBase64: finalPsbtTx.toBase64(),
      inputTemplate,
      outputTemplate,
    }
  }
}
