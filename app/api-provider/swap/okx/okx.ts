import {
    AssetType,
    timeout,
    OylTransactionError,
    getAddressType
} from "@oyl/sdk"

import { UnsignedOkxBid, SignedOkxBid, UnsignedPsbt, GenOkxRuneUnsignedPsbt, ProcessOfferOptions, ProcessOfferResponse, MarketplaceOffer, ProcessListingOptions, ProcessListingResponse, OkxInscriptionListingData, SubmitListingPsbtRequest, GetListingPsbtRequest, GetListingPsbtResponse, SubmitListingResponse } from "../types"
import { genBrcAndOrdinalUnsignedPsbt, generateInscriptionListingUnsignedPsbt, mergeSignedPsbt } from "./nft"
import { prepareAddressForDummyUtxos, updateUtxos } from "../helpers";
import { buildOkxRunesPsbt } from "./runes";




export async function getSellerPsbt(unsignedBid: UnsignedOkxBid) {
    switch (unsignedBid.assetType) {
        case AssetType.BRC20:
            return await unsignedBid.provider.api.getOkxOfferPsbt({ offerId: unsignedBid.offerId })

        case AssetType.RUNES:
            return await unsignedBid.provider.api.getOkxOfferPsbt({ offerId: unsignedBid.offerId, rune: true })

        case AssetType.COLLECTIBLE:
            return await unsignedBid.provider.api.getOkxOfferPsbt({ offerId: unsignedBid.offerId })
    }
}


export async function submitSignedPsbt(signedBid: SignedOkxBid) {
    const offer = signedBid.offer
    switch (signedBid.assetType) {
        case AssetType.BRC20:
            const brcPayload = {
                ticker: offer.ticker,
                price: offer.totalPrice,
                amount: parseInt(offer.amount),
                fromAddress: signedBid.fromAddress,
                toAddress: offer.address,
                inscriptionId: offer.inscriptionId,
                buyerPsbt: signedBid.psbt,
                orderId: offer.offerId,
                brc20: true
            }
            return await signedBid.provider.api.submitOkxBid(brcPayload)

        case AssetType.RUNES:
            const runePayload = {
                fromAddress: signedBid.fromAddress,
                psbt: signedBid.psbt,
                orderId: offer.offerId,
            }
            return await signedBid.provider.api.submitOkxRuneBid(runePayload)

        case AssetType.COLLECTIBLE:
            const collectiblePayload = {
                ticker: offer.ticker,
                price: offer.totalPrice,
                amount: parseInt(offer.amount),
                fromAddress: signedBid.fromAddress,
                toAddress: offer.address,
                inscriptionId: offer.inscriptionId,
                buyerPsbt: signedBid.psbt,
                orderId: offer.offerId,
                brc20: false
            }
            return await signedBid.provider.api.submitOkxBid(collectiblePayload)

    }
}

export async function getBuyerPsbt(unsignedPsbt: UnsignedPsbt) {
    switch (unsignedPsbt.assetType) {
        case AssetType.BRC20:
            return genBrcAndOrdinalUnsignedPsbt(unsignedPsbt)
        case AssetType.RUNES:
            return await buildOkxRunesPsbt(unsignedPsbt as GenOkxRuneUnsignedPsbt)
        case AssetType.COLLECTIBLE:
            return genBrcAndOrdinalUnsignedPsbt(unsignedPsbt)

    }
}



export async function processOkxOffer({
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

    const psbtForDummyUtxos =
        (assetType != AssetType.RUNES)
            ?
            await prepareAddressForDummyUtxos({ address, utxos, network, pubKey, feeRate, addressType })
            :
            null
    if (psbtForDummyUtxos != null) {
        const { psbtBase64, inputTemplate, outputTemplate } = psbtForDummyUtxos
        const { signedPsbt } = await signer.signAllInputs({
            rawPsbt: psbtBase64,
            finalize: true,
        })

        const { txId } = await provider.pushPsbt({ psbtBase64: signedPsbt })
        dummyTxId = txId;
        await timeout(30000)
        utxos = await updateUtxos({
            originalUtxos: utxos,
            txId,
            spendAddress: address,
            provider
        })
    }
    const unsignedBid: UnsignedOkxBid = {
        offerId: offer.offerId,
        provider,
        assetType
    }

    const sellerData = await getSellerPsbt(unsignedBid);
    const sellerPsbt = sellerData.data.sellerPsbt;
    const decodedPsbt = await provider.sandshrew.bitcoindRpc.decodePSBT(sellerPsbt)
    const sellerAddress = offer?.address
    const buyerPsbt = await getBuyerPsbt({
        address,
        utxos,
        feeRate,
        receiveAddress,
        network,
        pubKey,
        addressType,
        sellerPsbt,
        sellerAddress: sellerAddress as string,
        orderPrice: offer.totalPrice as number,
        assetType,
        decodedPsbt
    })


    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: buyerPsbt,
        finalize: false
    })
    let finalPsbt = signedPsbt
    if (assetType != AssetType.RUNES) finalPsbt = mergeSignedPsbt(signedPsbt, [sellerPsbt])
    const transaction = await submitSignedPsbt({
        fromAddress: address,
        psbt: finalPsbt,
        assetType,
        provider,
        offer: offer as MarketplaceOffer
    })

    if (transaction?.statusCode == 200 || transaction?.data) {

        purchaseTxId = transaction.data
        return {
            dummyTxId,
            purchaseTxId
        }
    } else {
        throw new OylTransactionError(new Error(JSON.stringify(transaction)))
    }

}

export async function processOkxListing({
    address,
    listing,
    receiveBtcAddress,
    pubKey,
    receiveBtcPubKey,
    assetType,
    provider,
    signer,
}: ProcessListingOptions): Promise<ProcessListingResponse> {
    const marketplaceType = listing.marketplace;

    if (assetType == AssetType.COLLECTIBLE) {
        const listingDataRequest = {
            inscriptionId: listing.inscriptionId,
        }

        const listings = [listingDataRequest]

        const okxGetListingPsbt: GetListingPsbtRequest = {
            marketplaceType,
            assetType,
            sellerAddress: address,
            sellerPublicKey: pubKey,
            listings
        }

        const listingPsbtResponse = await provider.api.getListingPsbt(okxGetListingPsbt);
        if (listingPsbtResponse.statusCode != 200) {
            throw new Error(`Failed to get listing psbt: ${listingPsbtResponse.error}`)
        }

        const listingPsbt: GetListingPsbtResponse = listingPsbtResponse.data;


        const listingData: OkxInscriptionListingData = {
            nftAddress: address,
            nftUtxo: listing.utxo,
            receiveBtcAddress,
            price: listing.price
        }
        const unsignedPsbtHex = await generateInscriptionListingUnsignedPsbt(listingData, provider.network, pubKey)
        const { signedPsbt } = await signer.signAllInputs({
            rawPsbtHex: unsignedPsbtHex,
            finalize: false
        })

        const listingPsbtData = {
            nftId: listingPsbt.additionalData.nftId,
            inscriptionId: listing.inscriptionId,
            unitPrice: listing.unitPrice,
            totalPrice: listing.totalPrice
        }

        const okxSubmitListingPsbt: SubmitListingPsbtRequest = {
            marketplaceType,
            assetType,
            sellerAddress: address,
            sellerPublicKey: pubKey,
            signedPsbt: signedPsbt,
            listings: [listingPsbtData]
        }

        const submitListingPsbtResponse = await provider.api.submitListingPsbt(okxSubmitListingPsbt);
        if (submitListingPsbtResponse.statusCode != 200) {
            throw new Error(`Failed to submit listing psbt: ${submitListingPsbtResponse.error}`)
        }

        const submitListingPsbt: SubmitListingResponse = submitListingPsbtResponse.data


        return {
            success: submitListingPsbt.success,
            listingId: listing.inscriptionId
        }
    }
}


