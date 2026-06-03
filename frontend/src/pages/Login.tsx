import { SignIn } from '@clerk/clerk-react';

export function Login() {
  return (
    <div
      id="login-page"
      className="min-h-screen bg-zinc-950 flex items-center justify-center"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">NewEra AI</h1>
          <p className="text-xs text-zinc-500 mt-1">Risk Engine Platform</p>
        </div>

        {/* Clerk Sign-In Component */}
        <div className="flex justify-center">
          <SignIn
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'bg-zinc-900 border border-zinc-800 shadow-2xl',
                headerTitle: 'text-zinc-100',
                headerSubtitle: 'text-zinc-400',
                socialButtonsBlockButton:
                  'border-zinc-700 text-zinc-300 hover:bg-zinc-800',
                formFieldLabel: 'text-zinc-400',
                formFieldInput:
                  'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-blue-500',
                footerActionLink: 'text-blue-400 hover:text-blue-300',
                formButtonPrimary:
                  'bg-blue-600 hover:bg-blue-500 text-white',
              },
            }}
          />
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-zinc-700 mt-8">
          NewEra AI · Secure Transaction Monitoring · Internal Use Only
        </p>
      </div>
    </div>
  );
}
