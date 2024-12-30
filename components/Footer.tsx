import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-blue-800 bg-opacity-70 text-white py-4 h-16">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center h-full">
        <div className="mb-2 md:mb-0">
          <p className="retro-text text-xs">
            © {new Date().getFullYear()} Subzero Research Inc. All rights reserved.
          </p>
        </div>
        <div className="flex space-x-4">
          <Link href="/terms" className="retro-text text-xs hover:text-blue-300">
            Terms of Service
          </Link>
          <Link href="/privacy" className="retro-text text-xs hover:text-blue-300">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}

