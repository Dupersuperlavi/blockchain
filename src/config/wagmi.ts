import { http, createConfig } from 'wagmi';
import { mainnet, arbitrum, optimism, polygon, base, sepolia, bscTestnet, polygonAmoy } from 'wagmi/chains';
import { injected, coinbaseWallet, mock } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, optimism, polygon, base, sepolia, bscTestnet, polygonAmoy],
  connectors: [
    injected({ target: 'metaMask' }),
    injected({ target: 'coinbaseWallet' }),
    injected(),
    coinbaseWallet({ appName: 'Uniswap Interface Clone' }),
    mock({
      accounts: ['0x71C7656EC7ab88b098defB751B7401B5f6d8976F'],
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
    [bscTestnet.id]: http(),
    [polygonAmoy.id]: http(),
  },
});

export const SUPPORTED_CHAINS = [mainnet, arbitrum, optimism, polygon, base, sepolia, bscTestnet, polygonAmoy];
