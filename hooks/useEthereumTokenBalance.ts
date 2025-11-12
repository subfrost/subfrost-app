import { useQuery } from '@tanstack/react-query';
import { ethers, Contract } from 'ethers';
import { useEthereumWallet } from '@/context/EthereumWalletContext';
import { getConfig, ETHEREUM_CONTRACTS } from '@/utils/getConfig';
import { ERC20_ABI } from '@/constants/bridge';
import { useWallet } from '@/context/WalletContext';

/**
 * Fetches USDT or USDC balance from Ethereum for the connected address
 */
export function useEthereumTokenBalance(tokenType: 'USDT' | 'USDC') {
  const { provider, address: ethAddress, isConnected } = useEthereumWallet();
  const { network } = useWallet();
  const config = getConfig(network);
  const ethNetwork = config.ETHEREUM_NETWORK as 'mainnet' | 'sepolia';

  return useQuery({
    queryKey: ['eth-token-balance', tokenType, ethAddress, ethNetwork],
    queryFn: async () => {
      if (!provider || !ethAddress || !isConnected) {
        return '0';
      }

      const tokenAddress = tokenType === 'USDC' 
        ? ETHEREUM_CONTRACTS[ethNetwork].USDC_ADDRESS
        : ETHEREUM_CONTRACTS[ethNetwork].USDT_ADDRESS;

      const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(ethAddress);
      
      // Format from wei (6 decimals for USDT/USDC) to display string
      return ethers.formatUnits(balance, 6);
    },
    enabled: !!provider && !!ethAddress && isConnected,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 30, // Refetch every 30 seconds
  });
}
