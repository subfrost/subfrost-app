import {
    AssetType,
    timeout,
    getAddressType,
} from "../types";

import { prepareAddressForDummyUtxos, updateUtxos } from "../helpers";
import { GetSellerPsbtRequest, GetSellerPsbtResponse, Marketplaces, ProcessOfferOptions, SubmitBuyerPsbtRequest, SubmitBuyerPsbtResponse, ProcessOfferResponse } from "../types";

export async function processMagisatOffer({
    address,
    offer,
    receiveAddress,
    feeRate,
    pubKey,
    assetType,
    provider,
    utxos,
    signer
}: ProcessOfferOptions
): Promise<ProcessOfferResponse> {
    let dummyTxId: string | null = null;
    let purchaseTxId: string | null = null;
    const addressType = getAddressType(address);

    const network = provider.network
    let nUtxos = 0;
    const orders = [];
    if (Array.isArray(offer.offerId)) {
        nUtxos = offer.offerId.length + 1
        for (let i = 0; i < offer.offerId.length; i++) {
            const price = Array.isArray(offer.totalPrice) ? (offer.totalPrice[i] || 0) : 0
            const rawAmount = Array.isArray(offer.amount) ? offer.amount[i] : 1
            const amount = typeof rawAmount === 'string' ? parseInt(rawAmount) : (typeof rawAmount === 'number' ? rawAmount : 1)
            const inscriptionId = Array.isArray(offer.inscriptionId) ? offer.inscriptionId[i] : undefined
            orders.push({
                orderId: offer.offerId[i],
                price,
                amount,
                inscriptionId,
                feeRate
            })
        }
    } else {
        nUtxos = 2;
        const price = typeof offer.totalPrice === 'number' ? offer.totalPrice : 0
        const rawAmount = offer.amount
        const amount = typeof rawAmount === 'string' ? parseInt(rawAmount) : (typeof rawAmount === 'number' ? rawAmount : 1)
        const inscriptionId = typeof offer.inscriptionId === 'string' ? offer.inscriptionId : undefined
        orders.push({
            orderId: offer.offerId,
            price,
            amount,
            inscriptionId,
            feeRate
        })
    }

    if (!addressType) {
        throw new Error('Invalid address type');
    }
    const psbtForDummyUtxos =
        (assetType != AssetType.RUNES)
            ?
            await prepareAddressForDummyUtxos({ address, utxos, network, pubKey, feeRate, nUtxos, addressType })
            :
            null
    if (psbtForDummyUtxos != null) {
        const { psbtBase64, inputTemplate, outputTemplate } = psbtForDummyUtxos
        const { signedPsbt } = await signer.signAllInputs({
            rawPsbtHex: psbtBase64,
            finalize: true,
        })

        const { txId } = await provider.pushPsbt({ psbtBase64: signedPsbt })
        dummyTxId = txId;
        await timeout(60000)
        utxos = await updateUtxos({
            originalUtxos: utxos,
            txId,
            spendAddress: address,
            provider
        })
    }

    const magisatGetSellerPsbt: GetSellerPsbtRequest = {
        marketplaceType: Marketplaces.MAGISAT,
        assetType,
        buyerAddress: address,
        orders,
        buyerPublicKey: pubKey,
        feeRate,
        receiveAddress
    }
    const sellerPsbtResponse = await provider.api.getSellerPsbt(magisatGetSellerPsbt);
    if (sellerPsbtResponse.statusCode != 200) {
        throw new Error(`Failed to get seller psbt: ${sellerPsbtResponse.error}`)
    }
    const sellerPsbt: GetSellerPsbtResponse = sellerPsbtResponse.data;
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbtHex: sellerPsbt.psbt,
        finalize: false,
    })

    const magisatSubmitBuyerPsbt: SubmitBuyerPsbtRequest = {
        marketplaceType: Marketplaces.MAGISAT,
        assetType,
        buyerAddress: address,
        orders,
        buyerPublicKey: pubKey,
        receiveAddress,
        psbt: signedPsbt
    }
    const submitBuyerPsbtResponse = await provider.api.submitBuyerPsbt(magisatSubmitBuyerPsbt);
    if (submitBuyerPsbtResponse.statusCode != 200) {
        throw new Error(`Failed to submit buyer psbt: ${submitBuyerPsbtResponse.error}`)
    }
    const submitBuyerPsbt: SubmitBuyerPsbtResponse = submitBuyerPsbtResponse.data;
    purchaseTxId = submitBuyerPsbt.txid;
    if (!purchaseTxId) {
        throw new Error('Purchase transaction ID is missing');
    }
    return {
        dummyTxId: dummyTxId || '',
        purchaseTxId
    }
}
