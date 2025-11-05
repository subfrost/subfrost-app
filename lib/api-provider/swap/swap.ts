import { processUnisatListing, processUnisatOffer } from './unisat/unisat'

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
    const marketplace = marketplaceName[options.offer.marketplace as keyof typeof marketplaceName]
    switch (marketplace){
        case Marketplaces.UNISAT:
            return await processUnisatOffer(options);
        case Marketplaces.ORDINALS_WALLET:
            return await processOrdinalsWalletOffer(options);
        case Marketplaces.MAGISAT:
            return await processMagisatOffer(options);
        case Marketplaces.MAGIC_EDEN:
            return await processMagicEdenOffer(options);
        default:
            throw new Error(`Unsupported marketplace: ${marketplace}`);
    }
}


export async function processListing (options: ProcessListingOptions): Promise<ProcessListingResponse>{
    switch (options.listing.marketplace){
        case Marketplaces.UNISAT:
            return await processUnisatListing(options);
        case Marketplaces.ORDINALS_WALLET:
            //swapResponse = await ordinalWalletSwap(options);
            throw new Error('Ordinals Wallet listing not implemented');
        case Marketplaces.MAGISAT:
            //swapResponse = await magisatSwap(options);
            throw new Error('Magisat listing not implemented');
        case Marketplaces.MAGIC_EDEN:
            //swapResponse = await magicEdenSwap(options);
            throw new Error('Magic Eden listing not implemented');
        default:
            throw new Error(`Unsupported marketplace: ${options.listing.marketplace}`);
    }
}
