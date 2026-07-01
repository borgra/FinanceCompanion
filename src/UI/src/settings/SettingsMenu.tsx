import type { ReactNode } from 'react';
import { useId } from 'react';

export type SettingsMenuProps = {
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  tabLabel: string;
  children: ReactNode;
};

export function SettingsMenu({
  isOpen,
  onOpenChange,
  tabLabel,
  children,
}: SettingsMenuProps) {
  const contentId = useId();
  const toggle = () => onOpenChange(!isOpen);

  return (
    <nav className="settings-menu" aria-label="Settings">
      <div className="settings-tablist" role="tablist" aria-label="Settings tabs">
        <button
          className="settings-tab"
          type="button"
          role="tab"
          aria-selected={true}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={toggle}
        >
          <span className="settings-tab-label">{tabLabel}</span>
          <span className="settings-tab-icon" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
        </button>
      </div>

      {isOpen ? (
        <div id={contentId} className="settings-panel" role="tabpanel">
          {children}
        </div>
      ) : null}
    </nav>
  );
}
