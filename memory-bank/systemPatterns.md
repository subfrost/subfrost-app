# System Patterns: Subfrost

## System Architecture

Subfrost follows a modern web application architecture with the following key components:

### Frontend Architecture
- **Next.js Framework**: Server-side rendering and static site generation capabilities
- **React Component Structure**: Functional components with hooks for state management
- **Context API**: For global state management across components
- **Client-Side Routing**: Using Next.js router for navigation between pages

### Backend Integration
- **Blockchain Interaction**: Direct integration with Bitcoin and related networks
- **Provider Pattern**: Abstraction layer for blockchain communication
- **Transaction Building**: Client-side transaction construction and signing

### Data Flow
```
User Interface → Context Providers → Blockchain Providers → Bitcoin Network
                                  ↑
                                  ↓
                  Local State ← Transaction Builders
```

## Key Technical Decisions

### 1. Next.js App Router
- Using the latest Next.js app router for improved performance and SEO
- Leveraging server components where appropriate
- Client components for interactive elements

### 2. Context-Based State Management
- Using React Context API instead of Redux for simpler state management
- Multiple specialized contexts (Balances, Blockchain, Transactions) rather than a single global store
- Custom hooks for accessing context data (useBalances, useBlockchain)

### 3. Bitcoin Integration Approach
- Direct Bitcoin network interaction rather than relying on centralized APIs
- Support for regtest environment for development and testing
- WebAssembly modules for cryptographic operations

### 4. UI Component Strategy
- Shadcn UI components as foundation
- Custom themed components built on top of base components
- Consistent frost/snowflake visual language

### 5. Responsive Design Implementation
- Mobile-first approach with Tailwind CSS
- Custom breakpoints for different device sizes
- Separate mobile navigation component

## Design Patterns in Use

### Provider Pattern
Used extensively for context providers that wrap the application and provide access to shared state:
- `BlockchainProvider`: Provides blockchain data like height and fee rates
- `BalancesProvider`: Manages user token balances
- `TransactionProvider`: Handles transaction creation and submission
- `SubfrostP2PProvider`: Manages peer-to-peer transaction data

### Component Composition
Breaking UI into small, reusable components that can be composed together:
- Base UI components (Button, Card, Input)
- Feature-specific components (WrapView, StakeView)
- Modal components for confirmations

### Custom Hooks
Encapsulating complex logic in custom hooks:
- `useBalances`: Access to user balances
- `useBlockchain`: Access to blockchain data
- `useMobile`: Responsive design helper

### Render Props / Children Pattern
Used in UI components to allow flexible content composition:
- Card components with header, content, footer structure
- Modal components with customizable content

## Component Relationships

### Page Structure
```
Layout
└── Navbar
└── Page Component (WrapView, StakeView, SwapView, GovernanceView)
    └── Feature Components
        └── UI Components
└── Footer
```

### Context Hierarchy
```
BlockchainProvider
└── BalancesProvider
    └── TransactionProvider
        └── SubfrostP2PProvider
            └── Application Components
```

### Feature Components
Each major feature has its own view component and related subcomponents:
- Wrap: WrapView, UnwrapView, WrapConfirmationModal
- Stake: StakeView, UnstakeView, ZapView, StakeConfirmationModal
- Swap: SwapView, SwapComponent, LPComponent, SwapConfirmationModal
- Governance: GovernanceView, ProposalList

## Critical Implementation Paths

### Wrapping BTC to frBTC
1. User inputs amount in WrapView
2. WrapConfirmationModal displays details
3. TransactionBuilder creates wrapping transaction
4. Transaction is signed by user's wallet
5. Transaction is broadcast to network
6. UI updates to show transaction status

### Staking Process
1. User selects asset and amount in StakeView
2. StakeConfirmationModal shows expected yield
3. TransactionBuilder creates staking transaction
4. Transaction is signed and broadcast
5. Balances are updated to reflect staked amounts
6. Yield begins accruing

### Swap Execution
1. User selects tokens and amount in SwapView
2. Price impact and expected output are calculated
3. SwapConfirmationModal shows transaction details
4. Transaction is created, signed, and broadcast
5. SwapSubfrostP2PTable updates with new transaction
6. Balances are updated after confirmation

### Governance Proposal and Voting
1. User creates proposal in GovernanceView
2. Proposal is submitted to governance contract
3. Other users can view and vote on proposals
4. Votes are tallied on-chain
5. Proposal status is updated based on votes