import type { ReactNode } from 'react';

export type SettingsMenuSection = {
  id: string;
  label: string;
};

export type SettingsMenuProps = {
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  sections: SettingsMenuSection[];
  activeSectionId: string;
  onActiveSectionChange: (nextActiveId: string) => void;
  getPanel: (activeId: string) => ReactNode;
};

export function SettingsMenu({
  sections,
  activeSectionId,
  onActiveSectionChange,
  getPanel,
}: SettingsMenuProps) {
  return (
    <nav className="settings-menu" aria-label="Financial Dashboard">
      <div className="settings-tablist" role="tablist" aria-label="Dashboard sections">
        {sections.map((section) => {
          const isSelected = section.id === activeSectionId;
          const icon = section.id === 'income' ? 'tune' : 'account_balance_wallet';
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className="settings-tab"
              onClick={() => onActiveSectionChange(section.id)}
            >
              <span className="material-symbols-outlined settings-tab-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="settings-tab-label">{section.label}</span>
            </button>
          );
        })}
      </div>

      <div className="settings-panel" role="tabpanel">
        <div className="settings-panel-content">
          {getPanel(activeSectionId)}
        </div>
      </div>
    </nav>
  );
}
