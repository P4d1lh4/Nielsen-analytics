import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — set it in client/.env')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <SignedIn>
        <App />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-sm">
            <h1 className="text-lg font-bold text-slate-800">UX Audit</h1>
            <p className="mt-1 text-sm text-slate-500">
              Auditoria heurística de UI — Nielsen + WCAG 2.1. Entre para começar.
            </p>
            <SignInButton mode="modal">
              <button className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Entrar
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </ClerkProvider>
  </StrictMode>,
)
