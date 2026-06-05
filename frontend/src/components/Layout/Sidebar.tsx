import { NavLink, useNavigate } from 'react-router-dom';
import { useClerk, OrganizationSwitcher } from '@clerk/clerk-react';
import {
  LayoutDashboard,
  LogOut,
  Activity,
  UserCircle,
  Bot,
} from 'lucide-react';
import clsx from 'clsx';

export function Sidebar() {
  const { signOut } = useClerk();
  const navigate = useNavigate();

  return (
    <aside
      id="sidebar"
      className="w-56 flex flex-col h-screen fixed left-0 top-0 z-30"
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRight: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '2px 0 24px rgba(0,0,0,0.06)',
      }}
    >
      {/* Dark mode overlay */}
      <div className="absolute inset-0 dark:bg-zinc-950/70 pointer-events-none rounded-none" style={{ zIndex: -1 }} />

      {/* Logo / Brand */}
      <div
        className="px-4 py-5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}>
            <Activity size={14} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 leading-tight">NewEra AI</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-500">Risk Engine</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scroll-smooth">
        {[
          { to: '/profile', Icon: UserCircle, label: 'My Profile' },
          { to: '/dashboard', Icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/chat', Icon: Bot, label: 'AI Assistant' },
        ].map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              )
            }
            style={({ isActive }) => isActive ? {
              background: 'rgba(59,130,246,0.10)',
              border: '1px solid rgba(59,130,246,0.18)',
            } : {
              background: 'transparent',
              border: '1px solid transparent',
            }}
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Org + Sign-out */}
      <div
        className="px-4 py-4 space-y-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}
      >
        <div>
          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Organisation</p>
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            hidePersonal={true}
            appearance={{
              elements: {
                rootBox: 'w-full',
                organizationSwitcherTrigger: 'w-full border text-zinc-800 dark:text-zinc-100 rounded-lg py-1.5 px-3 flex justify-between items-center text-xs font-medium transition-all duration-200 hover:border-blue-400/40',
                organizationSwitcherTriggerIcon: 'text-zinc-500 dark:text-zinc-400',
                organizationPreviewTextContainer: 'text-zinc-800 dark:text-zinc-100 text-left',
                organizationPreviewTitle: 'text-zinc-800 dark:text-zinc-200 text-xs font-medium',
                organizationPreviewSubtitle: 'text-zinc-500 text-[10px]',
                userPreviewTextContainer: 'text-left',
                organizationSwitcherPopoverCard: 'bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/30 dark:border-white/10 shadow-2xl text-zinc-800 dark:text-zinc-100',
                organizationSwitcherPopoverActions: 'bg-transparent text-zinc-800 dark:text-zinc-100',
                organizationSwitcherPopoverActionButton: 'text-zinc-600 dark:text-zinc-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors rounded-md',
                organizationSwitcherPopoverActionButtonText: 'text-zinc-600 dark:text-zinc-300',
                organizationSwitcherPopoverActionButtonIcon: 'text-zinc-500 dark:text-zinc-400',
                organizationSwitcherPopoverActionButton__manageOrganization: 'hidden',
                organizationSwitcherPopoverFooter: 'bg-transparent border-t border-white/15 dark:border-white/10 text-zinc-500',
                organizationSwitcherPopoverItem: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors rounded-md',
                organizationSwitcherPopoverItemText: 'text-zinc-600 dark:text-zinc-300 font-medium',
                organizationSwitcherPopoverItemSubtitle: 'text-zinc-500 text-[10px]',
                userPreviewSecondaryIdentifier: 'text-zinc-500 text-[10px]',
                userPreviewMainIdentifier: 'text-zinc-700 dark:text-zinc-200 text-xs font-medium',
              },
            }}
          />
        </div>
        <button
          id="sign-out-btn"
          onClick={() => signOut(() => navigate('/sign-in'))}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-red-500 transition-all duration-200"
          style={{ border: '1px solid transparent' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)';
            (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(239,68,68,0.15)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.border = '1px solid transparent';
          }}
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
