import { useMutation } from '@tanstack/react-query';
import { ethers, Contract } from 'ethers';
import { useEthereumWallet } from '@/context/EthereumWalletContext';
import { useWallet } from '@/context/WalletContext';
import { getConfig, ETHEREUM_CONTRACTS } from '@/utils/getConfig';
import { ERC20_ABI, BRIDGE_TOKEN_TYPES } from '@/constants/bridge';
import { useBoundMappedAddress } from './useBoundMappedAddress';

interface BridgeMintParams {
  tokenType: 'USDT' | 'USDC';
  amount: string; // Amount in token decimals (e.g., "100.50" for 100.50 USDC)
}

/**
 * Hook to send USDT/USDC from Ethereum to get bUSD on Bitcoin
 * This is the "mint" side of the bridge
 */
export function useBridgeMintMutation() {
  const { signer, address: ethAddress, isConnected: isEthConnected } = useEthereumWallet();
  const { network, address: btcAddress } = useWallet();
  const config = getConfig(network);
  const ethNetwork = config.ETHEREUM_NETWORK as 'mainnet' | 'sepolia';
  const { data: boundEthAddress } = useBoundMappedAddress(btcAddress);

  return useMutation({
    mutationFn: async ({ tokenType, amount }: BridgeMintParams) => {
      if (!isEthConnected || !signer || !ethAddress) {
        throw new Error('Ethereum wallet not connected');
      }

      if (!btcAddress) {
        throw new Error('Bitcoin wallet not connected');
      }

      if (!boundEthAddress) {
        throw new Error('No bound Ethereum address found. Please try again.');
      }

      const tokenAddress = tokenType === 'USDC' 
        ? ETHEREUM_CONTRACTS[ethNetwork].USDC_ADDRESS
        : ETHEREUM_CONTRACTS[ethNetwork].USDT_ADDRESS;

      const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);

      // Parse amount to token decimals (USDT/USDC use 6 decimals)
      const decimals = 6;
      const amountWei = ethers.parseUnits(amount, decimals);

      // Check balance
      const balance = await tokenContract.balanceOf(ethAddress);
      if (balance < amountWei) {
        throw new Error(`Insufficient ${tokenType} balance`);
      }

      // Send tokens to bound address
      const tx = await tokenContract.transfer(boundEthAddress, amountWei);
      
      // Wait for confirmation
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.hash,
        amount: amount,
        tokenType,
        boundEthAddress,
      };
    },
    onMutate: () => {
      if (!isEthConnected) {
        throw new Error('Please connect your Ethereum wallet first');
      }
    },
  });
}
