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
      className="w-56 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-screen fixed left-0 top-0"
    >
      {/* Logo / Brand */}
      <div className="px-4 py-5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded-md flex items-center justify-center">
            <Activity size={14} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 leading-tight">NewEra AI</p>
            <p className="text-[10px] text-zinc-500">Risk Engine</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
              isActive
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            )
          }
        >
          <UserCircle size={14} />
          My Profile
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
              isActive
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            )
          }
        >
          <LayoutDashboard size={14} />
          Dashboard
        </NavLink>
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
              isActive
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            )
          }
        >
          <Bot size={14} />
          AI Assistant
        </NavLink>
      </nav>

      {/* Org + Sign-out */}
      <div className="px-4 py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
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
                organizationSwitcherTrigger: 'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md py-1.5 px-3 flex justify-between items-center text-xs font-medium transition-colors',
                organizationSwitcherTriggerIcon: 'text-zinc-500 dark:text-zinc-400',
                organizationPreviewTextContainer: 'text-zinc-800 dark:text-zinc-100 text-left',
                organizationPreviewTitle: 'text-zinc-800 dark:text-zinc-200 text-xs font-medium',
                organizationPreviewSubtitle: 'text-zinc-500 text-[10px]',
                userPreviewTextContainer: 'text-left',
                
                // Adaptive Theme for the Popover Dropdown Card
                organizationSwitcherPopoverCard: 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl text-zinc-800 dark:text-zinc-100',
                organizationSwitcherPopoverActions: 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100',
                organizationSwitcherPopoverActionButton: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors',
                organizationSwitcherPopoverActionButtonText: 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100',
                organizationSwitcherPopoverActionButtonIcon: 'text-zinc-500 dark:text-zinc-400',
                organizationSwitcherPopoverActionButton__manageOrganization: 'hidden',
                organizationSwitcherPopoverFooter: 'bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 text-zinc-500',
                organizationSwitcherPopoverFooterAction: 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
                organizationSwitcherPopoverItem: 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors',
                organizationSwitcherPopoverItemText: 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 font-medium',
                organizationSwitcherPopoverItemSubtitle: 'text-zinc-500 text-[10px]',
                
                // Account switcher identity styles inside the popover
                userPreviewSecondaryIdentifier: 'text-zinc-500 text-[10px]',
                userPreviewMainIdentifier: 'text-zinc-700 dark:text-zinc-200 text-xs font-medium',
              },
            }}
          />
        </div>
        <button
          id="sign-out-btn"
          onClick={() => signOut(() => navigate('/sign-in'))}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/5 transition-colors"
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
