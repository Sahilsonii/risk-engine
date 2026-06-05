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
      className={[
        'w-56 flex flex-col h-screen fixed left-0 top-0 z-30',
        // Light: frosted white glass
        'bg-white/80 backdrop-blur-xl border-r border-white/40 shadow-sm',
        // Dark: matches the dark transaction panel background
        'dark:bg-zinc-950/95 dark:border-r-zinc-800 dark:shadow-none dark:backdrop-blur-xl',
      ].join(' ')}
    >
      {/* Logo / Brand */}
      <div className="px-4 py-5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shadow-md"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}
          >
            <Activity size={14} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 leading-tight">
              NewEra AI
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-500">Risk Engine</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {[
          { to: '/profile',   Icon: UserCircle,      label: 'My Profile'   },
          { to: '/dashboard', Icon: LayoutDashboard, label: 'Dashboard'    },
          { to: '/chat',      Icon: Bot,             label: 'AI Assistant' },
        ].map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                isActive
                  ? 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20 dark:border-blue-500/25'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border border-transparent'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={14} className={isActive ? 'text-blue-500 dark:text-blue-400' : ''} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Org + Sign-out */}
      <div className="px-4 py-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3">
        <div>
          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">
            Organisation
          </p>
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            hidePersonal={true}
            appearance={{
              elements: {
                rootBox: 'w-full',
                organizationSwitcherTrigger:
                  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg py-1.5 px-3 flex justify-between items-center text-xs font-medium transition-all duration-200',
                organizationSwitcherTriggerIcon: 'text-zinc-500 dark:text-zinc-400',
                organizationPreviewTextContainer: 'text-zinc-800 dark:text-zinc-100 text-left',
                organizationPreviewTitle: 'text-zinc-800 dark:text-zinc-200 text-xs font-medium',
                organizationPreviewSubtitle: 'text-zinc-500 dark:text-zinc-500 text-[10px]',
                userPreviewTextContainer: 'text-left',
                organizationSwitcherPopoverCard:
                  'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl text-zinc-800 dark:text-zinc-100',
                organizationSwitcherPopoverActions: 'bg-transparent text-zinc-800 dark:text-zinc-100',
                organizationSwitcherPopoverActionButton:
                  'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors rounded-md',
                organizationSwitcherPopoverActionButtonText: 'text-zinc-600 dark:text-zinc-300',
                organizationSwitcherPopoverActionButtonIcon: 'text-zinc-500 dark:text-zinc-400',
                organizationSwitcherPopoverActionButton__manageOrganization: 'hidden',
                organizationSwitcherPopoverFooter:
                  'bg-transparent border-t border-zinc-200 dark:border-zinc-800 text-zinc-500',
                organizationSwitcherPopoverItem:
                  'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md',
                organizationSwitcherPopoverItemText: 'text-zinc-600 dark:text-zinc-300 font-medium',
                organizationSwitcherPopoverItemSubtitle: 'text-zinc-500 dark:text-zinc-500 text-[10px]',
                userPreviewSecondaryIdentifier: 'text-zinc-500 dark:text-zinc-500 text-[10px]',
                userPreviewMainIdentifier: 'text-zinc-700 dark:text-zinc-200 text-xs font-medium',
              },
            }}
          />
        </div>
        <button
          id="sign-out-btn"
          onClick={() => signOut(() => navigate('/sign-in'))}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/8 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 transition-all duration-200"
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
