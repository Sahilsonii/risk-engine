import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  useOrganization,
  OrganizationList,
} from '@clerk/clerk-react';
import { MerchantDashboard } from './pages/MerchantDashboard';
import { AdminDashboard }    from './pages/AdminDashboard';
import { Login }             from './pages/Login';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

// Route to the correct dashboard based on org
function DashboardRouter() {
  const { organization, isLoaded } = useOrganization();

  // Still loading org context from Clerk
  if (!isLoaded) {
    return (
      <div className="bg-zinc-950 min-h-screen flex items-center justify-center text-zinc-500 text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Loaded but no active org — prompt user to select one
  if (!organization) {
    return (
      <div className="bg-zinc-950 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-zinc-100 mb-2">Select an Organisation</h2>
            <p className="text-zinc-500 text-sm">Choose your organisation to access the dashboard.</p>
          </div>
          <OrganizationList
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
            hidePersonal={true}
          />
        </div>
      </div>
    );
  }

  // The slug you set in Clerk for the admin org
  if (organization.slug === 'risk-admins-org' || organization.slug?.includes('admin')) {
    return <AdminDashboard />;
  }
  return <MerchantDashboard />;
}

export default function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/sign-in/*"
            element={<Login />}
          />
          <Route
            path="/dashboard"
            element={
              <>
                <SignedIn>
                  <DashboardRouter />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn />
                </SignedOut>
              </>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
}
