# Technical Context: Subfrost

## Technologies Used

### Frontend Framework
- **Next.js 14.2.16**: React framework with server-side rendering and static site generation
- **React 18**: Component-based UI library
- **TypeScript**: Strongly typed JavaScript superset

### Styling
- **Tailwind CSS 3.4.17**: Utility-first CSS framework
- **Tailwind Merge**: For conditional class merging
- **Tailwind Animate**: Animation utilities for Tailwind
- **CSS Modules**: For component-scoped styling

### UI Components
- **Radix UI**: Unstyled, accessible component primitives
- **Shadcn UI**: Component library built on Radix UI
- **Lucide React**: Icon library
- **React Icons**: Additional icon sets
- **Embla Carousel**: For carousel components
- **Recharts**: For chart visualizations
- **Sonner**: Toast notifications
- **Vaul**: Drawer component

### Form Handling
- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **@hookform/resolvers**: Integration between React Hook Form and Zod

### Bitcoin Integration
- **@bitcoinerlab/secp256k1**: Elliptic curve cryptography for Bitcoin
- **tiny-secp256k1**: Lightweight implementation of secp256k1
- **@omnisat/lasereyes**: Bitcoin-related utilities
- **@oyl/sdk**: Wallet SDK

### State Management
- **React Context API**: For global state management
- **Custom hooks**: For reusable logic

### Development Tools
- **ESLint**: Code linting
- **PostCSS**: CSS processing
- **Alkanes**: Bitcoin-related development tools
- **ethers**: Ethereum library (used for utility functions)

## Development Setup

### Project Structure
```
subfrost-app/
├── app/                  # Next.js app directory
│   ├── components/       # React components
│   ├── contexts/         # Context providers
│   ├── fonts/            # Custom fonts
│   ├── utils/            # Utility functions
│   └── [routes]/         # Page routes
├── components/           # Shared UI components
│   └── ui/               # Base UI components
├── hooks/                # Custom React hooks
├── lib/                  # Utility libraries
├── public/               # Static assets
└── styles/               # Global styles
```

### Environment Configuration
- Next.js environment variables
- Development, staging, and production environments
- Local Bitcoin regtest environment for development

### Build and Deployment
- **Development**: `npm run dev` - Runs Next.js development server
- **Build**: `npm run build` - Creates production build
- **Start**: `npm run start` - Starts production server
- **Lint**: `npm run lint` - Runs ESLint

### Version Control
- Git is used for version control
- Git commands should only be executed when explicitly requested by the user
- Do not automatically commit or push changes after completing tasks

## Technical Constraints

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Limited support for older browsers
- Requires JavaScript enabled

### Performance Considerations
- Bundle size optimization
- Code splitting for route-based chunking
- Image optimization
- Font optimization with next/font

### Security Requirements
- Secure wallet connections
- Safe transaction signing
- Protection against common web vulnerabilities
- Proper handling of private keys

### Blockchain Limitations
- Bitcoin transaction confirmation times
- Fee estimation accuracy
- Network congestion handling
- Mempool management

## Dependencies

### Core Dependencies
```json
{
  "next": "14.2.16",
  "react": "^18",
  "react-dom": "^18",
  "typescript": "^5",
  "tailwindcss": "^3.4.17"
}
```

### Bitcoin-Related Dependencies
```json
{
  "@bitcoinerlab/secp256k1": "^1.2.0",
  "tiny-secp256k1": "^2.2.3",
  "@omnisat/lasereyes": "^0.0.133",
  "@oyl/sdk": "git+https://github.com/Oyl-Wallet/Oyl-sdk"
}
```

### UI Dependencies
```json
{
  "@radix-ui/react-*": "various versions",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^0.454.0",
  "tailwind-merge": "^2.5.5"
}
```

## Tool Usage Patterns

### Component Development
1. Create base UI components in `components/ui/`
2. Build feature-specific components in `app/components/`
3. Compose components together for page layouts
4. Use Tailwind for styling with consistent class patterns

### Context Creation
1. Define context interface and default values
2. Create provider component with state management
3. Implement custom hook for accessing context
4. Export both provider and hook

Example:
```typescript
// Define context
const MyContext = createContext<MyContextType | undefined>(undefined);

// Create provider
export function MyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaultState);
  // Logic here
  return (
    <MyContext.Provider value={state}>
      {children}
    </MyContext.Provider>
  );
}

// Create hook
export function useMyContext() {
  const context = useContext(MyContext);
  if (context === undefined) {
    throw new Error("useMyContext must be used within a MyProvider");
  }
  return context;
}
```

### Blockchain Interaction
1. Use provider abstraction for blockchain communication
2. Build transactions client-side
3. Sign transactions with connected wallet
4. Broadcast transactions to network
5. Update UI based on transaction status

### Form Handling
1. Define schema with Zod
2. Use React Hook Form with schema validation
3. Handle form submission with async functions
4. Display validation errors inline
5. Show success/error notifications with Sonner

### Responsive Design
1. Use mobile-first approach with Tailwind breakpoints
2. Implement different layouts for mobile/desktop
3. Use the useMobile hook for conditional rendering
4. Test across various device sizes