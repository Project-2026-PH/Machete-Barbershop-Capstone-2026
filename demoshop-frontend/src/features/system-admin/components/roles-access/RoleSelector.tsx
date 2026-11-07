import React from 'react';
import { Plus } from 'lucide-react';
import { ROLE_PURPOSES } from './roles-constants';
import { getRoleDisplayName } from '../feature-management/feature-constants';

interface RoleSelectorProps {
  roles: string[];
  selectedRole: string;
  onSelectRole: (role: string) => void;
  getAccountCount: (role: string) => number;
  onOpenNewRoleModal: () => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({
  roles,
  selectedRole,
  onSelectRole,
  getAccountCount,
  onOpenNewRoleModal,
}) => {
  return (
    <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4">
      {/* Mobile/Tablet Dropdown Selector */}
      <div className="lg:hidden bg-charcoal-light p-3 rounded-sm border border-white/10 space-y-2">
        <label className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold block">
          Select Role
        </label>
        <select
          value={selectedRole}
          onChange={(e) => onSelectRole(e.target.value)}
          className="w-full bg-charcoal border border-white/10 rounded-sm px-3 py-2 text-xs text-ivory font-semibold focus:outline-none focus:border-gold cursor-pointer"
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {getRoleDisplayName(role)} ({getAccountCount(role)}{' '}
              {getAccountCount(role) === 1 ? 'account' : 'accounts'})
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Left-Side Panel */}
      <div className="hidden lg:block bg-charcoal-light border border-white/5 rounded-sm p-3 space-y-4">
        {/* System Roles Group */}
        <div className="space-y-1.5">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold flex items-center justify-between">
            <span>System Roles</span>
            <span className="text-[9px] text-ivory-dim/40 font-mono">7 Verified</span>
          </div>

          <div className="space-y-1">
            {roles.map((role) => {
              const isSelected = selectedRole === role;
              const count = getAccountCount(role);
              const purpose = ROLE_PURPOSES[role] || 'System operations';

              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => onSelectRole(role)}
                  className={`w-full text-left p-3 rounded-sm transition-all duration-150 cursor-pointer border ${
                    isSelected
                      ? 'bg-gold/15 border-gold shadow-xs'
                      : 'bg-charcoal/60 border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15 hover:bg-charcoal'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-bold tracking-wide uppercase ${
                        isSelected ? 'text-gold' : 'text-ivory'
                      }`}
                    >
                      {getRoleDisplayName(role)}
                    </span>
                    <span className="text-[10px] font-mono text-ivory-dim/60 shrink-0">
                      {count} {count === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>

                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 truncate">
                    {purpose}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Roles Group */}
        <div className="pt-3 border-t border-white/10 space-y-2.5">
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold">
              Custom Roles
            </span>
          </div>

          <div className="p-3 bg-charcoal/60 border border-dashed border-white/10 rounded-sm text-center space-y-2">
            <p className="text-[11px] text-ivory-dim/60">
              No custom roles yet.
            </p>
            <button
              type="button"
              onClick={onOpenNewRoleModal}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Role</span>
              <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Preview
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
