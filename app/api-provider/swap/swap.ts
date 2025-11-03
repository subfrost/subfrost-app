import { processUnisatListing, processUnisatOffer } from './unisat/unisat'
import { processOkxListing, processOkxOffer } from './okx/okx'
import {
  Marketplaces,
  ProcessOfferOptions,
  ProcessOfferResponse,
  marketplaceName,
  ProcessListingOptions,
  ProcessListingResponse
} from './types'
import { processOrdinalsWalletOffer } from './ordinals-wallet/ordinals-wallet'
import { processMagisatOffer } from './magisat'
import { processMagicEdenOffer } from './magic-eden'


export async function processOffer (options: ProcessOfferOptions): Promise<ProcessOfferResponse>{
    let swapResponse: ProcessOfferResponse
    switch (marketplaceName[options.offer.marketplace]){
        case Marketplaces.UNISAT:
            swapResponse = await processUnisatOffer(options);
            break;
        case Marketplaces.ORDINALS_WALLET:
            swapResponse = await processOrdinalsWalletOffer(options);
            break
        case Marketplaces.OKX:
            swapResponse = await processOkxOffer(options);
            break;
        case Marketplaces.MAGISAT:
            swapResponse = await processMagisatOffer(options);
            break;
        case Marketplaces.MAGIC_EDEN:
            swapResponse = await processMagicEdenOffer(options);
            break;
    }

    return swapResponse
}


export async function processListing (options: ProcessListingOptions): Promise<ProcessListingResponse>{
    let listingResponse: ProcessListingResponse
    switch (options.listing.marketplace){
        case Marketplaces.UNISAT:
            listingResponse = await processUnisatListing(options);
            break;
        case Marketplaces.ORDINALS_WALLET:
            //swapResponse = await ordinalWalletSwap(options);
            break
        case Marketplaces.OKX:
            listingResponse = await processOkxListing(options);
            break;
        case Marketplaces.MAGISAT:
            //swapResponse = await magisatSwap(options);
            break;
        case Marketplaces.MAGIC_EDEN:
            //swapResponse = await magicEdenSwap(options);
            break;
    }

    return listingResponse
}
